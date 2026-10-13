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
import { useEffect, useState, useSyncExternalStore } from 'react';

import { Alert, Button, Checkbox, FormCard, LABELS_SR, LabelsProvider, Repeater, SegmentedTabs, TextButton, TextField, Textarea } from '@confera/ui';

import { createFormValueStore, useFormRef, useFormValues, type FormValues } from './form-values';
import { draftStorage } from './safe-storage';
import styles from './spike-form.module.css';
import { countWords, fill, FORM_LANGUAGES, SPIKE_FORM_TEXTS, type FormLanguage } from './texts';

const MAX_WORDS = 300;

/** A row of the authors. Its fields are the controls named `authors.<key>.name` and `authors.<key>.email`. */
interface AuthorRow {
  key: number;
}
const authorName = (row: AuthorRow) => `authors.${row.key}.name`;
const authorEmail = (row: AuthorRow) => `authors.${row.key}.email`;

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

const subscribeToNothing = () => () => undefined;
/** False in the server markup, true once the browser has attached the form. */
const useHydrated = () => useSyncExternalStore(subscribeToNothing, () => true, () => false);
const usePersistentStorage = () => useSyncExternalStore(subscribeToNothing, () => draftStorage().persistent, () => true);

export interface SpikeFormProps {
  /** The form's address part. */
  slug: string;
}

export function SpikeForm({ slug }: SpikeFormProps) {
  const storageKey = `confera:draft:${slug}`;
  const [store] = useState(() => createFormValueStore());
  const values = useFormValues(store);
  const formRef = useFormRef(store);
  const [language, setLanguage] = useState<FormLanguage>('en');
  const [authors, setAuthors] = useState<AuthorRow[]>([{ key: 1 }]);
  const [checked, setChecked] = useState(false);
  const [sent, setSent] = useState(false);
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

  const chooseLanguage = (next: string) => {
    const chosen = FORM_LANGUAGES.find((l) => l === next) ?? 'en';
    setLanguage(chosen);
    document.documentElement.lang = chosen; // the frame is its own document: its language follows the form
  };

  const errors = {
    title: value('title').trim() === '' ? t.titleRequired : null,
    authors: authors.some((row) => value(authorName(row)).trim() === '') ? t.nameRequired : null,
    consent: value('consent') === '' ? t.consentRequired : null,
  };
  const problems = [errors.title, errors.authors, errors.consent].filter((e): e is string => e !== null);
  const show = checked && problems.length > 0;

  const submit = () => {
    setChecked(true);
    if (problems.length > 0) return;
    draftStorage().remove(storageKey);
    setSent(true);
  };
  const again = () => {
    setAuthors([{ key: 1 }]);
    setChecked(false);
    setSent(false);
  };

  const body = sent ? (
    <div className={styles.all}>
      <Alert tone="success" title={t.thanksTitle}>
        {t.thanksText}
      </Alert>
      <TextButton icon="plus" onClick={again}>
        {t.again}
      </TextButton>
    </div>
  ) : (
    <>
      {show ? (
        <div className={styles.all}>
          <Alert tone="error" title={t.errorsTitle}>
            <ul className={styles.list}>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}
      <div className={styles.all}>
        <TextField label={t.paperTitle} name="title" required status={show && errors.title ? 'error' : 'default'} message={show && errors.title ? errors.title : undefined} />
      </div>
      <div className={styles.all}>
        <Textarea label={t.abstract} name="abstract" rows={5} message={fill(t.words, { count: countWords(value('abstract')), max: MAX_WORDS })} />
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
            const missing = show && value(authorName(row)).trim() === '';
            return (
              <>
                <TextField label={fill(t.authorName, { n: index + 1 })} name={authorName(row)} required status={missing ? 'error' : 'default'} message={missing ? t.nameRequired : undefined} />
                <TextField label={fill(t.authorEmail, { n: index + 1 })} name={authorEmail(row)} type="email" icon="mail" />
              </>
            );
          }}
        />
      </div>
      <div className={styles.all}>
        <Checkbox label={t.consent} name="consent" aria-invalid={show && errors.consent ? true : undefined} />
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
        <form
          ref={formRef}
          noValidate
          onChange={saveDraft}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <FormCard title={t.intro} actions={sent ? null : <Button type="submit">{t.submit}</Button>}>
            {body}
          </FormCard>
        </form>
      </div>
    </LabelsProvider>
  );
}
