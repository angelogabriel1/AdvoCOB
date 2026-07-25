const session = Auth.requireAuth('recepcao');
const socket = Auth.createSocket();

let lawyers = [];
let appointments = [];
let historyEvents = [];
let filteredAppointments = [];
let filteredEvents = [];

document.addEventListener('DOMContentLoaded', () => {
  renderCOBBrandHeader('cobBrandHeader');
  setupFilters();
  loadHistoryData();
});

socket.on('queue_updated', () => {
  loadHistoryData();
});

async function loadHistoryData() {
  try {
    const [lawyersRes, historyRes] = await Promise.all([
      Auth.authFetch('/api/lawyers'),
      Auth.authFetch('/api/history')
    ]);

    lawyers = await lawyersRes.json();
    const data = await historyRes.json();
    appointments = data.appointments || [];
    historyEvents = data.history || [];

    renderLawyerFilters();
    renderEditLawyerOptions();
    applyHistoryFilters();
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar histórico.', 'danger');
  }
}

function setupFilters() {
  ['historySearch', 'historyLawyerFilter', 'historyStatusFilter', 'historyFromDate', 'historyToDate'].forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener('input', applyHistoryFilters);
    element.addEventListener('change', applyHistoryFilters);
  });

  const form = document.getElementById('editAppointmentForm');
  if (form) form.addEventListener('submit', saveAppointmentChanges);
}

function renderLawyerFilters() {
  const select = document.getElementById('historyLawyerFilter');
  if (!select) return;

  const currentValue = select.value || 'todos';
  select.innerHTML = '<option value="todos">Todos</option>' +
    lawyers.map(lawyer => `<option value="${lawyer.id}">${escapeHtml(lawyer.name)} (${escapeHtml(lawyer.room)})</option>`).join('');
  select.value = lawyers.some(lawyer => lawyer.id === currentValue) ? currentValue : 'todos';
}

function renderEditLawyerOptions() {
  const select = document.getElementById('editLawyerSelect');
  if (!select) return;

  select.innerHTML = lawyers.map(lawyer => `<option value="${lawyer.id}">${escapeHtml(lawyer.name)} (${escapeHtml(lawyer.room)})</option>`).join('');
}

function applyHistoryFilters() {
  const search = normalizeText(document.getElementById('historySearch')?.value || '');
  const lawyerId = document.getElementById('historyLawyerFilter')?.value || 'todos';
  const status = document.getElementById('historyStatusFilter')?.value || 'todos';
  const fromDate = document.getElementById('historyFromDate')?.value || '';
  const toDate = document.getElementById('historyToDate')?.value || '';

  filteredAppointments = appointments.filter(item => {
    const appointmentDate = item.scheduledDate || (item.createdAt || '').slice(0, 10);
    const searchable = normalizeText([
      item.clientName,
      item.clientPhone,
      item.lawyerName,
      item.lawyerRoom,
      item.notes,
      item.status
    ].join(' '));

    return (!search || searchable.includes(search)) &&
      (lawyerId === 'todos' || item.lawyerId === lawyerId) &&
      (status === 'todos' || item.status === status) &&
      (!fromDate || appointmentDate >= fromDate) &&
      (!toDate || appointmentDate <= toDate);
  }).sort((a, b) => {
    const left = `${b.scheduledDate || ''} ${b.scheduledTime || ''} ${b.createdAt || ''}`;
    const right = `${a.scheduledDate || ''} ${a.scheduledTime || ''} ${a.createdAt || ''}`;
    return left.localeCompare(right);
  });

  const filteredAppointmentIds = new Set(filteredAppointments.map(item => item.id));

  filteredEvents = historyEvents.filter(event => {
    const eventDate = (event.createdAt || '').slice(0, 10);
    const appointment = event.appointment || {};
    const searchable = normalizeText([
      event.type,
      event.actor && event.actor.name,
      appointment.clientName,
      appointment.clientPhone,
      appointment.lawyerName,
      appointment.notes
    ].join(' '));

    return (!search || searchable.includes(search)) &&
      (lawyerId === 'todos' || appointment.lawyerId === lawyerId) &&
      (status === 'todos' || appointment.status === status || filteredAppointmentIds.has(event.appointmentId)) &&
      (!fromDate || eventDate >= fromDate) &&
      (!toDate || eventDate <= toDate);
  }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  renderSummary();
  renderAppointments();
  renderEvents();
}

function renderSummary() {
  setText('historyAppointmentCount', filteredAppointments.length);
  setText('historyEventCount', filteredEvents.length);
  setText('historyCompletedCount', filteredAppointments.filter(item => item.status === 'concluido').length);
  setText('historyCancelledCount', filteredAppointments.filter(item => item.status === 'cancelado').length);
}

function renderAppointments() {
  const tbody = document.getElementById('historyAppointmentsBody');
  if (!tbody) return;

  if (filteredAppointments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          Nenhum agendamento encontrado para os filtros selecionados.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredAppointments.map(item => `
    <tr>
      <td>
        <div style="font-weight: 700; color: var(--cob-silver-bright); font-family: monospace;">${escapeHtml(item.scheduledTime || '--:--')}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">${formatDateBR(item.scheduledDate)}</div>
      </td>
      <td>
        <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(item.clientName)}</div>
        ${item.clientPhone ? `<div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.clientPhone)}</div>` : ''}
        ${item.notes ? `<div style="font-size: 0.8rem; color: #94a3b8; font-style: italic;">${escapeHtml(item.notes)}</div>` : ''}
      </td>
      <td>
        <div style="font-weight: 600; color: var(--cob-silver-bright);">${escapeHtml(item.lawyerName)}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.lawyerRoom)}</div>
      </td>
      <td>${renderStatusBadge(item.status)}</td>
      <td style="font-size: 0.82rem; color: var(--text-muted);">${formatDateTime(item.updatedAt || item.finishedAt || item.cancelledAt || item.createdAt)}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openEditAppointmentModal('${item.id}')">Editar</button>
      </td>
    </tr>
  `).join('');
}

