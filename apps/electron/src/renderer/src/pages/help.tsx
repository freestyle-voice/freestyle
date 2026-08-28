import { LINKS } from "@renderer/lib/links";
import {
  Eyebrow,
  PageHeader,
  PageShell,
} from "@renderer/pages/models/page-chrome";
import { Bug, ExternalLink, Heart } from "lucide-react";
import type { IconType } from "react-icons";
import { SiDiscord, SiGithub } from "react-icons/si";

type CardIcon = React.ComponentType<{ className?: string }> | IconType;

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
      className="border-border bg-card/70 hover:border-primary/45 hover:bg-card group flex min-h-[132px] items-start gap-3.5 rounded-[12px] border p-5 transition-colors"
    >
      <span className="bg-primary/10 group-hover:bg-primary/15 flex size-9 shrink-0 items-center justify-center rounded-[9px] transition-colors">
        <Icon className="text-primary size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-foreground flex items-center gap-1.5 text-[15px] font-medium">
          {title}
          <ExternalLink className="text-muted-foreground group-hover:text-primary size-3.5 transition-colors" />
        </div>
        <p className="text-muted-foreground mt-2 text-[12.5px] leading-[1.55]">
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
        subtitle="Direct paths to support, source code, and the people building Freestyle."
      />

      <section>
        <Eyebrow text="Resources" accent />
        <div className="mt-3 grid grid-cols-1 gap-3 min-[880px]:grid-cols-3">
          <HelpCard
            href={LINKS.repo}
            icon={SiGithub}
            title="Freestyle on GitHub"
            desc="View the source, releases, and open work."
          />
          <HelpCard
            href={LINKS.discord}
            icon={SiDiscord}
            title="Ask the community"
            desc="Get help from the community and share what you are working on."
          />
          <HelpCard
            href={LINKS.newIssue}
            icon={Bug}
            title="Report an issue"
            desc="Found a bug or have an idea? Open an issue on GitHub."
          />
        </div>
      </section>

      <section className="help-contribute-callout border-border mt-6 flex flex-col gap-4 border-t pt-5 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full">
            <Heart className="text-primary size-4" />
          </span>
          <div>
            <Eyebrow text="Contribute" accent />
            <p className="text-muted-foreground mt-0.5 text-[12.5px] leading-[1.45]">
              Help make Freestyle better with code, feedback, or translations.
            </p>
          </div>
        </div>
        <a
          href={LINKS.contributing}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:text-primary inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium transition-colors"
        >
          Read the contributing guide
          <ExternalLink className="size-3.5" />
        </a>
      </section>
    </PageShell>
  );
}
