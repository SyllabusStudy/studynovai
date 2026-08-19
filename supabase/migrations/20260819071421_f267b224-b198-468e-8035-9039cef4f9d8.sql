CREATE TABLE public.subscriptions (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'inactive',
  paypal_subscription_id TEXT,
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.usage_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.usage_events TO authenticated;
GRANT ALL ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_select_own" ON public.usage_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "usage_insert_own" ON public.usage_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX usage_events_user_kind_time ON public.usage_events (user_id, kind, created_at DESC);

CREATE TABLE public.paypal_config (
  id TEXT NOT NULL PRIMARY KEY,
  product_id TEXT,
  plan_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT ALL ON public.paypal_config TO service_role;
ALTER TABLE public.paypal_config ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER paypal_config_touch BEFORE UPDATE ON public.paypal_config FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_pro(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND plan = 'pro'
      AND status IN ('active', 'trialing')
  )
$$;

CREATE OR REPLACE FUNCTION public.enforce_free_class_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  class_count INTEGER;
BEGIN
  IF public.is_pro(NEW.user_id) THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO class_count FROM public.classes WHERE user_id = NEW.user_id;
  IF class_count >= 3 THEN
    RAISE EXCEPTION 'Free plan is limited to 3 classes. Upgrade to Pro for unlimited classes.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER classes_free_limit BEFORE INSERT ON public.classes FOR EACH ROW EXECUTE FUNCTION public.enforce_free_class_limit();