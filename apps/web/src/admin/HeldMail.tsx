'use client';

/**
 * The held emails (M3-FE-08; ADR-08, M3-BE-09): the confirmation emails the send breaker holds,
 * with why each waits, released by an admin, a few or all at once; the breaker of the organisation.
 * The screen says what the breaker is for, and that a deadline day can trip it and one click
 * releases (the plan's acceptance criterion). The shell shows the count to every admin who may
 * release (`HeldMailAlert`).
 */
import { useEffect, useState, type FormEvent } from 'react';

import { Alert, Button, Card, ConfirmDialog, DataTable, EmptyState, NumberField, PageHeader, Pagination, TextButton, toast } from '@confera/ui';

import styles from './admin.module.css';
import { formatDateTime } from './format';
import { m4 } from './m4-api';
import { intake, type HeldMail as HeldMailRow, type HeldMailPage } from './intake-api';
import { ProblemAlert } from './ProblemAlert';
import { explain, type Explained } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

/** The event the screen sends after a release: the shell's count reads again. */
export const HELD_MAIL_CHANGED = 'confera:held-mail-changed';

/** Why an email is held, with the numbers that tripped the breaker when they were kept (UX3-06). */
export function heldWhy(row: Pick<HeldMailRow, 'heldReason' | 'heldBy'>): string {
  const t = TEXTS.heldMail;
  const reason = t.reasons[row.heldReason] ?? row.heldReason;
  const by = row.heldBy;
  if (!by) return reason;
  const numbers = { reason, count: by.count, limit: by.limit, window: t.windows[by.windowHours] ?? t.windows[24] ?? '' };
  return fill(row.heldReason === 'recipient_domain' ? t.reasonNumbersDomain : t.reasonNumbers, numbers);
}

