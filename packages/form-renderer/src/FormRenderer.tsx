'use client';

/**
 * The form renderer (M3-FE-01, M3-FE-02; ADR-09): a published form definition becomes the fields
 * of the design system, in the author's language, hosted or inside a conference site's frame.
 *
 * What it keeps from the 0.1.0 spike, and the README holds:
 *  - the fields are plain controls with a name and no `value` from the page; the browser holds what
 *    is typed, also in the seconds before the scripts arrive, and the page reads it through a store
 *    (./form-values). The draft of the tab is written only into controls the author has not touched;
 *  - Send is disabled until the scripts are there, the <form> posts to the 204 path of the proxy, and
 *    nothing typed ever goes into an address;
 *  - a failed Send moves the focus to the summary of the errors, every time; its items are links to
 *    their fields; a successful Send moves it to the thank-you; inside a frame the page around is
 *    asked to bring that part into view (decision D1).
 * New in 0.3.0:
 *  - the fields, rules and conditions come from the definition (confera_be's schema 1) and are
 *    checked by the interpreter of ./rules, which the API runs too; the API's refusals (422, path and
 *    code) come back to the same fields in the same words;
 *  - the block of authors with the limit of the form (D7), focus and an announcement after adding, a
 *    question before a block that holds data is removed (D4, inline: no dialog in a form, ADR-07)
 *    and a line when another author becomes the corresponding author (UX-M1-09, 10);
 *  - fields and sections shown on a condition (the paper, the employer's data, FR-FORM-05);
 *  - files uploaded at once with their progress (./FileField);
 *  - the language opens as decided (D2), switches in place and keeps every value (FR-FORM-09);
 *  - the draft keeps every field but files and the consent, the blocks and the language (D3), and
 *    where storage is refused the tab asks before it closes (FR-FORM-18, UX-M1-13);
 *  - one submit per form instance: a single-use token fetched by the page, a proof-of-work when the
 *    API asks for one, an Idempotency-Key kept with the draft (FR-FORM-14, ADR-08);
 *  - closed and not-yet-open states, the thank-you with the reference (FR-DL-02, FR-FORM-15);
 *  - the consent with the conference's links (D6).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';

import { Alert, Button, Checkbox, FormCard, LABELS_SR, LabelsProvider, PageHeader, RadioGroup, Repeater, SegmentedTabs, Select, Spinner, TextButton, TextField, Textarea } from '@confera/ui';

import { textOf, type FieldDefinition, type FormDefinition, type PublishedForm, type SectionDefinition } from './definition';
import { draftKey, hasTyped, readDraft, writeDraft } from './draft';
import { FileField, type FileState } from './FileField';
import { createFormValueStore, useFormRef, useFormValues, type FormValues } from './form-values';
import { fill, FORM_TEXTS, plural, type FormLanguage } from './i18n/catalogue';
import { formatDate, zoneName } from './i18n/format';
import { blockTitle, messageFor } from './messages';
import { browserApi, MINIMUM_FILL_MS, PublicApiError, solveProofOfWork, TOKEN_CODES, TRAP_FIELD, type FormToken, type PublicApi, type SubmitBody } from './public-api';
import { checkAnswers, countWords, holds, isShown, pathOf, type AnswerValue, type Answers, type RuleError } from './rules';
import { draftStorage, type DraftStorage } from './safe-storage';
import { SafeText } from './safe-text';
import styles from './form.module.css';

// ---- names and ids -------------------------------------------------------------------------

/** The name of a field's control: its key, or `<section>.<row key>.<key>` in the repeating section. */
export const controlName = (field: string, block?: { key: string; row: number }): string => (block ? `${block.key}.${block.row}.${field}` : field);
/** The id of a field: its name, with the dots of the blocks made dashes. */
export const fieldId = (name: string): string => `field-${name.replaceAll('.', '-')}`;

type Rows = Readonly<Record<string, readonly number[]>>;

const initialRows = (definition: FormDefinition): Rows =>
  Object.fromEntries(definition.sections.filter((s) => s.repeat).map((s) => [s.key, Array.from({ length: Math.max(1, s.repeat?.min ?? 1) }, (_, i) => i + 1)]));

/** A file on its way counts as given while the form checks itself; Send waits for it (`uploadPending`). */
const PENDING_UPLOAD = '00000000-0000-4000-8000-000000000000';
const isUploading = (state: FileState | null | undefined): boolean => !!state && state.progress !== undefined && !state.uploadId && !state.error;

/** The answers as the rules read them and the API takes them: from the controls, the blocks and the files. */
export function answersOf(definition: FormDefinition, values: FormValues, rows: Rows, files: Readonly<Record<string, FileState | null>>): Answers {
  const answers = Object.create(null) as Answers;
  for (const section of definition.sections) {
    if (section.repeat) {
      answers[section.key] = (rows[section.key] ?? []).map((row, index) => {
        const block = Object.create(null) as Record<string, AnswerValue>;
        for (const field of section.fields) {
          if (field.onlyFirstInRepeat && index > 0) continue; // no control of its own in a later block
          block[field.key] = values[controlName(field.key, { key: section.key, row })] ?? '';
        }
        return block;
      });
      continue;
    }
    for (const field of section.fields) {
      if (field.kind === 'file') answers[field.key] = files[field.key]?.uploadId ?? (isUploading(files[field.key]) ? PENDING_UPLOAD : '');
      else if (field.kind === 'consent') answers[field.key] = (values[field.key] ?? '') !== '';
      else answers[field.key] = values[field.key] ?? '';
    }
  }
  return answers;
}

