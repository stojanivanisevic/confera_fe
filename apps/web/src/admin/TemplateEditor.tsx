'use client';

/**
 * The template editor (M4-FE-02, M4-FE-03; FR-MAIL-01, 02, 07; ADR-12). An admin writes an email
 * without any HTML: the rich-text engine (ProseMirror, @confera/template-editor) holds the closed
 * format of confera_be and nothing else, the toolbar is design-system controls, a placeholder is one
 * object from the type's catalogue (as the API gives it), a condition wraps blocks, an image is an
 * email image of the organisation, uploaded by the server's rules and shown in the page by its
 * address behind the session. What leaves the page is the document, checked as the server checks it,
 * never markup.
 *
 *   - Language tabs: the English and the Serbian version of the same message; with a conference
 *     chosen, each tab says whose version it opens (UX4-22).
 *   - The conference of the switch: it uses the organisation's template until it has its own; here
 *     it gets its own, and gives it up again (the fallback of ADR-12). The organisation's template
 *     never claims a conference that has its own version (Q4-03).
 *   - A status email is switched on and off per conference, for both languages (FR-MAIL-07).
 *   - The preview is the server's: rendered with made-up values and the images inside, shown only in
 *     the sandboxed frame (ST-28); a condition can be unticked to see the email without its blocks
 *     (UX4-11); an image still being scanned is shown by itself once it is clean (Q4-05). A stored
 *     document with hostile strings is text in the editor, escaped by the server in the preview (ST-59).
 *   - Paste keeps only the format; an image of a web page is dropped and the page says so; an image
 *     file pasted or dropped is uploaded, with the words it needs asked first (ADR-12, ST-60).
 *   - Unsaved changes: the state stands next to Save, in a bar that stays in view (UX4-10); every way
 *     out of the page asks first (UX4-01, `leave-guard.tsx`); Ctrl+S saves.
 *   - The toolbar is one Tab stop; the arrow keys move inside it (UX4-10).
 */
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';

import { checkBody, checkSubject, DocumentError, isTypedLink, MAX_IMAGES, type Catalogue, type DocNode, type SubjectNode } from '@confera/api-client';
import { Alert, Button, Card, CheckboxGroup, ConfirmDialog, Dialog, FileButton, IconButton, PageHeader, RadioGroup, SandboxedMarkupFrame, SegmentedTabs, Select, Spinner, Switch, TextButton, TextField, toast, type IconName } from '@confera/ui';
import {
  insertHardBreak,
  insertImage,
  insertPlaceholder,
  liftOutOfCondition,
  mountBodyEditor,
  mountSubjectEditor,
  normaliseBody,
  normaliseSubject,
  redo,
  removeLink,
  SECURE_LINK,
  setBlock,
  setLink,
  subjectSchema,
  toggleList,
  toggleTextMark,
  undo,
  wrapInCondition,
  type BlockKind,
  type EditorHandle,
  type TextMark,
  type ToolbarState,
} from '@confera/template-editor';

import styles from './admin.module.css';
import { conferenceLabel, useConference } from './conference-context';
import { useLeave, useLeaveGuard } from './leave-guard';
import { m4, uploadImage, type CatalogueType, type RenderedPreview, type StatusSwitches, type TemplateRecord } from './m4-api';
import { ProblemAlert } from './ProblemAlert';
import { explain, isApiError, type Explained } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

const t = TEXTS.templates;
const placeholderLabel = (key: string): string => t.placeholders[key] ?? key;
const conditionLabel = (key: string): string => fill(t.conditionShownWhen, { condition: t.conditions[key] ?? key });
const LANGUAGES = ['en', 'sr'] as const;
/** While an image is being scanned, the preview is asked again this often, until the server shows it (Q4-05). */
const PENDING_POLL_MS = 4_000;
/** The editor sits in a card whose heading is h2: the email's "Heading 1" is level 3 there (UX4-18). */
const CARD_HEADING_LEVEL = 2;

type CheckResult = { readonly part: 'subject' | 'body'; readonly code: string; readonly path: string };

const NO_TOOLBAR: ToolbarState = { marks: { bold: false, italic: false, underline: false }, block: 'paragraph', list: null, link: null, condition: null, canUndo: false, canRedo: false };

