// The stand-in for confera_be's admin API of 0.2.0 part B, for the browser tests (ADR-24):
// conferences (FR-CONF-01 to 04), mail servers with the write-only password (ADR-11), the test
// message, the mail log and the templates read API (ADR-12). It follows the vendored contract
// and the rules of confera_be's services: versions, the changes of state FR-CONF-04 allows,
// the listed sites kept as origins, a code unique per edition, a new target without a new
// password clears the stored one, a server in use cannot be deleted, every mail-server change
// needs the password asked again. Nothing of this is part of the application.
import { STUB_PART_B } from './stub-fixture.mjs';

/** The universe's part B, as the fixture has it at the start and after a reset. */
export function freshPartB() {
  return {
    conferences: STUB_PART_B.conferences.map((conference) => ({ ...conference, listedSites: [...conference.listedSites], languages: [...conference.languages] })),
    mailServers: STUB_PART_B.mailServers.map((server) => ({ ...server })),
    mailLog: STUB_PART_B.mailLog.map((entry) => ({ ...entry })),
    templates: STUB_PART_B.templates.map((template) => ({ ...template })),
  };
}

const NEXT_STATES = { draft: ['open', 'archived'], open: ['closed'], closed: ['open', 'archived'], archived: [] };
const CODE = /^[A-Z]{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const PRIVATE = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost$)/i;

