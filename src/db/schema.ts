export interface EmailRow {
  id: string;
  message_id: string;
  subject: string;
  from_address: string;
  from_name: string;
  to_address: string;
  received_at: string;
  category: string;
  priority: number;
  topic: string;
  body_text: string;
  raw_json: string;
  llm_json: string;
  created_at: string;
}

export interface EmailActionRow {
  id: string;
  email_id: string;
  action_type: string;
  payload: string;
  status: "pending" | "running" | "done" | "failed";
  created_at: string;
}

export interface BlockedSenderRow {
  address: string;
  blocked_at: string;
}

// Single-row table tracking where the incremental ingestion cursor sits.
export interface IngestStateRow {
  id: number;
  last_ingested_at: string;
}

export interface DB {
  emails: EmailRow;
  email_actions: EmailActionRow;
  blocked_senders: BlockedSenderRow;
  ingest_state: IngestStateRow;
}
