'use client';

/**
 * One submission (M3-FE-06, M4-FE-01; FR-SUB-04 to 08, FR-MAIL-08, FR-FILE-02, FR-FILE-03,
 * FR-FORM-11): the data under the labels of the form version it was made with, the authors, the
 * files with their scan state, the consent, its history and its emails, and since 0.4.0 what the
 * office does with it:
 *   - its status, changed only along the state table of the Spec (section 5): the actions the
 *     submission allows now are offered, nothing else. A change that carries a text for the author
 *     (return for revision always; reject, withdraw and reopen with a message) shows the finished
 *     email first, as the server renders it, in the sandboxed frame; Cancel changes nothing and
 *     sends nothing, Send changes the status and sends exactly that text (FR-MAIL-08). One key per
 *     dialog, so a double click is one change and one email (FR-MAIL-05);
 *   - opening a new submission takes it into processing (transition 2): a POST of this page, as the
 *     plan has it, never a side effect of reading it (M4-BE-01);
 *   - internal notes (FR-SUB-07), the edit on the author's behalf with the old values kept
 *     (FR-SUB-06), and the history with the message, the internal reason and whether an email went.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { countWords, parseSafeText, readDefinition, textOf, type FieldKind, type FormDefinition } from '@confera/form-renderer';
import { Alert, Button, Card, Checkbox, DataTable, DescriptionList, Dialog, Drawer, Menu, PageHeader, SandboxedMarkupFrame, Select, StatusBadge, Textarea, TextButton, TextField, toast } from '@confera/ui';

import styles from './admin.module.css';
import { formatDateTime } from './format';
import { heldWhy } from './HeldMail';
import { intake, type HeldMail, type SubmissionFile } from './intake-api';
import { ACTION_OF_TRANSITION, ACTION_RULES, actionsOf, m4, type Action, type ManagedSubmission, type Revision, type StatusEmailPreview } from './m4-api';
import { ProblemAlert } from './ProblemAlert';
import { explain, fieldMessages, isApiError, type Explained } from './problems';
import { useSession } from './session';
import { statusText, statusTone } from './Submissions';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

const MB = 1024 * 1024;
const size = (bytes: number) => (bytes >= MB ? `${(Math.round((bytes / MB) * 10) / 10).toString()} MB` : `${Math.max(1, Math.round(bytes / 1024)).toString()} KB`);
const newKey = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/** The answer of a field as the office reads it: the option's label, yes and no, or the text. */
function answerText(definition: FormDefinition | null, key: string, value: unknown): string {
  const t = TEXTS.submissions;
  if (typeof value === 'boolean') return value ? t.given : t.no;
  if (typeof value !== 'string') return '';
  const field = definition?.sections.flatMap((s) => s.fields).find((f) => f.key === key);
  const option = field?.options?.find((o) => o.value === value);
  return option ? textOf(option.label, 'en') : value;
}

/** An answer that needs a row of its own (UX3-02): a long text, or any text too long for a column of the grid. */
const LONG_ANSWER = 80;

/** The consent as the author read it: its links as their words, not the link syntax of the stored text (UX3-05). */
const consentWords = (text: string): string => parseSafeText(text).map((segment) => segment.text).join('');
/** A text version that is a checksum is shown by its first 8 characters, the whole in its title (UX3-05: no sideways scroll at 375 px). */
const shortVersion = (version: string): string => (version.length > 12 ? version.slice(0, 8) : version);
const isLong = (kind: FieldKind | null, text: string): boolean => kind === 'longText' || text.length > LONG_ANSWER;
/** The fields the office may correct for the author (FR-SUB-06): the texts and the choices of the form, not files and not the consent. */
const EDITABLE: readonly FieldKind[] = ['text', 'longText', 'email', 'choice'];

