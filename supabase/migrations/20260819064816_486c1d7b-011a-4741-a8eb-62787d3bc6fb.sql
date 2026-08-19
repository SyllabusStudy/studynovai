ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS deck TEXT;
UPDATE public.flashcards SET deck = 'Earlier cards' WHERE deck IS NULL;
CREATE INDEX IF NOT EXISTS flashcards_deck_idx ON public.flashcards (user_id, class_id, deck);

CREATE TABLE IF NOT EXISTS public.ai_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'fact',
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_memory TO authenticated;
GRANT ALL ON public.ai_memory TO service_role;
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memory_own" ON public.ai_memory FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ai_memory_touch BEFORE UPDATE ON public.ai_memory FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();