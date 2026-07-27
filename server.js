require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret-before-online';
const SESSION_TTL = process.env.SESSION_TTL || '8h';
const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'America/Fortaleza';
const PASSWORD_ROUNDS = Number(process.env.PASSWORD_ROUNDS || 12);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const PANEL_TOKEN = process.env.PANEL_TOKEN || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const ADMIN_RECOVERY_CODE = process.env.ADMIN_RECOVERY_CODE || '';
const BACKUP_FORMAT = 'cob-advogados-backup';
const BACKUP_VERSION = 1;
const SUPERADMIN_USERNAMES = (process.env.SUPERADMIN_USERNAMES || 'admin')
  .split(',')
  .map(username => normalizeUsername(username))
  .filter(Boolean);
const AUTO_BACKUP_ENABLED = process.env.AUTO_BACKUP_ENABLED !== 'false';
const AUTO_BACKUP_INTERVAL_HOURS = Math.max(1, Number(process.env.AUTO_BACKUP_INTERVAL_HOURS || 24));
const AUTO_BACKUP_RETAIN = Math.max(1, Number(process.env.AUTO_BACKUP_RETAIN || 14));

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(DATA_DIR, 'database.json');
const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(DATA_DIR, 'backups');

if (JWT_SECRET === 'dev-only-change-this-secret-before-online') {
  console.warn('[Seguranca] Defina JWT_SECRET antes de publicar o sistema online.');
}

function normalizeOrigin(origin) {
  if (!origin) return '';

  try {
    return new URL(origin).origin.toLowerCase();
  } catch (err) {
    return origin.trim().replace(/\/+$/, '').toLowerCase();
  }
}

const allowedOrigins = new Set(
  [
    ...ALLOWED_ORIGIN.split(','),
    process.env.RENDER_EXTERNAL_URL
  ]
    .map(origin => normalizeOrigin(origin))
    .filter(Boolean)
);

function corsOrigin(origin, callback) {
  if (ALLOWED_ORIGIN === '*' || !origin || allowedOrigins.has(normalizeOrigin(origin))) {
    return callback(null, true);
  }
  return callback(new Error('Origem nao permitida pelo CORS.'));
}

const corsConfig = {
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
};

const io = new Server(server, { cors: corsConfig });
const pgPool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
    })
  : null;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function legacyHashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function hashPassword(password) {
  return bcrypt.hashSync(password, PASSWORD_ROUNDS);
}

function verifyUserPassword(user, password) {
  if (!user || !user.passwordHash || !password) return false;

  if (user.passwordHash.startsWith('$2')) {
    return bcrypt.compareSync(password, user.passwordHash);
  }

  const validLegacyPassword = user.passwordHash === legacyHashPassword(password);
  if (validLegacyPassword) {
    user.passwordHash = hashPassword(password);
    saveData(db, { users: [user] });
  }

  return validLegacyPassword;
}

function makeDefaultData() {
  const defaultHash = hashPassword('123456');

  return {
    lawyers: [
      { id: '1', name: 'Dr. Carlos Eduardo', room: 'Sala 01', specialty: 'Direito Civil & Familia', username: 'dr.carlos' },
      { id: '2', name: 'Dra. Ana Paula', room: 'Sala 02', specialty: 'Direito Trabalhista', username: 'dra.ana' },
      { id: '3', name: 'Dr. Roberto Silva', room: 'Sala 03', specialty: 'Direito Penal & Empresarial', username: 'dr.roberto' }
    ],
    users: [
      {
        id: 'u_admin',
        username: 'admin',
        passwordHash: defaultHash,
        name: 'Administrador do Sistema',
        role: 'admin',
        jobTitle: 'Administrador',
        mustChangePassword: true
      },
      {
        id: 'u_recepcao',
        username: 'recepcao',
        passwordHash: defaultHash,
        name: 'Recepcionista',
        role: 'recepcao',
        jobTitle: 'Recepcao',
        mustChangePassword: true
      },
      {
        id: 'u_contadora',
        username: 'contadora',
        passwordHash: defaultHash,
        name: 'Contadora',
        role: 'contadora',
        jobTitle: 'Contadora',
        mustChangePassword: true
      },
      {
        id: 'u_gerente',
        username: 'gerente',
        passwordHash: defaultHash,
        name: 'Gerente',
        role: 'gerente',
        jobTitle: 'Gerente',
        mustChangePassword: true
      },
      {
        id: 'u_carlos',
        username: 'dr.carlos',
        passwordHash: defaultHash,
        name: 'Dr. Carlos Eduardo',
        role: 'advogado',
        lawyerId: '1',
        jobTitle: 'Advogado',
        mustChangePassword: true
      },
      {
        id: 'u_ana',
        username: 'dra.ana',
        passwordHash: defaultHash,
        name: 'Dra. Ana Paula',
        role: 'advogado',
        lawyerId: '2',
        jobTitle: 'Advogada',
        mustChangePassword: true
      },
      {
        id: 'u_roberto',
        username: 'dr.roberto',
        passwordHash: defaultHash,
        name: 'Dr. Roberto Silva',
        role: 'advogado',
        lawyerId: '3',
        jobTitle: 'Advogado',
        mustChangePassword: true
      }
    ],
    appointments: [],
    paymentRequests: [],
    appointmentHistory: [],
    auditLogs: []
  };
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function defaultJobTitleForRole(role) {
  if (role === 'admin') return 'Administrador';
  if (role === 'recepcao') return 'Recepcao';
  if (role === 'advogado') return 'Advogado';
  if (role === 'contadora') return 'Contadora';
  if (role === 'gerente') return 'Gerente';
  return 'Usuario';
}

function normalizeData(data, defaults = makeDefaultData()) {
  if (!data || typeof data !== 'object') data = {};

  if (!Array.isArray(data.lawyers)) data.lawyers = defaults.lawyers;
  if (!Array.isArray(data.users)) data.users = defaults.users;
  if (!Array.isArray(data.appointments)) data.appointments = [];
  if (!Array.isArray(data.paymentRequests)) data.paymentRequests = [];
  if (!Array.isArray(data.appointmentHistory)) data.appointmentHistory = [];
  if (!Array.isArray(data.auditLogs)) data.auditLogs = [];

  data.users.forEach(user => {
    if (!user.jobTitle) user.jobTitle = defaultJobTitleForRole(user.role);
  });

  if (data.lawyers.length === 0) data.lawyers = defaults.lawyers;

  defaults.users.forEach(defaultUser => {
    const exists = data.users.some(user => normalizeUsername(user.username) === normalizeUsername(defaultUser.username));
    if (!exists) data.users.push(defaultUser);
  });

  return data;
}

function loadJsonData() {
  const defaults = makeDefaultData();

  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const data = JSON.parse(raw);
      return normalizeData(data, defaults);
    }
  } catch (err) {
    console.error('Erro ao ler banco de dados JSON:', err);
  }

  saveJsonData(defaults);
  return defaults;
}

function saveJsonData(data) {
  try {
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('Erro ao salvar banco de dados JSON:', err);
  }
}

