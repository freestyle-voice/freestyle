import {
  INDUSTRY_LABELS,
  type Industry,
  industrySchema,
} from "@freestyle-voice/validations";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@renderer/components/ui/card";
import { Input } from "@renderer/components/ui/input";
import { Label } from "@renderer/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { Switch } from "@renderer/components/ui/switch";
import { useCloudAuth } from "@renderer/lib/auth-context";
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
import { cn } from "@renderer/lib/utils";
import { PageHeader, PageShell } from "@renderer/pages/models/page-chrome";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { IconType } from "react-icons";
import { SiApple, SiGithub, SiGoogle } from "react-icons/si";

const PROVIDERS: {
  id: SocialProvider;
  label: string;
  icon: IconType;
}[] = [
  { id: "github", label: "GitHub", icon: SiGithub },
  { id: "google", label: "Google", icon: SiGoogle },
  { id: "apple", label: "Apple", icon: SiApple },
];

function initialsFor(user: {
  name?: string | null;
  email?: string | null;
}): string {
  return (
    user.name?.trim().charAt(0).toUpperCase() ||
    user.email?.trim().charAt(0).toUpperCase() ||
    "U"
  );
}

export default function ProfilePage(): React.JSX.Element {
  const { user } = useCloudAuth();

  if (!user) {
    return (
      <PageShell>
        <PageHeader title="Profile" subtitle="Manage your account." />
        <p className="text-muted-foreground text-[13px]">
          Sign in to Freestyle Cloud to manage your profile.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader title="Profile" subtitle="Manage your account details." />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* User info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              {user.image ? (
                <img
                  src={user.image}
                  alt=""
                  className="size-16 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-medium">
                  {initialsFor(user)}
                </div>
              )}
              <div>
                <CardTitle>{user.name || "User"}</CardTitle>
                <CardDescription>{user.email}</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Edit name */}
        <NameCard currentName={user.name ?? ""} />

        {/* Professional details */}
        <ProfileDetailsCard enabled={!!user} />

        {/* Connected accounts */}
        <ConnectedAccountsCard enabled={!!user} />
      </div>
    </PageShell>
  );
}

