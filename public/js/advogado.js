const session = Auth.requireAuth('advogado');

const socket = Auth.createSocket();

let currentLawyer = null;
let lawyers = [];
let appointments = [];
let timerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  renderCOBBrandHeader('cobBrandHeader');

  const finishForm = document.getElementById('finishConsultationForm');
  if (finishForm) {
    finishForm.addEventListener('submit', submitFinishConsultation);
  }

  if (session && session.lawyerId) {
    Auth.authFetch('/api/lawyers')
      .then(res => res.json())
      .then(data => {
        lawyers = data;
        const found = lawyers.find(l => l.id === session.lawyerId);
        if (found) {
          setupLawyerProfile(found);
        } else {
          alert('Perfil de advogado não encontrado no servidor.');
        }
      });
  }
});

function setupLawyerProfile(lawyer) {
  currentLawyer = lawyer;

  const titleElem = document.getElementById('lawyerTitle');
  const subTitleElem = document.getElementById('lawyerSubTitle');
  if (titleElem) titleElem.innerText = `${lawyer.name}`;
  if (subTitleElem) subTitleElem.innerText = `${lawyer.room} • ${lawyer.specialty}`;

  socket.emit('register_lawyer_room', lawyer.id);
  renderLawyerView();
}

socket.on('init_data', (data) => {
  lawyers = data.lawyers || [];
  appointments = data.appointments || [];
  if (currentLawyer) {
    renderLawyerView();
  }
});

socket.on('queue_updated', (updatedAppointments) => {
  appointments = updatedAppointments;
  if (currentLawyer) {
    renderLawyerView();
  }
});

socket.on('new_client_assigned', (data) => {
  handleIncomingClientNotice(data.appointment);
});

socket.on('client_called_notice', (data) => {
  handleIncomingClientNotice(data.appointment);
});

function handleIncomingClientNotice(appt) {
  if (!currentLawyer || appt.lawyerId !== currentLawyer.id) return;

  audioService.playLawyerAlertBell();

  document.getElementById('alertClientName').innerText = appt.clientName;
  document.getElementById('alertClientTime').innerText = `${formatDateBR(appt.scheduledDate)} às ${appt.scheduledTime}`;
  document.getElementById('alertClientPhone').innerText = appt.clientPhone ? `Contato: ${appt.clientPhone}` : '';
  document.getElementById('alertClientNotes').innerText = appt.notes ? `Obs: ${appt.notes}` : '';

  const startBtn = document.getElementById('startDirectlyBtn');
  startBtn.onclick = () => {
    socket.emit('start_consultation', appt.id);
    closeNewClientAlert();
  };

  document.getElementById('newClientAlertModal').classList.add('active');
}

function closeNewClientAlert() {
  document.getElementById('newClientAlertModal').classList.remove('active');
}

function renderLawyerView() {
  if (!currentLawyer) return;

  const todayStr = new Date().toISOString().split('T')[0];

  const myAppointments = appointments.filter(a => a.lawyerId === currentLawyer.id);

  // Cliente em atendimento
  const activeAppt = myAppointments.find(a => a.status === 'em_atendimento');
  
  // Clientes aguardando hoje
  const waitingAppts = myAppointments
    .filter(a => a.status === 'aguardando' && (a.scheduledDate === todayStr || (!a.scheduledDate && a.createdAt.startsWith(todayStr))))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Clientes futuros (próximos dias)
  const futureAppts = myAppointments
    .filter(a => a.status === 'aguardando' && a.scheduledDate > todayStr)
    .sort((a, b) => (a.scheduledDate + a.scheduledTime).localeCompare(b.scheduledDate + b.scheduledTime));

  // Concluídos hoje
  const completedAppts = myAppointments
    .filter(a => a.status === 'concluido' && (a.finishedAt ? a.finishedAt.startsWith(todayStr) : true))
    .sort((a, b) => new Date(b.finishedAt || b.createdAt) - new Date(a.finishedAt || a.createdAt));

  renderActiveConsultationCard(activeAppt);
  renderWaitingList(waitingAppts);
  renderFutureList(futureAppts);
  renderCompletedList(completedAppts);
}

