import { loadMailSpec } from "../config/mail-spec.ts";
import { classifyEmail } from "../ingest/classifier.ts";
import { getMailSource } from "../ingest/source.ts";
import { dispatchActions, storeEmail } from "../ingest/store.ts";
import { inngest } from "./client.ts";

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
      try {
        const c = await step.run("classify", () => classifyEmail(email, cfg));
        const emailId = await step.run("store", () => storeEmail(email, c));
        await step.run("dispatch", () => dispatchActions(emailId, c.actions));
        processed++;
      } catch (err) {
        // validation/LLM failure → skip, don't fail the run
        console.error("skipped email", email.messageId, err);
      }
    }

    return { processed };
  },
);
