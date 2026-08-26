import { loadMailSpec } from "../config/mail-spec.ts";
import type { ActionMap } from "../ingest/types.ts";

export interface ActionContext {
  category?: string;
  priority?: number;
}

export interface ActionOutput {
  delivered: boolean;
  simulated: boolean;
  skipped?: boolean;
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
  console.log(`[${actionType}] simulated`);
  return { delivered: false, simulated: true };
}

// Sends a push via the Bark service (https://github.com/Finb/Bark). The device
// key comes from env (MAILBUG_BARK_KEY); the message is the URL path segment
// (any "/" URL-encodes automatically) and any extra payload keys become query
// params, e.g. { message: "Server is down", level: "critical", volume: "10" }
// → https://api.day.app/<key>/Server%20is%20down?level=critical&volume=10
export async function executePageUser(
  payload: ActionMap,
  ctx: ActionContext,
): Promise<ActionOutput> {
  const key = process.env.MAILBUG_BARK_KEY;
  const message = Object.values(payload)[0] ?? "";
  if (!key) {
    console.log(`[page-user] simulated (no MAILBUG_BARK_KEY): ${message}`);
    return { delivered: false, simulated: true };
  }

  // Encode the message as a single path segment (spaces and slashes → %20/%2F).
  const pathSegment = encodeURIComponent(message);
  const base = `https://api.day.app/${key}/${pathSegment}`;

  // Extra payload keys beyond the message become URL query params.
  const params = new URLSearchParams();
  const cfg = loadMailSpec();
  const defaultLevel = cfg.actions["page-user"]?.defaultLevel ?? "critical";
  params.set("level", payload.level ?? defaultLevel);
  for (const [k, v] of Object.entries(payload)) {
    if (k !== "level") params.set(k, v);
  }
  const query = params.toString();
  const url = query ? `${base}?${query}` : base;

  await fetch(url);
  console.log(`[page-user] pushed to ${url}`);
  return { delivered: true, simulated: false };
}

export async function executeCalendar(
  payload: ActionMap,
  ctx: ActionContext,
): Promise<ActionOutput> {
  const url = payload.url || process.env.MAILBUG_WEBHOOK_URL;
  return postJsonOrSimulate(url, "add-to-calendar", payload);
}