export function HeldMail() {
  const { client, contact } = useSession();
  const t = TEXTS.heldMail;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const list = useLoad<HeldMailPage>((c) => intake.heldMail(c, { page, pageSize }), [page, pageSize]);
  const [selected, setSelected] = useState<Array<string | number>>([]);
  const [asking, setAsking] = useState<'selected' | 'all' | null>(null);
  // A held email that is not wanted (a bot's, a test's) is discarded: never sent, never released (M3-ISS-14).
  const [discarding, setDiscarding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Explained | null>(null);
  const total = list.state.data?.total ?? 0;

  const release = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const answer = await intake.release(client, asking === 'all' ? { all: true } : { ids: selected.map(String) });
      toast({ title: answer.released === 1 ? t.releasedOne : fill(t.released, { count: answer.released }), tone: 'success' });
      setSelected([]);
      setAsking(null);
      window.dispatchEvent(new Event(HELD_MAIL_CHANGED));
      await list.reload({ background: true });
    } catch (error) {
      setAsking(null);
      setProblem(explain(error, contact));
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const answer = await m4.discardHeld(client, { ids: selected.map(String) });
      toast({ title: answer.discarded === 1 ? t.discardedOne : fill(t.discarded, { count: answer.discarded }), tone: 'success' });
      setSelected([]);
      setDiscarding(false);
      window.dispatchEvent(new Event(HELD_MAIL_CHANGED));
      await list.reload({ background: true });
    } catch (error) {
      setDiscarding(false);
      setProblem(explain(error, contact));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t.title}
        description={t.lead}
        actions={
          total > 0 ? (
            <div className={styles.actionsInline}>
              <Button variant="dark" disabled={busy || selected.length === 0} onClick={() => setAsking('selected')}>
                {t.releaseSelected}
              </Button>
              <Button disabled={busy} onClick={() => setAsking('all')}>
                {fill(t.releaseAll, { count: total })}
              </Button>
              <TextButton tone="danger" icon="trash" disabled={busy || selected.length === 0} onClick={() => setDiscarding(true)}>
                {t.discardSelected}
              </TextButton>
            </div>
          ) : undefined
        }
      />
      <Alert tone="info" title={t.deadlineTitle}>
        {t.deadlineNote}
      </Alert>
      {problem ? (
        <ProblemAlert title={problem.title} onClose={() => setProblem(null)}>
          {problem.text}
        </ProblemAlert>
      ) : null}
      {list.state.phase === 'failed' ? (
        <Alert tone="error" title={list.state.problem.title} action={<TextButton onClick={() => void list.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {list.state.problem.text}
        </Alert>
      ) : null}
      {list.state.phase === 'failed' && !list.state.data ? null : (
        <DataTable<HeldMailRow>
          caption={t.title}
          rows={[...(list.state.data?.items ?? [])]}
          rowKey="id"
          selectable
          selected={selected}
          onSelectionChange={setSelected}
          loading={list.state.phase === 'loading' && !list.state.data}
          empty={<EmptyState title={t.empty} description={t.emptyText} />}
          columns={[
            { key: 'recipient', header: t.recipient },
            { key: 'conference', header: t.conference, render: (row) => row.conference?.name ?? '—' },
            { key: 'submission', header: t.submission, render: (row) => (row.submission ? <a className="ud-link" href={`/submissions/${row.submission.id}`}>{row.submission.reference}</a> : '—') },
            { key: 'heldReason', header: t.reason, render: (row) => heldWhy(row) },
            { key: 'createdAt', header: t.heldAt, render: (row) => formatDateTime(row.createdAt) },
          ]}
          footer={
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              pageSizeOptions={[25, 50, 100]}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          }
        />
      )}
      {list.state.data ? <OrganisationBreaker breaker={list.state.data.breaker} onSaved={() => void list.reload({ background: true })} /> : null}
      <ConfirmDialog
        open={asking !== null}
        title={(asking === 'all' ? total : selected.length) === 1 ? t.releaseQuestionOne : fill(t.releaseQuestion, { count: asking === 'all' ? total : selected.length })}
        confirmText={asking === 'all' ? fill(t.releaseAll, { count: total }) : t.releaseSelected}
        busy={busy}
        onCancel={() => setAsking(null)}
        onConfirm={() => void release()}
      >
        {t.releaseText}
      </ConfirmDialog>
      <ConfirmDialog open={discarding} title={selected.length === 1 ? t.discardQuestionOne : fill(t.discardQuestion, { count: selected.length })} confirmText={t.discardSelected} destructive busy={busy} onCancel={() => setDiscarding(false)} onConfirm={() => void discard()}>
        {t.discardText}
      </ConfirmDialog>
    </div>
  );
}

function OrganisationBreaker({ breaker, onSaved }: { breaker: HeldMailPage['breaker']; onSaved: () => void }) {
  const { client, contact } = useSession();
  const t = TEXTS.heldMail;
  const [perHour, setPerHour] = useState(String(breaker.perHour));
  const [perDay, setPerDay] = useState(String(breaker.perDay));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Explained | null>(null);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await intake.setOrganisationBreaker(client, Number(perHour), Number(perDay), breaker.version);
      toast({ title: t.breakerSaved, tone: 'success' });
      onSaved();
    } catch (error) {
      setProblem(explain(error, contact));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t.breaker} headingLevel={2}>
      <form className={styles.stack} onSubmit={(event) => void save(event)} noValidate>
        <p className={styles.text}>{t.breakerLead}</p>
        {problem ? <ProblemAlert title={problem.title}>{problem.text}</ProblemAlert> : null}
        <div className={styles.fields}>
          <NumberField label={t.perHour} name="perHour" inputMode="numeric" value={perHour} onChange={(event) => setPerHour(event.target.value)} />
          <NumberField label={t.perDay} name="perDay" inputMode="numeric" value={perDay} onChange={(event) => setPerDay(event.target.value)} />
        </div>
        <div>
          <Button type="submit" variant="dark" disabled={busy}>
            {TEXTS.heldMail.breakerSave}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * The alert of the shell (M3-FE-08): while confirmation emails are held, every admin who may
 * release them sees how many, with the way to them. Read in the background, again every minute
 * and after a release.
 */
export function HeldMailAlert({ onOpen }: { onOpen: () => void }) {
  const { background } = useSession();
  const t = TEXTS.heldMail;
  const [count, setCount] = useState(0);
  useEffect(() => {
    let current = true;
    const read = () =>
      intake.heldMail(background, { page: 1, pageSize: 1 }).then(
        (answer) => {
          if (current) setCount(answer.total);
        },
        () => undefined,
      );
    const readNow = () => void read();
    readNow();
    const again = window.setInterval(readNow, 60_000);
    window.addEventListener(HELD_MAIL_CHANGED, readNow);
    return () => {
      current = false;
      window.clearInterval(again);
      window.removeEventListener(HELD_MAIL_CHANGED, readNow);
    };
  }, [background]);
  if (count === 0) return null;
  return (
    <div className={styles.banner} data-confera-held-mail-alert="">
      <Alert tone="warning" title={count === 1 ? t.alertOne : fill(t.alert, { count })} action={<Button variant="dark" onClick={onOpen}>{t.review}</Button>}>
        {t.alertText}
      </Alert>
    </div>
  );
}
