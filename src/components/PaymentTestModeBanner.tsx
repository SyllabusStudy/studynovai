const clientToken = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
        Real payments aren't configured yet. Finish payment go-live to accept live cards.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-center text-sm text-warning-foreground">
        Payments in the preview are in test mode — use card 4242 4242 4242 4242.
      </div>
    );
  }
  return null;
}
