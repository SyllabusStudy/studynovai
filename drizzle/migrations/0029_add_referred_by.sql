ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by text;
CREATE INDEX IF NOT EXISTS profiles_referred_by_idx ON public.profiles (referred_by);