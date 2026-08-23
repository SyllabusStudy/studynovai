ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS calendar_events_assignment_id_idx ON public.calendar_events(assignment_id);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS annotations jsonb;