import { Router } from "express";
import { loadMailSpec } from "../config/mail-spec.ts";
import { db } from "../db/db.ts";
import type { DB } from "../db/schema.ts";
import { addressOf, extractPlainText, parseMessage } from "../ingest/mime.ts";
import { dismissEmail } from "../ingest/store.ts";

export const statisticsRouter = Router();

// Dismissed emails are hidden from the inbox/statistics without being deleted.
function activeEmails() {
  return db.selectFrom("emails").where("dismissed_at", "=", "");
}

statisticsRouter.get("/statistics", async (_req, res) => {
  const active = activeEmails();
  const totalRow = await active
    .select(db.fn.countAll().as("count"))
    .executeTakeFirst();
  const total = Number(totalRow?.count ?? 0);

  const byCategory = await activeEmails()
    .select(["category"])
    .select(db.fn.countAll().as("count"))
    .groupBy("category")
    .orderBy("count", "desc")
    .execute();

  const byPriority = await activeEmails()
    .select(["priority"])
    .select(db.fn.countAll().as("count"))
    .groupBy("priority")
    .orderBy("count", "desc")
    .execute();

  const topSenders = await activeEmails()
    .select((eb) => [eb.ref("from_address").as("sender")])
    .select(db.fn.countAll().as("count"))
    .groupBy("from_address")
    .orderBy("count", "desc")
    .limit(10)
    .execute();

  const topTopics = await activeEmails()
    .select(["topic"])
    .select(db.fn.countAll().as("count"))
    .groupBy("topic")
    .orderBy("count", "desc")
    .limit(10)
    .execute();

  // The dashboard colours each row by where its priority falls in the configured
  // range, so it needs the range itself rather than just the observed values.
  const priorities = loadMailSpec().priorities;

  res.json({
    total,
    byCategory,
    byPriority,
    topSenders,
    topTopics,
    priorities,
  });
});

const EMAIL_LIST_COLUMNS = [
  "id",
  "subject",
  "from_address",
  "from_name",
  "received_at",
  "category",
  "priority",
  "topic",
] as const;

// Rows render their action as a chip ("add to cal"), so the list endpoint
// returns each email's actions inline instead of forcing a fetch per row.
async function withActions<T extends { id: string }>(rows: T[]) {
  if (rows.length === 0) return [];
  const actions = await db
    .selectFrom("email_actions")
    .select(["email_id", "action_type", "payload", "status"])
    .where(
      "email_id",
      "in",
      rows.map((r) => r.id),
    )
    .execute();

  const byEmail = new Map<string, typeof actions>();
  for (const a of actions) {
    const list = byEmail.get(a.email_id) ?? [];
    list.push(a);
    byEmail.set(a.email_id, list);
  }
  return rows.map((r) => ({ ...r, actions: byEmail.get(r.id) ?? [] }));
}

statisticsRouter.get("/emails", async (req, res) => {
  const category = req.query.category ? String(req.query.category) : undefined;
  const sender = req.query.sender ? String(req.query.sender) : undefined;
  const topic = req.query.topic ? String(req.query.topic) : undefined;
  const sortRaw = req.query.sort ? String(req.query.sort) : "received_at";
  const orderRaw = req.query.order ? String(req.query.order) : "desc";
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

  const sortCols = [
    "received_at",
    "priority",
    "category",
    "from_address",
    "topic",
  ];
  const sort = (sortCols as string[]).includes(sortRaw)
    ? (sortRaw as keyof DB["emails"])
    : "received_at";
  const order = orderRaw === "asc" ? "asc" : "desc";

  let q = activeEmails();
  if (category) q = q.where("category", "=", category);
  if (sender) q = q.where("from_address", "=", sender);
  if (topic) q = q.where("topic", "=", topic);
  // Blocking a sender hides their mail from the inbox without deleting history,
  // so the stats endpoint still counts it. `includeBlocked=1` opts back in.
  if (req.query.includeBlocked !== "1") {
    q = q.where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("blocked_senders")
            .select("blocked_senders.address")
            .whereRef("blocked_senders.address", "=", "emails.from_address"),
        ),
      ),
    );
  }

  const totalRow = await q
    .select(db.fn.countAll().as("count"))
    .executeTakeFirst();
  const total = Number(totalRow?.count ?? 0);

  const rows = await q
    .select([...EMAIL_LIST_COLUMNS])
    .orderBy(sort, order)
    .orderBy("id", "asc")
    .offset((page - 1) * limit)
    .limit(limit)
    .execute();

  const items = await withActions(rows);

  res.json({ items, page, limit, total });
});

statisticsRouter.get("/emails/:id", async (req, res) => {
  const id = req.params.id;
  const email = await db
    .selectFrom("emails")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  if (!email) {
    res.status(404).json({ error: "email not found" });
    return;
  }
  const actions = await db
    .selectFrom("email_actions")
    .selectAll()
    .where("email_id", "=", id)
    .execute();

  // Rows ingested before the MIME extractor landed still hold raw message
  // source, so unpack on read as well as on write.
  const parsed = parseMessage(email.body_text);
  const body_text = parsed.text || extractPlainText(email.body_text);
  const to_address =
    email.to_address ||
    addressOf(parsed.headers["to"] ?? parsed.headers["delivered-to"]);

  res.json({ ...email, body_text, to_address, actions });
});

// Hide an email from the inbox/statistics (soft delete).
statisticsRouter.post("/emails/:id/dismiss", async (req, res) => {
  const id = req.params.id;
  await dismissEmail(id);
  res.json({ ok: true, dismissed: true, id });
});
