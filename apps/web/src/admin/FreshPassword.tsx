'use client';

/**
 * The password asked again before a sensitive change (ADR-03): bank or PayPal data, users and
 * roles. The API refuses such a change with 403 `password_confirmation_required` unless the
 * password was confirmed in this session within the last 5 minutes. `useFreshPassword` wraps
 * a change: when the session holds no fresh confirmation, or the API refuses, the dialog asks
 * for the password, confirms it (POST /api/v1/session/password-confirmation) and then runs
 * the change. A wrong password is said at the field; cancelling runs nothing.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Alert, Button, Dialog, PasswordField, TextButton } from '@confera/ui';

import { call, explain, isApiError, needsFreshPassword } from './problems';
import { useSession } from './session';
import { TEXTS } from './texts';

interface Pending {
  resolve: () => void;
  reject: (reason: unknown) => void;
}

interface FreshPasswordApi {
  /** Runs `change` with a fresh password, asking for it first when needed. Rejects with `CANCELLED` when the person cancels. */
  readonly withFreshPassword: <T>(change: () => Promise<T>) => Promise<T>;
}

export const CANCELLED = Symbol('cancelled');
export const isCancelled = (error: unknown): boolean => error === CANCELLED;

const FreshPasswordContext = createContext<FreshPasswordApi | null>(null);

export function FreshPasswordProvider({ children }: { children: ReactNode }) {
  const { client, fresh, confirmed, contact } = useSession();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ title: string; text: string } | null>(null);
  const pending = useRef<Pending | null>(null);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setPassword('');
        setProblem(null);
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
    try {
      const result = await call(client.POST('/api/v1/session/password-confirmation', { body: { password } }));
      confirmed(result.confirmationValidUntil);
      setPassword('');
      close('done');
    } catch (error) {
      if (isApiError(error) && error.code === 'password_incorrect') setProblem({ title: TEXTS.freshPassword.wrong, text: TEXTS.freshPassword.wrongText });
      else setProblem(explain(error, contact));
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
    }),
    [fresh, ask],
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
        <form id="fresh-password-form" onSubmit={(event) => void submit(event)} noValidate>
          <p className="ud-dialog__text">{TEXTS.freshPassword.text}</p>
          {problem ? (
            <Alert tone="error" title={problem.title}>
              {problem.text}
            </Alert>
          ) : null}
          <PasswordField label={TEXTS.freshPassword.passwordLabel} name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
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
