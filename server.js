const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const DEFAULT_HASH = hashPassword('123456');

// Estrutura inicial
const initialData = {
  lawyers: [
    { id: '1', name: 'Dr. Carlos Eduardo', room: 'Sala 01', specialty: 'Direito Civil & Família', username: 'dr.carlos' },
    { id: '2', name: 'Dra. Ana Paula', room: 'Sala 02', specialty: 'Direito Trabalhista', username: 'dra.ana' },
    { id: '3', name: 'Dr. Roberto Silva', room: 'Sala 03', specialty: 'Direito Penal & Empresarial', username: 'dr.roberto' }
  ],
  users: [
    {
      id: 'u_admin',
      username: 'admin',
      passwordHash: DEFAULT_HASH,
      name: 'Administrador do Sistema',
      role: 'admin',
      mustChangePassword: true
    },
    {
      id: 'u_recepcao',
      username: 'recepcao',
      passwordHash: DEFAULT_HASH,
      name: 'Recepcionista',
      role: 'recepcao',
      mustChangePassword: true
    },
    {
      id: 'u_carlos',
      username: 'dr.carlos',
      passwordHash: DEFAULT_HASH,
      name: 'Dr. Carlos Eduardo',
      role: 'advogado',
      lawyerId: '1',
      mustChangePassword: true
    },
    {
      id: 'u_ana',
      username: 'dra.ana',
      passwordHash: DEFAULT_HASH,
      name: 'Dra. Ana Paula',
      role: 'advogado',
      lawyerId: '2',
      mustChangePassword: true
    },
    {
      id: 'u_roberto',
      username: 'dr.roberto',
      passwordHash: DEFAULT_HASH,
      name: 'Dr. Roberto Silva',
      role: 'advogado',
      lawyerId: '3',
      mustChangePassword: true
    }
  ],
  appointments: []
};

function loadData() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (!data.users) data.users = initialData.users;
      const adminExists = data.users.some(u => u.username === 'admin');
      if (!adminExists) {
        data.users.push(initialData.users[0]);
      }
      return {
        lawyers: data.lawyers || initialData.lawyers,
        users: data.users || initialData.users,
        appointments: data.appointments || []
      };
    }
  } catch (err) {
    console.error('Erro ao ler banco de dados JSON:', err);
  }
  saveData(initialData);
  return initialData;
}

function saveData(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Erro ao salvar banco de dados JSON:', err);
  }
}

let db = loadData();
const sessions = {};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === ROTAS DE AUTENTICAÇÃO ===

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  if (user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
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

  const token = 'tok_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const lawyer = user.lawyerId ? db.lawyers.find(l => l.id === user.lawyerId) : null;

  const sessionData = {
    token,
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    lawyerId: user.lawyerId || null,
    lawyerName: lawyer ? lawyer.name : null,
    lawyerRoom: lawyer ? lawyer.room : null
  };

  sessions[token] = sessionData;

  res.json({
    success: true,
    mustChangePassword: false,
    session: sessionData
  });
});

app.post('/api/auth/change-password', (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  
  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Preencha todos os campos para alterar a senha.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve conter no mínimo 6 caracteres.' });
  }

  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase().trim());
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  if (user.passwordHash !== hashPassword(currentPassword)) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }

  user.passwordHash = hashPassword(newPassword);
  user.mustChangePassword = false;
  saveData(db);

  const token = 'tok_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const lawyer = user.lawyerId ? db.lawyers.find(l => l.id === user.lawyerId) : null;

  const sessionData = {
    token,
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    lawyerId: user.lawyerId || null,
    lawyerName: lawyer ? lawyer.name : null,
    lawyerRoom: lawyer ? lawyer.room : null
  };

  sessions[token] = sessionData;

  res.json({
    success: true,
    message: 'Senha alterada com sucesso!',
    session: sessionData
  });
});

// === ROTAS DE ADMINISTRAÇÃO ===

app.get('/api/admin/users', (req, res) => {
  const usersClean = db.users.map(u => {
    const lawyer = u.lawyerId ? db.lawyers.find(l => l.id === u.lawyerId) : null;
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      lawyerId: u.lawyerId || null,
      room: lawyer ? lawyer.room : '',
      specialty: lawyer ? lawyer.specialty : '',
      mustChangePassword: u.mustChangePassword
    };
  });
  res.json(usersClean);
});

