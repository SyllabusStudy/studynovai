CREATE TABLE public.ai_trial_uses (
  user_id uuid NOT NULL,
  bucket text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, bucket)
);
GRANT SELECT ON public.ai_trial_uses TO authenticated;
GRANT ALL ON public.ai_trial_uses TO service_role;
ALTER TABLE public.ai_trial_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own trial uses readable" ON public.ai_trial_uses FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.consume_ai_trial(_bucket text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit int; _uid uuid := auth.uid(); _ok boolean;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  _limit := CASE _bucket WHEN 'tools' THEN 3 WHEN 'tutor' THEN 2 ELSE 0 END;
  IF _limit = 0 THEN RETURN false; END IF;
  INSERT INTO public.ai_trial_uses (user_id, bucket, used) VALUES (_uid, _bucket, 0)
  ON CONFLICT (user_id, bucket) DO NOTHING;
  UPDATE public.ai_trial_uses SET used = used + 1, updated_at = now()
  WHERE user_id = _uid AND bucket = _bucket AND used < _limit
  RETURNING true INTO _ok;
  RETURN COALESCE(_ok, false);
END; $$;
REVOKE ALL ON FUNCTION public.consume_ai_trial(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_trial(text) TO authenticated;