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
  console.log(`[action:${actionType}] ${message}`);
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
  console.log(`[action:ntfy] ${message}`);
  return { delivered: false, simulated: true };
}

export async function executeAction(
  actionType: string,
  payload: ActionMap,
  ctx: ActionContext = {},
): Promise<ActionOutput> {
  const cfg = loadMailSpec();
  switch (actionType) {
    case "ntfy":
      return publishNtfy(cfg, ctx, payload);
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
  ctx: ActionContext = {},
): Promise<ActionOutput> {
  return publishNtfy(loadMailSpec(), ctx, payload);
}
