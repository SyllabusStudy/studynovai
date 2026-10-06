CREATE TABLE public.personal_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 title text NOT NULL DEFAULT 'Untitled note',
 content jsonb NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
 plain_text text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_notes TO authenticated;
GRANT ALL ON public.personal_notes TO service_role;
ALTER TABLE public.personal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read personal notes" ON public.personal_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners create personal notes" ON public.personal_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners update personal notes" ON public.personal_notes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners delete personal notes" ON public.personal_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX personal_notes_owner_updated_idx ON public.personal_notes (user_id, updated_at DESC);
CREATE FUNCTION public.touch_personal_note() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER personal_notes_updated BEFORE UPDATE ON public.personal_notes FOR EACH ROW EXECUTE FUNCTION public.touch_personal_note();