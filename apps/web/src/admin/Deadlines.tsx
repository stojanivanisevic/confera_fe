'use client';

/**
 * The deadlines of a conference (M3-FE-06; FR-DL-01 to 03): the abstract submission, the fee payment
 * and the full paper, each a last day that ends at the end of that day in the conference's time
 * zone. Setting a later day opens the form again at once; the history keeps every old and new day,
 * who changed it and when. A change is made on the version of the deadline the screen holds.
 */
import { useState, type FormEvent } from 'react';

import { Alert, Button, Card, DataTable, DateField, StatusBadge, TextButton, toast } from '@confera/ui';

import styles from './admin.module.css';
import { formatDate, formatDateTime } from './format';
import { DEADLINE_KINDS, intake, type DeadlineKind, type Deadlines as DeadlinesRecord } from './intake-api';
import { ProblemAlert } from './ProblemAlert';
import { explain, fieldMessages, isApiError, type Explained } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

export function Deadlines({ conferenceId, readOnly, archived }: { conferenceId: string; readOnly: boolean; archived: boolean }) {
  const { client, contact } = useSession();
  const t = TEXTS.deadlines;
  const deadlines = useLoad<DeadlinesRecord>((c) => intake.deadlines(c, conferenceId), [conferenceId]);
  const record = deadlines.state.data;
  const [days, setDays] = useState<Partial<Record<DeadlineKind, string>>>({});
  const [busy, setBusy] = useState<DeadlineKind | null>(null);
  const [problem, setProblem] = useState<Explained | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  if (deadlines.state.phase === 'failed' && !record) {
    return (
      <Card title={t.title} headingLevel={2}>
        <Alert tone="error" title={deadlines.state.problem.title} action={<TextButton onClick={() => void deadlines.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {deadlines.state.problem.text}
        </Alert>
      </Card>
    );
  }
  if (!record) return null;

  const of = (kind: DeadlineKind) => record.items.find((item) => item.kind === kind);
  const save = async (event: FormEvent, kind: DeadlineKind) => {
    event.preventDefault();
    const endsOn = days[kind] ?? of(kind)?.endsOn ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return setFields({ [kind]: TEXTS.problems.fields.isISO8601 ?? TEXTS.problems.fieldFallback });
    setBusy(kind);
    setProblem(null);
    setFields({});
    try {
      const next = await intake.setDeadline(client, conferenceId, kind, endsOn, of(kind)?.version);
      deadlines.replace(next);
      setDays((current) => ({ ...current, [kind]: undefined }));
      toast({ title: fill(t.saved, { kind: t.kinds[kind] ?? kind, date: formatDate(`${endsOn}T12:00:00Z`) }), tone: 'success' });
    } catch (error) {
      const refused = fieldMessages(error);
      setFields(refused.endsOn ? { [kind]: refused.endsOn } : {});
      setProblem(explain(error, contact));
      if (isApiError(error) && error.code === 'version_conflict') await deadlines.reload({ background: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title={t.title} headingLevel={2} data-confera-deadlines="">
      <div className={styles.stack}>
        <p className={styles.text}>{fill(t.lead, { zone: record.timeZone })}</p>
        {archived ? (
          <Alert tone="info" title={t.archived}>
            {TEXTS.conferences.archivedText}
          </Alert>
        ) : null}
        {problem ? (
          <ProblemAlert title={problem.title} onClose={() => setProblem(null)}>
            {problem.text}
          </ProblemAlert>
        ) : null}
        {DEADLINE_KINDS.map((kind) => {
          const deadline = of(kind);
          const value = days[kind] ?? deadline?.endsOn ?? '';
          return (
            <form key={kind} className={styles.fields} onSubmit={(event) => void save(event, kind)} noValidate data-confera-deadline={kind}>
              <DateField
                label={t.kinds[kind] ?? kind}
                name={kind}
                value={value}
                disabled={readOnly || archived}
                onChange={(event) => setDays((current) => ({ ...current, [kind]: event.target.value }))}
                status={fields[kind] ? 'error' : 'default'}
                // The last day as the admin set it, inclusive; the exclusive end (`endsAt`) is for the server's clock (UX3-08).
                message={fields[kind] ?? (deadline ? fill(t.openUntil, { date: formatDate(`${deadline.endsOn}T12:00:00Z`), zone: record.timeZone }) : t.notSet)}
              />
              <div className={styles.actionsInline}>
                {deadline ? <StatusBadge tone={deadline.passed ? 'warning' : 'success'}>{deadline.passed ? t.passed : t.ahead}</StatusBadge> : null}
                {readOnly || archived ? null : (
                  <Button type="submit" variant="dark" aria-label={fill(t.saveKind, { kind: (t.kinds[kind] ?? kind).toLowerCase() })} disabled={busy !== null || value === (deadline?.endsOn ?? '')}>
                    {busy === kind ? TEXTS.common.loading : t.save}
                  </Button>
                )}
              </div>
            </form>
          );
        })}
        <DataTable
          caption={t.history}
          rows={record.history.map((change, index) => ({ ...change, key: String(index) }))}
          rowKey="key"
          empty={<p className={styles.text}>{t.historyEmpty}</p>}
          columns={[
            {
              key: 'kind',
              header: t.history,
              render: (row) =>
                row.oldEndsOn
                  ? fill(t.change, { kind: t.kinds[row.kind] ?? row.kind, old: formatDate(`${row.oldEndsOn}T12:00:00Z`), new: formatDate(`${row.newEndsOn}T12:00:00Z`) })
                  : fill(t.changeFirst, { kind: t.kinds[row.kind] ?? row.kind, new: formatDate(`${row.newEndsOn}T12:00:00Z`) }),
            },
            { key: 'changedAt', header: t.byAndWhen, render: (row) => fill(t.by, { who: row.changedBy?.displayName ?? '—', when: formatDateTime(row.changedAt) }) },
          ]}
        />
      </div>
    </Card>
  );
}
