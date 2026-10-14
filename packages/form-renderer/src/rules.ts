/**
 * The rules a form checks before it sends (UX-M1-04), apart from its texts: the length of a
 * long text in words, the form of an email address, and how many of something a number says.
 *
 * They are the client's copy of rules the server checks as well. The form renderer of 0.3.0
 * (ADR-09) reads a form's rules from the API's definition and applies them with these same
 * functions, so that what the author is told in the browser and what the API refuses are one
 * rule; the API stays the one that decides.
 */

/** Words as the form counts them: runs of characters between white space. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length;
}

/** How many words a text has beyond its limit; 0 when it is within it. */
export function wordsOver(text: string, max: number): number {
  return Math.max(0, countWords(text) - max);
}

/**
 * An email address as a form accepts it: something, one @, a domain with a dot, no white space.
 * Deliberately plain: it refuses what is plainly not an address ("marta@example", "marta"),
 * and leaves the rest to the confirmation email.
 */
export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(value.trim());
}

/** The plural form a number takes in a language (CLDR rules: "one", "few", "other", ...). */
export function pluralOf(count: number, language: string): Intl.LDMLPluralRule {
  return new Intl.PluralRules(language).select(count);
}
