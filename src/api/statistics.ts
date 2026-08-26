import { Router } from "express";
import { db } from "../db/db.ts";
import type { DB } from "../db/schema.ts";

export const statisticsRouter = Router();

statisticsRouter.get("/statistics", async (_req, res) => {
  const totalRow = await db
    .selectFrom("emails")
    .select(db.fn.countAll().as("count"))
    .executeTakeFirst();
  const total = Number(totalRow?.count ?? 0);

  const byCategory = await db
    .selectFrom("emails")
    .select(["category"])
    .select(db.fn.countAll().as("count"))
    .groupBy("category")
    .orderBy("count", "desc")
    .execute();

  const byPriority = await db
    .selectFrom("emails")
    .select(["priority"])
    .select(db.fn.countAll().as("count"))
    .groupBy("priority")
    .orderBy("count", "desc")
    .execute();

  const topSenders = await db
    .selectFrom("emails")
    .select((eb) => [eb.ref("from_address").as("sender")])
    .select(db.fn.countAll().as("count"))
    .groupBy("from_address")
    .orderBy("count", "desc")
    .limit(10)
    .execute();

  const topTopics = await db
    .selectFrom("emails")
    .select(["topic"])
    .select(db.fn.countAll().as("count"))
    .groupBy("topic")
    .orderBy("count", "desc")
    .limit(10)
    .execute();

  res.json({ total, byCategory, byPriority, topSenders, topTopics });
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

statisticsRouter.get("/emails", async (req, res) => {
  const category = req.query.category ? String(req.query.category) : undefined;
  const sender = req.query.sender ? String(req.query.sender) : undefined;
  const topic = req.query.topic ? String(req.query.topic) : undefined;
  const sortRaw = req.query.sort ? String(req.query.sort) : "received_at";
  const orderRaw = req.query.order ? String(req.query.order) : "desc";
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

  const sortCols = ["received_at", "priority", "category", "from_address", "topic"];
  const sort = (sortCols as string[]).includes(sortRaw)
    ? (sortRaw as keyof DB["emails"])
    : "received_at";
  const order = orderRaw === "asc" ? "asc" : "desc";

  let q = db.selectFrom("emails");
  if (category) q = q.where("category", "=", category);
  if (sender) q = q.where("from_address", "=", sender);
  if (topic) q = q.where("topic", "=", topic);

  const totalRow = await q.select(db.fn.countAll().as("count")).executeTakeFirst();
  const total = Number(totalRow?.count ?? 0);

  const items = await q
    .select([...EMAIL_LIST_COLUMNS])
    .orderBy(sort, order)
    .offset((page - 1) * limit)
    .limit(limit)
    .execute();

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
  res.json({ ...email, actions });
});
