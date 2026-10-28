-- Message delivery / read status and dashboard edits.
-- Run once in the Supabase SQL Editor (the project that holds the `messages` table). Safe to run twice.
--
--   delivery_status : 'sent' | 'delivered' | 'read' | 'failed' for messages WE sent (customer messages stay null).
--   delivered_at    : when the platform said it reached the customer's phone / app.
--   read_at         : when the customer opened it ("seen").
--   edited_at       : set when an agent edits the text in the dashboard (the platforms do not allow editing a sent message).

alter table public.messages
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists edited_at timestamptz;

alter table public.messages drop constraint if exists messages_delivery_status_check;
alter table public.messages
  add constraint messages_delivery_status_check
  check (delivery_status is null or delivery_status in ('sent', 'delivered', 'read', 'failed'));
