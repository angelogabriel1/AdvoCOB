const socket = io();

let lawyers = [];
let appointments = [];
let currentDate = new Date();
let selectedDayAppointments = [];

document.addEventListener('DOMContentLoaded', () => {
  renderCOBBrandHeader('cobBrandHeader');
  loadData();
});

socket.on('queue_updated', (updated) => {
  appointments = updated;
  renderCalendar();
});

async function loadData() {
  try {
    const [resL, resA] = await Promise.all([
      fetch('/api/lawyers'),
      fetch('/api/appointments')
    ]);
    lawyers = await resL.json();
    appointments = await resA.json();

    renderLawyerSelect();
    renderCalendar();
  } catch (err) {
    console.error(err);
  }
}

function renderLawyerSelect() {
  const select = document.getElementById('calendarLawyerSelect');
  if (!select) return;

  select.innerHTML = '<option value="todos">Todos os Advogados</option>' +
    lawyers.map(l => `<option value="${l.id}">${escapeHtml(l.name)} (${escapeHtml(l.room)})</option>`).join('');
}

function renderCalendar() {
  const grid = document.getElementById('calendarDaysGrid');
  const title = document.getElementById('calendarMonthYearTitle');
  if (!grid || !title) return;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  title.innerText = `${monthNames[month]} ${year}`;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const selectedLawyerId = document.getElementById('calendarLawyerSelect').value;

  const todayStr = new Date().toISOString().split('T')[0];

  let html = '';

  // Células vazias do mês anterior
  for (let i = 0; i < firstDayIndex; i++) {
    html += `<div class="calendar-day-cell empty"></div>`;
  }

  // Células dos dias do mês
  for (let day = 1; day <= totalDays; day++) {
    const monthFormatted = String(month + 1).padStart(2, '0');
    const dayFormatted = String(day).padStart(2, '0');
    const dateStr = `${year}-${monthFormatted}-${dayFormatted}`;

    let dayAppointments = appointments.filter(a => {
      const matchLawyer = (selectedLawyerId === 'todos' || a.lawyerId === selectedLawyerId);
      const matchDate = (a.scheduledDate === dateStr || (!a.scheduledDate && a.createdAt.startsWith(dateStr)));
      return matchLawyer && matchDate && a.status !== 'cancelado';
    });

    const isToday = (dateStr === todayStr);

    let badgeHtml = '';
    if (dayAppointments.length > 0) {
      badgeHtml = `<div class="day-badge">${dayAppointments.length} agendamento${dayAppointments.length > 1 ? 's' : ''}</div>`;
    }

    html += `
      <div class="calendar-day-cell ${isToday ? 'today' : ''}" onclick="openDayModal('${dateStr}')">
        <div class="day-number">${day}</div>
        ${badgeHtml}
      </div>
    `;
  }

  grid.innerHTML = html;
}

function changeMonth(delta) {
  currentDate.setMonth(currentDate.getMonth() + delta);
  renderCalendar();
}

function goToToday() {
  currentDate = new Date();
  renderCalendar();
}

function openDayModal(dateStr) {
  const selectedLawyerId = document.getElementById('calendarLawyerSelect').value;
  const parts = dateStr.split('-');
  const dateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;

  document.getElementById('modalDayTitle').innerText = `Agendamentos para ${dateFormatted}`;

  selectedDayAppointments = appointments.filter(a => {
    const matchLawyer = (selectedLawyerId === 'todos' || a.lawyerId === selectedLawyerId);
    const matchDate = (a.scheduledDate === dateStr || (!a.scheduledDate && a.createdAt.startsWith(dateStr)));
    return matchLawyer && matchDate;
  }).sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));

  const tbody = document.getElementById('dayAppointmentsBody');
  if (!tbody) return;

  if (selectedDayAppointments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
          Nenhum agendamento encontrado para esta data.
        </td>
      </tr>
    `;
    document.getElementById('dayDetailsModal').classList.add('active');
    return;
  }

  tbody.innerHTML = selectedDayAppointments.map(item => {
    let statusBadge = '';
    if (item.status === 'aguardando') statusBadge = '<span class="badge badge-aguardando">Aguardando</span>';
    else if (item.status === 'em_atendimento') statusBadge = '<span class="badge badge-em_atendimento">Em Atendimento</span>';
    else if (item.status === 'concluido') statusBadge = '<span class="badge badge-concluido">Concluído</span>';
    else statusBadge = '<span class="badge badge-cancelado">Cancelado</span>';

    return `
      <tr>
        <td style="font-weight: 700; color: var(--cob-silver-bright); font-family: monospace;">${item.scheduledTime || '--:--'}</td>
        <td>
          <strong style="color: #ffffff;">${escapeHtml(item.clientName)}</strong>
          ${item.clientPhone ? `<div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.clientPhone)}</div>` : ''}
          ${item.notes ? `<div style="font-size: 0.8rem; color: #94a3b8; font-style: italic;">Obs: ${escapeHtml(item.notes)}</div>` : ''}
        </td>
        <td>
          <div style="font-weight: 600; color: var(--cob-silver-bright);">${escapeHtml(item.lawyerName)}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.lawyerRoom)}</div>
        </td>
        <td>${statusBadge}</td>
        <td>
          ${item.clientPhone ? `
            <button class="btn btn-whatsapp btn-sm" onclick="sendWhatsAppReminder('${escapeHtml(item.clientPhone)}', '${escapeHtml(item.clientName)}', '${escapeHtml(item.lawyerName)}', '${escapeHtml(item.lawyerRoom)}', '${item.scheduledDate}', '${item.scheduledTime}')">
              WhatsApp
            </button>
          ` : '<span style="font-size: 0.8rem; color: var(--text-muted);">---</span>'}
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('dayDetailsModal').classList.add('active');
}

function closeDayModal() {
  document.getElementById('dayDetailsModal').classList.remove('active');
}

function exportCalendarCSV() {
  exportAppointmentsCSV(appointments);
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