/** The name of the control an error's path names. */
function nameOfPath(definition: FormDefinition, path: string, rows: Rows): string {
  const block = /^([a-zA-Z]+)\[(\d+)\]\.([a-zA-Z]+)$/.exec(path);
  if (block) {
    const row = rows[block[1] ?? '']?.[Number(block[2])];
    return row === undefined ? (block[1] ?? '') : controlName(block[3] ?? '', { key: block[1] ?? '', row });
  }
  const section = definition.sections.find((s) => s.repeat && s.key === path);
  if (section) {
    const row = rows[section.key]?.[0];
    const first = section.fields[0];
    return first && row !== undefined ? controlName(first.key, { key: section.key, row }) : path;
  }
  return path;
}
/** The id of the control an error's path names (the summary's link). */
const idOfPath = (definition: FormDefinition, path: string, rows: Rows): string => fieldId(nameOfPath(definition, path, rows));

/** The place of every path in the order of the form's fields: errors are listed in that order. */
function pathOrder(definition: FormDefinition, rows: Rows): Map<string, number> {
  const order = new Map<string, number>();
  for (const section of definition.sections) {
    if (section.repeat) {
      order.set(section.key, order.size);
      (rows[section.key] ?? []).forEach((_, index) => {
        for (const field of section.fields) order.set(pathOf(field.key, { key: section.key, index }), order.size);
      });
    } else for (const field of section.fields) order.set(field.key, order.size);
  }
  return order;
}

// ---- small hooks -------------------------------------------------------------------------

const subscribeToNothing = () => () => undefined;
/** False in the server markup, true once the browser has attached the form. */
const useHydrated = () => useSyncExternalStore(subscribeToNothing, () => true, () => false);

/**
 * Brings a part of the form into view and gives it the focus. A focus alone does not scroll in
 * every engine (WebKit leaves a part above the window where it is), so the scroll is asked first.
 */
function land(element: HTMLElement): void {
  element.scrollIntoView({ block: 'nearest' });
  element.focus({ preventScroll: true });
}

/** The control to focus for an id: the element itself when it takes the focus, else the first control inside it. */
function focusable(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;
  if (element.matches('input:not([type="hidden"]), textarea, select, button, a[href]')) return element;
  return element.querySelector<HTMLElement>('[role="button"][tabindex="0"], input:not([type="hidden"]), textarea, select, button') ?? element;
}

const newKey = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000'.replace(/0/g, () => Math.floor(Math.random() * 16).toString(16));

/** A choice of this many options or fewer is a group of radio buttons; more are a list. */
const RADIO_LIMIT = 6;

// ---- the component ---------------------------------------------------------------------------

export interface FormRendererProps {
  readonly form: PublishedForm;
  /** The language the server chose (D2): the snippet's, else the browser's. The draft's wins after attaching. */
  readonly language: FormLanguage;
  /** Inside a conference site's frame: no heading of its own on show (D5). */
  readonly embedded?: boolean;
  /** Inside a frame: asks the page around to bring this part of the form into view (D1). */
  readonly onShow?: (element: HTMLElement) => void;
  /** The public API; tests give one of their own. */
  readonly api?: PublicApi;
  /** The draft storage of this tab; tests give one of their own. */
  readonly storage?: () => DraftStorage;
  /** The admin's preview of a draft: no heading and no title of the page of its own, and Send says that nothing is sent. */
  readonly preview?: boolean;
}

interface SendProblem {
  readonly title: string;
  readonly text: string;
}

/** The token of this page: `got` and `receivedAt` (the page's clock) once it has arrived. */
interface TokenEntry {
  promise: Promise<FormToken>;
  proof: Promise<string | null>;
  got?: FormToken;
  receivedAt?: number;
}

