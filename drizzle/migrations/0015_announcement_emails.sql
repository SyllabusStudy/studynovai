ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_news boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  preview_text text,
  body_html text NOT NULL,
  body_text text NOT NULL,
  prompt text,
  recipients integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read announcements"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
