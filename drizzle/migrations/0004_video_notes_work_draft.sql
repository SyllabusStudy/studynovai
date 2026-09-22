ALTER TABLE public.video_notes
  ADD COLUMN IF NOT EXISTS work_draft text,
  ADD COLUMN IF NOT EXISTS work_file_name text,
  ADD COLUMN IF NOT EXISTS work_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;