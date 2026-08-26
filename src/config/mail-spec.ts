import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface CategorySpec {
  key: string;
  prompt: string;
  priority: number;
}

export interface MailSpec {
  categories: CategorySpec[];
  priorities: number[];
  actions: Record<
    string,
    {
      topic?: string;
      calendar?: string;
      defaultDays?: number;
      url?: string;
      defaultLevel?: string;
    }
  >;
  llm: { baseURL: string; model: string; maxTokens: number };
  prompt: { instructions: string; responseShape: string };
  /** `idle` opts out of the IMAP IDLE watcher; the cron poll always runs. */
  ingestion: { cron: string; idle?: boolean };
}

let instance: MailSpec | undefined;

export function mailSpecPath(): string {
  return fileURLToPath(new URL("./mail-spec.json", import.meta.url));
}

export function loadMailSpec(): MailSpec {
  if (instance) return instance;
  instance = JSON.parse(readFileSync(mailSpecPath(), "utf8")) as MailSpec;
  return instance;
}

// Re-reads the file and invalidates the cached instance so a UI edit takes
// effect on the next use (e.g. the next ingest classification).
export function reloadMailSpec(): MailSpec {
  instance = undefined;
  return loadMailSpec();
}
