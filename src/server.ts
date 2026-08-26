import "dotenv/config";
import express from "express";
import { serve } from "inngest/express";
import { ingestRouter } from "./api/ingest.ts";
import { statisticsRouter } from "./api/statistics.ts";
import { initDb } from "./db/db.ts";
import { inngest } from "./inngest/client.ts";
import { ingestEmails, runAction } from "./inngest/functions.ts";

await initDb();

const app = express();
app.use(express.json());

app.use("/api/inngest", serve({ client: inngest, functions: [ingestEmails, runAction] }));
app.use("/api", statisticsRouter);
app.use("/api", ingestRouter);
app.use(express.static(new URL("./public", import.meta.url).pathname));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`mailbug listening on :${port}`));

// Fire the ingest once on boot so we don't have to wait for the cron schedule.
await inngest.send({
  name: "mailbug/ingest.run",
  ts: Date.now(),
});
