// The stand-in for confera_be's admin API of 0.2.0, for the browser tests (ADR-24); part B (conferences,
// mail servers, the mail log, templates) is in api-stub-part-b.mjs.
//
// It follows the rules of the API that the web application depends on, as the vendored
// contract and confera_be's own tests describe them: the surface from the Host header, the
// `__Host-` session cookie set at sign-in, the CSRF value in GET /session and the
// `X-CSRF-Token` header on every changing request, an exact Origin, the password asked again
// (5 minutes), the one error format with its codes (`sign_in_failed`, `last_admin`,
// `version_conflict`, `email_taken`, `password_refused` with the rule codes, `link_invalid`),
// the versions of records, and the audit entries. Links are fixed tokens of the fixture, so a
// test can open the page of an invitation without a mailbox; `POST /__stub/reset` restores the
// fixture. Nothing of this is part of the application.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { freshPartB, handlePartB } from './api-stub-part-b.mjs';
import { freshPartC, handlePartC } from './api-stub-part-c.mjs';
import { handlePartD } from './api-stub-part-d.mjs';
import { STUB } from './stub-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contractDir = join(root, 'packages', 'api-client', 'openapi');
const version = JSON.parse(readFileSync(join(contractDir, 'openapi.json'), 'utf8')).info.version;
const rules = JSON.parse(readFileSync(join(contractDir, 'password-rules.json'), 'utf8'));
const COMMON = new Set(rules.lines.find((line) => line.id === 'not_common').common);

const ADMIN_ORIGIN = 'http://localhost:3000';
export const SESSION_COOKIE = '__Host-confera_session';
const DEVICE_COOKIE = '__Host-confera_device';
const CONFIRMATION_MS = 5 * 60 * 1000;
const PERMISSIONS = {
  admin: ['account.manage', 'users.read', 'users.manage', 'organisation.read', 'organisation.manage', 'audit.read', 'mail_servers.read', 'mail_servers.manage', 'conferences.read', 'conferences.manage', 'templates.read', 'mail_log.read', 'forms.read', 'forms.manage', 'submissions.read', 'held_mail.manage', 'submissions.manage', 'templates.manage', 'mail_log.manage'],
  reviewer: ['account.manage'],
};

const sha = (text) => createHash('sha256').update(text).digest('hex');
const now = () => new Date().toISOString();
let counter = 0;
const id = (prefix) => `${prefix}-${String(++counter).padStart(4, '0')}-4000-8000-${String(Date.now()).slice(-12)}`;

/**
 * The state of one universe: the fixture, as it is at the start and after a reset. Every
 * worker of a run gets a universe of its own, keyed by its User-Agent (the engine's string with
 * the worker's slot, e2e/support/fixtures.ts), so the workers can change users and settings at
 * the same time without seeing each other; the tests of one serial spec share one.
 */
let state;
const universes = new Map();
function fresh() {
  const next = {
    organisation: { ...STUB.organisation },
    users: STUB.users.map((user) => ({ ...user })),
    sessions: new Map(), // token -> { userId, csrf, confirmedUntil, idleExpiresAt, absoluteExpiresAt }
    links: STUB.links.map((link) => ({ ...link, used: false })),
    audit: [],
    resets: [],
    emailChanges: [],
    ...freshPartB(),
    ...freshPartC(),
  };
  state = next;
  record(null, 'organisation.updated', 'organisation', next.organisation.id, { fields: ['name'] });
  return next;
}
const universeKey = (req) => String(req.headers['user-agent'] ?? '');
export function reset(req) {
  counter = 100;
  universes.set(universeKey(req), fresh());
}
function enter(req) {
  const key = universeKey(req);
  if (!universes.has(key)) universes.set(key, fresh());
  state = universes.get(key);
}

function record(actorUserId, action, subjectType, subjectId, extra = {}) {
  const actor = actorUserId ? state.users.find((u) => u.id === actorUserId) : null;
  state.audit.unshift({
    id: id('a0e2'),
    occurredAt: now(),
    actor: actor ? { id: actor.id, displayName: actor.displayName } : null,
    action,
    subjectType,
    subjectId,
    fields: extra.fields ?? [],
    changes: extra.changes ?? {},
    detail: extra.detail ?? {},
    traceId: sha(`${action}${counter}`).slice(0, 16),
  });
}

