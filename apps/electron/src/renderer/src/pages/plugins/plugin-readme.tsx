import Markdown from "react-markdown";

/**
 * Render plugin README markdown with the app's editorial styling. Uses
 * react-markdown (no raw HTML / dangerouslySetInnerHTML), with component
 * overrides mapped to the design tokens.
 */
export function PluginReadme({
  source,
}: {
  source: string;
}): React.JSX.Element {
  return (
    <div className="text-foreground max-w-[680px] text-[14px] leading-[1.65]">
      <Markdown
        components={{
          h1: ({ children }) => (
            <h1 className="serif text-foreground mb-3 mt-7 text-[24px] leading-tight first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="serif text-foreground mb-2 mt-6 text-[19px] leading-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-foreground mb-2 mt-5 text-[15px] font-medium">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="my-3">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const block = className?.includes("language-");
            return block ? (
              <code className="mono text-[12.5px]">{children}</code>
            ) : (
              <code className="bg-secondary/60 mono rounded px-1.5 py-0.5 text-[12.5px]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="border-border bg-secondary/40 my-4 overflow-auto rounded-[10px] border p-3.5">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-border text-muted-foreground my-4 border-l-2 pl-4">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-border my-6" />,
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt}
              className="my-4 max-w-full rounded-[8px]"
            />
          ),
        }}
      >
        {source}
      </Markdown>
    </div>
  );
}
