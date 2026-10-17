/**
 * A draft is kept in the same browser tab only (FR-FORM-18, ADR-09), in
 * sessionStorage. Inside a frame on another site, or with strict privacy
 * settings, a browser may refuse storage: every access can throw. Then the
 * draft lives in memory for as long as the page is open, and the form says so.
 * Nothing is ever handed to the page that frames the form.
 */
export interface DraftStorage {
  /** False when the browser refused storage and the draft is only in memory. */
  readonly persistent: boolean;
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

function memoryStorage(): DraftStorage {
  const values = new Map<string, string>();
  return {
    persistent: false,
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

/** `provider` returns the storage to use; it is a function because even reading `window.sessionStorage` can throw. */
export function createDraftStorage(provider: () => Storage | undefined): DraftStorage {
  let store: Storage | undefined;
  try {
    store = provider();
    if (!store) return memoryStorage();
    // Prove that it works: some browsers hand out a storage object that throws on use.
    const probe = '__confera_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
  } catch {
    return memoryStorage();
  }
  const real = store;
  const fallback = memoryStorage();
  // A store that fails later (quota, revoked permission) falls back to memory instead of breaking the form.
  return {
    persistent: true,
    get(key) {
      try {
        return real.getItem(key) ?? fallback.get(key);
      } catch {
        return fallback.get(key);
      }
    },
    set(key, value) {
      try {
        real.setItem(key, value);
      } catch {
        fallback.set(key, value);
      }
    },
    remove(key) {
      fallback.remove(key);
      try {
        real.removeItem(key);
      } catch {
        // nothing to remove
      }
    },
  };
}

let shared: DraftStorage | undefined;

/** The draft storage of this tab. On a server there is none. */
export function draftStorage(): DraftStorage {
  shared ??= createDraftStorage(() => (typeof window === 'undefined' ? undefined : window.sessionStorage));
  return shared;
}

/** A storage that keeps nothing and says nothing about it: the admin's preview of a draft. */
export const noDraftStorage: DraftStorage = { persistent: true, get: () => null, set: () => undefined, remove: () => undefined };
