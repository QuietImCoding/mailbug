import type { ActionMap } from "../ingest/types.ts";

export interface ActionOutput {
  delivered: boolean;
  simulated: boolean;
}

async function postOrSimulate(
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

export async function executeAction(
  actionType: string,
  payload: ActionMap,
): Promise<ActionOutput> {
  switch (actionType) {
    case "ntfy":
      return postOrSimulate(process.env.MAILBUG_NTFY_URL, actionType, payload);
    case "add-to-calendar":
    case "webhook": {
      const url = payload.url || process.env.MAILBUG_WEBHOOK_URL;
      return postOrSimulate(url, actionType, payload);
    }
    default:
      throw new Error(`unsupported action type: ${actionType}`);
  }
}

// Used by the remind-me branch after sleeping. Notifies the same way as ntfy.
export async function notify(
  actionType: string,
  payload: ActionMap,
): Promise<ActionOutput> {
  return postOrSimulate(process.env.MAILBUG_NTFY_URL, actionType, payload);
}
