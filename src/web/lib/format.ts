import type { EmailAction, EmailListItem } from "./api.ts";

export const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export const shortFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export type PriorityBucket = "high" | "mid" | "low";

/**
 * Buckets a priority by where it falls in the configured range, so the colour
 * ramp keeps working if `priorities` in mail-spec.json changes.
 */
export function priorityBucket(
  priority: number,
  priorities: number[],
): PriorityBucket {
  const min = Math.min(...priorities);
  const max = Math.max(...priorities);
  const norm = max === min ? 0.5 : (priority - min) / (max - min);
  if (norm >= 0.66) return "high";
  if (norm >= 0.34) return "mid";
  return "low";
}

export function initials(
  email: Pick<EmailListItem, "from_name" | "from_address">,
): string {
  const name = (email.from_name || email.from_address || "?").trim();
  return name[0] || "?";
}

/** Action payloads are single-key JSON records, e.g. `{"ntfy":"..."}`. */
export function actionMessage(action: EmailAction): string {
  try {
    return (
      Object.values(JSON.parse(action.payload) as Record<string, string>)[0] ||
      ""
    );
  } catch {
    return "";
  }
}

export const ACTION_LABELS: Record<string, string> = {
  "add-to-calendar": "add to cal",
  "page-user": "page user",
  "remind-me": "remind me",
  webhook: "webhook",
};

export const actionLabel = (type: string) => ACTION_LABELS[type] ?? type;

/** Splits a plain-text body into paragraphs for rendering. */
export function paragraphs(body: string): string[] {
  const parts = String(body || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : ["(no message body)"];
}
