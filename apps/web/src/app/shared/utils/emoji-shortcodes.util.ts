/**
 * Small hand-picked `:shortcode:` -> emoji map (Slack/Discord-style syntax).
 * Not exhaustive — covers common ones without adding a dependency.
 */
const EMOJI_SHORTCODES: Record<string, string> = {
  rocket: '🚀',
  smile: '😄',
  laughing: '😆',
  wink: '😉',
  heart: '❤️',
  fire: '🔥',
  tada: '🎉',
  eyes: '👀',
  clap: '👏',
  wave: '👋',
  thumbsup: '👍',
  thumbsdown: '👎',
  100: '💯',
  star: '⭐',
  sparkles: '✨',
  sunglasses: '😎',
  thinking: '🤔',
  cry: '😢',
  joy: '😂',
  pray: '🙏',
  muscle: '💪',
  coffee: '☕',
  pizza: '🍕',
  moon: '🌙',
  sun: '☀️',
};

const SHORTCODE_PATTERN = /:([a-z0-9_+-]+):/gi;

/** Replaces recognized `:shortcode:` occurrences with their emoji; unrecognized ones are left as-is. */
export function replaceEmojiShortcodes(text: string): string {
  return text.replace(
    SHORTCODE_PATTERN,
    (match, name: string) => EMOJI_SHORTCODES[name.toLowerCase()] ?? match,
  );
}
