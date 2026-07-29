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
import {
  type SocialProvider,
  useLinkedAccounts,
  useLinkSocial,
  useRefreshAccountsOnFocus,
  useUnlinkSocial,
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
          <div className="flex items-center justify-center py-4">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
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
