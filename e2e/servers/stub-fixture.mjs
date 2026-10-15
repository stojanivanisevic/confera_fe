// The fixture of the API stub: one invented organisation with its people, on example.test
// (NFR-PRIV-05), the links a test can open, and the passwords they sign in with. Every password
// starts with `invented-`, as the secret scan asks of a placeholder.
const invented = (word) => `invented-${word}`;

export const STUB = {
  organisation: {
    id: '0e2e0000-0000-4000-8000-00000000000a',
    name: 'Udruženje za probe A (izmišljeno)',
    legalName: 'Udruženje za probe A',
    address: 'Primerska 1\n11000 Beograd',
    registrationNumber: '12345678',
    taxNumber: '123456789',
    contactEmail: 'office@a.example.test',
    vatNoteSr: 'Udruženje nije u sistemu PDV-a.',
    vatNoteEn: 'The association is not registered for VAT.',
    rsdAccount: '160-0000000000001-11',
    eurIban: 'RS35160000000000000111',
    eurSwift: 'DBDBRSBG',
    eurBankName: 'Banka Primer',
    paypalPayee: 'paypal@a.example.test',
    paymentDetailsChangedAt: null,
    paymentDetailsChangedBy: null,
    version: 1,
  },
  users: [
    { id: '0e2e0000-0000-4000-8000-0000000000a1', email: 'zivana.djordjevic@a.example.test', displayName: 'Živana Đorđević', role: 'admin', status: 'active', createdAt: '2026-09-01T09:00:00.000Z', version: 1, password: invented('Planina-Reka-Sto-7') },
    { id: '0e2e0000-0000-4000-8000-0000000000a2', email: 'caslav.scepanovic@a.example.test', displayName: 'Časlav Šćepanović', role: 'reviewer', status: 'active', createdAt: '2026-09-02T09:00:00.000Z', version: 1, password: invented('Suma-Ceka-Cup-9') },
    { id: '0e2e0000-0000-4000-8000-0000000000a3', email: 'marta.kovac@a.example.test', displayName: 'Marta Kovač', role: 'admin', status: 'active', createdAt: '2026-09-03T09:00:00.000Z', version: 1, password: invented('Korektan-Konj-Baterija-3') },
    { id: '0e2e0000-0000-4000-8000-0000000000a4', email: 'lazar.primeric@a.example.test', displayName: 'Lazar Primerić', role: 'reviewer', status: 'invited', createdAt: '2026-10-10T09:00:00.000Z', version: 1, password: null },
    { id: '0e2e0000-0000-4000-8000-0000000000a5', email: 'ana.colic@a.example.test', displayName: 'Ana Čolić', role: 'reviewer', status: 'deactivated', createdAt: '2026-09-05T09:00:00.000Z', version: 2, password: invented('Jesen-Zima-Prolece-5') },
  ],
  /** The links of the fixture, as a mailbox would hold them. */
  links: [
    { token: 'invented-invitation-lazar-aaaaaaaaaaaaaaaaaaaaaaaa', purpose: 'invitation', userId: '0e2e0000-0000-4000-8000-0000000000a4', recipient: 'lazar.primeric@a.example.test', expiresAt: '2099-01-01T00:00:00.000Z' },
    { token: 'invented-reset-zivana-bbbbbbbbbbbbbbbbbbbbbbbbbbb', purpose: 'password_reset', userId: '0e2e0000-0000-4000-8000-0000000000a1', recipient: 'zivana.djordjevic@a.example.test', expiresAt: '2099-01-01T00:00:00.000Z' },
  ],
  /** The token of the email-change link the stub mints when an email change is asked for. */
  emailChangeToken: 'invented-email-change-cccccccccccccccccccccccccccc',
  /** An invitation sent by a test gets this prefix and the user's id. */
  newInvitationTokenPrefix: 'invented-invitation-new-',
  /** Who the tests sign in as. */
  admin: { email: 'zivana.djordjevic@a.example.test', password: invented('Planina-Reka-Sto-7'), name: 'Živana Đorđević' },
  otherAdmin: { email: 'marta.kovac@a.example.test', password: invented('Korektan-Konj-Baterija-3'), name: 'Marta Kovač' },
  reviewer: { email: 'caslav.scepanovic@a.example.test', password: invented('Suma-Ceka-Cup-9'), name: 'Časlav Šćepanović' },
  invited: { id: '0e2e0000-0000-4000-8000-0000000000a4', email: 'lazar.primeric@a.example.test', name: 'Lazar Primerić' },
  deactivated: { id: '0e2e0000-0000-4000-8000-0000000000a5', name: 'Ana Čolić' },
};
