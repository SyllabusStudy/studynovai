ALTER TABLE public.shared_items DROP CONSTRAINT shared_items_kind_check;
ALTER TABLE public.shared_items ADD CONSTRAINT shared_items_kind_check CHECK (kind = ANY (ARRAY['deck','quiz','note']));