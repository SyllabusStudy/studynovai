CREATE TABLE public.app_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lag','bug')),
  area text NOT NULL,
  message text NOT NULL,
  duration_ms integer,
  page text,
  device text,
  diagnosis text,
  fix text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_health_events TO authenticated;
GRANT ALL ON public.app_health_events TO service_role;
ALTER TABLE public.app_health_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students report own health events" ON public.app_health_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND length(message) <= 600 AND length(area) <= 80 AND coalesce(length(page),0) <= 200 AND coalesce(length(device),0) <= 200 AND resolved = false);
CREATE POLICY "Admins read health events" ON public.app_health_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update health events" ON public.app_health_events FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete health events" ON public.app_health_events FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX app_health_events_created_idx ON public.app_health_events (created_at DESC);