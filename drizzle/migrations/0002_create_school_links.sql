CREATE TABLE public.school_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_links TO authenticated;
GRANT ALL ON public.school_links TO service_role;

ALTER TABLE public.school_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_links_own ON public.school_links FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX school_links_user_idx ON public.school_links (user_id, sort_order);

CREATE TRIGGER school_links_touch BEFORE UPDATE ON public.school_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();