# Emoji

Add emojis to your dictation based on conversational tone and style.

This is a first-party Freestyle plugin. It contributes a `beforeCleanup` hook
that instructs the LLM cleanup step to sprinkle a few relevant emojis into
casual or conversational dictation, while leaving formal, professional, and
technical text (and code, URLs, and file paths) untouched.

## Usage

1. Open **Plugins → Emoji → Open**.
2. Choose a placement mode:
   - **After** — keep the original word and place a relevant emoji after it.
   - **Replace** — swap an emotionally expressive word for a single emoji
     (e.g. `love` → ❤️, `happy` → 😊).
3. Dictate as usual. Emojis are added during cleanup, so they work on both the
   local and Freestyle Cloud cleanup paths.

## How it works

The plugin appends a system-prompt fragment via the `beforeCleanup` hook. On the
Freestyle Cloud path the fragment is forwarded to the cloud and merged into the
assembled cleanup prompt, so no extra round trip is needed. The plugin ships no
model of its own and reuses your configured cleanup settings.
