export interface RawEmail {
  messageId: string;
  subject: string;
  fromAddress: string;
  fromName: string;
  receivedAt: string; // ISO
  bodyText: string;
}

// Single-key record, e.g. { "ntfy": "..." }
export type ActionMap = Record<string, string>;

export interface Classification {
  category: string;
  priority: number;
  topic: string;
  actions: ActionMap[];
}
