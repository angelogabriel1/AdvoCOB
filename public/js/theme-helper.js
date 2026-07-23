// Módulo Global de Alternância de Tema (Modo Escuro / Modo Claro)

const ThemeHelper = {
  getTheme() {
    return localStorage.getItem('cob_theme') || 'dark';
  },

  setTheme(theme) {
    localStorage.setItem('cob_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.updateToggleButton();
  },

  toggleTheme() {
    const current = this.getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  },

  init() {
    const theme = this.getTheme();
    document.documentElement.setAttribute('data-theme', theme);
  },

  renderToggleButton(containerId = 'themeToggleContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <button class="nav-btn" onclick="ThemeHelper.toggleTheme()" id="themeToggleBtn" title="Alternar Tema Claro/Escuro" style="cursor: pointer;">
        <span id="themeIcon">🌙</span> <span id="themeLabel">Modo Escuro</span>
      </button>
    `;
    this.updateToggleButton();
  },

  updateToggleButton() {
    const theme = this.getTheme();
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');

    if (icon && label) {
      if (theme === 'light') {
        icon.innerText = '☀️';
        label.innerText = 'Modo Claro';
      } else {
        icon.innerText = '🌙';
        label.innerText = 'Modo Escuro';
      }
    }
  }
};

// Inicializar tema antes do render da página
ThemeHelper.init();

document.addEventListener('DOMContentLoaded', () => {
  ThemeHelper.renderToggleButton();
});
