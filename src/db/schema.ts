export interface EmailRow {
  id: string;
  message_id: string;
  subject: string;
  from_address: string;
  from_name: string;
  received_at: string;
  category: string;
  priority: number;
  topic: string;
  body_text: string;
  raw_json: string;
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

export interface DB {
  emails: EmailRow;
  email_actions: EmailActionRow;
}
