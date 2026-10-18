'use client';

/**
 * One form (M3-FE-03, M3-FE-05; FR-FORM-02, FR-FORM-06, ADR-07, ADR-09):
 *  - the snippet for the conference sites, in the language of the site (D2), with the link above
 *    the frame (D5) and the lines that set its height and bring it into view after Send (D1);
 *  - the configuration over the catalogue (contracts/form-configuration.schema.json): the texts in
 *    both languages, the most authors (D7) and their notice, and every field: shown or not,
 *    required, label, help, limits, file types and size, options. It is saved as the draft;
 *  - the preview of the draft, rendered by the renderer the sites use, sending nothing;
 *  - the versions, and Publish, which makes the saved draft the next version;
 *  - the send breaker of the form (ADR-08).
 * Every change is made on the version of the form the screen holds; the server refuses a stale one.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { Conference } from '@confera/api-client';
import { FORM_CONFIGURATION } from '@confera/api-client';
import { buildEmbedSnippet, type SnippetLanguage } from '@confera/embed-loader';
import { FORM_TEXTS, FormRenderer, noDraftStorage, previewApi, readDefinition, textOf, type Condition, type FormDefinition, type PublishedForm } from '@confera/form-renderer';
import { Alert, Button, Card, Checkbox, CheckboxGroup, ConfirmDialog, DataTable, Drawer, NumberField, PageHeader, Select, StatusBadge, Switch, Textarea, TextButton, TextField, toast } from '@confera/ui';

import styles from './admin.module.css';
import { conferenceLabel } from './conference-context';
import { drawerOpened } from './drawer-event';
import { formatDateTime } from './format';
import { formStateText } from './Forms';
import { intake, type FormRecord } from './intake-api';
import { ProblemAlert } from './ProblemAlert';
import { call, explain, isApiError, type Explained } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

interface Localised {
  en: string;
  sr: string;
}
interface FieldConfig {
  enabled?: boolean;
  required?: boolean;
  label?: Localised;
  help?: Localised | null;
  options?: Record<string, Localised>;
  maxLength?: number;
  maxWords?: number;
  file?: { accept?: string[]; maxBytes?: number };
}
/** contracts/form-configuration.schema.json: what an admin sets over the catalogue; what is left out is its default. */
interface Configuration {
  texts?: Partial<Record<string, Localised>>;
  maxAuthors?: number;
  authorNoticeFrom?: number | null;
  authorNotice?: Localised | null;
  sections?: Record<string, { label?: Localised }>;
  fields?: Record<string, FieldConfig>;
}

const MB = 1024 * 1024;
const localised = (value: { en: string; sr?: string | null } | null | undefined): Localised => ({ en: value?.en ?? '', sr: value?.sr ?? '' });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value ?? {})) as T;

/** A refusal of a draft, by the path the server names (`configuration.fields.title.label.en`), in words. */
function refusalLines(error: unknown): string[] {
  if (!isApiError(error)) return [];
  const t = TEXTS.forms;
  return (error.problem?.errors ?? []).map((item) => {
    const parts = String(item.path ?? '').replace(/^configuration\./, '').split('.');
    const where =
      parts[0] === 'fields' && parts[1] ? (t.fieldNames[parts[1]] ?? parts[1]) : parts[0] === 'texts' && parts[1] ? (t.textNames[parts[1]] ?? parts[1]) : parts[0] === 'maxAuthors' ? t.maxAuthors : parts.join('.');
    return `${where}: ${t.refused[String(item.code)] ?? TEXTS.problems.fieldFallback}`;
  });
}

