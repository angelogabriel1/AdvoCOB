const session = Auth.requireAuth('admin');
const socket = Auth.createSocket();

let lawyers = [];
let users = [];

document.addEventListener('DOMContentLoaded', () => {
  renderCOBBrandHeader('cobBrandHeader');
  loadLawyers();
  loadUsers();
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

    const infoExtra = u.role === 'advogado' ? `${escapeHtml(u.room || 'Sem Sala')} (${escapeHtml(u.specialty || 'Geral')})` : '---';

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
  } catch (err) {
    console.error(err);
  }
});

async function deleteLawyer(lawyerId) {
  if (confirm('Tem certeza que deseja excluir este advogado e remover sua conta de login?')) {
    try {
      const res = await Auth.authFetch(`/api/lawyers/${lawyerId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Advogado excluído com sucesso.', 'info');
        loadLawyers();
        loadUsers();
      }
    } catch (err) {
      console.error(err);
    }
  }
}

// EDIÇÃO COMPLETA DE USUÁRIO / CONTA
function openEditModal(userId) {
  const targetUser = users.find(u => u.id === userId);
  if (!targetUser) return;

  document.getElementById('editUserId').value = targetUser.id;
  document.getElementById('editName').value = targetUser.name || '';
  document.getElementById('editUsername').value = targetUser.username || '';
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
      body: JSON.stringify({ name, username, room, specialty, password })
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
  } catch (err) {
    console.error(err);
  }
});

function clearDailyQueue() {
  if (confirm('ATENÇÃO: Tem certeza que deseja limpar toda a fila de atendimentos do dia?')) {
    socket.emit('clear_daily_queue');
    showToast('Fila do dia limpa com sucesso.', 'info');
  }
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
