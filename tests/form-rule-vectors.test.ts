// ADR-09, M3-FE-01, ST-41: the browser's rule interpreter passes every shared vector of confera_be
// (contracts/form-rule-vectors.json, vendored by `pnpm api:sync`): the same errors, path and code,
// in the same order, the same kept values; the same count of words, URL rule, address rule, link
// syntax and proof-of-work; and both definitions of the vectors are read by the renderer.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { readDefinition } from '../packages/form-renderer/src/definition';
import { proofOfWorkHolds, solveProofOfWork } from '../packages/form-renderer/src/public-api';
import { checkAnswers, countWords, hasUrl, isEmailAddress, RULE_CODES } from '../packages/form-renderer/src/rules';
import { parseSafeText } from '../packages/form-renderer/src/safe-text';
import type vectorFile from '../packages/api-client/openapi/form-rule-vectors.json';

// Read as JSON text, as the API reads a body: a JSON module would make a key `__proto__` the prototype instead of a key.
const vectors = JSON.parse(readFileSync(new URL('../packages/api-client/openapi/form-rule-vectors.json', import.meta.url), 'utf8')) as typeof vectorFile;

const definition = readDefinition(vectors.definition);
/** The kept answers as plain JSON: the interpreter's objects have no prototype. */
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

describe('the shared vectors of the form rules (contracts/form-rule-vectors.json)', () => {
  it('are the version this interpreter is written for, with its codes', () => {
    expect(vectors.version).toBe(1);
    expect([...RULE_CODES].sort()).toEqual([...vectors.codes].sort());
  });

  it('both definitions are read by the renderer', () => {
    expect(() => readDefinition(vectors.definition)).not.toThrow();
    expect(() => readDefinition(vectors.seededAbstractDefinition)).not.toThrow();
  });

  it.each(vectors.answers.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    const answers: unknown = typeof vector.answers === 'string' ? JSON.parse(vector.answers) : vector.answers;
    const result = checkAnswers(definition, answers);
    if (vector.errors.length === 0) {
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (result.ok && 'kept' in vector && vector.kept !== undefined) expect(plain(result.answers)).toEqual(vector.kept);
    } else {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(vector.errors);
    }
  });

  it.each(vectors.wordCount.vectors.map((v) => [v.text, v.words] as const))('counts the words of %j as %s', (text, words) => {
    expect(countWords(text)).toBe(words);
  });

  it.each(vectors.noUrl.vectors.map((v) => [v.text, v.refused] as const))('the URL rule: %j is refused: %s', (text, refused) => {
    expect(hasUrl(text)).toBe(refused);
  });

  it.each(vectors.emailAddress.vectors.map((v) => [v.address, v.accepted] as const))('the address rule: %j is accepted: %s', (address, accepted) => {
    expect(isEmailAddress(address)).toBe(accepted);
  });

  it.each(vectors.safeText.vectors.map((v) => [v.text, v] as const))('the link syntax of %j', (_text, vector) => {
    expect(parseSafeText(vector.text)).toEqual(vector.segments);
  });

  it.each(vectors.proofOfWork.vectors.map((v) => [`${v.challenge} ${v.counter}`, v] as const))('the proof-of-work: %s', async (_name, vector) => {
    expect(await proofOfWorkHolds(vector.challenge, vector.difficulty, vector.counter)).toBe(vector.holds);
  });

  it('the browser finds a counter the API accepts, as the API computes it', async () => {
    const counter = await solveProofOfWork('confera-vector-1', 10);
    expect(counter).toBe('2933'); // the smallest, as in the vectors
    const hash = createHash('sha256').update(`confera-vector-1:${counter}`, 'utf8').digest();
    expect(hash[0]).toBe(0);
    expect(hash[1]! >> 6).toBe(0);
  });
});
