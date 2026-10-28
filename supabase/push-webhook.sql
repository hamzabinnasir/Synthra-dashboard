-- Push alerts: tell the dashboard to send a Firebase push whenever a row is added to `public.notifications`.
-- Run once in the Supabase SQL Editor of the project that holds the `notifications` table.
--
-- BEFORE RUNNING, replace the two placeholders below:
--   https://YOUR-PUBLIC-DOMAIN   the PUBLIC https URL of the deployed dashboard (NOT localhost: Supabase's servers
--                                cannot reach your computer). Example: https://synthra.vercel.app
--   YOUR_PUSH_WEBHOOK_SECRET     exactly the value of PUSH_WEBHOOK_SECRET in the dashboard's environment variables.
--
-- It is equivalent to creating a Database Webhook in Dashboard > Database > Webhooks (table: notifications,
-- event: Insert, method: POST, header x-webhook-secret).

drop trigger if exists push_on_notification_insert on public.notifications;

create trigger push_on_notification_insert
  after insert on public.notifications
  for each row
  execute function supabase_functions.http_request(
    'https://YOUR-PUBLIC-DOMAIN/api/push/notify',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"YOUR_PUSH_WEBHOOK_SECRET"}',
    '{}',
    '5000'
  );
