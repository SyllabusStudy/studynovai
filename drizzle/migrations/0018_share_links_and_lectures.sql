CREATE TABLE public.shared_items (
  token text PRIMARY KEY DEFAULT encode(gen_random_bytes(9), 'hex'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('deck','quiz')),
  ref text NOT NULL,
  title text NOT NULL,
  payload jsonb NOT NULL,
  views integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_items TO authenticated;
GRANT ALL ON public.shared_items TO service_role;
ALTER TABLE public.shared_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own shares" ON public.shared_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_shared_item(_token text)
RETURNS TABLE(kind text, title text, payload jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.shared_items SET views = views + 1 WHERE token = _token
  RETURNING kind, title, payload;
$$;
REVOKE ALL ON FUNCTION public.get_shared_item(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_shared_item(text) TO anon, authenticated;

CREATE TABLE public.lecture_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  title text NOT NULL,
  transcript text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  key_concepts jsonb NOT NULL DEFAULT '[]'::jsonb,
  deck text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_notes TO authenticated;
GRANT ALL ON public.lecture_notes TO service_role;
ALTER TABLE public.lecture_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own lectures" ON public.lecture_notes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);