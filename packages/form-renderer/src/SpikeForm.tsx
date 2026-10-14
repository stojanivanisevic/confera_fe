'use client';

// The form of the 0.1.0 embed spike (M1-FE-04). It is NOT the form renderer of
// 0.3.0 (ADR-09: a definition from the API, the rule interpreter); it is a
// small form built only from design-system components that already behaves
// the way the Spec asks of the real ones (section 4.3): the language is
// switched in place and keeps the values, authors repeat, words are counted,
// errors are summarised and tied to their fields, the thank-you appears in
// place, and a draft stays in the tab. Nothing is sent.
//
// The fields are plain controls with a name and no `value` from the page: the
// browser holds what the author types, also in the seconds before the scripts
// arrive, and the page reads it through a store (./form-values). That is the
// pattern the renderer of 0.3.0 keeps.
//
// The moment after Send (UX-M1-01, 02, 03, the pattern of 0.3.0):
//  - every rule of the form is checked (./rules); a failed Send moves the focus to the
//    summary of the errors, whose items are links to their fields; a successful one moves
//    it to the thank-you. Inside a frame the form also asks the page around to bring that
//    part into view (`onShow`), which Safari does not do for a focus inside a frame;
//  - Send can be pressed once the scripts are there (until then the button is disabled, and so
//    is Enter in a field: a browser's own submit would be a navigation, and Firefox stops
//    loading the page's scripts when one starts). The <form> has method="post" all the same,
//    with the form's own POST path as its action (204, apps/web/src/proxy.ts): whatever submits
//    it, the browser stays on the page with what was typed, and nothing goes into an address.
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';

import { Alert, Button, Checkbox, FormCard, LABELS_SR, LabelsProvider, Repeater, SegmentedTabs, TextButton, TextField, Textarea } from '@confera/ui';

import { createFormValueStore, useFormRef, useFormValues, type FormValues } from './form-values';
import { countWords, isEmailAddress, wordsOver } from './rules';
import { draftStorage } from './safe-storage';
import styles from './spike-form.module.css';
import { countOf, fill, FORM_LANGUAGES, SPIKE_FORM_TEXTS, type FormLanguage } from './texts';

const MAX_WORDS = 300;

/** A row of the authors. Its fields are the controls named `authors.<key>.name` and `authors.<key>.email`. */
interface AuthorRow {
  key: number;
}
const authorName = (row: AuthorRow) => `authors.${row.key}.name`;
const authorEmail = (row: AuthorRow) => `authors.${row.key}.email`;
/** The id of a field: its name, with the dots of the author rows made dashes. */
const fieldId = (name: string) => `field-${name.replaceAll('.', '-')}`;

/** What is kept in the tab: the two long texts. */
function parseDraft(text: string | null): FormValues {
  if (!text) return {};
  try {
    const value = JSON.parse(text) as { title?: unknown; abstract?: unknown } | null;
    const draft: Record<string, string> = {};
    if (typeof value?.title === 'string') draft.title = value.title;
    if (typeof value?.abstract === 'string') draft.abstract = value.abstract;
    return draft;
  } catch {
    return {};
  }
}

/**
 * Brings a part of the form into view and gives it the focus. A focus alone does not scroll in
 * every engine (WebKit leaves a part above the window where it is), so the scroll is asked first.
 */
function land(element: HTMLElement): void {
  element.scrollIntoView({ block: 'nearest' });
  element.focus({ preventScroll: true });
}

const subscribeToNothing = () => () => undefined;
/** False in the server markup, true once the browser has attached the form. */
const useHydrated = () => useSyncExternalStore(subscribeToNothing, () => true, () => false);
const usePersistentStorage = () => useSyncExternalStore(subscribeToNothing, () => draftStorage().persistent, () => true);

/** One error: the field it belongs to and what to do. */
interface Problem {
  readonly id: string;
  readonly message: string;
}

export interface SpikeFormProps {
  /** The form's address part. */
  slug: string;
  /** Inside a frame: asks the page around to bring this part of the form into view. */
  onShow?: (element: HTMLElement) => void;
}

