// The shapes the public form calls the API with (packages/form-renderer/src/public-api.ts, written out
// so that the renderer needs no generated module) are the vendored contract's (openapi.public.json):
// each way round, so a change of the contract fails the typecheck of this file (`pnpm typecheck`).
import { describe, expect, it } from 'vitest';

import type { components } from '../packages/api-client/src/generated/public';
import type { FormTokenDto, FormTokenRequestDto, SubmitBody, SubmittedDto, UploadedFileDto } from '../packages/form-renderer/src/public-api';

type Schemas = components['schemas'];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const same = <T extends true>(value: T): T => value;

describe('the public form API in the renderer is the contract’s', () => {
  it('token, upload, submit and its answer', () => {
    expect(same<Same<FormTokenDto, Schemas['FormTokenDto']>>(true)).toBe(true);
    expect(same<Same<FormTokenRequestDto, Schemas['FormTokenRequestDto']>>(true)).toBe(true); // the renewal (Q3-01)
    expect(same<Same<UploadedFileDto, Schemas['UploadedFileDto']>>(true)).toBe(true);
    expect(same<Same<SubmittedDto, Schemas['SubmittedDto']>>(true)).toBe(true);
    expect(same<Same<SubmitBody, Schemas['SubmitDto']>>(true)).toBe(true);
  });
});
