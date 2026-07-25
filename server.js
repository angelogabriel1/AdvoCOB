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
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret-before-online';
const SESSION_TTL = process.env.SESSION_TTL || '8h';
const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'America/Fortaleza';
const PASSWORD_ROUNDS = Number(process.env.PASSWORD_ROUNDS || 12);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const PANEL_TOKEN = process.env.PANEL_TOKEN || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(DATA_DIR, 'database.json');

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
    saveData(db);
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
        mustChangePassword: true
      },
      {
        id: 'u_recepcao',
        username: 'recepcao',
        passwordHash: defaultHash,
        name: 'Recepcionista',
        role: 'recepcao',
        mustChangePassword: true
      },
      {
        id: 'u_carlos',
        username: 'dr.carlos',
        passwordHash: defaultHash,
        name: 'Dr. Carlos Eduardo',
        role: 'advogado',
        lawyerId: '1',
        mustChangePassword: true
      },
      {
        id: 'u_ana',
        username: 'dra.ana',
        passwordHash: defaultHash,
        name: 'Dra. Ana Paula',
        role: 'advogado',
        lawyerId: '2',
        mustChangePassword: true
      },
      {
        id: 'u_roberto',
        username: 'dr.roberto',
        passwordHash: defaultHash,
        name: 'Dr. Roberto Silva',
        role: 'advogado',
        lawyerId: '3',
        mustChangePassword: true
      }
    ],
    appointments: []
  };
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function normalizeData(data, defaults = makeDefaultData()) {
  if (!data || typeof data !== 'object') data = {};

  if (!Array.isArray(data.lawyers)) data.lawyers = defaults.lawyers;
  if (!Array.isArray(data.users)) data.users = defaults.users;
  if (!Array.isArray(data.appointments)) data.appointments = [];

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

async function ensurePostgresSchema() {
  if (!pgPool) return;

  await pgPool.query(`
    create table if not exists app_state (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
}

async function loadPostgresData() {
  const defaults = makeDefaultData();
  await ensurePostgresSchema();

  const result = await pgPool.query('select value from app_state where key = $1', ['main']);
  if (result.rows.length > 0) {
    return normalizeData(result.rows[0].value, defaults);
  }

  const localData = fs.existsSync(DB_FILE) ? loadJsonData() : defaults;
  await savePostgresData(localData);
  return normalizeData(localData, defaults);
}

async function savePostgresData(data) {
  if (!pgPool) return;

  await ensurePostgresSchema();
  await pgPool.query(
    `
      insert into app_state (key, value, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (key)
      do update set value = excluded.value, updated_at = now()
    `,
    ['main', JSON.stringify(data)]
  );
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

function saveData(data) {
  if (!pgPool) {
    saveJsonData(data);
    return;
  }

  savePostgresData(data).catch(err => {
    console.error('Erro ao salvar dados no PostgreSQL/Supabase:', err);
  });
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

function getSessionForUser(user) {
  const lawyer = user.lawyerId ? db.lawyers.find(item => item.id === user.lawyerId) : null;

  const session = {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
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

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsConfig));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.' }
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
  saveData(db);

  res.json({
    success: true,
    message: 'Senha alterada com sucesso!',
    session: getSessionForUser(user)
  });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ session: req.session });
});

app.get('/api/admin/users', requireRole('admin'), (req, res) => {
  const usersClean = db.users.map(user => {
    const lawyer = user.lawyerId ? db.lawyers.find(item => item.id === user.lawyerId) : null;
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      lawyerId: user.lawyerId || null,
      room: lawyer ? lawyer.room : '',
      specialty: lawyer ? lawyer.specialty : '',
      mustChangePassword: user.mustChangePassword
    };
  });

  res.json(usersClean);
});

app.put('/api/admin/users/:id', requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { name, username, room, specialty, password } = req.body;

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

  if (cleanPassword) {
    user.passwordHash = hashPassword(cleanPassword);
    user.mustChangePassword = false;
  }

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
    }
  }

  saveData(db);
  emitLawyersUpdated();
  emitQueueUpdated();

  res.json({
    success: true,
    message: 'Dados da conta atualizados com sucesso.',
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role
    }
  });
});

app.post('/api/admin/reset-password', requireRole('admin'), (req, res) => {
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
  saveData(db);

  res.json({ success: true, message: `Senha do usuario ${user.username} redefinida com sucesso.` });
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
    lawyerId,
    mustChangePassword: true
  };

  db.lawyers.push(newLawyer);
  db.users.push(newUser);
  saveData(db);

  emitLawyersUpdated();
  res.json({ lawyer: newLawyer, user: { username: newUser.username } });
});

app.delete('/api/lawyers/:id', requireRole('admin'), (req, res) => {
  const { id } = req.params;
  db.lawyers = db.lawyers.filter(item => item.id !== id);
  db.users = db.users.filter(item => item.lawyerId !== id);
  saveData(db);
  emitLawyersUpdated();
  emitQueueUpdated();
  res.json({ success: true });
});

app.get('/api/appointments', requireRole('admin', 'recepcao', 'advogado'), (req, res) => {
  res.json(visibleAppointmentsForSession(req.session));
});

io.on('connection', socket => {
  socket.data.session = verifyToken(getSocketToken(socket));

  if (socket.data.session) {
    socket.emit('init_data', {
      lawyers: db.lawyers,
      appointments: visibleAppointmentsForSession(socket.data.session)
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
    saveData(db);

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
    saveData(db);

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
    saveData(db);

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
    saveData(db);

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
      saveData(db);
      emitQueueUpdated();
    }
  });

  socket.on('clear_daily_queue', () => {
    const session = requireSocketRole(socket, ['admin', 'recepcao']);
    if (!session) return;

    const today = getBusinessDateString();
    db.appointments = db.appointments.filter(appointment => {
      const appointmentDate = appointment.scheduledDate || getBusinessDateString(new Date(appointment.createdAt));
      return appointmentDate !== today;
    });

    saveData(db);
    emitQueueUpdated();
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Desconectado: ${socket.id}`);
  });
});

async function startServer() {
  db = await loadData();

  server.listen(PORT, '0.0.0.0', () => {
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
