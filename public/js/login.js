document.addEventListener('DOMContentLoaded', () => {
  const logoBox = document.getElementById('loginLogoContainer');
  if (logoBox) {
    logoBox.innerHTML = '<img src="/assets/logo.png" alt="COB Advogados" class="cob-logo-img-large">';
  }

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
  } else {
    window.location.href = '/';
  }
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
      alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
      alertBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
      alertBox.style.color = '#fca5a5';
      alertBox.innerText = data.error || 'Erro ao realizar login.';
      alertBox.style.display = 'block';
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
