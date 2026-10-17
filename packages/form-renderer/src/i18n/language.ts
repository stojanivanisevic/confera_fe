/**
 * Which language a form opens in (decision D2, UX-M1-06), first match wins:
 *  1. the language the author chose earlier in this tab (the draft keeps it, D3);
 *  2. the language the snippet of the site carries (`?lang=sr` in the frame's address), or the
 *     link to the hosted form;
 *  3. the browser's languages, in their order: Serbian, and the languages so close to it that a
 *     Serbian form in Latin script reads naturally (Croatian, Bosnian, Montenegrin, Serbo-Croatian),
 *     give Serbian; English gives English;
 *  4. English.
 * Only a language the form has counts at each step.
 */
import { FORM_LANGUAGES, isFormLanguage, type FormLanguage } from './catalogue';

const CLOSE_TO: Readonly<Record<string, FormLanguage>> = { sr: 'sr', hr: 'sr', bs: 'sr', cnr: 'sr', sh: 'sr', me: 'sr', en: 'en' };

/** The form languages of a browser's list (`navigator.languages`, or an Accept-Language header), in order. */
export function browserLanguages(list: readonly string[] | string | null | undefined): FormLanguage[] {
  const tags =
    typeof list === 'string'
      ? list
          .split(',')
          .map((part) => {
            const [tag = '', ...params] = part.trim().split(';');
            const q = params.map((p) => /^\s*q=([0-9.]+)\s*$/.exec(p)?.[1]).find((v) => v !== undefined);
            return { tag: tag.trim(), q: q === undefined ? 1 : Number(q) };
          })
          .filter((entry) => entry.tag !== '' && entry.tag !== '*' && Number.isFinite(entry.q) && entry.q > 0)
          .sort((a, b) => b.q - a.q)
          .map((entry) => entry.tag)
      : [...(list ?? [])];
  const out: FormLanguage[] = [];
  for (const tag of tags) {
    const language = CLOSE_TO[tag.toLowerCase().split(/[-_]/)[0] ?? ''];
    if (language && !out.includes(language)) out.push(language);
  }
  return out;
}

export interface LanguageChoice {
  /** The languages the form has (the conference's). */
  readonly available: readonly FormLanguage[];
  /** From the draft of this tab. */
  readonly chosen?: unknown;
  /** From the address (the snippet's `lang`). */
  readonly requested?: unknown;
  /** The browser's languages. */
  readonly browser?: readonly string[] | string | null;
}

export function pickLanguage(choice: LanguageChoice): FormLanguage {
  const available = choice.available.filter(isFormLanguage);
  const has = (value: unknown): value is FormLanguage => isFormLanguage(value) && available.includes(value);
  if (has(choice.chosen)) return choice.chosen;
  if (has(choice.requested)) return choice.requested;
  const fromBrowser = browserLanguages(choice.browser).find(has);
  if (fromBrowser) return fromBrowser;
  return available.includes('en') ? 'en' : (available[0] ?? FORM_LANGUAGES[0]);
}
