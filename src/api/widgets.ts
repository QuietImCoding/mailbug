import { Router } from "express";
import { db } from "../db/db.ts";

export const widgetsRouter = Router();

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

// Second-level domains that are really part of the suffix, so `mail.bbc.co.uk`
// keeps three labels instead of collapsing to a meaningless `co.uk`.
const SLD = new Set(["co", "com", "net", "org", "ac", "gov", "edu"]);

/** `em@em1.cloudflare.com` -> `cloudflare.com`. Best-effort, no PSL. */
export function senderDomain(address: string): string {
  const host = address.split("@").pop()?.toLowerCase() ?? "";
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const keep =
    SLD.has(labels[labels.length - 2]) && labels[labels.length - 1].length <= 3
      ? 3
      : 2;
  return labels.slice(-keep).join(".");
}

// One-time codes are worth surfacing for a few minutes, not forever.
const CODE_WINDOW_MS = 24 * 3600 * 1000;

const CODE_PATTERNS = [
  // "your verification code is 103505" — allow a short run of words between the
  // keyword and the digits, but not enough to reach an unrelated number.
  /\b(?:code|otp|passcode|pin)\b\D{0,40}?\b([0-9]{4,8})\b/i,
  // Alphanumeric codes are conventionally upper case and sit right after the word.
  /\b(?:code|otp|passcode|pin)\b[^\w]{0,12}([A-Z0-9]{6,8})\b/,
  /\b([0-9]{4,8})\b[^.\n]{0,30}?\bis your\b/i,
];

/**
 * Pulls a one-time code out of an email body, or null if there isn't one.
 *
 * The whole text is searched (not just a leading window): 2FA codes commonly
 * appear in the plain-text part that follows a long MIME/header preamble, so a
 * fixed early slice would miss them.
 */
export function extractCode(text: string): string | null {
  // Guard against pathological body sizes; every real code sits well below this.
  const haystack = text.slice(0, 64_000);
  for (const re of CODE_PATTERNS) {
    const m = haystack.match(re);
    // Reject all-letter matches from the alphanumeric branch — those are words.
    if (m?.[1] && /[0-9]/.test(m[1])) return m[1];
  }
  return null;
}

function localDay(iso: string): { y: number; m: number; d: number } | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
}

widgetsRouter.get("/widgets", async (_req, res) => {
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const recent = await db
    .selectFrom("emails")
    .select([
      "id",
      "subject",
      "from_address",
      "from_name",
      "received_at",
      "body_text",
      "priority",
    ])
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("blocked_senders")
            .select("blocked_senders.address")
            .whereRef("blocked_senders.address", "=", "emails.from_address"),
        ),
      ),
    ).where("dismissed_at", "=", "")
    .orderBy("received_at", "desc")
    .limit(300)
    .execute();

  const calendarActions = await db
    .selectFrom("email_actions")
    .innerJoin("emails", "emails.id", "email_actions.email_id")
    .select([
      "email_actions.email_id as email_id",
      "email_actions.payload as payload",
      "email_actions.status as status",
      "emails.subject as subject",
      "emails.received_at as received_at",
    ])
    .where("email_actions.action_type", "=", "add-to-calendar")
    .orderBy("emails.received_at", "desc")
    .limit(50)
    .execute();

  const emailsPerDay = new Array<number>(daysInMonth + 1).fill(0);
  for (const row of recent) {
    const day = localDay(row.received_at);
    if (day && day.y === year && day.m === monthIndex) emailsPerDay[day.d]++;
  }

  const eventsPerDay = new Array<number>(daysInMonth + 1).fill(0);
  const events = calendarActions.map((a) => {
    let title = a.subject;
    try {
      title =
        Object.values(JSON.parse(a.payload) as Record<string, string>)[0] ||
        a.subject;
    } catch {
      // payload is always written as JSON by the store, but never trust it
    }
    const day = localDay(a.received_at);
    if (day && day.y === year && day.m === monthIndex) eventsPerDay[day.d]++;
    return {
      emailId: a.email_id,
      title,
      subject: a.subject,
      // We have no date extraction in the classifier yet, so an event is dated
      // by the mail that asked for it.
      date: a.received_at,
      status: a.status,
    };
  });

  const cutoff = Date.now() - CODE_WINDOW_MS;
  const codes: Array<{
    emailId: string;
    code: string;
    domain: string;
    subject: string;
    receivedAt: string;
  }> = [];
  const seenDomains = new Set<string>();
  for (const row of recent) {
    if (new Date(row.received_at).getTime() < cutoff) continue;
    const code = extractCode(`${row.subject}\n${row.body_text}`);
    if (!code) continue;
    const domain = senderDomain(row.from_address);
    if (seenDomains.has(domain)) continue; // newest code per service wins
    seenDomains.add(domain);
    codes.push({
      emailId: row.id,
      code,
      domain,
      subject: row.subject,
      receivedAt: row.received_at,
    });
    if (codes.length >= 4) break;
  }

  res.json({
    calendar: {
      label: MONTHS[monthIndex],
      year,
      monthIndex,
      today: now.getDate(),
      // 0 = Sunday, matching Date#getDay, so the client can pad the first row.
      firstWeekday: new Date(year, monthIndex, 1).getDay(),
      days: Array.from({ length: daysInMonth }, (_, i) => ({
        day: i + 1,
        emails: emailsPerDay[i + 1],
        events: eventsPerDay[i + 1],
      })),
    },
    codes,
    events,
  });
});
