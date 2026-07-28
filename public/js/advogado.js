const session = Auth.requireAuth('advogado');

const socket = Auth.createSocket();

let currentLawyer = null;
let lawyers = [];
let appointments = [];
let paymentRequests = [];
let timerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  renderCOBBrandHeader('cobBrandHeader');

  const finishForm = document.getElementById('finishConsultationForm');
  if (finishForm) {
    finishForm.addEventListener('submit', submitFinishConsultation);
  }

  const paymentForm = document.getElementById('paymentRequestForm');
  if (paymentForm) {
    paymentForm.addEventListener('submit', submitPaymentRequest);
  }

  if (session && session.role === 'admin') {
    Auth.authFetch('/api/lawyers')
      .then(res => res.json())
      .then(data => {
        lawyers = data;
        renderAdminLawyerSwitcher();
        const savedLawyerId = localStorage.getItem('adminActiveLawyerId');
        const selectedLawyer = lawyers.find(l => l.id === savedLawyerId) || lawyers[0];
        if (selectedLawyer) setupLawyerProfile(selectedLawyer);
      });
    return;
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
  if (session && session.role === 'admin') {
    localStorage.setItem('adminActiveLawyerId', lawyer.id);
    const select = document.getElementById('adminLawyerSelect');
    if (select) select.value = lawyer.id;
  }

  const titleElem = document.getElementById('lawyerTitle');
  const subTitleElem = document.getElementById('lawyerSubTitle');
  if (titleElem) titleElem.innerText = `${lawyer.name}`;
  if (subTitleElem) subTitleElem.innerText = `${lawyer.room} • ${lawyer.specialty}`;

  socket.emit('register_lawyer_room', lawyer.id);
  loadPaymentRequests();
  renderLawyerView();
}

function renderAdminLawyerSwitcher() {
  const mainContent = document.getElementById('lawyerMainContent');
  if (!mainContent || document.getElementById('adminLawyerSwitcher')) return;

  mainContent.insertAdjacentHTML('afterbegin', `
    <div id="adminLawyerSwitcher" class="card" style="margin-bottom: 1rem;">
      <div class="card-title">
        <span>Acesso do Administrador</span>
      </div>
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <label for="adminLawyerSelect" style="color: var(--text-muted); font-weight: 700;">Visualizar painel de:</label>
        <select id="adminLawyerSelect" class="form-control" style="max-width: 360px;" onchange="selectAdminLawyerPanel(this.value)">
          ${lawyers.map(lawyer => `<option value="${lawyer.id}">${escapeHtml(lawyer.name)} (${escapeHtml(lawyer.room)})</option>`).join('')}
        </select>
      </div>
    </div>
  `);
}

function selectAdminLawyerPanel(lawyerId) {
  const lawyer = lawyers.find(item => item.id === lawyerId);
  if (lawyer) setupLawyerProfile(lawyer);
}

