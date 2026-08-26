import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ImapFlow } from "imapflow";
import type { RawEmail } from "./types.ts";

export interface MailSource {
  fetchSince(since: Date): Promise<RawEmail[]>;
}

export function getMailSource(): MailSource {
  if (process.env.MAILBUG_IMAP_HOST && process.env.MAILBUG_IMAP_USER) {
    return new ImapMailSource();
  }
  return new FixtureMailSource();
}

export class FixtureMailSource implements MailSource {
  async fetchSince(since: Date): Promise<RawEmail[]> {
    const dir = fileURLToPath(new URL("../fixtures/emails", import.meta.url));
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      return []; // no fixture directory
    }
    const results: RawEmail[] = [];
    for (const f of files) {
      const raw = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as RawEmail;
      if (new Date(raw.receivedAt) >= since) results.push(raw);
    }
    return results;
  }
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

    const client = new ImapFlow({ host, port, secure, auth: { user, pass }, logger: false });
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
            receivedAt: internal.toISOString(),
            bodyText: msg.source?.toString("utf8") ?? "",
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
