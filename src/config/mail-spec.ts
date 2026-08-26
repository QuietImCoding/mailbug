import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface MailSpec {
  categories: string[];
  priorities: number[];
  actions: Record<
    string,
    {
      topic?: string;
      calendar?: string;
      defaultDays?: number;
      url?: string;
      baseUrl?: string;
      defaultTopic?: string;
      topics?: Record<string, string>;
      notify?: { minPriority?: number; categories?: string[] };
      defaultLevel?: string;
    }
  >;
  llm: { baseURL: string; model: string; maxTokens: number };
  prompt: { instructions: string; responseShape: string };
  ingestion: { cron: string };
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
