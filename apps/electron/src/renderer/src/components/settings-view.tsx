import {
  filterLanguageOptions,
  INDUSTRY_LABELS,
  type Industry,
  industrySchema,
  MAX_LANGUAGES,
  normalizeLanguageList,
  resolveLanguageOptions,
} from "@freestyle-voice/validations";
import { BrainFiles } from "@renderer/components/brain-files";
import { NotificationsHistory } from "@renderer/components/notifications-history";
import {
  acceleratorsEqual,
  formatAcceleratorKeys,
  useHotkeyRecorder,
} from "@renderer/hooks/use-hotkey-recorder";
import { apiFetch } from "@renderer/lib/api";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { LANGUAGES } from "@renderer/lib/languages";
import { useCloudConfig } from "@renderer/lib/use-cloud-config";
import { usagePercent, useCloudUsage } from "@renderer/lib/use-cloud-usage";
import { usePricing } from "@renderer/lib/use-pricing";
import {
  type SocialProvider,
  useLinkedAccounts,
  useLinkSocial,
  useProfileFields,
  useRefreshAccountsOnFocus,
  useUnlinkSocial,
  useUpdateName,
  useUpdateProfileFields,
} from "@renderer/lib/use-profile";
import { SpriteBadge } from "@renderer/sprites/badge";
import {
  type CompanionForm,
  DEFAULT_COMPANION_FORM,
  parseCompanionForm,
} from "@shared/companion";
import { getDefaultHotkey } from "@shared/hotkey-defaults";
import { getDefaultRemixHotkey } from "@shared/remix";
import { SETTINGS_KEYS } from "@shared/settings-keys";
import { SPRITES_INFO } from "@shared/sprites";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SettingsPage =
  | "root"
  | "profile"
  | "billing"
  | "brain"
  | "notifications"
  | "dictation"
  | "talk"
  | "application"
  | "permissions"
  | "data";

const PAGE_TITLES: Record<Exclude<SettingsPage, "root">, string> = {
  profile: "Profile",
  billing: "Billing & Usage",
  brain: "Brain",
  notifications: "Notifications",
  dictation: "Dictation",
  talk: "Talk & Summon",
  application: "Application",
  permissions: "Permissions",
  data: "Data",
};

