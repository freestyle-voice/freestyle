import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../app/(app)/connected-apps.tsx", import.meta.url),
  "utf8",
);

describe("connected-app loading state", () => {
  it("scopes a connector action's spinner to the selected app", () => {
    expect(screen).toContain(
      `pendingAction?.key === \`catalog:\${item.slug}\``,
    );
    expect(screen).toContain(
      `pendingAction?.key === \`connection:\${connection.id}\``,
    );
    expect(screen).not.toContain("connect.isPending ? connect.variables");
  });

  it("uses compact settings rows instead of per-app action pills", () => {
    expect(screen).toContain('<SettingsGroup title="Connected">');
    expect(screen).toContain("showConnectionMenu(connection)");
    expect(screen).toContain(`accessibilityLabel={\`Connect \${name}\`}`);
    expect(screen).toContain("<Check color={theme.primary} size={18} />");
    expect(screen).not.toContain("styles.connectorActionText");
    expect(screen).not.toContain("styles.stateBadge");
  });
});
