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
      defaultLevel?: string;
      notify?: { minPriority?: number; categories?: string[] };
    }
  >;
  llm: { baseURL: string; model: string; maxTokens: number };
  ingestion: { cron: string };
}

let instance: MailSpec | undefined;

export function loadMailSpec(): MailSpec {
  if (instance) return instance;
  const path = fileURLToPath(new URL("./mail-spec.json", import.meta.url));
  instance = JSON.parse(readFileSync(path, "utf8")) as MailSpec;
  return instance;
}
