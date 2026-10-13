'use client';

// The form of the 0.1.0 embed spike (M1-FE-04). It is NOT the form renderer of
// 0.3.0 (ADR-09: a definition from the API, react-hook-form, the rule
// interpreter); it is a small form built only from design-system components
// that already behaves the way the Spec asks of the real ones (section 4.3):
// the language is switched in place and keeps the values, authors repeat,
// words are counted, errors are summarised and tied to their fields, the
// thank-you appears in place, and a draft stays in the tab. Nothing is sent.
import { useState, useSyncExternalStore } from 'react';

import { Alert, Button, Checkbox, FormCard, LABELS_SR, LabelsProvider, Repeater, SegmentedTabs, TextButton, TextField, Textarea } from '@confera/ui';

import { draftStorage } from './safe-storage';
import styles from './spike-form.module.css';
import { countWords, fill, FORM_LANGUAGES, SPIKE_FORM_TEXTS, type FormLanguage } from './texts';

const MAX_WORDS = 300;

interface Author {
  key: number;
  name: string;
  email: string;
}
interface Draft {
  title: string;
  abstract: string;
}
const EMPTY: Draft = { title: '', abstract: '' };

function parseDraft(text: string | null): Draft {
  if (!text) return EMPTY;
  try {
    const value = JSON.parse(text) as Partial<Draft>;
    return { title: typeof value.title === 'string' ? value.title : '', abstract: typeof value.abstract === 'string' ? value.abstract : '' };
  } catch {
    return EMPTY;
  }
}

// The draft is read once per form, after hydration: the server renders an empty form.
const firstRead = new Map<string, string | null>();
const subscribeToNothing = () => () => undefined;
function useStoredDraft(key: string): string | null {
  return useSyncExternalStore(
    subscribeToNothing,
    () => {
      if (!firstRead.has(key)) firstRead.set(key, draftStorage().get(key));
      return firstRead.get(key) ?? null;
    },
    () => null,
  );
}
/** False in the server markup, true once the browser has attached the form: until then typing is not seen. */
const useHydrated = () => useSyncExternalStore(subscribeToNothing, () => true, () => false);
const usePersistentStorage = () => useSyncExternalStore(subscribeToNothing, () => draftStorage().persistent, () => true);

export interface SpikeFormProps {
  /** The form's address part. */
  slug: string;
}

export function SpikeForm({ slug }: SpikeFormProps) {
  const key = `confera:draft:${slug}`;
  const stored = useStoredDraft(key);
  // The fields start from the draft: a new key when the draft arrives after hydration.
  return <SpikeFormFields key={stored ?? ''} storageKey={key} initial={parseDraft(stored)} />;
}

function SpikeFormFields({ storageKey, initial }: { storageKey: string; initial: Draft }) {
  const [language, setLanguage] = useState<FormLanguage>('en');
  const [title, setTitle] = useState(initial.title);
  const [abstract, setAbstract] = useState(initial.abstract);
  const [authors, setAuthors] = useState<Author[]>([{ key: 1, name: '', email: '' }]);
  const [consent, setConsent] = useState(false);
  const [checked, setChecked] = useState(false);
  const [sent, setSent] = useState(false);
  const persistent = usePersistentStorage();
  const hydrated = useHydrated();
  const t = SPIKE_FORM_TEXTS[language];

  const save = (draft: Draft) => draftStorage().set(storageKey, JSON.stringify(draft));
  const chooseLanguage = (value: string) => {
    const next = FORM_LANGUAGES.find((l) => l === value) ?? 'en';
    setLanguage(next);
    document.documentElement.lang = next; // the frame is its own document: its language follows the form
  };

  const errors = {
    title: title.trim() === '' ? t.titleRequired : null,
    authors: authors.some((a) => a.name.trim() === '') ? t.nameRequired : null,
    consent: consent ? null : t.consentRequired,
  };
  const problems = [errors.title, errors.authors, errors.consent].filter((e): e is string => e !== null);
  const show = checked && problems.length > 0;

  const submit = () => {
    setChecked(true);
    if (problems.length > 0) return;
    draftStorage().remove(storageKey);
    firstRead.delete(storageKey);
    setSent(true);
  };
  const again = () => {
    setTitle('');
    setAbstract('');
    setAuthors([{ key: 1, name: '', email: '' }]);
    setConsent(false);
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
        <TextField
          label={t.paperTitle}
          name="title"
          required
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            save({ title: e.target.value, abstract });
          }}
          status={show && errors.title ? 'error' : 'default'}
          message={show && errors.title ? errors.title : undefined}
        />
      </div>
      <div className={styles.all}>
        <Textarea
          label={t.abstract}
          name="abstract"
          rows={5}
          value={abstract}
          onChange={(e) => {
            setAbstract(e.target.value);
            save({ title, abstract: e.target.value });
          }}
          message={fill(t.words, { count: countWords(abstract), max: MAX_WORDS })}
        />
      </div>
      <div className={styles.all}>
        <Repeater<Author>
          label={t.authors}
          items={authors}
          onChange={setAuthors}
          min={1}
          max={8}
          newItem={() => ({ name: '', email: '' })}
          addLabel={t.addAuthor}
          removeLabel={t.removeAuthor}
          message={t.authorsNote}
          renderRow={(author, index, update) => (
            <>
              <TextField
                label={fill(t.authorName, { n: index + 1 })}
                required
                value={author.name}
                onChange={(e) => update({ name: e.target.value })}
                status={show && author.name.trim() === '' ? 'error' : 'default'}
                message={show && author.name.trim() === '' ? t.nameRequired : undefined}
              />
              <TextField label={fill(t.authorEmail, { n: index + 1 })} type="email" icon="mail" value={author.email} onChange={(e) => update({ email: e.target.value })} />
            </>
          )}
        />
      </div>
      <div className={styles.all}>
        <Checkbox label={t.consent} checked={consent} onChange={() => setConsent(!consent)} aria-invalid={show && errors.consent ? true : undefined} />
      </div>
      <p className={styles.note}>{persistent ? t.draftKept : t.draftInMemory}</p>
    </>
  );

  return (
    <LabelsProvider labels={language === 'sr' ? LABELS_SR : {}}>
      <div className={styles.form} data-confera-form={storageKey.slice('confera:draft:'.length)} data-hydrated={hydrated ? 'true' : 'false'} lang={language}>
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
          noValidate
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
