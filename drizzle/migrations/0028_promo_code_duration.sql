ALTER TABLE public.promo_codes ADD COLUMN duration_days integer;
COMMENT ON COLUMN public.promo_codes.duration_days IS 'Free Pro length in days; NULL = lifetime. Timed codes are one use per student.';