function renderEvents() {
  const container = document.getElementById('historyEventsList');
  if (!container) return;

  if (filteredEvents.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhuma movimentação encontrada para os filtros selecionados.</div>';
    return;
  }

  container.innerHTML = filteredEvents.map(event => {
    const appointment = event.appointment || {};
    return `
      <div class="history-event-row">
        <div>
          <strong>${escapeHtml(eventLabel(event.type))}</strong>
          <div style="font-size: 0.86rem; color: var(--text-muted);">
            ${escapeHtml(appointment.clientName || 'Agendamento')} com ${escapeHtml(appointment.lawyerName || 'advogado nao informado')}
          </div>
          ${renderEventDetails(event)}
        </div>
        <div style="text-align: right; min-width: 180px;">
          <div style="font-size: 0.86rem; color: var(--cob-silver-bright); font-weight: 700;">${formatDateTime(event.createdAt)}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(event.actor && event.actor.name ? event.actor.name : 'Sistema')}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderEventDetails(event) {
  if (!event || !event.details) return '';

  if (event.type === 'appointment_updated' && Array.isArray(event.details.changedFields)) {
    const labels = event.details.changedFields.map(fieldLabel).join(', ');
    return `<div style="font-size: 0.8rem; color: var(--accent-gold); margin-top: 0.25rem;">Campos alterados: ${escapeHtml(labels || 'nenhum')}</div>`;
  }

  if (event.type === 'daily_queue_cleared') {
    return '<div style="font-size: 0.8rem; color: var(--accent-gold); margin-top: 0.25rem;">Item cancelado durante limpeza da fila do dia.</div>';
  }

  return '';
}

function openEditAppointmentModal(appointmentId) {
  const appointment = appointments.find(item => item.id === appointmentId);
  if (!appointment) return;

  document.getElementById('editAppointmentId').value = appointment.id;
  document.getElementById('editClientName').value = appointment.clientName || '';
  document.getElementById('editClientPhone').value = appointment.clientPhone || '';
  document.getElementById('editScheduledDate').value = appointment.scheduledDate || '';
  document.getElementById('editScheduledTime').value = appointment.scheduledTime || '';
  document.getElementById('editLawyerSelect').value = appointment.lawyerId || '';
  document.getElementById('editNotes').value = appointment.notes || '';
  document.getElementById('editAppointmentModal').classList.add('active');
}

function closeEditAppointmentModal() {
  document.getElementById('editAppointmentModal').classList.remove('active');
}

async function saveAppointmentChanges(event) {
  event.preventDefault();

  const appointmentId = document.getElementById('editAppointmentId').value;
  const payload = {
    clientName: document.getElementById('editClientName').value.trim(),
    clientPhone: document.getElementById('editClientPhone').value.trim(),
    scheduledDate: document.getElementById('editScheduledDate').value,
    scheduledTime: document.getElementById('editScheduledTime').value,
    lawyerId: document.getElementById('editLawyerSelect').value,
    notes: document.getElementById('editNotes').value.trim()
  };

  try {
    const res = await Auth.authFetch(`/api/appointments/${appointmentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erro ao atualizar agendamento.');
      return;
    }

    closeEditAppointmentModal();
    showToast('Agendamento atualizado com sucesso.', 'success');
    await loadHistoryData();
  } catch (err) {
    console.error(err);
    showToast('Erro ao salvar agendamento.', 'danger');
  }
}

function exportHistoryCSV() {
  if (filteredAppointments.length === 0 && filteredEvents.length === 0) {
    alert('Nao ha dados filtrados para exportar.');
    return;
  }

  const appointmentHeaders = ['Tipo', 'Data', 'Horario', 'Cliente', 'Telefone', 'Advogado', 'Sala', 'Status', 'Observacoes', 'Criado em', 'Atualizado em'];
  const appointmentRows = filteredAppointments.map(item => [
    'Agendamento',
    item.scheduledDate || '',
    item.scheduledTime || '',
    csvCell(item.clientName),
    csvCell(item.clientPhone),
    csvCell(item.lawyerName),
    csvCell(item.lawyerRoom),
    item.status || '',
    csvCell(item.notes),
    formatDateTime(item.createdAt),
    formatDateTime(item.updatedAt || item.finishedAt || item.cancelledAt)
  ]);

  const eventHeaders = ['Tipo', 'Movimentacao', 'Data/Hora', 'Cliente', 'Advogado', 'Status', 'Usuario', 'Detalhes'];
  const eventRows = filteredEvents.map(event => {
    const appointment = event.appointment || {};
    return [
      'Movimentacao',
      csvCell(eventLabel(event.type)),
      formatDateTime(event.createdAt),
      csvCell(appointment.clientName),
      csvCell(appointment.lawyerName),
      appointment.status || '',
      csvCell(event.actor && event.actor.name ? event.actor.name : 'Sistema'),
      csvCell(eventDetailsText(event))
    ];
  });

  const lines = [
    appointmentHeaders.join(';'),
    ...appointmentRows.map(row => row.join(';')),
    '',
    eventHeaders.join(';'),
    ...eventRows.map(row => row.join(';'))
  ];

  downloadCSV(lines.join('\n'), `historico_agendamentos_${new Date().toISOString().split('T')[0]}.csv`);
}

function renderStatusBadge(status) {
  if (status === 'aguardando') return '<span class="badge badge-aguardando">Aguardando</span>';
  if (status === 'em_atendimento') return '<span class="badge badge-em_atendimento">Em atendimento</span>';
  if (status === 'concluido') return '<span class="badge badge-concluido">Concluído</span>';
  if (status === 'cancelado') return '<span class="badge badge-cancelado">Cancelado</span>';
  return `<span class="badge">${escapeHtml(status || '---')}</span>`;
}

function eventLabel(type) {
  const labels = {
    appointment_created: 'Agendamento criado',
    appointment_updated: 'Agendamento alterado/remarcado',
    client_called: 'Cliente chamado',
    consultation_started: 'Atendimento iniciado',
    consultation_finished: 'Atendimento concluído',
    appointment_cancelled: 'Agendamento cancelado',
    daily_queue_cleared: 'Fila do dia limpa'
  };
  return labels[type] || type || 'Movimentação';
}

function fieldLabel(field) {
  const labels = {
    clientName: 'cliente',
    clientPhone: 'telefone',
    lawyerId: 'advogado',
    lawyerName: 'advogado',
    lawyerRoom: 'sala',
    scheduledDate: 'data',
    scheduledTime: 'horario',
    status: 'status',
    notes: 'observacoes'
  };
  return labels[field] || field;
}

function eventDetailsText(event) {
  if (event.type === 'appointment_updated' && Array.isArray(event.details?.changedFields)) {
    return `Campos alterados: ${event.details.changedFields.map(fieldLabel).join(', ')}`;
  }
  if (event.type === 'daily_queue_cleared') return 'Cancelado durante limpeza da fila do dia';
  return '';
}

function downloadCSV(content, filename) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.innerText = value;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatDateBR(dateStr) {
  if (!dateStr) return '---';
  const parts = String(dateStr).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function formatDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
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

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
