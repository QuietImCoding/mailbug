import { loadMailSpec } from "../config/mail-spec.ts";
import type { MailSpec } from "../config/mail-spec.ts";
import type { ActionMap } from "../ingest/types.ts";

export interface ActionOutput {
  delivered: boolean;
  simulated: boolean;
}

function ntfyTopic(cfg: MailSpec, category?: string): string {
  return (category && cfg.actions.ntfy?.topics?.[category]) || cfg.actions.ntfy?.defaultTopic || "mailbug";
}

async function postJsonOrSimulate(
  targetUrl: string | undefined,
  actionType: string,
  payload: ActionMap,
): Promise<ActionOutput> {
  const message = Object.values(payload)[0] ?? "";
  if (targetUrl) {
    await fetch(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionType, message, ...payload }),
    });
    return { delivered: true, simulated: false };
  }
  console.log(`[action:${actionType}] ${message}`);
  return { delivered: false, simulated: true };
}

// Publishes to the configured ntfy topic for the email's category (falls back
// to defaultTopic). The message is the request body, as the ntfy API expects.
async function publishNtfy(
  cfg: MailSpec,
  category: string | undefined,
  payload: ActionMap,
): Promise<ActionOutput> {
  const message = Object.values(payload)[0] ?? "";
  const baseUrl = cfg.actions.ntfy?.baseUrl;
  if (baseUrl) {
    const url = `${baseUrl}/${ntfyTopic(cfg, category)}`;
    await fetch(url, {
      method: "POST",
      headers: { title: "Mailbug" },
      body: message,
    });
    console.log(`[ntfy] published to ${url}`);
    return { delivered: true, simulated: false };
  }
  console.log(`[action:ntfy] ${message}`);
  return { delivered: false, simulated: true };
}

export async function executeAction(
  actionType: string,
  payload: ActionMap,
  category?: string,
): Promise<ActionOutput> {
  const cfg = loadMailSpec();
  switch (actionType) {
    case "ntfy":
      return publishNtfy(cfg, category, payload);
    case "add-to-calendar":
    case "webhook": {
      const url = payload.url || process.env.MAILBUG_WEBHOOK_URL;
      return postJsonOrSimulate(url, actionType, payload);
    }
    default:
      throw new Error(`unsupported action type: ${actionType}`);
  }
}

// Used by the remind-me branch after sleeping. Notifies the same way as ntfy.
export async function notify(
  actionType: string,
  payload: ActionMap,
  category?: string,
): Promise<ActionOutput> {
  return publishNtfy(loadMailSpec(), category, payload);
}
