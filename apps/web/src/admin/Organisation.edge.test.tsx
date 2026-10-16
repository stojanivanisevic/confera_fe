// @vitest-environment jsdom
//
// E2-17 (FR-ORG-03, M2-FE-02): the organisation screen holds two forms, the issuer data and the
// payment details, and one record with one version. A save of either form gives the record a
// new version, and "the form follows the record" copies the WHOLE record into BOTH forms: what
// was typed in the other form and not yet saved is thrown away, without a word.
import { afterEach, describe, expect, it } from 'vitest';

import { Organisation } from './Organisation';
import { button, click, FakeApi, field, forgetFake, mount, type Mounted, typeInto, useFake } from '../../../../tests/support/admin-harness';

const record = (overrides: Record<string, unknown> = {}) => ({
  id: '0e2e0000-0000-4000-8000-0000000000b1',
  name: 'Udruženje (izmišljeno)',
  legalName: null,
  address: null,
  registrationNumber: null,
  taxNumber: null,
  contactEmail: 'ured@a.example.test',
  vatNoteSr: null,
  vatNoteEn: null,
  rsdAccount: null,
  eurIban: null,
  eurSwift: null,
  eurBankName: null,
  paypalPayee: null,
  paymentDetailsChangedAt: null,
  paymentDetailsChangedBy: null,
  mailLogContent: true,
  version: 1,
  ...overrides,
});

let screen: Mounted | undefined;
afterEach(async () => {
  forgetFake();
  await screen?.unmount();
  screen = undefined;
});

describe('the organisation screen (E2-17)', () => {
  it('keeps what was typed in the payment form when the issuer data is saved', async () => {
    const fake = new FakeApi();
    let stored = record();
    fake.route = (request) => {
      if (request.path !== '/api/v1/organisation') return undefined;
      if (request.method === 'PATCH') {
        stored = record({ ...(request.body as object), version: stored.version + 1 });
        return { status: 200, body: stored };
      }
      return { status: 200, body: stored };
    };
    useFake(fake);
    screen = await mount(<Organisation />);
    
    // The person starts on a new IBAN, and before saving it corrects the name of the organisation.
    await typeInto(field(screen.container, 'eurIban'), 'RS35260005601001611379');
    await typeInto(field(screen.container, 'legalName'), 'Udruženje ekonomista');
    await click(button(screen.container, 'Save the issuer data'));

    expect(fake.calls('PATCH', '/api/v1/organisation')).toHaveLength(1);
    expect(field(screen.container, 'legalName').value).toBe('Udruženje ekonomista');
    expect(field(screen.container, 'eurIban').value).toBe('RS35260005601001611379');
  });

  it('keeps what was typed in the issuer form when the payment details are saved', async () => {
    const fake = new FakeApi();
    let stored = record();
    fake.route = (request) => {
      if (request.path === '/api/v1/organisation' && request.method === 'GET') return { status: 200, body: stored };
      if (request.path === '/api/v1/organisation/payment-details' && request.method === 'PUT') {
        stored = record({ ...(request.body as object), version: stored.version + 1 });
        return { status: 200, body: stored };
      }
      return undefined;
    };
    fake.session = { ...fake.session, confirmationValidUntil: new Date(Date.now() + 240_000).toISOString() };
    useFake(fake);
    screen = await mount(<Organisation />);

    await typeInto(field(screen.container, 'legalName'), 'Udruženje ekonomista');
    await typeInto(field(screen.container, 'eurBankName'), 'Banka Poštanska štedionica');
    await click(button(screen.container, 'Save the payment details'));

    expect(fake.calls('PUT', '/api/v1/organisation/payment-details')).toHaveLength(1);
    expect(field(screen.container, 'eurBankName').value).toBe('Banka Poštanska štedionica');
    expect(field(screen.container, 'legalName').value).toBe('Udruženje ekonomista');
  });
});
