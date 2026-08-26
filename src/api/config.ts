import { writeFileSync } from "node:fs";
import { Router } from "express";
import { z } from "zod";
import {
  loadMailSpec,
  mailSpecPath,
  reloadMailSpec,
  type MailSpec,
} from "../config/mail-spec.ts";

// The UI edits the prompt instructions and the category/priority lists. The
// other sections (actions, llm, ingestion) are preserved as-is on write.
const configUpdateSchema = z.object({
  categories: z.array(z.object({
    key: z.string().min(1),
    prompt: z.string(),
    priority: z.number().int(),
  })).min(1),
  priorities: z.array(z.number().int().min(0)).min(1),
  prompt: z.object({
    instructions: z.string(),
    responseShape: z.string(),
  }),
});

export const configRouter = Router();

configRouter.get("/config", (_req, res) => {
  res.json(loadMailSpec());
});

configRouter.put("/config", async (req, res) => {
  const parsed = configUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid config", issues: parsed.error.issues });
    return;
  }

  const current = loadMailSpec();
  const next: MailSpec = {
    ...current,
    categories: parsed.data.categories,
    priorities: parsed.data.priorities,
    prompt: parsed.data.prompt,
  };
  writeFileSync(mailSpecPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");

  res.json(reloadMailSpec());
});
