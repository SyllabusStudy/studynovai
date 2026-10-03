ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS sync_key text;
CREATE INDEX IF NOT EXISTS calendar_events_user_sync_key_idx ON public.calendar_events (user_id, sync_key);