function jsonParam(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function dateParam(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function dateString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function mapLawyerRow(row) {
  return {
    id: row.id,
    name: row.name || '',
    room: row.room || '',
    specialty: row.specialty || '',
    username: row.username || ''
  };
}

function mapUserRow(row) {
  return {
    id: row.id,
    username: row.username || '',
    passwordHash: row.password_hash || '',
    name: row.name || '',
    role: row.role || '',
    jobTitle: row.job_title || '',
    lawyerId: row.lawyer_id || null,
    mustChangePassword: Boolean(row.must_change_password)
  };
}

function mapAppointmentRow(row) {
  return {
    id: row.id,
    clientName: row.client_name || '',
    clientPhone: row.client_phone || '',
    notes: row.notes || '',
    lawyerId: row.lawyer_id || '',
    lawyerName: row.lawyer_name || '',
    lawyerRoom: row.lawyer_room || '',
    scheduledDate: dateString(row.scheduled_date),
    scheduledTime: row.scheduled_time || '',
    status: row.status || 'aguardando',
    receptionRequests: row.reception_requests || null,
    updatedBy: row.updated_by || null,
    createdAt: isoString(row.created_at),
    updatedAt: isoString(row.updated_at),
    calledAt: isoString(row.called_at),
    startedAt: isoString(row.started_at),
    finishedAt: isoString(row.finished_at),
    cancelledAt: isoString(row.cancelled_at)
  };
}

function mapPaymentRequestRow(row) {
  return {
    id: row.id,
    processNumber: row.process_number || '',
    clientName: row.client_name || '',
    notes: row.notes || '',
    status: row.status || 'solicitada',
    lawyerId: row.lawyer_id || '',
    lawyerName: row.lawyer_name || '',
    requestedBy: row.requested_by || null,
    requestedAt: isoString(row.requested_at),
    guideText: row.guide_text || '',
    guideLink: row.guide_link || '',
    guideAmount: row.guide_amount || '',
    guideDueDate: dateString(row.guide_due_date),
    guideGeneratedBy: row.guide_generated_by || null,
    guideGeneratedAt: isoString(row.guide_generated_at),
    paymentReceiptText: row.payment_receipt_text || '',
    paymentReceiptLink: row.payment_receipt_link || '',
    paidBy: row.paid_by || null,
    paidAt: isoString(row.paid_at),
    updatedAt: isoString(row.updated_at)
  };
}

function mapHistoryRow(row) {
  return {
    id: row.id,
    appointmentId: row.appointment_id || null,
    type: row.type || '',
    createdAt: isoString(row.created_at),
    actor: row.actor || null,
    appointment: row.appointment || null,
    details: row.details || {}
  };
}

function mapAuditRow(row) {
  return {
    id: row.id,
    action: row.action || '',
    createdAt: isoString(row.created_at),
    actor: row.actor || null,
    details: row.details || {},
    request: row.request || {}
  };
}

async function ensurePostgresSchema() {
  if (!pgPool) return;

  await pgPool.query(`
    create table if not exists lawyers (
      id text primary key,
      name text not null,
      room text not null,
      specialty text,
      username text unique,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists users (
      id text primary key,
      username text not null unique,
      password_hash text not null,
      name text not null,
      role text not null check (role in ('admin', 'recepcao', 'advogado', 'contadora', 'gerente')),
      job_title text,
      lawyer_id text references lawyers(id) on delete set null,
      must_change_password boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists appointments (
      id text primary key,
      client_name text not null,
      client_phone text,
      notes text,
      lawyer_id text,
      lawyer_name text,
      lawyer_room text,
      scheduled_date date,
      scheduled_time text,
      status text not null default 'aguardando',
      reception_requests jsonb,
      updated_by jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      called_at timestamptz,
      started_at timestamptz,
      finished_at timestamptz,
      cancelled_at timestamptz
    );

    create table if not exists appointment_history (
      id text primary key,
      appointment_id text,
      type text not null,
      created_at timestamptz not null,
      actor jsonb,
      appointment jsonb,
      details jsonb
    );

    create table if not exists payment_requests (
      id text primary key,
      process_number text not null,
      client_name text,
      notes text,
      status text not null default 'solicitada',
      lawyer_id text,
      lawyer_name text,
      requested_by jsonb,
      requested_at timestamptz not null,
      guide_text text,
      guide_link text,
      guide_amount text,
      guide_due_date date,
      guide_generated_by jsonb,
      guide_generated_at timestamptz,
      payment_receipt_text text,
      payment_receipt_link text,
      paid_by jsonb,
      paid_at timestamptz,
      updated_at timestamptz
    );

    create table if not exists audit_logs (
      id text primary key,
      action text not null,
      created_at timestamptz not null,
      actor jsonb,
      details jsonb,
      request jsonb
    );

    create index if not exists appointments_lawyer_date_idx on appointments (lawyer_id, scheduled_date, scheduled_time);
    create index if not exists appointments_status_idx on appointments (status);
    create index if not exists appointment_history_created_idx on appointment_history (created_at desc);
    create index if not exists payment_requests_status_idx on payment_requests (status, requested_at desc);
    create index if not exists payment_requests_lawyer_idx on payment_requests (lawyer_id, requested_at desc);
    create index if not exists audit_logs_created_idx on audit_logs (created_at desc);
    create unique index if not exists appointments_no_double_booking_idx
      on appointments (lawyer_id, scheduled_date, scheduled_time)
      where status <> 'cancelado' and lawyer_id is not null and scheduled_date is not null and scheduled_time is not null;

    alter table appointments add column if not exists updated_by jsonb;
    alter table appointments drop constraint if exists appointments_lawyer_id_fkey;
    alter table users add column if not exists job_title text;
    alter table users drop constraint if exists users_role_check;
    alter table users add constraint users_role_check check (role in ('admin', 'recepcao', 'advogado', 'contadora', 'gerente'));
  `);
}

async function loadPostgresData() {
  const defaults = makeDefaultData();
  await ensurePostgresSchema();

  const [
    lawyersResult,
    usersResult,
    appointmentsResult,
    paymentRequestsResult,
    historyResult,
    auditResult
  ] = await Promise.all([
    pgPool.query('select * from lawyers order by name asc'),
    pgPool.query('select * from users order by role asc, name asc'),
    pgPool.query('select * from appointments order by created_at desc nulls last, scheduled_date desc nulls last, scheduled_time desc nulls last'),
    pgPool.query('select * from payment_requests order by requested_at desc'),
    pgPool.query('select * from appointment_history order by created_at desc'),
    pgPool.query('select * from audit_logs order by created_at desc limit 2000')
  ]);

  const normalized = normalizeData({
    lawyers: lawyersResult.rows.map(mapLawyerRow),
    users: usersResult.rows.map(mapUserRow),
    appointments: appointmentsResult.rows.map(mapAppointmentRow),
    paymentRequests: paymentRequestsResult.rows.map(mapPaymentRequestRow),
    appointmentHistory: historyResult.rows.map(mapHistoryRow),
    auditLogs: auditResult.rows.map(mapAuditRow)
  }, defaults);

  const existingLawyerIds = new Set(lawyersResult.rows.map(row => String(row.id)));
  const existingUsernames = new Set(usersResult.rows.map(row => normalizeUsername(row.username)));
  const missingLawyers = normalized.lawyers.filter(lawyer => !existingLawyerIds.has(String(lawyer.id)));
  const missingUsers = normalized.users.filter(user => !existingUsernames.has(normalizeUsername(user.username)));

  if (missingLawyers.length > 0 || missingUsers.length > 0) {
    await applyPostgresChanges({ lawyers: missingLawyers, users: missingUsers });
  }

  return normalized;
}

async function upsertLawyer(client, lawyer) {
  await client.query(
    `
      insert into lawyers (id, name, room, specialty, username, updated_at)
      values ($1, $2, $3, $4, $5, now())
      on conflict (id) do update set
        name = excluded.name,
        room = excluded.room,
        specialty = excluded.specialty,
        username = excluded.username,
        updated_at = now()
    `,
    [
      String(lawyer.id),
      String(lawyer.name || ''),
      String(lawyer.room || ''),
      lawyer.specialty || null,
      lawyer.username || null
    ]
  );
}

async function upsertUser(client, user) {
  await client.query(
    `
      insert into users (id, username, password_hash, name, role, job_title, lawyer_id, must_change_password, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, now())
      on conflict (id) do update set
        username = excluded.username,
        password_hash = excluded.password_hash,
        name = excluded.name,
        role = excluded.role,
        job_title = excluded.job_title,
        lawyer_id = excluded.lawyer_id,
        must_change_password = excluded.must_change_password,
        updated_at = now()
    `,
    [
      String(user.id),
      String(user.username || ''),
      String(user.passwordHash || ''),
      String(user.name || ''),
      String(user.role || 'recepcao'),
      user.jobTitle || null,
      user.lawyerId || null,
      Boolean(user.mustChangePassword)
    ]
  );
}

async function upsertAppointment(client, appointment) {
  await client.query(
    `
      insert into appointments (
        id, client_name, client_phone, notes, lawyer_id, lawyer_name, lawyer_room,
        scheduled_date, scheduled_time, status, reception_requests, updated_by,
        created_at, updated_at, called_at, started_at, finished_at, cancelled_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11::jsonb, $12::jsonb,
        $13, $14, $15, $16, $17, $18
      )
      on conflict (id) do update set
        client_name = excluded.client_name,
        client_phone = excluded.client_phone,
        notes = excluded.notes,
        lawyer_id = excluded.lawyer_id,
        lawyer_name = excluded.lawyer_name,
        lawyer_room = excluded.lawyer_room,
        scheduled_date = excluded.scheduled_date,
        scheduled_time = excluded.scheduled_time,
        status = excluded.status,
        reception_requests = excluded.reception_requests,
        updated_by = excluded.updated_by,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        called_at = excluded.called_at,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        cancelled_at = excluded.cancelled_at
    `,
    [
      String(appointment.id),
      String(appointment.clientName || ''),
      appointment.clientPhone || null,
      appointment.notes || null,
      appointment.lawyerId || null,
      appointment.lawyerName || null,
      appointment.lawyerRoom || null,
      appointment.scheduledDate || null,
      appointment.scheduledTime || null,
      appointment.status || 'aguardando',
      jsonParam(appointment.receptionRequests),
      jsonParam(appointment.updatedBy),
      dateParam(appointment.createdAt),
      dateParam(appointment.updatedAt),
      dateParam(appointment.calledAt),
      dateParam(appointment.startedAt),
      dateParam(appointment.finishedAt),
      dateParam(appointment.cancelledAt)
    ]
  );
}

async function upsertPaymentRequest(client, request) {
  await client.query(
    `
      insert into payment_requests (
        id, process_number, client_name, notes, status, lawyer_id, lawyer_name,
        requested_by, requested_at, guide_text, guide_link, guide_amount, guide_due_date,
        guide_generated_by, guide_generated_at, payment_receipt_text, payment_receipt_link,
        paid_by, paid_at, updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7,
        $8::jsonb, $9, $10, $11, $12, $13,
        $14::jsonb, $15, $16, $17,
        $18::jsonb, $19, $20
      )
      on conflict (id) do update set
        process_number = excluded.process_number,
        client_name = excluded.client_name,
        notes = excluded.notes,
        status = excluded.status,
        lawyer_id = excluded.lawyer_id,
        lawyer_name = excluded.lawyer_name,
        requested_by = excluded.requested_by,
        requested_at = excluded.requested_at,
        guide_text = excluded.guide_text,
        guide_link = excluded.guide_link,
        guide_amount = excluded.guide_amount,
        guide_due_date = excluded.guide_due_date,
        guide_generated_by = excluded.guide_generated_by,
        guide_generated_at = excluded.guide_generated_at,
        payment_receipt_text = excluded.payment_receipt_text,
        payment_receipt_link = excluded.payment_receipt_link,
        paid_by = excluded.paid_by,
        paid_at = excluded.paid_at,
        updated_at = excluded.updated_at
    `,
    [
      String(request.id),
      String(request.processNumber || ''),
      request.clientName || null,
      request.notes || null,
      request.status || 'solicitada',
      request.lawyerId || null,
      request.lawyerName || null,
      jsonParam(request.requestedBy),
      dateParam(request.requestedAt) || new Date(),
      request.guideText || null,
      request.guideLink || null,
      request.guideAmount || null,
      request.guideDueDate || null,
      jsonParam(request.guideGeneratedBy),
      dateParam(request.guideGeneratedAt),
      request.paymentReceiptText || null,
      request.paymentReceiptLink || null,
      jsonParam(request.paidBy),
      dateParam(request.paidAt),
      dateParam(request.updatedAt)
    ]
  );
}

async function insertHistoryEvent(client, event) {
  await client.query(
    `
      insert into appointment_history (id, appointment_id, type, created_at, actor, appointment, details)
      values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
      on conflict (id) do nothing
    `,
    [
      String(event.id),
      event.appointmentId || null,
      String(event.type || ''),
      dateParam(event.createdAt) || new Date(),
      jsonParam(event.actor),
      jsonParam(event.appointment),
      jsonParam(event.details || {})
    ]
  );
}

async function insertAuditLog(client, log) {
  await client.query(
    `
      insert into audit_logs (id, action, created_at, actor, details, request)
      values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
      on conflict (id) do nothing
    `,
    [
      String(log.id),
      String(log.action || ''),
      dateParam(log.createdAt) || new Date(),
      jsonParam(log.actor),
      jsonParam(log.details || {}),
      jsonParam(log.request || {})
    ]
  );
}

async function applyPostgresChanges(changes = {}) {
  if (!pgPool) return;

  const client = await pgPool.connect();

  try {
    await client.query('begin');

    const deletedUserIds = changes.deletedUserIds || [];
    const deletedLawyerIds = changes.deletedLawyerIds || [];
    if (deletedUserIds.length > 0) {
      await client.query('delete from users where id = any($1::text[])', [deletedUserIds.map(String)]);
    }
    if (deletedLawyerIds.length > 0) {
      await client.query('delete from lawyers where id = any($1::text[])', [deletedLawyerIds.map(String)]);
    }

    for (const lawyer of changes.lawyers || []) await upsertLawyer(client, lawyer);
    for (const user of changes.users || []) await upsertUser(client, user);
    for (const update of changes.appointmentLawyerUpdates || []) {
      await client.query(
        'update appointments set lawyer_name = $2, lawyer_room = $3 where lawyer_id = $1',
        [String(update.lawyerId), update.lawyerName || null, update.lawyerRoom || null]
      );
    }
    for (const appointment of changes.appointments || []) await upsertAppointment(client, appointment);
    for (const request of changes.paymentRequests || []) await upsertPaymentRequest(client, request);
    for (const event of changes.appointmentHistory || []) await insertHistoryEvent(client, event);
    for (const log of changes.auditLogs || []) await insertAuditLog(client, log);

    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

async function replacePostgresData(data) {
  if (!pgPool) return;

  await ensurePostgresSchema();

  const client = await pgPool.connect();
  const normalized = normalizeData(cloneJson(data));

  try {
    // Substituicao integral reservada a restauracao explicita de backup.
    await client.query('begin');
    await client.query('delete from appointment_history');
    await client.query('delete from audit_logs');
    await client.query('delete from payment_requests');
    await client.query('delete from appointments');
    await client.query('delete from users');
    await client.query('delete from lawyers');

    for (const lawyer of normalized.lawyers) await upsertLawyer(client, lawyer);
    for (const user of normalized.users) await upsertUser(client, user);
    for (const appointment of normalized.appointments) await upsertAppointment(client, appointment);
    for (const request of normalized.paymentRequests) await upsertPaymentRequest(client, request);
    for (const event of normalized.appointmentHistory) await insertHistoryEvent(client, event);
    for (const log of normalized.auditLogs) await insertAuditLog(client, log);

    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

async function loadData() {
  if (!pgPool) return loadJsonData();

  try {
    return await loadPostgresData();
  } catch (err) {
    console.error('Erro ao conectar no PostgreSQL/Supabase:', err);
    throw err;
  }
}

let postgresWriteQueue = Promise.resolve();

function queuePostgresOperation(operation) {
  const queuedOperation = postgresWriteQueue.then(operation);

  postgresWriteQueue = queuedOperation.catch(err => {
    console.error('Erro ao salvar alteracoes no PostgreSQL/Supabase:', err);
  });

  return queuedOperation;
}

function queuePostgresChanges(changes) {
  const snapshot = cloneJson(changes || {});
  return queuePostgresOperation(() => applyPostgresChanges(snapshot));
}

function queuePostgresReplacement(data) {
  const snapshot = cloneJson(data);
  return queuePostgresOperation(() => replacePostgresData(snapshot));
}

function saveData(data, changes) {
  if (!pgPool) {
    saveJsonData(data);
    return Promise.resolve();
  }

  if (!changes) {
    const error = new Error('Alteracoes incrementais nao informadas para a persistencia PostgreSQL.');
    console.error(error.message);
    return Promise.reject(error);
  }

  return queuePostgresChanges(changes);
}

let db = makeDefaultData();

function getBusinessDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getUserById(userId) {
  return db.users.find(user => user.id === userId);
}

function getActorFromSession(session) {
  if (!session) return { userId: null, username: 'sistema', name: 'Sistema', role: 'system' };

  return {
    userId: session.userId || null,
    username: session.username || '',
    name: session.name || session.username || 'Usuario',
    role: session.role || ''
  };
}

function getAppointmentSnapshot(appointment) {
  if (!appointment) return null;

  return {
    id: appointment.id,
    clientName: appointment.clientName || '',
    clientPhone: appointment.clientPhone || '',
    lawyerId: appointment.lawyerId || '',
    lawyerName: appointment.lawyerName || '',
    lawyerRoom: appointment.lawyerRoom || '',
    scheduledDate: appointment.scheduledDate || '',
    scheduledTime: appointment.scheduledTime || '',
    status: appointment.status || '',
    notes: appointment.notes || ''
  };
}

function getPaymentRequestSnapshot(request, session = null) {
  if (!request) return null;

  const snapshot = {
    id: request.id,
    processNumber: request.processNumber || '',
    clientName: request.clientName || '',
    notes: request.notes || '',
    status: request.status || 'solicitada',
    lawyerId: request.lawyerId || '',
    lawyerName: request.lawyerName || '',
    requestedBy: request.requestedBy || null,
    requestedAt: request.requestedAt || null,
    guideText: request.guideText || '',
    guideLink: request.guideLink || '',
    guideAmount: request.guideAmount || '',
    guideDueDate: request.guideDueDate || '',
    guideGeneratedBy: request.guideGeneratedBy || null,
    guideGeneratedAt: request.guideGeneratedAt || null,
    updatedAt: request.updatedAt || null
  };

  if (!session || session.role !== 'contadora') {
    snapshot.paymentReceiptText = request.paymentReceiptText || '';
    snapshot.paymentReceiptLink = request.paymentReceiptLink || '';
    snapshot.paidBy = request.paidBy || null;
    snapshot.paidAt = request.paidAt || null;
  }

  return snapshot;
}

function visiblePaymentRequestsForSession(session) {
  if (!session) return [];
  const source = Array.isArray(db.paymentRequests) ? db.paymentRequests : [];
  let visible = [];

  if (session.role === 'advogado') {
    visible = source.filter(item => item.lawyerId === session.lawyerId);
  } else if (['admin', 'contadora', 'gerente'].includes(session.role)) {
    visible = source;
  }

  return visible
    .map(item => getPaymentRequestSnapshot(item, session))
    .sort((a, b) => new Date(b.updatedAt || b.requestedAt || 0) - new Date(a.updatedAt || a.requestedAt || 0));
}

function emitPaymentRequestsUpdated() {
  io.sockets.sockets.forEach(socket => {
    if (socket.data.session) {
      socket.emit('payment_requests_updated', visiblePaymentRequestsForSession(socket.data.session));
    }
  });
}

function addHistoryEvent(type, appointment, session, details = {}) {
  if (!Array.isArray(db.appointmentHistory)) db.appointmentHistory = [];

  const event = {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    appointmentId: appointment && appointment.id ? appointment.id : null,
    type,
    createdAt: new Date().toISOString(),
    actor: getActorFromSession(session),
    appointment: getAppointmentSnapshot(appointment),
    details
  };

  db.appointmentHistory.unshift(event);
  return event;
}

function redactSensitiveDetails(value) {
  if (!value || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map(item => redactSensitiveDetails(item));

  const redacted = {};
  Object.keys(value).forEach(key => {
    const lowered = key.toLowerCase();
    if (lowered.includes('password') || lowered.includes('token') || lowered.includes('secret') || lowered.includes('hash')) {
      redacted[key] = '[redacted]';
      return;
    }

    redacted[key] = redactSensitiveDetails(value[key]);
  });

  return redacted;
}

function getRequestMeta(req) {
  if (!req) return {};

  return {
    ip: req.ip || req.socket?.remoteAddress || '',
    userAgent: String(req.headers['user-agent'] || '').slice(0, 220)
  };
}

function addAuditLog(action, session, details = {}, req = null) {
  if (!Array.isArray(db.auditLogs)) db.auditLogs = [];

  const event = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    action,
    createdAt: new Date().toISOString(),
    actor: getActorFromSession(session),
    details: redactSensitiveDetails(details),
    request: getRequestMeta(req)
  };

  db.auditLogs.unshift(event);
  db.auditLogs = db.auditLogs.slice(0, 2000);
  return event;
}

function isSuperAdminSession(session) {
  if (!session || session.role !== 'admin') return false;
  if (SUPERADMIN_USERNAMES.length === 0) return true;
  return SUPERADMIN_USERNAMES.includes(normalizeUsername(session.username));
}

function getSessionForUser(user) {
  const lawyer = user.lawyerId ? db.lawyers.find(item => item.id === user.lawyerId) : null;

  const session = {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    jobTitle: user.jobTitle || defaultJobTitleForRole(user.role),
    isSuperAdmin: user.role === 'admin' && SUPERADMIN_USERNAMES.includes(normalizeUsername(user.username)),
    lawyerId: user.lawyerId || null,
    lawyerName: lawyer ? lawyer.name : null,
    lawyerRoom: lawyer ? lawyer.room : null
  };

  session.token = jwt.sign(
    { sub: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: SESSION_TTL }
  );

  return session;
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return req.headers['x-session-token'] || '';
}

function verifyToken(token) {
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserById(payload.sub);
    if (!user) return null;
    return getSessionForUser(user);
  } catch (err) {
    return null;
  }
}

function authenticate(req, res, next) {
  const session = verifyToken(getTokenFromRequest(req));
  if (!session) {
    return res.status(401).json({ error: 'Sessao invalida ou expirada. Faca login novamente.' });
  }

  req.session = session;
  next();
}

function requireRole(...roles) {
  return [
    authenticate,
    (req, res, next) => {
      if (!roles.includes(req.session.role)) {
        return res.status(403).json({ error: 'Voce nao tem permissao para esta acao.' });
      }
      next();
    }
  ];
}

function requireCriticalAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem executar esta acao.' });
  }

  next();
}

function visibleAppointmentsForSession(session) {
  if (!session) return [];
  if (session.role === 'advogado') {
    return db.appointments.filter(item => item.lawyerId === session.lawyerId);
  }
  return db.appointments;
}

function emitQueueUpdated() {
  io.sockets.sockets.forEach(socket => {
    if (socket.data.session) {
      socket.emit('queue_updated', visibleAppointmentsForSession(socket.data.session));
    }
  });
}

function emitLawyersUpdated() {
  io.sockets.sockets.forEach(socket => {
    if (socket.data.session) {
      socket.emit('lawyers_updated', db.lawyers);
    }
  });
}

function getSocketToken(socket) {
  const authToken = socket.handshake.auth && socket.handshake.auth.token;
  const authHeader = socket.handshake.headers.authorization || '';
  if (authToken) return authToken;
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return '';
}

function requireSocketRole(socket, roles) {
  const session = socket.data.session;
  if (!session) {
    socket.emit('auth_error', 'Sessao invalida ou expirada. Faca login novamente.');
    return null;
  }

  if (!roles.includes(session.role)) {
    socket.emit('auth_error', 'Voce nao tem permissao para esta acao.');
    return null;
  }

  return session;
}

function canManageAppointment(session, appointment) {
  if (!session || !appointment) return false;
  if (session.role === 'admin' || session.role === 'recepcao') return true;
  return session.role === 'advogado' && appointment.lawyerId === session.lawyerId;
}

function normalizeReceptionRequests(requests) {
  const source = requests && typeof requests === 'object' ? requests : {};
  const normalized = {
    reschedule: Boolean(source.reschedule),
    copies: Boolean(source.copies),
    signature: Boolean(source.signature),
    documents: Boolean(source.documents),
    note: String(source.note || '').trim().slice(0, 600)
  };

  const hasRequest =
    normalized.reschedule ||
    normalized.copies ||
    normalized.signature ||
    normalized.documents ||
    normalized.note;

  return hasRequest ? normalized : null;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getCollectionItemKey(collection, item) {
  if (!item || typeof item !== 'object') return '';
  if (item.id) return `id:${String(item.id)}`;

  if (collection === 'users' && item.username) {
    return `username:${normalizeUsername(item.username)}`;
  }

  if (collection === 'lawyers') {
    const username = normalizeUsername(item.username);
    if (username) return `username:${username}`;
    return `profile:${String(item.name || '').trim().toLowerCase()}|${String(item.room || '').trim().toLowerCase()}`;
  }

  if (collection === 'appointments') {
    return [
      'appointment',
      String(item.clientName || '').trim().toLowerCase(),
      String(item.clientPhone || '').trim(),
      String(item.lawyerId || item.lawyerName || '').trim().toLowerCase(),
      String(item.scheduledDate || '').trim(),
      String(item.scheduledTime || '').trim(),
      String(item.createdAt || '').trim()
    ].join('|');
  }

  if (collection === 'paymentRequests') {
    return item.id
      ? `id:${String(item.id)}`
      : [
          'payment_request',
          String(item.processNumber || '').trim().toLowerCase(),
          String(item.lawyerId || '').trim(),
          String(item.requestedAt || '').trim()
        ].join('|');
  }

  if (collection === 'appointmentHistory') {
    return [
      'history',
      String(item.type || '').trim(),
      String(item.appointmentId || '').trim(),
      String(item.createdAt || '').trim()
    ].join('|');
  }

  if (collection === 'auditLogs') {
    return [
      'audit',
      String(item.action || '').trim(),
      String(item.createdAt || '').trim(),
      String(item.actor?.userId || item.actor?.username || '').trim()
    ].join('|');
  }

  return JSON.stringify(item);
}

function getAlternateCollectionKeys(collection, item) {
  const keys = [];

  if (!item || typeof item !== 'object') return keys;

  if ((collection === 'users' || collection === 'lawyers') && item.username) {
    keys.push(`username:${normalizeUsername(item.username)}`);
  }

  if (collection === 'lawyers') {
    const profileKey = `profile:${String(item.name || '').trim().toLowerCase()}|${String(item.room || '').trim().toLowerCase()}`;
    keys.push(profileKey);
  }

  if (
    collection === 'appointments' &&
    item.status !== 'cancelado' &&
    item.lawyerId &&
    item.scheduledDate &&
    item.scheduledTime
  ) {
    keys.push(`slot:${String(item.lawyerId)}|${String(item.scheduledDate)}|${String(item.scheduledTime)}`);
  }

  if (collection === 'paymentRequests' && item.processNumber && item.lawyerId && item.requestedAt) {
    keys.push(`request:${String(item.processNumber).trim().toLowerCase()}|${String(item.lawyerId)}|${String(item.requestedAt)}`);
  }

  return keys.filter(Boolean);
}

function dedupeCollection(collection, items) {
  const seen = new Set();
  const cleanItems = [];

  (Array.isArray(items) ? items : []).forEach(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;

    const cleanItem = cloneJson(item);
    const key = getCollectionItemKey(collection, cleanItem);
    const alternateKeys = getAlternateCollectionKeys(collection, cleanItem);
    const allKeys = [key, ...alternateKeys].filter(Boolean);

    if (allKeys.some(itemKey => seen.has(itemKey))) return;

    cleanItems.push(cleanItem);
    allKeys.forEach(itemKey => seen.add(itemKey));
  });

  return cleanItems;
}

function makeBackupPayload() {
  const data = {
    lawyers: dedupeCollection('lawyers', db.lawyers),
    users: dedupeCollection('users', db.users),
    appointments: dedupeCollection('appointments', db.appointments),
    paymentRequests: dedupeCollection('paymentRequests', db.paymentRequests),
    appointmentHistory: dedupeCollection('appointmentHistory', db.appointmentHistory),
    auditLogs: dedupeCollection('auditLogs', db.auditLogs)
  };

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    storage: pgPool ? 'postgres' : 'json',
    counts: {
      lawyers: data.lawyers.length,
      users: data.users.length,
      appointments: data.appointments.length,
      paymentRequests: data.paymentRequests.length,
      appointmentHistory: data.appointmentHistory.length,
      auditLogs: data.auditLogs.length
    },
    data
  };
}

function readBackupData(payload) {
  const source = payload && payload.backup ? payload.backup : payload;
  const data = source && source.data ? source.data : source;

  if (!data || typeof data !== 'object') {
    throw new Error('Arquivo de backup invalido.');
  }

  return {
    lawyers: dedupeCollection('lawyers', data.lawyers),
    users: dedupeCollection('users', data.users),
    appointments: dedupeCollection('appointments', data.appointments),
    paymentRequests: dedupeCollection('paymentRequests', data.paymentRequests),
    appointmentHistory: dedupeCollection('appointmentHistory', data.appointmentHistory),
    auditLogs: dedupeCollection('auditLogs', data.auditLogs)
  };
}

function getExistingCollectionKeys(collection) {
  const existingKeys = new Set();
  const currentItems = Array.isArray(db[collection]) ? db[collection] : [];

  currentItems.forEach(item => {
    const keys = [
      getCollectionItemKey(collection, item),
      ...getAlternateCollectionKeys(collection, item)
    ].filter(Boolean);
    keys.forEach(key => existingKeys.add(key));
  });

  return existingKeys;
}

function summarizeCollectionMerge(collection, importedItems) {
  const existingKeys = getExistingCollectionKeys(collection);
  const stats = { added: 0, skipped: 0 };

  importedItems.forEach(item => {
    const keys = [
      getCollectionItemKey(collection, item),
      ...getAlternateCollectionKeys(collection, item)
    ].filter(Boolean);

    if (keys.length === 0 || keys.some(key => existingKeys.has(key))) {
      stats.skipped += 1;
      return;
    }

    keys.forEach(key => existingKeys.add(key));
    stats.added += 1;
  });

  return stats;
}

function mergeCollection(collection, importedItems) {
  if (!Array.isArray(db[collection])) db[collection] = [];

  const stats = summarizeCollectionMerge(collection, importedItems);
  const existingKeys = getExistingCollectionKeys(collection);

  importedItems.forEach(item => {
    const keys = [
      getCollectionItemKey(collection, item),
      ...getAlternateCollectionKeys(collection, item)
    ].filter(Boolean);

    if (keys.length === 0 || keys.some(key => existingKeys.has(key))) return;

    db[collection].push(cloneJson(item));
    keys.forEach(key => existingKeys.add(key));
  });

  return stats;
}

function summarizeBackupImport(backupData) {
  return {
    lawyers: summarizeCollectionMerge('lawyers', backupData.lawyers),
    users: summarizeCollectionMerge('users', backupData.users),
    appointments: summarizeCollectionMerge('appointments', backupData.appointments),
    paymentRequests: summarizeCollectionMerge('paymentRequests', backupData.paymentRequests),
    appointmentHistory: summarizeCollectionMerge('appointmentHistory', backupData.appointmentHistory),
    auditLogs: summarizeCollectionMerge('auditLogs', backupData.auditLogs)
  };
}

function getBackupCounts(backupData) {
  return {
    lawyers: backupData.lawyers.length,
    users: backupData.users.length,
    appointments: backupData.appointments.length,
    paymentRequests: backupData.paymentRequests.length,
    appointmentHistory: backupData.appointmentHistory.length,
    auditLogs: backupData.auditLogs.length
  };
}

let lastBackupResult = null;

function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(filename => filename.startsWith('backup_cob_advogados_') && filename.endsWith('.json'))
    .map(filename => ({
      filename,
      path: path.join(BACKUP_DIR, filename),
      mtimeMs: fs.statSync(path.join(BACKUP_DIR, filename)).mtimeMs
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  files.slice(AUTO_BACKUP_RETAIN).forEach(file => {
    try {
      fs.unlinkSync(file.path);
    } catch (err) {
      console.error('Erro ao remover backup antigo:', err);
    }
  });
}

function writeBackupFile(reason = 'manual') {
  const payload = makeBackupPayload();
  const stamp = payload.exportedAt.replace(/[:.]/g, '-');
  const filename = `backup_cob_advogados_${stamp}.json`;
  const target = path.join(BACKUP_DIR, filename);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
  pruneOldBackups();

  lastBackupResult = {
    success: true,
    reason,
    filename,
    path: target,
    createdAt: payload.exportedAt,
    counts: payload.counts
  };

  return lastBackupResult;
}

function runAutoBackup(reason = 'automatico') {
  if (!AUTO_BACKUP_ENABLED) return null;

  try {
    return writeBackupFile(reason);
  } catch (err) {
    lastBackupResult = {
      success: false,
      reason,
      error: err.message,
      createdAt: new Date().toISOString()
    };
    console.error('Erro ao criar backup automatico:', err);
    return lastBackupResult;
  }
}

function scheduleAutoBackups() {
  if (!AUTO_BACKUP_ENABLED) return;

  runAutoBackup('startup');
  const intervalMs = AUTO_BACKUP_INTERVAL_HOURS * 60 * 60 * 1000;
  setInterval(() => runAutoBackup('scheduled'), intervalMs);
}

async function replaceAllDataFromBackup(data) {
  if (pgPool) {
    await queuePostgresReplacement(data);
    return;
  }

  saveJsonData(data);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsConfig));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.' }
});

const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de recuperacao. Aguarde alguns minutos e tente novamente.' }
});

