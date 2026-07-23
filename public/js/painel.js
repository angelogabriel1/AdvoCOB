const socket = io();

let recentCalls = [];

// Relógio em tempo real
function updateClock() {
  const clockElem = document.getElementById('tvClock');
  if (clockElem) {
    const now = new Date();
    clockElem.innerText = now.toLocaleTimeString('pt-BR');
  }
}
setInterval(updateClock, 1000);
updateClock();

// Registrar Painel da TV
socket.emit('register_tv_panel');

function enableAudio() {
  audioService.init();
  const notice = document.getElementById('audioNotice');
  if (notice) {
    notice.style.display = 'none';
  }
  audioService.playNotificationChime();
}

document.addEventListener('click', enableAudio, { once: true });

// RECEBER ANÚNCIO DE CHAMADA NA TV
socket.on('tv_call_announcement', (data) => {
  console.log('Chamada na TV recebida:', data);

  // Atualizar Tela Principal
  const clientElem = document.getElementById('tvClientName');
  const roomElem = document.getElementById('tvLawyerRoom');
  const boxElem = document.getElementById('mainCallBox');

  if (clientElem) clientElem.innerText = data.clientName;
  if (roomElem) roomElem.innerText = `${data.lawyerName} — ${data.room}`;

  // Efeito de Animação e Destaque
  if (boxElem) {
    boxElem.style.transform = 'scale(1.03)';
    boxElem.style.borderColor = '#fbbf24';
    boxElem.style.boxShadow = '0 0 60px rgba(245, 158, 11, 0.6)';

    setTimeout(() => {
      boxElem.style.transform = 'scale(1)';
      boxElem.style.boxShadow = '0 25px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(245, 158, 11, 0.25)';
    }, 1500);
  }

  // Tocar Sinal Sonoro
  audioService.playNotificationChime();

  // Síntese de Voz (TTS) em Português
  setTimeout(() => {
    const textToSpeak = `Atenção: Cliente ${data.clientName}, por favor dirija-se à ${data.room} com o Doutor ${data.lawyerName}`;
    audioService.speak(textToSpeak);
  }, 1000);

  // Adicionar às Chamadas Recentes
  recentCalls.unshift(data);
  if (recentCalls.length > 4) recentCalls.pop();
  renderRecentCalls();
});

function renderRecentCalls() {
  const container = document.getElementById('recentCallsContainer');
  if (!container) return;

  if (recentCalls.length <= 1) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">Nenhuma chamada anterior.</div>';
    return;
  }

  // Exibir a partir da 2ª chamada mais recente
  const pastCalls = recentCalls.slice(1);

  container.innerHTML = pastCalls.map(c => `
    <div class="recent-card">
      <div style="font-weight: 700; color: #ffffff; font-size: 1.05rem;">${escapeHtml(c.clientName)}</div>
      <div style="font-size: 0.8rem; color: var(--accent-gold);">${escapeHtml(c.lawyerName)} (${escapeHtml(c.room)})</div>
    </div>
  `).join('');
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
