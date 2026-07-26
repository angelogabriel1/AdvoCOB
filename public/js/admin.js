const session = Auth.requireAuth('admin');
const socket = Auth.createSocket();

let lawyers = [];
let users = [];
let selectedBackupPayload = null;
let selectedBackupPreview = null;

document.addEventListener('DOMContentLoaded', () => {
  renderCOBBrandHeader('cobBrandHeader');
  setupBackupControls();
  loadLawyers();
  loadUsers();
  loadAuditLogs();
  loadSystemHealth();
});

socket.on('lawyers_updated', (updated) => {
  lawyers = updated;
  renderLawyersTable();
  loadUsers();
});

async function loadLawyers() {
  try {
    const res = await Auth.authFetch('/api/lawyers');
    lawyers = await res.json();
    renderLawyersTable();
  } catch (err) {
    console.error(err);
  }
}

async function loadUsers() {
  try {
    const res = await Auth.authFetch('/api/admin/users');
    users = await res.json();
    renderUsersTable();
  } catch (err) {
    console.error(err);
  }
}

function renderLawyersTable() {
  const tbody = document.getElementById('lawyersTableBody');
  if (!tbody) return;

  if (lawyers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          Nenhum advogado cadastrado no sistema.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lawyers.map(l => `
    <tr>
      <td>
        <strong style="color: var(--text-main);">${escapeHtml(l.name)}</strong>
        <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(l.specialty || 'Advogado')}</div>
      </td>
      <td style="color: var(--cob-silver-bright); font-weight: 600;">${escapeHtml(l.room)}</td>
      <td><code style="color: var(--accent-gold);">${escapeHtml(l.username || '---')}</code></td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteLawyer('${l.id}')">Excluir</button>
      </td>
    </tr>
  `).join('');
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          Nenhum usuário encontrado.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map(u => {
    let roleBadge = '';
    if (u.role === 'admin') roleBadge = '<span class="badge" style="background: rgba(139, 38, 53, 0.3); color: #fca5a5; border: 1px solid var(--cob-wine);">Administrador</span>';
    else if (u.role === 'recepcao') roleBadge = '<span class="badge badge-aguardando">Recepção</span>';
    else roleBadge = '<span class="badge badge-concluido">Advogado</span>';

    const pwdStatus = u.mustChangePassword
      ? '<span style="color: var(--accent-gold); font-weight: 600; font-size: 0.8rem;">Pendente (1º Login)</span>'
      : '<span style="color: var(--accent-green); font-weight: 600; font-size: 0.8rem;">Definida</span>';

    const infoExtra = u.role === 'advogado'
      ? `${escapeHtml(u.room || 'Sem Sala')} (${escapeHtml(u.specialty || 'Geral')})`
      : escapeHtml(u.jobTitle || 'Sem cargo informado');

    return `
      <tr>
        <td><code style="color: var(--cob-silver-bright);">${escapeHtml(u.username)}</code></td>
        <td style="font-weight: 600; color: #ffffff;">${escapeHtml(u.name)}</td>
        <td>${roleBadge}</td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">${infoExtra}</td>
        <td>${pwdStatus}</td>
        <td>
          <div style="display: flex; gap: 0.35rem;">
            <button class="btn btn-primary btn-sm" onclick="openEditModal('${u.id}')">
              Editar Conta
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openResetModal('${u.id}', '${escapeHtml(u.name)}', '${escapeHtml(u.username)}')">
              Reset Senha
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function setupBackupControls() {
  const downloadBtn = document.getElementById('downloadBackupBtn');
  const restoreBtn = document.getElementById('restoreBackupBtn');
  const fileInput = document.getElementById('backupFileInput');

  if (downloadBtn) downloadBtn.addEventListener('click', downloadBackup);
  if (restoreBtn) restoreBtn.addEventListener('click', restoreBackup);
  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      selectedBackupPayload = null;
      selectedBackupPreview = null;
      const filename = fileInput.files && fileInput.files[0] ? fileInput.files[0].name : '';
      setBackupSummary(filename ? `Arquivo selecionado: ${filename}\nValidando arquivo...` : '', 'info');

      if (filename) await previewBackupFile();
    });
  }
}

async function downloadBackup() {
  const button = document.getElementById('downloadBackupBtn');
  const originalText = button ? button.textContent : '';

  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Gerando...';
    }

    const res = await Auth.authFetch('/api/admin/backup');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Erro ao gerar backup.');
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `backup_cob_advogados_${new Date().toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setBackupSummary(`Backup baixado: ${filename}`, 'success');
    showToast('Backup completo baixado com sucesso.', 'success');
    loadAuditLogs();
    loadSystemHealth();
  } catch (err) {
    console.error(err);
    setBackupSummary(err.message || 'Erro ao baixar backup.', 'danger');
    showToast('Erro ao baixar backup.', 'danger');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function previewBackupFile() {
  const fileInput = document.getElementById('backupFileInput');
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;

  if (!file) return;

  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    const res = await Auth.authFetch('/api/admin/backup/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Arquivo de backup invalido.');
    }

    selectedBackupPayload = backup;
    selectedBackupPreview = data;
    setBackupSummary(formatBackupPreview(file.name, data), 'info');
  } catch (err) {
    console.error(err);
    selectedBackupPayload = null;
    selectedBackupPreview = null;
    const message = err instanceof SyntaxError ? 'Arquivo JSON invalido.' : (err.message || 'Erro ao validar backup.');
    setBackupSummary(message, 'danger');
  }
}

async function restoreBackup() {
  const fileInput = document.getElementById('backupFileInput');
  const button = document.getElementById('restoreBackupBtn');
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;

  if (!file) {
    alert('Selecione um arquivo de backup primeiro.');
    return;
  }

  if (!selectedBackupPayload) {
    await previewBackupFile();
  }

  if (!selectedBackupPayload) {
    alert('O arquivo selecionado nao passou na validacao.');
    return;
  }

  const confirmation = prompt('Digite RESTAURAR para adicionar ao servidor apenas os dados novos deste backup.');
  if (confirmation !== 'RESTAURAR') {
    return;
  }

  const originalText = button ? button.textContent : '';

  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Restaurando...';
    }

    const res = await Auth.authFetch('/api/admin/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup: selectedBackupPayload })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao restaurar backup.');
    }

    setBackupSummary(formatRestoreSummary(data.summary), 'success');
    showToast('Backup restaurado sem apagar dados atuais.', 'success');
    fileInput.value = '';
    selectedBackupPayload = null;
    selectedBackupPreview = null;
    loadLawyers();
    loadUsers();
    loadAuditLogs();
    loadSystemHealth();
  } catch (err) {
    console.error(err);
    const message = err instanceof SyntaxError ? 'Arquivo JSON invalido.' : (err.message || 'Erro ao restaurar backup.');
    setBackupSummary(message, 'danger');
    showToast('Erro ao restaurar backup.', 'danger');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function formatRestoreSummary(summary = {}) {
  const labels = {
    lawyers: 'Advogados',
    users: 'Usuarios',
    appointments: 'Agendamentos',
    appointmentHistory: 'Historico',
    auditLogs: 'Auditoria'
  };

  return Object.keys(labels).map(key => {
    const item = summary[key] || {};
    return `${labels[key]}: ${item.added || 0} adicionados, ${item.skipped || 0} ignorados por duplicidade`;
  }).join('\n');
}

function formatBackupPreview(filename, data = {}) {
  const counts = data.counts || {};
  return [
    `Arquivo validado: ${filename}`,
    `Conteudo: ${counts.lawyers || 0} advogados, ${counts.users || 0} usuarios, ${counts.appointments || 0} agendamentos, ${counts.appointmentHistory || 0} eventos de historico, ${counts.auditLogs || 0} logs de auditoria.`,
    'Ao restaurar, o sistema vai adicionar apenas itens novos:',
    formatRestoreSummary(data.summary || {})
  ].join('\n');
}

function setBackupSummary(message, type = 'info') {
  const summary = document.getElementById('backupSummary');
  if (!summary) return;

  summary.className = `backup-summary backup-summary-${type}`;
  summary.textContent = message ? message : '';
}

async function loadSystemHealth() {
  const summary = document.getElementById('systemHealthSummary');
  if (!summary) return;

  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const counts = data.counts || {};
    const lastBackup = data.autoBackup && data.autoBackup.last;
    const backupText = lastBackup
      ? `${lastBackup.success ? 'ok' : 'falhou'} em ${formatDateTime(lastBackup.createdAt)}`
      : 'sem registro nesta execucao';

    summary.className = `backup-summary ${data.ok ? 'backup-summary-success' : 'backup-summary-danger'}`;
    summary.textContent = [
      `Status: ${data.ok ? 'online' : 'com erro'} | Banco: ${data.database || data.storage}`,
      `Registros: ${counts.users || 0} usuarios, ${counts.lawyers || 0} advogados, ${counts.appointments || 0} agendamentos, ${counts.appointmentHistory || 0} historicos, ${counts.auditLogs || 0} auditorias.`,
      `Backup automatico: ${data.autoBackup?.enabled ? 'ativo' : 'desativado'} | Ultimo: ${backupText}`
    ].join('\n');
  } catch (err) {
    console.error(err);
    summary.className = 'backup-summary backup-summary-danger';
    summary.textContent = 'Nao foi possivel consultar /api/health.';
  }
}

async function loadAuditLogs() {
  const tbody = document.getElementById('auditLogsTableBody');
  if (!tbody) return;

  try {
    const res = await Auth.authFetch('/api/admin/audit-logs?limit=80');
    const data = await res.json();

    if (!res.ok) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--accent-red); padding: 2rem;">
            ${escapeHtml(data.error || 'Erro ao carregar auditoria.')}
          </td>
        </tr>
      `;
      return;
    }

    renderAuditLogs(data.logs || []);
  } catch (err) {
    console.error(err);
  }
}

function renderAuditLogs(logs) {
  const tbody = document.getElementById('auditLogsTableBody');
  if (!tbody) return;

  if (!logs.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          Nenhuma acao auditada ainda.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logs.map(log => {
    const actor = log.actor || {};
    return `
      <tr>
        <td style="white-space: nowrap;">${escapeHtml(formatDateTime(log.createdAt))}</td>
        <td><code style="color: var(--accent-gold);">${escapeHtml(log.action || '')}</code></td>
        <td>
          <strong>${escapeHtml(actor.name || actor.username || 'Sistema')}</strong>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(actor.role || '')}</div>
        </td>
        <td class="audit-details">${escapeHtml(formatAuditDetails(log.details))}</td>
      </tr>
    `;
  }).join('');
}

function formatAuditDetails(details) {
  if (!details || typeof details !== 'object') return '';

  if (details.summary) return formatRestoreSummary(details.summary);
  if (details.appointmentId) return `Agendamento: ${details.appointmentId}`;
  if (details.targetUsername) return `Usuario: ${details.targetUsername}`;
  if (details.lawyer && details.lawyer.name) return `Advogado: ${details.lawyer.name}`;
  if (details.clearedDate) return `Data: ${details.clearedDate} | Itens: ${details.clearedCount || 0}`;

  return JSON.stringify(details).slice(0, 240);
}

function formatDateTime(value) {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch (err) {
    return value;
  }
}

// Cadastrar Novo Advogado
document.getElementById('addLawyerForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('lawyerName').value.trim();
  const room = document.getElementById('lawyerRoom').value.trim();
  const specialty = document.getElementById('lawyerSpec').value.trim();
  const username = document.getElementById('lawyerUsername').value.trim();
  const password = document.getElementById('lawyerPassword').value.trim() || '12345678';

  if (!name || !room || !username) {
    alert('Preencha todos os campos obrigatórios.');
    return;
  }

  try {
    const res = await Auth.authFetch('/api/lawyers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, room, specialty, username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erro ao cadastrar advogado.');
      return;
    }

    document.getElementById('lawyerName').value = '';
    document.getElementById('lawyerRoom').value = '';
    document.getElementById('lawyerSpec').value = '';
    document.getElementById('lawyerUsername').value = '';
    document.getElementById('lawyerPassword').value = '';

    showToast('Advogado e conta criados com sucesso!', 'success');
    loadLawyers();
    loadUsers();
    loadAuditLogs();
  } catch (err) {
    console.error(err);
  }
});

document.getElementById('addUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('newUserName').value.trim();
  const username = document.getElementById('newUserUsername').value.trim();
  const role = document.getElementById('newUserRole').value;
  const jobTitle = document.getElementById('newUserJobTitle').value.trim();
  const password = document.getElementById('newUserPassword').value.trim() || '12345678';

  if (!name || !username || !role) {
    alert('Preencha nome, usuario e perfil de acesso.');
    return;
  }

  try {
    const res = await Auth.authFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, role, jobTitle, password })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erro ao cadastrar usuario.');
      return;
    }

    document.getElementById('newUserName').value = '';
    document.getElementById('newUserUsername').value = '';
    document.getElementById('newUserRole').value = 'recepcao';
    document.getElementById('newUserJobTitle').value = '';
    document.getElementById('newUserPassword').value = '';

    showToast('Usuario cadastrado com sucesso!', 'success');
    loadUsers();
    loadAuditLogs();
    loadSystemHealth();
  } catch (err) {
    console.error(err);
  }
});

async function deleteLawyer(lawyerId) {
  const lawyer = lawyers.find(item => item.id === lawyerId);
  const label = lawyer ? lawyer.name : 'este advogado';
  const confirmation = prompt(`Digite EXCLUIR para remover ${label} e sua conta de login.`);

  if (confirmation !== 'EXCLUIR') return;

  try {
    const res = await Auth.authFetch(`/api/lawyers/${lawyerId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || 'Erro ao excluir advogado.');
      return;
    }

    showToast('Advogado excluido com sucesso.', 'info');
    loadLawyers();
    loadUsers();
    loadAuditLogs();
  } catch (err) {
    console.error(err);
  }
}