function safeCompareSecret(value, expected) {
  const valueBuffer = Buffer.from(String(value || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));

  if (valueBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

app.get('/api/health', async (req, res) => {
  const health = {
    ok: true,
    checkedAt: new Date().toISOString(),
    storage: pgPool ? 'postgres' : 'json',
    autoBackup: {
      enabled: AUTO_BACKUP_ENABLED,
      intervalHours: AUTO_BACKUP_INTERVAL_HOURS,
      retain: AUTO_BACKUP_RETAIN,
      last: lastBackupResult
    },
    counts: {
      lawyers: Array.isArray(db.lawyers) ? db.lawyers.length : 0,
      users: Array.isArray(db.users) ? db.users.length : 0,
      appointments: Array.isArray(db.appointments) ? db.appointments.length : 0,
      paymentRequests: Array.isArray(db.paymentRequests) ? db.paymentRequests.length : 0,
      appointmentHistory: Array.isArray(db.appointmentHistory) ? db.appointmentHistory.length : 0,
      auditLogs: Array.isArray(db.auditLogs) ? db.auditLogs.length : 0
    }
  };

  if (pgPool) {
    try {
      await pgPool.query('select 1');
      health.database = 'ok';
    } catch (err) {
      health.ok = false;
      health.database = 'error';
      health.error = 'Falha ao consultar o banco de dados.';
    }
  } else {
    health.database = fs.existsSync(DB_FILE) ? 'ok' : 'not_created_yet';
  }

  res.status(health.ok ? 200 : 503).json(health);
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario e senha sao obrigatorios.' });
  }

  const user = db.users.find(item => normalizeUsername(item.username) === normalizeUsername(username));
  if (!user || !verifyUserPassword(user, password)) {
    return res.status(401).json({ error: 'Usuario ou senha incorretos.' });
  }

  if (user.mustChangePassword) {
    return res.json({
      mustChangePassword: true,
      username: user.username,
      name: user.name,
      role: user.role,
      message: 'Primeiro acesso detectado. Por favor, cadastre sua nova senha.'
    });
  }

  res.json({
    success: true,
    mustChangePassword: false,
    session: getSessionForUser(user)
  });
});

app.post('/api/auth/recover-admin-password', recoveryLimiter, async (req, res) => {
  const { recoveryCode, temporaryPassword } = req.body;

  if (!ADMIN_RECOVERY_CODE) {
    return res.status(403).json({ error: 'Recuperacao de administrador nao configurada no servidor.' });
  }

  if (!recoveryCode || !temporaryPassword) {
    return res.status(400).json({ error: 'Codigo de recuperacao e senha temporaria sao obrigatorios.' });
  }

  if (temporaryPassword.length < 8) {
    return res.status(400).json({ error: 'A senha temporaria deve conter no minimo 8 caracteres.' });
  }

  if (!safeCompareSecret(recoveryCode, ADMIN_RECOVERY_CODE)) {
    return res.status(401).json({ error: 'Codigo de recuperacao invalido.' });
  }

  const admin = db.users.find(item => item.role === 'admin' && normalizeUsername(item.username) === 'admin');
  if (!admin) {
    return res.status(404).json({ error: 'Usuario administrador nao encontrado.' });
  }

  admin.passwordHash = hashPassword(temporaryPassword);
  admin.mustChangePassword = true;
  const auditLog = addAuditLog('auth.admin_password_recovered', {
    userId: admin.id,
    username: admin.username,
    name: admin.name,
    role: admin.role
  }, {
    targetUserId: admin.id,
    targetUsername: admin.username
  }, req);

  try {
    if (pgPool) {
      await queuePostgresChanges({ users: [admin], auditLogs: [auditLog] });
    } else {
      saveJsonData(db);
    }
  } catch (err) {
    console.error('Erro ao salvar recuperacao do administrador:', err);
    return res.status(500).json({ error: 'Erro ao salvar a nova senha temporaria.' });
  }

  res.json({
    success: true,
    username: admin.username,
    message: 'Senha temporaria do administrador redefinida. Faca login e cadastre uma nova senha.'
  });
});

app.post('/api/auth/change-password', authLimiter, (req, res) => {
  const { username, currentPassword, newPassword } = req.body;

  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Preencha todos os campos para alterar a senha.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'A nova senha deve conter no minimo 8 caracteres.' });
  }

  const user = db.users.find(item => normalizeUsername(item.username) === normalizeUsername(username));
  if (!user || !verifyUserPassword(user, currentPassword)) {
    return res.status(401).json({ error: 'Usuario ou senha atual incorretos.' });
  }

  user.passwordHash = hashPassword(newPassword);
  user.mustChangePassword = false;
  const auditLog = addAuditLog('auth.password_changed', {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  }, {
    targetUserId: user.id,
    targetUsername: user.username
  }, req);
  saveData(db, { users: [user], auditLogs: [auditLog] });

  res.json({
    success: true,
    message: 'Senha alterada com sucesso!',
    session: getSessionForUser(user)
  });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ session: req.session });
});