/** A toolbar button: it keeps the editor's selection (no focus on mouse down) and says whether it is on. */
function ToolButton({ pressed, onPress, disabled, icon, children }: { pressed?: boolean; onPress: () => void; disabled?: boolean; icon?: IconName; children: string }) {
  // An icon of the design system's toolbar set (2.4.0, 2.6.0), named by its text; a toggle that is on draws the ring (UXUI-M2-22).
  if (icon) return <IconButton icon={icon} label={children} aria-pressed={pressed} disabled={disabled} onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={onPress} />;
  return (
    <Button type="button" variant="dark" aria-pressed={pressed} disabled={disabled} onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={onPress}>
      {children}
    </Button>
  );
}

/** The catalogue of a type as the editor checks it: the API's entry. */
const catalogueFrom = (entry: CatalogueType | undefined): Catalogue => ({ placeholders: new Set(entry?.placeholders ?? []), conditions: new Set(entry?.conditions ?? []) });

/** A refusal of the server, by the path it names (`body.children[2].key`), in words. */
function refusalOf(error: unknown): CheckResult | null {
  if (!isApiError(error)) return null;
  const first = error.problem?.errors?.[0];
  if (!first) return null;
  const path = String(first.path ?? '');
  return { part: path.startsWith('subject') ? 'subject' : 'body', code: String(first.code ?? ''), path: path.replace(/^(subject|body)/, '$') };
}

type Block = DocNode['children'][number];
const countImages = (doc: DocNode): number => {
  const count = (blocks: readonly Block[]): number => blocks.reduce((sum, block) => sum + (block.type === 'image' ? 1 : block.type === 'conditional' ? count(block.children) : 0), 0);
  return count(doc.children);
};

/**
 * The body as an author gets it when the conditions in `off` do not hold: their blocks left out
 * (UX4-11). The server renders that as it renders the mail, so the preview stays the server's.
 */
function withoutConditions(doc: DocNode, off: ReadonlySet<string>): DocNode {
  if (off.size === 0) return doc;
  const strip = (blocks: readonly Block[]): Block[] => blocks.flatMap((block): Block[] => (block.type === 'conditional' ? (off.has(block.key) ? [] : [{ ...block, children: strip(block.children) as typeof block.children }]) : [block]));
  const children = strip(doc.children);
  return { ...doc, children: (children.length > 0 ? children : [{ type: 'paragraph', children: [] }]) };
}

