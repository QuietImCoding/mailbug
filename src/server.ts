import "dotenv/config";
import { fileURLToPath } from "node:url";
import express from "express";
import { serve } from "inngest/express";
import { actionsRouter } from "./api/actions.ts";
import { loadMailSpec } from "./config/mail-spec.ts";
import { configRouter } from "./api/config.ts";
import { ingestRouter } from "./api/ingest.ts";
import { sendersRouter } from "./api/senders.ts";
import { statisticsRouter } from "./api/statistics.ts";
import { widgetsRouter } from "./api/widgets.ts";
import { initDb } from "./db/db.ts";
import { startMailWatcher } from "./ingest/watcher.ts";
import { inngest } from "./inngest/client.ts";
import { actionFunctions, ingestEmails } from "./inngest/functions.ts";

await initDb();

const app = express();
app.use(express.json({ limit: process.env.BODY_LIMIT ?? "10mb" }));

app.use(
  "/api/inngest",
  serve({ client: inngest, functions: [ingestEmails, ...actionFunctions] }),
);
app.use("/api", statisticsRouter);
app.use("/api", ingestRouter);
app.use("/api", actionsRouter);
app.use("/api", configRouter);
app.use("/api", sendersRouter);
app.use("/api", widgetsRouter);
// In production the client is the Vite build; in dev `pnpm dev` runs the Vite
// server in front of this one and proxies /api and /assets back here, so this
// directory simply will not exist yet.
app.use(express.static(fileURLToPath(new URL("../dist/web", import.meta.url))));
app.use(
  "/assets",
  express.static(fileURLToPath(new URL("../assets", import.meta.url))),
);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`mailbug listening on :${port}`));

// Queueing an ingest is a convenience, not a critical path: without an event
// key (or with the dev server down) the send throws, and an unhandled
// rejection here would take down an API server that is already listening.
async function triggerIngest(reason: string): Promise<void> {
  try {
    await inngest.send({ name: "mailbug/ingest.run", ts: Date.now() });
  } catch (err) {
    console.error(
      `ingest (${reason}) could not be queued:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// Run once on boot so we don't have to wait for the cron schedule.
await triggerIngest("boot");

// IDLE turns the cron into a backstop rather than the only way mail arrives:
// the server pushes a notification within seconds and we ingest straight away.
const watcher =
  loadMailSpec().ingestion.idle === false
    ? null
    : startMailWatcher((reason) => void triggerIngest(reason));

if (watcher) {
  // Hand the connection back on the way out, so restarts during development
  // don't leave sockets held open against the mail server's connection limit.
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await Promise.race([
      watcher.stop(),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