export function Submission({ id }: { id: string }) {
  const router = useRouter();
  const { client, contact, session } = useSession();
  const t = TEXTS.submissions;
  const mayManage = session?.user.permissions.includes('submissions.manage') ?? false;
  const detail = useLoad<ManagedSubmission>((c) => m4.submission(c, id), [id]);
  const record = detail.state.data;
  const version = useLoad<FormDefinition | null>(
    (c) => (record ? intake.version(c, record.form.id, record.form.versionNumber).then((v) => readDefinition(v.definition)).catch(() => null) : Promise.resolve(null)),
    [record?.form.id, record?.form.versionNumber],
  );
  const definition = version.state.data ?? null;
  const [asked, setAsked] = useState<Action | null>(null);
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<Explained | null>(null);

  // Transition 2: the first admin who opens a new submission takes it into processing, by a POST of this page.
  const opening = useRef(false);
  useEffect(() => {
    if (!record || !mayManage || opening.current || !actionsOf(record).includes('open')) return;
    opening.current = true;
    m4.changeStatus(client, record.id, { action: 'open', version: record.version }).then(
      (next) => {
        detail.replace(next);
        const off = next.statusHistory.at(-1)?.email === 'template_off';
        toast({ title: t.autoOpened, description: off ? t.autoOpenedOff : t.autoOpenedText, tone: 'success' });
      },
      (error: unknown) => {
        // Another admin was first: the page reads the submission as it is now.
        if (isApiError(error) && (error.code === 'version_conflict' || error.code === 'transition_refused')) void detail.reload({ background: true });
        else setProblem(explain(error, contact));
      },
    );
  }, [record, mayManage, client, detail, contact, t]);

  if (detail.state.phase === 'failed' && !record) {
    return (
      <div className={styles.stack}>
        <PageHeader title={t.title} breadcrumbs={[{ label: t.back, href: '/submissions', onClick: () => router.push('/submissions') }]} />
        <Alert tone="error" title={detail.state.problem.title} action={<TextButton onClick={() => void detail.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {detail.state.problem.text}
        </Alert>
      </div>
    );
  }
  if (!record) return null;

  // The data in the order of the form version, the authors and the files on their own.
  const fields = definition ? definition.sections.filter((s) => !s.repeat).flatMap((s) => s.fields).filter((f) => f.kind !== 'file' && f.kind !== 'consent') : [];
  const named: Array<{ label: string; key: string; kind: FieldKind | null }> = definition
    ? fields.filter((f) => Object.hasOwn(record.answers, f.key)).map((f) => ({ label: textOf(f.label, 'en'), key: f.key, kind: f.kind }))
    : Object.keys(record.answers).filter((key) => typeof record.answers[key] !== 'object').map((key) => ({ label: key, key, kind: null }));
  const answered = named.map((row) => ({ ...row, text: answerText(definition, row.key, record.answers[row.key]) }));
  // Short answers in the grid; a long text (the abstract) under it, the width of the card, with its paragraphs (UX3-02).
  const rows = answered.filter((row) => !isLong(row.kind, row.text)).map((row) => ({ label: row.label, value: <span className={styles.break}>{row.text}</span> }));
  const long = answered.filter((row) => isLong(row.kind, row.text));
  const actions = mayManage ? actionsOf(record).filter((action) => action !== 'open') : [];
  const labelOf = (field: string): string => {
    if (field === 'title') return t.fieldTitle;
    const key = field.replace(/^answers\./, '');
    const found = definition?.sections.flatMap((s) => s.fields).find((f) => f.key === key);
    return found ? textOf(found.label, 'en') : key;
  };

  const scan = (file: SubmissionFile) => {
    const tone = file.scanState === 'clean' ? 'success' : file.scanState === 'pending' ? 'info' : 'danger';
    const text = fill(t.scan[file.scanState] ?? file.scanState, { when: formatDateTime(file.pendingSince ?? file.scannedAt ?? '') });
    return <StatusBadge tone={tone}>{text}</StatusBadge>;
  };

  return (
    <div className={styles.stack} data-confera-submission={record.reference}>
      <PageHeader
        title={<span className={styles.break}>{record.title ?? record.reference}</span>}
        description={`${record.reference} · ${record.conference.name}`}
        breadcrumbs={[{ label: t.back, href: '/submissions', onClick: () => router.push('/submissions') }, { label: record.reference }]}
        actions={
          <div className={styles.actionsInline}>
            <span data-confera-submission-status={record.status}>
              <StatusBadge tone={statusTone(record.status)}>{statusText(record.status)}</StatusBadge>
            </span>
            {mayManage ? (
              <Button variant="dark" icon="edit" onClick={() => setEditing(true)}>
                {t.edit}
              </Button>
            ) : null}
            {actions.length > 0 ? <Menu label={t.changeStatus} align="end" trigger={<Button type="button">{t.changeStatus}</Button>} items={actions.map((action) => ({ label: t.actions[action] ?? action, danger: action === 'reject' || action === 'withdraw', onSelect: () => setAsked(action) }))} /> : null}
          </div>
        }
      />
      {problem ? (
        <ProblemAlert title={problem.title} onClose={() => setProblem(null)}>
          {problem.text}
        </ProblemAlert>
      ) : null}
      <Card title={t.data} headingLevel={2}>
        <DescriptionList
          columns={2}
          items={[
            { label: t.reference, value: <span className={styles.mono}>{record.reference}</span> },
            { label: t.received, value: formatDateTime(record.receivedAt) },
            { label: t.language, value: t.languages[record.language] ?? record.language },
            { label: t.form, value: fill(t.formVersion, { slug: record.form.slug, n: record.form.versionNumber }) },
            ...rows,
          ]}
        />
        {long.map((row) => (
          <section key={row.key} className={styles.longAnswer} data-confera-long-answer={row.key}>
            <h3 className={styles.longAnswerLabel}>{row.kind === 'longText' ? fill(t.longAnswer, { label: row.label, n: countWords(row.text) }) : row.label}</h3>
            <p className={styles.longAnswerText}>{row.text}</p>
          </section>
        ))}
      </Card>
      <Card title={t.authors} headingLevel={2}>
        <DataTable
          caption={t.authors}
          rows={record.authors.map((author) => ({ ...author, key: String(author.position) }))}
          rowKey="key"
          columns={[
            { key: 'position', header: '#', render: (row) => String(row.position) },
            { key: 'name', header: t.authorName, render: (row) => <span className={styles.break}>{`${row.firstName} ${row.lastName}${row.isCorresponding ? ` (${t.corresponding})` : ''}`}</span> },
            { key: 'institution', header: t.institution, render: (row) => row.institution ?? t.none },
            { key: 'email', header: t.email, render: (row) => row.email },
            { key: 'orcid', header: t.orcid, render: (row) => row.orcid ?? t.none },
            { key: 'phone', header: t.phone, render: (row) => row.phone ?? t.none },
          ]}
        />
      </Card>
      <Card title={t.files} headingLevel={2}>
        {record.files.length === 0 ? (
          <p className={styles.text}>{t.noFiles}</p>
        ) : (
          <ul className={styles.plainList}>
            {record.files.map((file) => (
              <li key={file.id} className={styles.fileRow} data-confera-file-scan={file.scanState}>
                {/* Served only once the scan is clean (FR-FILE-02); the name keeps its letters (FR-FILE-03). */}
                {file.scanState === 'clean' && !file.downloadBlocked ? (
                  <a className="ud-link" href={intake.fileHref(record.id, file.id)} download>
                    {fill(t.download, { name: file.name })}
                  </a>
                ) : (
                  <span>{file.name}</span>
                )}
                <span className={styles.small}>{`${file.type.toUpperCase()}, ${size(file.sizeBytes)}`}</span>
                {scan(file)}
                {file.scanFlag && t.scanFlags[file.scanFlag] ? <StatusBadge tone="warning">{t.scanFlags[file.scanFlag]}</StatusBadge> : null}
                {/* Why it cannot be opened yet, or ever (UX3-07). */}
                {file.downloadBlocked ? (
                  <span className={`${styles.small} ${styles.fullLine}`} data-confera-file-blocked={file.downloadBlocked}>
                    {fill(t.blocked[file.downloadBlocked] ?? '', { when: file.nextScanAt ? formatDateTime(file.nextScanAt) : t.none })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t.consent} headingLevel={2}>
        <div className={styles.stack}>
          <p className={`${styles.text} ${styles.break}`}>{consentWords(record.consent.text)}</p>
          <p className={`${styles.small} ${styles.break}`} title={record.consent.version}>
            {fill(t.consentAt, { when: formatDateTime(record.consent.consentedAt), version: shortVersion(record.consent.version) })}
          </p>
        </div>
      </Card>
      {mayManage || record.notes.length > 0 ? <NotesCard record={record} mayManage={mayManage} onSaved={detail.replace} /> : null}
      <Card title={t.history} headingLevel={2}>
        <DataTable
          caption={t.history}
          rows={record.statusHistory.map((entry, index) => ({ ...entry, key: String(index) }))}
          rowKey="key"
          columns={[
            { key: 'status', header: t.status, render: (row) => statusText(row.status) },
            { key: 'action', header: t.historyAction, render: (row) => { const action = ACTION_OF_TRANSITION[row.transition]; return action ? (t.actions[action] ?? action) : row.transition === 1 ? t.receivedFromForm : t.none; } },
            {
              key: 'detail',
              header: t.historyDetail,
              render: (row) =>
                row.message || row.reason ? (
                  <span className={`${styles.stackTight} ${styles.break}`}>
                    {row.message ? <span>{fill(t.historyMessage, { text: row.message })}</span> : null}
                    {row.reason ? <span>{fill(t.historyReason, { text: row.reason })}</span> : null}
                  </span>
                ) : (
                  t.none
                ),
            },
            { key: 'email', header: t.historyEmail, render: (row) => (row.email === 'template_off' ? <StatusBadge tone="neutral">{t.emailOff}</StatusBadge> : row.email === 'queued' ? t.emailQueued : t.none) },
            { key: 'changedAt', header: t.when, render: (row) => formatDateTime(row.changedAt) },
            { key: 'actor', header: t.by, render: (row) => row.actor?.displayName ?? t.none },
          ]}
        />
      </Card>
      <RevisionsCard revisions={record.revisions} labelOf={labelOf} />
      <Card title={t.emails} headingLevel={2}>
        {record.emails.length === 0 ? (
          <p className={styles.text}>{t.noEmails}</p>
        ) : (
          <DataTable
            caption={t.emails}
            rows={[...record.emails]}
            rowKey="id"
            columns={[
              { key: 'kind', header: t.emailColumn, render: (row) => t.emailKinds[row.kind] ?? row.kind },
              { key: 'recipient', header: t.to, render: (row) => row.recipient },
              {
                key: 'status',
                header: t.status,
                render: (row) => (
                  <span className={styles.stackTight}>
                    <StatusBadge tone={row.status === 'sent' ? 'success' : row.status === 'held' ? 'warning' : row.status === 'failed' ? 'danger' : row.status === 'discarded' ? 'neutral' : 'info'}>{t.emailStatus[row.status] ?? row.status}</StatusBadge>
                    {/* The numbers that held it (UX3-06). */}
                    {row.status === 'held' && row.heldReason ? <span className={styles.small}>{heldWhy({ heldReason: row.heldReason as HeldMail['heldReason'], heldBy: row.heldBy ?? null })}</span> : null}
                  </span>
                ),
              },
              { key: 'createdAt', header: t.queuedAt, render: (row) => formatDateTime(row.createdAt) },
              { key: 'sentAt', header: t.sentAt, render: (row) => (row.sentAt ? formatDateTime(row.sentAt) : t.none) },
            ]}
          />
        )}
      </Card>

      {asked ? (
        <StatusDialog
          record={record}
          action={asked}
          onClose={() => setAsked(null)}
          onChanged={(next) => {
            detail.replace(next);
            setAsked(null);
            const off = next.statusHistory.at(-1)?.email === 'template_off';
            toast({ title: fill(t.changed, { status: statusText(next.status) }), description: off ? t.changedNoEmail : t.changedEmail, tone: 'success' });
          }}
          onStale={() => void detail.reload({ background: true })}
        />
      ) : null}
      {editing ? (
        <EditDrawer
          record={record}
          definition={definition}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            detail.replace(next);
            setEditing(false);
          }}
          onStale={() => void detail.reload({ background: true })}
        />
      ) : null}
    </div>
  );
}

/**
 * A change of status. A text for the author makes it two steps: the message, then the email as the
 * server renders it, shown before it goes (FR-MAIL-08). Without one it is one confirmation.
 */
function StatusDialog({ record, action, onClose, onChanged, onStale }: { record: ManagedSubmission; action: Action; onClose: () => void; onChanged: (next: ManagedSubmission) => void; onStale: () => void }) {
  const { client, contact } = useSession();
  const t = TEXTS.submissions;
  const rule = ACTION_RULES[action];
  // One key for this dialog: a double click, or Send pressed again after a lost answer, is one change (FR-MAIL-05).
  const [key] = useState(newKey);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [preview, setPreview] = useState<StatusEmailPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Explained | null>(null);
  const withMessage = rule.message !== 'none' && message.trim() !== '';
  const showsEmail = rule.message === 'required' || withMessage;

  const refused = (error: unknown) => {
    if (isApiError(error) && (error.code === 'version_conflict' || error.code === 'transition_refused')) {
      onStale();
      setProblem({ ...explain(error, contact), title: t.transitionRefused });
      return;
    }
    if (isApiError(error) && error.code === 'preview_outdated') {
      setPreview(null);
      setProblem({ ...explain(error, contact), title: t.previewOutdated });
      return;
    }
    const fields = fieldMessages(error);
    if (Object.keys(fields).length > 0) setErrors(fields);
    else setProblem(explain(error, contact));
  };
  const checked = (): boolean => {
    const next: Record<string, string> = {};
    if (rule.message === 'required' && message.trim() === '') next.message = t.messageRequired;
    if (rule.reason && reason.trim() === '') next.reason = t.reasonRequired;
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const showEmail = async () => {
    if (!checked()) return;
    setBusy(true);
    setProblem(null);
    try {
      setPreview(await m4.previewStatus(client, record.id, { action, message: withMessage ? message.trim() : undefined, reason: rule.reason ? reason.trim() : undefined }));
    } catch (error) {
      refused(error);
    } finally {
      setBusy(false);
    }
  };
  const change = async () => {
    if (!checked()) return;
    setBusy(true);
    setProblem(null);
    try {
      const next = await m4.changeStatus(
        client,
        record.id,
        { action, version: record.version, ...(withMessage ? { message: message.trim() } : {}), ...(rule.reason ? { reason: reason.trim() } : {}), ...(preview?.previewDigest ? { previewDigest: preview.previewDigest } : {}) },
      );
      onChanged(next);
    } catch (error) {
      refused(error);
    } finally {
      setBusy(false);
    }
  };

  const title = t.actions[action] ?? action;
  const email = preview?.sends && preview.html !== null ? preview : null;
  return (
    <Dialog
      open
      size={preview ? 'lg' : 'md'}
      onClose={onClose}
      title={preview ? t.emailTitle : title}
      actions={
        preview ? (
          <>
            <TextButton type="button" onClick={onClose}>
              {TEXTS.common.cancel}
            </TextButton>
            <TextButton type="button" onClick={() => setPreview(null)}>
              {t.previous}
            </TextButton>
            <Button type="button" disabled={busy} onClick={() => void change()}>
              {busy ? TEXTS.common.loading : email ? t.sendAndChange : t.confirmChange}
            </Button>
          </>
        ) : (
          <>
            <TextButton type="button" onClick={onClose}>
              {TEXTS.common.cancel}
            </TextButton>
            <Button type="button" disabled={busy} onClick={() => void (showsEmail ? showEmail() : change())}>
              {busy ? TEXTS.common.loading : showsEmail ? t.showEmail : t.confirmChange}
            </Button>
          </>
        )
      }
    >
      <div className={styles.form} data-confera-status-dialog={action} data-confera-status-step={preview ? 'email' : 'message'}>
        {problem ? <Alert tone="error" title={problem.title}>{problem.text}</Alert> : null}
        {preview ? (
          email ? (
            <>
              <p className="ud-dialog__text">{t.emailLead}</p>
              <DescriptionList
                items={[
                  { label: t.emailTo, value: <span className={styles.break}>{email.to ?? t.none}</span> },
                  { label: t.emailLanguage, value: email.language ? (t.languages[email.language] ?? email.language) : t.none },
                  { label: t.emailSubject, value: <strong className={styles.break} data-confera-status-email-subject="">{email.subject}</strong> },
                ]}
              />
              {/* The server's rendering, never in the page itself (ST-28). */}
              <SandboxedMarkupFrame className={styles.frame} title={t.emailFrame} markup={email.html ?? ''} />
              {/* The plain-text alternative, folded, so the dialog stays one screen high. */}
              <details className={styles.folded}>
                <summary>{t.emailPlain}</summary>
                <pre className={styles.plain} data-confera-status-email-text="">
                  {email.text}
                </pre>
              </details>
            </>
          ) : (
            <Alert tone="info" title={t.templateOff} />
          )
        ) : (
          <>
            <p className="ud-dialog__text">{t.actionText[action]}</p>
            {rule.message !== 'none' ? (
              <Textarea label={t.message} name="message" required={rule.message === 'required'} rows={6} value={message} onChange={(event) => setMessage(event.target.value)} message={errors.message ?? t.messageHint} status={errors.message ? 'error' : 'default'} maxLength={5000} />
            ) : null}
            {rule.reason ? <Textarea label={t.reason} name="reason" required rows={3} value={reason} onChange={(event) => setReason(event.target.value)} message={errors.reason ?? t.reasonHint} status={errors.reason ? 'error' : 'default'} maxLength={2000} /> : null}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Internal notes (FR-SUB-07): admins only, newest first. */
function NotesCard({ record, mayManage, onSaved }: { record: ManagedSubmission; mayManage: boolean; onSaved: (next: ManagedSubmission) => void }) {
  const { client, contact } = useSession();
  const t = TEXTS.submissions;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Newest first.
  const notes = [...record.notes].reverse();
  const add = async () => {
    if (text.trim() === '') return;
    setBusy(true);
    setProblem(null);
    try {
      const note = await m4.addNote(client, record.id, text.trim());
      onSaved({ ...record, notes: [...record.notes, note] });
      setText('');
      toast({ title: t.noteAdded, tone: 'success' });
    } catch (error) {
      setProblem(Object.values(fieldMessages(error))[0] ?? explain(error, contact).text);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t.notes} subtitle={t.notesLead} headingLevel={2} data-confera-notes="">
      <div className={styles.stack}>
        {notes.length === 0 ? (
          <p className={styles.text}>{t.noNotes}</p>
        ) : (
          <ul className={styles.plainList}>
            {notes.map((note) => (
              <li key={note.id} className={styles.stackTight}>
                <span className={`${styles.text} ${styles.break} ${styles.preWrap}`}>{note.body}</span>
                <span className={styles.small}>{fill(t.noteBy, { name: note.author?.displayName ?? t.none, when: formatDateTime(note.createdAt) })}</span>
              </li>
            ))}
          </ul>
        )}
        {mayManage ? (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <Textarea label={t.noteNew} name="note" rows={3} value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} status={problem ? 'error' : 'default'} {...(problem ? { message: problem } : {})} />
            <div className={styles.actionsInline}>
              <Button type="submit" variant="dark" disabled={busy || text.trim() === ''}>
                {t.noteAdd}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

const shown = (value: unknown): string => (value === null || value === undefined || value === '' ? TEXTS.submissions.none : typeof value === 'string' ? value : JSON.stringify(value));
const authorNames = (value: unknown): string => (Array.isArray(value) ? value.map((a: { firstName?: string; lastName?: string }) => `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim()).join(', ') : shown(value));

/** What the office changed on the author's behalf, with the old values (FR-SUB-06). */
function RevisionsCard({ revisions, labelOf }: { revisions: readonly Revision[]; labelOf: (field: string) => string }) {
  const t = TEXTS.submissions;
  return (
    <Card title={t.revisions} subtitle={revisions.length > 0 ? t.revisionsLead : undefined} headingLevel={2} data-confera-revisions="">
      {revisions.length === 0 ? (
        <p className={styles.text}>{t.noRevisions}</p>
      ) : (
        <ul className={styles.plainList}>
          {[...revisions].reverse().map((revision) => (
            <li key={revision.number} className={styles.stackTight}>
              <strong>{fill(t.revisionBy, { when: formatDateTime(revision.changedAt), name: revision.changedBy?.displayName ?? t.none })}</strong>
              {revision.fields.map((field) => (
                <span key={field} className={`${styles.small} ${styles.break}`}>
                  {field === 'authors' ? fill(t.revisionAuthors, { before: authorNames(revision.before[field]), after: authorNames(revision.after[field]) }) : fill(t.revisionField, { field: labelOf(field), before: shown(revision.before[field]), after: shown(revision.after[field]) })}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** An author as the answers hold it: the fields of the block of authors (firstName, lastName, institution, email, …). */
type AuthorDraft = Record<string, unknown> & { firstName?: string; lastName?: string; institution?: string | null; email?: string };
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The edit on the author's behalf (FR-SUB-06): the texts and choices of the form and the authors; files stay as sent. */
function EditDrawer({ record, definition, onClose, onSaved, onStale }: { record: ManagedSubmission; definition: FormDefinition | null; onClose: () => void; onSaved: (next: ManagedSubmission) => void; onStale: () => void }) {
  const { client, contact } = useSession();
  const t = TEXTS.submissions;
  const editable = (definition?.sections.filter((s) => !s.repeat).flatMap((s) => s.fields) ?? []).filter((f) => EDITABLE.includes(f.kind) && Object.hasOwn(record.answers, f.key));
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(editable.map((f) => [f.key, text(record.answers[f.key])])));
  // The authors are an answer of the form: the API checks a correction of them like a submit.
  const stored: AuthorDraft[] = Array.isArray(record.answers.authors)
    ? (record.answers.authors as AuthorDraft[])
    : record.authors.map((a) => ({ firstName: a.firstName, lastName: a.lastName, institution: a.institution, email: a.email }));
  const [authors, setAuthors] = useState<AuthorDraft[]>(() => stored.map((a) => ({ ...a })));
  const [resume, setResume] = useState(record.status === 'returned_for_revision');
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [problem, setProblem] = useState<Explained | null>(null);
  const [busy, setBusy] = useState(false);
  const canResume = actionsOf(record).includes('resume');

  const save = async () => {
    const changed: Record<string, unknown> = Object.fromEntries(Object.entries(answers).filter(([key, value]) => value !== text(record.answers[key])));
    if (JSON.stringify(authors) !== JSON.stringify(stored)) changed.authors = authors;
    setBusy(true);
    setProblem(null);
    setErrors({});
    try {
      let next = record;
      if (Object.keys(changed).length > 0) next = await m4.edit(client, record.id, { version: record.version, answers: changed });
      // The corrections of a returned submission take it back into processing: transition 5, with its own email.
      if (canResume && resume) next = await m4.changeStatus(client, record.id, { action: 'resume', version: next.version });
      toast({ title: next === record ? t.editNothing : t.editSaved, tone: next === record ? 'info' : 'success' });
      onSaved(next);
    } catch (error) {
      if (isApiError(error) && error.code === 'version_conflict') onStale();
      const fields = fieldMessages(error);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setProblem(explain(error, contact));
    } finally {
      setBusy(false);
    }
  };
  const setAuthor = (index: number, patch: Partial<AuthorDraft>) => setAuthors((list) => list.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  const fieldError = (path: string) => errors[`answers.${path}`] ?? errors[path];

  return (
    <Drawer
      open
      onClose={onClose}
      title={t.edit}
      width="min(100%, 40rem)"
      actions={
        <>
          <TextButton type="button" onClick={onClose}>
            {TEXTS.common.cancel}
          </TextButton>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? TEXTS.common.loading : t.editSave}
          </Button>
        </>
      }
    >
      <div className={styles.form} data-confera-edit-submission="">
        <p className={styles.text}>{t.editLead}</p>
        {problem ? (
          <ProblemAlert title={problem.title} onClose={() => setProblem(null)}>
            {problem.text}
          </ProblemAlert>
        ) : null}
        {editable.map((field) => {
          const label = textOf(field.label, 'en');
          const value = answers[field.key] ?? '';
          const message = fieldError(`answers.${field.key}`);
          const common = { label, name: field.key, value, status: message ? ('error' as const) : ('default' as const), ...(message ? { message } : {}) };
          if (field.kind === 'choice' && field.options) {
            return <Select key={field.key} {...common} onChange={(event) => setAnswers({ ...answers, [field.key]: event.target.value })} options={field.options.map((o) => ({ value: o.value, label: textOf(o.label, 'en') }))} />;
          }
          if (field.kind === 'longText') return <Textarea key={field.key} {...common} rows={8} onChange={(event) => setAnswers({ ...answers, [field.key]: event.target.value })} />;
          return <TextField key={field.key} {...common} type={field.kind === 'email' ? 'email' : 'text'} onChange={(event) => setAnswers({ ...answers, [field.key]: event.target.value })} />;
        })}
        {authors.map((author, index) => (
          <fieldset key={index} className={styles.fieldset}>
            <legend className={styles.editorLabel}>{fill(t.editAuthor, { n: index + 1 })}</legend>
            {(['firstName', 'lastName', 'institution', 'email'] as const).map((key) => {
              const message = fieldError(`authors[${String(index)}].${key}`);
              return (
                <TextField
                  key={key}
                  label={key === 'firstName' ? t.firstName : key === 'lastName' ? t.lastName : key === 'institution' ? t.institution : t.email}
                  type={key === 'email' ? 'email' : 'text'}
                  name={`authors.${String(index)}.${key}`}
                  value={text(author[key])}
                  onChange={(event) => setAuthor(index, { [key]: key === 'institution' && event.target.value === '' ? null : event.target.value })}
                  status={message ? 'error' : 'default'}
                  {...(message ? { message } : {})}
                />
              );
            })}
          </fieldset>
        ))}
        {canResume ? <Checkbox label={t.editResume} checked={resume} onChange={(event) => setResume(event.target.checked)} /> : null}
      </div>
    </Drawer>
  );
}
