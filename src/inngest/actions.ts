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

function pageUserTopic(cfg: MailSpec, category?: string): string {
  return (
    (category && cfg.actions["page-user"]?.topics?.[category]) ||
    cfg.actions["page-user"]?.defaultTopic ||
    "mailbug"
  );
}

// Only notify for "urgent/important" mail per config: priority at/above the
// threshold (higher number = more urgent) and, optionally, in a listed category.
function shouldNotify(cfg: MailSpec, ctx: ActionContext): boolean {
  const notify = cfg.actions["page-user"]?.notify;
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

// Pages the user: publishes to the configured topic for the email's category
// (falls back to defaultTopic), only when the email is urgent enough per config.
// The message is the request body, as the ntfy API expects.
async function publishPageUser(
  cfg: MailSpec,
  ctx: ActionContext,
  payload: ActionMap,
): Promise<ActionOutput> {
  const message = Object.values(payload)[0] ?? "";
  if (!shouldNotify(cfg, ctx)) {
    console.log(`[page-user] skipped (not urgent): ${message}`);
    return { delivered: false, simulated: true, skipped: true };
  }
  const baseUrl = cfg.actions["page-user"]?.baseUrl;
  if (baseUrl) {
    const url = `${baseUrl}/${pageUserTopic(cfg, ctx.category)}`;
    await fetch(url, {
      method: "POST",
      headers: { title: "Mailbug" },
      body: message,
    });
    console.log(`[page-user] published to ${url}`);
    return { delivered: true, simulated: false };
  }
  console.log(`[page-user] ${message}`);
  return { delivered: false, simulated: true };
}

export async function executePageUser(
  payload: ActionMap,
  ctx: ActionContext,
): Promise<ActionOutput> {
  return publishPageUser(loadMailSpec(), ctx, payload);
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

// Used by the remind-me function after sleeping. Pages the user like page-user.
export async function notify(
  payload: ActionMap,
  ctx: ActionContext,
): Promise<ActionOutput> {
  return publishPageUser(loadMailSpec(), ctx, payload);
}
