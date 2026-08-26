import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import * as nodeTest from "node:test";
import { ingestRouter } from "../src/api/ingest.ts";
import { statisticsRouter } from "../src/api/statistics.ts";
import { initDb } from "../src/db/db.ts";

const { after, before, test } = nodeTest;

// Fresh DB for the whole test run. Phantomed dispatch failures are caught and
// never affect the store/statistics assertions.
if (fs.existsSync("mailbug.db")) fs.unlinkSync("mailbug.db");

let base = "";
let server: Server;

before(async () => {
  await initDb();
  const app = express();
  app.use(express.json());
  app.use("/api", statisticsRouter);
  app.use("/api", ingestRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server?.close();
});

function postIngest(blob: unknown): Promise<{ stored: number; skipped: number }> {
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
  items: Array<{ id: string; subject: string; category: string; priority: number; topic: string }>;
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
  const email = await fetch(`${base}/api/emails?topic=uncategorized`).then((r) => r.json());
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