app.put('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, username, room, specialty, password } = req.body;

  const user = db.users.find(u => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  if (username && username.toLowerCase().trim() !== user.username.toLowerCase()) {
    const duplicate = db.users.find(u => u.id !== id && u.username.toLowerCase() === username.toLowerCase().trim());
    if (duplicate) {
      return res.status(400).json({ error: `O nome de usuário "${username}" já está em uso.` });
    }
    user.username = username.trim();
  }

  if (name) user.name = name.trim();

  if (password && password.trim().length >= 6) {
    user.passwordHash = hashPassword(password.trim());
    user.mustChangePassword = false;
  }

  if (user.lawyerId) {
    const lawyer = db.lawyers.find(l => l.id === user.lawyerId);
    if (lawyer) {
      if (name) lawyer.name = name.trim();
      if (username) lawyer.username = username.trim();
      if (room) lawyer.room = room.trim();
      if (specialty) lawyer.specialty = specialty.trim();

      db.appointments.forEach(a => {
        if (a.lawyerId === lawyer.id) {
          a.lawyerName = lawyer.name;
          a.lawyerRoom = lawyer.room;
        }
      });
    }
  }

  saveData(db);
  io.emit('lawyers_updated', db.lawyers);
  io.emit('queue_updated', db.appointments);

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

app.post('/api/admin/reset-password', (req, res) => {
  const { userId, newPassword } = req.body;
  if (!userId || !newPassword) {
    return res.status(400).json({ error: 'Usuário e nova senha são obrigatórios.' });
  }

  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  user.passwordHash = hashPassword(newPassword);
  user.mustChangePassword = true;
  saveData(db);

  res.json({ success: true, message: `Senha do usuário ${user.username} redefinida com sucesso.` });
});

// === ROTAS DE ADVOGADOS ===

app.get('/api/lawyers', (req, res) => {
  res.json(db.lawyers);
});

app.post('/api/lawyers', (req, res) => {
  const { name, room, specialty, username, password } = req.body;
  if (!name || !room || !username) {
    return res.status(400).json({ error: 'Nome, sala e usuário são obrigatórios.' });
  }

  const lawyerId = Date.now().toString();
  const newLawyer = {
    id: lawyerId,
    name,
    room,
    specialty: specialty || 'Advogado(a)',
    username: username.trim()
  };

  const newUser = {
    id: 'u_' + lawyerId,
    username: username.trim(),
    passwordHash: hashPassword(password || '123456'),
    name: name,
    role: 'advogado',
    lawyerId: lawyerId,
    mustChangePassword: true
  };

  db.lawyers.push(newLawyer);
  db.users.push(newUser);
  saveData(db);

  io.emit('lawyers_updated', db.lawyers);
  res.json({ lawyer: newLawyer, user: { username: newUser.username } });
});

app.delete('/api/lawyers/:id', (req, res) => {
  const { id } = req.params;
  db.lawyers = db.lawyers.filter(l => l.id !== id);
  db.users = db.users.filter(u => u.lawyerId !== id);
  saveData(db);
  io.emit('lawyers_updated', db.lawyers);
  res.json({ success: true });
});

app.get('/api/appointments', (req, res) => {
  res.json(db.appointments);
});

// WebSocket Events
io.on('connection', (socket) => {
  socket.emit('init_data', {
    lawyers: db.lawyers,
    appointments: db.appointments
  });

  socket.on('register_lawyer_room', (lawyerId) => {
    if (lawyerId) {
      socket.join(`lawyer_${lawyerId}`);
    }
  });

  socket.on('register_reception', () => {
    socket.join('reception_room');
  });

  socket.on('register_tv_panel', () => {
    socket.join('tv_panel_room');
  });

  // NOVO AGENDAMENTO COM VALIDAÇÃO DE CONFLITO E SUPORTE A DATAS FUTURAS
  socket.on('create_appointment', (data) => {
    const lawyer = db.lawyers.find(l => l.id === data.lawyerId);
    if (!lawyer) {
      return socket.emit('appointment_error', 'Advogado não encontrado');
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const targetDate = data.scheduledDate || todayStr;
    const targetTime = data.scheduledTime || '09:00';

    // VERIFICAÇÃO DE DUPLO AGENDAMENTO (CONFLITO DE DATA + HORÁRIO + ADVOGADO)
    const conflict = db.appointments.find(a => 
      a.lawyerId === lawyer.id &&
      a.scheduledDate === targetDate &&
      a.scheduledTime === targetTime &&
      a.status !== 'cancelado'
    );

    if (conflict) {
      const [year, month, day] = targetDate.split('-');
      const formattedDate = `${day}/${month}/${year}`;
      return socket.emit('appointment_error', 
        `CONFLITO DE AGENDAMENTO: O(a) ${lawyer.name} já possui um cliente agendado (${conflict.clientName}) no dia ${formattedDate} às ${targetTime}. Por favor, escolha outro horário ou dia.`
      );
    }

    const newAppt = {
      id: 'apt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      clientName: data.clientName,
      clientPhone: data.clientPhone || '',
      notes: data.notes || '',
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

    db.appointments.unshift(newAppt);
    saveData(db);

    io.emit('queue_updated', db.appointments);

    io.to(`lawyer_${lawyer.id}`).emit('new_client_assigned', {
      appointment: newAppt,
      message: `Novo cliente agendado: ${newAppt.clientName} para ${targetDate} às ${targetTime}`
    });

    socket.emit('appointment_created_success', newAppt);
  });

  socket.on('call_client', (appointmentId) => {
    const appt = db.appointments.find(a => a.id === appointmentId);
    if (!appt) return;

    appt.calledAt = new Date().toISOString();
    saveData(db);

    io.emit('queue_updated', db.appointments);

    io.to(`lawyer_${appt.lawyerId}`).emit('client_called_notice', {
      appointment: appt,
      message: `A recepção chamou o cliente ${appt.clientName} para o seu atendimento!`
    });

    io.emit('tv_call_announcement', {
      clientName: appt.clientName,
      lawyerName: appt.lawyerName,
      room: appt.lawyerRoom,
      timestamp: Date.now()
    });
  });

  socket.on('start_consultation', (appointmentId) => {
    const appt = db.appointments.find(a => a.id === appointmentId);
    if (!appt) return;

    appt.status = 'em_atendimento';
    appt.startedAt = new Date().toISOString();
    saveData(db);

    io.emit('queue_updated', db.appointments);
    io.emit('consultation_started_notice', appt);
  });

  socket.on('finish_consultation', (data) => {
    const { appointmentId, finishedByRole } = data;
    const appt = db.appointments.find(a => a.id === appointmentId);
    if (!appt) return;

    appt.status = 'concluido';
    appt.finishedAt = new Date().toISOString();
    saveData(db);

    io.emit('queue_updated', db.appointments);

    io.emit('lawyer_finished_notification', {
      lawyerId: appt.lawyerId,
      lawyerName: appt.lawyerName,
      clientName: appt.clientName,
      finishedByRole: finishedByRole || 'advogado',
      finishedAt: appt.finishedAt,
      message: `O ${appt.lawyerName} finalizou o atendimento de ${appt.clientName}. Chame o próximo cliente para a ${appt.lawyerRoom}!`
    });
  });

  socket.on('cancel_appointment', (appointmentId) => {
    const appt = db.appointments.find(a => a.id === appointmentId);
    if (appt) {
      appt.status = 'cancelado';
      saveData(db);
      io.emit('queue_updated', db.appointments);
    }
  });

  socket.on('clear_daily_queue', () => {
    db.appointments = [];
    saveData(db);
    io.emit('queue_updated', db.appointments);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Desconectado: ${socket.id}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n======================================================');
  console.log('⚖️ COB ADVOGADOS - SISTEMA DE ATENDIMENTO PRONTO');
  console.log('======================================================');
  console.log(`📍 Acesso Local no Servidor:  http://localhost:${PORT}`);
  
  const interfaces = os.networkInterfaces();
  console.log('\n🌐 Endereços para Acesso na REDE LOCAL (LAN):');
  Object.keys(interfaces).forEach((ifname) => {
    interfaces[ifname].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`   👉 http://${iface.address}:${PORT}`);
      }
    });
  });
  console.log('======================================================\n');
});
