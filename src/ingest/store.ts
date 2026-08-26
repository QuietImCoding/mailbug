import { randomUUID } from "node:crypto";
import { db } from "../db/db.ts";
import type { EmailActionRow } from "../db/schema.ts";
import { inngest } from "../inngest/client.ts";
import type { LlmMeta } from "./classifier.ts";
import type { ActionMap, Classification, RawEmail } from "./types.ts";

export async function storeEmail(
  email: RawEmail,
  c: Classification,
  llm?: LlmMeta,
): Promise<string> {
  const existing = await db
    .selectFrom("emails")
    .select("id")
    .where("message_id", "=", email.messageId)
    .executeTakeFirst();
  if (existing) {
    // Re-ingest refreshes the content (so a better text/plain extraction shows
    // up) without churning the classification or its stored actions.
    const updated = llm ? { llm_json: JSON.stringify(llm) } : {};
    await db
      .updateTable("emails")
      .set({
        subject: email.subject,
        from_address: email.fromAddress,
        from_name: email.fromName,
        to_address: email.toAddress ?? "",
        received_at: email.receivedAt || new Date().toISOString(),
        body_text: email.bodyText,
        ...(updated.llm_json !== undefined ? { llm_json: updated.llm_json } : {}),
      })
      .where("id", "=", existing.id)
      .execute();
    return existing.id;
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db
    .insertInto("emails")
    .values({
      id,
      message_id: email.messageId,
      subject: email.subject,
      from_address: email.fromAddress,
      from_name: email.fromName,
      to_address: email.toAddress ?? "",
      received_at: email.receivedAt || now,
      category: c.category,
      priority: c.priority,
      topic: c.topic,
      body_text: email.bodyText,
      raw_json: JSON.stringify(c),
      llm_json: llm ? JSON.stringify(llm) : "",
      created_at: now,
    })
    .execute();

  for (const entry of c.actions) {
    await db
      .insertInto("email_actions")
      .values({
        id: randomUUID(),
        email_id: id,
        action_type: Object.keys(entry)[0],
        payload: JSON.stringify(entry),
        status: "pending",
        created_at: now,
      })
      .execute();
  }

  return id;
}

// Refreshes only the content (subject/from/to/date/body) for an email that
// already exists, without touching its classification or stored actions. Used
// when a re-ingest fetched fresh content but classification failed.
export async function refreshEmailContent(email: RawEmail): Promise<string> {
  const existing = await db
    .selectFrom("emails")
    .select("id")
    .where("message_id", "=", email.messageId)
    .executeTakeFirst();
  if (!existing) return "";
  await db
    .updateTable("emails")
    .set({
      subject: email.subject,
      from_address: email.fromAddress,
      from_name: email.fromName,
      to_address: email.toAddress ?? "",
      received_at: email.receivedAt || new Date().toISOString(),
      body_text: email.bodyText,
    })
    .where("id", "=", existing.id)
    .execute();
  return existing.id;
}

export async function recordActionStatus(
  emailId: string,
  actionType: string,
  status: EmailActionRow["status"],
): Promise<void> {
  await db
    .updateTable("email_actions")
    .set({ status })
    .where("email_id", "=", emailId)
    .where("action_type", "=", actionType)
    .execute();
}

export async function getLastIngestedAt(): Promise<string | null> {
  const row = await db
    .selectFrom("ingest_state")
    .select("last_ingested_at")
    .where("id", "=", 1)
    .executeTakeFirst();
  return row?.last_ingested_at ?? null;
}

export async function setLastIngestedAt(iso: string): Promise<void> {
  await db
    .insertInto("ingest_state")
    .values({ id: 1, last_ingested_at: iso })
    .onConflict((oc) => oc.column("id").doUpdateSet({ last_ingested_at: iso }))
    .execute();
}

export async function dispatchActions(
  emailId: string,
  actions: ActionMap[],
): Promise<void> {
  for (const entry of actions) {
    const [actionType] = Object.entries(entry)[0];
    await inngest.send({
      name: `mailbug/action.${actionType}`,
      data: { emailId, payload: entry },
      id: `${emailId}:${actionType}`,
    });
  }
}
