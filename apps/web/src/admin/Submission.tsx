'use client';

/**
 * One submission (M3-FE-06; FR-SUB-04, FR-SUB-01, FR-FILE-02, FR-FILE-03, FR-FORM-11): everything
 * that exists of it in 0.3.0, read-only: the data under the labels of the form version it was made
 * with, the authors, the files with their scan state (a file is downloaded only once it is clean;
 * an old .doc with macros is flagged), the consent with its text and time, the history of its status
 * and the emails about it (a held confirmation says so).
 */
import { useRouter } from 'next/navigation';

import { countWords, parseSafeText, readDefinition, textOf, type FieldKind, type FormDefinition } from '@confera/form-renderer';
import { Alert, Card, DataTable, DescriptionList, PageHeader, StatusBadge, TextButton } from '@confera/ui';

import styles from './admin.module.css';
import { formatDateTime } from './format';
import { heldWhy } from './HeldMail';
import { intake, type HeldMail, type SubmissionDetail, type SubmissionFile } from './intake-api';
import { statusText } from './Submissions';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

const MB = 1024 * 1024;
const size = (bytes: number) => (bytes >= MB ? `${(Math.round((bytes / MB) * 10) / 10).toString()} MB` : `${Math.max(1, Math.round(bytes / 1024)).toString()} KB`);

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

export function Submission({ id }: { id: string }) {
  const router = useRouter();
  const t = TEXTS.submissions;
  const detail = useLoad<SubmissionDetail>((c) => intake.submission(c, id), [id]);
  const record = detail.state.data;
  const version = useLoad<FormDefinition | null>(
    (c) => (record ? intake.version(c, record.form.id, record.form.versionNumber).then((v) => readDefinition(v.definition)).catch(() => null) : Promise.resolve(null)),
    [record?.form.id, record?.form.versionNumber],
  );
  const definition = version.state.data ?? null;

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
        actions={<StatusBadge tone="info">{statusText(record.status)}</StatusBadge>}
      />
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
      <Card title={t.history} headingLevel={2}>
        <DataTable
          caption={t.history}
          rows={record.statusHistory.map((entry, index) => ({ ...entry, key: String(index) }))}
          rowKey="key"
          columns={[
            { key: 'status', header: t.status, render: (row) => statusText(row.status) },
            { key: 'changedAt', header: t.when, render: (row) => formatDateTime(row.changedAt) },
            { key: 'actor', header: t.by, render: (row) => row.actor?.displayName ?? t.none },
          ]}
        />
      </Card>
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
                    <StatusBadge tone={row.status === 'sent' ? 'success' : row.status === 'held' ? 'warning' : row.status === 'failed' ? 'danger' : 'info'}>{t.emailStatus[row.status] ?? row.status}</StatusBadge>
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
    </div>
  );
}
