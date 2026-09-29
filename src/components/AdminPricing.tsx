import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Loader2, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addPromoCode,
  getPricingAdmin,
  removePromoCode,
  saveProPricing,
  togglePromoCode,
} from "@/lib/pricing.functions";
import { money, savingsPercent, type PricingSettings } from "@/lib/pricing";
import { getStripeEnvironment } from "@/lib/stripe";

function safeEnvironment() {
  try {
    return getStripeEnvironment();
  } catch {
    return "sandbox" as const;
  }
}

export function AdminPricing() {
  const qc = useQueryClient();
  const load = useServerFn(getPricingAdmin);
  const save = useServerFn(saveProPricing);
  const create = useServerFn(addPromoCode);
  const toggle = useServerFn(togglePromoCode);
  const remove = useServerFn(removePromoCode);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: () => load({}),
  });

  const [price, setPrice] = useState("");
  const [compare, setCompare] = useState("");
  const [saleActive, setSaleActive] = useState(false);
  const [saleLabel, setSaleLabel] = useState("Limited-time offer");
  const [saleNote, setSaleNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data?.pricing) return;
    setPrice(String(data.pricing.priceUsd));
    setCompare(data.pricing.comparePriceUsd === null ? "" : String(data.pricing.comparePriceUsd));
    setSaleActive(data.pricing.saleActive);
    setSaleLabel(data.pricing.saleLabel);
    setSaleNote(data.pricing.saleNote ?? "");
  }, [data?.pricing]);

  const preview: PricingSettings = {
    priceUsd: Number(price) || 0,
    comparePriceUsd: compare.trim() === "" ? null : Number(compare) || null,
    saleActive,
    saleLabel: saleLabel.trim() || "Limited-time offer",
    saleNote: saleNote.trim() || null,
  };
  const savings = savingsPercent(preview);

  async function submitPricing() {
    const priceUsd = Number(price);
    if (!Number.isFinite(priceUsd) || priceUsd < 0.5) {
      toast.error("Enter a price of at least $0.50.");
      return;
    }
    const comparePriceUsd = compare.trim() === "" ? null : Number(compare);
    if (saleActive && (!comparePriceUsd || comparePriceUsd <= priceUsd)) {
      toast.error("The 'was' price has to be higher than the new price.");
      return;
    }
    setSaving(true);
    try {
      const res = await save({
        data: {
          environment: safeEnvironment(),
          priceUsd,
          comparePriceUsd,
          saleActive,
          saleLabel: saleLabel.trim(),
          saleNote: saleNote.trim() || null,
        },
      });
      await qc.invalidateQueries({ queryKey: ["admin-pricing"] });
      await qc.invalidateQueries({ queryKey: ["pricing"] });
      if (res.checkoutNote) {
        toast.warning(`Saved, but payment checkout still charges the old amount: ${res.checkoutNote}`);
      } else {
        toast.success("Pricing updated.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save pricing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load pricing."}
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="surface-card space-y-4 p-5">
              <div>
                <p className="text-sm font-semibold">Pro price</p>
                <p className="text-xs text-muted-foreground">
                  This is what students see and what their card is charged each month.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pro-price">Price per month ($)</Label>
                  <Input
                    id="pro-price"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="5.99"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pro-compare">Show as crossed out ($)</Label>
                  <Input
                    id="pro-compare"
                    inputMode="decimal"
                    value={compare}
                    onChange={(e) => setCompare(e.target.value)}
                    placeholder="9.99"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0 pr-3">
                  <p className="text-sm font-semibold">Show it as a sale</p>
                  <p className="text-xs text-muted-foreground">
                    Adds a sale badge and the crossed-out old price.
                  </p>
                </div>
                <Switch checked={saleActive} onCheckedChange={setSaleActive} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sale-label">Sale badge</Label>
                  <Input
                    id="sale-label"
                    value={saleLabel}
                    onChange={(e) => setSaleLabel(e.target.value)}
                    placeholder="Limited-time offer"
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sale-note">Small print (optional)</Label>
                  <Input
                    id="sale-note"
                    value={saleNote}
                    onChange={(e) => setSaleNote(e.target.value)}
                    placeholder="Ends at the end of the month"
                    maxLength={160}
                  />
                </div>
              </div>

              <Button disabled={saving} onClick={() => void submitPricing()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save pricing
              </Button>
            </div>

            <div className="surface-card space-y-3 p-5">
              <p className="text-xs font-semibold text-muted-foreground">What students will see</p>
              <div className="rounded-xl border border-primary/40 p-4 ring-1 ring-primary/20">
                {preview.saleActive ? (
                  <span className="inline-block rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {preview.saleLabel}
                    {savings ? ` · save ${savings}%` : ""}
                  </span>
                ) : null}
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
                  <Crown className="size-4 text-primary" /> Pro
                </p>
                <p className="mt-1 flex flex-wrap items-baseline gap-2">
                  {preview.saleActive && preview.comparePriceUsd ? (
                    <span className="text-base text-muted-foreground line-through">
                      {money(preview.comparePriceUsd)}
                    </span>
                  ) : null}
                  <span className="text-2xl font-bold">{money(preview.priceUsd)}</span>
                  <span className="text-sm font-normal text-muted-foreground">/month</span>
                </p>
                {preview.saleNote ? (
                  <p className="mt-2 text-xs text-muted-foreground">{preview.saleNote}</p>
                ) : null}
              </div>
            </div>
          </div>

          <PromoCodes
            codes={data?.codes ?? []}
            onCreate={async (input) => {
              await create({ data: { environment: safeEnvironment(), ...input } });
              await qc.invalidateQueries({ queryKey: ["admin-pricing"] });
            }}
            onToggle={async (id, active) => {
              await toggle({ data: { id, active } });
              await qc.invalidateQueries({ queryKey: ["admin-pricing"] });
            }}
            onRemove={async (id) => {
              await remove({ data: { id } });
              await qc.invalidateQueries({ queryKey: ["admin-pricing"] });
            }}
          />
        </>
      )}
    </div>
  );
}

