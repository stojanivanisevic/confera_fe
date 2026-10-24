'use client';

/**
 * Unsaved changes are never lost without a word (UX4-01). A screen with changes that are not saved
 * holds the guard (`useLeaveGuard`); while it does, every way out of the page asks first, with the
 * screen's own words:
 *   - a link of the page: the sidebar, the breadcrumb, any other link of this origin (a click in the
 *     capture phase, before the link's own handler; after "Leave" the same link is followed again,
 *     with its own handler, so the narrow sidebar still closes);
 *   - a move the shell makes itself (the person's menu, "Review held emails"): `leave(go)`;
 *   - the browser's back button: the guard keeps one entry of this page on top of the history, so
 *     "back" lands on this page again and the question is asked; "Leave" then goes back for real;
 *   - a reload, closing the tab, typing another address: the browser's own question (`beforeunload`).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { ConfirmDialog } from '@confera/ui';

export interface LeaveQuestion {
  readonly title: string;
  readonly text: string;
  readonly leave: string;
}

interface LeaveGuardApi {
  /** Runs `go` at once, or after the person agreed to lose the unsaved changes. */
  readonly leave: (go: () => void) => void;
  /** While a question is held, every way out of the page asks it first. */
  readonly hold: (question: LeaveQuestion | null) => void;
}

const LeaveGuardContext = createContext<LeaveGuardApi>({ leave: (go) => go(), hold: () => undefined });

/** The mark of the history entry the guard puts on top of this page: an id of its own, so an older one is not taken for it. */
const SENTINEL = 'conferaLeaveGuard';
const markOf = (state: unknown): unknown => (typeof state === 'object' && state !== null ? (state as Record<string, unknown>)[SENTINEL] : undefined);
let sentinels = 0;
/** Puts a new entry of this page on top of the history, and gives its id. */
function pushSentinel(): string {
  sentinels += 1;
  const id = `guard-${String(Date.now())}-${String(sentinels)}`;
  window.history.pushState({ ...(window.history.state as object | null), [SENTINEL]: id }, '', window.location.href);
  return id;
}

/** A click that would leave this page for another of this origin, as a plain left click on a link does. */
function leavingLink(event: MouseEvent): HTMLAnchorElement | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target instanceof Element ? event.target : null;
  const link = target?.closest('a[href]');
  if (!(link instanceof HTMLAnchorElement)) return null;
  // A link written in the editor is text of the email, not a way out; a dialog's own links stay its own.
  if (link.closest('.ProseMirror, [role="dialog"], [role="alertdialog"]')) return null;
  if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return null;
  let url: URL;
  try {
    url = new URL(link.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  // A jump inside the page (#…) leaves nothing.
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash !== '') return null;
  return link;
}

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const [question, setQuestion] = useState<LeaveQuestion | null>(null);
  const held = useRef<LeaveQuestion | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  // Set for the one move the person agreed to, so the guard lets it through.
  const passing = useRef(false);
  // The entry of this page the guard keeps on top of the history (the back button lands on the one below it).
  const sentinel = useRef<string | null>(null);

  const hold = useCallback((next: LeaveQuestion | null) => {
    held.current = next;
    setQuestion(next);
  }, []);
  const leave = useCallback((go: () => void) => {
    if (!held.current || passing.current) {
      go();
      return;
    }
    setPending(() => go);
  }, []);

  const active = question !== null;
  useEffect(() => {
    if (!active) return undefined;
    const onClick = (event: MouseEvent) => {
      if (passing.current) return;
      const link = leavingLink(event);
      if (!link) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPending(() => () => {
        if (link.isConnected) link.click();
        else window.location.assign(link.href);
      });
    };
    const onUnload = (event: BeforeUnloadEvent) => {
      if (passing.current) return;
      event.preventDefault();
      // Older engines show their question only with a return value.
      event.returnValue = '';
    };
    // The back button: the page's own entry stays on top, so "back" comes here first.
    if (sentinel.current === null || markOf(window.history.state) !== sentinel.current) sentinel.current = pushSentinel();
    const onPop = () => {
      if (passing.current || markOf(window.history.state) === sentinel.current) return;
      setPending(() => () => window.history.back());
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('popstate', onPop);
    };
  }, [active]);

  const stay = () => {
    setPending(null);
    // After "back", the entry the guard keeps on top is put there again.
    if (held.current && markOf(window.history.state) !== sentinel.current) sentinel.current = pushSentinel();
  };
  const go = () => {
    const run = pending;
    setPending(null);
    if (!run) return;
    passing.current = true;
    try {
      run();
    } finally {
      // The move is under way; the page that comes next holds its own guard, if any.
      window.setTimeout(() => {
        passing.current = false;
      }, 0);
    }
  };

  return (
    <LeaveGuardContext.Provider value={{ leave, hold }}>
      {children}
      <ConfirmDialog open={pending !== null} title={question?.title ?? ''} confirmText={question?.leave ?? ''} destructive onCancel={stay} onConfirm={go}>
        {question?.text}
      </ConfirmDialog>
    </LeaveGuardContext.Provider>
  );
}

/** The guard of the page: `leave(go)` asks first while there are unsaved changes. */
export const useLeave = (): LeaveGuardApi['leave'] => useContext(LeaveGuardContext).leave;

/** Holds the question while `dirty`: every way out of the page asks it first. */
export function useLeaveGuard(dirty: boolean, question: LeaveQuestion): void {
  const { hold } = useContext(LeaveGuardContext);
  const { title, text, leave } = question;
  useEffect(() => {
    hold(dirty ? { title, text, leave } : null);
    return () => hold(null);
  }, [dirty, hold, title, text, leave]);
}
