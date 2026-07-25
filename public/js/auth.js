// Módulo de Gerenciamento de Sessão e Autenticação

const Auth = {
  getSession() {
    try {
      const raw = localStorage.getItem('cob_adv_session');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  getToken() {
    const session = this.getSession();
    return session && session.token ? session.token : '';
  },

  getAuthHeaders(extraHeaders = {}) {
    const token = this.getToken();
    return {
      ...extraHeaders,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  },

  authFetch(url, options = {}) {
    const headers = this.getAuthHeaders(options.headers || {});
    return fetch(url, { ...options, headers });
  },

  createSocket() {
    const socket = io({
      auth: {
        token: this.getToken()
      }
    });

    socket.on('auth_error', (message) => {
      const text = message || 'Sessao expirada. Faca login novamente.';
      alert(text);
      if (text.toLowerCase().includes('sessao')) {
        this.clearSession();
      }
    });

    return socket;
  },

  setSession(sessionData) {
    localStorage.setItem('cob_adv_session', JSON.stringify(sessionData));
  },

  clearSession() {
    localStorage.removeItem('cob_adv_session');
    localStorage.removeItem('activeLawyerId');
    window.location.href = '/login.html';
  },

  requireAuth(allowedRole = null) {
    const session = this.getSession();
    if (!session) {
      window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
      return null;
    }

    if (allowedRole && session.role !== allowedRole) {
      if (session.role === 'admin') {
        window.location.href = '/admin.html';
      } else if (session.role === 'recepcao') {
        window.location.href = '/recepcao.html';
      } else if (session.role === 'advogado') {
        window.location.href = '/advogado.html';
      } else {
        window.location.href = '/login.html';
      }
      return null;
    }

    return session;
  },

  renderNavbarUser() {
    const session = this.getSession();
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    const oldUserElem = document.getElementById('navbarUserContainer');
    if (oldUserElem) oldUserElem.remove();

    if (session) {
      const userElem = document.createElement('div');
      userElem.id = 'navbarUserContainer';
      userElem.style.display = 'flex';
      userElem.style.alignItems = 'center';
      userElem.style.gap = '0.75rem';

      let roleLabel = 'Usuário';
      if (session.role === 'admin') roleLabel = 'Administrador';
      else if (session.role === 'recepcao') roleLabel = 'Recepção';
      else if (session.role === 'advogado') roleLabel = session.lawyerRoom || 'Advogado';

      userElem.innerHTML = `
        <div class="user-badge">
          <div>
            <strong>${escapeHtml(session.name)}</strong>
            <span style="font-size: 0.7rem; color: var(--cob-silver-bright); display: block;">${roleLabel}</span>
          </div>
        </div>
        <button class="nav-btn" onclick="Auth.clearSession()" style="color: #fca5a5;" title="Sair da Conta">
          Sair
        </button>
      `;
      navLinks.appendChild(userElem);
    } else {
      const loginBtn = document.createElement('a');
      loginBtn.id = 'navbarUserContainer';
      loginBtn.href = '/login.html';
      loginBtn.className = 'btn btn-primary btn-sm';
      loginBtn.innerText = 'Login';
      navLinks.appendChild(loginBtn);
    }
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
  Auth.renderNavbarUser();
});