function useServerSettings(): {
  settings: Record<string, string> | null;
  setSetting: (key: string, value: string) => void;
} {
  const [settings, setSettings] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    void apiFetch("/api/settings")
      .then(async (res) => (res.ok ? await res.json() : {}))
      .catch(() => ({}))
      .then((data) => setSettings(data as Record<string, string>));
  }, []);

  const setSetting = useCallback((key: string, value: string): void => {
    setSettings((prev) => ({ ...(prev ?? {}), [key]: value }));
    void apiFetch(`/api/settings/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    })
      .then(() => window.api.reloadDictationPrefs())
      .catch(() => {});
  }, []);

  return { settings, setSetting };
}

function NavRow({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail?: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button type="button" className="tavern-set-row" onClick={onClick}>
      <span className="tavern-set-label">{label}</span>
      <span className="tavern-set-detail">
        {detail ? `${detail} ` : ""}
        <span className="tavern-set-chevron">›</span>
      </span>
    </button>
  );
}

function ChoiceRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      <div className="tavern-set-seg">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`tavern-set-seg-btn${value === opt.id ? " is-on" : ""}`}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        className={`tavern-set-switch${on ? " is-on" : ""}`}
        onClick={() => onChange(!on)}
      >
        <span className="tavern-set-knob" />
      </button>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      <span className="tavern-set-detail">{value}</span>
    </div>
  );
}

function ActionRow({
  label,
  action,
  pending,
  danger,
  onClick,
}: {
  label: string;
  action: string;
  pending?: boolean;
  danger?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      <button
        type="button"
        className={`tavern-set-action${danger ? " is-danger" : ""}`}
        disabled={pending}
        onClick={onClick}
      >
        {action}
      </button>
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      <select
        className="tavern-set-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value || "__default__"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SectionLabel({ children }: { children: string }): React.JSX.Element {
  return <div className="tavern-set-section">{children}</div>;
}

function HotkeyRow({
  label,
  accel,
  target,
  isBlocked,
  onSaved,
}: {
  label: string;
  accel: string;
  target: "dictation" | "remix";
  isBlocked: (accel: string) => boolean;
  onSaved: (accel: string) => void;
}): React.JSX.Element {
  const recorder = useHotkeyRecorder(onSaved, { target, isBlocked });
  const recording = recorder.state !== "idle";

  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      {recording ? (
        <span className="tavern-set-keys is-recording">
          {recorder.liveModifiers.length > 0
            ? recorder.liveModifiers.join(" + ")
            : "Press keys…"}
          {recorder.blockedNotice ? " · already taken" : ""}
          {recorder.needsModifierOrMouseButton ? " · add a modifier" : ""}
          <button
            type="button"
            className="tavern-set-keys-cancel"
            onClick={() => recorder.cancelRecording()}
          >
            ×
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="tavern-set-keys"
          onClick={() => recorder.startRecording()}
        >
          {formatAcceleratorKeys(accel).map((k) => (
            <kbd key={k} className="tavern-kbd">
              {k}
            </kbd>
          ))}
          <span className="tavern-set-keys-change">Change</span>
        </button>
      )}
    </div>
  );
}

function AccountCard({
  onOpenProfile,
}: {
  onOpenProfile: () => void;
}): React.JSX.Element {
  const auth = useCloudAuth();
  const usage = useCloudUsage(!!auth.user);

  if (auth.user) {
    return (
      <button
        type="button"
        className="tavern-set-card is-clickable"
        onClick={onOpenProfile}
      >
        <div className="tavern-set-profile">
          {auth.user.image ? (
            <img
              className="tavern-set-avatar"
              src={auth.user.image}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="tavern-set-avatar is-empty">
              {(auth.user.name || auth.user.email)[0]?.toUpperCase()}
            </span>
          )}
          <div className="tavern-set-profile-text">
            <div className="tavern-set-card-title">
              {auth.user.name || "Signed in"}
              <span
                className={`tavern-set-plan${usage.isPro ? " is-pro" : ""}`}
              >
                {usage.isPro ? "Pro" : "Free"}
              </span>
            </div>
            <div className="tavern-set-card-sub">{auth.user.email}</div>
          </div>
          <span className="tavern-set-chevron">›</span>
        </div>
      </button>
    );
  }

  return (
    <div className="tavern-set-card">
      <div className="tavern-set-card-title">Sign in to Freestyle</div>
      <div className="tavern-set-card-sub">
        {auth.signingIn && auth.userCode
          ? `Your code: ${auth.userCode} — finish in the browser.`
          : "Chat, dictation cleanup, and the brain all need your account."}
      </div>
      <div className="tavern-approve-actions">
        {auth.signingIn ? (
          <button
            type="button"
            className="tavern-approve-btn"
            onClick={() => auth.cancelSignIn()}
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="tavern-approve-btn tavern-approve-allow"
            onClick={() => void auth.signIn()}
          >
            Sign in
          </button>
        )}
      </div>
      {auth.error ? <p className="tavern-notice">{auth.error}</p> : null}
    </div>
  );
}

function SignedOutHint(): React.JSX.Element {
  return (
    <p className="tavern-set-hint">
      Sign in from the Settings home to manage this.
    </p>
  );
}

function NameEditor(): React.JSX.Element {
  const auth = useCloudAuth();
  const updateName = useUpdateName();
  const currentName = auth.user?.name ?? "";
  const [name, setName] = useState(currentName);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const trimmed = name.trim();
  const dirty = trimmed !== currentName.trim();

  const save = (): void => {
    if (!dirty || !trimmed) return;
    setSaved(false);
    updateName
      .mutateAsync(trimmed)
      .then(() => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="tavern-set-field">
      <label className="tavern-set-field-label" htmlFor="tavern-profile-name">
        Name
      </label>
      <div className="tavern-set-field-line">
        <input
          id="tavern-profile-name"
          className="tavern-set-input"
          value={name}
          maxLength={120}
          placeholder="Your name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              e.stopPropagation();
              setName(currentName);
            }
          }}
        />
        {dirty ? (
          <button
            type="button"
            className="tavern-set-action"
            disabled={!trimmed || updateName.isPending}
            onClick={save}
          >
            {updateName.isPending ? "Saving…" : "Save"}
          </button>
        ) : saved ? (
          <span className="tavern-set-saved">✓ Saved</span>
        ) : null}
      </div>
      {updateName.isError ? (
        <p className="tavern-notice">
          {updateName.error instanceof Error
            ? updateName.error.message
            : "Could not update name"}
        </p>
      ) : null}
    </div>
  );
}

const NO_INDUSTRY = "";

function ProfessionalDetails(): React.JSX.Element {
  const { data: profile } = useProfileFields(true);
  const updateProfile = useUpdateProfileFields();
  const [industry, setIndustry] = useState<Industry | "">("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [reseed, setReseed] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const parsed = industrySchema.safeParse(profile.industry);
    setIndustry(parsed.success ? parsed.data : "");
    setJobTitle(profile.jobTitle ?? "");
    setCompany(profile.company ?? "");
    setReseed(true);
  }, [profile]);

  const savedIndustry = industrySchema.safeParse(profile?.industry).success
    ? (profile?.industry as Industry)
    : "";
  const industryWillChange = industry !== savedIndustry && industry !== "";
  const dirty =
    industry !== savedIndustry ||
    jobTitle.trim() !== (profile?.jobTitle ?? "") ||
    company.trim() !== (profile?.company ?? "");

  const save = (): void => {
    if (!dirty) return;
    setSaved(false);
    updateProfile
      .mutateAsync({
        industry: industry === "" ? null : industry,
        jobTitle: jobTitle.trim() || null,
        company: company.trim() || null,
        updatePreferences: reseed,
      })
      .then(() => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <>
      <SectionLabel>Professional details</SectionLabel>
      <div className="tavern-set-field">
        <label
          className="tavern-set-field-label"
          htmlFor="tavern-profile-industry"
        >
          Industry
        </label>
        <select
          id="tavern-profile-industry"
          className="tavern-set-select is-wide"
          value={industry}
          onChange={(e) => setIndustry(e.target.value as Industry | "")}
        >
          <option value={NO_INDUSTRY}>Not specified</option>
          {industrySchema.options.map((value) => (
            <option key={value} value={value}>
              {INDUSTRY_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div className="tavern-set-field">
        <label className="tavern-set-field-label" htmlFor="tavern-profile-job">
          Job title
        </label>
        <input
          id="tavern-profile-job"
          className="tavern-set-input"
          value={jobTitle}
          maxLength={120}
          placeholder="e.g. Product Manager"
          onChange={(e) => setJobTitle(e.target.value)}
        />
      </div>
      <div className="tavern-set-field">
        <label
          className="tavern-set-field-label"
          htmlFor="tavern-profile-company"
        >
          Company
        </label>
        <input
          id="tavern-profile-company"
          className="tavern-set-input"
          value={company}
          maxLength={120}
          placeholder="e.g. Acme Inc."
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>
      {industryWillChange ? (
        <ToggleRow
          label="Refresh tone & vocabulary for this industry"
          on={reseed}
          onChange={setReseed}
        />
      ) : null}
      {dirty ? (
        <button
          type="button"
          className="tavern-approve-btn tavern-approve-allow"
          disabled={updateProfile.isPending}
          onClick={save}
        >
          {updateProfile.isPending ? "Saving…" : "Save changes"}
        </button>
      ) : saved ? (
        <span className="tavern-set-saved">✓ Saved</span>
      ) : null}
      {updateProfile.isError ? (
        <p className="tavern-notice">
          {updateProfile.error instanceof Error
            ? updateProfile.error.message
            : "Could not update profile"}
        </p>
      ) : null}
    </>
  );
}

const PROVIDERS: Array<{ id: SocialProvider; label: string }> = [
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
];

function ConnectedAccounts(): React.JSX.Element {
  const { data: linked, isLoading } = useLinkedAccounts(true);
  const linkSocial = useLinkSocial();
  const unlinkSocial = useUnlinkSocial();
  useRefreshAccountsOnFocus(true);

  const connectedCount = linked?.length ?? 0;

  return (
    <>
      <SectionLabel>Connected accounts</SectionLabel>
      {isLoading ? (
        <p className="tavern-set-hint">Loading…</p>
      ) : (
        PROVIDERS.map((provider) => {
          const isConnected = linked?.includes(provider.id) ?? false;
          const busy =
            (linkSocial.isPending && linkSocial.variables === provider.id) ||
            (unlinkSocial.isPending && unlinkSocial.variables === provider.id);
          const lastMethod = isConnected && connectedCount <= 1;
          return (
            <div key={provider.id} className="tavern-set-row is-static">
              <span className="tavern-set-label">
                {provider.label}
                {isConnected ? (
                  <span className="tavern-set-check is-ok">✓</span>
                ) : null}
              </span>
              <button
                type="button"
                className="tavern-set-action"
                disabled={busy || lastMethod}
                title={lastMethod ? "Your only sign-in method" : undefined}
                onClick={() =>
                  isConnected
                    ? unlinkSocial.mutate(provider.id)
                    : linkSocial.mutate(provider.id)
                }
              >
                {busy ? "…" : isConnected ? "Disconnect" : "Connect"}
              </button>
            </div>
          );
        })
      )}
    </>
  );
}

function ProfilePage(): React.JSX.Element {
  const auth = useCloudAuth();
  if (!auth.user) return <SignedOutHint />;

  return (
    <>
      <div className="tavern-set-profile">
        {auth.user.image ? (
          <img
            className="tavern-set-avatar"
            src={auth.user.image}
            alt=""
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="tavern-set-avatar is-empty">
            {(auth.user.name || auth.user.email)[0]?.toUpperCase()}
          </span>
        )}
        <div className="tavern-set-profile-text">
          <div className="tavern-set-card-title">
            {auth.user.name || "Signed in"}
          </div>
          <div className="tavern-set-card-sub">{auth.user.email}</div>
        </div>
      </div>
      <NameEditor />
      <ProfessionalDetails />
      <ConnectedAccounts />
      <SectionLabel>Session</SectionLabel>
      <button
        type="button"
        className="tavern-approve-btn"
        onClick={() => void auth.signOut()}
      >
        Sign out
      </button>
    </>
  );
}

function BillingPage(): React.JSX.Element {
  const auth = useCloudAuth();
  const usage = useCloudUsage(!!auth.user);
  const pricing = usePricing();
  const [period, setPeriod] = useState<"monthly" | "annual">("annual");

  if (!auth.user) return <SignedOutHint />;

  const balance = usage.balance;
  const pct = balance ? usagePercent(balance) : 0;
  const resetsLabel = balance?.resetsAt
    ? new Date(balance.resetsAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <>
      <div className="tavern-set-card">
        <div className="tavern-set-usage-head">
          <span className="tavern-set-section is-tight">This week</span>
          <button
            type="button"
            className="tavern-set-refresh"
            onClick={() => usage.refresh()}
          >
            {usage.isFetching ? "…" : "↻"}
          </button>
        </div>
        {usage.isPro ? (
          <div className="tavern-set-card-title">
            Unlimited
            <span className="tavern-set-plan is-pro">Pro</span>
          </div>
        ) : balance ? (
          <div className="tavern-set-usage">
            <div className="tavern-set-card-title">
              {balance.remaining.toLocaleString()}
              <span className="tavern-set-card-sub">
                {" "}
                / {balance.limit.toLocaleString()} words left
              </span>
            </div>
            <div className="tavern-set-usage-bar">
              <span style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span className="tavern-set-card-sub">
              {pct}% used{resetsLabel ? ` · resets ${resetsLabel}` : ""}
            </span>
          </div>
        ) : (
          <div className="tavern-set-card-sub">
            Usage is unavailable right now.
          </div>
        )}
      </div>

      <SectionLabel>Plan</SectionLabel>
      {usage.isPro ? (
        <InfoRow label="Freestyle Pro" value="Unlimited words" />
      ) : (
        <>
          <div className="tavern-plan-picker">
            {(
              [
                {
                  id: "annual",
                  name: "Annual",
                  price: pricing.annual.display,
                  note: "billed yearly",
                  badge:
                    pricing.monthly.amount > pricing.annual.amount
                      ? `Save ${Math.round((1 - pricing.annual.amount / pricing.monthly.amount) * 100)}%`
                      : null,
                },
                {
                  id: "monthly",
                  name: "Monthly",
                  price: pricing.monthly.display,
                  note: "billed monthly",
                  badge: null,
                },
              ] as const
            ).map((plan) => (
              <button
                key={plan.id}
                type="button"
                className={`tavern-plan${period === plan.id ? " is-on" : ""}`}
                onClick={() => setPeriod(plan.id)}
              >
                <span className="tavern-plan-name">
                  {plan.name}
                  {plan.badge ? (
                    <span className="tavern-plan-badge">{plan.badge}</span>
                  ) : null}
                </span>
                <span className="tavern-plan-price">
                  {plan.price}
                  <span className="tavern-plan-per">/mo</span>
                </span>
                <span className="tavern-plan-note">{plan.note}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="tavern-approve-btn tavern-approve-allow"
            disabled={usage.checkoutStatus === "pending"}
            onClick={() => void usage.startCheckout(period)}
          >
            {usage.checkoutStatus === "pending"
              ? "Finish in browser…"
              : "Upgrade to Pro"}
          </button>
          {usage.checkoutStatus === "pending" ? (
            <button
              type="button"
              className="tavern-approve-btn"
              onClick={() => usage.resetCheckout()}
            >
              Cancel
            </button>
          ) : null}
        </>
      )}
      <button
        type="button"
        className="tavern-approve-btn"
        disabled={usage.portalOpening}
        onClick={() => void usage.openBillingPortal()}
      >
        {usage.portalOpening ? "Opening…" : "Manage billing ↗"}
      </button>
      {usage.checkoutError ? (
        <p className="tavern-notice">{usage.checkoutError}</p>
      ) : null}
    </>
  );
}

function parseLanguages(
  raw: string | undefined,
  legacy: string | undefined,
): string[] {
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr))
        return arr.filter(
          (x): x is string => typeof x === "string" && x !== "auto",
        );
    } catch {}
  }
  if (legacy && legacy !== "auto") return [legacy];
  return [];
}

function LanguagesEditor({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}): React.JSX.Element {
  const auth = useCloudAuth();
  const { data: cloudConfig } = useCloudConfig(!!auth.user);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const options = useMemo(
    () =>
      resolveLanguageOptions(cloudConfig?.suggestedLanguages, [
        { code: "auto", label: "Auto-detect" },
        ...LANGUAGES.map((l) => ({ code: l.id, label: l.label })),
      ]),
    [cloudConfig?.suggestedLanguages],
  );

  const labelFor = (code: string): string =>
    options.find((o) => o.code === code)?.label ?? code;

  const matches = useMemo(
    () =>
      filterLanguageOptions(options, query).filter(
        (o) => !selected.includes(o.code),
      ),
    [options, query, selected],
  );

  const add = (code: string): void => {
    setAdding(false);
    setQuery("");
    if (code === "auto") {
      onChange([]);
      return;
    }
    onChange([...selected, code].slice(0, MAX_LANGUAGES));
  };

  return (
    <div className="tavern-set-langs">
      <div className="tavern-set-chips">
        {selected.length === 0 ? (
          <span className="tavern-set-chip is-auto">Auto-detect</span>
        ) : (
          selected.map((code) => (
            <span key={code} className="tavern-set-chip">
              {labelFor(code)}
              <button
                type="button"
                className="tavern-set-chip-x"
                aria-label={`Remove ${labelFor(code)}`}
                onClick={() => onChange(selected.filter((c) => c !== code))}
              >
                ×
              </button>
            </span>
          ))
        )}
        {selected.length < MAX_LANGUAGES ? (
          <button
            type="button"
            className="tavern-set-chip is-add"
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? "Done" : "+ Add"}
          </button>
        ) : null}
      </div>
      {adding ? (
        <div className="tavern-set-addlist">
          <input
            ref={(el) => el?.focus()}
            className="tavern-set-input"
            value={query}
            placeholder="Search languages"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setAdding(false);
                setQuery("");
              }
            }}
          />
          <div className="tavern-set-addlist-body">
            {matches.slice(0, 30).map((o) => (
              <button
                key={o.code}
                type="button"
                className="tavern-set-addlist-row"
                onClick={() => add(o.code)}
              >
                {o.label}
              </button>
            ))}
            {matches.length === 0 ? (
              <span className="tavern-set-hint">No matches</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MicrophoneRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (deviceId: string) => void;
}): React.JSX.Element {
  const [devices, setDevices] = useState<
    Array<{ deviceId: string; label: string }>
  >([]);

  useEffect(() => {
    void (async () => {
      try {
        const status = await window.api.checkMicPermission();
        if (status !== "granted") return;
        let inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "audioinput",
        );
        if (inputs.some((d) => !d.label)) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          for (const t of stream.getTracks()) t.stop();
          inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) => d.kind === "audioinput",
          );
        }
        setDevices(
          inputs.map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`,
          })),
        );
      } catch {}
    })();
  }, []);

  return (
    <SelectRow
      label="Microphone"
      value={value}
      options={[
        { value: "", label: "System default" },
        ...devices.map((d) => ({ value: d.deviceId, label: d.label })),
      ]}
      onChange={onChange}
    />
  );
}

