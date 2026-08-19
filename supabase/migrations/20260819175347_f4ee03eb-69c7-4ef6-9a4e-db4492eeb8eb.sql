CREATE TABLE public.video_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'youtube',
  source_url TEXT,
  transcript TEXT,
  notes TEXT,
  summary TEXT,
  chat JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_notes TO authenticated;
GRANT ALL ON public.video_notes TO service_role;

ALTER TABLE public.video_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own video notes"
  ON public.video_notes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX video_notes_user_created_idx ON public.video_notes (user_id, created_at DESC);