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
 *  - the rules come from the definition and are checked by the interpreter of ./rules, which the API
 *    runs too; the API's refusals (422, path and code) come back to the same fields in the same words;
 *  - repeated blocks (the authors) with the limit of the form (D7), focus and an announcement after
 *    adding, a question before a block that holds data is removed (D4, inline: no dialog in a form,
 *    ADR-07) and a line when another author becomes the corresponding author (UX-M1-09, 10);
 *  - fields shown on a condition (the employer's data when the employer pays, FR-FORM-05);
 *  - files uploaded at once with their progress (./FileField);
 *  - the language opens as decided (D2), switches in place and keeps every value (FR-FORM-09);
 *  - the draft keeps every field but files and the consent, the blocks and the language (D3), and
 *    where storage is refused the tab asks before it closes (FR-FORM-18, UX-M1-13);
 *  - one submit per form instance: a single-use token fetched by the page, a proof-of-work when the
 *    API asks for one, an Idempotency-Key kept with the draft (FR-FORM-14, ADR-08);
 *  - closed and not-yet-open states, the thank-you with the reference (FR-DL-02, FR-FORM-15).
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
import { browserApi, PublicApiError, solveProofOfWork, TOKEN_CODES, type FormToken, type PublicApi } from './public-api';
import { answersToSend, countWords, holds, isRequired, isShown, pathOf, validate, type AnswerRecord, type Answers, type RuleError } from './rules';
import { draftStorage, type DraftStorage } from './safe-storage';
import { SafeText } from './safe-text';
import styles from './form.module.css';

// ---- names and ids -------------------------------------------------------------------------

/** The name of a field's control: its key, or `<block>.<row key>.<key>` in a repeated block. */
export const controlName = (field: string, block?: { id: string; key: number }): string => (block ? `${block.id}.${block.key}.${field}` : field);
/** The id of a field: its name, with the dots of the blocks made dashes. */
export const fieldId = (name: string): string => `field-${name.replaceAll('.', '-')}`;

type Rows = Readonly<Record<string, readonly number[]>>;

const initialRows = (definition: FormDefinition): Rows =>
  Object.fromEntries(definition.sections.filter((s) => s.repeat).map((s) => [s.id, Array.from({ length: Math.max(1, s.repeat?.min ?? 1) }, (_, i) => i + 1)]));

/** The answers as the rules read them: from the controls, the blocks and the files. */
export function answersOf(definition: FormDefinition, values: FormValues, rows: Rows, files: Readonly<Record<string, FileState | null>>): Answers {
  const top = Object.create(null) as Record<string, string>;
  const blocks = Object.create(null) as Record<string, AnswerRecord[]>;
  for (const section of definition.sections) {
    if (section.repeat) {
      blocks[section.id] = (rows[section.id] ?? []).map((key) => {
        const record = Object.create(null) as Record<string, string>;
        for (const field of section.fields) record[field.key] = values[controlName(field.key, { id: section.id, key })] ?? '';
        return record;
      });
    } else {
      for (const field of section.fields) {
        // A file on its way counts as given; Send waits for it (`upload_pending`).
        if (field.kind === 'file') top[field.key] = files[field.key]?.uploadId ?? (isUploading(files[field.key]) ? PENDING : '');
        else if (field.kind === 'checkbox') top[field.key] = (values[field.key] ?? '') === '' ? '' : 'yes';
        else top[field.key] = values[field.key] ?? '';
      }
    }
  }
  return { top, blocks, consent: (values.consent ?? '') !== '' };
}

const PENDING = '(uploading)';
const isUploading = (state: FileState | null | undefined): boolean => !!state && state.progress !== undefined && !state.uploadId && !state.error;

/** The place of every path of the form, in the order of its fields: errors are listed in that order. */
function pathOrder(definition: FormDefinition, rows: Rows): Map<string, number> {
  const order = new Map<string, number>();
  for (const section of definition.sections) {
    if (section.repeat) {
      order.set(section.id, order.size);
      (rows[section.id] ?? []).forEach((_, index) => {
        for (const field of section.fields) order.set(pathOf(field.key, { id: section.id, index }), order.size);
      });
    } else for (const field of section.fields) order.set(field.key, order.size);
  }
  order.set('consent', order.size);
  return order;
}

/** The id of the control an error's path names (the summary's link). */
function idOfPath(definition: FormDefinition, path: string, rows: Rows): string {
  const block = /^([a-zA-Z0-9]+)\[(\d+)\]\.([a-zA-Z0-9]+)$/.exec(path);
  if (block) {
    const key = rows[block[1] ?? '']?.[Number(block[2])];
    return key === undefined ? fieldId(block[1] ?? '') : fieldId(controlName(block[3] ?? '', { id: block[1] ?? '', key }));
  }
  const section = definition.sections.find((s) => s.repeat && s.id === path);
  if (section) {
    const first = section.fields.find((f) => f.enabled);
    const key = rows[section.id]?.[0];
    return first && key !== undefined ? fieldId(controlName(first.key, { id: section.id, key })) : fieldId(path);
  }
  return fieldId(path);
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
}

interface SendProblem {
  readonly title: string;
  readonly text: string;
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
    document.documentElement.lang = language;
    document.title = fill(t.page.title, { title, conference: form.conference.name });
  }, [language, t, title, form.conference.name]);

  const switcher = (
    <SegmentedTabs
      label={t.language}
      value={language}
      onChange={(next) => {
        const chosen = form.conference.languages.find((l) => l === next);
        if (chosen) setLanguage(chosen);
      }}
      options={form.conference.languages.map((value) => ({ value, label: FORM_TEXTS[value].languageNames[value] }))}
    />
  );
  const intro = textOf(form.definition.texts.intro, language);

  return (
    <LabelsProvider labels={language === 'sr' ? LABELS_SR : {}}>
      <div className={styles.form} data-confera-form={form.slug} data-hydrated={hydrated ? 'true' : 'false'} lang={language}>
        {props.embedded ? <h1 className="ud-sr">{title}</h1> : <PageHeader title={title} description={form.conference.name} />}
        {form.conference.languages.length > 1 ? <div data-confera-language="">{switcher}</div> : null}
        {intro ? <p className={styles.intro}>{intro}</p> : null}
        {form.state === 'open' ? (
          <FormInstance key={instance} {...props} language={language} onLanguage={setLanguage} onAgain={() => setInstance((n) => n + 1)} />
        ) : (
          <Closed form={form} language={language} />
        )}
      </div>
    </LabelsProvider>
  );
}

