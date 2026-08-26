import { loadMailSpec } from "../config/mail-spec.ts";
import { classifyEmail } from "../ingest/classifier.ts";
import { getMailSource } from "../ingest/source.ts";
import { dispatchActions, recordActionStatus, storeEmail } from "../ingest/store.ts";
import { inngest } from "./client.ts";
import { executeAction, notify } from "./actions.ts";
import type { ActionMap } from "../ingest/types.ts";

const cfg = loadMailSpec();

export const ingestEmails = inngest.createFunction(
  {
    id: "ingest-emails",
    triggers: [{ cron: cfg.ingestion.cron }, { event: "mailbug/ingest.run" }],
  },
  async ({ step }) => {
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
        // validation/LLM failure → skip, don't fail the run
        console.error("skipped email", email.messageId, err);
      }
    }

    return { processed };
  },
);
export const runAction = inngest.createFunction(
  {
    id: "run-action",
    triggers: [{ event: "mailbug/action.run" }],
  },
  async ({ event, step }) => {
    const { emailId, actionType, payload } = event.data as {
      emailId: string;
      actionType: string;
      payload: ActionMap;
    };

    await step.run("mark-running", () => recordActionStatus(emailId, actionType, "running"));

    if (actionType === "remind-me") {
      const defaultDays = cfg.actions["remind-me"]?.defaultDays ?? 3;
      const days = Number(payload.days ?? defaultDays);
      const safeDays = Number.isFinite(days) && days >= 0 ? days : defaultDays;
      await step.sleep("remind", safeDays * 86_400_000);
      const output = await step.run("notify", () => notify("remind-me", payload));
      await step.run("mark-done", () => recordActionStatus(emailId, actionType, "done"));
      return { ...output, remindedAfterDays: safeDays };
    }

    try {
      const output = await step.run(`execute:${actionType}`, () =>
        executeAction(actionType, payload),
      );
      await step.run("mark-done", () => recordActionStatus(emailId, actionType, "done"));
      return output;
    } catch (err) {
      await step.run("mark-failed", () => recordActionStatus(emailId, actionType, "failed"));
      throw err;
    }
  },
);
