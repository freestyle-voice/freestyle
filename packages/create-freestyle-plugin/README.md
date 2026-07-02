# `create-freestyle-plugin`

Scaffold a new [Freestyle](../../README.md) voice plugin from a starter
template. Freestyle is the local-first voice dictation app; plugins extend its
dictation pipeline — rewrite transcripts, inject cleanup prompts, transform the
final text, and add UI pages. See the [plugin
SDK](../sdk/README.md) for the full plugin contract.

## Usage

Run it with your package manager's `create` command — no install needed:

```bash
npm create freestyle-plugin@latest
# or
pnpm create freestyle-plugin
# or
yarn create freestyle-plugin
# or
bun create freestyle-plugin
```

You can also pass the target directory directly:

```bash
npm create freestyle-plugin@latest my-plugin
```

With no flags, the CLI prompts for the target directory, template, package
manager, and whether to install dependencies. Pass flags to skip the prompts.

## Templates

| Template | Description |
| --- | --- |
| `basic` | Hook-only plugin (no UI) |
| `with-ui` | Plugin with a React UI page |

Templates are pulled from
[`templates/`](../../templates) in the Freestyle monorepo.

## Options

| Flag | Description |
| --- | --- |
| `[target]` | Target directory (positional). Use `.` for the current directory. |
| `-t, --template <template>` | Template to use: `basic` or `with-ui`. |
| `-p, --pm <pm>` | Package manager: `pnpm`, `npm`, `bun`, or `yarn`. Defaults to the one that invoked the CLI. |
| `-i, --install` | Install dependencies after scaffolding. |
| `-o, --offline` | Use giget's offline cache instead of downloading the template. |
| `-V, --version` | Print the CLI version. |
| `-h, --help` | Print help. |

Non-interactive example:

```bash
npm create freestyle-plugin@latest my-plugin -- --template with-ui --pm pnpm --install
```

The scaffolder sets the package name (slugified from the target), the plugin's
`displayName`, its UI page title, and the plugin `name` in `src/index.ts` to
match your project.

## Next steps

After scaffolding:

```bash
cd my-plugin
pnpm install        # if you didn't pass --install
pnpm run build      # build the plugin (and UI, for with-ui)
pnpm run link       # symlink it into Freestyle for local testing
```

Use `pnpm run build` / `pnpm run link` (the `run` form) rather than
`pnpm build` / `pnpm link` — the bare `build` and `link` commands collide with
built-in package-manager commands and would run the wrong thing.

`link` drops a `-dev` copy of your plugin into Freestyle's user-data `plugins/`
directory, symlinked to your `dist/`. Restart Freestyle, then enable the plugin
under **Settings → Plugins** to activate its hooks and middleware. Rebuild to
pick up changes; run `pnpm run unlink` to remove the dev copy.

Full walkthrough: [Build your first
plugin](../../apps/docs/first-plugin.mdx), and the [plugin SDK
reference](../sdk/README.md).

## License

MIT
