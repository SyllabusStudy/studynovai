ALTER TABLE public.personal_notes ADD COLUMN class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.personal_notes ADD COLUMN title_is_auto boolean NOT NULL DEFAULT false;
CREATE INDEX personal_notes_user_class_idx ON public.personal_notes(user_id, class_id);
CREATE OR REPLACE FUNCTION public.validate_personal_note_class() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.class_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.classes WHERE id = NEW.class_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Choose one of your own classes.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_personal_note_class BEFORE INSERT OR UPDATE OF class_id, user_id ON public.personal_notes FOR EACH ROW EXECUTE FUNCTION public.validate_personal_note_class();