app.get('/api/history', requireRole('admin', 'recepcao'), (req, res) => {
  res.json({
    appointments: db.appointments,
    history: db.appointmentHistory || []
  });
});

app.get('/api/admin/backup', requireRole('admin'), requireCriticalAdmin, (req, res) => {
  const payload = makeBackupPayload();
  const date = payload.exportedAt.slice(0, 10);
  const filename = `backup_cob_advogados_${date}.json`;
  const auditLog = addAuditLog('backup.exported', req.session, { filename, counts: payload.counts }, req);
  saveData(db, { auditLogs: [auditLog] });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json(payload);
});

app.post('/api/admin/backup/preview', requireRole('admin'), requireCriticalAdmin, (req, res) => {
  let backupData;

  try {
    backupData = readBackupData(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Arquivo de backup invalido.' });
  }

  res.json({
    success: true,
    counts: getBackupCounts(backupData),
    summary: summarizeBackupImport(backupData)
  });
});

app.post('/api/admin/backup/restore', requireRole('admin'), requireCriticalAdmin, async (req, res) => {
  let backupData;

  try {
    backupData = readBackupData(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Arquivo de backup invalido.' });
  }

  const summary = {
    lawyers: mergeCollection('lawyers', backupData.lawyers),
    users: mergeCollection('users', backupData.users),
    appointments: mergeCollection('appointments', backupData.appointments),
    paymentRequests: mergeCollection('paymentRequests', backupData.paymentRequests),
    appointmentHistory: mergeCollection('appointmentHistory', backupData.appointmentHistory),
    auditLogs: mergeCollection('auditLogs', backupData.auditLogs)
  };

  db = normalizeData(db);
  addAuditLog('backup.restored', req.session, { summary, counts: getBackupCounts(backupData) }, req);

  try {
    await replaceAllDataFromBackup(db);
  } catch (err) {
    console.error('Erro ao restaurar backup:', err);
    return res.status(500).json({ error: 'Erro ao salvar os dados restaurados.' });
  }

  emitLawyersUpdated();
  emitQueueUpdated();

  res.json({
    success: true,
    message: 'Backup restaurado sem apagar os dados atuais.',
    summary
  });
});

app.get('/api/admin/audit-logs', requireRole('admin'), (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
  res.json({
    logs: (db.auditLogs || []).slice(0, limit)
  });
});

app.get('/api/admin/users', requireRole('admin'), (req, res) => {
  const usersClean = db.users.map(user => {
    const lawyer = user.lawyerId ? db.lawyers.find(item => item.id === user.lawyerId) : null;
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      jobTitle: user.jobTitle || defaultJobTitleForRole(user.role),
      lawyerId: user.lawyerId || null,
      room: lawyer ? lawyer.room : '',
      specialty: lawyer ? lawyer.specialty : '',
      mustChangePassword: user.mustChangePassword
    };
  });

  res.json(usersClean);
});

app.post('/api/admin/users', requireRole('admin'), (req, res) => {
  const { name, username, role, jobTitle, password } = req.body;
  const cleanName = String(name || '').trim();
  const cleanUsername = String(username || '').trim();
  const cleanRole = String(role || '').trim();
  const allowedRoles = new Set(['admin', 'recepcao', 'contadora', 'gerente']);

  if (!cleanName || !cleanUsername || !cleanRole) {
    return res.status(400).json({ error: 'Nome, usuario e perfil de acesso sao obrigatorios.' });
  }

  if (!allowedRoles.has(cleanRole)) {
    return res.status(400).json({ error: 'Perfil de acesso invalido para usuario sem cadastro de advogado.' });
  }

  const cleanPassword = password ? String(password).trim() : '';
  if (cleanPassword && cleanPassword.length < 8) {
    return res.status(400).json({ error: 'A senha inicial deve conter no minimo 8 caracteres.' });
  }

  const duplicate = db.users.find(item => normalizeUsername(item.username) === normalizeUsername(cleanUsername));
  if (duplicate) {
    return res.status(400).json({ error: `O nome de usuario "${cleanUsername}" ja esta em uso.` });
  }

  const userId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newUser = {
    id: userId,
    username: cleanUsername,
    passwordHash: hashPassword(cleanPassword || '12345678'),
    name: cleanName,
    role: cleanRole,
    jobTitle: String(jobTitle || '').trim() || defaultJobTitleForRole(cleanRole),
    lawyerId: null,
    mustChangePassword: true
  };

  db.users.push(newUser);
  const auditLog = addAuditLog('admin.user_created', req.session, {
    user: {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      role: newUser.role,
      jobTitle: newUser.jobTitle
    }
  }, req);
  saveData(db, { users: [newUser], auditLogs: [auditLog] });

  res.json({
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      role: newUser.role,
      jobTitle: newUser.jobTitle,
      mustChangePassword: newUser.mustChangePassword
    }
  });
});

