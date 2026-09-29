-- Owner-controlled Pro pricing display + sale banner (single row)
CREATE TABLE public.pricing_settings (
  id boolean PRIMARY KEY DEFAULT true,
  price_usd numeric(10,2) NOT NULL DEFAULT 5.99,
  compare_price_usd numeric(10,2),
  sale_active boolean NOT NULL DEFAULT false,
  sale_label text NOT NULL DEFAULT 'Limited-time offer',
  sale_note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_settings_singleton CHECK (id)
);

GRANT SELECT ON public.pricing_settings TO authenticated;
GRANT SELECT ON public.pricing_settings TO anon;
GRANT ALL ON public.pricing_settings TO service_role;

ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read pricing"
ON public.pricing_settings FOR SELECT
USING (true);

INSERT INTO public.pricing_settings (id, price_usd) VALUES (true, 5.99);

-- Owner-created promo codes
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text,
  kind text NOT NULL DEFAULT 'free_pro',
  percent_off integer,
  active boolean NOT NULL DEFAULT true,
  max_redemptions integer,
  redemptions integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  stripe_promotion_code_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.promo_codes TO service_role;

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: codes are only read through trusted server code.

CREATE INDEX promo_codes_active_idx ON public.promo_codes (active);

-- Which student redeemed which code (prevents double counting)
CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promo_code_id, user_id)
);

GRANT ALL ON public.promo_redemptions TO service_role;

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX promo_redemptions_user_idx ON public.promo_redemptions (user_id);