export function FormRenderer(props: FormRendererProps) {
  const [language, setLanguage] = useState<FormLanguage>(props.language);
  const [instance, setInstance] = useState(0);
  const hydrated = useHydrated();
  const { form } = props;
  const t = FORM_TEXTS[language];
  const title = textOf(form.definition.texts.title, language);

  // The frame and the hosted page are documents of their own: their language and title follow the form.
  useEffect(() => {
    if (props.preview) return;
    document.documentElement.lang = language;
    document.title = fill(t.page.title, { title, conference: form.conference.name });
  }, [props.preview, language, t, title, form.conference.name]);

  const switcher = (
    <SegmentedTabs
      label={t.language}
      value={language}
      onChange={(next) => {
        const chosen = form.conference.languages.find((l) => l === next);
        if (chosen) setLanguage(chosen);
      }}
      options={form.conference.languages.map((value) => ({ value, label: FORM_TEXTS[value].languageNames[value], lang: value }))}
    />
  );
  const intro = textOf(form.definition.texts.intro, language);

  return (
    <LabelsProvider labels={language === 'sr' ? LABELS_SR : {}}>
      <div className={styles.form} data-confera-form={form.slug} data-hydrated={hydrated ? 'true' : 'false'} lang={language}>
        {props.preview ? null : props.embedded ? <h1 className="ud-sr">{title}</h1> : <PageHeader title={title} description={form.conference.name} />}
        {form.conference.languages.length > 1 ? <div data-confera-language="">{switcher}</div> : null}
        {/* The intro speaks to a person who fills the form in: a closed form shows its closed text instead (UX3-13). */}
        {intro && form.state === 'open' ? (
          <p className={styles.intro}>
            <SafeText text={intro} newTab={t.consent.newTab} links={form.conference.links} />
          </p>
        ) : null}
        {form.state === 'open' ? (
          <FormInstance key={instance} {...props} language={language} onLanguage={setLanguage} onAgain={() => setInstance((n) => n + 1)} fresh={instance > 0} />
        ) : (
          <Closed form={form} language={language} />
        )}
      </div>
    </LabelsProvider>
  );
}

function Closed({ form, language }: { form: PublishedForm; language: FormLanguage }) {
  const t = FORM_TEXTS[language].states;
  const contact = form.conference.contactEmail ? ` ${fill(t.contact, { email: form.conference.contactEmail })}` : '';
  if (form.state === 'not_open') {
    return (
      <div data-confera-state="not-open">
        <Alert tone="info" title={t.notOpenTitle}>
          {t.notOpenText}
          {contact}
        </Alert>
      </div>
    );
  }
  // The date only when the deadline closed it; the office may close a form before its deadline (UX3-03).
  const date = form.deadline && form.closedReason !== 'conference_closed' ? ` ${endSentence(fill(t.closedText, { date: formatDate(form.deadline, language, form.conference.timeZone) }))}` : '';
  return (
    <div data-confera-state="closed">
      <Alert tone="info" title={t.closedTitle}>
        <SafeText text={textOf(form.definition.texts.closed, language)} newTab={FORM_TEXTS[language].consent.newTab} links={form.conference.links} />
        {date}
        {contact}
      </Alert>
    </div>
  );
}

interface InstanceProps extends FormRendererProps {
  readonly onLanguage: (language: FormLanguage) => void;
  readonly onAgain: () => void;
  /** After "Send another": the new form takes the focus and says that it is ready (UX3-15). */
  readonly fresh?: boolean;
}

/** A date that ends with its own full stop ("10.10.2026.") ends the sentence too: no "10.10.2026.." (UX3-16). */
const endSentence = (text: string): string => text.replace(/(\d)\.\./g, '$1.');

