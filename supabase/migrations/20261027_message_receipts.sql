-- Delivery / read receipts for messages the dashboard or bot SENT ("seen" ticks in the mobile app).
-- Run once in the Supabase SQL Editor (and in the Facebook/Instagram project too if it is a separate one).
--
-- The mobile app only DISPLAYS these columns. They must be filled by whatever receives the platform webhooks
-- (the separate webhook backend, see CLAUDE.md):
--   WhatsApp   webhook `statuses[]`          status: sent | delivered | read | failed  (match on the wamid you stored)
--   Messenger  webhook `message_reads`       `watermark` = every message sent before it has been read
--              webhook `message_deliveries`  same idea for delivered
--   Instagram  webhook `messaging_seen`      `read.mid` = that message (and older ones) has been seen
-- Update the row like:  update messages set delivery_status = 'read', read_at = now() where ...
-- The app refreshes live because the conversation stream already forwards message updates.

alter table public.messages add column if not exists delivery_status text;
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;

alter table public.messages drop constraint if exists messages_delivery_status_check;
alter table public.messages
  add constraint messages_delivery_status_check
  check (delivery_status is null or delivery_status in ('sent', 'delivered', 'read', 'failed'));
