import { Badge } from "@renderer/components/ui/badge";
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
import { useCloudAuth } from "@renderer/lib/auth-context";
import { useCloudUsage } from "@renderer/lib/use-cloud-usage";
import {
  type SocialProvider,
  useLinkedAccounts,
  useLinkSocial,
  useRefreshAccountsOnFocus,
  useUpdateName,
} from "@renderer/lib/use-profile";
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
  const { isPro } = useCloudUsage(!!user);

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
      <div className="flex max-w-[560px] flex-col gap-6">
        {/* Identity */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              {user.image ? (
                <img
                  src={user.image}
                  alt=""
                  className="size-14 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="bg-muted text-muted-foreground flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-medium">
                  {initialsFor(user)}
                </div>
              )}
              <div className="min-w-0">
                <CardTitle className="truncate text-lg">
                  {user.name || "User"}
                </CardTitle>
                <CardDescription className="truncate">
                  {user.email}
                </CardDescription>
                <Badge variant="secondary" className="mt-1.5 capitalize">
                  {isPro ? "Pro" : "Free"}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        <NameCard currentName={user.name ?? ""} />
        <ConnectedAccountsCard enabled={!!user} />
      </div>
    </PageShell>
  );
}

function NameCard({ currentName }: { currentName: string }): React.JSX.Element {
  const [name, setName] = useState(currentName);
  const [saved, setSaved] = useState(false);
  const updateName = useUpdateName();

  // Re-seed when the underlying user name changes (e.g. after a refresh).
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
        <CardTitle>Personal information</CardTitle>
        <CardDescription>Update your display name.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex max-w-sm flex-col gap-1.5">
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
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>
          Manage the social accounts linked to your profile.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                  <Icon className="size-5" />
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
