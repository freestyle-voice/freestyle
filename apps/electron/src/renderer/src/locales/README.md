## Adding New Translations

To add a new interface language, follow these steps:

| Step | Action | Description |
|:---:|:---|:---|
| **1** | **Copy the template** | Duplicate `template.json` in this directory and rename it to your target language's ISO code (e.g., `de.json` for German, `ja.json` for Japanese). |
| **2** | **Translate the values** | Translate the strings inside your new file. |
| **3** | **Submit a PR** | Just push the new file! The system automatically detects and integrates it. |

### ⚠️ Important Notice for Translators

> [!WARNING]
> **DO NOT alter, translate, or remove code variables inside curly braces.**

When translating the values, you will see specific system placeholders enclosed in double curly braces, such as:
- `{{provider}}`
- `{{name}}`
- `{{version}}`
- `{{tool}}`
- `{{phrase}}`
- `{{label}}`
- `{{total}}`

The engine uses these to inject dynamic data into the application interface at runtime. Simply move the variables into the grammatically correct position within your translated sentence without changing their text or syntax.

* **Incorrect:** `"connect": "接続する {{プロバイダー}}"`
* **Correct:** `"connect": "{{provider}} に接続"`

---

If you have any doubts, please feel free to [open an issue](https://github.com/freestyle-voice/freestyle/issues) or ask us directly in our [Discord server](https://discord.gg/Fmgt5yZCDu)!