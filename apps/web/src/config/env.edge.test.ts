// Edge cases of the web configuration found by the edge-case hunter (M1-REV-01).
//
// ADR-02 and ADR-28: the admin and the public surface have two HOST NAMES, "so the
// admin's cookie never reaches a page that renders an author's input". A cookie does not
// care about ports (RFC 6265, 8.5: "cookies for a given host are shared across all the
// ports on that host"), so one host name on two ports is one host for the admin's
// session cookie. .env.example says the same: "They must be different host names".
//
// parseConfig compares `host` (name AND port), so it accepts one name on two ports.
// confera_be refuses the same pair (stage-guard.ts compares `hostname`); the web
// application must not be the weaker of the two guards.
import { describe, expect, it } from 'vitest';

import { ConfigError, parseConfig } from './env';

const prod = {
  STAGE: 'prod',
  CONFERA_PUBLIC_ORIGIN: 'https://forms.example.test',
  CONFERA_ADMIN_ORIGIN: 'https://admin.example.test',
  CONFERA_API_ORIGIN: 'http://api:3001',
};
const local = {
  STAGE: 'local',
  CONFERA_PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
  CONFERA_ADMIN_ORIGIN: 'http://localhost:3000',
  CONFERA_API_ORIGIN: 'http://127.0.0.1:3001',
};

const problemsOf = (env: Record<string, string | undefined>): string[] => {
  try {
    parseConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return [...(error as ConfigError).problems];
  }
  return [];
};

describe('edge cases of the web configuration (M1-REV-01)', () => {
  it.each([
    ['prod, the default port and another one', { ...prod, CONFERA_PUBLIC_ORIGIN: 'https://confera.example.test', CONFERA_ADMIN_ORIGIN: 'https://confera.example.test:8443' }],
    ['prod, two ports', { ...prod, CONFERA_PUBLIC_ORIGIN: 'https://confera.example.test:8443', CONFERA_ADMIN_ORIGIN: 'https://confera.example.test:9443' }],
    ['local, localhost on two ports', { ...local, CONFERA_PUBLIC_ORIGIN: 'http://localhost:3002', CONFERA_ADMIN_ORIGIN: 'http://localhost:3000' }],
    ['local, http and https of one name', { ...local, CONFERA_PUBLIC_ORIGIN: 'http://confera.test', CONFERA_ADMIN_ORIGIN: 'https://confera.test' }],
  ])('refuses one host name for both surfaces, also on two ports or schemes (%s)', (_what, env) => {
    expect(problemsOf(env).join('\n')).toMatch(/two different host names/);
  });

  it('still accepts two host names on the same port (the documented local settings)', () => {
    expect(problemsOf(local)).toEqual([]);
  });
});
