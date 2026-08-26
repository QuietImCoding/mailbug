import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import * as nodeTest from "node:test";
import { actionsRouter } from "../src/api/actions.ts";
import { ingestRouter } from "../src/api/ingest.ts";
import { sendersRouter } from "../src/api/senders.ts";
import { statisticsRouter } from "../src/api/statistics.ts";
import { widgetsRouter } from "../src/api/widgets.ts";
import { initDb } from "../src/db/db.ts";
import { extractPlainText } from "../src/ingest/mime.ts";

const { after, before, test } = nodeTest;

// Fresh DB for the whole test run, in its own file so a test run can never
// destroy the development database. Phantomed dispatch failures are caught and
// never affect the store/statistics assertions.
const TEST_DB = "test-mailbug.db";
process.env.MAILBUG_DB = TEST_DB;
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

let base = "";
let server: Server;

before(async () => {
  await initDb();
  const app = express();
  app.use(express.json());
  app.use("/api", statisticsRouter);
  app.use("/api", ingestRouter);
  app.use("/api", sendersRouter);
  app.use("/api", widgetsRouter);
  app.use("/api", actionsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server?.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

function postIngest(
  blob: unknown,
): Promise<{ stored: number; skipped: number }> {
  return fetch(`${base}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(blob),
  }).then((r) => r.json());
}

function stats(): Promise<{
  total: number;
  byCategory: Array<{ category: string; count: number }>;
  topSenders: Array<{ sender: string; count: number }>;
  topTopics: Array<{ topic: string; count: number }>;
}> {
  return fetch(`${base}/api/statistics`).then((r) => r.json());
}

function list(query = ""): Promise<{
  items: Array<{
    id: string;
    subject: string;
    category: string;
    priority: number;
    topic: string;
  }>;
  page: number;
  limit: number;
  total: number;
}> {
  return fetch(`${base}/api/emails${query}`).then((r) => r.json());
}

function blob(overrides: Record<string, unknown> = {}) {
  return {
    messageId: "t1",
    subject: "50% off shoes",
    fromAddress: "a@x.com",
    fromName: "A",
    receivedAt: "2026-08-26T10:00:00Z",
    classification: {
      category: "marketing",
      priority: 1,
      topic: "shoes sale",
      actions: [{ ntfy: "NEW MARKETING EMAIL" }],
    },
    ...overrides,
  };
}

test("POST /api/ingest stores a valid blob", async () => {
  assert.deepEqual(await postIngest(blob()), { stored: 1, skipped: 0 });
});

test("POST /api/ingest skips an invalid blob", async () => {
  const res = await postIngest(
    blob({
      messageId: "bad",
      classification: {
        category: "nope",
        priority: 9,
        topic: "x",
        actions: [{ ntfy: 5 }],
      },
    }),
  );
  assert.deepEqual(res, { stored: 0, skipped: 1 });
});

test("POST /api/ingest defaults a missing topic", async () => {
  const noTopic = blob({
    messageId: "t2",
    subject: "Invoice 42",
    fromAddress: "b@x.com",
    fromName: "B",
    receivedAt: "2026-08-26T11:00:00Z",
    classification: {
      category: "finance",
      priority: 2,
      actions: [{ webhook: "invoice paid" }],
    },
  });
  assert.deepEqual(await postIngest(noTopic), { stored: 1, skipped: 0 });
  const email = await fetch(`${base}/api/emails?topic=uncategorized`).then(
    (r) => r.json(),
  );
  assert.equal(email.total, 1);
  assert.equal(email.items[0].topic, "uncategorized");
});

test("GET /api/statistics aggregates stored emails", async () => {
  const s = await stats();
  assert.equal(s.total, 2);
  assert.ok(
    s.byCategory.some((c) => c.category === "marketing" && c.count === 1),
    "marketing count present",
  );
  assert.ok(
    s.byCategory.some((c) => c.category === "finance" && c.count === 1),
    "finance count present",
  );
  assert.ok(s.topSenders.some((x) => x.sender === "a@x.com"));
  assert.ok(s.topTopics.some((x) => x.topic === "shoes sale"));
});

test("GET /api/emails filters and sorts", async () => {
  const marketing = await list("?category=marketing&sort=priority&order=asc");
  assert.equal(marketing.total, 1);
  assert.equal(marketing.items[0].subject, "50% off shoes");

  const all = await list("?sort=priority&order=asc");
  assert.deepEqual(
    all.items.map((i) => i.priority),
    [1, 2],
  );
});

test("GET /api/emails paginates", async () => {
  const paged = await list("?limit=1&page=1");
  assert.equal(paged.limit, 1);
  assert.equal(paged.page, 1);
  assert.equal(paged.total, 2);
  assert.equal(paged.items.length, 1);
});

test("GET /api/emails/:id returns the email with its actions", async () => {
  const { items } = await list("?category=marketing");
  const id = items[0].id;
  const res = await fetch(`${base}/api/emails/${id}`).then((r) => r.json());
  assert.equal(res.subject, "50% off shoes");
  assert.equal(res.actions.length, 1);
  assert.equal(res.actions[0].action_type, "ntfy");
  assert.equal(res.actions[0].status, "pending");
});

test("POST /api/ingest is idempotent (no duplicate)", async () => {
  assert.deepEqual(await postIngest(blob()), { stored: 1, skipped: 0 });
  const s = await stats();
  assert.equal(s.total, 2, "re-posting a known message_id must not duplicate");
});

test("GET /api/emails/:id 404s for unknown id", async () => {
  const res = await fetch(`${base}/api/emails/does-not-exist`);
  assert.equal(res.status, 404);
});

test("GET /api/emails returns each email's actions inline", async () => {
  const { items } = await list("?category=marketing");
  assert.equal(items[0].actions.length, 1);
  assert.equal(items[0].actions[0].action_type, "ntfy");
});

test("blocking a sender hides their mail from the inbox", async () => {
  const before = await list();
  assert.equal(before.total, 2);

  const blocked = await fetch(`${base}/api/senders/blocked`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: "A@X.com" }),
  }).then((r) => r.json());
  assert.equal(
    blocked.address,
    "a@x.com",
    "addresses are normalised to lowercase",
  );

  const after = await list();
  assert.equal(after.total, 1);
  assert.ok(!after.items.some((i) => i.subject === "50% off shoes"));

  const withBlocked = await list("?includeBlocked=1");
  assert.equal(
    withBlocked.total,
    2,
    "the escape hatch still shows blocked mail",
  );

  // Statistics deliberately keep counting blocked senders.
  const s = await stats();
  assert.equal(s.total, 2);

  await fetch(`${base}/api/senders/blocked/a%40x.com`, { method: "DELETE" });
  assert.equal((await list()).total, 2, "unblocking restores the sender");
});

test("POST /api/senders/blocked rejects an empty address", async () => {
  const res = await fetch(`${base}/api/senders/blocked`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: "  " }),
  });
  assert.equal(res.status, 400);
});

test("GET /api/widgets surfaces a calendar and one-time codes", async () => {
  const now = new Date().toISOString();
  await postIngest({
    messageId: "code1",
    subject: "Your login code",
    fromAddress: "noreply@em1.cloudflare.com",
    fromName: "Cloudflare",
    receivedAt: now,
    bodyText:
      "Hi there,\n\nYour verification code is 103505. It expires in 10 minutes.",
    classification: {
      category: "work",
      priority: 3,
      topic: "login code",
      actions: [{ "add-to-calendar": "call with john pork" }],
    },
  });

  const w = await fetch(`${base}/api/widgets`).then((r) => r.json());

  assert.equal(
    w.calendar.days.length,
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
  );
  assert.ok(w.calendar.today >= 1 && w.calendar.today <= 31);

  const code = w.codes.find(
    (c: { domain: string }) => c.domain === "cloudflare.com",
  );
  assert.ok(
    code,
    "code widget picks the registrable domain, not the mail subdomain",
  );
  assert.equal(code.code, "103505");

  const event = w.events.find(
    (e: { title: string }) => e.title === "call with john pork",
  );
  assert.ok(event, "add-to-calendar actions become calendar events");
});

test("extractPlainText unwraps a multipart message", () => {
  const raw = [
    "Delivered-To: stream@stream.place",
    "From: John Pork <john@pork.co>",
    'Content-Type: multipart/alternative; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "i am urgently requesting a phone call with you, let=27s do next wednes=",
    "day at noon.",
    "",
    "--b1",
    "Content-Type: text/html; charset=utf-8",
    "",
    "<p>ignore me</p>",
    "--b1--",
  ].join("\r\n");

  const text = extractPlainText(raw);
  assert.ok(text.includes("let'"), "quoted-printable escapes are decoded");
  assert.ok(text.includes("wednesday at noon"), "soft line breaks are joined");
  assert.ok(!text.includes("Delivered-To"), "headers are stripped");
  assert.ok(!text.includes("ignore me"), "text/plain wins over text/html");
});

test("extractPlainText falls back to html and leaves plain text alone", () => {
  const html = [
    "From: a@b.com",
    "Content-Type: text/html; charset=utf-8",
    "",
    "<div>hello</div><div>world &amp; friends</div>",
  ].join("\r\n");
  assert.equal(extractPlainText(html), "hello\n\nworld & friends");
  assert.equal(
    extractPlainText("already clean\n\nbody"),
    "already clean\n\nbody",
  );
});
test("POST /api/emails/:id/actions validates actionType and email", async () => {
  const { items } = await list("?category=marketing");
  const id = items[0].id;

  const unknown = await fetch(`${base}/api/emails/${id}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actionType: "nope" }),
  });
  assert.equal(unknown.status, 400);

  const missing = await fetch(`${base}/api/emails/does-not-exist/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actionType: "ntfy" }),
  });
  assert.equal(missing.status, 404);
});
