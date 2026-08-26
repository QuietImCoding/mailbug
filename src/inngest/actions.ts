import { loadMailSpec } from "../config/mail-spec.ts";
import type { MailSpec } from "../config/mail-spec.ts";
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

function ntfyTopic(cfg: MailSpec, category?: string): string {
  return (category && cfg.actions.ntfy?.topics?.[category]) || cfg.actions.ntfy?.defaultTopic || "mailbug";
}

// Only notify for "urgent/important" mail per config: priority at/above the
// threshold (higher number = more urgent) and, optionally, in a listed category.
function shouldNotify(cfg: MailSpec, ctx: ActionContext): boolean {
  const notify = cfg.actions.ntfy?.notify;
  if (!notify) return true;
  if (
    notify.minPriority != null &&
    (ctx.priority == null || ctx.priority < notify.minPriority)
  ) {
    return false;
  }
  if (
    notify.categories?.length &&
    (ctx.category == null || !notify.categories.includes(ctx.category))
  ) {
    return false;
  }
  return true;
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

// Publishes to the configured ntfy topic for the email's category (falls back
// to defaultTopic), only when the email is urgent enough per config. The
// message is the request body, as the ntfy API expects.
async function publishNtfy(
  cfg: MailSpec,
  ctx: ActionContext,
  payload: ActionMap,
): Promise<ActionOutput> {
  const message = Object.values(payload)[0] ?? "";
  if (!shouldNotify(cfg, ctx)) {
    console.log(`[ntfy] skipped (not urgent): ${message}`);
    return { delivered: false, simulated: true, skipped: true };
  }
  const baseUrl = cfg.actions.ntfy?.baseUrl;
  if (baseUrl) {
    const url = `${baseUrl}/${ntfyTopic(cfg, ctx.category)}`;
    await fetch(url, {
      method: "POST",
      headers: { title: "Mailbug" },
      body: message,
    });
    console.log(`[ntfy] published to ${url}`);
    return { delivered: true, simulated: false };
  }
  console.log(`[ntfy] ${message}`);
  return { delivered: false, simulated: true };
}

export async function executeNtfy(
  payload: ActionMap,
  ctx: ActionContext,
): Promise<ActionOutput> {
  return publishNtfy(loadMailSpec(), ctx, payload);
}

export async function executeCalendar(
  payload: ActionMap,
  ctx: ActionContext,
): Promise<ActionOutput> {
  const url = payload.url || process.env.MAILBUG_WEBHOOK_URL;
  return postJsonOrSimulate(url, "add-to-calendar", payload);
}

export async function executeWebhook(
  payload: ActionMap,
  ctx: ActionContext,
): Promise<ActionOutput> {
  const url = payload.url || process.env.MAILBUG_WEBHOOK_URL;
  return postJsonOrSimulate(url, "webhook", payload);
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

// Used by the remind-me function after sleeping. Notifies like ntfy.
export async function notify(
  payload: ActionMap,
  ctx: ActionContext,
): Promise<ActionOutput> {
  return publishNtfy(loadMailSpec(), ctx, payload);
}
