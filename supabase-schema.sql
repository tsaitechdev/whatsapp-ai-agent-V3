-- Run this in Supabase SQL Editor to set up the database

create table conversations (
  id uuid default gen_random_uuid() primary key,
  phone text unique not null,
  name text,
  mode text not null default 'agent' check (mode in ('agent', 'human')),
  
  -- Lead Details
  employment_type text,
  income_range text,
  cibil_range text,
  loan_type text,
  loan_amount text,
  city text,
  timeline text,
  qualified_at timestamp with time zone,
  flow_data jsonb,
  last_flow_sent timestamp with time zone,
  
  -- CRM Fields
  status text default 'New',
  priority text default 'Medium',
  internal_notes text,
  assigned_to text,
  follow_up_at timestamp with time zone,
  is_hot_lead boolean default false,

  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

-- Error Logs for Global Debug System
create table error_logs (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete set null,
  level text not null default 'error', -- info, warn, error
  component text not null, -- webhook, ai, whatsapp
  message text not null,
  stack text,
  metadata jsonb,
  created_at timestamp with time zone default now()
);

create table messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  whatsapp_msg_id text unique,
  status text default 'sent', -- For double/blue ticks: sent, delivered, read
  created_at timestamp with time zone default now()
);

create index idx_messages_conversation on messages(conversation_id);
create index idx_conversations_updated on conversations(updated_at desc);

-- Enable Realtime for the dashboard
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
