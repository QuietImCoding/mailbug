import { loadMailSpec } from "../config/mail-spec.ts";
import { db } from "../db/db.ts";
import { classifyEmail } from "../ingest/classifier.ts";
import { getMailSource } from "../ingest/source.ts";
import { dispatchActions, recordActionStatus, refreshEmailContent, storeEmail } from "../ingest/store.ts";
import type { ActionMap } from "../ingest/types.ts";
import {
  executeCalendar,
  executePageUser,
  executeWebhook,
  notify,
  type ActionContext,
  type ActionOutput,
} from "./actions.ts";
import { inngest } from "./client.ts";

const cfg = loadMailSpec();

export const ingestEmails = inngest.createFunction(
  {
    id: "ingest-emails",
    triggers: [{ cron: cfg.ingestion.cron }, { event: "mailbug/ingest.run" }],
  },
  async ({ step }) => {
    const cfg = loadMailSpec();
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const emails = await step.run("fetch-emails", () => getMailSource().fetchSince(since));
    let processed = 0;

    for (const email of emails) {
      // Use the messageId in each step ID so parallel per-email chains don't collide.
      const id = email.messageId;
      try {
        const c = await step.run(`classify:${id}`, () => classifyEmail(email, cfg));
        const emailId = await step.run(`store:${id}`, () => storeEmail(email, c));
        await step.run(`dispatch:${id}`, () => dispatchActions(emailId, c.actions));
        processed++;
      } catch (err) {
        // validation/LLM failure → refresh the stored content if the row exists,
        // then skip the rest so the run doesn't fail.
        console.error("skipped email", email.messageId, err);
        await step.run(`refresh-body:${id}`, () => refreshEmailContent(email));
      }
    }

    return { processed };
  },
);

// ------------------------------------------------------------------ actions
// One Inngest function per action type. Each logs its call inputs (email id,
// payload, and the email's category/priority) so runs are debuggable, then
// marks running → executes → done (or failed) against the stored action row.

interface ActionEvent {
  emailId: string;
  payload: ActionMap;
}

async function loadEmailCtx(emailId: string): Promise<ActionContext> {
  const row = await db
    .selectFrom("emails")
    .select(["category", "priority"])
    .where("id", "=", emailId)
    .executeTakeFirst();
  return { category: row?.category, priority: row?.priority };
}

function logActionCall(
  actionType: string,
  emailId: string,
  payload: ActionMap,
  ctx: ActionContext,
): void {
  console.log(`[${actionType}] action call`, {
    actionType,
    emailId,
    payload,
    category: ctx.category,
    priority: ctx.priority,
  });
}

export const runPageUserAction = inngest.createFunction(
  { id: "run-action-page-user", triggers: [{ event: "mailbug/action.page-user" }] },
  async ({ event, step }) => {
    const { emailId, payload } = event.data as ActionEvent;
    const ctx = await loadEmailCtx(emailId);
    logActionCall("page-user", emailId, payload, ctx);

    await step.run("mark-running", () => recordActionStatus(emailId, "page-user", "running"));
    try {
      const output = await step.run("execute", () => executePageUser(payload, ctx));
      await step.run("mark-done", () => recordActionStatus(emailId, "page-user", "done"));
      return output;
    } catch (err) {
      await step.run("mark-failed", () => recordActionStatus(emailId, "page-user", "failed"));
      throw err;
    }
  },
);

export const runCalendarAction = inngest.createFunction(
  { id: "run-action-add-to-calendar", triggers: [{ event: "mailbug/action.add-to-calendar" }] },
  async ({ event, step }) => {
    const { emailId, payload } = event.data as ActionEvent;
    const ctx = await loadEmailCtx(emailId);
    logActionCall("add-to-calendar", emailId, payload, ctx);

    await step.run("mark-running", () => recordActionStatus(emailId, "add-to-calendar", "running"));
    try {
      const output = await step.run("execute", () => executeCalendar(payload, ctx));
      await step.run("mark-done", () => recordActionStatus(emailId, "add-to-calendar", "done"));
      return output;
    } catch (err) {
      await step.run("mark-failed", () => recordActionStatus(emailId, "add-to-calendar", "failed"));
      throw err;
    }
  },
);

export const runWebhookAction = inngest.createFunction(
  { id: "run-action-webhook", triggers: [{ event: "mailbug/action.webhook" }] },
  async ({ event, step }) => {
    const { emailId, payload } = event.data as ActionEvent;
    const ctx = await loadEmailCtx(emailId);
    logActionCall("webhook", emailId, payload, ctx);

    await step.run("mark-running", () => recordActionStatus(emailId, "webhook", "running"));
    try {
      const output = await step.run("execute", () => executeWebhook(payload, ctx));
      await step.run("mark-done", () => recordActionStatus(emailId, "webhook", "done"));
      return output;
    } catch (err) {
      await step.run("mark-failed", () => recordActionStatus(emailId, "webhook", "failed"));
      throw err;
    }
  },
);

export const runRemindMeAction = inngest.createFunction(
  { id: "run-action-remind-me", triggers: [{ event: "mailbug/action.remind-me" }] },
  async ({ event, step }) => {
    const { emailId, payload } = event.data as ActionEvent;
    const ctx = await loadEmailCtx(emailId);
    logActionCall("remind-me", emailId, payload, ctx);

    await step.run("mark-running", () => recordActionStatus(emailId, "remind-me", "running"));
    try {
      const cfg = loadMailSpec();
      const defaultDays = cfg.actions["remind-me"]?.defaultDays ?? 3;
      const days = Number(payload.days ?? defaultDays);
      const safeDays = Number.isFinite(days) && days >= 0 ? days : defaultDays;
      await step.sleep("remind", safeDays * 86_400_000);
      const output = await step.run("notify", () => notify(payload, ctx));
      await step.run("mark-done", () => recordActionStatus(emailId, "remind-me", "done"));
      return { ...output, remindedAfterDays: safeDays };
    } catch (err) {
      await step.run("mark-failed", () => recordActionStatus(emailId, "remind-me", "failed"));
      throw err;
    }
  },
);

export const actionFunctions = [
  runPageUserAction,
  runCalendarAction,
  runWebhookAction,
  runRemindMeAction,
];
