ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES public.assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_help TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'upload';

CREATE INDEX IF NOT EXISTS documents_assignment_id_idx ON public.documents(assignment_id);