// What the edge-case tests of the admin screens share (jsdom, no browser): a fake of the
// admin API that answers as the vendored contract says, the providers of the shell around a
// screen, and typing and clicking the way a browser delivers them.
//
// The fake keeps every request it was asked, so a test can say what the screen SENT as well as
// what it showed.
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { Session } from '../../packages/api-client/src/index';

import { ConferenceProvider } from '../../apps/web/src/admin/conference-context';
import { FreshPasswordProvider } from '../../apps/web/src/admin/FreshPassword';
import { SessionProvider } from '../../apps/web/src/admin/session';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = function scrollIntoView() {};

export interface Seen {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Headers;
  readonly body: unknown;
}

export type Answer = { status: number; body?: unknown } | undefined;

export const ADMIN_PERMISSIONS = ['account.manage', 'users.read', 'users.manage', 'organisation.read', 'organisation.manage', 'audit.read', 'mail_servers.read', 'mail_servers.manage', 'conferences.read', 'conferences.manage', 'templates.read', 'mail_log.read'];

export const sessionOf = (overrides: Partial<Session> = {}): Session => ({
  user: { id: '0e2e0000-0000-4000-8000-0000000000a1', email: 'ana.admin@a.example.test', displayName: 'Ana Admin', roles: ['admin'], permissions: ADMIN_PERMISSIONS },
  organisation: { id: '0e2e0000-0000-4000-8000-0000000000b1', name: 'Udruženje (izmišljeno)' },
  csrf: 'csrf-value-of-the-session-0123456789abcdefghi',
  idleExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  absoluteExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  confirmationValidUntil: null,
  secondFactor: 'not_required',
  ...overrides,
});

/**
 * A fake of the admin API. `route` answers a request or returns undefined to let the default
 * of the fake answer (the session, a 404). Answers are made at once unless the route returns
 * a promise.
 */
export class FakeApi {
  readonly seen: Seen[] = [];
  session: Session = sessionOf();
  /** The routes a test adds, tried before the defaults. */
  route: (request: Seen) => Answer | Promise<Answer> = () => undefined;

  readonly fetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const text = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
    const seen: Seen = { method: request.method, path: url.pathname, query: url.searchParams, headers: request.headers, body: text === '' ? undefined : JSON.parse(text) };
    this.seen.push(seen);
    const answer = (await this.route(seen)) ?? this.defaults(seen);
    const hasBody = answer.body !== undefined && answer.status !== 204;
    return new Response(hasBody ? JSON.stringify(answer.body) : null, { status: answer.status, headers: hasBody ? { 'content-type': answer.status >= 400 ? 'application/problem+json' : 'application/json' } : {} });
  };

  private defaults(seen: Seen): { status: number; body?: unknown } {
    if (seen.method === 'GET' && seen.path === '/api/v1/session') return { status: 200, body: this.session };
    if (seen.method === 'POST' && seen.path === '/api/v1/session/password-confirmation') {
      this.session = { ...this.session, confirmationValidUntil: new Date(Date.now() + 300_000).toISOString() };
      return { status: 200, body: { confirmationValidUntil: this.session.confirmationValidUntil } };
    }
    return { status: 404, body: { code: 'not_found', traceId: 'fake', status: 404, title: 'Not Found' } };
  }

  calls(method: string, path: string): Seen[] {
    return this.seen.filter((seen) => seen.method === method && seen.path === path);
  }
}

export const problem = (status: number, code: string, errors?: { path: string; code: string }[]) => ({ status, body: { code, traceId: 'fake-trace', status, title: code, ...(errors ? { errors } : {}) } });

const NativeRequest = globalThis.Request;
const NativeFetch = globalThis.fetch;

/**
 * Points the page at the fake: `fetch` answers from it, and a request for a path of the page
 * (`/api/v1/session`) is read against http://localhost:3000, as a browser reads it.
 */
export function useFake(fake: FakeApi): void {
  class PageRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' && input.startsWith('/') ? `http://localhost:3000${input}` : input, init);
    }
  }
  globalThis.Request = PageRequest;
  globalThis.fetch = ((input: Request | string | URL, init?: RequestInit) => fake.fetch(input, init));
}

/** Puts the real `fetch` and `Request` back. */
export function forgetFake(): void {
  globalThis.Request = NativeRequest;
  globalThis.fetch = NativeFetch;
}

export interface Mounted {
  readonly container: HTMLElement;
  /** Draws another screen (or the same one with other props) in the same place, inside the same providers. */
  rerender: (screen: ReactElement) => Promise<void>;
  unmount: () => Promise<void>;
}

/** Renders a screen inside the providers of the admin shell (session, password asked again). */
export async function mount(screen: ReactElement): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  const inside = (element: ReactElement) => (
    <SessionProvider>
      <ConferenceProvider>
        <FreshPasswordProvider>{element}</FreshPasswordProvider>
      </ConferenceProvider>
    </SessionProvider>
  );
  await act(async () => {
    root.render(inside(screen));
    await Promise.resolve();
  });
  await settle();
  return {
    container,
    rerender: async (next) => {
      await act(async () => {
        root.render(inside(next));
        await Promise.resolve();
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
      container.remove();
    },
  };
}

/** Lets the requests of a screen come back and the screen draw what they say. */
export async function settle(rounds = 8): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Typing the way a browser does it: the control's own setter, then the event. */
export async function typeInto(element: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
  await settle();
}

export const field = <T extends HTMLElement = HTMLInputElement>(container: HTMLElement, name: string, within = ''): T => container.querySelector<T>(`${within} [name="${name}"]`.trim())!;

export const button = (container: HTMLElement, label: string | RegExp, within = ''): HTMLButtonElement => {
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(`${within} button`.trim()));
  const found = buttons.find((candidate) => (typeof label === 'string' ? (candidate.textContent ?? '').trim() === label : label.test((candidate.textContent ?? '').trim())));
  if (!found) throw new Error(`no button ${String(label)} among: ${buttons.map((b) => (b.textContent ?? '').trim()).join(' | ')}`);
  return found;
};

/** Renders a screen as it is, with no provider around it (for the shell, which brings its own). */
export async function mountBare(screen: ReactElement): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(screen);
    await Promise.resolve();
  });
  await settle();
  return {
    container,
    rerender: async (next) => {
      await act(async () => {
        root.render(next);
        await Promise.resolve();
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
      container.remove();
    },
  };
}

/** Every button of the page (a dialog is drawn into the page, not into the container) with this label. */
export const buttonsNamed = (label: string): HTMLButtonElement[] => Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).filter((candidate) => (candidate.textContent ?? '').trim() === label);
