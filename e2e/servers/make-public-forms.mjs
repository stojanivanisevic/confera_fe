// Writes e2e/servers/public-forms.json from the vendored contract (run it after `pnpm api:sync`): the seeded
// abstract form of confera_be as 'itema-2026-abstract', and the spike's small form written in the same schema.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const vectors = JSON.parse(readFileSync(`${root}/packages/api-client/openapi/form-rule-vectors.json`, 'utf8'));
const seeded = vectors.seededAbstractDefinition;
const L = (en, sr) => ({ en, sr });
const rules = (r = {}) => ({ maxLength: null, maxWords: null, pattern: null, noUrl: false, file: null, ...r });
const field = (f) => ({ help: null, options: null, visibleWhen: null, onlyFirstInRepeat: false, autocomplete: null, rules: rules(), ...f });

const spikeDefinition = {
  schemaVersion: 1,
  type: 'abstract',
  texts: {
    ...seeded.texts,
    submit: L('Send abstract', 'Pošalji apstrakt'),
    intro: L('', ''),
    consent: L('I accept the terms of publication', 'Prihvatam uslove objavljivanja'),
    thankYou: L('Thank you. A confirmation with its reference is on its way to your email address.', 'Hvala. Potvrda sa brojem prijave stiže na Vašu adresu e-pošte.'),
  },
  patterns: {},
  sections: [
    {
      key: 'paper',
      label: L('The paper', 'Rad'),
      repeat: null,
      visibleWhen: null,
      fields: [
        field({ key: 'title', kind: 'text', required: true, label: L('Title of the paper', 'Naslov rada'), rules: rules({ maxLength: 300, noUrl: true }) }),
        field({ key: 'abstract', kind: 'longText', required: false, label: L('Abstract', 'Apstrakt'), rules: rules({ maxLength: 10000, maxWords: 300 }) }),
      ],
    },
    {
      key: 'authors',
      label: L('Authors', 'Autori'),
      repeat: { min: 1, max: 8, itemLabel: L('Author {n}', 'Autor {n}'), addLabel: L('Add author', 'Dodaj autora'), removeLabel: L('Remove author {n}', 'Ukloni autora {n}'), noticeFrom: null, notice: null },
      visibleWhen: null,
      fields: [
        field({ key: 'name', kind: 'text', required: true, label: L('First and last name of author {n}', 'Ime i prezime autora {n}'), autocomplete: 'name', rules: rules({ maxLength: 200, noUrl: true }) }),
        field({ key: 'email', kind: 'email', required: true, label: L('Email of author {n}', 'Imejl adresa autora {n}'), autocomplete: 'email', rules: rules({ maxLength: 254 }) }),
      ],
    },
    {
      key: 'agreement',
      label: L('Consent', 'Saglasnost'),
      repeat: null,
      visibleWhen: null,
      fields: [field({ key: 'consent', kind: 'consent', required: true, label: L('I agree', 'Saglasan/na sam') })],
    },
  ],
};

const conference = { code: 'IT', name: 'ITEMA 2026', timeZone: 'Europe/Belgrade', languages: ['en', 'sr'] };
const published = (slug, definition, extra = {}) => ({
  state: 'open',
  closedReason: null,
  slug,
  deadline: null,
  closesAt: null,
  conference,
  consentLinks: { terms: 'https://www.example.test/terms', privacy: 'https://www.example.test/privacy' },
  versionNumber: 1,
  definition,
  ...extra,
});

const fixture = {
  $comment:
    'Published forms of the API stub (GET /public/v1/forms/{slug}, the PublicFormDto of openapi.public.json) and of the unit tests, with the site lists of GET /public/v1/forms/{slug}/frame-sites. "spike-abstract" is the small form of the 0.1.0 spike written in the definition schema of confera_be, so that the browser tests of the embed, the moment after Send and the probes keep proving the same things on the real renderer; "spike-unlisted" is the same form with an empty site list. "itema-2026-abstract" is the seeded abstract form of confera_be (seededAbstractDefinition of contracts/form-rule-vectors.json) with a deadline; "itema-2026-closed" is that form after its deadline. Written by a script from the vendored contract; invented people only, on example.test.',
  forms: {
    'spike-abstract': published('spike-abstract', spikeDefinition),
    'spike-unlisted': published('spike-unlisted', spikeDefinition),
    'itema-2026-abstract': published('itema-2026-abstract', seeded, { deadline: '2027-03-15', closesAt: '2027-03-15T23:00:00.000Z', versionNumber: 3 }),
    'itema-2026-closed': published('itema-2026-closed', seeded, { state: 'closed', closedReason: 'deadline_passed', deadline: '2026-03-15', closesAt: '2026-03-15T23:00:00.000Z' }),
  },
  frameSites: {
    'spike-abstract': ['http://localhost:4000'],
    'spike-unlisted': [],
    'itema-2026-abstract': ['http://localhost:4000'],
    'itema-2026-closed': ['http://localhost:4000'],
  },
};
writeFileSync(`${root}/e2e/servers/public-forms.json`, `${JSON.stringify(fixture, null, 2)}\n`);
console.log('written');
