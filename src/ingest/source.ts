import { ImapFlow } from "imapflow";
import { extractPlainText } from "./mime.ts";
import type { RawEmail } from "./types.ts";

export interface MailSource {
  fetchSince(since: Date): Promise<RawEmail[]>;
}

export function getMailSource(): MailSource {
  if (process.env.MAILBUG_IMAP_HOST && process.env.MAILBUG_IMAP_USER) {
    return new ImapMailSource();
  }
  // Fixtures were removed; without IMAP there is nothing to poll. Archived
  // emails already in the database stay visible.
  console.warn("mailbug: no IMAP configured — live ingestion disabled");
  return { fetchSince: async () => [] };
}

function normalizeDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export class ImapMailSource implements MailSource {
  async fetchSince(since: Date): Promise<RawEmail[]> {
    const host = process.env.MAILBUG_IMAP_HOST!;
    const user = process.env.MAILBUG_IMAP_USER!;
    const pass = process.env.MAILBUG_IMAP_PASS ?? "";
    const port = Number(process.env.MAILBUG_IMAP_PORT ?? 993);
    const secure = process.env.MAILBUG_IMAP_SECURE !== "false";

    console.log(
      `Starting ImapMailSource host=${host} port=${port} secure=${secure} user=${user}`,
    );
    const client = new ImapFlow({
      host,
      port,
      secure,
      auth: { user, pass },
      logger: false,
    });
    // ImapFlow emits an `error` event on socket resets; without a listener an
    // unhandled `'error'` event crashes the whole process. Connect/fetch
    // failures still reject the returned promise so callers observe them.
    client.on("error", (err) => {
      console.error(
        `[imap] ${host}: connection error`,
        err instanceof Error ? err.message : err,
      );
    });
    const results: RawEmail[] = [];
    let connected = false;

    try {
      await client.connect();
      connected = true;
      const lock = await client.getMailboxLock("INBOX");
      try {
        for await (const msg of client.fetch("1:*", {
          envelope: true,
          uid: true,
          internalDate: true,
          source: true,
        })) {
          const internal = normalizeDate(msg.internalDate);
          if (!msg.envelope || !internal || internal < since) continue;
          results.push({
            messageId: String(msg.uid),
            subject: msg.envelope.subject ?? "",
            fromAddress: msg.envelope.from?.[0]?.address ?? "",
            fromName: msg.envelope.from?.[0]?.name ?? "",
            toAddress: msg.envelope.to?.[0]?.address ?? "",
            receivedAt: internal.toISOString(),
            // Store the readable prose, not the raw MIME source: it is what the
            // dashboard shows and what the classifier reasons over.
            bodyText: extractPlainText(msg.source?.toString("utf8") ?? ""),
          });
        }
      } finally {
        lock.release();
      }
    } finally {
      if (connected) {
        try {
          await client.logout();
        } catch {
          // best-effort cleanup
        }
      }
    }
    return results;
  }
}
