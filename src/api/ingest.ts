import { Router } from "express";
import { loadMailSpec } from "../config/mail-spec.ts";
import { classificationSchema } from "../ingest/classifier.ts";
import { dispatchActions, storeEmail } from "../ingest/store.ts";
import type { Classification, RawEmail } from "../ingest/types.ts";

const cfg = loadMailSpec();
const schema = classificationSchema(cfg);

interface IngestBlob {
  messageId: string;
  subject: string;
  fromAddress: string;
  fromName?: string;
  toAddress?: string;
  receivedAt: string;
  bodyText?: string;
  classification: Classification;
}

export const ingestRouter = Router();

ingestRouter.post("/ingest", async (req, res) => {
  const body = req.body;
  const blobs: IngestBlob[] = Array.isArray(body) ? body : [body];

  let stored = 0;
  let skipped = 0;

  for (const blob of blobs) {
    let emailId: string;
    let classification: Classification;
    try {
      classification = schema.parse({
        ...blob.classification,
        topic: blob.classification.topic || "uncategorized",
      });
      const email: RawEmail = {
        messageId: blob.messageId,
        subject: blob.subject,
        fromAddress: blob.fromAddress,
        fromName: blob.fromName ?? "",
        toAddress: blob.toAddress ?? "",
        receivedAt: blob.receivedAt,
        bodyText: blob.bodyText ?? "",
      };
      emailId = await storeEmail(email, classification);
    } catch {
      skipped++;
      continue;
    }

    stored++;
    try {
      await dispatchActions(emailId, classification.actions);
    } catch (err) {
      console.error("dispatch failed for", emailId, err);
    }
  }

  res.json({ stored, skipped });
});
