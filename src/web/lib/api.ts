// Thin typed wrappers over the Express API. In dev these go through Vite's
// proxy; in production Express serves the built client itself.

export interface EmailAction {
  email_id: string;
  action_type: string;
  payload: string;
  status: "pending" | "running" | "done" | "failed";
}

export interface EmailListItem {
  id: string;
  subject: string;
  from_address: string;
  from_name: string;
  received_at: string;
  category: string;
  priority: number;
  topic: string;
  actions: EmailAction[];
}

export interface EmailDetail extends EmailListItem {
  to_address: string;
  body_text: string;
}

export interface Statistics {
  total: number;
  byCategory: Array<{ category: string; count: number }>;
  byPriority: Array<{ priority: number; count: number }>;
  topSenders: Array<{ sender: string; count: number }>;
  topTopics: Array<{ topic: string; count: number }>;
  priorities: number[];
}

export interface CalendarDay {
  day: number;
  emails: number;
  events: number;
}

export interface Widgets {
  calendar: {
    label: string;
    year: number;
    monthIndex: number;
    today: number;
    firstWeekday: number;
    days: CalendarDay[];
  };
  codes: Array<{
    emailId: string;
    code: string;
    domain: string;
    subject: string;
    receivedAt: string;
  }>;
  events: Array<{
    emailId: string;
    title: string;
    subject: string;
    date: string;
    status: string;
  }>;
}

export interface EmailList {
  items: EmailListItem[];
  page: number;
  limit: number;
  total: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return (await res.json()) as T;
}

export interface EmailQuery {
  sort: string;
  order: string;
  category: string;
  limit?: number;
}

export function fetchEmails(query: EmailQuery): Promise<EmailList> {
  const params = new URLSearchParams({
    sort: query.sort,
    order: query.order,
    limit: String(query.limit ?? 100),
  });
  if (query.category) params.set("category", query.category);
  return get<EmailList>(`/api/emails?${params}`);
}

export const fetchStatistics = () => get<Statistics>("/api/statistics");
export const fetchWidgets = () => get<Widgets>("/api/widgets");
export const fetchEmail = (id: string) => get<EmailDetail>(`/api/emails/${id}`);

export async function blockSender(address: string): Promise<void> {
  const res = await fetch("/api/senders/blocked", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) throw new Error(`could not block ${address}`);
}

interface BlockedSenders {
  items: Array<{ address: string; blocked_at: string }>;
}

export async function fetchBlocked(): Promise<string[]> {
  const data = await get<BlockedSenders>("/api/senders/blocked");
  return data.items.map((item) => item.address.toLowerCase());
}

export async function unblockSender(address: string): Promise<void> {
  const res = await fetch(`/api/senders/blocked/${encodeURIComponent(address)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`could not unblock ${address}`);
}

/**
 * Manually re-runs one of an email's actions. The server resets the stored
 * status to pending and dispatches a fresh Inngest run.
 */
export async function triggerAction(
  emailId: string,
  actionType: string,
): Promise<void> {
  const res = await fetch(`/api/emails/${emailId}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actionType }),
  });
  if (!res.ok) throw new Error(`could not trigger ${actionType}`);
}
export interface MailConfig {
  categories: Array<{ key: string; prompt: string; priority: number }>;
  priorities: number[];
  prompt: { instructions: string; responseShape: string };
}

export const fetchConfig = () => get<MailConfig>("/api/config");

export async function saveConfig(
  config: {
    categories: MailConfig["categories"];
    priorities: number[];
    prompt: MailConfig["prompt"];
  },
): Promise<MailConfig> {
  const res = await fetch("/api/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("could not save config");
  return (await res.json()) as MailConfig;
}