/** The password rule set, as far as the browser tests need it: length, the common list, match. */
function passwordProblems(password, repeat) {
  const problems = [];
  const length = [...password.normalize('NFC')].length;
  if (length < 12 || length > 128) problems.push('password_length');
  const normal = password.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (normal === '' || COMMON.has(normal) || COMMON.has(normal.replace(/^\p{N}+|\p{N}+$/gu, ''))) problems.push('password_common');
  if (password !== repeat) problems.push('password_mismatch');
  return problems;
}

// An invitation waits for a mail server that is switched on, and is sent once one exists (UXUI-M2-01).
// A new or resent invitation is `queued` for its first two seconds, as the API's outbox has it (UXUI-M2-42).
const invitationDelivery = (user) => {
  if (user.status !== 'invited') return null;
  if (!(state.mailServers ?? []).some((server) => server.enabled)) return 'waiting_for_server';
  return user.invitedAt && Date.now() - user.invitedAt < 2000 ? 'queued' : 'sent';
};
const userDto = (user) => ({ id: user.id, email: user.email, displayName: user.displayName, role: user.role, status: user.status, createdAt: user.createdAt, version: user.version, invitationDelivery: invitationDelivery(user) });
const organisationDto = () => {
  // The retention is read and set on its own route (GET/PUT /api/v1/mail-log/retention), not in the profile.
  const rest = { ...state.organisation };
  delete rest.mailLogRetentionDays;
  return rest;
};

