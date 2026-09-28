ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.video_notes ADD COLUMN IF NOT EXISTS thumbnail_url text;
CREATE TABLE IF NOT EXISTS public.study_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day date NOT NULL,
  activity_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day, activity_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_activity TO authenticated;
GRANT ALL ON public.study_activity TO service_role;
ALTER TABLE public.study_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own study activity" ON public.study_activity FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);