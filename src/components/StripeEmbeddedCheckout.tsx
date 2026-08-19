import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { startProCheckout } from "@/lib/billing.functions";

type Props = {
  priceId: string;
  returnUrl: string;
};

export function StripeEmbeddedCheckout({ priceId, returnUrl }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const result = await startProCheckout({
      data: { priceId, returnUrl, environment: getStripeEnvironment() },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Checkout did not return a client secret.");
    return result.clientSecret;
  };

  return (
    <div id="checkout" className="min-h-[420px]">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
