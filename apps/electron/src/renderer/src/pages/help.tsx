import { DiscordIcon } from "@renderer/components/brand-icons";
import { LINKS } from "@renderer/lib/links";
import {
  Eyebrow,
  PageHeader,
  PageShell,
} from "@renderer/pages/models/page-chrome";
import { Bug, ExternalLink, Heart } from "lucide-react";

type CardIcon = React.ComponentType<{ className?: string }>;

function HelpCard({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: CardIcon;
  title: string;
  desc: string;
}): React.JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="border-border bg-card hover:bg-card/70 flex items-start gap-3 rounded-lg border p-4 transition-colors"
    >
      <Icon className="text-primary mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-foreground flex items-center gap-1.5 text-sm font-medium">
          {title}
          <ExternalLink className="text-muted-foreground h-3 w-3" />
        </div>
        <p className="text-muted-foreground mt-1 text-[13px] leading-[1.5]">
          {desc}
        </p>
      </div>
    </a>
  );
}

export default function HelpPage(): React.JSX.Element {
  return (
    <PageShell>
      <PageHeader
        title="Help"
        subtitle="Documentation, community support, and ways to contribute to Freestyle."
      />

      <section className="mb-8">
        <Eyebrow text="Get help" accent />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <HelpCard
            href={LINKS.newIssue}
            icon={Bug}
            title="Report an issue"
            desc="Found a bug or have a feature request? Open a GitHub issue."
          />
          <HelpCard
            href={LINKS.discord}
            icon={DiscordIcon}
            title="Ask the community"
            desc="Join our Discord to ask for help live and chat with other users."
          />
        </div>
      </section>

      <section className="mb-8">
        <Eyebrow text="Contributing" accent />
        <div className="mt-3">
          <HelpCard
            href={LINKS.contributing}
            icon={Heart}
            title="Contribute to Freestyle"
            desc="PRs are welcome. Start with CONTRIBUTING.md for local setup, then say hi in Discord where contributors coordinate."
          />
        </div>
      </section>
    </PageShell>
  );
}
