/** Live Pro pricing for the browser, straight from the database. */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PRICING, mapPricing, PRICING_COLUMNS, type PricingRow } from "./pricing";

export function usePricing() {
  const { data } = useQuery({
    queryKey: ["pricing"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: row } = await supabase
        .from("pricing_settings")
        .select(PRICING_COLUMNS)
        .maybeSingle();
      return mapPricing(row as PricingRow | null);
    },
  });
  return data ?? DEFAULT_PRICING;
}
