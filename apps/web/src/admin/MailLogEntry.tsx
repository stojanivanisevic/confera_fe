'use client';

/**
 * One attempt of the mail log (M2-FE-04; FR-SMTP-04, ST-28): its facts, and the message as it
 * was sent. A stored body is markup that came from outside this page: it is shown only inside
 * the reviewed sandboxed frame of the design system (no script, no request, its own policy),
 * never in the page itself. The plain-text body is text.
 */
import { useRouter } from 'next/navigation';

import type { MailLogEntry as MailLogRecord } from '@confera/api-client';
import { Alert, Card, DescriptionList, PageHeader, SandboxedMarkupFrame, StatusBadge, TextButton } from '@confera/ui';

import styles from './admin.module.css';
import { conferenceLabel, useConference } from './conference-context';
import { formatDateTime } from './format';
import { call } from './problems';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

export function MailLogEntry({ id }: { id: string }) {
  const router = useRouter();
  const { conferences } = useConference();
  const t = TEXTS.mailLog;
  const entry = useLoad<MailLogRecord>((c) => call(c.GET('/api/v1/mail-log/{id}', { params: { path: { id } } })), [id]);
  const record = entry.state.data;
  const back = { label: t.back, href: '/mail-log', onClick: () => router.push('/mail-log') };

  if (entry.state.phase === 'failed' && !record) {
    return (
      <div className={styles.stack}>
        <PageHeader title={t.title} breadcrumbs={[back]} />
        <Alert tone="error" title={entry.state.problem.title} action={<TextButton onClick={() => void entry.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {entry.state.problem.text}
        </Alert>
      </div>
    );
  }
  if (!record) return null;

  const title = TEXTS.templates.types[record.kind] ?? record.kind;
  const conference = record.conferenceId ? conferences.find((item) => item.id === record.conferenceId) : undefined;
  const kept = record.bodyHtml !== null || record.bodyText !== null;

  return (
    <div className={styles.stack}>
      <PageHeader title={title} description={<span className={styles.break}>{fill(t.entry, { recipient: record.recipient })}</span>} breadcrumbs={[back, { label: title }]} />
      <Card title={t.details} headingLevel={2}>
        <DescriptionList
          items={[
            { label: t.sentAt, value: formatDateTime(record.sentAt) },
            { label: t.result, value: <StatusBadge tone={record.result === 'sent' ? 'success' : 'danger'}>{t.results[record.result] ?? record.result}</StatusBadge> },
            ...(record.errorCode ? [{ label: t.errorCode, value: t.errors[record.errorCode] ?? record.errorCode }] : []),
            { label: t.kind, value: TEXTS.templates.types[record.kind] ?? record.kind },
            { label: t.language, value: TEXTS.conferences.languageNames[record.language] ?? record.language },
            { label: t.server, value: record.serverName ?? '' },
            { label: t.attempt, value: String(record.attempt) },
            ...(record.conferenceId ? [{ label: TEXTS.nav.conferences, value: conference ? conferenceLabel(conference) : record.conferenceId }] : []),
            { label: t.recipient, value: <span className={styles.break}>{record.recipient}</span> },
            { label: t.messageId, value: <span className={styles.break}>{record.messageId}</span> },
            ...(record.subject !== null ? [{ label: t.subject, value: <span className={styles.break}>{record.subject}</span> }] : []),
          ]}
        />
      </Card>
      {kept ? (
        <div className={styles.cards}>
          {record.bodyHtml !== null ? (
            <Card title={t.bodyHtml} headingLevel={2}>
              <SandboxedMarkupFrame className={styles.frame} title={t.frameTitle} markup={record.bodyHtml} />
            </Card>
          ) : null}
          {record.bodyText !== null ? (
            <Card title={t.bodyText} headingLevel={2}>
              <pre className={styles.plain} data-confera-plain-body>
                {record.bodyText}
              </pre>
            </Card>
          ) : null}
        </div>
      ) : (
        <Alert tone="info" title={t.notKept}>
          {t.notKeptText}
        </Alert>
      )}
    </div>
  );
}