function DictationPage({
  value,
  setSetting,
}: {
  value: (key: string, fallback?: string) => string;
  setSetting: (key: string, value: string) => void;
}): React.JSX.Element {
  const languages = parseLanguages(
    value(SETTINGS_KEYS.languages),
    value(SETTINGS_KEYS.language),
  );
  const translateOn = value(SETTINGS_KEYS.translateMode) === "true";

  const setLanguages = (next: string[]): void => {
    const normalized = normalizeLanguageList(next);
    setSetting(SETTINGS_KEYS.languages, JSON.stringify(normalized));
    if (normalized.length !== 1 && translateOn)
      setSetting(SETTINGS_KEYS.translateMode, "false");
  };

  return (
    <>
      <p className="tavern-set-hint is-lead">
        Dictation types for you. Hold the hotkey in any app, speak, and let go —
        your words are cleaned up and typed right where your cursor is.
      </p>
      <HotkeyRow
        label="Hotkey"
        accel={value(SETTINGS_KEYS.hotkey) || getDefaultHotkey()}
        target="dictation"
        isBlocked={(accel) =>
          acceleratorsEqual(
            accel,
            value(SETTINGS_KEYS.remixHotkey) || getDefaultRemixHotkey(),
          )
        }
        onSaved={(accel) => setSetting(SETTINGS_KEYS.hotkey, accel)}
      />
      <ChoiceRow
        label="Press style"
        value={value(SETTINGS_KEYS.hotkeyMode, "hold")}
        options={[
          { id: "hold", label: "Hold" },
          { id: "toggle", label: "Toggle" },
        ]}
        onChange={(id) => setSetting(SETTINGS_KEYS.hotkeyMode, id)}
      />
      <MicrophoneRow
        value={value(SETTINGS_KEYS.micDeviceId)}
        onChange={(id) => setSetting(SETTINGS_KEYS.micDeviceId, id)}
      />
      <SectionLabel>Languages</SectionLabel>
      <LanguagesEditor selected={languages} onChange={setLanguages} />
      <ToggleRow
        label="Translate to selected language"
        on={translateOn && languages.length === 1}
        disabled={languages.length !== 1}
        onChange={(next) =>
          setSetting(SETTINGS_KEYS.translateMode, String(next))
        }
      />
      <SectionLabel>Output</SectionLabel>
      <ChoiceRow
        label="Deliver to"
        value={value(SETTINGS_KEYS.dictationDestination, "cursor")}
        options={[
          { id: "cursor", label: "Cursor" },
          { id: "composer", label: "Chat" },
        ]}
        onChange={(id) => setSetting(SETTINGS_KEYS.dictationDestination, id)}
      />
      <ChoiceRow
        label="Method"
        value={value(SETTINGS_KEYS.outputMode, "paste")}
        options={[
          { id: "paste", label: "Paste" },
          { id: "clipboard", label: "Clipboard" },
        ]}
        onChange={(id) => setSetting(SETTINGS_KEYS.outputMode, id)}
      />
      <SectionLabel>Sound</SectionLabel>
      <ToggleRow
        label="Start & stop sounds"
        on={value(SETTINGS_KEYS.soundEnabled, "true") !== "false"}
        onChange={(next) =>
          setSetting(SETTINGS_KEYS.soundEnabled, next ? "true" : "false")
        }
      />
      <ChoiceRow
        label="Other audio"
        value={value("audio_playback_mode", "off")}
        options={[
          { id: "off", label: "Leave" },
          { id: "duck", label: "Duck" },
          { id: "pause", label: "Pause" },
        ]}
        onChange={(id) => setSetting("audio_playback_mode", id)}
      />
    </>
  );
}

