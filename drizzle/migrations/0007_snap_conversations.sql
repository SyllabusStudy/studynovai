CREATE TABLE public.snap_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled problem',
  class_id uuid NULL,
  mode text NOT NULL DEFAULT 'learn',
  image_data_url text NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snap_conversations TO authenticated;
GRANT ALL ON public.snap_conversations TO service_role;
ALTER TABLE public.snap_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own snap conversations" ON public.snap_conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX snap_conversations_user_idx ON public.snap_conversations(user_id, updated_at DESC);