export function FormSettings({ id, publicOrigin }: { id: string; publicOrigin: string }) {
  const router = useRouter();
  const { client, contact, session } = useSession();
  const t = TEXTS.forms;
  const mayManage = session?.user.permissions.includes('forms.manage') ?? false;
  const form = useLoad<FormRecord>((c) => intake.form(c, id), [id]);
  const record = form.state.data;
  const conference = useLoad<Conference | null>((c) => (record ? call(c.GET('/api/v1/conferences/{id}', { params: { path: { id: record.conferenceId } } })) : Promise.resolve(null)), [record?.conferenceId]);
  // Authors at the most authors, and a closed form, name the organisation's contact address; without one they have nobody to write to (UX3-17, UX3-21).
  const mayReadOrganisation = session?.user.permissions.includes('organisation.read') ?? false;
  const organisation = useLoad<{ contactEmail?: string | null } | null>((c) => (mayReadOrganisation ? call(c.GET('/api/v1/organisation')) : Promise.resolve(null)), [mayReadOrganisation]);
  const noContact = organisation.state.phase === 'ready' && organisation.state.data !== null && !organisation.state.data.contactEmail;

  // The configuration being edited follows the record: a new version from the server replaces it.
  const [configuration, setConfiguration] = useState<Configuration>({});
  const [heldVersion, setHeldVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  if (record && record.version !== heldVersion) {
    setHeldVersion(record.version);
    setConfiguration(clone(record.configuration as Configuration));
    setDirty(false);
  }
  const change = (next: Configuration) => {
    setConfiguration(next);
    setDirty(true);
  };

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<(Explained & { lines: string[] }) | null>(null);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const definition = useMemo<FormDefinition | null>(() => {
    try {
      return record ? readDefinition(record.draftDefinition) : null;
    } catch {
      return null;
    }
  }, [record]);
  // The published version, to tell whether the saved draft differs from it (UX3-09).
  const published = useLoad<{ definition: unknown } | null>(
    (c) => (record?.currentVersion ? intake.version(c, record.id, record.currentVersion.number).catch(() => null) : Promise.resolve(null)),
    [record?.id, record?.currentVersion?.number],
  );
  const publishedDefinition = published.state.data?.definition;

  if (form.state.phase === 'failed' && !record) {
    return (
      <div className={styles.stack}>
        <PageHeader title={t.title} breadcrumbs={[{ label: t.back, href: '/forms', onClick: () => router.push('/forms') }]} />
        <Alert tone="error" title={form.state.problem.title} action={<TextButton onClick={() => void form.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {form.state.problem.text}
        </Alert>
      </div>
    );
  }
  if (!record) return null;

  const refused = (error: unknown) => {
    setProblem({ ...explain(error, contact), lines: refusalLines(error) });
    if (isApiError(error) && error.code === 'version_conflict') void form.reload({ background: true });
  };

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const next = await intake.saveDraft(client, record.id, configuration as Record<string, unknown>, record.version);
      form.replace(next);
      toast({ title: t.saved, tone: 'success' });
    } catch (error) {
      refused(error);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const next = await intake.publish(client, record.id, record.version);
      setAsking(false);
      form.replace(next);
      toast({ title: fill(t.publishedToast, { n: next.currentVersion?.number ?? '' }), tone: 'success' });
    } catch (error) {
      setAsking(false);
      refused(error);
    } finally {
      setBusy(false);
    }
  };

  const name = conference.state.data ? conferenceLabel(conference.state.data) : '';
  const nextNumber = (record.versions.reduce((most, version) => Math.max(most, version.number), 0) || 0) + 1;
  // What the draft is now (UX3-09): never published, changed and not saved, saved but not published, or the same.
  const current = record.currentVersion;
  const changed = current === null || publishedDefinition === undefined || canonical(record.draftDefinition) !== canonical(publishedDefinition);
  const draftState = current === null ? 'unpublished' : dirty ? 'unsaved' : changed ? 'changed' : 'same';
  const stateTone = draftState === 'same' ? 'success' : draftState === 'unpublished' ? 'neutral' : 'warning';
  const stateText = fill(t.draftState[draftState], { n: current?.number ?? '' });

  return (
    <div className={styles.stack}>
      <PageHeader
        title={<span className={styles.break}>{`${t.types[record.type] ?? record.type}${name ? ` · ${name}` : ''}`}</span>}
        description={`/f/${record.slug}`}
        breadcrumbs={[{ label: t.back, href: '/forms', onClick: () => router.push('/forms') }, { label: t.types[record.type] ?? record.type }]}
        actions={<StatusBadge tone={record.state === 'open' ? 'success' : 'neutral'}>{formStateText(record.state, record.closedReason)}</StatusBadge>}
      />
      {/* The screen is long (UX3-09, M3-ISS-22): its parts are named here, each a link to its card. */}
      <nav aria-label={t.sectionsLabel} className={styles.anchors} data-confera-form-sections="">
        <ul>
          {(['snippet', 'texts', 'authors', 'fields', ...(definition && conference.state.data ? (['preview'] as const) : []), 'versions', 'breaker'] as const).map((part) => (
            <li key={part}>
              <a className="ud-link" href={`#form-${part}`}>
                {t.sections[part]}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {noContact ? (
        <Alert tone="warning" title={t.noContact} action={<TextButton onClick={() => router.push('/organisation')}>{t.noContactAction}</TextButton>}>
          {t.noContactText}
        </Alert>
      ) : null}
      {dirty ? (
        <Alert tone="info" title={t.unsaved}>
          {t.publishSaveFirst}
        </Alert>
      ) : null}
      {problem ? (
        <ProblemAlert title={problem.title} onClose={() => setProblem(null)}>
          {problem.lines.length > 0 ? (
            <ul className={styles.plainList}>
              {problem.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            problem.text
          )}
        </ProblemAlert>
      ) : null}

      <EmbedCard record={record} conference={conference.state.data ?? null} publicOrigin={publicOrigin} />

      <form className={styles.stack} onSubmit={(event) => void save(event)} noValidate data-confera-form-configuration="">
        <TextsCard configuration={configuration} definition={definition} readOnly={!mayManage} onChange={change} />
        <AuthorsCard configuration={configuration} definition={definition} readOnly={!mayManage} onChange={change} />
        <FieldsCard configuration={configuration} definition={definition} onEdit={setEditing} />
      </form>

      {definition && conference.state.data ? <PreviewCard record={record} definition={definition} conference={conference.state.data} /> : null}

      <Card title={t.versions} headingLevel={2} id="form-versions" className={styles.anchored}>
        <div className={styles.stack}>
          <p className={styles.text}>{t.versionsLead}</p>
          <DataTable
            caption={t.versions}
            rows={record.versions.map((version) => ({ ...version, key: String(version.number) }))}
            rowKey="key"
            empty={<p className={styles.text}>{t.notPublished}</p>}
            columns={[
              { key: 'number', header: t.published, render: (row) => fill(t.versionNumber, { n: row.number }) },
              { key: 'publishedAt', header: t.publishedAt, render: (row) => formatDateTime(row.publishedAt) },
              { key: 'publishedBy', header: t.publishedBy, render: (row) => row.publishedBy.displayName },
            ]}
          />
        </div>
      </Card>

      <BreakerCard record={record} readOnly={!mayManage} onSaved={(next) => form.replace(next)} onRefused={refused} />

      {editing && definition ? (
        <FieldDrawer
          fieldKey={editing}
          configuration={configuration}
          definition={definition}
          readOnly={!mayManage}
          onClose={() => setEditing(null)}
          onApply={(next) => {
            change(next);
            setEditing(null);
          }}
        />
      ) : null}

      {/* Save and Publish together, with the state of the draft, in view wherever the page is scrolled (UX3-09). */}
      <div className={styles.stickyActions} role="region" aria-label={t.actionsLabel} data-confera-form-actions="">
        <span data-confera-draft-state={draftState}>
          <StatusBadge tone={stateTone}>{stateText}</StatusBadge>
        </span>
        {mayManage ? (
          <div className={styles.actionsInline}>
            <Button disabled={busy || !dirty} onClick={() => void save()}>
              {busy ? TEXTS.common.loading : t.save}
            </Button>
            {/* Publishing takes the saved draft: with unsaved changes, save first; with none to publish, nothing to do. */}
            <Button variant="dark" disabled={busy || dirty || !changed} onClick={() => setAsking(true)}>
              {t.publish}
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog open={asking} title={fill(t.publishQuestion, { n: nextNumber })} confirmText={t.publish} busy={busy} onCancel={() => setAsking(false)} onConfirm={() => void publish()}>
        {t.publishText}
      </ConfirmDialog>
    </div>
  );
}

/** The snippet of the form, for the site's language (M3-FE-03). */
function EmbedCard({ record, conference, publicOrigin }: { record: FormRecord; conference: Conference | null; publicOrigin: string }) {
  const t = TEXTS.forms;
  // The visitor's browser decides until the admin names the site's language (UX3-12, D2): a snippet copied at once is right on any site.
  const [language, setLanguage] = useState<SnippetLanguage | 'browser'>('browser');
  const definition = (() => {
    try {
      return readDefinition(record.draftDefinition);
    } catch {
      return null;
    }
  })();
  const textLanguage = language === 'browser' ? 'en' : language;
  const title = definition ? textOf(definition.texts.title, textLanguage) : (t.types[record.type] ?? record.type);
  // Without a language the link says it in both, as the visitor's browser may choose either.
  const linkText = language === 'browser' ? `${FORM_TEXTS.en.embed.fallback} / ${FORM_TEXTS.sr.embed.fallback}` : FORM_TEXTS[language].embed.fallback;
  let snippet = '';
  try {
    snippet = buildEmbedSnippet({ publicOrigin, slug: record.slug, title, linkText, ...(language === 'browser' ? {} : { language }) });
  } catch {
    snippet = '';
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      toast({ title: t.copied, tone: 'success' });
    } catch {
      toast({ title: t.copyFailed, tone: 'warning' });
    }
  };
  const sites = conference?.listedSites ?? [];
  const hosted = `${publicOrigin}/f/${record.slug}${language === 'browser' ? '' : `?lang=${language}`}`;
  return (
    <Card title={t.embedTitle} headingLevel={2} id="form-snippet" className={styles.anchored} data-confera-embed-card="">
      <div className={styles.stack}>
        <p className={styles.text}>{t.embedLead}</p>
        {record.currentVersion === null ? (
          <Alert tone="info" title={t.notPublished}>
            {t.notPublishedNote}
          </Alert>
        ) : null}
        <div className={styles.fields}>
          <Select
            label={t.embedLanguage}
            name="embedLanguage"
            value={language}
            onChange={(event) => setLanguage(event.target.value as SnippetLanguage | 'browser')}
            options={(['en', 'sr', 'browser'] as const).map((value) => ({ value, label: t.embedLanguages[value] ?? value }))}
            message={t.embedLanguageHint}
          />
        </div>
        <Textarea label={t.snippet} name="snippet" rows={8} readOnly value={snippet} spellCheck={false} className={styles.mono} />
        <div className={styles.actionsInline}>
          <Button icon="copy" onClick={() => void copy()}>
            {t.copy}
          </Button>
          <a className="ud-link" href={hosted} target="_blank" rel="noopener noreferrer">
            {t.hosted}
          </a>
        </div>
        <p className={styles.text}>{sites.length > 0 ? fill(t.sitesNote, { sites: sites.join(', ') }) : t.sitesNone}</p>
        <div>
          <a className="ud-link" href={`/conferences/${record.conferenceId}`}>
            {t.toSettings}
          </a>
        </div>
      </div>
    </Card>
  );
}

interface EditProps {
  readonly configuration: Configuration;
  readonly definition: FormDefinition | null;
  readonly readOnly: boolean;
  readonly onChange: (next: Configuration) => void;
}

/** The six texts of the form, in both languages (FR-FORM-02). */
function TextsCard({ configuration, definition, readOnly, onChange }: EditProps) {
  const t = TEXTS.forms;
  const value = (key: string): Localised => configuration.texts?.[key] ?? localised(definition?.texts[key as keyof FormDefinition['texts']]);
  const set = (key: string, language: 'en' | 'sr', text: string) => onChange({ ...configuration, texts: { ...configuration.texts, [key]: { ...value(key), [language]: text } } });
  return (
    <Card title={t.texts} headingLevel={2} id="form-texts" className={styles.anchored}>
      <div className={styles.stack}>
        <p className={styles.text}>{t.textsLead}</p>
        <div className={styles.fields}>
          {FORM_CONFIGURATION.texts.map((key) => {
            const label = t.textNames[key] ?? key;
            const long = key !== 'title' && key !== 'submit';
            return (
              <div key={key} className={styles.all}>
                <div className={styles.fields}>
                  {long ? (
                    <>
                      <Textarea label={fill(t.english, { name: label })} name={`texts.${key}.en`} rows={3} value={value(key).en} disabled={readOnly} onChange={(event) => set(key, 'en', event.target.value)} />
                      <Textarea label={fill(t.serbian, { name: label })} name={`texts.${key}.sr`} rows={3} value={value(key).sr} disabled={readOnly} onChange={(event) => set(key, 'sr', event.target.value)} message={t.serbianHint} />
                    </>
                  ) : (
                    <>
                      <TextField label={fill(t.english, { name: label })} name={`texts.${key}.en`} value={value(key).en} disabled={readOnly} onChange={(event) => set(key, 'en', event.target.value)} />
                      <TextField label={fill(t.serbian, { name: label })} name={`texts.${key}.sr`} value={value(key).sr} disabled={readOnly} onChange={(event) => set(key, 'sr', event.target.value)} message={t.serbianHint} />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/** The most authors (D7) and the notice from a later author on (FR-FORM-03). */
function AuthorsCard({ configuration, definition, readOnly, onChange }: EditProps) {
  const t = TEXTS.forms;
  const repeat = definition?.sections.find((section) => section.repeat)?.repeat ?? null;
  const max = configuration.maxAuthors ?? repeat?.max ?? 10;
  const from = configuration.authorNoticeFrom !== undefined ? configuration.authorNoticeFrom : (repeat?.noticeFrom ?? null);
  const notice = configuration.authorNotice !== undefined && configuration.authorNotice !== null ? configuration.authorNotice : localised(repeat?.notice);
  const number = (text: string): number | null => (/^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null);
  return (
    <Card title={t.authors} headingLevel={2} id="form-authors" className={styles.anchored}>
      <div className={styles.fields}>
        <NumberField label={t.maxAuthors} name="maxAuthors" inputMode="numeric" value={String(max)} disabled={readOnly} onChange={(event) => onChange({ ...configuration, maxAuthors: number(event.target.value) ?? max })} message={t.maxAuthorsHint} />
        <NumberField label={t.noticeFrom} name="authorNoticeFrom" inputMode="numeric" value={from === null ? '' : String(from)} disabled={readOnly} onChange={(event) => onChange({ ...configuration, authorNoticeFrom: number(event.target.value) })} message={t.noticeFromHint} />
        <TextField label={fill(t.english, { name: t.notice })} name="authorNotice.en" value={notice.en} disabled={readOnly} onChange={(event) => onChange({ ...configuration, authorNotice: { ...notice, en: event.target.value } })} />
        <TextField label={fill(t.serbian, { name: t.notice })} name="authorNotice.sr" value={notice.sr} disabled={readOnly} onChange={(event) => onChange({ ...configuration, authorNotice: { ...notice, sr: event.target.value } })} message={t.serbianHint} />
      </div>
    </Card>
  );
}

/** Two values of a definition as the same JSON whatever the order of their keys (a stored definition comes back reordered). */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => (Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sort(x)])) : v);
  return JSON.stringify(sort(value));
}

/** “When “Who pays the fee?” is “My employer”” (UX3-10). */
function conditionText(definition: FormDefinition, when: Condition): string {
  const t = TEXTS.forms;
  const asked = definition.sections.flatMap((s) => s.fields).find((f) => f.key === when.field);
  const question = asked ? textOf(asked.label, 'en') : (t.fieldNames[when.field] ?? when.field);
  const answers = when.in.map((value) => `“${asked?.options?.find((o) => o.value === value) ? textOf(asked.options.find((o) => o.value === value)!.label, 'en') : value}”`).join(t.or);
  return fill(t.requiredWhen, { question, answers });
}

/** Every field of the catalogue, also the ones switched off; a row opens its editor. */
function FieldsCard({ configuration, definition, onEdit }: { configuration: Configuration; definition: FormDefinition | null; onEdit: (key: string) => void }) {
  const t = TEXTS.forms;
  const rows = FORM_CONFIGURATION.fields.map((key) => {
    const section = definition?.sections.find((s) => s.fields.some((f) => f.key === key));
    const field = section?.fields.find((f) => f.key === key);
    const own = configuration.fields?.[key];
    const shown = own?.enabled ?? field !== undefined;
    const required = own?.required ?? field?.required ?? false;
    // A field (or its section) asked only on an answer of another field (UX3-10): required then, not always.
    const when = field?.visibleWhen ?? section?.visibleWhen ?? null;
    return {
      key,
      name: own?.label?.en ?? (field ? textOf(field.label, 'en') : (t.fieldNames[key] ?? key)),
      section: section ? textOf(section.label, 'en') : t.switchedOff,
      shown,
      conditional: when !== null,
      requiredText: !required ? t.no : when && definition ? conditionText(definition, when) : t.yes,
    };
  });
  return (
    <Card title={t.fields} headingLevel={2} id="form-fields" className={styles.anchored}>
      <div className={styles.stack}>
        <p className={styles.text}>{t.fieldsLead}</p>
        <DataTable
          caption={t.fields}
          rows={rows}
          rowKey="key"
          onRowClick={(row) => onEdit(row.key)}
          columns={[
            { key: 'name', header: t.field },
            { key: 'section', header: t.section },
            { key: 'shown', header: t.shown, render: (row) => <StatusBadge tone={row.shown ? 'success' : 'neutral'}>{!row.shown ? t.no : row.conditional ? t.shownWhen : t.yes}</StatusBadge> },
            { key: 'required', header: t.required, render: (row) => <span className={styles.break}>{row.requiredText}</span> },
          ]}
        />
      </div>
    </Card>
  );
}

/** The editor of one field, in a drawer; Apply writes it into the draft that is being edited. */
function FieldDrawer({ fieldKey, configuration, definition, readOnly, onClose, onApply }: { fieldKey: string; configuration: Configuration; definition: FormDefinition; readOnly: boolean; onClose: () => void; onApply: (next: Configuration) => void }) {
  const t = TEXTS.forms;
  // While the drawer is open the toasts stay off its footer (UX3-22).
  useEffect(() => {
    drawerOpened(true);
    return () => drawerOpened(false);
  }, []);
  const field = definition.sections.flatMap((s) => s.fields).find((f) => f.key === fieldKey);
  const own = configuration.fields?.[fieldKey] ?? {};
  const [enabled, setEnabled] = useState(own.enabled ?? field !== undefined);
  const [required, setRequired] = useState(own.required ?? field?.required ?? false);
  const [label, setLabel] = useState<Localised>(own.label ?? localised(field?.label ?? { en: t.fieldNames[fieldKey] ?? fieldKey }));
  const [help, setHelp] = useState<Localised>(own.help ?? localised(field?.help));
  const [maxLength, setMaxLength] = useState(String(own.maxLength ?? field?.rules.maxLength ?? ''));
  const [maxWords, setMaxWords] = useState(String(own.maxWords ?? field?.rules.maxWords ?? ''));
  const [accept, setAccept] = useState<string[]>(own.file?.accept ?? [...(field?.rules.file?.accept ?? [])]);
  const [megabytes, setMegabytes] = useState(String(Math.round(((own.file?.maxBytes ?? field?.rules.file?.maxBytes ?? 20 * MB) / MB) * 10) / 10));
  const [options, setOptions] = useState<Record<string, Localised>>(() => Object.fromEntries((field?.options ?? []).map((option) => [option.value, own.options?.[option.value] ?? localised(option.label)])));
  const name = textOf(field?.label, 'en') || t.fieldNames[fieldKey] || fieldKey;
  const whole = (text: string) => (/^\d{1,6}$/.test(text.trim()) ? Number(text.trim()) : undefined);

  const apply = () => {
    const next: FieldConfig = { enabled, required, label, help: help.en.trim() === '' ? null : help };
    if (whole(maxLength) !== undefined) next.maxLength = whole(maxLength);
    if (field?.kind === 'longText' && whole(maxWords) !== undefined) next.maxWords = whole(maxWords);
    if (field?.kind === 'file') next.file = { accept, maxBytes: Math.round(Number(megabytes.replace(',', '.')) * MB) };
    if (Object.keys(options).length > 0) next.options = options;
    onApply({ ...configuration, fields: { ...configuration.fields, [fieldKey]: next } });
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={fill(t.editTitle, { name })}
      actions={
        readOnly ? (
          <TextButton onClick={onClose}>{TEXTS.common.close}</TextButton>
        ) : (
          <>
            <TextButton onClick={onClose}>{TEXTS.common.cancel}</TextButton>
            <Button onClick={apply}>{t.apply}</Button>
          </>
        )
      }
    >
      <div className={styles.form} data-confera-field-editor={fieldKey}>
        <Switch label={t.enabled} description={t.enabledHint} checked={enabled} disabled={readOnly} onChange={(event) => setEnabled(event.target.checked)} />
        <Checkbox label={t.requiredLabel} checked={required} disabled={readOnly} onChange={(event) => setRequired(event.target.checked)} />
        <TextField label={fill(t.english, { name: t.label })} value={label.en} disabled={readOnly} onChange={(event) => setLabel({ ...label, en: event.target.value })} />
        <TextField label={fill(t.serbian, { name: t.label })} value={label.sr} disabled={readOnly} onChange={(event) => setLabel({ ...label, sr: event.target.value })} message={t.serbianHint} />
        <TextField label={fill(t.english, { name: t.help })} value={help.en} disabled={readOnly} onChange={(event) => setHelp({ ...help, en: event.target.value })} />
        <TextField label={fill(t.serbian, { name: t.help })} value={help.sr} disabled={readOnly} onChange={(event) => setHelp({ ...help, sr: event.target.value })} message={t.serbianHint} />
        {field && field.kind !== 'file' && field.kind !== 'consent' && field.kind !== 'choice' && field.kind !== 'yesNo' ? (
          <NumberField label={t.maxLength} inputMode="numeric" value={maxLength} disabled={readOnly} onChange={(event) => setMaxLength(event.target.value)} />
        ) : null}
        {field?.kind === 'longText' ? <NumberField label={t.maxWords} inputMode="numeric" value={maxWords} disabled={readOnly} onChange={(event) => setMaxWords(event.target.value)} /> : null}
        {field?.kind === 'file' ? (
          <>
            <CheckboxGroup label={t.fileTypes} value={accept} disabled={readOnly} onChange={setAccept} options={FORM_CONFIGURATION.fileTypes.map((type) => ({ value: type, label: `.${type === 'jpeg' ? 'jpg' : type}` }))} direction="row" />
            <NumberField label={t.fileSize} inputMode="decimal" value={megabytes} disabled={readOnly} onChange={(event) => setMegabytes(event.target.value)} />
          </>
        ) : null}
        {Object.keys(options).length > 0 ? (
          <fieldset className="ud-fieldset">
            <legend className="ud-field__label">{t.options}</legend>
            {Object.entries(options).map(([value, text]) => (
              <div key={value} className={styles.fields}>
                <TextField label={fill(t.english, { name: value })} value={text.en} disabled={readOnly} onChange={(event) => setOptions({ ...options, [value]: { ...text, en: event.target.value } })} />
                <TextField label={fill(t.serbian, { name: value })} value={text.sr} disabled={readOnly} onChange={(event) => setOptions({ ...options, [value]: { ...text, sr: event.target.value } })} />
              </div>
            ))}
          </fieldset>
        ) : null}
      </div>
    </Drawer>
  );
}

/** The draft as the sites will show it once it is published: the renderer itself, sending nothing. */
function PreviewCard({ record, definition, conference }: { record: FormRecord; definition: FormDefinition; conference: Conference }) {
  const t = TEXTS.forms;
  const [language, setLanguage] = useState<'en' | 'sr'>('en');
  const preview: PublishedForm = {
    slug: record.slug,
    version: (record.currentVersion?.number ?? 0) + 1,
    state: 'open',
    closedReason: null,
    deadline: null,
    conference: {
      code: conference.code,
      name: conferenceLabel(conference),
      timeZone: conference.timeZone,
      languages: conference.languages.filter((l): l is 'en' | 'sr' => l === 'en' || l === 'sr'),
      contactEmail: null,
      links: { terms: conference.publicationTermsUrl ?? null, privacy: conference.privacyNoticeUrl ?? null },
    },
    frameSites: [],
    definition,
  };
  return (
    <Card title={t.preview} headingLevel={2} id="form-preview" className={styles.anchored} data-confera-form-preview="">
      <div className={styles.stack}>
        <p className={styles.text}>{t.previewLead}</p>
        <div className={styles.fields}>
          <Select label={TEXTS.forms.embedLanguage} value={language} onChange={(event) => setLanguage(event.target.value === 'sr' ? 'sr' : 'en')} options={[{ value: 'en', label: 'English' }, { value: 'sr', label: 'Srpski' }]} />
        </div>
        {/* A new key when the definition or the language changes: the preview starts again from the draft. */}
        <FormRenderer key={`${record.version}:${language}`} form={preview} language={language} preview api={previewApi} storage={() => noDraftStorage} />
      </div>
    </Card>
  );
}

/** The send breaker of the form (ADR-08, M3-BE-09). */
function BreakerCard({ record, readOnly, onSaved, onRefused }: { record: FormRecord; readOnly: boolean; onSaved: (next: FormRecord) => void; onRefused: (error: unknown) => void }) {
  const t = TEXTS.forms;
  const { client } = useSession();
  const [perHour, setPerHour] = useState(String(record.breakerPerHour));
  const [perDay, setPerDay] = useState(String(record.breakerPerDay));
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const next = await intake.setFormBreaker(client, record.id, Number(perHour), Number(perDay), record.version);
      onSaved(next);
      toast({ title: t.breakerSaved, tone: 'success' });
    } catch (error) {
      onRefused(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t.breaker} headingLevel={2} id="form-breaker" className={styles.anchored}>
      <form className={styles.stack} onSubmit={(event) => void save(event)} noValidate>
        <p className={styles.text}>{t.breakerLead}</p>
        <div className={styles.fields}>
          <NumberField label={t.perHour} name="breakerPerHour" inputMode="numeric" value={perHour} disabled={readOnly} onChange={(event) => setPerHour(event.target.value)} />
          <NumberField label={t.perDay} name="breakerPerDay" inputMode="numeric" value={perDay} disabled={readOnly} onChange={(event) => setPerDay(event.target.value)} />
        </div>
        {readOnly ? null : (
          <div>
            <Button type="submit" variant="dark" disabled={busy}>
              {t.breakerSave}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