socket.on('init_data', (data) => {
  lawyers = data.lawyers || [];
  appointments = data.appointments || [];
  paymentRequests = data.paymentRequests || paymentRequests;
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

socket.on('payment_requests_updated', (updatedRequests) => {
  paymentRequests = updatedRequests || [];
  renderPaymentRequests();
});

socket.on('payment_request_notice', (data) => {
  if (!data || !data.request) return;
  if (currentLawyer && data.request.lawyerId !== currentLawyer.id) return;
  paymentRequests = upsertPaymentRequest(paymentRequests, data.request);
  renderPaymentRequests();
  audioService.playLawyerAlertBell();
  showToast(data.message || 'Solicitacao de guia atualizada.', 'success');
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
  renderPaymentRequests();
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

async function loadPaymentRequests() {
  try {
    const res = await Auth.authFetch('/api/payment-requests');
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao carregar solicitacoes.');
    }

    paymentRequests = data || [];
    renderPaymentRequests();
  } catch (err) {
    console.error(err);
  }
}

async function submitPaymentRequest(event) {
  event.preventDefault();

  const processNumber = document.getElementById('paymentProcessNumber').value.trim();
  const clientName = document.getElementById('paymentClientName').value.trim();
  const guideAmount = document.getElementById('paymentAmount').value.trim();
  const notes = document.getElementById('paymentNotes').value.trim();

  if (!processNumber) {
    alert('Informe o numero do processo.');
    return;
  }

  if (!guideAmount) {
    alert('Informe o valor do pagamento.');
    return;
  }

  try {
    const res = await Auth.authFetch('/api/payment-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        processNumber,
        clientName,
        guideAmount,
        notes,
        lawyerId: currentLawyer ? currentLawyer.id : null
      })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erro ao criar solicitacao.');
      return;
    }

    paymentRequests = upsertPaymentRequest(paymentRequests, data.request);
    renderPaymentRequests();
    event.target.reset();
    showToast('Solicitacao enviada para contadora e gerente.', 'success');
  } catch (err) {
    console.error(err);
    alert('Erro ao se comunicar com o servidor.');
  }
}

function upsertPaymentRequest(list, request) {
  const withoutCurrent = (list || []).filter(item => item.id !== request.id);
  return [request, ...withoutCurrent].sort((a, b) =>
    new Date(b.updatedAt || b.requestedAt || 0) - new Date(a.updatedAt || a.requestedAt || 0)
  );
}

function renderPaymentRequests() {
  const container = document.getElementById('lawyerPaymentRequests');
  if (!container) return;

  const mine = currentLawyer
    ? paymentRequests.filter(item => item.lawyerId === currentLawyer.id)
    : paymentRequests;

  if (!mine.length) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 1rem;">
        Nenhuma solicitacao de guia enviada.
      </div>
    `;
    return;
  }

  container.innerHTML = mine.map(item => `
    <div style="background: rgba(11, 14, 20, 0.45); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.9rem 1rem;">
      <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap;">
        <div>
          <strong style="color: var(--text-main);">${escapeHtml(item.processNumber)}</strong>
          ${item.clientName ? `<div style="font-size: 0.82rem; color: var(--text-muted);">Cliente: ${escapeHtml(item.clientName)}</div>` : ''}
          <div style="font-size: 0.82rem; color: var(--cob-silver-bright); margin-top: 0.2rem;"><strong>Valor solicitado:</strong> ${escapeHtml(item.guideAmount || 'Nao informado')}</div>
          ${item.notes ? `<div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem;">${escapeHtml(item.notes)}</div>` : ''}
        </div>
        ${renderPaymentStatusBadge(item.status)}
      </div>
      ${renderGuideSummary(item)}
      ${renderReceiptSummary(item)}
      <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">Solicitado em ${formatDateTime(item.requestedAt)}</div>
    </div>
  `).join('');
}

function renderPaymentStatusBadge(status) {
  const labels = {
    solicitada: 'Solicitada',
    guia_gerada: 'Guia pronta',
    pago: 'Pago'
  };
  const classes = {
    solicitada: 'badge-aguardando',
    guia_gerada: 'badge-em_atendimento',
    pago: 'badge-concluido'
  };

  return `<span class="badge ${classes[status] || 'badge-aguardando'}">${labels[status] || 'Solicitada'}</span>`;
}

function renderGuideSummary(item) {
  if (!item.guideText && !item.guideLink && !item.guideFileName && !item.guideDueDate) return '';

  return `
    <div style="border-top: 1px solid var(--border-color); margin-top: 0.75rem; padding-top: 0.75rem; font-size: 0.82rem; color: var(--cob-silver-bright);">
      <strong>Guia:</strong>
      ${item.guideDueDate ? `<span style="margin-left: 0.4rem;">Vencimento: ${formatDateBR(item.guideDueDate)}</span>` : ''}
      ${item.guideText ? `<div style="color: var(--text-muted); margin-top: 0.25rem;">${escapeHtml(item.guideText)}</div>` : ''}
      ${renderGuideFileButton(item)}
      ${renderSafeLink(item.guideLink, 'Abrir guia')}
    </div>
  `;
}

function renderGuideFileButton(item) {
  if (!item.guideFileUrl || !item.guideFileName) return '';
  return `
    <div style="color: var(--text-muted); margin-top: 0.35rem; overflow-wrap: anywhere;">${escapeHtml(item.guideFileName)}</div>
    <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 0.5rem;" onclick="downloadGuideFile('${item.id}')">Baixar arquivo</button>
  `;
}

async function downloadGuideFile(requestId) {
  const item = paymentRequests.find(request => request.id === requestId);
  if (!item || !item.guideFileUrl) return;

  try {
    await Auth.downloadFile(item.guideFileUrl, item.guideFileName || 'guia');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Erro ao baixar a guia.', 'danger');
  }
}

function renderReceiptSummary(item) {
  if (!item.paymentReceiptText && !item.paymentReceiptLink && !item.paymentReceiptFileName) return '';

  return `
    <div style="border-top: 1px solid var(--border-color); margin-top: 0.75rem; padding-top: 0.75rem; font-size: 0.82rem; color: var(--accent-green);">
      <strong>Comprovante disponivel:</strong>
      ${item.paymentReceiptText ? `<div style="color: var(--text-muted); margin-top: 0.25rem;">${escapeHtml(item.paymentReceiptText)}</div>` : ''}
      ${renderReceiptFileButton(item)}
      ${renderSafeLink(item.paymentReceiptLink, 'Abrir comprovante')}
      ${item.paidAt ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">Pago em ${formatDateTime(item.paidAt)}</div>` : ''}
    </div>
  `;
}

function renderReceiptFileButton(item) {
  if (!item.paymentReceiptFileUrl || !item.paymentReceiptFileName) return '';
  return `
    <div style="color: var(--text-muted); margin-top: 0.35rem; overflow-wrap: anywhere;">${escapeHtml(item.paymentReceiptFileName)}</div>
    <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 0.5rem;" onclick="downloadReceiptFile('${item.id}')">Baixar comprovante</button>
  `;
}

async function downloadReceiptFile(requestId) {
  const item = paymentRequests.find(request => request.id === requestId);
  if (!item || !item.paymentReceiptFileUrl) return;

  try {
    await Auth.downloadFile(item.paymentReceiptFileUrl, item.paymentReceiptFileName || 'comprovante');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Erro ao baixar o comprovante.', 'danger');
  }
}

function renderSafeLink(url, label) {
  if (!url) return '';
  const cleanUrl = String(url).trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    return `<div style="color: var(--text-muted); margin-top: 0.25rem;">Link: ${escapeHtml(cleanUrl)}</div>`;
  }
  return `<a href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="margin-top: 0.5rem;">${escapeHtml(label)}</a>`;
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

function exportLawyerHistoryCSV() {
  if (!currentLawyer) {
    alert('Selecione um advogado antes de exportar.');
    return;
  }

  const history = appointments
    .filter(item => item.lawyerId === currentLawyer.id && item.status === 'concluido')
    .sort((a, b) => new Date(b.finishedAt || b.createdAt) - new Date(a.finishedAt || a.createdAt));

  exportAppointmentsCSV(history, `historico_consultas_${currentLawyer.name.replace(/\W+/g, '_').toLowerCase()}`);
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

function openAppointmentDetails(appointmentId) {
  const appointment = appointments.find(item => item.id === appointmentId);
  AppointmentDetails.open(appointment);
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
          <button class="btn btn-secondary btn-sm" style="margin-top: 0.6rem;" onclick="openAppointmentDetails('${item.id}')">Detalhes</button>
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

function showToast(text, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) {
    alert(text);
    return;
  }

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