type CodeRow = {
  id: string;
  code: string;
  label: string | null;
  kind: string;
  percent_off: number | null;
  active: boolean;
  max_redemptions: number | null;
  redemptions: number;
  expires_at: string | null;
};

type NewCode = {
  code: string;
  label: string | null;
  kind: "free_pro" | "percent";
  percentOff: number | null;
  maxRedemptions: number | null;
  expiresAt: string | null;
};

function PromoCodes({
  codes,
  onCreate,
  onToggle,
  onRemove,
}: {
  codes: CodeRow[];
  onCreate: (input: NewCode) => Promise<void>;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"free_pro" | "percent">("percent");
  const [percent, setPercent] = useState("50");
  const [uses, setUses] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (code.trim().replace(/[^a-zA-Z0-9]/g, "").length < 3) {
      toast.error("Use at least 3 letters or numbers for the code.");
      return;
    }
    setBusy(true);
    try {
      await onCreate({
        code: code.trim(),
        label: label.trim() || null,
        kind,
        percentOff: kind === "percent" ? Number(percent) || null : null,
        maxRedemptions: uses.trim() === "" ? null : Number(uses),
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      });
      setCode("");
      setLabel("");
      setUses("");
      setExpires("");
      toast.success("Promo code created.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create that code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface-card space-y-4 p-5">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Tag className="size-4 text-primary" /> Promo codes
        </p>
        <p className="text-xs text-muted-foreground">
          Percent-off codes are typed in at payment. Free Pro codes unlock Pro right away on the
          Upgrade page.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="promo-code">Code</Label>
          <Input
            id="promo-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="FINALS50"
            maxLength={40}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="promo-kind">What it does</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as "free_pro" | "percent")}>
            <SelectTrigger id="promo-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Discount off the price</SelectItem>
              <SelectItem value="free_pro">Free Pro access</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {kind === "percent" ? (
          <div className="space-y-1.5">
            <Label htmlFor="promo-percent">Discount (%)</Label>
            <Input
              id="promo-percent"
              inputMode="numeric"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="50"
            />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="promo-label">Name (optional)</Label>
          <Input
            id="promo-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Finals week deal"
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="promo-uses">Max uses (optional)</Label>
          <Input
            id="promo-uses"
            inputMode="numeric"
            value={uses}
            onChange={(e) => setUses(e.target.value)}
            placeholder="Unlimited"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="promo-expires">Last day (optional)</Label>
          <Input
            id="promo-expires"
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </div>
      </div>

      <Button variant="secondary" disabled={busy} onClick={() => void submit()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Create code
      </Button>

      {codes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No promo codes yet.</p>
      ) : (
        <div className="space-y-2">
          {codes.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {c.code}
                  {c.active ? null : (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(off)</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.kind === "percent" ? `${c.percent_off ?? 0}% off` : "Free Pro access"}
                  {c.label ? ` · ${c.label}` : ""}
                  {" · used "}
                  {c.redemptions}
                  {c.max_redemptions ? `/${c.max_redemptions}` : ""}
                  {c.expires_at ? ` · ends ${new Date(c.expires_at).toLocaleDateString()}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={c.active}
                  aria-label={`Turn ${c.code} ${c.active ? "off" : "on"}`}
                  onCheckedChange={(v) => {
                    void onToggle(c.id, v).catch((e) =>
                      toast.error(e instanceof Error ? e.message : "Could not update that code."),
                    );
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${c.code}`}
                  onClick={() => {
                    if (!window.confirm(`Delete promo code ${c.code}?`)) return;
                    void onRemove(c.id).catch((e) =>
                      toast.error(e instanceof Error ? e.message : "Could not delete that code."),
                    );
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