function NameCard({ currentName }: { currentName: string }): React.JSX.Element {
  const [name, setName] = useState(currentName);
  const [saved, setSaved] = useState(false);
  const updateName = useUpdateName();

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const trimmed = name.trim();
  const dirty = trimmed !== currentName.trim();
  const invalid = trimmed.length === 0;

  const onSave = async (): Promise<void> => {
    if (!dirty || invalid) return;
    setSaved(false);
    try {
      await updateName.mutateAsync(trimmed);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error surfaced inline below.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
        <CardDescription>Update your display name.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="profile-name">Name</Label>
          <Input
            id="profile-name"
            value={name}
            placeholder="Your name"
            maxLength={120}
            aria-invalid={invalid && dirty}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSave();
            }}
          />
          {updateName.isError ? (
            <p className="text-destructive text-[12px]">
              {updateName.error instanceof Error
                ? updateName.error.message
                : "Failed to update profile"}
            </p>
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        {saved ? (
          <span className="text-muted-foreground flex items-center gap-1 text-[12px]">
            <Check className="size-3.5" />
            Saved
          </span>
        ) : null}
        <Button
          size="sm"
          disabled={!dirty || invalid || updateName.isPending}
          onClick={() => void onSave()}
        >
          {updateName.isPending ? <Loader2 className="animate-spin" /> : null}
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}

/** Base UI Select can't use "" as a value; use a sentinel for "not set". */
const NO_INDUSTRY = "__none__";

function ProfileDetailsCard({
  enabled,
}: {
  enabled: boolean;
}): React.JSX.Element {
  const { data: profile } = useProfileFields(enabled);
  const updateProfile = useUpdateProfileFields();
  const [saved, setSaved] = useState(false);

  const [industry, setIndustry] = useState<Industry | undefined>(undefined);
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  // When the industry changes, re-seed tone + vocabulary defaults for the new
  // industry (opt-out). Only surfaced while the industry is actually changing.
  const [updatePreferences, setUpdatePreferences] = useState(true);

  // Seed local form state whenever the fetched profile changes.
  useEffect(() => {
    if (!profile) return;
    const parsed = industrySchema.safeParse(profile.industry);
    setIndustry(parsed.success ? parsed.data : undefined);
    setJobTitle(profile.jobTitle ?? "");
    setCompany(profile.company ?? "");
    setUpdatePreferences(true);
  }, [profile]);

  const savedIndustry = industrySchema.safeParse(profile?.industry).success
    ? (profile?.industry as Industry)
    : undefined;
  // Show the re-seed toggle only when the user is switching to a real industry
  // (clearing it never reseeds). Mirrors the cloud dashboard's checkbox.
  const industryWillChange =
    industry !== savedIndustry && industry !== undefined;
  const dirty =
    industry !== savedIndustry ||
    jobTitle.trim() !== (profile?.jobTitle ?? "") ||
    company.trim() !== (profile?.company ?? "");

  const onSave = async (): Promise<void> => {
    if (!dirty) return;
    setSaved(false);
    try {
      await updateProfile.mutateAsync({
        // Send `null` (not `undefined`) to clear a field — `undefined` is
        // dropped by JSON serialization, which the server reads as "unchanged".
        industry: industry ?? null,
        jobTitle: jobTitle.trim() || null,
        company: company.trim() || null,
        // Only meaningful on an industry change; harmless otherwise.
        updatePreferences,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error surfaced inline below.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Professional Details</CardTitle>
        <CardDescription>
          Tell us about your work so Freestyle can tailor suggestions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-industry">Industry</Label>
            <Select
              value={industry ?? NO_INDUSTRY}
              onValueChange={(value) =>
                setIndustry(
                  value === NO_INDUSTRY ? undefined : (value as Industry),
                )
              }
            >
              <SelectTrigger id="profile-industry" className="w-full">
                <SelectValue placeholder="Select your industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_INDUSTRY}>Not specified</SelectItem>
                {industrySchema.options.map((value) => (
                  <SelectItem key={value} value={value}>
                    {INDUSTRY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-job-title">Job title</Label>
            <Input
              id="profile-job-title"
              value={jobTitle}
              placeholder="e.g. Product Manager"
              maxLength={120}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-company">Company</Label>
            <Input
              id="profile-company"
              value={company}
              placeholder="e.g. Acme Inc."
              maxLength={120}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
        </div>
        {industryWillChange ? (
          <label
            htmlFor="profile-update-preferences"
            className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3"
          >
            <span className="text-sm leading-snug">
              Update tone and vocabulary to match the new industry's defaults
            </span>
            <Switch
              id="profile-update-preferences"
              checked={updatePreferences}
              onCheckedChange={setUpdatePreferences}
            />
          </label>
        ) : null}
        {updateProfile.isError ? (
          <p className="text-destructive mt-4 text-[12px]">
            {updateProfile.error instanceof Error
              ? updateProfile.error.message
              : "Failed to update profile"}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        {saved ? (
          <span className="text-muted-foreground flex items-center gap-1 text-[12px]">
            <Check className="size-3.5" />
            Saved
          </span>
        ) : null}
        <Button
          size="sm"
          disabled={!dirty || updateProfile.isPending}
          onClick={() => void onSave()}
        >
          {updateProfile.isPending ? (
            <Loader2 className="animate-spin" />
          ) : null}
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}

function SkeletonBlock({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "bg-muted/60 relative overflow-hidden rounded-md",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
        className,
      )}
    />
  );
}

/**
 * Loading placeholder for the connected-accounts list. Mirrors the real row
 * layout (icon + label + trailing action) one row per provider, so the card
 * doesn't jump in size or shift its contents when the data resolves.
 */
function ConnectedAccountsSkeleton(): React.JSX.Element {
  return (
    <div
      className="space-y-2"
      role="status"
      aria-label="Loading connected accounts"
    >
      <style>{`@keyframes shimmer { 100% { transform: translateX(100%); } }`}</style>
      {PROVIDERS.map((provider) => (
        <div
          key={provider.id}
          className="flex items-center gap-3 rounded-md border p-3"
        >
          <SkeletonBlock className="size-5 shrink-0 rounded" />
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="ml-auto h-8 w-24 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function ConnectedAccountsCard({
  enabled,
}: {
  enabled: boolean;
}): React.JSX.Element {
  const { data: linked, isLoading } = useLinkedAccounts(enabled);
  const linkSocial = useLinkSocial();
  const unlinkSocial = useUnlinkSocial();
  useRefreshAccountsOnFocus(enabled);

  const connectedCount = linked?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>
          Manage the social accounts linked to your profile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ConnectedAccountsSkeleton />
        ) : (
          <div className="space-y-2">
            {PROVIDERS.map((provider) => {
              const Icon = provider.icon;
              const isConnected = linked?.includes(provider.id) ?? false;
              const isLinking =
                linkSocial.isPending && linkSocial.variables === provider.id;
              const isUnlinking =
                unlinkSocial.isPending &&
                unlinkSocial.variables === provider.id;
              return (
                <div
                  key={provider.id}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="text-sm font-medium">{provider.label}</span>
                  {isConnected ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-muted-foreground"
                      disabled={unlinkSocial.isPending || connectedCount <= 1}
                      title={
                        connectedCount <= 1
                          ? "Cannot disconnect your only sign-in method"
                          : `Disconnect ${provider.label}`
                      }
                      onClick={() => unlinkSocial.mutate(provider.id)}
                    >
                      {isUnlinking ? (
                        <Loader2 className="animate-spin" />
                      ) : null}
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      disabled={linkSocial.isPending}
                      onClick={() => linkSocial.mutate(provider.id)}
                    >
                      {isLinking ? <Loader2 className="animate-spin" /> : null}
                      Connect
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
