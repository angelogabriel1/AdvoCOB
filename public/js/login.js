document.addEventListener('DOMContentLoaded', () => {
  const logoBox = document.getElementById('loginLogoContainer');
  if (logoBox) {
    logoBox.innerHTML = '<img src="/assets/logo.png" alt="COB Advogados" class="cob-logo-img-large">';
  }

  setupAdminRecovery();

  const session = Auth.getSession();
  if (session) {
    redirectUser(session);
  }
});

function redirectUser(session) {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUrl = urlParams.get('redirect');

  if (redirectUrl) {
    window.location.href = redirectUrl;
    return;
  }

  if (session.role === 'admin') {
    window.location.href = '/admin.html';
  } else if (session.role === 'recepcao') {
    window.location.href = '/recepcao.html';
  } else if (session.role === 'advogado') {
    window.location.href = '/advogado.html';
  } else if (session.role === 'contadora') {
    window.location.href = '/contadora.html';
  } else if (session.role === 'gerente') {
    window.location.href = '/gerente.html';
  } else {
    window.location.href = '/';
  }
}

function setInlineAlert(alertBox, message, type = 'error') {
  alertBox.style.background = type === 'success'
    ? 'rgba(16, 185, 129, 0.15)'
    : 'rgba(239, 68, 68, 0.15)';
  alertBox.style.border = type === 'success'
    ? '1px solid rgba(16, 185, 129, 0.4)'
    : '1px solid rgba(239, 68, 68, 0.4)';
  alertBox.style.color = type === 'success' ? '#86efac' : '#fca5a5';
  alertBox.innerText = message;
  alertBox.style.display = 'block';
}

function setupAdminRecovery() {
  const openBtn = document.getElementById('openAdminRecovery');
  const closeBtn = document.getElementById('closeAdminRecovery');
  const modal = document.getElementById('adminRecoveryModal');
  const form = document.getElementById('adminRecoveryForm');
  const recoveryAlert = document.getElementById('recoveryAlert');

  if (!openBtn || !closeBtn || !modal || !form || !recoveryAlert) return;

  openBtn.addEventListener('click', () => {
    recoveryAlert.style.display = 'none';
    form.reset();
    modal.classList.add('active');
    document.getElementById('recoveryCode').focus();
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const recoveryCode = document.getElementById('recoveryCode').value.trim();
    const temporaryPassword = document.getElementById('temporaryAdminPassword').value;

    recoveryAlert.style.display = 'none';

    if (temporaryPassword.length < 8) {
      setInlineAlert(recoveryAlert, 'A senha temporaria deve conter no minimo 8 caracteres.');
      return;
    }

    try {
      const res = await fetch('/api/auth/recover-admin-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryCode, temporaryPassword })
      });

      const data = await res.json();

      if (!res.ok) {
        setInlineAlert(recoveryAlert, data.error || 'Erro ao recuperar senha do administrador.');
        return;
      }

      setInlineAlert(
        recoveryAlert,
        'Senha temporaria redefinida. Entre com usuario admin e essa senha para cadastrar uma nova senha pessoal.',
        'success'
      );
      document.getElementById('username').value = data.username || 'admin';
      document.getElementById('password').value = temporaryPassword;
    } catch (err) {
      console.error(err);
      setInlineAlert(recoveryAlert, 'Erro ao se comunicar com o servidor.');
    }
  });
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const alertBox = document.getElementById('loginAlert');

  alertBox.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alertBox.className = 'card';
      setInlineAlert(alertBox, data.error || 'Erro ao realizar login.');
      return;
    }

    if (data.mustChangePassword) {
      document.getElementById('modalUsername').value = username;
      document.getElementById('modalCurrentPassword').value = password;
      document.getElementById('modalUserDisplay').value = `${data.name} (@${data.username})`;
      
      document.getElementById('changePasswordModal').classList.add('active');
      return;
    }

    Auth.setSession(data.session);
    
    if (data.session.lawyerId) {
      localStorage.setItem('activeLawyerId', data.session.lawyerId);
    }

    redirectUser(data.session);

  } catch (err) {
    console.error(err);
    alertBox.className = 'card';
    alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
    alertBox.style.color = '#fca5a5';
    alertBox.innerText = 'Falha de conexão com o servidor.';
    alertBox.style.display = 'block';
  }
});

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('modalUsername').value;
  const currentPassword = document.getElementById('modalCurrentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const modalAlert = document.getElementById('modalAlert');

  modalAlert.style.display = 'none';

  if (newPassword !== confirmPassword) {
    modalAlert.style.background = 'rgba(239, 68, 68, 0.15)';
    modalAlert.style.color = '#fca5a5';
    modalAlert.innerText = 'As senhas não coincidem. Digite novamente.';
    modalAlert.style.display = 'block';
    return;
  }

  if (newPassword.length < 8) {
    modalAlert.style.background = 'rgba(239, 68, 68, 0.15)';
    modalAlert.style.color = '#fca5a5';
    modalAlert.innerText = 'A senha deve conter no minimo 8 caracteres.';
    modalAlert.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, currentPassword, newPassword })
    });

    const data = await res.json();

    if (!res.ok) {
      modalAlert.style.background = 'rgba(239, 68, 68, 0.15)';
      modalAlert.style.color = '#fca5a5';
      modalAlert.innerText = data.error || 'Erro ao alterar a senha.';
      modalAlert.style.display = 'block';
      return;
    }

    Auth.setSession(data.session);
    if (data.session.lawyerId) {
      localStorage.setItem('activeLawyerId', data.session.lawyerId);
    }

    alert('Senha cadastrada com sucesso! Bem-vindo ao sistema da COB Advogados.');
    redirectUser(data.session);

  } catch (err) {
    console.error(err);
    modalAlert.style.background = 'rgba(239, 68, 68, 0.15)';
    modalAlert.style.color = '#fca5a5';
    modalAlert.innerText = 'Erro ao se comunicar com o servidor.';
    modalAlert.style.display = 'block';
  }
});