function FormInstance({ form, language, onLanguage, onAgain, onShow, fresh = false, api = browserApi, storage = draftStorage }: InstanceProps) {
  // (`preview` reaches the instance through `api` and `storage`: the admin gives ones that send and keep nothing.)
  const definition = form.definition;
  const t = FORM_TEXTS[language];
  const key = draftKey(form.slug, form.version);
  const [store] = useState(() => createFormValueStore());
  const values = useFormValues(store);
  const formRef = useFormRef(store);
  const hydrated = useHydrated();
  const persistent = useSyncExternalStore(subscribeToNothing, () => storage().persistent, () => true);

  const [rows, setRows] = useState<Rows>(() => initialRows(definition));
  const nextRowKey = useRef(100);
  const [files, setFiles] = useState<Record<string, FileState | null>>({});
  const [checked, setChecked] = useState(false);
  const [failedSends, setFailedSends] = useState(0);
  const [serverErrors, setServerErrors] = useState<readonly RuleError[]>([]);
  const [phase, setPhase] = useState<'editing' | 'sending' | 'checking' | 'sent'>('editing');
  const [reference, setReference] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string>('');
  const [problem, setProblem] = useState<SendProblem | null>(null);
  const [asking, setAsking] = useState<{ section: string; row: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  /** Says a text in the polite live region; the same text twice is said twice (a second refusal of the same file). */
  const announce = useCallback((text: string) => setAnnouncement((current) => (current === text ? `${text}\u00a0` : text)), []);
  const starExplained = textOf(definition.texts.intro, language).includes('*');
  const [correspondingNote, setCorrespondingNote] = useState('');
  const [restored, setRestored] = useState<'no' | 'rows' | 'done'>('no');
  const [draftValues, setDraftValues] = useState<FormValues | null>(null);
  /** The control that takes the focus after the next render (a block added or removed, a question answered). */
  const focusNext = useRef<string | null>(null);
  const idempotency = useRef<string>('');
  const token = useRef<TokenEntry | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const thanksRef = useRef<HTMLDivElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLDivElement>(null);

  const answers = useMemo(() => answersOf(definition, values, rows, files), [definition, values, rows, files]);
  const checkedAnswers = useMemo(() => checkAnswers(definition, answers), [definition, answers]);
  const clientErrors = useMemo(() => (checkedAnswers.ok ? [] : checkedAnswers.errors), [checkedAnswers]);
  const pendingFiles = useMemo(() => Object.entries(files).filter(([, state]) => isUploading(state)).map(([fieldKey]) => fieldKey), [files]);

  // ---- the token (ADR-08): fetched once the form is attached, so the API can measure the fill time.
  // `refused`: the token it replaces (refused by the API, or expired), for the API's renewal (Q3-01).
  const ensureToken = useCallback(
    (refused?: string): Promise<FormToken> => {
      if (!token.current) {
        const promise = refused === undefined ? api.token(form.slug) : api.token(form.slug, refused);
        const entry: TokenEntry = { promise, proof: Promise.resolve(null) };
        entry.proof = promise.then((got) => {
          entry.got = got;
          entry.receivedAt = Date.now();
          return got.proofOfWork ? solveProofOfWork(got.proofOfWork.challenge, got.proofOfWork.difficulty) : null;
        });
        entry.proof.catch(() => undefined);
        token.current = entry;
        promise.catch(() => {
          if (token.current === entry) token.current = null;
        });
      }
      return token.current.promise;
    },
    [api, form.slug],
  );
  useEffect(() => {
    ensureToken().catch(() => undefined);
  }, [ensureToken]);

  // ---- the draft (D3) -----------------------------------------------------------------------
  // The storage of the tab is an outside system that exists only in the browser: it is read once
  // the form is attached (the server's markup has no draft), and what it holds is taken over in
  // two steps: first the blocks and the language, then, once those blocks are rendered, the
  // values, into the controls the author has not touched.
  useEffect(() => {
    const draft = readDraft(storage(), key);
    idempotency.current = draft?.idempotencyKey ?? newKey();
    const next: Record<string, number[]> = {};
    for (const section of definition.sections) {
      const kept = section.repeat ? draft?.rows[section.key] : undefined;
      if (section.repeat && kept && kept.length >= section.repeat.min && kept.length <= section.repeat.max) next[section.key] = [...kept];
    }
    if (Object.keys(next).length > 0) nextRowKey.current = Math.max(nextRowKey.current, ...Object.values(next).flat()) + 1;
    let current = true;
    void Promise.resolve().then(() => {
      if (!current) return;
      if (draft?.language && form.conference.languages.includes(draft.language)) onLanguage(draft.language);
      if (Object.keys(next).length > 0) setRows((rowsNow) => ({ ...rowsNow, ...next }));
      setDraftValues(draft?.values ?? null);
      setRestored('rows');
    });
    return () => {
      current = false;
    };
    // Read once, when the form is attached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (restored !== 'rows') return undefined;
    if (draftValues) store.fillUntouched(draftValues);
    let current = true;
    void Promise.resolve().then(() => {
      if (current) setRestored('done');
    });
    return () => {
      current = false;
    };
  }, [restored, draftValues, store]);

  const saveDraft = useCallback(() => {
    if (restored !== 'done' || phase === 'sent') return;
    writeDraft(storage(), key, { language, values: store.getSnapshot(), rows, idempotencyKey: idempotency.current });
  }, [restored, phase, storage, key, language, store, rows]);
  // A change of the blocks or of the language is kept too, not only typing.
  useEffect(() => {
    saveDraft();
  }, [saveDraft]);
  // Blocks and fields come and go without an input event: the store looks again.
  useEffect(() => {
    store.refresh();
  }, [store, rows, phase]);

  // Where the browser refuses storage, the tab asks before it closes while something is typed (UX-M1-13).
  const unsaved = !persistent && phase !== 'sent' && hasTyped(values);
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // ---- focus ----------------------------------------------------------------------------
  // A switch of the language is said, and the focus stays on the switch (UX3-14).
  const [shownLanguage, setShownLanguage] = useState(language);
  if (shownLanguage !== language) {
    setShownLanguage(language);
    setAnnouncement(t.languageNow);
  }
  // After "Send another": the first field of the new form has the focus, and it is said (UX3-15).
  useEffect(() => {
    if (!fresh || !hydrated) return;
    const first = definition.sections[0];
    const field = first?.fields[0];
    const row = first?.repeat ? (rows[first.key] ?? [])[0] : undefined;
    const id = first && field ? fieldId(controlName(field.key, first.repeat && row !== undefined ? { key: first.key, row } : undefined)) : null;
    const element = id ? focusable(document.getElementById(id)) : null;
    if (element) land(element);
    // Said once the region is in the page, so that it is heard as a change.
    const timer = setTimeout(() => announce(t.states.ready), 0);
    return () => clearTimeout(timer);
    // Once, when the new form is attached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, hydrated]);
  useEffect(() => {
    if (failedSends === 0 || !summaryRef.current) return;
    land(summaryRef.current);
    onShow?.(summaryRef.current);
  }, [failedSends, onShow]);
  useEffect(() => {
    if (phase !== 'sent' || !thanksRef.current) return;
    land(thanksRef.current);
    onShow?.(thanksRef.current);
  }, [phase, onShow]);
  useEffect(() => {
    if (!problem || !problemRef.current) return;
    land(problemRef.current);
    onShow?.(problemRef.current);
  }, [problem, onShow]);
  useEffect(() => {
    if (asking && askRef.current) land(askRef.current);
  }, [asking]);
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    focusNext.current = null;
    const element = focusable(document.getElementById(id));
    if (element) land(element);
  });

  // ---- errors ---------------------------------------------------------------------------
  const shownErrors: RuleError[] = useMemo(() => {
    if (!checked) return clientErrors.filter((e) => e.code === 'tooManyWords'); // the word limit shows at once
    const own = [...clientErrors, ...pendingFiles.map((path) => ({ path, code: 'uploadPending' }))];
    const paths = new Set(own.map((e) => e.path));
    const order = pathOrder(definition, rows);
    const at = (path: string) => order.get(path) ?? order.size;
    return [...own, ...serverErrors.filter((e) => !paths.has(e.path))].sort((a, b) => at(a.path) - at(b.path));
  }, [checked, clientErrors, serverErrors, pendingFiles, definition, rows]);
  const messageOf = (error: RuleError, named = false) => messageFor(error, definition, language, values[nameOfPath(definition, error.path, rows)] ?? '', {}, { named });
  const errorOf = (path: string): string | undefined => {
    const error = shownErrors.find((e) => e.path === path);
    return error ? messageOf(error) : undefined;
  };

  // ---- blocks -----------------------------------------------------------------------------
  const rowHasData = (section: SectionDefinition, row: number) => section.fields.some((f) => (values[controlName(f.key, { key: section.key, row })] ?? '').trim() !== '');
  const firstControlId = (section: SectionDefinition, row: number) => {
    const first = section.fields[0];
    return first ? fieldId(controlName(first.key, { key: section.key, row })) : null;
  };
  /** The name of the person of a block, from its text fields of a name ("Ana Živković"). */
  const nameOf = (section: SectionDefinition, row: number) => {
    const names = section.fields.filter((f) => f.kind === 'text' && f.rules.noUrl && f.autocomplete !== 'organization').slice(0, 2);
    return names
      .map((f) => (values[controlName(f.key, { key: section.key, row })] ?? '').trim())
      .filter(Boolean)
      .join(' ');
  };

  const removeRow = (section: SectionDefinition, row: number) => {
    const list = rows[section.key] ?? [];
    const index = list.indexOf(row);
    if (index < 0 || !section.repeat || list.length <= section.repeat.min) return;
    const next = list.filter((k) => k !== row);
    setRows({ ...rows, [section.key]: next });
    setAsking(null);
    setAnnouncement(fill(t.authors.removed, { n: index + 1 }));
    // The block that takes its place, or the one before it when the last one went (as the design system's Repeater does).
    const target = next[Math.min(index, next.length - 1)];
    if (target !== undefined) focusNext.current = firstControlId(section, target);
    if (index === 0 && next[0] !== undefined) {
      const name = nameOf(section, next[0]);
      setCorrespondingNote(name ? fill(t.authors.correspondingChanged, { name }) : '');
    }
  };

  const changeRows = (section: SectionDefinition, items: readonly { key: number }[]) => {
    const list = rows[section.key] ?? [];
    const keys = items.map((item) => item.key);
    if (keys.length > list.length) {
      const added = keys.find((k) => !list.includes(k));
      setRows({ ...rows, [section.key]: keys });
      setAsking(null);
      setAnnouncement(fill(t.authors.added, { n: keys.length }));
      if (added !== undefined) focusNext.current = firstControlId(section, added);
      return;
    }
    const gone = list.find((k) => !keys.includes(k));
    if (gone === undefined) return;
    // D4: a block that holds data asks first, inside the form (no dialog in a form, ADR-07).
    if (rowHasData(section, gone)) setAsking({ section: section.key, row: gone });
    else removeRow(section, gone);
  };

  // ---- send -------------------------------------------------------------------------------
  /** Where the confirmation goes: the first email field of the form (the first author's). */
  const firstEmail = (kept: Answers): string => {
    for (const section of definition.sections) {
      const field = section.fields.find((f) => f.kind === 'email');
      if (!field) continue;
      const blocks = kept[section.key];
      const value = section.repeat ? (Array.isArray(blocks) ? blocks[0]?.[field.key] : undefined) : kept[field.key];
      if (typeof value === 'string' && value !== '') return value;
    }
    return '';
  };

  const explain = (error: unknown): SendProblem => {
    const p = t.problems;
    const contact = form.conference.contactEmail;
    if (error instanceof PublicApiError) {
      if (error.code === 'preview') return { title: p.previewTitle, text: p.previewText };
      if (error.status === 0) return { title: p.networkTitle, text: p.networkText };
      if (error.status === 429) return { title: p.tooManyTitle, text: fill(p.tooManyText, { minutes: Math.max(1, Math.ceil((error.retryAfterSeconds ?? 600) / 60)) }) };
      if (error.code === 'form_closed' || error.code === 'formClosed') return { title: p.closedTitle, text: p.closedText + (contact ? ` ${fill(t.states.contact, { email: contact })}` : '') };
      const traceId = error.traceId ?? '-';
      return { title: p.unknownTitle, text: contact ? fill(p.unknownTextContact, { email: contact, traceId }) : fill(p.unknownText, { traceId }) };
    }
    return { title: p.unknownTitle, text: contact ? fill(p.unknownTextContact, { email: contact, traceId: '-' }) : fill(p.unknownText, { traceId: '-' }) };
  };

  const send = async () => {
    setChecked(true);
    setProblem(null);
    setServerErrors([]);
    if (!checkedAnswers.ok || pendingFiles.length > 0) {
      setFailedSends((n) => n + 1);
      return;
    }
    const kept = checkedAnswers.answers;
    setPhase('sending');
    // A token that expired while the author typed (6 hours) is replaced before it is sent.
    const held = token.current?.got;
    if (held?.expiresAt && Date.parse(held.expiresAt) <= Date.now()) token.current = null;
    let refused = held && token.current === null ? held.token : undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const got = await ensureToken(refused);
        const current = token.current!;
        // The proof-of-work is mostly done while the author types; a Send that has to wait for it says so after a second (Q3-08).
        const slow = setTimeout(() => setPhase('checking'), 1_000);
        const counter = await current.proof.finally(() => clearTimeout(slow));
        setPhase('sending');
        // Never sooner than the API's fill time after the token (Q3-01): a submit inside it is answered
        // with a success that stores nothing, and the thank-you would stand for nothing.
        const wait = (current.receivedAt ?? Date.now()) + (api.minimumFillMs ?? MINIMUM_FILL_MS) - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        const body: SubmitBody = {
          language,
          answers: kept,
          // The trap field of ADR-08: empty from a person (SEC-M3-07).
          [TRAP_FIELD]: values[TRAP_FIELD] ?? '',
          ...(counter !== null ? { proofOfWork: counter } : {}),
        };
        const result = await api.submit(form.slug, got.token, idempotency.current, body);
        storage().remove(key);
        setSentTo(firstEmail(kept));
        setReference(result.reference);
        setPhase('sent');
        return;
      } catch (error) {
        if (error instanceof PublicApiError && TOKEN_CODES.has(error.code) && attempt === 0) {
          // A new token, and the same idempotency key: the API answers a repeat with the first result.
          refused = token.current?.got?.token;
          token.current = null;
          continue;
        }
        setPhase('editing');
        if (error instanceof PublicApiError && error.code === 'validation_failed' && error.errors.length > 0) {
          setServerErrors(error.errors);
          setFailedSends((n) => n + 1);
        } else {
          setProblem(explain(error));
        }
        return;
      }
    }
  };

  const goTo = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault(); // no #fragment in the address, and the field gets the focus, not only the view
    focusable(document.getElementById(id))?.focus();
  };

  // ---- fields -------------------------------------------------------------------------------
  const options = (field: FieldDefinition) => (field.options ?? []).map((option) => ({ value: option.value, label: textOf(option.label, language) }));

  const renderField = (field: FieldDefinition, section: SectionDefinition, block?: { row: number; index: number }): ReactNode => {
    if (field.onlyFirstInRepeat && (block?.index ?? 0) !== 0) return null;
    const name = controlName(field.key, block ? { key: section.key, row: block.row } : undefined);
    const id = fieldId(name);
    const path = block ? pathOf(field.key, { key: section.key, index: block.index }) : field.key;
    const shown = isShown(field, answers, block?.index ?? null);
    const required = field.required;
    // In a block a label may name its block: "Email of author {n}" (each control has a name of its own).
    const label = fill(textOf(field.label, language), { n: (block?.index ?? 0) + 1 });
    const help = fill(textOf(field.help, language), { n: (block?.index ?? 0) + 1 });
    const error = shown ? errorOf(path) : undefined;
    const status = error ? 'error' : 'default';
    // Author 1 is usually the person filling in: the phone may offer her name and address; never for the co-authors (UX-M1-23).
    const autoComplete = block && block.index > 0 ? 'off' : (field.autocomplete ?? undefined);
    // In a block a screen reader hears which block the field belongs to ("Institution, Author 2").
    const describedBy = block ? `${fieldId(`${section.key}.${block.row}`)}-title` : undefined;
    const wide = field.kind === 'longText' || field.kind === 'choice' || field.kind === 'yesNo' || field.kind === 'consent' || field.kind === 'file';
    let control: ReactNode;
    switch (field.kind) {
      case 'longText': {
        const max = field.rules.maxWords;
        const counter = max !== null ? fill(t.words, { count: countWords(values[name] ?? ''), max }) : undefined;
        control = <Textarea id={id} label={label} name={name} rows={6} aria-describedby={describedBy} required={required} status={status} message={error ?? ([help, counter].filter(Boolean).join(' ') || undefined)} />;
        break;
      }
      case 'choice':
      case 'yesNo':
        control =
          field.kind === 'choice' && (field.options?.length ?? 0) > RADIO_LIMIT ? (
            <Select id={id} label={label} name={name} aria-describedby={describedBy} required={required} defaultValue="" placeholder={t.choose} options={options(field)} status={status} message={error ?? (help || undefined)} />
          ) : (
            <div id={id} tabIndex={-1}>
              <RadioGroup label={label} name={name} required={required} direction={field.kind === 'yesNo' ? 'row' : 'column'} options={options(field)} status={status} message={error ?? (help || undefined)} />
            </div>
          );
        break;
      case 'consent':
        control = (
          <Checkbox
            id={id}
            name={name}
            value="yes"
            required={required}
            label={<SafeText text={textOf(definition.texts.consent, language)} newTab={t.consent.newTab} links={form.conference.links} />}
            status={status}
            message={error}
          />
        );
        break;
      case 'file': {
        const rule = field.rules.file;
        if (!rule) return null;
        control = (
          <FileField
            id={id}
            fieldKey={field.key}
            label={label}
            required={required}
            rule={rule}
            language={language}
            state={files[field.key] ?? null}
            onState={(state) => setFiles((current) => ({ ...current, [field.key]: state }))}
            upload={(file, onProgress, signal) => ensureToken().then((got) => api.upload(form.slug, got.token, field.key, file, onProgress, signal))}
            error={error}
            announce={announce}
          />
        );
        break;
      }
      default:
        control = (
          <TextField
            id={id}
            label={label}
            name={name}
            type={field.kind === 'email' ? 'email' : field.autocomplete === 'tel' ? 'tel' : 'text'}
            inputMode={field.kind === 'email' ? 'email' : field.autocomplete === 'tel' ? 'tel' : undefined}
            icon={field.kind === 'email' ? 'mail' : undefined}
            autoComplete={autoComplete}
            aria-describedby={describedBy}
            spellCheck={field.kind === 'email' || field.rules.pattern ? false : undefined}
            required={required}
            status={status}
            message={error ?? (help || undefined)}
          />
        );
    }
    if (field.kind === 'file') return <div key={name} hidden={!shown}>{control}</div>;
    return (
      <div key={name} className={wide || block ? 'ud-span-all' : undefined} hidden={!shown} data-confera-field={path}>
        {control}
      </div>
    );
  };

  /** A section is a card of the design system, its label the card's heading (h2 under the page's h1). */
  const renderSection = (section: SectionDefinition): ReactNode => {
    const shown = holds(section.visibleWhen, answers);
    return (
      <div key={section.key} hidden={!shown} data-confera-section={section.key}>
        <FormCard title={section.repeat ? undefined : textOf(section.label, language) || undefined}>
          {section.repeat ? renderBlocks(section) : section.fields.map((field) => renderField(field, section))}
        </FormCard>
      </div>
    );
  };

  const renderBlocks = (section: SectionDefinition): ReactNode => {
    const repeat = section.repeat;
    if (!repeat) return null;
    const list = rows[section.key] ?? [];
    const atMax = list.length >= repeat.max;
    const contact = form.conference.contactEmail;
    const notice = repeat.noticeFrom && list.length >= repeat.noticeFrom ? textOf(repeat.notice, language) || t.authors.notice : '';
    const message = [
      t.authors.corresponding,
      correspondingNote,
      notice,
      // At the limit the line names whom to write to for more; without an address it would lead nowhere, so it is left out (D7, UX3-17).
      atMax && contact ? fill(t.authors.limit, { max: repeat.max, email: contact }) : '',
    ]
      .filter(Boolean)
      .join(' ');
    // The design system adds the number of the block to the name of its remove button ("Remove author 2").
    const removeLabel = textOf(repeat.removeLabel, language).replace(/\s*\{n\}\s*/g, ' ').trim() || t.authors.removeLabel;
    return (
      <div className="ud-span-all">
        <Repeater<{ key: number }>
          label={textOf(section.label, language) || undefined}
          items={list.map((row) => ({ key: row }))}
          onChange={(items) => changeRows(section, items)}
          newItem={() => ({ key: nextRowKey.current++ })}
          min={repeat.min}
          max={repeat.max}
          addLabel={textOf(repeat.addLabel, language) || t.authors.add}
          removeLabel={removeLabel}
          message={message}
          renderRow={(item, index) => {
            const name = nameOf(section, item.key);
            const isAsking = asking?.section === section.key && asking.row === item.key;
            return (
              <>
                <p id={`${fieldId(`${section.key}.${item.key}`)}-title`} className={`ud-span-all ${styles.blockTitle}`}>
                  {blockTitle(section, index + 1, language)}
                </p>
                {isAsking ? (
                  <div ref={askRef} tabIndex={-1} className={`ud-span-all ${styles.landing}`} data-confera-remove-question="">
                    <Alert
                      tone="warning"
                      title={name ? fill(t.authors.removeQuestion, { n: index + 1, name }) : fill(t.authors.removeQuestionNoName, { n: index + 1 })}
                      action={
                        <span className={styles.actions}>
                          <Button variant="dark" onClick={() => removeRow(section, item.key)}>
                            {t.authors.remove}
                          </Button>
                          <TextButton
                            onClick={() => {
                              setAsking(null);
                              focusNext.current = firstControlId(section, item.key);
                            }}
                          >
                            {t.authors.keep}
                          </TextButton>
                        </span>
                      }
                    />
                  </div>
                ) : null}
                {section.fields.map((field) => renderField(field, section, { row: item.key, index }))}
              </>
            );
          }}
        />
      </div>
    );
  };

  // ---- the page -------------------------------------------------------------------------------
  if (phase === 'sent') {
    return (
      <div className={styles.stack} data-confera-sent="">
        <div ref={thanksRef} tabIndex={-1} className={styles.landing} data-confera-thanks="">
          <Alert tone="success" title={t.states.thanksTitle[definition.type]}>
            <span className={styles.lines}>
              <span>
                <SafeText text={textOf(definition.texts.thankYou, language)} newTab={t.consent.newTab} links={form.conference.links} />
              </span>
              {sentTo ? <span>{fill(t.states.sentTo, { email: sentTo })}</span> : null}
              {reference ? <strong data-confera-reference="">{fill(t.states.reference, { reference })}</strong> : null}
            </span>
          </Alert>
        </div>
        <div>
          <TextButton icon="plus" onClick={onAgain}>
            {t.states.again[definition.type]}
          </TextButton>
        </div>
      </div>
    );
  }

  const summary = checked && shownErrors.length > 0;
  const busy = phase === 'sending' || phase === 'checking';
  const deadline = form.deadline ? fill(t.states.openUntil, { date: formatDate(form.deadline, language, form.conference.timeZone), zone: zoneName(form.conference.timeZone, language) }) : '';

  return (
    <form
      ref={formRef}
      method="post"
      action={`/f/${form.slug}/send`}
      noValidate
      onChange={saveDraft}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) void send();
      }}
      className={styles.stack}
      data-confera-phase={phase}
    >
      <noscript>
        <p className={styles.note}>{t.noScript}</p>
      </noscript>
      {/* One note of what the star means: the office's intro often says it already (UX3-13); the deadline on its own line. */}
      {starExplained ? null : <p className={styles.note}>{t.requiredNote}</p>}
      {deadline ? <p className={styles.note}>{deadline}</p> : null}
      {summary ? (
        <div ref={summaryRef} tabIndex={-1} className={styles.landing} data-confera-errors="" aria-describedby="confera-error-count">
          <Alert tone="error" title={t.errorsTitle[definition.type]}>
            <span id="confera-error-count" className="ud-sr">
              {plural(t.errorCount, shownErrors.length, language)}
            </span>
            <ul className={styles.list}>
              {shownErrors.map((error) => {
                const id = idOfPath(definition, error.path, rows);
                return (
                  <li key={`${error.path}:${error.code}`}>
                    <a className="ud-link" href={`#${id}`} onClick={goTo(id)}>
                      {messageOf(error, true)}
                    </a>
                  </li>
                );
              })}
            </ul>
          </Alert>
        </div>
      ) : null}
      {problem ? (
        <div ref={problemRef} tabIndex={-1} className={styles.landing} data-confera-problem="">
          <Alert tone="error" title={problem.title}>
            {problem.text}
          </Alert>
        </div>
      ) : null}
      {definition.sections.map(renderSection)}
      <FormCard
        actions={
          <Button type="submit" disabled={!hydrated || busy}>
            {busy ? (phase === 'checking' ? t.checking : t.sending) : textOf(definition.texts.submit, language) || t.send}
          </Button>
        }
      >
        {/* The trap field of ADR-08: no person sees it or reaches it; a script that fills it gets a fake success.
            SEC-M3-07: a name and a label no autofill heuristic maps, `autocomplete="off"` and the ignore hints of the
            password managers, so the browser never fills it for a person; the container is out of sight, hidden from
            assistive technology and inert, so neither Tab nor a screen reader reaches it. */}
        <div className="ud-sr" aria-hidden="true" inert data-confera-trap="">
          <label>
            Extra field
            <input
              type="text"
              name={TRAP_FIELD}
              tabIndex={-1}
              autoComplete="off"
              spellCheck={false}
              defaultValue=""
              data-1p-ignore=""
              data-lpignore="true"
              data-bwignore=""
              data-form-type="other"
            />
          </label>
        </div>
        <p className={`ud-span-all ${styles.note}`}>
          {restored === 'done' && draftValues && hasTyped(draftValues) ? `${t.draft.restored} ` : ''}
          {persistent ? t.draft.kept : t.draft.inMemory}
        </p>
        {busy ? (
          <div className="ud-span-all">
            <Spinner label={phase === 'checking' ? t.checking : t.sending} />
          </div>
        ) : null}
      </FormCard>
      <p className="ud-sr" role="status" aria-live="polite" data-confera-announce="">
        {announcement}
      </p>
    </form>
  );
}
