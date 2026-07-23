import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import { useCloudAuth } from "@renderer/lib/auth-context";
import {
  type BillingPeriod,
  type CheckoutStatus,
  useCloudUsage,
} from "@renderer/lib/use-cloud-usage";
import { cn } from "@renderer/lib/utils";
import { Check, CircleCheck, Loader2, Mail } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router";

// ---------------------------------------------------------------------------
// Modal-state plumbing
// ---------------------------------------------------------------------------

interface UpgradeModalContextValue {
  /** Open the Upgrade-to-Pro modal from anywhere in the dashboard. */
  openUpgradeModal: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue | null>(
  null,
);

export function useUpgradeModal(): UpgradeModalContextValue {
  const ctx = useContext(UpgradeModalContext);
  if (!ctx) {
    throw new Error("useUpgradeModal must be used within UpgradeModalProvider");
  }
  return ctx;
}

/**
 * Hosts the upgrade modal once for the whole dashboard window and exposes
 * `openUpgradeModal()` via context. Also auto-opens when the route carries
 * `?upgrade=1` — the main process uses that to deep-link into the upsell from
 * native dialogs (e.g. the usage-limit prompt on the pill).
 */
export function UpgradeModalProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!searchParams.has("upgrade")) return;
    setOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("upgrade");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openUpgradeModal = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openUpgradeModal }), [openUpgradeModal]);

  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
      <UpgradeModal open={open} onOpenChange={setOpen} />
    </UpgradeModalContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Pricing content (mirrors freestylevoice.com/pricing)
// ---------------------------------------------------------------------------

const FREE_FEATURES = [
  "2,000 words per week on desktop",
  "Transcribe + Polish — full dictation",
  "History, dictionary, vocabulary, tone & plugins",
  "All languages",
  "Desktop & mobile apps",
  "Community support",
];

const PRO_FEATURES = [
  "Unlimited dictation",
  "Sync across all devices",
  "Agents & integrations (coming soon)",
  "Priority support",
];

const ENTERPRISE_FEATURES = [
  "Dedicated support channel",
  "Managed billing & audit logging",
  "Self-hosted or isolated hosting",
  "Fine-tuned by our team, for yours",
];

const SALES_MAILTO = "mailto:sales@freestylevoice.com";