/** The listed sites as origins, as confera_be keeps them; the first refused entry, by index. */
function sitesOf(entries, refuse) {
  if (!Array.isArray(entries)) refuse(400, 'validation_failed', [{ path: 'listedSites', code: 'isArray' }]);
  if (entries.length > 20) refuse(400, 'validation_failed', [{ path: 'listedSites[20]', code: 'site_too_many' }]);
  const sites = [];
  entries.forEach((entry, index) => {
    const text = String(entry).trim();
    const problem = (() => {
      if (text.includes('*')) return 'wildcard';
      if (/[\s;,'"`<>\\]/.test(text)) return 'forbidden_character';
      const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)?.[1]?.toLowerCase();
      if (scheme === undefined) return 'not_a_url';
      if (scheme !== 'https') return 'scheme';
      let url;
      try {
        url = new URL(text);
      } catch {
        return 'not_a_url';
      }
      if (url.username !== '' || url.password !== '' || text.slice(8).includes('@')) return 'user_part';
      if (url.search !== '' || url.hash !== '' || /[?#]/.test(text)) return 'query';
      if (url.pathname !== '/' && url.pathname !== '') return 'path';
      const origin = url.origin;
      if (!sites.includes(origin)) sites.push(origin);
      return null;
    })();
    if (problem) refuse(400, 'validation_failed', [{ path: `listedSites[${index}]`, code: `site_${problem}` }]);
  });
  return sites;
}

function conferenceFields(body, refuse, creating) {
  const errors = [];
  if (creating || 'name' in body) if (!String(body.name ?? '').trim() || String(body.name).length > 200) errors.push({ path: 'name', code: 'isPlainText' });
  if (creating || 'code' in body) if (!CODE.test(String(body.code ?? ''))) errors.push({ path: 'code', code: 'matches' });
  if (body.editionYear != null && !(Number.isInteger(body.editionYear) && body.editionYear >= 2000 && body.editionYear <= 2100)) errors.push({ path: 'editionYear', code: body.editionYear < 2000 ? 'min' : 'max' });
  for (const key of ['startsOn', 'endsOn']) if (body[key] != null && !DATE.test(body[key])) errors.push({ path: key, code: 'matches' });
  if (body.languages !== undefined && (!Array.isArray(body.languages) || body.languages.length === 0)) errors.push({ path: 'languages', code: 'arrayMinSize' });
  if (body.timeZone !== undefined) {
    let known = body.timeZone === 'UTC';
    try {
      known = known || Intl.supportedValuesOf('timeZone').includes(body.timeZone);
    } catch {
      known = false;
    }
    if (!known) errors.push({ path: 'timeZone', code: 'isTimeZone' });
  }
  if (errors.length > 0) refuse(400, 'validation_failed', errors);
  if (body.startsOn && body.endsOn && body.endsOn < body.startsOn) refuse(400, 'validation_failed', [{ path: 'endsOn', code: 'endsBeforeStart' }]);
}

/** A server as the API gives it: never its password. */
const serverDto = (server) => Object.fromEntries(Object.entries(server).filter(([key]) => key !== 'password'));

/**
 * The handler of the part B routes. `ctx` is what the part A handler knows of the request:
 * the universe, the person, the request, its body and the guards. Returns undefined when the
 * route is not one of part B.
 */
export function handlePartB(ctx) {
  const { state, me, method, path, url, body, need, fresh, versionOf, refuse, record, id, now } = ctx;

  // ---- conferences ---------------------------------------------------------------------------
  const takenBy = (code, editionYear, except) => state.conferences.some((c) => c.id !== except && c.code === code && (c.editionYear ?? null) === (editionYear ?? null));
  if (path === '/api/v1/conferences' && method === 'GET') {
    need('conferences.read');
    const wanted = url.searchParams.get('state');
    const items = state.conferences.filter((c) => !wanted || c.state === wanted).sort((a, b) => a.code.localeCompare(b.code) || (b.editionYear ?? 9999) - (a.editionYear ?? 9999));
    return { status: 200, body: { items } };
  }
  if (path === '/api/v1/conferences' && method === 'POST') {
    need('conferences.manage');
    conferenceFields(body, refuse, true);
    const listedSites = sitesOf(body.listedSites ?? [], refuse);
    if (body.mailServerId && !state.mailServers.some((s) => s.id === body.mailServerId)) refuse(400, 'validation_failed', [{ path: 'mailServerId', code: 'unknownMailServer' }]);
    if (takenBy(body.code, body.editionYear ?? null, null)) refuse(409, 'conference_code_taken');
    const conference = { id: id('0e2ec000-0000'), name: String(body.name).trim(), code: body.code, editionYear: body.editionYear ?? null, startsOn: body.startsOn ?? null, endsOn: body.endsOn ?? null, venue: body.venue ?? null, listedSites, languages: body.languages ?? ['en', 'sr'], timeZone: body.timeZone ?? 'Europe/Belgrade', state: 'draft', mailServerId: body.mailServerId ?? null, version: 1 };
    state.conferences.push(conference);
    record(me.id, 'conference.created', 'conference', conference.id, { fields: ['name', 'code'] });
    return { status: 201, body: conference };
  }
  const conferenceRoute = /^\/api\/v1\/conferences\/([^/]+)(?:\/(state|copy))?$/.exec(path);
  if (conferenceRoute) {
    need('conferences.read');
    const conference = state.conferences.find((c) => c.id === conferenceRoute[1]);
    if (!conference) refuse(404, 'not_found');
    const sub = conferenceRoute[2];
    if (!sub && method === 'GET') return { status: 200, body: conference };
    need('conferences.manage');
    if (!sub && method === 'PATCH') {
      if (conference.state === 'archived') refuse(409, 'conference_archived');
      versionOf(body.version, conference);
      conferenceFields(body, refuse, false);
      const listedSites = body.listedSites === undefined ? conference.listedSites : sitesOf(body.listedSites, refuse);
      if (body.mailServerId && !state.mailServers.some((s) => s.id === body.mailServerId)) refuse(400, 'validation_failed', [{ path: 'mailServerId', code: 'unknownMailServer' }]);
      const code = body.code ?? conference.code;
      const editionYear = body.editionYear === undefined ? conference.editionYear : body.editionYear;
      if (takenBy(code, editionYear, conference.id)) refuse(409, 'conference_code_taken');
      const fields = [];
      for (const key of ['name', 'code', 'editionYear', 'startsOn', 'endsOn', 'venue', 'languages', 'timeZone', 'mailServerId']) {
        if (key in body && JSON.stringify(body[key]) !== JSON.stringify(conference[key])) {
          fields.push(key);
          conference[key] = key === 'name' ? String(body[key]).trim() : body[key];
        }
      }
      if (JSON.stringify(listedSites) !== JSON.stringify(conference.listedSites)) fields.push('listedSites');
      conference.listedSites = listedSites;
      conference.version += 1;
      record(me.id, 'conference.updated', 'conference', conference.id, { fields });
      return { status: 200, body: conference };
    }
    if (sub === 'state' && method === 'POST') {
      if (conference.state !== body.state && !NEXT_STATES[conference.state].includes(body.state)) refuse(409, 'state_change_not_allowed');
      versionOf(body.version, conference);
      conference.state = body.state;
      conference.version += 1;
      record(me.id, 'conference.state_changed', 'conference', conference.id, { fields: ['state'] });
      return { status: 201, body: conference };
    }
    if (sub === 'copy' && method === 'POST') {
      conferenceFields({ name: body.name, ...(body.code ? { code: body.code } : {}), editionYear: body.editionYear }, refuse, false);
      if (!String(body.name ?? '').trim()) refuse(400, 'validation_failed', [{ path: 'name', code: 'isPlainText' }]);
      const code = body.code || conference.code;
      const editionYear = body.editionYear === undefined ? conference.editionYear : body.editionYear;
      if (takenBy(code, editionYear, null)) refuse(409, 'conference_code_taken');
      const copy = { ...conference, id: id('0e2ec000-0000'), name: String(body.name).trim(), code, editionYear, startsOn: null, endsOn: null, state: 'draft', listedSites: [...conference.listedSites], languages: [...conference.languages], version: 1 };
      state.conferences.push(copy);
      for (const template of state.templates.filter((t) => t.conferenceId === conference.id)) state.templates.push({ ...template, id: id('0e2e7000-0000'), conferenceId: copy.id, version: 1 });
      record(me.id, 'conference.copied', 'conference', copy.id, { detail: { from: conference.id } });
      return { status: 201, body: copy };
    }
  }

  // ---- mail servers -------------------------------------------------------------------------
  const checkServer = (input, creating) => {
    const errors = [];
    if (creating || 'name' in input) if (!String(input.name ?? '').trim()) errors.push({ path: 'name', code: 'isPlainText' });
    if (creating || 'host' in input) if (!HOST.test(String(input.host ?? ''))) errors.push({ path: 'host', code: 'isHostName' });
    if (creating || 'port' in input) if (!(Number.isInteger(input.port) && input.port >= 1 && input.port <= 65535)) errors.push({ path: 'port', code: 'isInt' });
    if (creating || 'tlsMode' in input) if (!['implicit', 'starttls', 'none'].includes(input.tlsMode)) errors.push({ path: 'tlsMode', code: 'isIn' });
    if (creating || 'fromAddress' in input) if (!MAIL.test(String(input.fromAddress ?? ''))) errors.push({ path: 'fromAddress', code: 'isMailAddress' });
    if (creating || 'fromName' in input) if (!String(input.fromName ?? '').trim()) errors.push({ path: 'fromName', code: 'isPlainText' });
    if (input.sendRatePerMinute !== undefined && !(Number.isInteger(input.sendRatePerMinute) && input.sendRatePerMinute >= 1 && input.sendRatePerMinute <= 600)) errors.push({ path: 'sendRatePerMinute', code: input.sendRatePerMinute < 1 ? 'min' : 'max' });
    if (errors.length > 0) refuse(400, 'validation_failed', errors);
  };
  // A target on this network is refused, as confera_be refuses it on `prod` (the stub always does, so the screen's answer can be tested).
  const checkTarget = (host) => {
    if (PRIVATE.test(host)) refuse(422, 'address_not_allowed', [{ path: 'host', code: 'address_not_allowed' }]);
  };
  const unmark = (except, isDefault, isFallback) => {
    for (const server of state.mailServers) {
      if (server.id === except) continue;
      if (isDefault) server.isDefault = false;
      if (isFallback) server.isFallback = false;
    }
  };
  if (path === '/api/v1/mail-servers' && method === 'GET') {
    need('mail_servers.read');
    return { status: 200, body: { items: [...state.mailServers].sort((a, b) => a.name.localeCompare(b.name)).map(serverDto) } };
  }
  if (path === '/api/v1/mail-servers' && method === 'POST') {
    need('mail_servers.manage');
    fresh();
    checkServer(body, true);
    checkTarget(String(body.host).toLowerCase());
    const server = { id: id('0e2e5000-0000'), name: String(body.name).trim(), host: String(body.host).toLowerCase(), port: body.port, tlsMode: body.tlsMode, username: body.username ?? null, credentialSet: typeof body.password === 'string', credentialSetAt: typeof body.password === 'string' ? now() : null, fromAddress: body.fromAddress, fromName: String(body.fromName).trim(), isDefault: body.isDefault ?? false, isFallback: body.isFallback ?? false, enabled: body.enabled ?? true, sendRatePerMinute: body.sendRatePerMinute ?? 60, version: 1, password: typeof body.password === 'string' ? body.password : null };
    if (server.isDefault || server.isFallback) unmark(server.id, server.isDefault, server.isFallback);
    state.mailServers.push(server);
    record(me.id, 'mail_server.created', 'mail_server', server.id, { fields: ['name', 'host', 'port', 'tlsMode', ...(server.credentialSet ? ['password'] : [])] });
    return { status: 201, body: serverDto(server) };
  }
  const serverRoute = /^\/api\/v1\/mail-servers\/([^/]+)(?:\/(test-message))?$/.exec(path);
  if (serverRoute) {
    need('mail_servers.read');
    const server = state.mailServers.find((s) => s.id === serverRoute[1]);
    if (!server) refuse(404, 'not_found');
    if (!serverRoute[2] && method === 'GET') return { status: 200, body: serverDto(server) };
    need('mail_servers.manage');
    if (serverRoute[2] === 'test-message' && method === 'POST') {
      if (!MAIL.test(String(body.to ?? ''))) refuse(400, 'validation_failed', [{ path: 'to', code: 'isMailAddress' }]);
      // A host of the reserved `.invalid` domain never answers: the attempt fails.
      const result = server.host.endsWith('.invalid') ? 'failed' : 'sent';
      state.mailLog.unshift({ id: id('0e2e1000-0000'), messageId: id('0e2e1100-0000'), recipient: body.to, kind: 'test_message', language: body.language ?? 'en', conferenceId: null, mailServerId: server.id, serverName: server.name, attempt: 1, result, errorCode: result === 'failed' ? 'connection_failed' : null, sentAt: now(), subject: state.organisation.mailLogContent === false ? null : `Test message from ${state.organisation.name}`, bodyHtml: state.organisation.mailLogContent === false ? null : `<p>This is a test message sent through ${server.name}.</p>`, bodyText: state.organisation.mailLogContent === false ? null : `This is a test message sent through ${server.name}.\n` });
      record(me.id, 'mail_server.tested', 'mail_server', server.id, { detail: { result } });
      return { status: 200, body: { result, reason: null } };
    }
    fresh();
    if (!serverRoute[2] && method === 'PATCH') {
      versionOf(body.version, server);
      checkServer(body, false);
      const next = { host: body.host === undefined ? server.host : String(body.host).toLowerCase(), port: body.port ?? server.port, username: body.username === undefined ? server.username : body.username, tlsMode: body.tlsMode ?? server.tlsMode };
      checkTarget(next.host);
      const targetChanged = ['host', 'port', 'username', 'tlsMode'].some((key) => next[key] !== server[key]);
      const fields = [];
      for (const key of ['name', 'fromAddress', 'fromName', 'isDefault', 'isFallback', 'enabled', 'sendRatePerMinute']) {
        if (key in body && body[key] !== server[key]) {
          fields.push(key);
          server[key] = key === 'name' || key === 'fromName' ? String(body[key]).trim() : body[key];
        }
      }
      for (const key of ['host', 'port', 'username', 'tlsMode']) if (next[key] !== server[key]) fields.push(key);
      Object.assign(server, next);
      if (typeof body.password === 'string') {
        server.password = body.password;
        server.credentialSet = true;
        server.credentialSetAt = now();
        fields.push('password');
      } else if (body.password === null || (targetChanged && server.credentialSet)) {
        // A new target without a new password: the old one is not sent there (ST-20).
        if (server.credentialSet) fields.push('password');
        server.password = null;
        server.credentialSet = false;
        server.credentialSetAt = null;
      }
      if (body.isDefault === true || body.isFallback === true) unmark(server.id, body.isDefault === true, body.isFallback === true);
      server.version += 1;
      record(me.id, 'mail_server.updated', 'mail_server', server.id, { fields });
      return { status: 200, body: serverDto(server) };
    }
    if (!serverRoute[2] && method === 'DELETE') {
      if (state.conferences.some((c) => c.mailServerId === server.id) || state.templates.some((t) => t.mailServerId === server.id)) refuse(409, 'mail_server_in_use');
      versionOf(Number(url.searchParams.get('version')), server);
      state.mailServers = state.mailServers.filter((s) => s.id !== server.id);
      record(me.id, 'mail_server.deleted', 'mail_server', server.id, { changes: { name: { old: server.name, new: null } } });
      return { status: 204 };
    }
  }

  // ---- mail log -----------------------------------------------------------------------------
  if (path === '/api/v1/mail-log' && method === 'GET') {
    need('mail_log.read');
    const q = url.searchParams;
    const page = Number(q.get('page') ?? 1);
    const pageSize = Number(q.get('pageSize') ?? 25);
    const all = state.mailLog
      .filter((e) => (!q.get('kind') || e.kind === q.get('kind')) && (!q.get('result') || e.result === q.get('result')) && (!q.get('conferenceId') || e.conferenceId === q.get('conferenceId')) && (!q.get('messageId') || e.messageId === q.get('messageId')))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    const summary = (entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => !['subject', 'bodyHtml', 'bodyText'].includes(key)));
    return { status: 200, body: { items: all.slice((page - 1) * pageSize, page * pageSize).map(summary), total: all.length, page, pageSize } };
  }
  const logRoute = /^\/api\/v1\/mail-log\/([^/]+)$/.exec(path);
  if (logRoute && method === 'GET') {
    need('mail_log.read');
    const entry = state.mailLog.find((e) => e.id === logRoute[1]);
    if (!entry) refuse(404, 'not_found');
    return { status: 200, body: entry };
  }

  // ---- templates ----------------------------------------------------------------------------
  if (path === '/api/v1/mail-templates/catalogue' && method === 'GET') {
    need('templates.read');
    return { status: 200, body: STUB_PART_B.catalogue };
  }
  if (path === '/api/v1/mail-templates' && method === 'GET') {
    need('templates.read');
    const q = url.searchParams;
    const conferenceId = q.get('conferenceId');
    const items = state.templates
      .filter((t) => (conferenceId ? t.conferenceId === conferenceId : t.conferenceId === null) && (!q.get('type') || t.type === q.get('type')) && (!q.get('language') || t.language === q.get('language')))
      .sort((a, b) => a.type.localeCompare(b.type) || a.language.localeCompare(b.language));
    return { status: 200, body: { items } };
  }
  const templateRoute = /^\/api\/v1\/mail-templates\/([^/]+)$/.exec(path);
  if (templateRoute && method === 'GET') {
    need('templates.read');
    const template = state.templates.find((t) => t.id === templateRoute[1]);
    if (!template) refuse(404, 'not_found');
    return { status: 200, body: template };
  }
  return undefined;
}
