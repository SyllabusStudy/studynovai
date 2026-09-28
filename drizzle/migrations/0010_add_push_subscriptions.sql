ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS push_endpoint TEXT,
  ADD COLUMN IF NOT EXISTS push_p256dh TEXT,
  ADD COLUMN IF NOT EXISTS push_auth TEXT,
  ADD COLUMN IF NOT EXISTS push_subscribed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS user_devices_push_idx
  ON public.user_devices (user_id)
  WHERE push_endpoint IS NOT NULL;