// ADR-12, M2-FE-05 (ST-58, ST-22): the template format of the browser is the API's. Every
// vector confera_be exports with the format (openapi/template-vectors.json, vendored by
// `pnpm api:sync`) is refused here with the same code, or rendered here to the same subject,
// HTML and text; and the templates the API seeds pass the check.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  carriesLink,
  catalogueOf,
  checkBody,
  checkSubject,
  ALT_LIMIT,
  DOCUMENT_LIMIT_BYTES,
  DocumentError,
  MAX_IMAGES,
  RENDERED_LIMIT_BYTES,
  MAX_DEPTH,
  renderBody,
  renderSubject,
  SUBJECT_LIMIT,
  TEMPLATE_FORMAT_VERSION,
  TEMPLATE_LANGUAGES,
  TEMPLATE_REFUSED_VECTORS,
  TEMPLATE_RENDERED_VECTORS,
  TEMPLATE_TYPES,
} from '../packages/api-client/src/template-document';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'packages/api-client/openapi/openapi.lock.json'), 'utf8')) as { files: Record<string, { version: string }> };
// The seeded defaults, as the stub of the browser tests serves them (a copy of prisma/seed/default-templates.json of confera_be).
const seeded = JSON.parse(readFileSync(join(root, 'e2e/servers/default-templates.json'), 'utf8')) as { templates: Array<{ type: string; language: string; subject: unknown; body: unknown }> };

const refusal = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentError) return error.code;
    throw error;
  }
  return 'accepted';
};

describe('the format is the vendored one', () => {
  it('is version 1 of the file the lock names, with its limits, types and languages', () => {
    expect(TEMPLATE_FORMAT_VERSION).toBe(1);
    expect(lock.files['template-vectors.json']?.version).toBe('1');
    expect([DOCUMENT_LIMIT_BYTES, MAX_DEPTH, SUBJECT_LIMIT]).toEqual([204_800, 8, 300]);
    // 0.3.0 adds the confirmation of a submission (FR-FORM-15, M3-BE-06); 0.4.0 the seven status emails (FR-MAIL-03).
    expect(TEMPLATE_TYPES).toEqual([
      'invitation',
      'password_reset',
      'email_change_confirmation',
      'email_change_notice',
      'security_notice',
      'sign_in_brake',
      'test_message',
      'submission_confirmation',
      'submission_opened',
      'submission_returned',
      'submission_resumed',
      'submission_accepted',
      'submission_rejected',
      'submission_withdrawn',
      'submission_reopened',
    ]);
    // 0.4.0: images, their words, the rendered body (ADR-12).
    expect([MAX_IMAGES, ALT_LIMIT, RENDERED_LIMIT_BYTES]).toEqual([5, 300, 102_400]);
    expect(TEMPLATE_LANGUAGES).toEqual(['en', 'sr']);
  });

  it('knows which types carry a secure link, and nothing of a type it does not know', () => {
    expect(TEMPLATE_TYPES.filter(carriesLink)).toEqual(['invitation', 'password_reset', 'email_change_confirmation']);
    expect(catalogueOf('__proto__').placeholders.size).toBe(0);
    expect(catalogueOf('no_such_type').conditions.size).toBe(0);
  });

  it('has vectors to run', () => {
    expect(TEMPLATE_REFUSED_VECTORS.length).toBeGreaterThanOrEqual(20);
    expect(TEMPLATE_RENDERED_VECTORS.length).toBeGreaterThanOrEqual(3);
  });
});

describe('a document the API refuses is refused here with the same code', () => {
  it.each(TEMPLATE_REFUSED_VECTORS.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    const catalogue = catalogueOf(vector.type);
    expect(refusal(() => (vector.kind === 'body' ? checkBody(vector.document, catalogue) : checkSubject(vector.document, catalogue)))).toBe(vector.code);
  });
});

describe('a document the API renders gives the same subject, HTML and text here', () => {
  it.each(TEMPLATE_RENDERED_VECTORS.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    const catalogue = catalogueOf(vector.type);
    const input = { values: vector.input.values, conditions: new Set(vector.input.conditions), link: vector.input.link, images: new Map(Object.entries(vector.input.images ?? {})) };
    expect(renderSubject(checkSubject(vector.subject, catalogue), input)).toBe(vector.expected.subject);
    expect(renderBody(checkBody(vector.body, catalogue), input)).toEqual({ html: vector.expected.html, text: vector.expected.text });
  });
});

describe('the templates the API seeds pass the check', () => {
  it('30 of them: fifteen types, English and Serbian', () => {
    expect(seeded.templates).toHaveLength(30);
    expect(new Set(seeded.templates.map((template) => template.type))).toEqual(new Set(TEMPLATE_TYPES));
  });

  it.each(seeded.templates.map((template) => [`${template.type} (${template.language})`, template] as const))('%s', (_name, template) => {
    const catalogue = catalogueOf(template.type);
    expect(checkSubject(template.subject, catalogue)).toEqual(template.subject);
    expect(checkBody(template.body, catalogue)).toEqual(template.body);
  });
});