// EDIÇÃO COMPLETA DE USUÁRIO / CONTA
function openEditModal(userId) {
  const targetUser = users.find(u => u.id === userId);
  if (!targetUser) return;

  document.getElementById('editUserId').value = targetUser.id;
  document.getElementById('editName').value = targetUser.name || '';
  document.getElementById('editUsername').value = targetUser.username || '';
  document.getElementById('editJobTitle').value = targetUser.jobTitle || '';
  document.getElementById('editNewPassword').value = '';

  const lawyerFields = document.getElementById('lawyerEditFields');
  if (targetUser.role === 'advogado') {
    lawyerFields.style.display = 'block';
    document.getElementById('editRoom').value = targetUser.room || '';
    document.getElementById('editSpecialty').value = targetUser.specialty || '';
  } else {
    lawyerFields.style.display = 'none';
  }

  document.getElementById('editUserModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editUserModal').classList.remove('active');
}

document.getElementById('editUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const userId = document.getElementById('editUserId').value;
  const name = document.getElementById('editName').value.trim();
  const username = document.getElementById('editUsername').value.trim();
  const jobTitle = document.getElementById('editJobTitle').value.trim();
  const room = document.getElementById('editRoom').value.trim();
  const specialty = document.getElementById('editSpecialty').value.trim();
  const password = document.getElementById('editNewPassword').value.trim();

  if (!userId || !name || !username) {
    alert('Nome e usuário são obrigatórios.');
    return;
  }

  try {
    const res = await Auth.authFetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, room, specialty, jobTitle, password })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erro ao atualizar usuário.');
      return;
    }

    closeEditModal();
    showToast('Dados da conta atualizados com sucesso!', 'success');

    // Se editou a própria conta do admin logado, atualizar sessão local
    const currentSession = Auth.getSession();
    if (currentSession && currentSession.userId === userId) {
      currentSession.name = name;
      currentSession.username = username;
      Auth.setSession(currentSession);
      Auth.renderNavbarUser();
    }

    loadUsers();
    loadLawyers();
    loadAuditLogs();
  } catch (err) {
    console.error(err);
  }
});

