import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card, CardContent } from "@renderer/components/ui/card";
import { Input } from "@renderer/components/ui/input";
import { Label } from "@renderer/components/ui/label";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { useCloudUsage } from "@renderer/lib/use-cloud-usage";
import {
  type SocialProvider,
  useLinkedAccounts,
  useLinkSocial,
  useRefreshAccountsOnFocus,
  useUpdateName,
} from "@renderer/lib/use-profile";
import {
  Eyebrow,
  PageHeader,
  PageShell,
} from "@renderer/pages/models/page-chrome";
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
  const { isPro, balance } = useCloudUsage(!!user);

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

      <div className="max-w-[720px]">
        {/* Identity header */}
        <div className="mb-8 flex items-center gap-4">
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
          <div className="min-w-0">
            <div className="text-foreground flex items-center gap-2.5">
              <span className="truncate text-lg font-medium">
                {user.name || "User"}
              </span>
              {balance != null ? (
                <Badge variant="secondary" className="shrink-0 capitalize">
                  {isPro ? "Pro" : "Free"}
                </Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-0.5 truncate text-[13px]">
              {user.email}
            </p>
          </div>
        </div>

        {/* Content sections */}
        <div className="flex flex-col gap-8">
          <section>
            <Eyebrow text="Personal information" accent />
            <div className="mt-3">
              <NameCard currentName={user.name ?? ""} />
            </div>
          </section>

          <section>
            <Eyebrow text="Connected accounts" accent />
            <div className="mt-3">
              <ConnectedAccountsCard enabled={!!user} />
            </div>
          </section>
        </div>
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
      <CardContent className="pt-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-name">Display name</Label>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
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
                <p className="text-destructive mt-1.5 text-[12px]">
                  {updateName.error instanceof Error
                    ? updateName.error.message
                    : "Failed to update profile"}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
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
                {updateName.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                Save
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectedAccountsCard({
  enabled,
}: {
  enabled: boolean;
}): React.JSX.Element {
  const { data: linked, isLoading } = useLinkedAccounts(enabled);
  const linkSocial = useLinkSocial();
  useRefreshAccountsOnFocus(enabled);

  return (
    <Card>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {PROVIDERS.map((provider) => {
              const Icon = provider.icon;
              const isConnected = linked?.includes(provider.id) ?? false;
              const isLinking =
                linkSocial.isPending && linkSocial.variables === provider.id;
              return (
                <div
                  key={provider.id}
                  className="border-border flex items-center gap-3 rounded-lg border p-3"
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="text-[13px] font-medium">
                    {provider.label}
                  </span>
                  {isConnected ? (
                    <Badge variant="secondary" className="ml-auto">
                      Connected
                    </Badge>
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
