ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS reminder_minutes integer;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS reminder_minutes integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_reminder_minutes integer NOT NULL DEFAULT 1440;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT true;

UPDATE public.profiles SET default_reminder_minutes = GREATEST(default_reminder_days, 1) * 1440;
UPDATE public.assignments SET reminder_minutes = reminder_days * 1440 WHERE reminder_days IS NOT NULL AND reminder_minutes IS NULL;
UPDATE public.calendar_events SET reminder_minutes = reminder_days * 1440 WHERE reminder_days IS NOT NULL AND reminder_minutes IS NULL;

CREATE TABLE IF NOT EXISTS public.reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  remind_at timestamptz NOT NULL,
  channel text NOT NULL DEFAULT 'push',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_kind, source_id, remind_at, channel)
);

GRANT SELECT, INSERT, DELETE ON public.reminder_deliveries TO authenticated;
GRANT ALL ON public.reminder_deliveries TO service_role;

ALTER TABLE public.reminder_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminder_deliveries_own ON public.reminder_deliveries
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS reminder_deliveries_user_idx ON public.reminder_deliveries (user_id, created_at DESC);