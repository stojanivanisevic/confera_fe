// ST-62, M2-FE-01: the password rule set of the browser is the API's. Every vector that
// confera_be exports with the rule set (openapi/password-rules.json, vendored by
// `pnpm api:sync`) gives the same four answers here.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkPassword, codePointLength, MAX_LENGTH, MIN_LENGTH, PASSWORD_RULE_IDS, PASSWORD_RULES_VERSION, PASSWORD_VECTORS, passwordProblems, RULE_CODES } from '../packages/api-client/src/password-rules';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'packages/api-client/openapi/openapi.lock.json'), 'utf8')) as { files: Record<string, { version: string }> };

describe('the rule set is the vendored one', () => {
  it('is version 1 of the file the lock names, with the four lines of G2-25', () => {
    expect(PASSWORD_RULES_VERSION).toBe(1);
    expect(lock.files['password-rules.json']?.version).toBe('1');
    expect(PASSWORD_RULE_IDS).toEqual(['length', 'not_common', 'not_personal', 'match']);
    expect([MIN_LENGTH, MAX_LENGTH]).toEqual([12, 128]);
    expect(RULE_CODES).toEqual({ length: 'password_length', not_common: 'password_common', not_personal: 'password_personal', match: 'password_mismatch' });
  });

  it('has vectors to run', () => {
    expect(PASSWORD_VECTORS.length).toBeGreaterThanOrEqual(30);
  });
});

describe('the shared vectors give the same four answers as the API', () => {
  it.each(PASSWORD_VECTORS.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    const result = Object.fromEntries(checkPassword(vector.candidate, vector.repeat, vector.context).map(({ id, met }) => [id, met]));
    expect(result).toEqual(vector.met);
    expect(passwordProblems(vector.candidate, vector.repeat, vector.context)).toEqual(
      PASSWORD_RULE_IDS.filter((id) => !vector.met[id]).map((id) => RULE_CODES[id]),
    );
  });
});

describe('the details the vectors rely on', () => {
  it('counts code points in NFC', () => {
    expect(codePointLength('Ruža🌹Tri🌹Pe')).toBe(11);
    expect(codePointLength('KaféPárk12x')).toBe(11);
  });

  it('a password of a name that is not in the context is fine, and the checklist is live for the empty entry', () => {
    expect(checkPassword('Zivana!Sunce42', 'Zivana!Sunce42', { email: 'marta@example.test', displayName: 'Marta Kovač', organisationName: 'Udruženje za probe' }).every(({ met }) => met)).toBe(true);
    expect(checkPassword('', '', {}).map(({ id, met }) => `${id}:${String(met)}`)).toEqual(['length:false', 'not_common:false', 'not_personal:true', 'match:true']);
  });
});
