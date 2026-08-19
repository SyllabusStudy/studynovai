REVOKE ALL ON FUNCTION public.is_pro(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_free_class_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro(UUID) TO service_role;