export interface Conversation {
  id: string;
  phone: string;
  name: string | null;
  mode: "agent" | "human";
  updated_at: string;
  created_at: string;
  employment_type?: string | null;
  income_range?: string | null;
  cibil_range?: string | null;
  loan_type?: string | null;
  loan_amount?: string | null;
  city?: string | null;
  timeline?: string | null;
  qualified_at?: string | null;
  status: string;
  priority: string;
  internal_notes: string | null;
  assigned_to?: string | null;
  follow_up_at?: string | null;
  is_hot_lead?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  whatsapp_msg_id: string | null;
  status: "sent" | "delivered" | "read";
  created_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  last_message: string | null;
}
