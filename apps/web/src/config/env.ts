/**
 * The configuration module of the web application.
 *
 * This is the ONLY file of the application that reads the environment
 * (ADR-01; the lint rule on `process.env` enforces it). The web application
 * holds no secret (ADR-26): everything here is a stage name or an address.
 */

export const STAGES = ['local', 'dev', 'test', 'prod'] as const;
export type Stage = (typeof STAGES)[number];

export interface AppConfig {
  readonly stage: Stage;
  /** Origin of the public surface, for example `https://forms.example.test`. */
  readonly publicOrigin: string;
  /** Origin of the admin surface. */
  readonly adminOrigin: string;
  /** `host[:port]` of the public surface, lower case, as it arrives in the Host header. */
  readonly publicHost: string;
  /** `host[:port]` of the admin surface. */
  readonly adminHost: string;
  /** Where /api/v1 and /public/v1 are forwarded. */
  readonly apiOrigin: string;
  /** True only in a build made with `--dev-pages` (gallery, spike fixtures). */
  readonly devPages: boolean;
}

export class ConfigError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`Confera web configuration is invalid:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

type Env = Readonly<Record<string, string | undefined>>;

function isLoopbackOrTestHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '[::1]') return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(h)) return true;
  return h.endsWith('.test');
}

interface ParsedOrigin {
  origin: string;
  host: string;
  hostname: string;
  protocol: string;
}

/** Accepts `scheme://host[:port]` only: no path, query, fragment or user part. */
function parseOrigin(name: string, raw: string | undefined, problems: string[]): ParsedOrigin | null {
  if (raw === undefined || raw === '') {
    problems.push(`${name} is missing`);
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    problems.push(`${name} is not a URL`);
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    problems.push(`${name} must start with http:// or https://`);
    return null;
  }
  if (raw !== url.origin) {
    problems.push(`${name} must be an origin only, written as ${url.origin} (scheme, host and port; no path, query or user part)`);
    return null;
  }
  return { origin: url.origin, host: url.host.toLowerCase(), hostname: url.hostname, protocol: url.protocol };
}

export function parseConfig(env: Env): AppConfig {
  const problems: string[] = [];

  const rawStage = env.STAGE;
  let stage: Stage | null = null;
  if (rawStage === undefined || rawStage === '') {
    problems.push(`STAGE is missing; it has no default and must be one of ${STAGES.join(', ')}`);
  } else if ((STAGES as readonly string[]).includes(rawStage)) {
    stage = rawStage as Stage;
  } else {
    problems.push(`STAGE has an unknown value; it must be exactly one of ${STAGES.join(', ')}`);
  }

  const publicOrigin = parseOrigin('CONFERA_PUBLIC_ORIGIN', env.CONFERA_PUBLIC_ORIGIN, problems);
  const adminOrigin = parseOrigin('CONFERA_ADMIN_ORIGIN', env.CONFERA_ADMIN_ORIGIN, problems);
  const apiOrigin = parseOrigin('CONFERA_API_ORIGIN', env.CONFERA_API_ORIGIN, problems);

  if (publicOrigin && adminOrigin && publicOrigin.host === adminOrigin.host) {
    problems.push(
      'CONFERA_PUBLIC_ORIGIN and CONFERA_ADMIN_ORIGIN must be two different host names (ADR-02): the admin session must never meet a public page',
    );
  }

  const devPages = env.CONFERA_DEV_PAGES === '1';
  const surfaces = [
    ['CONFERA_PUBLIC_ORIGIN', publicOrigin],
    ['CONFERA_ADMIN_ORIGIN', adminOrigin],
  ] as const;

  if (stage === 'prod') {
    for (const [name, value] of surfaces) {
      if (value && value.protocol !== 'https:') problems.push(`${name} must use https on the prod stage`);
    }
    if (devPages) {
      problems.push('This build contains the dev pages (gallery, spike fixtures); it cannot run on the prod stage');
    }
    for (const key of Object.keys(env)) {
      if (key.startsWith('DEV_') && env[key] !== undefined) {
        problems.push(`${key} is a development variable; none is accepted on the prod stage`);
      }
    }
  } else if (stage !== null) {
    // local, dev and test run only on the developer's machine (ADR-24).
    for (const [name, value] of surfaces) {
      if (value && !isLoopbackOrTestHost(value.hostname)) {
        problems.push(
          `${name} must be a loopback or .test name on the ${stage} stage; every server reachable from the Internet runs STAGE=prod`,
        );
      }
    }
  }

  if (problems.length > 0 || !stage || !publicOrigin || !adminOrigin || !apiOrigin) {
    throw new ConfigError(problems);
  }

  return Object.freeze({
    stage,
    publicOrigin: publicOrigin.origin,
    adminOrigin: adminOrigin.origin,
    publicHost: publicOrigin.host,
    adminHost: adminOrigin.host,
    apiOrigin: apiOrigin.origin,
    devPages,
  });
}

let cached: AppConfig | undefined;

/** The validated configuration of this process. Throws ConfigError when it is invalid. */
export function getConfig(): AppConfig {
  // CONFERA_DEV_PAGES is fixed at build time by next.config.ts (`env`), so a
  // production build cannot be turned into a dev-pages build at run time.
  cached ??= parseConfig({ ...process.env, CONFERA_DEV_PAGES: process.env.CONFERA_DEV_PAGES });
  return cached;
}

/** True when the framework runs in development mode (`next dev`). */
export function isDevelopmentRuntime(): boolean {
  return process.env.NODE_ENV === 'development';
}
