import { randomUUID } from "node:crypto";
import { db } from "../db/db.ts";
import type { EmailActionRow } from "../db/schema.ts";
import { inngest } from "../inngest/client.ts";
import type { ActionMap, Classification, RawEmail } from "./types.ts";

export async function storeEmail(
  email: RawEmail,
  c: Classification,
): Promise<string> {
  const existing = await db
    .selectFrom("emails")
    .select("id")
    .where("message_id", "=", email.messageId)
    .executeTakeFirst();
  if (existing) return existing.id;

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
