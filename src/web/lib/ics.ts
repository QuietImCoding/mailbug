import type { EmailListItem } from "./api.ts";

function icsEscape(text: string): string {
  return String(text)
    .replace(/([\\;,])/g, "\\$1")
    .replace(/\n/g, "\\n");
}

function icsStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/**
 * Builds and downloads a calendar invite for an `add-to-calendar` action.
 * The server has no date extraction yet, so the event is dated by the mail
 * that asked for it.
 */
export function downloadInvite(
  email: EmailListItem,
  title: string,
  start: Date,
): void {
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mailbug//EN",
    "BEGIN:VEVENT",
    `UID:${email.id}@mailbug`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape(
      `From ${email.from_name || ""} <${email.from_address}>\n${email.subject}`,
    )}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[^\w -]+/g, "").slice(0, 60) || "event"}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}
