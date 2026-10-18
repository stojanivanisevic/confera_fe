import { readFileSync } from 'node:fs';

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
    mailLogContent: true,
    // How long the mail log keeps an entry (FR-SMTP-06): 24 months by default (SA-19).
    mailLogRetentionDays: 730,
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

// ---- 0.2.0 part B: conferences, mail servers, the mail log, the templates ----------------------

const fixtureFile = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));
const contractFile = (name) => JSON.parse(readFileSync(new URL(`../../packages/api-client/openapi/${name}`, import.meta.url), 'utf8'));
// The templates confera_be seeds (a copy of its prisma/seed/default-templates.json), as the organisation's own.
const seeded = fixtureFile('default-templates.json').templates;
const format = contractFile('template-vectors.json');

const CONFERENCE_KP = '0e2ec000-0000-4000-8000-0000000000c1';
const CONFERENCE_DRAFT = '0e2ec000-0000-4000-8000-0000000000c2';
const SERVER_OFFICE = '0e2e5000-0000-4000-8000-0000000000e1';
const SERVER_SPARE = '0e2e5000-0000-4000-8000-0000000000e2';

export const STUB_PART_B = {
  conferences: [
    { id: CONFERENCE_KP, name: 'Konferencija za probe', code: 'KP', editionYear: 2026, startsOn: '2026-11-12', endsOn: '2026-11-14', venue: 'Beograd', listedSites: ['https://kp.example.test'], languages: ['en', 'sr'], timeZone: 'Europe/Belgrade', state: 'open', mailServerId: SERVER_OFFICE, version: 1 },
    { id: CONFERENCE_DRAFT, name: 'Simpozijum za probe', code: 'SP', editionYear: 2027, startsOn: null, endsOn: null, venue: null, listedSites: [], languages: ['sr'], timeZone: 'Europe/Belgrade', state: 'draft', mailServerId: null, version: 1 },
  ],
  mailServers: [
    { id: SERVER_OFFICE, name: 'Kancelarija', host: 'smtp.a.example.test', port: 587, tlsMode: 'starttls', username: 'office@a.example.test', credentialSet: true, credentialSetAt: '2026-10-01T08:00:00.000Z', fromAddress: 'office@a.example.test', fromName: 'Udruženje za probe A', isDefault: true, isFallback: false, enabled: true, sendRatePerMinute: 60, version: 1, password: invented('Postar-Pecat-Koverta-4') },
    { id: SERVER_SPARE, name: 'Rezerva', host: 'smtp.spare.invalid', port: 465, tlsMode: 'implicit', username: null, credentialSet: false, credentialSetAt: null, fromAddress: 'noreply@a.example.test', fromName: 'Udruženje za probe A', isDefault: false, isFallback: true, enabled: true, sendRatePerMinute: 30, version: 1, password: null },
  ],
  mailLog: [
    {
      id: '0e2e1000-0000-4000-8000-0000000000f1',
      messageId: '0e2e1100-0000-4000-8000-0000000000f1',
      recipient: 'lazar.primeric@a.example.test',
      kind: 'invitation',
      language: 'en',
      conferenceId: null,
      mailServerId: SERVER_OFFICE,
      serverName: 'Kancelarija',
      attempt: 1,
      result: 'sent',
      errorCode: null,
      sentAt: '2026-10-10T09:00:05.000Z',
      diverted: false,
      subject: 'Your account at Udruženje za probe A (izmišljeno)',
      // A stored body is markup from outside the page (ST-28): what it tries must stay inside its frame.
      bodyHtml: '<p>Dear Lazar Primerić,</p><script>parent.document.body.dataset.pwned = "script"</script><img src="x" onerror="parent.document.body.dataset.pwned = \'image\'"><p><a href="[link]">Set your password</a></p>',
      bodyText: 'Dear Lazar Primerić,\n\nSet your password <[link]>\n',
    },
    { id: '0e2e1000-0000-4000-8000-0000000000f2', messageId: '0e2e1100-0000-4000-8000-0000000000f2', recipient: 'marta.kovac@a.example.test', kind: 'security_notice', language: 'sr', conferenceId: CONFERENCE_KP, mailServerId: SERVER_SPARE, serverName: 'Rezerva', attempt: 2, result: 'failed', errorCode: 'connection_failed', sentAt: '2026-10-11T10:00:00.000Z', diverted: false, subject: null, bodyHtml: null, bodyText: null },
  ],
  templates: seeded.map((template, index) => ({ id: `0e2e7000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, conferenceId: null, type: template.type, language: template.language, subject: template.subject, body: template.body, mailServerId: null, updatedAt: '2026-10-01T08:00:00.000Z', version: 1 })),
  catalogue: {
    types: Object.entries(format.types).map(([type, entry]) => ({ type, placeholders: entry.placeholders, conditions: entry.conditions, carriesLink: entry.placeholders.includes('link') })),
    languages: format.languages,
  },
  ids: { conference: CONFERENCE_KP, draftConference: CONFERENCE_DRAFT, server: SERVER_OFFICE, spareServer: SERVER_SPARE, hostileEntry: '0e2e1000-0000-4000-8000-0000000000f1' },
};