// Reset de Senha pelo Admin
function openResetModal(userId, name, username) {
  document.getElementById('resetUserId').value = userId;
  document.getElementById('resetUserDisplay').value = `${name} (@${username})`;
  document.getElementById('adminNewPassword').value = '12345678';
  document.getElementById('resetPasswordModal').classList.add('active');
}

function closeResetModal() {
  document.getElementById('resetPasswordModal').classList.remove('active');
}

document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const userId = document.getElementById('resetUserId').value;
  const newPassword = document.getElementById('adminNewPassword').value.trim();

  if (!userId || !newPassword) return;

  try {
    const res = await Auth.authFetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newPassword })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erro ao redefinir senha.');
      return;
    }

    closeResetModal();
    showToast('Senha redefinida com sucesso. O usuário deverá cadastrar nova senha no próximo login.', 'success');
    loadUsers();
    loadAuditLogs();
  } catch (err) {
    console.error(err);
  }
});

function clearDailyQueue() {
  const confirmation = prompt('Digite ZERAR para cancelar toda a fila ativa do dia.');
  if (confirmation !== 'ZERAR') return;

  socket.emit('clear_daily_queue');
  showToast('Fila do dia limpa com sucesso.', 'info');
  setTimeout(loadAuditLogs, 500);
}

function showToast(text, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div>${escapeHtml(text)}</div>`;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
