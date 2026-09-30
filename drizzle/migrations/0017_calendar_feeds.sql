CREATE TABLE public.calendar_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text NOT NULL DEFAULT 'School calendar',
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  last_synced_at timestamptz,
  last_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_feeds TO authenticated;
GRANT ALL ON public.calendar_feeds TO service_role;
ALTER TABLE public.calendar_feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own feeds" ON public.calendar_feeds FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);