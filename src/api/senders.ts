import { Router } from "express";
import { db } from "../db/db.ts";

export const sendersRouter = Router();

sendersRouter.get("/senders/blocked", async (_req, res) => {
  const rows = await db
    .selectFrom("blocked_senders")
    .selectAll()
    .orderBy("blocked_at", "desc")
    .execute();
  res.json({ items: rows });
});

sendersRouter.post("/senders/blocked", async (req, res) => {
  const address = String(req.body?.address ?? "")
    .trim()
    .toLowerCase();
  if (!address) {
    res.status(400).json({ error: "address is required" });
    return;
  }
  await db
    .insertInto("blocked_senders")
    .values({ address, blocked_at: new Date().toISOString() })
    .onConflict((oc) => oc.column("address").doNothing())
    .execute();
  res.json({ address, blocked: true });
});

sendersRouter.delete("/senders/blocked/:address", async (req, res) => {
  const address = String(req.params.address).trim().toLowerCase();
  const result = await db
    .deleteFrom("blocked_senders")
    .where("address", "=", address)
    .executeTakeFirst();
  res.json({
    address,
    blocked: false,
    removed: Number(result.numDeletedRows ?? 0),
  });
});
