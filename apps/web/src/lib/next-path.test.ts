// ST-26: `next` with a double slash, a full address or a backslash is ignored after sign-in.
import { describe, expect, it } from 'vitest';

import { safeNextPath, signInHref } from './next-path';

describe('the next rule (ST-26)', () => {
  it.each([
    ['/users', '/users'],
    ['/users/0e2e0000-0000-4000-8000-0000000000a1?tab=history#top', '/users/0e2e0000-0000-4000-8000-0000000000a1?tab=history#top'],
    ['/organisation', '/organisation'],
    ['/', '/'],
  ])('keeps a path of this origin: %s', (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([
    ['a full address', 'https://evil.example.test/users'],
    ['a full address of this host', 'http://localhost:3000/users'],
    ['a protocol-relative address', '//evil.example.test/users'],
    ['a backslash after the slash', '/\\evil.example.test'],
    ['a backslash later', '/users\\..\\evil'],
    ['a scheme in the path', '/javascript:alert(1)'],
    ['a scheme without a slash', 'javascript:alert(1)'],
    ['a relative path', 'users'],
    ['a control character', '/users\n/evil'],
    ['a space', '/users /evil'],
    ['an empty value', ''],
    ['nothing', null],
    ['nothing at all', undefined],
    ['the sign-in page itself', '/sign-in?next=%2Fusers'],
    ['the reset page', '/password-resets/abc'],
    ['an encoded second slash', '/%2F/evil'],
  ])('ignores %s and goes home', (_what, next) => {
    expect(safeNextPath(next)).toBe('/');
  });

  it('the sign-in address carries a safe destination only', () => {
    expect(signInHref('/users')).toBe('/sign-in?next=%2Fusers');
    expect(signInHref('/')).toBe('/sign-in');
    expect(signInHref('//evil.example.test')).toBe('/sign-in');
  });
});