function ApplicationPage({
  onReplayIntro,
}: {
  onReplayIntro: () => void;
}): React.JSX.Element {
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [companionForm, setCompanionForm] = useState<CompanionForm>(
    DEFAULT_COMPANION_FORM,
  );
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "none" }
    | { kind: "available"; version: string; downloaded: boolean }
  >({ kind: "idle" });

  useEffect(() => {
    void window.api
      .getLaunchAtStartup()
      .then(setLaunchAtStartup)
      .catch(() => {});
    void window.api
      .getAutoUpdate()
      .then(setAutoUpdate)
      .catch(() => {});
    void window.api
      .getAppVersion()
      .then(setVersion)
      .catch(() => {});
    void window.api
      .companionForm()
      .then(setCompanionForm)
      .catch(() => {});
  }, []);

  const checkForUpdates = (): void => {
    setUpdateStatus({ kind: "checking" });
    void window.api
      .checkForUpdate()
      .then((result) => {
        setUpdateStatus(
          result
            ? {
                kind: "available",
                version: result.version,
                downloaded: result.downloadState === "downloaded",
              }
            : { kind: "none" },
        );
      })
      .catch(() => setUpdateStatus({ kind: "none" }));
  };

  return (
    <>
      <SectionLabel>Widget</SectionLabel>
      <div className="tavern-set-row is-static">
        <span className="tavern-set-label">Sprite</span>
        <div className="tavern-sprite-pick">
          {Object.values(SPRITES_INFO).map((s) => {
            const id = parseCompanionForm(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={`tavern-sprite-pick-btn${
                  companionForm === id ? " is-on" : ""
                }`}
                onClick={() => {
                  setCompanionForm(id);
                  window.api.setCompanionForm(id);
                }}
              >
                <SpriteBadge form={id} size={24} />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="tavern-set-hint">
        The little companion that lives in the corner of your screen.
      </p>
      <ActionRow label="Intro" action="Replay" onClick={onReplayIntro} />
      <p className="tavern-set-hint">
        Meet Jeb again — the guided intro from your first launch.
      </p>
      <SectionLabel>App</SectionLabel>
      <ToggleRow
        label="Launch at login"
        on={launchAtStartup}
        onChange={(next) => {
          setLaunchAtStartup(next);
          window.api.setLaunchAtStartup(next);
        }}
      />
      <ToggleRow
        label="Install updates automatically"
        on={autoUpdate}
        onChange={(next) => {
          setAutoUpdate(next);
          window.api.setAutoUpdate(next);
        }}
      />
      <ActionRow
        label={
          updateStatus.kind === "none"
            ? "Up to date"
            : updateStatus.kind === "available"
              ? `v${updateStatus.version} available`
              : "Updates"
        }
        action={updateStatus.kind === "checking" ? "Checking…" : "Check now"}
        pending={updateStatus.kind === "checking"}
        onClick={checkForUpdates}
      />
      {updateStatus.kind === "available" ? (
        <button
          type="button"
          className="tavern-approve-btn tavern-approve-allow"
          onClick={() => {
            if (updateStatus.downloaded) window.api.installUpdate();
            else window.api.downloadUpdate();
          }}
        >
          {updateStatus.downloaded ? "Restart to update" : "Download update"}
        </button>
      ) : null}
      {version ? <InfoRow label="Version" value={`v${version}`} /> : null}
    </>
  );
}

function PermissionMark({
  state,
}: {
  state: "ok" | "no" | "wait";
}): React.JSX.Element {
  return (
    <span className={`tavern-set-check is-${state}`}>
      {state === "ok" ? "✓" : state === "no" ? "✕" : "…"}
    </span>
  );
}

function PermissionsPage(): React.JSX.Element {
  const [mic, setMic] = useState<string | null>(null);
  const [ax, setAx] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      void window.api
        .checkMicPermission()
        .then((v) => alive && setMic(v))
        .catch(() => {});
      void window.api
        .checkAccessibilityPermission()
        .then((v) => alive && setAx(v))
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      <div className="tavern-set-row is-static">
        <span className="tavern-set-label">
          Microphone
          <PermissionMark
            state={mic === "granted" ? "ok" : mic === null ? "wait" : "no"}
          />
        </span>
        {mic !== null && mic !== "granted" ? (
          <button
            type="button"
            className="tavern-set-action"
            onClick={() => {
              if (mic === "denied") window.api.openMicSettings();
              else void window.api.requestMicPermission();
            }}
          >
            {mic === "denied" ? "Open Settings ↗" : "Allow"}
          </button>
        ) : null}
      </div>
      <p className="tavern-set-hint">Needed to hear you dictate and talk.</p>
      <div className="tavern-set-row is-static">
        <span className="tavern-set-label">
          Accessibility
          <PermissionMark
            state={ax === true ? "ok" : ax === null ? "wait" : "no"}
          />
        </span>
        {ax === false ? (
          <button
            type="button"
            className="tavern-set-action"
            onClick={() => window.api.openAccessibilitySettings()}
          >
            Open Settings ↗
          </button>
        ) : null}
      </div>
      <p className="tavern-set-hint">
        Needed to paste text at your cursor and read what you've highlighted.
      </p>
    </>
  );
}

function DataPage({
  onThreadsCleared,
}: {
  onThreadsCleared: () => void;
}): React.JSX.Element {
  const [clearingChats, setClearingChats] = useState(false);
  const [clearingBrain, setClearingBrain] = useState(false);
  const [brainCleared, setBrainCleared] = useState(false);
  const [exporting, setExporting] = useState(false);

  const clearChats = (): void => {
    if (!window.confirm("Delete every conversation? This can't be undone."))
      return;
    setClearingChats(true);
    void apiFetch("/api/agent/thread/clear", { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("clear failed");
        onThreadsCleared();
      })
      .catch(() => {})
      .finally(() => setClearingChats(false));
  };

  const clearBrain = (): void => {
    if (
      !window.confirm(
        "Erase every brain file — memories, notes, and todos? Export a copy first if you want one. This can't be undone.",
      )
    )
      return;
    setClearingBrain(true);
    void apiFetch("/api/brain/clear", { method: "POST" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
        } | null;
        if (!res.ok || !data?.ok) throw new Error("clear failed");
        setBrainCleared(true);
        window.setTimeout(() => setBrainCleared(false), 2000);
      })
      .catch(() => {})
      .finally(() => setClearingBrain(false));
  };

  const exportBrain = (): void => {
    setExporting(true);
    void apiFetch("/api/brain/export")
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          files?: Array<{ path: string; content: string }>;
        };
        if (!data.ok || !data.files) throw new Error("export failed");
        const blob = new Blob([JSON.stringify(data.files, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "freestyle-brain.json";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {})
      .finally(() => setExporting(false));
  };

  return (
    <>
      <SectionLabel>Chats</SectionLabel>
      <ActionRow
        label="Clear chat history"
        action={clearingChats ? "Clearing…" : "Clear…"}
        pending={clearingChats}
        danger
        onClick={clearChats}
      />
      <p className="tavern-set-hint">
        Deletes every conversation on this Mac and starts fresh.
      </p>
      <SectionLabel>Brain</SectionLabel>
      <ActionRow
        label="Export your brain"
        action={exporting ? "Exporting…" : "Download"}
        pending={exporting}
        onClick={exportBrain}
      />
      <ActionRow
        label={brainCleared ? "Brain cleared" : "Clear brain"}
        action={clearingBrain ? "Clearing…" : "Clear…"}
        pending={clearingBrain}
        danger
        onClick={clearBrain}
      />
      <p className="tavern-set-hint">
        Erases every memory, note, and todo from your brain in the cloud.
      </p>
      <SectionLabel>Diagnostics</SectionLabel>
      <ActionRow
        label="Log files"
        action="Open folder"
        onClick={() => void window.api.openLogsFolder()}
      />
    </>
  );
}

export function SettingsView({
  onClose,
  onThreadsCleared,
  onReplayIntro,
}: {
  onClose: () => void;
  onThreadsCleared: () => void;
  onReplayIntro: () => void;
}): React.JSX.Element {
  const [page, setPage] = useState<SettingsPage>("root");
  const { settings, setSetting } = useServerSettings();
  const auth = useCloudAuth();
  const usage = useCloudUsage(!!auth.user);
  const [version, setVersion] = useState("");

  useEffect(() => {
    void window.api
      .getAppVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  if (settings === null)
    return <div className="tavern-empty">Loading settings…</div>;

  const value = (key: string, fallback = ""): string =>
    settings[key] ?? fallback;

  if (page !== "root") {
    return (
      <>
        <button
          type="button"
          className="tavern-file-back"
          onClick={() => setPage("root")}
        >
          ← {PAGE_TITLES[page]}
        </button>
        {page === "profile" ? (
          <ProfilePage />
        ) : page === "billing" ? (
          <BillingPage />
        ) : page === "brain" ? (
          <BrainFiles
            root=""
            emptyText="Everything Freestyle knows lives here — memories, notes, skills, todos."
            newLabel="New file"
            graphable
          />
        ) : page === "notifications" ? (
          <NotificationsHistory />
        ) : page === "dictation" ? (
          <DictationPage value={value} setSetting={setSetting} />
        ) : page === "talk" ? (
          <>
            <p className="tavern-set-hint is-lead">
              Talking is how you ask Freestyle to do things. Hold the talk key,
              say what you need, and it lands in the chat when you let go — the
              agent takes it from there. Summon opens this panel from anywhere.
            </p>
            <HotkeyRow
              label="Talk to Freestyle"
              accel={
                value(SETTINGS_KEYS.remixHotkey) || getDefaultRemixHotkey()
              }
              target="remix"
              isBlocked={(accel) =>
                acceleratorsEqual(
                  accel,
                  value(SETTINGS_KEYS.hotkey) || getDefaultHotkey(),
                )
              }
              onSaved={(accel) => {
                setSetting(SETTINGS_KEYS.remixHotkey, accel);
                window.setTimeout(() => window.api.reloadRemixHotkey(), 300);
              }}
            />
            <InfoRow label="Summon the panel" value="⌥ Space" />
          </>
        ) : page === "application" ? (
          <ApplicationPage onReplayIntro={onReplayIntro} />
        ) : page === "permissions" ? (
          <PermissionsPage />
        ) : (
          <DataPage onThreadsCleared={onThreadsCleared} />
        )}
      </>
    );
  }

  return (
    <>
      <button type="button" className="tavern-file-back" onClick={onClose}>
        ← Settings
      </button>
      <AccountCard onOpenProfile={() => setPage("profile")} />
      <NavRow
        label="Billing & Usage"
        detail={auth.user ? (usage.isPro ? "Pro" : "Free") : undefined}
        onClick={() => setPage("billing")}
      />
      <NavRow label="Brain" onClick={() => setPage("brain")} />
      <NavRow label="Notifications" onClick={() => setPage("notifications")} />
      <NavRow
        label="Dictation"
        detail={value(SETTINGS_KEYS.hotkey) || getDefaultHotkey()}
        onClick={() => setPage("dictation")}
      />
      <NavRow
        label="Talk & Summon"
        detail={value(SETTINGS_KEYS.remixHotkey) || getDefaultRemixHotkey()}
        onClick={() => setPage("talk")}
      />
      <NavRow label="Application" onClick={() => setPage("application")} />
      <NavRow label="Permissions" onClick={() => setPage("permissions")} />
      <NavRow label="Data" onClick={() => setPage("data")} />
      {version ? (
        <div className="tavern-set-version">Freestyle v{version}</div>
      ) : null}
    </>
  );
}
