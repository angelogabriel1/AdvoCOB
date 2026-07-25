const session = Auth.requireAuth('recepcao');
const socket = Auth.createSocket();

let lawyers = [];
let appointments = [];
let activeDateFilter = 'hoje';
let activeStatusFilter = 'todos';
let lastFinishedAppointmentId = null;

document.addEventListener('DOMContentLoaded', () => {
  renderCOBBrandHeader('cobBrandHeader');

  const now = new Date();
  const dateInput = document.getElementById('scheduledDate');
  const timeInput = document.getElementById('scheduledTime');

  if (dateInput) {
    dateInput.value = now.toISOString().split('T')[0];
  }
  if (timeInput) {
    timeInput.value = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
});

socket.emit('register_reception');

socket.on('init_data', (data) => {
  lawyers = data.lawyers || [];
  appointments = data.appointments || [];
  renderLawyerOptions();
  renderExportLawyerOptions();
  renderQueue();
});

socket.on('lawyers_updated', (updatedLawyers) => {
  lawyers = updatedLawyers;
  renderLawyerOptions();
  renderExportLawyerOptions();
});

socket.on('queue_updated', (updatedAppointments) => {
  appointments = updatedAppointments;
  renderQueue();
});

socket.on('appointment_error', (msg) => {
  alert(`⚠️ BLOQUEIO DE AGENDAMENTO\n\n${msg}`);
  showToast(msg, 'danger');
});

socket.on('appointment_created_success', () => {
  showToast('Agendamento realizado com sucesso!', 'success');
  document.getElementById('clientName').value = '';
  document.getElementById('clientPhone').value = '';
  document.getElementById('notes').value = '';
});

socket.on('lawyer_finished_notification', (data) => {
  audioService.playNotificationChime();
  showToast(`${data.lawyerName} finalizou atendimento de ${data.clientName}`, 'success');
  lastFinishedAppointmentId = data.appointmentId || null;

  const alertMsg = `O(a) <strong>${data.lawyerName}</strong> finalizou a consulta de <strong>${data.clientName}</strong>.<br><br>Deseja chamar o próximo cliente da fila para este advogado?`;
  const requestsHtml = renderReceptionRequestsAlert(data.receptionRequests);
  document.getElementById('finishAlertMessage').innerHTML = alertMsg.replace('<br><br>', `${requestsHtml}<br><br>`);

  const callNextBtn = document.getElementById('callNextBtn');
  callNextBtn.onclick = () => {
    callNextClientForLawyer(data.lawyerId);
    closeFinishModal();
  };

  document.getElementById('finishAlertModal').classList.add('active');
});

function renderReceptionRequestsAlert(requests) {
  if (!requests) return '';

  const items = [];
  if (requests.reschedule) items.push('Solicitar reagendamento com a recepcao');
  if (requests.copies) items.push('Xerox/copia de documentos');
  if (requests.signature) items.push('Assinatura de documentos');
  if (requests.documents) items.push('Recebimento/conferencia de documentos');

  const note = requests.note ? `<div style="margin-top: 0.65rem;"><strong>Observacao:</strong> ${escapeHtml(requests.note)}</div>` : '';
  if (items.length === 0 && !note) return '';

  const list = items.length > 0
    ? `<ul style="margin: 0.65rem 0 0 1.2rem; padding: 0;">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';

  return `
    <div style="margin-top: 1rem; padding: 0.9rem; border: 1px solid rgba(245, 158, 11, 0.45); border-radius: var(--radius-md); background: rgba(245, 158, 11, 0.1); text-align: left;">
      <strong style="color: var(--accent-gold);">Solicitacoes do advogado para a recepcao</strong>
      ${list}
      ${note}
    </div>
  `;
}

document.getElementById('appointmentForm').addEventListener('submit', (e) => {
  e.preventDefault();
  
  const clientName = document.getElementById('clientName').value.trim();
  const clientPhone = document.getElementById('clientPhone').value.trim();
  const scheduledDate = document.getElementById('scheduledDate').value;
  const scheduledTime = document.getElementById('scheduledTime').value;
  const lawyerId = document.getElementById('lawyerSelect').value;
  const notes = document.getElementById('notes').value.trim();

  if (!clientName || !lawyerId || !scheduledDate || !scheduledTime) {
    alert('Por favor, preencha todos os campos obrigatórios.');
    return;
  }

  socket.emit('create_appointment', {
    clientName,
    clientPhone,
    scheduledDate,
    scheduledTime,
    lawyerId,
    notes
  });
});

function renderLawyerOptions() {
  const select = document.getElementById('lawyerSelect');
  if (!select) return;

  if (lawyers.length === 0) {
    select.innerHTML = '<option value="">Nenhum advogado cadastrado</option>';
    return;
  }

  select.innerHTML = '<option value="">-- Selecione o Advogado --</option>' +
    lawyers.map(l => `<option value="${l.id}">${l.name} (${l.room}) - ${l.specialty}</option>`).join('');
}

function renderExportLawyerOptions() {
  const select = document.getElementById('exportLawyerFilter');
  if (!select) return;

  const currentValue = select.value || 'todos';
  select.innerHTML = '<option value="todos">Todos os Advogados</option>' +
    lawyers.map(l => `<option value="${l.id}">${escapeHtml(l.name)} (${escapeHtml(l.room)})</option>`).join('');
  select.value = lawyers.some(l => l.id === currentValue) ? currentValue : 'todos';
}

function renderQueue() {
  const tbody = document.getElementById('queueTableBody');
  if (!tbody) return;

  const todayStr = new Date().toISOString().split('T')[0];

  let filtered = appointments;

  if (activeDateFilter === 'hoje') {
    filtered = filtered.filter(a => a.scheduledDate === todayStr || (!a.scheduledDate && a.createdAt.startsWith(todayStr)));
  } else if (activeDateFilter === 'futuros') {
    filtered = filtered.filter(a => a.scheduledDate > todayStr);
  }

  if (activeStatusFilter !== 'todos') {
    filtered = filtered.filter(a => a.status === activeStatusFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          Nenhum agendamento encontrado para os filtros selecionados.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    let statusBadge = '';
    if (item.status === 'aguardando') {
      statusBadge = '<span class="badge badge-aguardando">Aguardando</span>';
    } else if (item.status === 'em_atendimento') {
      statusBadge = '<span class="badge badge-em_atendimento">Em Atendimento</span>';
    } else if (item.status === 'concluido') {
      statusBadge = '<span class="badge badge-concluido">Concluído</span>';
    } else if (item.status === 'cancelado') {
      statusBadge = '<span class="badge badge-cancelado">Cancelado</span>';
    }

    let actions = '';
    if (item.status === 'aguardando') {
      actions = `
        <button class="btn btn-primary btn-sm" onclick="callClient('${item.id}')">Chamar</button>
        <button class="btn btn-success btn-sm" onclick="startConsultation('${item.id}')">Iniciar</button>
        ${item.clientPhone ? `<button class="btn btn-whatsapp btn-sm" title="Enviar Lembrete WhatsApp" onclick="sendWhatsAppReminder('${escapeHtml(item.clientPhone)}', '${escapeHtml(item.clientName)}', '${escapeHtml(item.lawyerName)}', '${escapeHtml(item.lawyerRoom)}', '${item.scheduledDate}', '${item.scheduledTime}')">WA</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="cancelAppointment('${item.id}')">X</button>
      `;
    } else if (item.status === 'em_atendimento') {
      actions = `
        <button class="btn btn-primary btn-sm" onclick="finishConsultation('${item.id}')">Finalizar</button>
      `;
    } else {
      actions = `
        ${item.clientPhone ? `<button class="btn btn-whatsapp btn-sm" onclick="sendWhatsAppReminder('${escapeHtml(item.clientPhone)}', '${escapeHtml(item.clientName)}', '${escapeHtml(item.lawyerName)}', '${escapeHtml(item.lawyerRoom)}', '${item.scheduledDate}', '${item.scheduledTime}')">WA</button>` : '<span style="font-size: 0.8rem; color: var(--text-muted);">---</span>'}
      `;
    }

    if (item.status === 'concluido') {
      actions += `<button class="btn btn-secondary btn-sm" onclick="openAppointmentDetails('${item.id}')">Detalhes</button>`;
    }

    const formattedDate = formatDateBR(item.scheduledDate);

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--cob-silver-bright); font-family: monospace;">${item.scheduledTime}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${formattedDate}</div>
        </td>
        <td>
          <div style="font-weight: 600; font-size: 1rem; color: var(--text-main);">${escapeHtml(item.clientName)}</div>
          ${item.clientPhone ? `<div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.clientPhone)}</div>` : ''}
          ${item.notes ? `<div style="font-size: 0.8rem; color: #94a3b8; font-style: italic;">Obs: ${escapeHtml(item.notes)}</div>` : ''}
        </td>
        <td>
          <div style="font-weight: 600; color: var(--cob-silver-bright);">${escapeHtml(item.lawyerName)}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.lawyerRoom)}</div>
        </td>
        <td>${statusBadge}</td>
        <td><div style="display: flex; gap: 0.35rem; align-items: center;">${actions}</div></td>
      </tr>
    `;
  }).join('');
}

function callClient(appointmentId) {
  socket.emit('call_client', appointmentId);
  showToast('Chamada de cliente enviada para o Advogado e Painel de TV.', 'info');
}

function startConsultation(appointmentId) {
  socket.emit('start_consultation', appointmentId);
}

function finishConsultation(appointmentId) {
  if (confirm('Deseja finalizar este atendimento pela Recepção?')) {
    socket.emit('finish_consultation', { appointmentId, finishedByRole: 'recepcionista' });
  }
}

function openAppointmentDetails(appointmentId) {
  const appointment = appointments.find(item => item.id === appointmentId);
  AppointmentDetails.open(appointment);
}

function openLastFinishedAppointmentDetails() {
  if (!lastFinishedAppointmentId) return;
  openAppointmentDetails(lastFinishedAppointmentId);
}

function cancelAppointment(appointmentId) {
  if (confirm('Tem certeza que deseja cancelar este agendamento?')) {
    socket.emit('cancel_appointment', appointmentId);
  }
}

function callNextClientForLawyer(lawyerId) {
  const todayStr = new Date().toISOString().split('T')[0];
  const nextAppt = appointments
    .filter(a => a.lawyerId === lawyerId && a.status === 'aguardando' && (a.scheduledDate === todayStr || !a.scheduledDate))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];

  if (nextAppt) {
    callClient(nextAppt.id);
  } else {
    alert('Não há mais clientes aguardando na fila de hoje para este advogado.');
  }
}

function setDateFilter(filterType) {
  activeDateFilter = filterType;
  const buttons = document.querySelectorAll('#dateFilterButtons .btn');
  buttons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(filterType)) {
      btn.classList.add('active');
    }
  });
  renderQueue();
}

function setStatusFilter(filterType) {
  activeStatusFilter = filterType;
  const buttons = document.querySelectorAll('#statusFilterButtons .btn');
  buttons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(filterType)) {
      btn.classList.add('active');
    }
  });
  renderQueue();
}

function closeFinishModal() {
  document.getElementById('finishAlertModal').classList.remove('active');
}

function clearDailyQueue() {
  if (confirm('ATENÇÃO: Tem certeza que deseja limpar toda a fila do dia?')) {
    socket.emit('clear_daily_queue');
    showToast('Fila zerada com sucesso.', 'info');
  }
}

function exportQueueCSV() {
  const lawyerFilter = document.getElementById('exportLawyerFilter')?.value || 'todos';
  const statusFilter = document.getElementById('exportStatusFilter')?.value || 'concluido';

  let list = appointments;
  if (lawyerFilter !== 'todos') {
    list = list.filter(item => item.lawyerId === lawyerFilter);
  }

  if (statusFilter !== 'todos') {
    list = list.filter(item => item.status === statusFilter);
  }

  list = list.sort((a, b) => new Date(b.finishedAt || b.createdAt) - new Date(a.finishedAt || a.createdAt));

  const lawyerLabel = lawyerFilter === 'todos'
    ? 'todos_advogados'
    : (lawyers.find(item => item.id === lawyerFilter)?.name || 'advogado').replace(/\W+/g, '_').toLowerCase();

  exportAppointmentsCSV(list, `historico_recepcao_${lawyerLabel}_${statusFilter}`);
}

function formatDateBR(dateStr) {
  if (!dateStr) return 'Hoje';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
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
