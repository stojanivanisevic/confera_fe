import { describe, expect, it } from 'vitest';

import { ConfigError, parseConfig } from './env';

const local = {
  STAGE: 'local',
  CONFERA_PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
  CONFERA_ADMIN_ORIGIN: 'http://localhost:3000',
  CONFERA_API_ORIGIN: 'http://127.0.0.1:3001',
};
const prod = {
  STAGE: 'prod',
  CONFERA_PUBLIC_ORIGIN: 'https://forms.example.test',
  CONFERA_ADMIN_ORIGIN: 'https://admin.example.test',
  CONFERA_API_ORIGIN: 'http://api:3001',
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

describe('web configuration (ADR-24, ADR-02)', () => {
  it('accepts the documented local settings', () => {
    expect(parseConfig(local)).toEqual({
      stage: 'local',
      publicOrigin: 'http://127.0.0.1:3000',
      adminOrigin: 'http://localhost:3000',
      publicHost: '127.0.0.1:3000',
      adminHost: 'localhost:3000',
      apiOrigin: 'http://127.0.0.1:3001',
      devPages: false,
    });
  });

  it('accepts a production configuration', () => {
    expect(parseConfig(prod).stage).toBe('prod');
  });

  it.each([undefined, '', 'production', 'PROD', 'prod ', ' local', 'staging', 'Dev'])(
    'STAGE has no default and no near misses: %j stops the start',
    (stage) => {
      expect(problemsOf({ ...local, STAGE: stage }).join('\n')).toMatch(/STAGE/);
    },
  );

  it.each(['local', 'dev', 'test'])('%s refuses a public origin', (stage) => {
    const problems = problemsOf({ ...prod, STAGE: stage, CONFERA_PUBLIC_ORIGIN: 'https://forms.example.org', CONFERA_ADMIN_ORIGIN: 'https://admin.example.org' });
    expect(problems.join('\n')).toMatch(/CONFERA_PUBLIC_ORIGIN must be a loopback or \.test name/);
    expect(problems.join('\n')).toMatch(/CONFERA_ADMIN_ORIGIN must be a loopback or \.test name/);
  });

  it.each(['http://localhost:3000', 'http://admin.localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000', 'https://confera.test'])(
    'a non-production stage accepts %s',
    (origin) => {
      const other = origin === 'http://localhost:3000' ? 'http://127.0.0.1:3000' : 'http://localhost:3000';
      expect(parseConfig({ ...local, CONFERA_PUBLIC_ORIGIN: origin, CONFERA_ADMIN_ORIGIN: other }).publicOrigin).toBe(origin);
    },
  );

  it('refuses a look-alike of a loopback name', () => {
    expect(problemsOf({ ...local, CONFERA_PUBLIC_ORIGIN: 'http://localhost.example.com' }).join('\n')).toMatch(/loopback/);
    expect(problemsOf({ ...local, CONFERA_PUBLIC_ORIGIN: 'http://127.0.0.1.example.com' }).join('\n')).toMatch(/loopback/);
  });

  it('refuses one host name for both surfaces', () => {
    expect(problemsOf({ ...local, CONFERA_ADMIN_ORIGIN: local.CONFERA_PUBLIC_ORIGIN }).join('\n')).toMatch(/two different host names/);
  });

  it.each([
    ['a path', 'http://localhost:3000/app'],
    ['a trailing slash', 'http://localhost:3000/'],
    ['a query', 'http://localhost:3000?x=1'],
    ['a user part', 'http://user@localhost:3000'],
    ['upper case', 'http://LOCALHOST:3000'],
    ['no scheme', 'localhost:3000'],
    ['another scheme', 'ftp://localhost'],
  ])('refuses an origin with %s', (_what, origin) => {
    expect(problemsOf({ ...local, CONFERA_PUBLIC_ORIGIN: origin }).join('\n')).toMatch(/CONFERA_PUBLIC_ORIGIN/);
  });

  it('names every missing variable at once', () => {
    const problems = problemsOf({}).join('\n');
    for (const name of ['STAGE', 'CONFERA_PUBLIC_ORIGIN', 'CONFERA_ADMIN_ORIGIN', 'CONFERA_API_ORIGIN']) {
      expect(problems).toContain(name);
    }
  });

  it('prod requires https on both surfaces', () => {
    const problems = problemsOf({ ...prod, CONFERA_PUBLIC_ORIGIN: 'http://forms.example.test' });
    expect(problems.join('\n')).toMatch(/CONFERA_PUBLIC_ORIGIN must use https/);
  });

  it('prod refuses a build that contains the dev pages', () => {
    expect(problemsOf({ ...prod, CONFERA_DEV_PAGES: '1' }).join('\n')).toMatch(/dev pages/);
  });

  it('prod refuses every DEV_ variable, known or not', () => {
    const problems = problemsOf({ ...prod, DEV_LOGIN: '1', DEV_SOMETHING_NEW: 'x' });
    expect(problems.join('\n')).toMatch(/DEV_LOGIN/);
    expect(problems.join('\n')).toMatch(/DEV_SOMETHING_NEW/);
  });

  it('never repeats a value in its message', () => {
    const problems = problemsOf({ ...local, STAGE: 'canary-value-1', CONFERA_API_ORIGIN: 'canary-value-2' }).join('\n');
    expect(problems).not.toContain('canary-value');
  });
});
