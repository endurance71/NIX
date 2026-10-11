const WORD_JOINER = '⁠';
const EMAIL_OR_URL = /(?:https?:\/\/)?[\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?:\/\/\S+/g;

/**
 * Glues every e-mail address and URL in `text` with word joiners so the text engine never breaks
 * or hyphenates inside them ("damianmoty-linski.pl"). The joiners are invisible and silent.
 */
export function keepLinksUnbroken(text: string): string {
  return text.replace(EMAIL_OR_URL, (match) => Array.from(match).join(WORD_JOINER));
}
