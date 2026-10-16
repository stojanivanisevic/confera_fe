'use client';

/**
 * The password asked again before a sensitive change (ADR-03): bank or PayPal data, users and
 * roles. The API refuses such a change with 403 `password_confirmation_required` unless the
 * password was confirmed in this session within the last 5 minutes. `useFreshPassword` wraps
 * a change: when the session holds no fresh confirmation, or the API refuses, the dialog asks
 * for the password, confirms it (POST /api/v1/session/password-confirmation) and then runs
 * the change. A wrong password is said at the field; cancelling runs nothing.
 */
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Alert, Button, Dialog, PasswordField, TextButton } from '@confera/ui';

import { signInHref } from '@/lib/next-path';

import styles from './admin.module.css';
import { call, explain, isApiError, isUnauthenticated, needsFreshPassword } from './problems';
import { useSession } from './session';
import { TEXTS } from './texts';

interface Pending {
  resolve: () => void;
  reject: (reason: unknown) => void;
}

interface FreshPasswordApi {
  /** Runs `change` with a fresh password, asking for it first when needed. Rejects with `CANCELLED` when the person cancels. */
  readonly withFreshPassword: <T>(change: () => Promise<T>) => Promise<T>;
  /** The dialog is open: the form behind it is not "sending" (UXUI-M2-06). */
  readonly asking: boolean;
}

export const CANCELLED = Symbol('cancelled');
export const isCancelled = (error: unknown): boolean => error === CANCELLED;

const FreshPasswordContext = createContext<FreshPasswordApi | null>(null);

export function FreshPasswordProvider({ children }: { children: ReactNode }) {
  const { client, fresh, confirmed, contact, refresh } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ title: string; text: string } | null>(null);
  // A wrong password is said at the field (UXUI-M2-06); a session that ended, with the way to sign in again (UXUI-M2-02).
  const [wrong, setWrong] = useState(false);
  const [ended, setEnded] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  const pending = useRef<Pending | null>(null);

  useEffect(() => {
    if (!wrong) return;
    const input = field.current?.querySelector('input');
    input?.focus();
    input?.select();
  }, [wrong]);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setPassword('');
        setProblem(null);
        setWrong(false);
        setEnded(false);
        setOpen(true);
      }),
    [],
  );

  const close = (outcome: 'done' | 'cancelled') => {
    setOpen(false);
    const waiting = pending.current;
    pending.current = null;
    if (!waiting) return;
    if (outcome === 'done') waiting.resolve();
    else waiting.reject(CANCELLED);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setWrong(false);
    try {
      // Back from signing in again in another tab: read the new session (and its CSRF value) first.
      if (ended && !(await refresh({ quiet: true }))) {
        setProblem({ title: TEXTS.problems.sessionEnded, text: TEXTS.problems.stillSignedOut });
        return;
      }
      setEnded(false);
      const result = await call(client.POST('/api/v1/session/password-confirmation', { body: { password } }));
      confirmed(result.confirmationValidUntil);
      setPassword('');
      close('done');
    } catch (error) {
      if (isApiError(error) && error.code === 'password_incorrect') setWrong(true);
      else if (isUnauthenticated(error)) {
        setEnded(true);
        setProblem({ title: TEXTS.problems.sessionEnded, text: TEXTS.problems.sessionEndedText });
      } else setProblem(explain(error, contact));
    } finally {
      setBusy(false);
    }
  };

  const api = useMemo<FreshPasswordApi>(
    () => ({
      withFreshPassword: async <T,>(change: () => Promise<T>): Promise<T> => {
        if (!fresh()) await ask();
        try {
          return await change();
        } catch (error) {
          // The session's confirmation ran out between the check and the change: ask once more.
          if (!needsFreshPassword(error)) throw error;
          await ask();
          return change();
        }
      },
      asking: open,
    }),
    [fresh, ask, open],
  );

  return (
    <FreshPasswordContext.Provider value={api}>
      {children}
      <Dialog
        open={open}
        onClose={() => close('cancelled')}
        title={TEXTS.freshPassword.title}
        size="sm"
        actions={
          <>
            <TextButton type="button" onClick={() => close('cancelled')}>
              {TEXTS.common.cancel}
            </TextButton>
            <Button type="submit" form="fresh-password-form" disabled={busy || password === ''}>
              {busy ? TEXTS.freshPassword.working : TEXTS.freshPassword.confirm}
            </Button>
          </>
        }
      >
        <form id="fresh-password-form" className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
          <p className="ud-dialog__text">{TEXTS.freshPassword.text}</p>
          {problem ? (
            <Alert
              tone={ended ? 'warning' : 'error'}
              title={problem.title}
              action={
                ended ? (
                  <a className="ud-link" href={signInHref(pathname)} target="_blank" rel="noopener noreferrer">
                    {TEXTS.problems.signInNewTab}
                  </a>
                ) : undefined
              }
            >
              {problem.text}
            </Alert>
          ) : null}
          <div ref={field}>
            <PasswordField
              label={TEXTS.freshPassword.passwordLabel}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setWrong(false);
              }}
              status={wrong ? 'error' : 'default'}
              message={wrong ? `${TEXTS.freshPassword.wrong}. ${TEXTS.freshPassword.wrongText}` : undefined}
              required
            />
          </div>
        </form>
      </Dialog>
    </FreshPasswordContext.Provider>
  );
}

export function useFreshPassword(): FreshPasswordApi {
  const value = useContext(FreshPasswordContext);
  if (!value) throw new Error('useFreshPassword must be used inside FreshPasswordProvider');
  return value;
}