export function TemplateEditor({ id }: { id: string }) {
  const router = useRouter();
  const leave = useLeave();
  const { client, contact, session } = useSession();
  const { selected } = useConference();
  const mayManage = session?.user.permissions.includes('templates.manage') ?? false;
  const template = useLoad<TemplateRecord>((c) => m4.template(c, id), [id]);
  const record = template.state.data;
  const catalogues = useLoad((c) => m4.catalogue(c), []);
  const entry = catalogues.state.data?.types.find((item) => item.type === record?.type);
  // The editor is made again only for another template, another saved version or another catalogue, never because
  // an answer of the same arrived again (a refetch after the session's contact came would wipe what is typed).
  const entryKey = entry ? JSON.stringify(entry) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the entry, by its content
  const catalogue = useMemo(() => (entry ? catalogueFrom(entry) : null), [entryKey]);
  // The organisation's templates and the conference's own: for the language tabs and the fallback.
  const conferenceId = selected?.id ?? null;
  const scope = useLoad<readonly TemplateRecord[]>(async (c) => [...(await m4.templates(c)), ...(conferenceId ? await m4.templates(c, conferenceId) : [])], [conferenceId, record?.id]);
  const statusEmail = entry?.statusEmail === true;
  const switches = useLoad<StatusSwitches | null>((c) => (statusEmail && conferenceId ? m4.statusSwitches(c, conferenceId) : Promise.resolve(null)), [statusEmail, conferenceId]);

  // What the server gave, checked: a template the server stored is a valid document of its type.
  const loaded = useMemo(() => {
    if (!record || !catalogue) return null;
    try {
      return { subject: checkSubject(record.subject, catalogue), body: checkBody(record.body, catalogue) };
    } catch (error) {
      return error instanceof DocumentError ? error : null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the record, by its id and version
  }, [record?.id, record?.version, catalogue]);

  const subjectElement = useRef<HTMLDivElement>(null);
  const bodyElement = useRef<HTMLDivElement>(null);
  const toolbarElement = useRef<HTMLDivElement>(null);
  const editors = useRef<{ subject: EditorHandle<SubjectNode>; body: EditorHandle<DocNode> } | null>(null);
  const focused = useRef<'subject' | 'body'>('body');
  const [toolbar, setToolbar] = useState<ToolbarState>(NO_TOOLBAR);
  const [toolIndex, setToolIndex] = useState(0);
  const [refused, setRefused] = useState<CheckResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const [images, setImages] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Explained | null>(null);
  const [preview, setPreview] = useState<{ phase: 'loading' | 'ready' | 'failed'; data: RenderedPreview | null }>({ phase: 'loading', data: null });
  const [previewAsked, setPreviewAsked] = useState(0);
  const [previewOff, setPreviewOff] = useState<readonly string[]>([]);
  const [dropping, setDropping] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkKind, setLinkKind] = useState<'secure' | 'typed'>('typed');
  const [linkAddress, setLinkAddress] = useState('https://');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const [selectionEmpty, setSelectionEmpty] = useState(true);
  const [imageAsk, setImageAsk] = useState<{ file: File | null } | null>(null);
  const [imageAlt, setImageAlt] = useState('');
  const [imageProblem, setImageProblem] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const ready = loaded !== null && !(loaded instanceof DocumentError);
  // Every way out of the page asks first while something is not saved (UX4-01).
  useLeaveGuard(dirty, { title: t.leaveQuestion, text: t.leaveText, leave: t.leave });

  useEffect(() => {
    if (!record || !catalogue || loaded === null || loaded instanceof DocumentError || !subjectElement.current || !bodyElement.current) return;
    const subjectSaved = JSON.stringify(normaliseSubject(loaded.subject));
    const bodySaved = JSON.stringify(normaliseBody(loaded.body));
    const changed = () => {
      const handles = editors.current;
      if (!handles) return;
      setToolbar(handles.body.toolbar());
      setSelectionEmpty(handles.body.view.state.selection.empty);
      const subject = handles.subject.read();
      const body = handles.body.read();
      setDirty(!(subject.ok && body.ok) || JSON.stringify(subject.document) !== subjectSaved || JSON.stringify(body.document) !== bodySaved);
      if (body.ok) setImages(countImages(body.document));
      setRefused(null);
      setPreviewAsked((n) => n + 1);
    };
    const options = { type: record.type, catalogue, placeholderLabel, onChange: changed };
    const subject = mountSubjectEditor(subjectElement.current, loaded.subject, { ...options, label: t.subject, describedBy: 'template-subject-hint' });
    const body = mountBodyEditor(bodyElement.current, loaded.body, {
      ...options,
      label: t.body,
      describedBy: 'template-body-hint',
      imageSrc: m4.imageHref,
      headingLevelUnder: CARD_HEADING_LEVEL,
      conditionLabel,
      onImageFile: (file) => {
        setImageAlt('');
        setImageProblem(null);
        setImageAsk({ file });
      },
      onImagesDropped: () => toast({ title: t.pasteDropped, tone: 'info' }),
    });
    editors.current = { subject, body };
    setImages(countImages(loaded.body));
    setDirty(false);
    setPreviewAsked((n) => n + 1);
    return () => {
      subject.destroy();
      body.destroy();
      editors.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- made again for another document (`loaded` follows the id and version), not for a record that arrived again
  }, [loaded, catalogue]);

  // The server's preview, a moment after the last change (ADR-12): the same rendering that is sent.
  const off = useMemo(() => new Set(previewOff), [previewOff]);
  useEffect(() => {
    if (!record || previewAsked === 0) return undefined;
    const timer = window.setTimeout(() => {
      const handles = editors.current;
      if (!handles) return;
      const subject = handles.subject.read();
      const body = handles.body.read();
      if (!subject.ok || !body.ok) {
        setPreview({ phase: 'failed', data: null });
        return;
      }
      setPreview((current) => ({ phase: 'loading', data: current.data }));
      m4.previewTemplate(client, { type: record.type, language: record.language, conferenceId: record.conferenceId, subject: subject.document, body: withoutConditions(body.document, off) }).then(
        (data) => setPreview({ phase: 'ready', data }),
        () => setPreview({ phase: 'failed', data: null }),
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [previewAsked, record, client, off]);

  // An image still being scanned: the preview is asked again until the server shows it (Q4-05), and the
  // editor reads the picture again once it is clean (it is served only then).
  const pendingBefore = useRef<readonly string[]>([]);
  useEffect(() => {
    if (preview.phase !== 'ready' || !preview.data) return undefined;
    const pending = preview.data.imagesPending;
    for (const cleared of pendingBefore.current.filter((fileId) => !pending.includes(fileId))) {
      bodyElement.current?.querySelectorAll<HTMLImageElement>(`figure[data-confera-image="${CSS.escape(cleared)}"] img`).forEach((img) => {
        img.src = `${m4.imageHref(cleared)}?clean=${String(Date.now())}`;
      });
    }
    pendingBefore.current = pending;
    if (pending.length === 0) return undefined;
    const timer = window.setTimeout(() => setPreviewAsked((n) => n + 1), PENDING_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [preview]);

  // The toolbar is one Tab stop (roving tabindex, UX4-10): the control last used holds it.
  const toolControls = (): HTMLElement[] => [...(toolbarElement.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled])') ?? [])];
  useEffect(() => {
    const controls = toolControls();
    const active = controls[Math.min(toolIndex, controls.length - 1)];
    // A disabled one too, so that it is no Tab stop of its own once it is enabled.
    toolbarElement.current?.querySelectorAll<HTMLElement>('button, select').forEach((control) => {
      control.tabIndex = control === active ? 0 : -1;
    });
  });
  const onToolbarKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const controls = toolControls();
    const at = controls.indexOf(event.target as HTMLElement);
    if (at < 0 || controls.length === 0) return;
    // Left and Right move between the controls; Up and Down still choose in a list.
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length;
    setToolIndex(next);
    controls[next]?.focus();
  };
  const onToolbarFocus = (event: FocusEvent<HTMLDivElement>) => {
    const at = toolControls().indexOf(event.target);
    if (at >= 0) setToolIndex(at);
  };

  // Ctrl+S (Cmd+S) saves, as people expect of an editor.
  // It presses the Save of the bar, so it does exactly what Save does, and nothing while Save is off.
  const actionsElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        actionsElement.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const back = { label: t.back, href: '/templates', onClick: () => router.push('/templates') };
  const failed = template.state.phase === 'failed' ? template.state : catalogues.state.phase === 'failed' ? catalogues.state : null;
  if (failed && (!record || !catalogue)) {
    return (
      <div className={styles.stack}>
        <PageHeader title={t.title} breadcrumbs={[back]} />
        <Alert
          tone="error"
          title={failed.problem.title}
          action={
            <TextButton
              onClick={() => {
                void template.reload();
                void catalogues.reload();
              }}
            >
              {TEXTS.connection.tryAgain}
            </TextButton>
          }
        >
          {failed.problem.text}
        </Alert>
      </div>
    );
  }
  if (!record || !catalogue) return null;

  const title = t.types[record.type] ?? record.type;
  const placeholders = [...catalogue.placeholders].filter((key) => key !== 'link');
  const conditions = [...catalogue.conditions];
  const carries = entry?.carriesLink ?? false;
  const all = scope.state.data ?? [];
  const known = scope.state.phase === 'ready';
  const own = record.conferenceId !== null;
  const conferenceName = selected ? conferenceLabel(selected) : '';
  const organisationsOf = (language: string) => all.find((item) => item.conferenceId === null && item.type === record.type && item.language === language);
  const conferencesOf = (language: string) => (conferenceId ? all.find((item) => item.conferenceId === conferenceId && item.type === record.type && item.language === language) : undefined);
  /** The template a language tab opens: the chosen conference's own in that language, else the organisation's (the fallback). */
  const siblingOf = (language: string) => (own ? (all.find((item) => item.conferenceId === record.conferenceId && item.type === record.type && item.language === language) ?? organisationsOf(language)) : (conferencesOf(language) ?? organisationsOf(language)));
  // The organisation's template while the chosen conference has its own of this language (Q4-03): it says so, and leads there.
  const conferenceOwn = !own ? conferencesOf(record.language) : undefined;
  const go = (target: string) => leave(() => router.push(`/templates/${target}`));
  const languageName = (language: string) => TEXTS.conferences.languageNames[language] ?? language;
  /** With a conference chosen, a tab says whose version it opens (UX4-22). */
  const tabLabel = (language: string) => {
    const name = languageName(language);
    if (!selected || !known) return name;
    const opens = siblingOf(language);
    return opens ? fill(opens.conferenceId !== null ? t.languageOwn : t.languageOrganisation, { language: name }) : name;
  };

  const body = (run: (handle: EditorHandle<DocNode>) => void) => () => {
    if (editors.current) run(editors.current.body);
  };
  const insert = (key: string) => {
    const handles = editors.current;
    if (!handles || key === '') return;
    if (focused.current === 'subject') handles.subject.run(insertPlaceholder(key, subjectSchema));
    else handles.body.run(insertPlaceholder(key));
  };
  /** Both parts, checked as the server checks them; the first refusal is shown. */
  const readBoth = (): { subject: SubjectNode; body: DocNode } | null => {
    const handles = editors.current;
    if (!handles) return null;
    const subject = handles.subject.read();
    if (!subject.ok) {
      setRefused({ part: 'subject', code: subject.code, path: subject.path });
      return null;
    }
    const read = handles.body.read();
    if (!read.ok) {
      setRefused({ part: 'body', code: read.code, path: read.path });
      return null;
    }
    return { subject: subject.document, body: read.document };
  };
  const failedWith = (error: unknown) => {
    const refusal = refusalOf(error);
    if (refusal) setRefused(refusal);
    else setProblem(explain(error, contact));
    if (isApiError(error) && error.code === 'version_conflict') void template.reload({ background: true });
  };
  const save = async () => {
    const documents = readBoth();
    if (!documents) return;
    setBusy(true);
    setProblem(null);
    try {
      template.replace(await m4.saveTemplate(client, record.id, { ...documents, version: record.version }));
      toast({ title: t.saved, tone: 'success' });
    } catch (error) {
      failedWith(error);
    } finally {
      setBusy(false);
    }
  };
  const makeOwn = async () => {
    if (!selected) return;
    const documents = readBoth();
    if (!documents) return;
    setBusy(true);
    setProblem(null);
    try {
      const created = await m4.createOverride(client, { conferenceId: selected.id, type: record.type, language: record.language, ...documents });
      toast({ title: fill(t.madeOwn, { conference: conferenceName }), tone: 'success' });
      router.push(`/templates/${created.id}`);
    } catch (error) {
      // Someone made it meanwhile (Q4-03): say so plainly, and the page shows the way to it.
      if (isApiError(error) && error.code === 'template_exists') {
        setProblem({ ...explain(error, contact), title: fill(t.ownExistsTitle, { conference: conferenceName }), text: fill(t.ownExistsText, { conference: conferenceName }) });
        void scope.reload({ background: true });
      } else failedWith(error);
    } finally {
      setBusy(false);
    }
  };
  const dropOwn = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await m4.deleteOverride(client, record.id);
      setDropping(false);
      toast({ title: fill(t.droppedOwn, { conference: conferenceName }), tone: 'success' });
      const fallback = organisationsOf(record.language);
      router.push(fallback ? `/templates/${fallback.id}` : '/templates');
    } catch (error) {
      setDropping(false);
      failedWith(error);
    } finally {
      setBusy(false);
    }
  };
  const setSwitch = async (enabled: boolean) => {
    const current = switches.state.data;
    if (!selected || !current) return;
    try {
      switches.replace(await m4.setStatusSwitch(client, selected.id, current, record.type, enabled));
      toast({ title: fill(enabled ? t.switchSaved : t.switchSavedOff, { conference: conferenceName }), tone: 'success' });
    } catch (error) {
      setProblem(explain(error, contact));
    }
  };
  const openLink = () => {
    setLinkKind(toolbar.link === SECURE_LINK || (toolbar.link === null && carries) ? 'secure' : 'typed');
    setLinkAddress(toolbar.link && toolbar.link !== SECURE_LINK ? toolbar.link : 'https://');
    setLinkLabel('');
    setLinkProblem(null);
    setLinking(true);
  };
  const applyLink = () => {
    const handles = editors.current;
    if (!handles) return;
    const href = linkKind === 'secure' ? SECURE_LINK : linkAddress.trim();
    if (linkKind === 'typed' && !isTypedLink(href)) return setLinkProblem(t.linkBad);
    if (selectionEmpty && linkLabel.trim() === '') return setLinkProblem(t.linkNeedsText);
    handles.body.run(setLink(href, selectionEmpty ? linkLabel.trim() : undefined));
    setLinking(false);
  };
  const insertTheImage = async () => {
    const file = imageAsk?.file ?? null;
    if (!file) return setImageProblem(t.imageNeeded);
    if (imageAlt.trim() === '') return setImageProblem(t.imageAltNeeded);
    if (images >= MAX_IMAGES) return setImageProblem(t.imageTooMany);
    setImageBusy(true);
    setImageProblem(null);
    try {
      const uploaded = await uploadImage(file, session?.csrf ?? null);
      editors.current?.body.run(insertImage(uploaded.id, imageAlt.trim()));
      setImageAsk(null);
      toast({ title: t.imageInserted, tone: 'success' });
    } catch (error) {
      setImageProblem(isApiError(error) && t.imageProblems[error.code] ? (t.imageProblems[error.code] ?? '') : explain(error, contact).text);
    } finally {
      setImageBusy(false);
    }
  };
  const enabled = switches.state.data?.types.find((item) => item.type === record.type)?.enabled ?? true;
  const shown = preview.data;

  return (
    <div className={styles.stack} data-confera-template={`${record.type}:${record.language}`}>
      <PageHeader title={title} description={own ? fill(t.scopeConference, { conference: conferenceName || (TEXTS.templates.thisConference) }) : t.scopeOrganisation} breadcrumbs={[back, { label: title }]} />
      <SegmentedTabs
        label={t.languages}
        value={record.language}
        options={LANGUAGES.map((language) => ({ value: language, label: tabLabel(language) }))}
        onChange={(language) => {
          const target = siblingOf(language);
          if (target && target.id !== record.id) go(target.id);
        }}
      />
      {problem ? (
        <ProblemAlert title={problem.title} onClose={() => setProblem(null)}>
          {problem.text}
        </ProblemAlert>
      ) : null}
      {selected && !own && known && conferenceOwn ? (
        <Alert tone="info" title={fill(t.hasOwnTitle, { conference: conferenceName })} action={<TextButton onClick={() => go(conferenceOwn.id)}>{fill(t.openOwn, { conference: conferenceName })}</TextButton>}>
          {fill(t.hasOwnText, { conference: conferenceName })}
        </Alert>
      ) : null}
      {selected && !own && known && !conferenceOwn ? (
        <Alert tone="info" title={fill(t.inheritedTitle, { conference: conferenceName })} action={mayManage ? <TextButton onClick={() => void makeOwn()}>{fill(t.makeOwn, { conference: conferenceName })}</TextButton> : undefined}>
          {fill(t.inheritedText, { conference: conferenceName })}
        </Alert>
      ) : null}
      {own ? (
        <Alert tone="info" title={fill(t.scopeConference, { conference: conferenceName || t.thisConference })} action={mayManage ? <TextButton onClick={() => setDropping(true)}>{t.dropOwn}</TextButton> : undefined}>
          {fill(t.ownText, { conference: conferenceName || t.thisConference })}
        </Alert>
      ) : null}
      {statusEmail ? (
        <Card title={t.statusEmails} headingLevel={2} data-confera-template-switch="">
          {selected ? (
            <Switch label={fill(t.switchLabel, { conference: conferenceName })} description={enabled ? t.switchOn : fill(t.switchOff, { conference: conferenceName })} checked={enabled} disabled={!mayManage || switches.state.phase !== 'ready'} onChange={(event) => void setSwitch(event.target.checked)} />
          ) : (
            <p className={styles.text}>{t.switchNoConference}</p>
          )}
        </Card>
      ) : null}
      {loaded instanceof DocumentError ? <Alert tone="error" title={t.refused}>{fill(t.refusedText, { problem: t.documentProblems[loaded.code] ?? loaded.code, part: t.parts.body ?? 'body', path: loaded.path })}</Alert> : null}
      {refused ? (
        <div data-confera-template-check="refused">
          <Alert tone="error" title={t.refused}>
            {fill(t.refusedText, { problem: t.documentProblems[refused.code] ?? refused.code, part: t.parts[refused.part] ?? refused.part, path: refused.path })}
          </Alert>
        </div>
      ) : null}
      <div className={styles.editorCards}>
        <Card title={t.body} headingLevel={2}>
          <div className={styles.form}>
            {/* One Tab stop; the arrow keys move inside (WAI-ARIA toolbar). */}
            { }
            <div ref={toolbarElement} className={styles.editorToolbar} role="toolbar" aria-label={t.toolbar} data-confera-template-toolbar onKeyDown={onToolbarKey} onFocus={onToolbarFocus}>
              <div className={styles.editorField}>
                <Select label={t.block} value={toolbar.block === 'list' || toolbar.block === 'mixed' ? '' : toolbar.block} placeholder="—" onChange={(event) => body((handle) => handle.run(setBlock(event.target.value as BlockKind)))()} options={(['paragraph', 'heading1', 'heading2', 'heading3'] as const).map((value) => ({ value, label: t.blocks[value] ?? value }))} />
              </div>
              <div className={styles.editorGroup}>
                {(['bold', 'italic', 'underline'] as const satisfies readonly TextMark[]).map((mark) => (
                  <ToolButton key={mark} icon={mark} pressed={toolbar.marks[mark]} onPress={body((handle) => handle.run(toggleTextMark(mark)))}>
                    {t[mark]}
                  </ToolButton>
                ))}
              </div>
              <div className={styles.editorGroup}>
                <ToolButton icon="list" pressed={toolbar.list === 'bulletList'} onPress={body((handle) => handle.run(toggleList('bulletList')))}>
                  {t.bulletList}
                </ToolButton>
                <ToolButton icon="list-ordered" pressed={toolbar.list === 'numberedList'} onPress={body((handle) => handle.run(toggleList('numberedList')))}>
                  {t.numberedList}
                </ToolButton>
                <ToolButton icon="corner-down-left" onPress={body((handle) => handle.run(insertHardBreak))}>
                  {t.lineBreak}
                </ToolButton>
              </div>
              <div className={styles.editorGroup}>
                <ToolButton icon="link" pressed={toolbar.link !== null} onPress={openLink}>
                  {t.link}
                </ToolButton>
                {toolbar.link !== null ? <ToolButton onPress={body((handle) => handle.run(removeLink))}>{t.linkRemove}</ToolButton> : null}
                <ToolButton
                  icon="image"
                  disabled={images >= MAX_IMAGES}
                  onPress={() => {
                    setImageAlt('');
                    setImageProblem(null);
                    setImageAsk({ file: null });
                  }}
                >
                  {t.image}
                </ToolButton>
              </div>
              <div className={styles.editorField}>
                <Select label={t.insert} value="" placeholder={t.insertChoose} onChange={(event) => insert(event.target.value)} options={placeholders.map((key) => ({ value: key, label: placeholderLabel(key) }))} data-confera-insert-placeholder />
              </div>
              {conditions.length > 0 ? (
                <div className={styles.editorField}>
                  <Select label={t.condition} value="" placeholder={t.conditionChoose} onChange={(event) => body((handle) => handle.run(wrapInCondition(event.target.value)))()} options={conditions.map((key) => ({ value: key, label: t.conditions[key] ?? key }))} />
                </div>
              ) : null}
              {/* Only where it does something: the cursor in a block shown on a condition (UX4-10). */}
              {toolbar.condition !== null ? <ToolButton onPress={body((handle) => handle.run(liftOutOfCondition))}>{t.conditionLift}</ToolButton> : null}
              <div className={styles.editorGroup}>
                <ToolButton icon="undo" disabled={!toolbar.canUndo} onPress={body((handle) => handle.run(undo))}>
                  {t.undo}
                </ToolButton>
                <ToolButton icon="redo" disabled={!toolbar.canRedo} onPress={body((handle) => handle.run(redo))}>
                  {t.redo}
                </ToolButton>
              </div>
            </div>
            <div className={styles.form}>
              <span className={styles.editorLabel}>{t.subject}</span>
              <div ref={subjectElement} className={`${styles.editor} ${styles.subject}`} onFocus={() => (focused.current = 'subject')} data-confera-template-subject />
              <p id="template-subject-hint" className={styles.text}>
                {t.subjectHint}
              </p>
            </div>
            <div className={styles.form}>
              <span className={styles.editorLabel}>{t.body}</span>
              <div ref={bodyElement} className={styles.editor} onFocus={() => (focused.current = 'body')} data-confera-template-body />
              <p id="template-body-hint" className={styles.text}>
                {t.bodyHint}
                {record.language === 'sr' ? ` ${t.serbianCase}` : ''}
              </p>
            </div>
          </div>
        </Card>
        <Card title={t.preview} headingLevel={2}>
          <div className={styles.form} data-confera-template-preview={preview.phase}>
            <p className={styles.text}>{t.previewText}</p>
            {conditions.length > 0 ? (
              <CheckboxGroup
                label={t.previewConditions}
                value={conditions.filter((key) => !off.has(key))}
                onChange={(on) => setPreviewOff(conditions.filter((key) => !on.includes(key)))}
                options={conditions.map((key) => ({ value: key, label: t.conditions[key] ?? key }))}
              />
            ) : null}
            {preview.phase === 'loading' && !shown ? <Spinner label={t.previewLoading} /> : null}
            {preview.phase === 'failed' ? <Alert tone="warning" title={t.previewFailed} /> : null}
            {shown && preview.phase !== 'failed' ? (
              <>
                <p className={`${styles.text} ${styles.break}`}>
                  {t.previewSubject}: <strong data-confera-preview-subject>{shown.subject}</strong>
                </p>
                {/* The server's rendering, only in the sandboxed frame (ST-28). */}
                {shown.imagesPending.length > 0 ? <Alert tone="info" title={t.imagesPending} /> : null}
                <SandboxedMarkupFrame className={styles.frame} title={t.previewFrame} markup={shown.html} />
                <pre className={styles.plain} aria-label={t.previewPlain}>
                  {shown.text}
                </pre>
              </>
            ) : null}
          </div>
        </Card>
      </div>
      {/* Save with the state beside it, in view wherever the page is scrolled (UX4-10); the editor is never pushed down. */}
      {mayManage ? (
        <div ref={actionsElement} className={styles.stickyActions} role="region" aria-label={t.actionsLabel} data-confera-template-actions="">
          <span className={styles.text} role="status" data-confera-template-state={dirty ? 'unsaved' : 'saved'}>
            {dirty ? t.unsaved : t.savedState} <span className={styles.wideOnly}>{t.saveShortcut}</span>
          </span>
          <Button onClick={() => void save()} disabled={!ready || busy || !dirty}>
            {busy ? TEXTS.common.loading : t.save}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={linking}
        onClose={() => setLinking(false)}
        title={t.linkTitle}
        actions={
          <>
            <TextButton type="button" onClick={() => setLinking(false)}>
              {TEXTS.common.cancel}
            </TextButton>
            <Button type="button" onClick={applyLink}>
              {t.linkApply}
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          <p className="ud-dialog__text">{t.linkText}</p>
          {linkProblem ? <Alert tone="error" title={linkProblem} /> : null}
          {carries ? (
            <RadioGroup
              label={t.linkKind}
              value={linkKind}
              onChange={(value) => setLinkKind(value as 'secure' | 'typed')}
              options={[
                { value: 'secure', label: t.linkSecure },
                { value: 'typed', label: t.linkTyped },
              ]}
            />
          ) : null}
          {linkKind === 'typed' || !carries ? <TextField label={t.linkAddress} name="href" value={linkAddress} spellCheck={false} onChange={(event) => setLinkAddress(event.target.value)} message={t.linkAddressHint} /> : null}
          {selectionEmpty ? <TextField label={t.linkLabel} name="label" value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} /> : null}
        </div>
      </Dialog>

      <Dialog
        open={imageAsk !== null}
        onClose={() => setImageAsk(null)}
        title={t.imageTitle}
        actions={
          <>
            <TextButton type="button" onClick={() => setImageAsk(null)}>
              {TEXTS.common.cancel}
            </TextButton>
            <Button type="button" disabled={imageBusy} onClick={() => void insertTheImage()}>
              {imageBusy ? t.imageUploading : t.imageInsert}
            </Button>
          </>
        }
      >
        <div className={styles.form} data-confera-image-dialog="">
          <p className="ud-dialog__text">{t.imageText}</p>
          {imageProblem ? <Alert tone="error" title={imageProblem} /> : null}
          <FileButton
            label={t.imageFile}
            hint={t.imageFileHint}
            buttonText={t.imageChoose}
            accept="image/png,image/jpeg,image/gif"
            name="image"
            {...(imageAsk?.file ? { fileName: imageAsk.file.name } : {})}
            onChange={(event) => setImageAsk({ file: event.target.files?.[0] ?? null })}
          />
          <TextField label={t.imageAlt} name="alt" required value={imageAlt} maxLength={300} onChange={(event) => setImageAlt(event.target.value)} message={t.imageAltHint} />
        </div>
      </Dialog>

      <ConfirmDialog open={dropping} title={fill(t.dropOwnQuestion, { conference: conferenceName || t.thisConference })} confirmText={t.dropOwn} destructive busy={busy} onCancel={() => setDropping(false)} onConfirm={() => void dropOwn()}>
        {fill(t.dropOwnText, { conference: conferenceName || t.thisConference })}
      </ConfirmDialog>
    </div>
  );
}