function cookieValue(req, name) {
  const header = req.headers.cookie ?? '';
  const values = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  return values.length === 1 ? values[0] : null;
}
const setCookie = (name, value, maxAge) => `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

function sessionDto(session) {
  const user = state.users.find((u) => u.id === session.userId);
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, roles: [user.role], permissions: PERMISSIONS[user.role] },
    organisation: { id: state.organisation.id, name: state.organisation.name },
    csrf: session.csrf,
    idleExpiresAt: session.idleExpiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    confirmationValidUntil: session.confirmedUntil && Date.parse(session.confirmedUntil) > Date.now() ? session.confirmedUntil : null,
    secondFactor: 'not_required',
  };
}

/** The bytes of a request, for an upload (an email image, 0.4.0): at most `limit`, else null. */
function readBytes(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on('end', () => resolve(size > limit ? null : Buffer.concat(chunks)));
  });
}

function readJson(req) {
  return new Promise((resolve) => {
    let text = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (text += chunk));
    req.on('end', () => {
      try {
        resolve(text === '' ? {} : JSON.parse(text));
      } catch {
        resolve(null);
      }
    });
  });
}

class Refusal extends Error {
  constructor(status, code, errors) {
    super(code);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}
const refuse = (status, code, errors) => {
  throw new Refusal(status, code, errors);
};

/** The handler of one request of the admin API. Returns { status, body?, headers? }. */
export async function handleAdmin(req, url) {
  const method = req.method ?? 'GET';
  const path = url.pathname;
  const changing = method !== 'GET' && method !== 'HEAD';
  const publicRoute = /^\/api\/v1\/(meta|session$|password-resets|invitations\/|email-changes\/)/.test(path) && !(path === '/api/v1/session' && method !== 'POST');

  if (path === '/api/v1/meta' && method === 'GET') return { status: 200, body: { name: 'confera-api', version, instance: null } };
  enter(req);
  if (path === '/__stub/reset' && method === 'POST') {
    reset(req);
    return { status: 204 };
  }

  // 1. A changing request needs an exact Origin.
  if (changing && req.headers.origin !== ADMIN_ORIGIN) refuse(403, 'origin_refused');
  // An email image is the one upload of the admin API (0.4.0): its bytes, not JSON.
  const upload = path === '/api/v1/mail-images' && method === 'POST';
  const raw = upload ? await readBytes(req, 6 * 1024 * 1024) : null;
  const body = changing && !upload ? await readJson(req) : {};
  if (body === null) refuse(400, 'bad_request');
  if (upload && raw === null) refuse(413, 'image_too_large');

  // ---- public routes ----------------------------------------------------------------------
  if (path === '/api/v1/session' && method === 'POST') {
    const user = state.users.find((u) => u.email.toLowerCase() === String(body.email ?? '').trim().toLowerCase());
    if (!user || user.status !== 'active' || user.password !== body.password) {
      record(user?.id ?? null, 'session.sign_in_failed', 'user', user?.id ?? null);
      refuse(401, 'sign_in_failed');
    }
    const token = sha(`session:${user.id}:${Date.now()}:${counter++}`).slice(0, 43);
    const session = { userId: user.id, csrf: sha(`csrf:${token}`).slice(0, 43), confirmedUntil: null, idleExpiresAt: new Date(Date.now() + 24 * 3600e3).toISOString(), absoluteExpiresAt: new Date(Date.now() + 7 * 24 * 3600e3).toISOString() };
    state.sessions.set(token, session);
    record(user.id, 'session.signed_in', 'user', user.id);
    const headers = [setCookie(SESSION_COOKIE, token, 7 * 24 * 3600)];
    if (cookieValue(req, DEVICE_COOKIE) === null) headers.push(setCookie(DEVICE_COOKIE, sha(`device:${token}`).slice(0, 43), 365 * 24 * 3600));
    return { status: 200, body: sessionDto(session), headers: { 'set-cookie': headers } };
  }
  if (path === '/api/v1/password-resets' && method === 'POST') {
    const user = state.users.find((u) => u.email.toLowerCase() === String(body.email ?? '').trim().toLowerCase());
    state.resets.push(String(body.email ?? ''));
    if (user?.status === 'active') record(null, 'password_reset.requested', 'user', user.id);
    return { status: 202 };
  }
  const link = /^\/api\/v1\/(invitations|password-resets|email-changes)\/([^/]+)$/.exec(path);
  if (link) {
    const purpose = { invitations: 'invitation', 'password-resets': 'password_reset', 'email-changes': 'email_change' }[link[1]];
    const found = state.links.find((l) => l.token === link[2] && l.purpose === purpose && !l.used && Date.parse(l.expiresAt) > Date.now());
    if (!found) refuse(404, 'link_invalid');
    const user = state.users.find((u) => u.id === found.userId);
    if (method === 'GET') {
      if (purpose === 'email_change') return { status: 200, body: { newEmail: found.recipient, expiresAt: found.expiresAt } };
      return { status: 200, body: { email: user.email, displayName: user.displayName, organisationName: state.organisation.name, expiresAt: found.expiresAt } };
    }
    if (method === 'POST') {
      if (purpose === 'email_change') {
        if (state.users.some((u) => u.id !== user.id && u.email === found.recipient)) refuse(409, 'email_taken');
        found.used = true;
        record(user.id, 'account.email_changed', 'user', user.id, { fields: ['email'], changes: { email: { old: user.email, new: found.recipient } } });
        user.email = found.recipient;
        user.version += 1;
        for (const [token, session] of state.sessions) if (session.userId === user.id) state.sessions.delete(token);
        return { status: 204 };
      }
      const allowed = purpose === 'invitation' ? user.status === 'invited' : user.status === 'active';
      if (!allowed) refuse(404, 'link_invalid');
      const problems = passwordProblems(String(body.password ?? ''), String(body.passwordRepeat ?? ''));
      if (problems.length > 0) refuse(400, 'password_refused', problems.map((code) => ({ path: 'password', code })));
      found.used = true;
      user.password = body.password;
      user.status = 'active';
      user.version += 1;
      if (purpose === 'password_reset') for (const [token, session] of state.sessions) if (session.userId === user.id) state.sessions.delete(token);
      record(user.id, purpose === 'invitation' ? 'invitation.accepted' : 'password_reset.completed', 'user', user.id);
      return { status: 204 };
    }
  }
  if (publicRoute) refuse(404, 'not_found');

  // ---- a session ------------------------------------------------------------------------------
  const token = cookieValue(req, SESSION_COOKIE);
  const session = token ? state.sessions.get(token) : undefined;
  if (!session) refuse(401, 'unauthenticated');
  if (changing && req.headers['x-csrf-token'] !== session.csrf) refuse(403, 'csrf_refused');
  const me = state.users.find((u) => u.id === session.userId);
  const permissions = PERMISSIONS[me.role];
  const need = (permission) => {
    if (!permissions.includes(permission)) refuse(403, 'forbidden');
  };
  const fresh = () => {
    if (!session.confirmedUntil || Date.parse(session.confirmedUntil) <= Date.now()) refuse(403, 'password_confirmation_required');
  };
  const versionOf = (given, record) => {
    if (typeof given !== 'number' || given < 1) refuse(400, 'validation_failed', [{ path: 'version', code: 'isInt' }]);
    if (given !== record.version) refuse(409, 'version_conflict');
  };

  if (path === '/api/v1/session' && method === 'GET') return { status: 200, body: sessionDto(session) };
  if (path === '/api/v1/session' && method === 'DELETE') {
    state.sessions.delete(token);
    record(me.id, 'session.signed_out', 'user', me.id);
    return { status: 204, headers: { 'set-cookie': [setCookie(SESSION_COOKIE, '', 0)] } };
  }
  if (path === '/api/v1/sessions' && method === 'DELETE') {
    for (const [t, s] of state.sessions) if (s.userId === me.id) state.sessions.delete(t);
    record(me.id, 'session.signed_out_everywhere', 'user', me.id);
    return { status: 204, headers: { 'set-cookie': [setCookie(SESSION_COOKIE, '', 0)] } };
  }
  if (path === '/api/v1/session/password-confirmation' && method === 'POST') {
    if (body.password !== me.password) refuse(403, 'password_incorrect');
    session.confirmedUntil = new Date(Date.now() + CONFIRMATION_MS).toISOString();
    return { status: 200, body: { confirmationValidUntil: session.confirmedUntil } };
  }
  if (path === '/api/v1/account/password' && method === 'POST') {
    if (body.currentPassword !== me.password) refuse(403, 'password_incorrect');
    const problems = passwordProblems(String(body.newPassword ?? ''), String(body.newPasswordRepeat ?? ''));
    if (problems.length > 0) refuse(400, 'password_refused', problems.map((code) => ({ path: 'newPassword', code })));
    me.password = body.newPassword;
    me.version += 1;
    for (const [t, s] of state.sessions) if (s.userId === me.id && t !== token) state.sessions.delete(t);
    record(me.id, 'account.password_changed', 'user', me.id);
    return { status: 204 };
  }
  if (path === '/api/v1/account/email' && method === 'POST') {
    if (body.password !== me.password) refuse(403, 'password_incorrect');
    const email = String(body.newEmail ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) refuse(400, 'validation_failed', [{ path: 'newEmail', code: 'isMailAddress' }]);
    if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) refuse(409, 'email_taken');
    state.emailChanges.push(email);
    state.links.push({ token: STUB.emailChangeToken, purpose: 'email_change', userId: me.id, recipient: email, expiresAt: new Date(Date.now() + 30 * 60e3).toISOString(), used: false });
    record(me.id, 'account.email_change_requested', 'user', me.id, { fields: ['email'], changes: { email: { old: me.email, new: email } } });
    return { status: 202 };
  }

  // ---- users ----------------------------------------------------------------------------------
  if (path === '/api/v1/users' && method === 'GET') {
    need('users.read');
    const q = url.searchParams;
    const search = (q.get('search') ?? '').trim().toLowerCase();
    const status = q.get('status');
    const role = q.get('role');
    const page = Number(q.get('page') ?? 1);
    const pageSize = Number(q.get('pageSize') ?? 25);
    const all = state.users.filter((u) => (status ? u.status === status : u.status !== 'removed') && (!role || u.role === role) && (!search || u.displayName.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)));
    all.sort((a, b) => a.displayName.localeCompare(b.displayName, 'sr'));
    return { status: 200, body: { items: all.slice((page - 1) * pageSize, page * pageSize).map(userDto), total: all.length, page, pageSize } };
  }
  if (path === '/api/v1/users' && method === 'POST') {
    need('users.manage');
    fresh();
    const errors = [];
    const email = String(body.email ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ path: 'email', code: 'isMailAddress' });
    if (!String(body.displayName ?? '').trim()) errors.push({ path: 'displayName', code: 'isPlainText' });
    if (!['admin', 'reviewer'].includes(body.role)) errors.push({ path: 'role', code: 'isIn' });
    if (errors.length > 0) refuse(400, 'validation_failed', errors);
    if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) refuse(409, 'email_taken');
    const user = { id: id('0e2e0000-0000'), email, displayName: String(body.displayName).trim(), role: body.role, status: 'invited', createdAt: now(), version: 1, password: null, invitedAt: Date.now() };
    state.users.push(user);
    state.links.push({ token: `${STUB.newInvitationTokenPrefix}${user.id}`, purpose: 'invitation', userId: user.id, recipient: email, expiresAt: new Date(Date.now() + 72 * 3600e3).toISOString(), used: false });
    record(me.id, 'user.invited', 'user', user.id, { fields: ['email', 'displayName', 'role'] });
    return { status: 201, body: userDto(user) };
  }
  const userRoute = /^\/api\/v1\/users\/([^/]+)(?:\/(deactivation|reactivation|role|invitation|sessions))?$/.exec(path);
  if (userRoute) {
    need('users.read');
    const user = state.users.find((u) => u.id === userRoute[1]);
    if (!user) refuse(404, 'not_found');
    const sub = userRoute[2];
    if (!sub && method === 'GET') return { status: 200, body: userDto(user) };
    need('users.manage');
    fresh();
    const lastAdmin = () => user.role === 'admin' && user.status === 'active' && !state.users.some((u) => u.id !== user.id && u.role === 'admin' && u.status === 'active');
    const endSessions = () => {
      for (const [t, s] of state.sessions) if (s.userId === user.id) state.sessions.delete(t);
    };
    if (!sub && method === 'PATCH') {
      versionOf(body.version, user);
      if (!String(body.displayName ?? '').trim()) refuse(400, 'validation_failed', [{ path: 'displayName', code: 'isPlainText' }]);
      record(me.id, 'user.updated', 'user', user.id, { fields: ['displayName'] });
      user.displayName = String(body.displayName).trim();
      user.version += 1;
      return { status: 200, body: userDto(user) };
    }
    if (!sub && method === 'DELETE') {
      // The removal names the version it is made on, as a query parameter: without it confera_be
      // answers 400 validation_failed (E2-16; RemoveUserQueryDto), and so does the stub.
      const given = url.searchParams.get('version');
      if (given === null || !/^[1-9]\d*$/.test(given)) refuse(400, 'validation_failed', [{ path: 'version', code: 'isInt' }]);
      versionOf(Number(given), user);
      if (lastAdmin()) refuse(409, 'last_admin');
      user.status = 'removed';
      user.version += 1;
      endSessions();
      record(me.id, 'user.removed', 'user', user.id);
      return { status: 204 };
    }
    if (sub === 'role' && method === 'PUT') {
      versionOf(body.version, user);
      if (!['admin', 'reviewer'].includes(body.role)) refuse(400, 'validation_failed', [{ path: 'role', code: 'isIn' }]);
      if (body.role !== 'admin' && lastAdmin()) refuse(409, 'last_admin');
      record(me.id, 'user.role_changed', 'user', user.id, { fields: ['role'], changes: { role: { old: user.role, new: body.role } } });
      user.role = body.role;
      user.version += 1;
      endSessions();
      return { status: 200, body: userDto(user) };
    }
    if (sub === 'deactivation' && method === 'POST') {
      versionOf(body.version, user);
      if (lastAdmin()) refuse(409, 'last_admin');
      user.status = 'deactivated';
      user.version += 1;
      endSessions();
      record(me.id, 'user.deactivated', 'user', user.id);
      return { status: 200, body: userDto(user) };
    }
    if (sub === 'reactivation' && method === 'POST') {
      versionOf(body.version, user);
      if (user.status !== 'deactivated') refuse(409, 'not_deactivated');
      user.status = 'active';
      user.version += 1;
      record(me.id, 'user.reactivated', 'user', user.id);
      return { status: 200, body: userDto(user) };
    }
    if (sub === 'invitation' && method === 'POST') {
      if (user.status !== 'invited') refuse(409, 'not_invited');
      for (const l of state.links) if (l.userId === user.id && l.purpose === 'invitation') l.used = true;
      state.links.push({ token: `${STUB.newInvitationTokenPrefix}${user.id}`, purpose: 'invitation', userId: user.id, recipient: user.email, expiresAt: new Date(Date.now() + 72 * 3600e3).toISOString(), used: false });
      user.invitedAt = Date.now();
      record(me.id, 'invitation.queued', 'user', user.id);
      return { status: 202, body: userDto(user) };
    }
    if (sub === 'sessions' && method === 'DELETE') {
      endSessions();
      record(me.id, 'user.sessions_ended', 'user', user.id);
      return { status: 204 };
    }
  }

  // ---- organisation ---------------------------------------------------------------------------
  if (path === '/api/v1/organisation' && method === 'GET') {
    need('organisation.read');
    return { status: 200, body: organisationDto() };
  }
  if (path === '/api/v1/organisation' && method === 'PATCH') {
    need('organisation.manage');
    versionOf(body.version, state.organisation);
    const errors = [];
    if (body.registrationNumber != null && !/^\d{8}$/.test(body.registrationNumber)) errors.push({ path: 'registrationNumber', code: 'isRegistrationNumber' });
    if (body.taxNumber != null && !/^\d{9}$/.test(body.taxNumber)) errors.push({ path: 'taxNumber', code: 'isTaxNumber' });
    if (body.contactEmail != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail)) errors.push({ path: 'contactEmail', code: 'isMailAddress' });
    if (errors.length > 0) refuse(400, 'validation_failed', errors);
    const fields = [];
    for (const key of ['name', 'legalName', 'address', 'registrationNumber', 'taxNumber', 'contactEmail', 'vatNoteSr', 'vatNoteEn', 'mailLogContent']) {
      if (key in body && body[key] !== state.organisation[key]) {
        fields.push(key);
        state.organisation[key] = body[key];
      }
    }
    state.organisation.version += 1;
    record(me.id, 'organisation.updated', 'organisation', state.organisation.id, { fields });
    return { status: 200, body: organisationDto() };
  }
  if (path === '/api/v1/organisation/payment-details' && method === 'PUT') {
    need('organisation.manage');
    fresh();
    versionOf(body.version, state.organisation);
    const errors = [];
    if (body.eurIban != null && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(String(body.eurIban).replace(/\s/g, ''))) errors.push({ path: 'eurIban', code: 'isIban' });
    if (body.eurSwift != null && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(body.eurSwift)) errors.push({ path: 'eurSwift', code: 'isBic' });
    if (body.rsdAccount != null && !/^\d{3}-\d{1,13}-\d{2}$/.test(body.rsdAccount)) errors.push({ path: 'rsdAccount', code: 'isSerbianAccount' });
    if (errors.length > 0) refuse(400, 'validation_failed', errors);
    const fields = [];
    for (const key of ['rsdAccount', 'eurIban', 'eurSwift', 'eurBankName', 'paypalPayee']) {
      if (body[key] !== state.organisation[key]) fields.push(key);
      state.organisation[key] = body[key] ?? null;
    }
    state.organisation.version += 1;
    state.organisation.paymentDetailsChangedAt = now();
    state.organisation.paymentDetailsChangedBy = { id: me.id, displayName: me.displayName };
    record(me.id, 'organisation.payment_details_changed', 'organisation', state.organisation.id, { fields });
    return { status: 200, body: organisationDto() };
  }

  // ---- audit ----------------------------------------------------------------------------------
  if (path === '/api/v1/audit' && method === 'GET') {
    need('audit.read');
    const q = url.searchParams;
    const action = q.get('action');
    const from = q.get('from') ? Date.parse(q.get('from')) : null;
    const to = q.get('to') ? Date.parse(q.get('to')) : null;
    const page = Number(q.get('page') ?? 1);
    const pageSize = Number(q.get('pageSize') ?? 25);
    const all = state.audit.filter((e) => (!action || e.action === action) && (from === null || Date.parse(e.occurredAt) >= from) && (to === null || Date.parse(e.occurredAt) < to));
    return { status: 200, body: { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize } };
  }

  const partD = handlePartD({ state, me, req, method, path, url, body, raw, need, versionOf, refuse, record, now });
  if (partD) return partD;
  const partB = handlePartB({ state, me, method, path, url, body, need, fresh, versionOf, refuse, record, id, now });
  if (partB) return partB;
  const partC = handlePartC({ state, me, method, path, url, body, need, versionOf, refuse, record });
  if (partC) return partC;

  refuse(404, 'not_found');
}

/** Answers one request of either surface, as the API would; the caller has checked the host. */
export async function answer(req, res, url) {
  try {
    const result = await handleAdmin(req, url);
    const headers = { 'cache-control': 'no-store', 'x-trace-id': sha(String(counter++)).slice(0, 16), ...(result.headers ?? {}) };
    // A file of a submission: an attachment with its name kept, as confera_be sends it (ADR-10, FR-FILE-03).
    if (result.raw) return res.writeHead(result.status, { ...headers, 'content-type': result.raw.type, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.raw.name)}`, 'x-content-type-options': 'nosniff' }).end(result.raw.bytes);
    if (result.body === undefined) return res.writeHead(result.status, headers).end();
    return res.writeHead(result.status, { ...headers, 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(result.body));
  } catch (error) {
    if (error instanceof Refusal) {
      const body = { type: 'about:blank', status: error.status, code: error.code, traceId: sha(String(counter++)).slice(0, 16), ...(error.errors ? { errors: error.errors } : {}) };
      return res.writeHead(error.status, { 'content-type': 'application/problem+json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
    }
    console.error('api stub', error);
    return res.writeHead(500, { 'content-type': 'application/problem+json' }).end(JSON.stringify({ code: 'internal_error', traceId: 'stub' }));
  }
}