function renderActiveConsultationCard(activeAppt) {
  const container = document.getElementById('activeConsultationSection');
  if (!container) return;

  if (timerInterval) clearInterval(timerInterval);

  if (!activeAppt) {
    container.innerHTML = `
      <div class="card" style="background: rgba(24, 32, 46, 0.4); text-align: center; padding: 2.5rem; border: 1px dashed var(--border-color);">
        <h3 style="font-size: 1.3rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">Nenhum atendimento em andamento no momento</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Selecione um cliente da sua fila de hoje abaixo e clique em "Iniciar Atendimento".</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="current-client-card">
      <div class="current-client-header">
        <div>
          <span class="badge badge-em_atendimento">ATENDIMENTO EM ANDAMENTO</span>
          <h2 class="current-client-name">${escapeHtml(activeAppt.clientName)}</h2>
          ${activeAppt.clientPhone ? `<div style="color: var(--text-muted); font-size: 1rem;">📞 ${escapeHtml(activeAppt.clientPhone)}</div>` : ''}
          ${activeAppt.notes ? `<div style="color: #94a3b8; font-size: 0.95rem; margin-top: 0.5rem; font-style: italic;">Obs: ${escapeHtml(activeAppt.notes)}</div>` : ''}
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Tempo de Consulta</div>
          <div id="liveTimerBox" class="timer-box">00:00:00</div>
        </div>
      </div>

      <div style="display: flex; gap: 1rem; margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem;">
        <button class="btn btn-primary btn-full" style="font-size: 1.15rem; padding: 1rem;" onclick="finishActiveConsultation('${activeAppt.id}')">
          FINALIZAR ATENDIMENTO (Notificar Recepcionista)
        </button>
      </div>
    </div>
  `;

  const startTime = new Date(activeAppt.startedAt || new Date()).getTime();
  const timerElem = document.getElementById('liveTimerBox');

  function updateTimer() {
    const now = new Date().getTime();
    const diff = Math.max(0, now - startTime);

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, '0');
    if (timerElem) {
      timerElem.innerText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
  }

  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function finishActiveConsultation(appointmentId) {
  const appointmentInput = document.getElementById('finishAppointmentId');
  if (appointmentInput) appointmentInput.value = appointmentId;

  ['requestReschedule', 'requestCopies', 'requestSignature', 'requestDocuments'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.checked = false;
  });

  const noteInput = document.getElementById('finishReceptionNote');
  if (noteInput) noteInput.value = '';

  document.getElementById('finishConsultationModal').classList.add('active');
}

function closeFinishConsultationModal() {
  document.getElementById('finishConsultationModal').classList.remove('active');
}

function submitFinishConsultation(event) {
  event.preventDefault();

  const appointmentId = document.getElementById('finishAppointmentId').value;
  if (!appointmentId) return;

  const receptionRequests = {
    reschedule: document.getElementById('requestReschedule').checked,
    copies: document.getElementById('requestCopies').checked,
    signature: document.getElementById('requestSignature').checked,
    documents: document.getElementById('requestDocuments').checked,
    note: document.getElementById('finishReceptionNote').value.trim()
  };

  audioService.playFinishChime();

  socket.emit('finish_consultation', {
    appointmentId,
    finishedByRole: 'advogado',
    receptionRequests
  });

  closeFinishConsultationModal();
}

function renderReceptionRequestsSummary(requests) {
  if (!requests) return '';

  const labels = [];
  if (requests.reschedule) labels.push('Reagendamento');
  if (requests.copies) labels.push('Xerox/copia');
  if (requests.signature) labels.push('Assinatura');
  if (requests.documents) labels.push('Conferencia de documentos');

  const note = requests.note ? `<div style="font-size: 0.78rem; color: #94a3b8; margin-top: 0.25rem;">Recado: ${escapeHtml(requests.note)}</div>` : '';
  if (labels.length === 0 && !note) return '';

  return `
    <div style="font-size: 0.8rem; color: var(--accent-gold); margin-top: 0.35rem;">
      Solicitado a recepcao: ${labels.map(escapeHtml).join(', ') || 'observacao'}
      ${note}
    </div>
  `;
}

function renderWaitingList(waitingAppts) {
  const container = document.getElementById('waitingList');
  const countElem = document.getElementById('waitingCount');
  if (!container) return;

  if (countElem) countElem.innerText = waitingAppts.length;

  if (waitingAppts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
        Nenhum cliente aguardando na fila de hoje.
      </div>
    `;
    return;
  }

  container.innerHTML = waitingAppts.map(item => `
    <div style="background: rgba(11, 14, 20, 0.6); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
          <span style="font-weight: 700; color: var(--cob-silver-bright); font-family: monospace;">${item.scheduledTime}</span>
          <strong style="font-size: 1.05rem; color: var(--text-main);">${escapeHtml(item.clientName)}</strong>
        </div>
        ${item.clientPhone ? `<div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.clientPhone)}</div>` : ''}
        ${item.notes ? `<div style="font-size: 0.8rem; color: #94a3b8; font-style: italic;">Obs: ${escapeHtml(item.notes)}</div>` : ''}
      </div>
      <button class="btn btn-success" onclick="startConsultation('${item.id}')">
        Iniciar
      </button>
    </div>
  `).join('');
}

function renderFutureList(futureAppts) {
  const container = document.getElementById('futureList');
  const countElem = document.getElementById('futureCount');
  if (!container) return;

  if (countElem) countElem.innerText = futureAppts.length;

  if (futureAppts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
        Nenhum agendamento futuro marcado.
      </div>
    `;
    return;
  }

  container.innerHTML = futureAppts.map(item => `
    <div style="background: rgba(11, 14, 20, 0.4); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <strong style="color: var(--text-main); font-size: 0.95rem;">${escapeHtml(item.clientName)}</strong>
        <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.clientPhone || 'Sem telefone')}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: 700; color: var(--accent-gold); font-size: 0.9rem;">${formatDateBR(item.scheduledDate)}</div>
        <div style="font-size: 0.8rem; color: var(--cob-silver-bright); font-family: monospace;">às ${item.scheduledTime}</div>
      </div>
    </div>
  `).join('');
}

function startConsultation(appointmentId) {
  socket.emit('start_consultation', appointmentId);
}

function renderCompletedList(completedAppts) {
  const container = document.getElementById('completedList');
  if (!container) return;

  if (completedAppts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 1rem;">
        Nenhum atendimento finalizado hoje ainda.
      </div>
    `;
    return;
  }

  container.innerHTML = completedAppts.map(item => {
    const finishedTime = item.finishedAt ? new Date(item.finishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    return `
      <div style="background: rgba(11, 14, 20, 0.4); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: var(--text-main); font-size: 0.95rem;">${escapeHtml(item.clientName)}</strong>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Agendado: ${formatDateBR(item.scheduledDate)} às ${item.scheduledTime}</div>
          ${renderReceptionRequestsSummary(item.receptionRequests)}
        </div>
        <div style="font-size: 0.85rem; color: var(--accent-green); font-weight: 600;">
          Concluído às ${finishedTime}
        </div>
      </div>
    `;
  }).join('');
}

function formatDateBR(dateStr) {
  if (!dateStr) return 'Hoje';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
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
