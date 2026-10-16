'use client';

/**
 * The template editor (M2-FE-05, the spike of ADR-12): a seeded template loads into the rich-
 * text engine (ProseMirror, @confera/template-editor), is edited with a toolbar of design-
 * system controls, and is checked as the server checks it; the preview renders it as the
 * server renders it, inside the sandboxed frame. A placeholder is one object: it is inserted
 * from the type's catalogue, shown as a chip with its name, and deleted as a whole. There is
 * no save in 0.2.0 (the API has no write route for templates before 0.4.0).
 */
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

import { carriesLink, catalogueOf, checkBody, checkSubject, DocumentError, isTypedLink, renderBody, renderSubject, type DocNode, type MailTemplate, type SubjectNode } from '@confera/api-client';
import { Alert, Button, Card, Dialog, IconButton, PageHeader, RadioGroup, SandboxedMarkupFrame, Select, TextButton, TextField, type IconName } from '@confera/ui';
import {
  insertHardBreak,
  insertPlaceholder,
  liftOutOfCondition,
  mountBodyEditor,
  mountSubjectEditor,
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
import { call } from './problems';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

const t = TEXTS.templates;
const placeholderLabel = (key: string): string => t.placeholders[key] ?? key;

interface Preview {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/** The template rendered as the server renders it, with made-up values and every condition on. */
function previewOf(type: string, subject: unknown, body: unknown): Preview | null {
  const catalogue = catalogueOf(type);
  try {
    const values = Object.fromEntries([...catalogue.placeholders].map((key) => [key, t.samples[key] ?? key]));
    const input = { values, conditions: new Set(catalogue.conditions), link: carriesLink(type) ? t.sampleLink : undefined };
    return { subject: renderSubject(checkSubject(subject, catalogue), input), ...renderBody(checkBody(body, catalogue), input) };
  } catch {
    return null;
  }
}

type CheckResult = { readonly ok: true } | { readonly ok: false; readonly part: 'subject' | 'body'; readonly code: string; readonly path: string };

const NO_TOOLBAR: ToolbarState = { marks: { bold: false, italic: false, underline: false }, block: 'paragraph', list: null, link: null, canUndo: false, canRedo: false };

/** A toolbar button: it keeps the editor's selection (no focus on mouse down) and says whether it is on. */
function ToolButton({ pressed, onPress, disabled, icon, children }: { pressed?: boolean; onPress: () => void; disabled?: boolean; icon?: IconName; children: string }) {
  // An icon of the design system's toolbar set (2.4.0, M2-ISS-07), named by its text; a toggle that is on draws the ring (UXUI-M2-22).
  if (icon) return <IconButton icon={icon} label={children} aria-pressed={pressed} disabled={disabled} onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={onPress} />;
  return (
    <Button type="button" variant="dark" aria-pressed={pressed} disabled={disabled} onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={onPress}>
      {children}
    </Button>
  );
}

export function TemplateEditor({ id }: { id: string }) {
  const router = useRouter();
  const template = useLoad<MailTemplate>((c) => call(c.GET('/api/v1/mail-templates/{id}', { params: { path: { id } } })), [id]);
  const record = template.state.data;

  // What the server gave, checked: a template the server stored is a valid document of its type.
  const loaded = useMemo(() => {
    if (!record) return null;
    try {
      const catalogue = catalogueOf(record.type);
      return { subject: checkSubject(record.subject, catalogue), body: checkBody(record.body, catalogue) };
    } catch (error) {
      return error instanceof DocumentError ? error : null;
    }
  }, [record]);

  const subjectElement = useRef<HTMLDivElement>(null);
  const bodyElement = useRef<HTMLDivElement>(null);
  const editors = useRef<{ subject: EditorHandle<SubjectNode>; body: EditorHandle<DocNode> } | null>(null);
  const focused = useRef<'subject' | 'body'>('body');
  const [toolbar, setToolbar] = useState<ToolbarState>(NO_TOOLBAR);
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [checked, setChecked] = useState<CheckResult | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkKind, setLinkKind] = useState<'secure' | 'typed'>('typed');
  const [linkAddress, setLinkAddress] = useState('https://');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const [selectionEmpty, setSelectionEmpty] = useState(true);

  const type = record?.type ?? '';
  const ready = loaded !== null && !(loaded instanceof DocumentError);

  useEffect(() => {
    if (!record || loaded === null || loaded instanceof DocumentError || !subjectElement.current || !bodyElement.current) return;
    const subjectDoc = loaded.subject;
    const bodyDoc = loaded.body;
    const changed = () => {
      const handles = editors.current;
      if (!handles) return;
      setToolbar(handles.body.toolbar());
      setSelectionEmpty(handles.body.view.state.selection.empty);
      setChecked(null);
      const subject = handles.subject.read();
      const body = handles.body.read();
      setPreview(subject.ok && body.ok ? previewOf(record.type, subject.document, body.document) : null);
    };
    const subject = mountSubjectEditor(subjectElement.current, subjectDoc, { type: record.type, label: t.subject, describedBy: 'template-subject-hint', placeholderLabel, onChange: changed });
    const body = mountBodyEditor(bodyElement.current, bodyDoc, { type: record.type, label: t.body, describedBy: 'template-body-hint', placeholderLabel, onChange: changed });
    editors.current = { subject, body };
    return () => {
      subject.destroy();
      body.destroy();
      editors.current = null;
    };
  }, [record, loaded]);

  const back = { label: t.back, href: '/templates', onClick: () => router.push('/templates') };
  if (template.state.phase === 'failed' && !record) {
    return (
      <div className={styles.stack}>
        <PageHeader title={t.title} breadcrumbs={[back]} />
        <Alert tone="error" title={template.state.problem.title} action={<TextButton onClick={() => void template.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {template.state.problem.text}
        </Alert>
      </div>
    );
  }
  if (!record) return null;

  const title = `${t.types[record.type] ?? record.type} (${TEXTS.conferences.languageNames[record.language] ?? record.language})`;
  const catalogue = catalogueOf(type);
  const placeholders = [...catalogue.placeholders].filter((key) => key !== 'link');
  const conditions = [...catalogue.conditions];
  const shown = preview === undefined && loaded !== null && !(loaded instanceof DocumentError) ? previewOf(type, loaded.subject, loaded.body) : preview;

  const body = (run: (handle: EditorHandle<DocNode>) => void) => () => {
    if (editors.current) run(editors.current.body);
  };
  const insert = (key: string) => {
    const handles = editors.current;
    if (!handles || key === '') return;
    if (focused.current === 'subject') handles.subject.run(insertPlaceholder(key, subjectSchema));
    else handles.body.run(insertPlaceholder(key));
  };
  const check = () => {
    const handles = editors.current;
    if (!handles) return;
    const subject = handles.subject.read();
    if (!subject.ok) return setChecked({ ok: false, part: 'subject', code: subject.code, path: subject.path });
    const read = handles.body.read();
    setChecked(read.ok ? { ok: true } : { ok: false, part: 'body', code: read.code, path: read.path });
  };
  const openLink = () => {
    setLinkKind(toolbar.link === SECURE_LINK || (toolbar.link === null && carriesLink(type)) ? 'secure' : 'typed');
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

  return (
    <div className={styles.stack}>
      <PageHeader title={title} breadcrumbs={[back, { label: title }]} actions={<Button onClick={check} disabled={!ready}>{t.check}</Button>} />
      <Alert tone="info" title={t.spike}>
        {t.spikeText}
      </Alert>
      {loaded instanceof DocumentError ? <Alert tone="error" title={t.refused}>{fill(t.refusedText, { problem: t.documentProblems[loaded.code] ?? loaded.code, part: t.parts.body ?? 'body', path: loaded.path })}</Alert> : null}
      {checked ? (
        <div data-confera-template-check={checked.ok ? 'valid' : 'refused'}>
          {checked.ok ? (
            <Alert tone="success" title={t.checked}>
              {t.checkedText}
            </Alert>
          ) : (
            <Alert tone="error" title={t.refused}>
              {fill(t.refusedText, { problem: t.documentProblems[checked.code] ?? checked.code, part: t.parts[checked.part] ?? checked.part, path: checked.path })}
            </Alert>
          )}
        </div>
      ) : null}
      <div className={styles.cards}>
        <Card title={t.body} headingLevel={2}>
          <div className={styles.form}>
            <div className={styles.editorToolbar} role="toolbar" aria-label={t.toolbar} data-confera-template-toolbar>
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
                <ToolButton icon="corner-down-left" onPress={body((handle) => handle.run(insertHardBreak))}>{t.lineBreak}</ToolButton>
              </div>
              <div className={styles.editorGroup}>
                <ToolButton icon="link" pressed={toolbar.link !== null} onPress={openLink}>
                  {t.link}
                </ToolButton>
                {toolbar.link !== null ? <ToolButton onPress={body((handle) => handle.run(removeLink))}>{t.linkRemove}</ToolButton> : null}
              </div>
              <div className={styles.editorField}>
                <Select label={t.insert} value="" placeholder={t.insertChoose} onChange={(event) => insert(event.target.value)} options={placeholders.map((key) => ({ value: key, label: placeholderLabel(key) }))} data-confera-insert-placeholder />
              </div>
              {conditions.length > 0 ? (
                <div className={styles.editorField}>
                  <Select label={t.condition} value="" placeholder={t.conditionChoose} onChange={(event) => body((handle) => handle.run(wrapInCondition(event.target.value)))()} options={conditions.map((key) => ({ value: key, label: t.conditions[key] ?? key }))} />
                </div>
              ) : null}
              {conditions.length > 0 ? <ToolButton onPress={body((handle) => handle.run(liftOutOfCondition))}>{t.conditionLift}</ToolButton> : null}
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
              </p>
            </div>
          </div>
        </Card>
        <Card title={t.preview} headingLevel={2}>
          <div className={styles.form} data-confera-template-preview>
            <p className={styles.text}>{t.previewText}</p>
            {shown ? (
              <>
                <p className={styles.text}>
                  {t.previewSubject}: <strong data-confera-preview-subject>{shown.subject}</strong>
                </p>
                <SandboxedMarkupFrame className={styles.frame} title={t.previewFrame} markup={shown.html} />
                <pre className={styles.plain} aria-label={t.previewPlain}>
                  {shown.text}
                </pre>
              </>
            ) : (
              <Alert tone="warning" title={t.previewFailed} />
            )}
          </div>
        </Card>
      </div>

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
          {carriesLink(type) ? (
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
          {linkKind === 'typed' || !carriesLink(type) ? <TextField label={t.linkAddress} name="href" value={linkAddress} spellCheck={false} onChange={(event) => setLinkAddress(event.target.value)} message={t.linkAddressHint} /> : null}
          {selectionEmpty ? <TextField label={t.linkLabel} name="label" value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} /> : null}
        </div>
      </Dialog>
    </div>
  );
}
