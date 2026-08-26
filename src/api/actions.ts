import { randomUUID } from "node:crypto";
import { Router } from "express";
import { loadMailSpec } from "../config/mail-spec.ts";
import { db } from "../db/db.ts";
import { dispatchActions } from "../ingest/store.ts";
import type { ActionMap } from "../ingest/types.ts";

const cfg = loadMailSpec();

export const actionsRouter = Router();

// Manual trigger: a dashboard button calls this to create an Inngest run for a
// single action on an email. Re-runs an already-dispatched action as a fresh
// run (status resets to pending, then running → done). Idempotent by event id.
actionsRouter.post("/emails/:id/actions", async (req, res) => {
  const emailId = req.params.id;
  const { actionType, message } = (req.body ?? {}) as {
    actionType?: unknown;
    message?: unknown;
  };

  if (typeof actionType !== "string" || !(actionType in cfg.actions)) {
    res.status(400).json({ error: "unknown actionType" });
    return;
  }

  const email = await db
    .selectFrom("emails")
    .select("id")
    .where("id", "=", emailId)
    .executeTakeFirst();
  if (!email) {
    res.status(404).json({ error: "email not found" });
    return;
  }

  const existing = await db
    .selectFrom("email_actions")
    .select("payload")
    .where("email_id", "=", emailId)
    .where("action_type", "=", actionType)
    .executeTakeFirst();

  let storedMessage: string | undefined;
  if (existing) {
    try {
      storedMessage = Object.values(JSON.parse(existing.payload))[0] as string;
    } catch {
      // malformed stored payload → fall through to the default message
    }
  }
  const finalMessage =
    typeof message === "string" && message ? message : storedMessage ?? actionType;
  const payload: ActionMap = { [actionType]: finalMessage };

  if (existing) {
    await db
      .updateTable("email_actions")
      .set({ status: "pending", payload: JSON.stringify(payload) })
      .where("email_id", "=", emailId)
      .where("action_type", "=", actionType)
      .execute();
  } else {
    await db
      .insertInto("email_actions")
      .values({
        id: randomUUID(),
        email_id: emailId,
        action_type: actionType,
        payload: JSON.stringify(payload),
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .execute();
  }

  try {
    await dispatchActions(emailId, [payload]);
  } catch (err) {
    console.error("action dispatch failed for", emailId, actionType, err);
    res.status(502).json({ error: "could not dispatch action to inngest" });
    return;
  }
  res.json({ ok: true, actionType, status: "dispatched" });
});