app.put('/api/admin/users/:id', requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { name, username, room, specialty, jobTitle, password } = req.body;

  const user = db.users.find(item => item.id === id);
  if (!user) {
    return res.status(404).json({ error: 'Usuario nao encontrado.' });
  }

  if (username && normalizeUsername(username) !== normalizeUsername(user.username)) {
    const duplicate = db.users.find(item => item.id !== id && normalizeUsername(item.username) === normalizeUsername(username));
    if (duplicate) {
      return res.status(400).json({ error: `O nome de usuario "${username}" ja esta em uso.` });
    }
    user.username = username.trim();
  }

  if (name) user.name = name.trim();

  const cleanPassword = password ? password.trim() : '';
  if (cleanPassword && cleanPassword.length < 8) {
    return res.status(400).json({ error: 'A nova senha deve conter no minimo 8 caracteres.' });
  }

  const before = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    jobTitle: user.jobTitle || defaultJobTitleForRole(user.role),
    lawyerId: user.lawyerId || null,
    mustChangePassword: user.mustChangePassword
  };

  if (cleanPassword) {
    user.passwordHash = hashPassword(cleanPassword);
    user.mustChangePassword = false;
  }

  user.jobTitle = String(jobTitle || '').trim() || defaultJobTitleForRole(user.role);

  const changedLawyers = [];
  const appointmentLawyerUpdates = [];

  if (user.lawyerId) {
    const lawyer = db.lawyers.find(item => item.id === user.lawyerId);
    if (lawyer) {
      if (name) lawyer.name = name.trim();
      if (username) lawyer.username = username.trim();
      if (room) lawyer.room = room.trim();
      if (specialty) lawyer.specialty = specialty.trim();

      db.appointments.forEach(appointment => {
        if (appointment.lawyerId === lawyer.id) {
          appointment.lawyerName = lawyer.name;
          appointment.lawyerRoom = lawyer.room;
        }
      });
      changedLawyers.push(lawyer);
      appointmentLawyerUpdates.push({
        lawyerId: lawyer.id,
        lawyerName: lawyer.name,
        lawyerRoom: lawyer.room
      });
    }
  }

  const auditLog = addAuditLog('admin.user_updated', req.session, {
    targetUserId: user.id,
    before,
    after: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      jobTitle: user.jobTitle || defaultJobTitleForRole(user.role),
      lawyerId: user.lawyerId || null,
      mustChangePassword: user.mustChangePassword
    },
    passwordChanged: Boolean(cleanPassword)
  }, req);

  saveData(db, {
    users: [user],
    lawyers: changedLawyers,
    appointmentLawyerUpdates,
    auditLogs: [auditLog]
  });
  emitLawyersUpdated();
  emitQueueUpdated();

  res.json({
    success: true,
    message: 'Dados da conta atualizados com sucesso.',
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      jobTitle: user.jobTitle || defaultJobTitleForRole(user.role)
    }
  });
});