function FeatureList({
  intro,
  features,
}: {
  intro?: string;
  features: string[];
}): React.JSX.Element {
  return (
    <div className="mt-3 flex-1">
      {intro ? (
        <p className="text-foreground mb-2 text-[12px] font-medium">{intro}</p>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {features.map((f) => (
          <li
            key={f}
            className="text-muted-foreground flex items-start gap-1.5 text-[12px] leading-snug"
          >
            <Check className="text-primary mt-0.5 size-3 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanCard({
  featured,
  children,
}: {
  featured?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[12px] border p-4",
        featured
          ? "border-primary/60 bg-primary/5 ring-primary/30 ring-1"
          : "border-border bg-background/50",
      )}
    >
      {children}
    </div>
  );
}

function PlanHeader({
  name,
  price,
  priceNote,
  badge,
}: {
  name: string;
  price: string;
  priceNote?: string;
  badge?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-foreground text-[13px] font-semibold">
          {name}
        </span>
        {badge}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="serif-italic text-foreground text-[26px] leading-none">
          {price}
        </span>
        {priceNote ? (
          <span className="text-muted-foreground text-[11px]">{priceNote}</span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing plans — the Free / Pro / Enterprise cards with a billing-period
// toggle. Shared by the upgrade modal and the Usage & Billing settings tab.
// The billing surface (checkout state, portal) is passed in so each host owns
// a single useCloudUsage instance rather than forking checkout state.
// ---------------------------------------------------------------------------

export interface PricingPlansProps {
  /** True when the user is already on Pro. */
  isPro: boolean;
  /** Current checkout lifecycle (drives the Pro button's busy/error states). */
  checkoutStatus: CheckoutStatus;
  /** Human-readable failure reason when checkoutStatus === "error". */
  checkoutError: string | null;
  /** Launch a Stripe Checkout for the given period. */
  startCheckout: (period: BillingPeriod) => void;
  /** Cancel a pending checkout and return the button to idle. */
  resetCheckout: () => void;
  /** Open the Stripe Billing Portal (Pro only). */
  openBillingPortal: () => void;
  /** True while the billing portal is being opened. */
  portalOpening: boolean;
}

export function PricingPlans({
  isPro,
  checkoutStatus,
  checkoutError,
  startCheckout,
  resetCheckout,
  openBillingPortal,
  portalOpening,
}: PricingPlansProps): React.JSX.Element {
  const [period, setPeriod] = useState<BillingPeriod>("annual");
  const checkoutBusy =
    checkoutStatus === "launching" || checkoutStatus === "pending";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">
        <SegmentedControl
          size="sm"
          value={period}
          onValueChange={(v) => setPeriod(v as BillingPeriod)}
          options={[
            { value: "monthly", label: "Monthly" },
            {
              value: "annual",
              label: (
                <span className="flex items-center gap-1.5">
                  Annual
                  <Badge
                    variant="secondary"
                    className="mono h-4 px-1.5 text-[9.5px]"
                  >
                    −25%
                  </Badge>
                </span>
              ),
            },
          ]}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* Free */}
        <PlanCard>
          <PlanHeader name="Free" price="$0" priceNote="forever" />
          <FeatureList features={FREE_FEATURES} />
          {!isPro ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              disabled
            >
              Current plan
            </Button>
          ) : null}
        </PlanCard>

        {/* Pro */}
        <PlanCard featured>
          <PlanHeader
            name="Pro"
            price={period === "annual" ? "$9" : "$12"}
            priceNote={
              period === "annual" ? "/ month, billed annually" : "/ month"
            }
            badge={
              isPro ? (
                <Badge className="mono h-4 px-1.5 text-[9.5px] uppercase tracking-[0.08em]">
                  Current
                </Badge>
              ) : (
                <Badge className="mono h-4 px-1.5 text-[9.5px] uppercase tracking-[0.08em]">
                  Popular
                </Badge>
              )
            }
          />
          <FeatureList
            intro="Everything in Free, plus:"
            features={PRO_FEATURES}
          />
          {isPro ? (
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="outline" size="sm" className="w-full" disabled>
                Current plan
              </Button>
              <Button
                size="sm"
                className="w-full"
                disabled={portalOpening}
                onClick={() => void openBillingPortal()}
              >
                {portalOpening ? <Loader2 className="animate-spin" /> : null}
                Manage subscription
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-1.5">
              <Button
                size="sm"
                className="w-full"
                disabled={checkoutBusy}
                onClick={() => void startCheckout(period)}
              >
                {checkoutBusy ? <Loader2 className="animate-spin" /> : null}
                {checkoutStatus === "launching"
                  ? "Opening checkout…"
                  : checkoutStatus === "pending"
                    ? "Waiting for payment…"
                    : "Upgrade to Pro"}
              </Button>
              {checkoutStatus === "pending" ? (
                <>
                  <p className="text-muted-foreground text-center text-[11px] leading-snug">
                    Finish paying in your browser.
                  </p>
                  <button
                    type="button"
                    onClick={() => resetCheckout()}
                    className="text-muted-foreground hover:text-foreground mx-auto text-[11px] underline underline-offset-2 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : null}
              {checkoutStatus === "error" && checkoutError ? (
                <p className="text-destructive text-center text-[11px] leading-snug">
                  {checkoutError}
                </p>
              ) : null}
            </div>
          )}
        </PlanCard>

        {/* Enterprise */}
        <PlanCard>
          <PlanHeader
            name="Enterprise"
            price="from $20"
            priceNote="/ user / month"
          />
          <FeatureList
            intro="Everything in Pro, plus:"
            features={ENTERPRISE_FEATURES}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => void window.api.openExternal(SALES_MAILTO)}
          >
            <Mail />
            Contact sales
          </Button>
        </PlanCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function UpgradeModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const { user } = useCloudAuth();
  const {
    isPro,
    startCheckout,
    checkoutStatus,
    checkoutError,
    resetCheckout,
    openBillingPortal,
    portalOpening,
  } = useCloudUsage(!!user);

  const close = useCallback(() => {
    onOpenChange(false);
    // A finished (or failed) checkout shouldn't leak into the next open; a
    // still-pending one keeps polling so reopening shows its progress.
    if (checkoutStatus === "success" || checkoutStatus === "error") {
      resetCheckout();
    }
  }, [onOpenChange, checkoutStatus, resetCheckout]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent className="sm:max-w-3xl">
        {checkoutStatus === "success" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CircleCheck className="text-primary size-10" />
            <DialogTitle className="text-[18px] font-semibold">
              You're Pro!
            </DialogTitle>
            <DialogDescription className="max-w-xs text-[13px]">
              Unlimited dictation is now active on this device. Thanks for
              supporting Freestyle.
            </DialogDescription>
            <Button className="mt-2 min-w-32" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <DialogTitle className="text-[18px] font-semibold">
                Upgrade to Freestyle Pro
              </DialogTitle>
              <DialogDescription className="text-[12.5px]">
                Unlimited dictation, synced everywhere you work.
              </DialogDescription>
            </div>

            <PricingPlans
              isPro={isPro}
              checkoutStatus={checkoutStatus}
              checkoutError={checkoutError}
              startCheckout={startCheckout}
              resetCheckout={resetCheckout}
              openBillingPortal={openBillingPortal}
              portalOpening={portalOpening}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