export function SpikeForm({ slug, onShow }: SpikeFormProps) {
  const storageKey = `confera:draft:${slug}`;
  const [store] = useState(() => createFormValueStore());
  const values = useFormValues(store);
  const formRef = useFormRef(store);
  const [language, setLanguage] = useState<FormLanguage>('en');
  const [authors, setAuthors] = useState<AuthorRow[]>([{ key: 1 }]);
  const [checked, setChecked] = useState(false);
  const [failedSends, setFailedSends] = useState(0);
  const [sent, setSent] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const thanksRef = useRef<HTMLDivElement>(null);
  const persistent = usePersistentStorage();
  const hydrated = useHydrated();
  const t = SPIKE_FORM_TEXTS[language];

  const value = (name: string) => values[name] ?? '';
  const saveDraft = () => {
    const now = store.getSnapshot();
    draftStorage().set(storageKey, JSON.stringify({ title: now.title ?? '', abstract: now.abstract ?? '' }));
  };

  // Once the form is attached: a draft kept in this tab goes into the fields the author has
  // not touched. What was typed before the scripts arrived stays, and is kept as the draft.
  useEffect(() => {
    store.fillUntouched(parseDraft(draftStorage().get(storageKey)));
    const now = store.getSnapshot();
    if ((now.title ?? '') !== '' || (now.abstract ?? '') !== '') draftStorage().set(storageKey, JSON.stringify({ title: now.title ?? '', abstract: now.abstract ?? '' }));
  }, [store, storageKey]);
  // Rows and the fields themselves come and go without an input event: the store looks again.
  useEffect(() => {
    store.refresh();
  }, [store, authors.length, sent]);

  // Every failed Send: the summary comes into view and takes the focus, so it is also read out again.
  useEffect(() => {
    if (failedSends === 0 || !summaryRef.current) return;
    land(summaryRef.current);
    onShow?.(summaryRef.current);
  }, [failedSends, onShow]);
  // A successful Send: the same for the thank-you.
  useEffect(() => {
    if (!sent || !thanksRef.current) return;
    land(thanksRef.current);
    onShow?.(thanksRef.current);
  }, [sent, onShow]);

  const chooseLanguage = (next: string) => {
    const chosen = FORM_LANGUAGES.find((l) => l === next) ?? 'en';
    setLanguage(chosen);
    document.documentElement.lang = chosen; // the frame is its own document: its language follows the form
  };

  // Every rule of the form (./rules), in the order of the fields.
  const words = countWords(value('abstract'));
  const over = wordsOver(value('abstract'), MAX_WORDS);
  const errors = new Map<string, string>();
  if (value('title').trim() === '') errors.set('title', t.titleRequired);
  if (over > 0) errors.set('abstract', fill(t.wordsOver, { count: words, max: MAX_WORDS, over: countOf(over, t.word, language) }));
  authors.forEach((row, index) => {
    if (value(authorName(row)).trim() === '') errors.set(authorName(row), fill(t.nameRequired, { n: index + 1 }));
    const email = value(authorEmail(row)).trim();
    if (index === 0 && email === '') errors.set(authorEmail(row), t.emailRequired);
    else if (email !== '' && !isEmailAddress(email)) errors.set(authorEmail(row), t.emailInvalid);
  });
  if (value('consent') === '') errors.set('consent', t.consentRequired);
  const problems: Problem[] = [...errors].map(([name, message]) => ({ id: fieldId(name), message }));
  /** The error of a field once Send was pressed; the word limit shows at once. */
  const errorOf = (name: string) => (checked || name === 'abstract' ? errors.get(name) : undefined);
  const show = checked && problems.length > 0;

  const submit = () => {
    setChecked(true);
    if (problems.length > 0) {
      setFailedSends((count) => count + 1);
      return;
    }
    draftStorage().remove(storageKey);
    setSent(true);
  };
  const again = () => {
    setAuthors([{ key: 1 }]);
    setChecked(false);
    setFailedSends(0);
    setSent(false);
  };
  const goTo = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault(); // no #fragment in the address, and the field gets the focus, not only the view
    document.getElementById(id)?.focus();
  };

  const body = sent ? (
    <div className={styles.all}>
      <div ref={thanksRef} tabIndex={-1} className={styles.landing} data-confera-thanks="">
        <Alert tone="success" title={t.thanksTitle}>
          {t.thanksText}
        </Alert>
      </div>
      <TextButton icon="plus" onClick={again}>
        {t.again}
      </TextButton>
    </div>
  ) : (
    <>
      {show ? (
        <div ref={summaryRef} tabIndex={-1} className={`${styles.all} ${styles.landing}`} data-confera-errors="">
          <Alert tone="error" title={t.errorsTitle}>
            <ul className={styles.list}>
              {problems.map((problem) => (
                <li key={problem.id}>
                  <a href={`#${problem.id}`} onClick={goTo(problem.id)}>
                    {problem.message}
                  </a>
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}
      <div className={styles.all}>
        <TextField id={fieldId('title')} label={t.paperTitle} name="title" required status={errorOf('title') ? 'error' : 'default'} message={errorOf('title')} />
      </div>
      <div className={styles.all}>
        <Textarea
          id={fieldId('abstract')}
          label={t.abstract}
          name="abstract"
          rows={5}
          status={errorOf('abstract') ? 'error' : 'default'}
          message={errorOf('abstract') ?? fill(t.words, { count: words, max: MAX_WORDS })}
        />
      </div>
      <div className={styles.all}>
        <Repeater<AuthorRow>
          label={t.authors}
          items={authors}
          onChange={setAuthors}
          min={1}
          max={8}
          addLabel={t.addAuthor}
          removeLabel={t.removeAuthor}
          message={t.authorsNote}
          renderRow={(row, index) => {
            const nameError = errorOf(authorName(row));
            const emailError = errorOf(authorEmail(row));
            return (
              <>
                <TextField
                  id={fieldId(authorName(row))}
                  label={fill(t.authorName, { n: index + 1 })}
                  name={authorName(row)}
                  required
                  status={nameError ? 'error' : 'default'}
                  message={nameError}
                />
                <TextField
                  id={fieldId(authorEmail(row))}
                  label={fill(t.authorEmail, { n: index + 1 })}
                  name={authorEmail(row)}
                  type="email"
                  icon="mail"
                  required={index === 0}
                  status={emailError ? 'error' : 'default'}
                  message={emailError ?? (index === 0 ? t.authorEmailHint : undefined)}
                />
              </>
            );
          }}
        />
      </div>
      <div className={styles.all}>
        <Checkbox id={fieldId('consent')} label={t.consent} name="consent" required status={errorOf('consent') ? 'error' : 'default'} message={errorOf('consent')} />
      </div>
      <p className={styles.note}>{persistent ? t.draftKept : t.draftInMemory}</p>
    </>
  );

  return (
    <LabelsProvider labels={language === 'sr' ? LABELS_SR : {}}>
      <div className={styles.form} data-confera-form={slug} data-hydrated={hydrated ? 'true' : 'false'} lang={language}>
        <h1 className={styles.heading}>{t.heading}</h1>
        <SegmentedTabs
          label={t.language}
          value={language}
          onChange={chooseLanguage}
          options={[
            { value: 'en', label: 'English' },
            { value: 'sr', label: 'Srpski' },
          ]}
        />
        <noscript>
          <p className={styles.note}>{t.noScript}</p>
        </noscript>
        <form
          ref={formRef}
          method="post"
          action={`/f/${slug}/send`}
          noValidate
          onChange={saveDraft}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <FormCard
            title={t.intro}
            actions={
              sent ? null : (
                <Button type="submit" disabled={!hydrated}>
                  {t.submit}
                </Button>
              )
            }
          >
            {body}
          </FormCard>
        </form>
      </div>
    </LabelsProvider>
  );
}