app.post('/api/admin/reset-password', requireRole('admin'), requireCriticalAdmin, (req, res) => {
  const { userId, newPassword } = req.body;
  if (!userId || !newPassword) {
    return res.status(400).json({ error: 'Usuario e nova senha sao obrigatorios.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'A nova senha deve conter no minimo 8 caracteres.' });
  }

  const user = db.users.find(item => item.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuario nao encontrado.' });
  }

  user.passwordHash = hashPassword(newPassword);
  user.mustChangePassword = true;
  const auditLog = addAuditLog('admin.password_reset', req.session, {
    targetUserId: user.id,
    targetUsername: user.username
  }, req);
  saveData(db, { users: [user], auditLogs: [auditLog] });

  res.json({ success: true, message: `Senha do usuario ${user.username} redefinida com sucesso.` });
});

app.get('/api/payment-requests', requireRole('admin', 'advogado', 'contadora', 'gerente'), (req, res) => {
  res.json(visiblePaymentRequestsForSession(req.session));
});

app.post('/api/payment-requests', requireRole('admin', 'advogado'), (req, res) => {
  const { processNumber, clientName, notes, lawyerId } = req.body || {};
  const cleanProcessNumber = String(processNumber || '').trim();
  const cleanClientName = String(clientName || '').trim();
  const cleanNotes = String(notes || '').trim().slice(0, 1200);

  if (!cleanProcessNumber) {
    return res.status(400).json({ error: 'Numero do processo e obrigatorio.' });
  }

  let lawyer = null;
  if (req.session.role === 'advogado') {
    lawyer = db.lawyers.find(item => item.id === req.session.lawyerId);
  } else if (lawyerId) {
    lawyer = db.lawyers.find(item => item.id === String(lawyerId));
  }

  if (!lawyer) {
    return res.status(400).json({ error: 'Advogado solicitante nao encontrado.' });
  }

  const now = new Date().toISOString();
  const request = {
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    processNumber: cleanProcessNumber,
    clientName: cleanClientName,
    notes: cleanNotes,
    status: 'solicitada',
    lawyerId: lawyer.id,
    lawyerName: lawyer.name,
    requestedBy: getActorFromSession(req.session),
    requestedAt: now,
    guideText: '',
    guideLink: '',
    guideAmount: '',
    guideDueDate: '',
    guideGeneratedBy: null,
    guideGeneratedAt: null,
    paymentReceiptText: '',
    paymentReceiptLink: '',
    paidBy: null,
    paidAt: null,
    updatedAt: now
  };

  if (!Array.isArray(db.paymentRequests)) db.paymentRequests = [];
  db.paymentRequests.unshift(request);

  const auditLog = addAuditLog('payment_request.created', req.session, {
    requestId: request.id,
    processNumber: request.processNumber,
    lawyerName: request.lawyerName
  }, req);
  saveData(db, { paymentRequests: [request], auditLogs: [auditLog] });

  emitPaymentRequestsUpdated();
  io.to('contadora_room').emit('payment_request_notice', {
    type: 'new_request',
    request: getPaymentRequestSnapshot(request, { role: 'contadora' }),
    message: `Nova solicitacao de guia do processo ${request.processNumber}.`
  });
  io.to('gerente_room').emit('payment_request_notice', {
    type: 'new_request',
    request: getPaymentRequestSnapshot(request, { role: 'gerente' }),
    message: `Novo pedido de pagamento/guia do processo ${request.processNumber}.`
  });

  res.json({
    success: true,
    request: getPaymentRequestSnapshot(request, req.session)
  });
});

app.put('/api/payment-requests/:id/guide', requireRole('admin', 'contadora'), (req, res) => {
  const request = (db.paymentRequests || []).find(item => item.id === req.params.id);
  if (!request) {
    return res.status(404).json({ error: 'Solicitacao nao encontrada.' });
  }

  if (request.status === 'pago') {
    return res.status(400).json({ error: 'Esta solicitacao ja foi paga e nao pode ter a guia alterada.' });
  }

  const guideText = String(req.body?.guideText || '').trim().slice(0, 2000);
  const guideLink = String(req.body?.guideLink || '').trim().slice(0, 1000);
  const guideAmount = String(req.body?.guideAmount || '').trim().slice(0, 80);
  const guideDueDate = String(req.body?.guideDueDate || '').trim().slice(0, 10);

  if (!guideText && !guideLink) {
    return res.status(400).json({ error: 'Informe os dados da guia ou um link para a guia.' });
  }

  const now = new Date().toISOString();
  request.status = 'guia_gerada';
  request.guideText = guideText;
  request.guideLink = guideLink;
  request.guideAmount = guideAmount;
  request.guideDueDate = guideDueDate;
  request.guideGeneratedBy = getActorFromSession(req.session);
  request.guideGeneratedAt = now;
  request.updatedAt = now;

  const auditLog = addAuditLog('payment_request.guide_generated', req.session, {
    requestId: request.id,
    processNumber: request.processNumber,
    lawyerName: request.lawyerName
  }, req);
  saveData(db, { paymentRequests: [request], auditLogs: [auditLog] });

  emitPaymentRequestsUpdated();
  io.to('gerente_room').emit('payment_request_notice', {
    type: 'guide_ready',
    request: getPaymentRequestSnapshot(request, { role: 'gerente' }),
    message: `Guia pronta para pagamento no processo ${request.processNumber}.`
  });

  res.json({
    success: true,
    request: getPaymentRequestSnapshot(request, req.session)
  });
});

app.put('/api/payment-requests/:id/payment', requireRole('admin', 'gerente'), (req, res) => {
  const request = (db.paymentRequests || []).find(item => item.id === req.params.id);
  if (!request) {
    return res.status(404).json({ error: 'Solicitacao nao encontrada.' });
  }

  if (request.status !== 'guia_gerada') {
    return res.status(400).json({ error: 'A guia precisa estar gerada antes do pagamento.' });
  }

  const paymentReceiptText = String(req.body?.paymentReceiptText || '').trim().slice(0, 2000);
  const paymentReceiptLink = String(req.body?.paymentReceiptLink || '').trim().slice(0, 1000);

  if (!paymentReceiptText && !paymentReceiptLink) {
    return res.status(400).json({ error: 'Informe os dados do comprovante ou um link para o comprovante.' });
  }

  const now = new Date().toISOString();
  request.status = 'pago';
  request.paymentReceiptText = paymentReceiptText;
  request.paymentReceiptLink = paymentReceiptLink;
  request.paidBy = getActorFromSession(req.session);
  request.paidAt = now;
  request.updatedAt = now;

  const auditLog = addAuditLog('payment_request.paid', req.session, {
    requestId: request.id,
    processNumber: request.processNumber,
    lawyerName: request.lawyerName
  }, req);
  saveData(db, { paymentRequests: [request], auditLogs: [auditLog] });

  emitPaymentRequestsUpdated();
  io.to(`lawyer_${request.lawyerId}`).emit('payment_request_notice', {
    type: 'paid',
    request: getPaymentRequestSnapshot(request, { role: 'advogado' }),
    message: `Guia paga no processo ${request.processNumber}. O comprovante ja esta disponivel.`
  });

  res.json({
    success: true,
    request: getPaymentRequestSnapshot(request, req.session)
  });
});

app.get('/api/lawyers', requireRole('admin', 'recepcao', 'advogado'), (req, res) => {
  res.json(db.lawyers);
});

app.post('/api/lawyers', requireRole('admin'), (req, res) => {
  const { name, room, specialty, username, password } = req.body;
  if (!name || !room || !username) {
    return res.status(400).json({ error: 'Nome, sala e usuario sao obrigatorios.' });
  }

  const cleanPassword = password ? password.trim() : '';
  if (cleanPassword && cleanPassword.length < 8) {
    return res.status(400).json({ error: 'A senha inicial deve conter no minimo 8 caracteres.' });
  }

  const duplicate = db.users.find(item => normalizeUsername(item.username) === normalizeUsername(username));
  if (duplicate) {
    return res.status(400).json({ error: `O nome de usuario "${username}" ja esta em uso.` });
  }

  const lawyerId = Date.now().toString();
  const newLawyer = {
    id: lawyerId,
    name: name.trim(),
    room: room.trim(),
    specialty: specialty ? specialty.trim() : 'Advogado(a)',
    username: username.trim()
  };

  const initialPassword = cleanPassword || '12345678';
  const newUser = {
    id: `u_${lawyerId}`,
    username: username.trim(),
    passwordHash: hashPassword(initialPassword),
    name: name.trim(),
    role: 'advogado',
    jobTitle: 'Advogado',
    lawyerId,
    mustChangePassword: true
  };

  db.lawyers.push(newLawyer);
  db.users.push(newUser);
  const auditLog = addAuditLog('admin.lawyer_created', req.session, {
    lawyer: newLawyer,
    user: { id: newUser.id, username: newUser.username, role: newUser.role }
  }, req);
  saveData(db, { lawyers: [newLawyer], users: [newUser], auditLogs: [auditLog] });

  emitLawyersUpdated();
  res.json({ lawyer: newLawyer, user: { username: newUser.username } });
});

app.delete('/api/lawyers/:id', requireRole('admin'), requireCriticalAdmin, (req, res) => {
  const { id } = req.params;
  const removedLawyer = db.lawyers.find(item => item.id === id) || null;

  if (!removedLawyer) {
    return res.status(404).json({ error: 'Advogado nao encontrado.' });
  }

  const removedUsers = db.users.filter(item => item.lawyerId === id).map(user => ({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  }));

  db.lawyers = db.lawyers.filter(item => item.id !== id);
  db.users = db.users.filter(item => item.lawyerId !== id);
  const auditLog = addAuditLog('admin.lawyer_deleted', req.session, {
    lawyer: removedLawyer,
    users: removedUsers
  }, req);
  saveData(db, {
    deletedUserIds: removedUsers.map(user => user.id),
    deletedLawyerIds: [removedLawyer.id],
    auditLogs: [auditLog]
  });
  emitLawyersUpdated();
  emitQueueUpdated();
  res.json({ success: true });
});

app.get('/api/appointments', requireRole('admin', 'recepcao', 'advogado'), (req, res) => {
  res.json(visibleAppointmentsForSession(req.session));
});

app.put('/api/appointments/:id', requireRole('admin', 'recepcao'), (req, res) => {
  const { id } = req.params;
  const { clientName, clientPhone, scheduledDate, scheduledTime, lawyerId, notes } = req.body;

  const appointment = db.appointments.find(item => item.id === id);
  if (!appointment) {
    return res.status(404).json({ error: 'Agendamento nao encontrado.' });
  }

  const cleanClientName = String(clientName || '').trim();
  const cleanScheduledDate = String(scheduledDate || '').trim();
  const cleanScheduledTime = String(scheduledTime || '').trim();
  const cleanLawyerId = String(lawyerId || '').trim();

  if (!cleanClientName || !cleanScheduledDate || !cleanScheduledTime || !cleanLawyerId) {
    return res.status(400).json({ error: 'Cliente, data, horario e advogado sao obrigatorios.' });
  }

  const lawyer = db.lawyers.find(item => item.id === cleanLawyerId);
  if (!lawyer) {
    return res.status(404).json({ error: 'Advogado nao encontrado.' });
  }

  const conflict = db.appointments.find(item =>
    item.id !== appointment.id &&
    item.lawyerId === cleanLawyerId &&
    item.scheduledDate === cleanScheduledDate &&
    item.scheduledTime === cleanScheduledTime &&
    item.status !== 'cancelado'
  );

  if (conflict) {
    const [year, month, day] = cleanScheduledDate.split('-');
    const formattedDate = `${day}/${month}/${year}`;
    return res.status(400).json({
      error: `CONFLITO DE AGENDAMENTO: O(a) ${lawyer.name} ja possui ${conflict.clientName} no dia ${formattedDate} as ${cleanScheduledTime}.`
    });
  }

  const before = getAppointmentSnapshot(appointment);

  appointment.clientName = cleanClientName;
  appointment.clientPhone = String(clientPhone || '').trim();
  appointment.scheduledDate = cleanScheduledDate;
  appointment.scheduledTime = cleanScheduledTime;
  appointment.lawyerId = lawyer.id;
  appointment.lawyerName = lawyer.name;
  appointment.lawyerRoom = lawyer.room;
  appointment.notes = String(notes || '').trim();
  appointment.updatedAt = new Date().toISOString();
  appointment.updatedBy = getActorFromSession(req.session);

  const after = getAppointmentSnapshot(appointment);
  const changedFields = Object.keys(after).filter(key => before[key] !== after[key]);

  const historyEvent = addHistoryEvent('appointment_updated', appointment, req.session, {
    changedFields,
    before,
    after
  });
  const auditLog = addAuditLog('appointment.updated', req.session, {
    appointmentId: appointment.id,
    changedFields,
    before,
    after
  }, req);

  saveData(db, {
    appointments: [appointment],
    appointmentHistory: [historyEvent],
    auditLogs: [auditLog]
  });
  emitQueueUpdated();

  res.json({
    success: true,
    message: 'Agendamento atualizado com sucesso.',
    appointment
  });
});

io.on('connection', socket => {
  socket.data.session = verifyToken(getSocketToken(socket));

  if (socket.data.session) {
    socket.emit('init_data', {
      lawyers: db.lawyers,
      appointments: visibleAppointmentsForSession(socket.data.session),
      paymentRequests: visiblePaymentRequestsForSession(socket.data.session)
    });
  }

  socket.on('register_lawyer_room', lawyerId => {
    const session = requireSocketRole(socket, ['admin', 'advogado']);
    if (!session) return;

    if (session.role === 'advogado' && session.lawyerId !== lawyerId) {
      return socket.emit('auth_error', 'Voce so pode acessar a sua propria sala.');
    }

    socket.join(`lawyer_${lawyerId}`);
  });

  socket.on('register_reception', () => {
    const session = requireSocketRole(socket, ['admin', 'recepcao']);
    if (!session) return;
    socket.join('reception_room');
  });

  socket.on('register_finance_room', () => {
    const session = requireSocketRole(socket, ['admin', 'contadora', 'gerente']);
    if (!session) return;

    if (session.role === 'admin' || session.role === 'contadora') socket.join('contadora_room');
    if (session.role === 'admin' || session.role === 'gerente') socket.join('gerente_room');
  });

  socket.on('register_tv_panel', () => {
    if (PANEL_TOKEN) {
      const providedToken =
        (socket.handshake.auth && socket.handshake.auth.panelToken) ||
        (socket.handshake.query && socket.handshake.query.panelToken) ||
        '';

      if (providedToken !== PANEL_TOKEN) {
        socket.emit('auth_error', 'Token do painel invalido.');
        return;
      }
    }

    socket.join('tv_panel_room');
  });

  socket.on('create_appointment', data => {
    const session = requireSocketRole(socket, ['admin', 'recepcao']);
    if (!session) return;

    const lawyer = db.lawyers.find(item => item.id === data.lawyerId);
    if (!lawyer) {
      return socket.emit('appointment_error', 'Advogado nao encontrado');
    }

    const targetDate = data.scheduledDate || getBusinessDateString();
    const targetTime = data.scheduledTime || '09:00';

    const conflict = db.appointments.find(appointment =>
      appointment.lawyerId === lawyer.id &&
      appointment.scheduledDate === targetDate &&
      appointment.scheduledTime === targetTime &&
      appointment.status !== 'cancelado'
    );

    if (conflict) {
      const [year, month, day] = targetDate.split('-');
      const formattedDate = `${day}/${month}/${year}`;
      return socket.emit(
        'appointment_error',
        `CONFLITO DE AGENDAMENTO: O(a) ${lawyer.name} ja possui um cliente agendado (${conflict.clientName}) no dia ${formattedDate} as ${targetTime}. Por favor, escolha outro horario ou dia.`
      );
    }

    const newAppointment = {
      id: `apt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      clientName: String(data.clientName || '').trim(),
      clientPhone: String(data.clientPhone || '').trim(),
      notes: String(data.notes || '').trim(),
      lawyerId: lawyer.id,
      lawyerName: lawyer.name,
      lawyerRoom: lawyer.room,
      scheduledDate: targetDate,
      scheduledTime: targetTime,
      createdAt: new Date().toISOString(),
      status: 'aguardando',
      startedAt: null,
      finishedAt: null
    };

    if (!newAppointment.clientName) {
      return socket.emit('appointment_error', 'Nome do cliente e obrigatorio.');
    }

    db.appointments.unshift(newAppointment);
    const historyEvent = addHistoryEvent('appointment_created', newAppointment, session, {
      message: 'Agendamento criado.'
    });
    const auditLog = addAuditLog('appointment.created', session, {
      appointment: getAppointmentSnapshot(newAppointment)
    });
    saveData(db, {
      appointments: [newAppointment],
      appointmentHistory: [historyEvent],
      auditLogs: [auditLog]
    });

    emitQueueUpdated();

    io.to(`lawyer_${lawyer.id}`).emit('new_client_assigned', {
      appointment: newAppointment,
      message: `Novo cliente agendado: ${newAppointment.clientName} para ${targetDate} as ${targetTime}`
    });

    socket.emit('appointment_created_success', newAppointment);
  });

  socket.on('call_client', appointmentId => {
    const session = requireSocketRole(socket, ['admin', 'recepcao']);
    if (!session) return;

    const appointment = db.appointments.find(item => item.id === appointmentId);
    if (!appointment) return;

    appointment.calledAt = new Date().toISOString();
    const historyEvent = addHistoryEvent('client_called', appointment, session, {
      calledAt: appointment.calledAt
    });
    const auditLog = addAuditLog('appointment.client_called', session, {
      appointmentId: appointment.id,
      clientName: appointment.clientName,
      lawyerName: appointment.lawyerName
    });
    saveData(db, {
      appointments: [appointment],
      appointmentHistory: [historyEvent],
      auditLogs: [auditLog]
    });

    emitQueueUpdated();

    io.to(`lawyer_${appointment.lawyerId}`).emit('client_called_notice', {
      appointment,
      message: `A recepcao chamou o cliente ${appointment.clientName} para o seu atendimento!`
    });

    io.to('tv_panel_room').emit('tv_call_announcement', {
      clientName: appointment.clientName,
      lawyerName: appointment.lawyerName,
      room: appointment.lawyerRoom,
      timestamp: Date.now()
    });
  });

  socket.on('start_consultation', appointmentId => {
    const session = requireSocketRole(socket, ['admin', 'recepcao', 'advogado']);
    if (!session) return;

    const appointment = db.appointments.find(item => item.id === appointmentId);
    if (!canManageAppointment(session, appointment)) {
      return socket.emit('auth_error', 'Voce nao pode iniciar este atendimento.');
    }

    const activeForLawyer = db.appointments.find(item =>
      item.id !== appointment.id &&
      item.lawyerId === appointment.lawyerId &&
      item.status === 'em_atendimento'
    );

    if (activeForLawyer) {
      return socket.emit('appointment_error', `${appointment.lawyerName} ja possui atendimento em andamento.`);
    }

    appointment.status = 'em_atendimento';
    appointment.startedAt = new Date().toISOString();
    const historyEvent = addHistoryEvent('consultation_started', appointment, session, {
      startedAt: appointment.startedAt
    });
    const auditLog = addAuditLog('appointment.consultation_started', session, {
      appointmentId: appointment.id,
      clientName: appointment.clientName,
      lawyerName: appointment.lawyerName
    });
    saveData(db, {
      appointments: [appointment],
      appointmentHistory: [historyEvent],
      auditLogs: [auditLog]
    });

    emitQueueUpdated();
    io.to('reception_room').emit('consultation_started_notice', appointment);
  });

  socket.on('finish_consultation', data => {
    const session = requireSocketRole(socket, ['admin', 'recepcao', 'advogado']);
    if (!session) return;

    const { appointmentId, finishedByRole, receptionRequests } = data || {};
    const appointment = db.appointments.find(item => item.id === appointmentId);
    if (!canManageAppointment(session, appointment)) {
      return socket.emit('auth_error', 'Voce nao pode finalizar este atendimento.');
    }

    appointment.status = 'concluido';
    appointment.finishedAt = new Date().toISOString();
    appointment.receptionRequests = normalizeReceptionRequests(receptionRequests);
    const historyEvent = addHistoryEvent('consultation_finished', appointment, session, {
      finishedByRole: finishedByRole || session.role,
      finishedAt: appointment.finishedAt,
      receptionRequests: appointment.receptionRequests
    });
    const auditLog = addAuditLog('appointment.consultation_finished', session, {
      appointmentId: appointment.id,
      clientName: appointment.clientName,
      lawyerName: appointment.lawyerName,
      finishedByRole: finishedByRole || session.role,
      receptionRequests: appointment.receptionRequests
    });
    saveData(db, {
      appointments: [appointment],
      appointmentHistory: [historyEvent],
      auditLogs: [auditLog]
    });

    emitQueueUpdated();

    io.to('reception_room').emit('lawyer_finished_notification', {
      appointmentId: appointment.id,
      lawyerId: appointment.lawyerId,
      lawyerName: appointment.lawyerName,
      clientName: appointment.clientName,
      finishedByRole: finishedByRole || session.role,
      finishedAt: appointment.finishedAt,
      receptionRequests: appointment.receptionRequests,
      message: `O ${appointment.lawyerName} finalizou o atendimento de ${appointment.clientName}. Chame o proximo cliente para a ${appointment.lawyerRoom}!`
    });
  });

  socket.on('cancel_appointment', appointmentId => {
    const session = requireSocketRole(socket, ['admin', 'recepcao']);
    if (!session) return;

    const appointment = db.appointments.find(item => item.id === appointmentId);
    if (appointment) {
      appointment.status = 'cancelado';
      appointment.cancelledAt = new Date().toISOString();
      const historyEvent = addHistoryEvent('appointment_cancelled', appointment, session, {
        cancelledAt: appointment.cancelledAt
      });
      const auditLog = addAuditLog('appointment.cancelled', session, {
        appointmentId: appointment.id,
        clientName: appointment.clientName,
        lawyerName: appointment.lawyerName
      });
      saveData(db, {
        appointments: [appointment],
        appointmentHistory: [historyEvent],
        auditLogs: [auditLog]
      });
      emitQueueUpdated();
    }
  });

  socket.on('clear_daily_queue', () => {
    const session = requireSocketRole(socket, ['admin', 'recepcao']);
    if (!session) return;

    const today = getBusinessDateString();
    let clearedCount = 0;
    const changedAppointments = [];
    const historyEvents = [];
    db.appointments.forEach(appointment => {
      const appointmentDate = appointment.scheduledDate || getBusinessDateString(new Date(appointment.createdAt));
      if (appointmentDate === today && appointment.status !== 'concluido' && appointment.status !== 'cancelado') {
        appointment.status = 'cancelado';
        appointment.cancelledAt = new Date().toISOString();
        clearedCount += 1;
        changedAppointments.push(appointment);
        historyEvents.push(addHistoryEvent('daily_queue_cleared', appointment, session, {
          clearedDate: today
        }));
      }
    });

    const auditLog = addAuditLog('appointment.daily_queue_cleared', session, {
      clearedDate: today,
      clearedCount
    });
    saveData(db, {
      appointments: changedAppointments,
      appointmentHistory: historyEvents,
      auditLogs: [auditLog]
    });
    emitQueueUpdated();
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Desconectado: ${socket.id}`);
  });
});

async function startServer() {
  db = await loadData();
  scheduleAutoBackups();

  server.listen(PORT, HOST, () => {
    console.log('\n======================================================');
    console.log('COB ADVOGADOS - SISTEMA DE ATENDIMENTO PRONTO');
    console.log('======================================================');
    console.log(`Banco de dados: ${pgPool ? 'PostgreSQL/Supabase' : 'JSON local'}`);
    console.log(`Acesso local no servidor: http://localhost:${PORT}`);

    const interfaces = os.networkInterfaces();
    console.log('\nEnderecos para acesso na rede local (LAN):');
    Object.keys(interfaces).forEach(ifname => {
      interfaces[ifname].forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`   http://${iface.address}:${PORT}`);
        }
      });
    });
    console.log('======================================================\n');
  });
}

startServer().catch(err => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
