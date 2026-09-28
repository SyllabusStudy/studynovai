CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'desktop',
  notify_enabled boolean NOT NULL DEFAULT true,
  revoked boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own devices" ON public.user_devices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX user_devices_user_idx ON public.user_devices (user_id);