function Closed({ form, language }: { form: PublishedForm; language: FormLanguage }) {
  const t = FORM_TEXTS[language].states;
  const own = textOf(form.definition.texts.closed, language);
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
  const text = own || (form.deadline ? fill(t.closedText, { date: formatDate(form.deadline, language, form.conference.timeZone) }) : t.closedTextNoDate);
  return (
    <div data-confera-state="closed">
      <Alert tone="info" title={t.closedTitle}>
        {text}
        {contact}
      </Alert>
    </div>
  );
}

interface InstanceProps extends FormRendererProps {
  readonly onLanguage: (language: FormLanguage) => void;
  readonly onAgain: () => void;
}

function FormInstance({ form, language, onLanguage, onAgain, onShow, api = browserApi, storage = draftStorage }: InstanceProps) {
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
  const [asking, setAsking] = useState<{ section: string; key: number } | null>(null);
  /** The control that takes the focus after the next render (a block added or removed, a question answered). */
  const focusNext = useRef<string | null>(null);
  const setFocusTarget = (id: string | null) => {
    focusNext.current = id;
  };
  const [announcement, setAnnouncement] = useState('');
  const [correspondingNote, setCorrespondingNote] = useState('');
  const [restored, setRestored] = useState<'no' | 'rows' | 'done'>('no');
  const [draftValues, setDraftValues] = useState<FormValues | null>(null);
  const idempotency = useRef<string>('');
  const token = useRef<{ promise: Promise<FormToken>; proof: Promise<string | null> } | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const thanksRef = useRef<HTMLDivElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLDivElement>(null);

  const answers = useMemo(() => answersOf(definition, values, rows, files), [definition, values, rows, files]);
  const clientErrors = useMemo(() => validate(definition, answers), [definition, answers]);

  // ---- the token (ADR-08): fetched once the form is attached, so the API can measure the fill time.
  const ensureToken = useCallback((): Promise<FormToken> => {
    if (!token.current) {
      const promise = api.token(form.slug);
      const proof = promise.then((got) => (got.proofOfWork ? solveProofOfWork(got.proofOfWork.challenge, got.proofOfWork.difficulty) : null));
      proof.catch(() => undefined);
      token.current = { promise, proof };
      promise.catch(() => {
        if (token.current?.promise === promise) token.current = null;
      });
    }
    return token.current.promise;
  }, [api, form.slug]);
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
      const kept = section.repeat ? draft?.rows[section.id] : undefined;
      if (section.repeat && kept && kept.length >= section.repeat.min && kept.length <= section.repeat.max) next[section.id] = [...kept];
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
  const pendingFiles = useMemo(() => Object.entries(files).filter(([, state]) => isUploading(state)).map(([fieldKey]) => fieldKey), [files]);
  const shownErrors: RuleError[] = useMemo(() => {
    if (!checked) return clientErrors.filter((e) => e.code === 'too_many_words'); // the word limit shows at once
    const waiting: RuleError[] = pendingFiles.map((path) => ({ path, code: 'upload_pending' }));
    const own = [...clientErrors, ...waiting];
    const paths = new Set(own.map((e) => e.path));
    const order = pathOrder(definition, rows);
    const at = (path: string) => order.get(path) ?? order.size;
    return [...own, ...serverErrors.filter((e) => !paths.has(e.path))].sort((a, b) => at(a.path) - at(b.path));
  }, [checked, clientErrors, serverErrors, pendingFiles, definition, rows]);
  const errorOf = (path: string): string | undefined => {
    const error = shownErrors.find((e) => e.path === path);
    return error ? messageFor(error, definition, language) : undefined;
  };

  // ---- blocks -----------------------------------------------------------------------------
  const rowHasData = (section: SectionDefinition, rowKey: number) => section.fields.some((f) => (values[controlName(f.key, { id: section.id, key: rowKey })] ?? '').trim() !== '');
  const firstControlId = (section: SectionDefinition, rowKey: number, index: number) => {
    const first = section.fields.find((f) => f.enabled && (!f.onlyFirstInRepeat || index === 0));
    return first ? fieldId(controlName(first.key, { id: section.id, key: rowKey })) : null;
  };
  const nameOf = (section: SectionDefinition, rowKey: number) => {
    const first = section.fields.find((f) => f.enabled && (f.kind === 'text' || f.kind === 'email'));
    return first ? (values[controlName(first.key, { id: section.id, key: rowKey })] ?? '').trim() : '';
  };

  const removeRow = (section: SectionDefinition, rowKey: number) => {
    const list = rows[section.id] ?? [];
    const index = list.indexOf(rowKey);
    if (index < 0 || !section.repeat || list.length <= section.repeat.min) return;
    const next = list.filter((k) => k !== rowKey);
    setRows({ ...rows, [section.id]: next });
    setAsking(null);
    setAnnouncement(fill(t.authors.removed, { n: index + 1 }));
    // The block that takes its place, or the one before it when the last one went (as the design system's Repeater does).
    const target = next[Math.min(index, next.length - 1)];
    if (target !== undefined) setFocusTarget(firstControlId(section, target, Math.min(index, next.length - 1)));
    if (index === 0 && next[0] !== undefined) {
      const name = nameOf(section, next[0]);
      setCorrespondingNote(name ? fill(t.authors.correspondingChanged, { name }) : '');
    }
  };

  const changeRows = (section: SectionDefinition, items: readonly { key: number }[]) => {
    const list = rows[section.id] ?? [];
    const keys = items.map((item) => item.key);
    if (keys.length > list.length) {
      const added = keys.find((k) => !list.includes(k));
      setRows({ ...rows, [section.id]: keys });
      setAsking(null);
      setAnnouncement(fill(t.authors.added, { n: keys.length }));
      if (added !== undefined) setFocusTarget(firstControlId(section, added, keys.length - 1));
      return;
    }
    const gone = list.find((k) => !keys.includes(k));
    if (gone === undefined) return;
    // D4: a block that holds data asks first, inside the form (no dialog in a form, ADR-07).
    if (rowHasData(section, gone)) setAsking({ section: section.id, key: gone });
    else removeRow(section, gone);
  };

  // ---- send -------------------------------------------------------------------------------
  const firstEmail = (): string => {
    for (const section of definition.sections) {
      const field = section.fields.find((f) => f.kind === 'email' && f.enabled);
      if (!field) continue;
      const value = section.repeat ? (answers.blocks[section.id]?.[0]?.[field.key] ?? '') : (answers.top[field.key] ?? '');
      if (value.trim() !== '') return value.trim();
    }
    return '';
  };

  const explain = (error: unknown): SendProblem => {
    const p = t.problems;
    const contact = form.conference.contactEmail;
    if (error instanceof PublicApiError) {
      if (error.status === 0) return { title: p.networkTitle, text: p.networkText };
      if (error.status === 429) return { title: p.tooManyTitle, text: fill(p.tooManyText, { minutes: Math.max(1, Math.ceil((error.retryAfterSeconds ?? 600) / 60)) }) };
      if (error.code === 'form_closed') return { title: p.closedTitle, text: p.closedText + (contact ? ` ${fill(t.states.contact, { email: contact })}` : '') };
      const traceId = error.traceId ?? '-';
      return { title: p.unknownTitle, text: contact ? fill(p.unknownTextContact, { email: contact, traceId }) : fill(p.unknownText, { traceId }) };
    }
    return { title: p.unknownTitle, text: contact ? fill(p.unknownTextContact, { email: contact, traceId: '-' }) : fill(p.unknownText, { traceId: '-' }) };
  };

  const send = async () => {
    setChecked(true);
    setProblem(null);
    setServerErrors([]);
    if (clientErrors.length > 0 || pendingFiles.length > 0) {
      setFailedSends((n) => n + 1);
      return;
    }
    setPhase('sending');
    const body = (proof: string | null, challenge: string | null) => {
      const { top, blocks } = answersToSend(definition, answers);
      return {
        formVersion: form.version,
        language,
        answers: top,
        blocks,
        consent: { version: definition.consent.version, accepted: true },
        website: values.website ?? '',
        proofOfWork: proof !== null && challenge !== null ? { challenge, nonce: proof } : null,
      };
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const got = await ensureToken();
        if (got.proofOfWork) setPhase('checking');
        const proof = await token.current!.proof;
        setPhase('sending');
        const result = await api.submit(form.slug, got.token, idempotency.current, body(proof, got.proofOfWork?.challenge ?? null));
        storage().remove(key);
        setSentTo(firstEmail());
        setReference(result.reference);
        setPhase('sent');
        return;
      } catch (error) {
        if (error instanceof PublicApiError && TOKEN_CODES.has(error.code) && attempt === 0) {
          token.current = null; // a new token, and the same idempotency key: the API answers a repeat with the first result
          continue;
        }
        setPhase('editing');
        if (error instanceof PublicApiError && error.status === 422 && error.errors.length > 0) {
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
  const renderField = (field: FieldDefinition, section: SectionDefinition, block?: { key: number; index: number; record: AnswerRecord }): ReactNode => {
    if (!field.enabled) return null;
    if (field.onlyFirstInRepeat && (block?.index ?? 0) !== 0) return null;
    const name = controlName(field.key, block ? { id: section.id, key: block.key } : undefined);
    const id = fieldId(name);
    const path = block ? pathOf(field.key, { id: section.id, index: block.index }) : field.key;
    const shown = isShown(field, section, answers, block?.record ?? null, block?.index ?? 0);
    const required = shown && isRequired(field, answers, block?.record ?? null, block?.index ?? 0);
    // In a block a label may name its block: "Email of author {n}" (each control has a name of its own).
    const label = fill(textOf(field.label, language), { n: (block?.index ?? 0) + 1 });
    const help = fill(textOf(field.help, language), { n: (block?.index ?? 0) + 1 });
    const error = shown ? errorOf(path) : undefined;
    const status = error ? 'error' : 'default';
    // Author 1 is usually the person filling in: the phone may offer her name and address; never for the co-authors (UX-M1-23).
    const autoComplete = block && block.index > 0 ? 'off' : field.autocomplete;
    const wide = field.kind === 'textarea' || field.kind === 'radio' || field.kind === 'checkbox' || field.kind === 'file';
    // In a block a screen reader hears which block the field belongs to ("Institution, Author 2").
    const describedBy = block ? `${fieldId(`${section.id}.${block.key}`)}-title` : undefined;
    let control: ReactNode;
    switch (field.kind) {
      case 'textarea': {
        const max = field.rules?.maxWords;
        const counter = max !== undefined ? fill(t.words, { count: countWords(values[name] ?? ''), max }) : undefined;
        control = <Textarea id={id} label={label} name={name} rows={6} aria-describedby={describedBy} required={required} status={status} message={error ?? ([help, counter].filter(Boolean).join(' ') || undefined)} />;
        break;
      }
      case 'select':
        control = (
          <Select
            id={id}
            label={label}
            name={name}
            aria-describedby={describedBy}
            required={required}
            defaultValue=""
            placeholder={t.choose}
            options={(field.options ?? []).map((option) => ({ value: option.value, label: textOf(option.label, language) }))}
            status={status}
            message={error ?? (help || undefined)}
          />
        );
        break;
      case 'radio':
        control = (
          <div id={id} tabIndex={-1}>
            <RadioGroup label={label} name={name} required={required} options={(field.options ?? []).map((option) => ({ value: option.value, label: textOf(option.label, language) }))} status={status} message={error ?? (help || undefined)} />
          </div>
        );
        break;
      case 'checkbox':
        control = <Checkbox id={id} name={name} value="yes" label={label} required={required} status={status} message={error ?? (help || undefined)} />;
        break;
      case 'file': {
        const rule = field.rules?.file;
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
            type={field.kind === 'email' ? 'email' : field.kind === 'phone' ? 'tel' : 'text'}
            inputMode={field.kind === 'phone' ? 'tel' : field.kind === 'email' ? 'email' : undefined}
            icon={field.kind === 'email' ? 'mail' : undefined}
            autoComplete={autoComplete}
            aria-describedby={describedBy}
            spellCheck={field.kind === 'text' ? undefined : false}
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
    const shown = !section.visibleWhen || holds(section.visibleWhen, answers, null);
    const help = section.help ? (
      <p className={`ud-span-all ${styles.note}`}>
        <SafeText text={textOf(section.help, language)} newTab={t.consent.newTab} />
      </p>
    ) : null;
    const label = textOf(section.label, language) || undefined;
    return (
      <div key={section.id} hidden={!shown} data-confera-section={section.id}>
        <FormCard title={section.repeat ? undefined : label}>
          {help}
          {section.repeat ? renderBlocks(section) : section.fields.map((field) => renderField(field, section))}
        </FormCard>
      </div>
    );
  };

  const renderBlocks = (section: SectionDefinition): ReactNode => {
    const repeat = section.repeat;
    if (!repeat) return null;
    const list = rows[section.id] ?? [];
    const atMax = list.length >= repeat.max;
    const contact = form.conference.contactEmail;
    const notice = repeat.noticeFrom && list.length >= repeat.noticeFrom ? textOf(repeat.notice, language) || t.authors.notice : '';
    const message = [
      t.authors.corresponding,
      correspondingNote,
      notice,
      atMax ? (contact ? fill(t.authors.limit, { max: repeat.max, email: contact }) : fill(t.authors.limitNoContact, { max: repeat.max })) : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div className="ud-span-all">
        <Repeater<{ key: number }>
          label={textOf(section.label, language) || undefined}
          items={list.map((rowKey) => ({ key: rowKey }))}
          onChange={(items) => changeRows(section, items)}
          newItem={() => ({ key: nextRowKey.current++ })}
          min={repeat.min}
          max={repeat.max}
          addLabel={textOf(repeat.addLabel, language) || t.authors.add}
          removeLabel={t.authors.removeLabel}
          message={message}
          renderRow={(item, index) => {
            const record = answers.blocks[section.id]?.[index] ?? {};
            const name = nameOf(section, item.key);
            const isAsking = asking?.section === section.id && asking.key === item.key;
            return (
              <>
                <p id={`${fieldId(`${section.id}.${item.key}`)}-title`} className={`ud-span-all ${styles.blockTitle}`}>
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
                              setFocusTarget(firstControlId(section, item.key, index));
                            }}
                          >
                            {t.authors.keep}
                          </TextButton>
                        </span>
                      }
                    />
                  </div>
                ) : null}
                {section.fields.map((field) => renderField(field, section, { key: item.key, index, record }))}
              </>
            );
          }}
        />
      </div>
    );
  };

  // ---- the page -------------------------------------------------------------------------------
  if (phase === 'sent') {
    const own = textOf(definition.texts.thankYouText, language);
    return (
      <div className={styles.stack} data-confera-sent="">
        <div ref={thanksRef} tabIndex={-1} className={styles.landing} data-confera-thanks="">
          <Alert tone="success" title={textOf(definition.texts.thankYouTitle, language) || t.states.thanksTitle[definition.type]}>
            <span className={styles.lines}>
              <span>{own ? fill(own, { email: sentTo, reference: reference ?? '' }) : fill(t.states.thanksText, { email: sentTo })}</span>
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
  const persistentNote = persistent ? t.draft.kept : t.draft.inMemory;

  return (
    <form ref={formRef} method="post" action={`/f/${form.slug}/send`} noValidate onChange={saveDraft} onSubmit={(event) => {
      event.preventDefault();
      if (!busy) void send();
    }} className={styles.stack} data-confera-phase={phase}>
      <noscript>
        <p className={styles.note}>{t.noScript}</p>
      </noscript>
      <p className={styles.note}>
        {t.requiredNote}
        {deadline ? ` ${deadline}` : ''}
      </p>
      {summary ? (
        <div ref={summaryRef} tabIndex={-1} className={styles.landing} data-confera-errors="" aria-describedby="confera-error-count">
          <Alert tone="error" title={definitionErrorsTitle(definition, language)}>
            <span id="confera-error-count" className="ud-sr">
              {plural(t.errorCount, shownErrors.length, language)}
            </span>
            <ul className={styles.list}>
              {shownErrors.map((error) => {
                const id = idOfPath(definition, error.path, rows);
                return (
                  <li key={`${error.path}:${error.code}`}>
                    <a className="ud-link" href={`#${id}`} onClick={goTo(id)}>
                      {messageFor(error, definition, language)}
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
        <div className="ud-span-all">
          <Checkbox
            id={fieldId('consent')}
            name="consent"
            value="yes"
            required
            label={<SafeText text={textOf(definition.consent.label, language)} newTab={t.consent.newTab} />}
            status={errorOf('consent') ? 'error' : 'default'}
            message={errorOf('consent')}
          />
        </div>
        {/* The trap field of ADR-08: no person sees it or reaches it; a script that fills it gets a fake success. */}
        <div className="ud-sr" aria-hidden="true">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
        <p className={`ud-span-all ${styles.note}`}>{restored === 'done' && draftValues && hasTyped(draftValues) ? `${t.draft.restored} ` : ''}{persistentNote}</p>
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

const definitionErrorsTitle = (definition: FormDefinition, language: FormLanguage) => FORM_TEXTS[language].errorsTitle[definition.type];
