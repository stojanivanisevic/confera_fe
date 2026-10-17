'use client';

/**
 * One submission (M3-FE-06; FR-SUB-04, FR-SUB-01, FR-FILE-02, FR-FILE-03, FR-FORM-11): everything
 * that exists of it in 0.3.0, read-only: the data under the labels of the form version it was made
 * with, the authors, the files with their scan state (a file is downloaded only once it is clean;
 * an old .doc with macros is flagged), the consent with its text and time, the history of its status
 * and the emails about it (a held confirmation says so).
 */
import { useRouter } from 'next/navigation';

import { readDefinition, textOf, type FormDefinition } from '@confera/form-renderer';
import { Alert, Card, DataTable, DescriptionList, PageHeader, StatusBadge, TextButton } from '@confera/ui';

import styles from './admin.module.css';
import { formatDateTime } from './format';
import { intake, type SubmissionDetail, type SubmissionFile } from './intake-api';
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
  const rows = (definition ? fields.filter((f) => Object.hasOwn(record.answers, f.key)).map((f) => ({ label: textOf(f.label, 'en'), key: f.key })) : Object.keys(record.answers).filter((key) => typeof record.answers[key] !== 'object').map((key) => ({ label: key, key }))).map(
    (row) => ({ label: row.label, value: <span className={styles.break}>{answerText(definition, row.key, record.answers[row.key])}</span> }),
  );

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
                {file.scanState === 'clean' ? (
                  <a className="ud-link" href={intake.fileHref(record.id, file.id)} download>
                    {fill(t.download, { name: file.name })}
                  </a>
                ) : (
                  <span>{file.name}</span>
                )}
                <span className={styles.small}>{`${file.type.toUpperCase()}, ${size(file.sizeBytes)}`}</span>
                {scan(file)}
                {file.scanFlag === 'macros' ? <StatusBadge tone="warning">{t.macros}</StatusBadge> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t.consent} headingLevel={2}>
        <div className={styles.stack}>
          <p className={styles.text}>{record.consent.text}</p>
          <p className={styles.small}>{fill(t.consentAt, { when: formatDateTime(record.consent.consentedAt), version: record.consent.version })}</p>
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
              { key: 'status', header: t.status, render: (row) => <StatusBadge tone={row.status === 'sent' ? 'success' : row.status === 'held' ? 'warning' : row.status === 'failed' ? 'danger' : 'info'}>{t.emailStatus[row.status] ?? row.status}</StatusBadge> },
              { key: 'createdAt', header: t.queuedAt, render: (row) => formatDateTime(row.createdAt) },
              { key: 'sentAt', header: t.sentAt, render: (row) => (row.sentAt ? formatDateTime(row.sentAt) : t.none) },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
