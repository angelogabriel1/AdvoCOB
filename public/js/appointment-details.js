const AppointmentDetails = {
  open(appointment) {
    if (!appointment) return;
    this.ensureModal();

    const content = document.getElementById('appointmentDetailsContent');
    if (!content) return;

    content.innerHTML = this.render(appointment);
    document.getElementById('appointmentDetailsModal').classList.add('active');
  },

  close() {
    const modal = document.getElementById('appointmentDetailsModal');
    if (modal) modal.classList.remove('active');
  },

  ensureModal() {
    if (document.getElementById('appointmentDetailsModal')) return;

    document.body.insertAdjacentHTML('beforeend', `
      <div id="appointmentDetailsModal" class="modal-overlay">
        <div class="modal-box" style="max-width: 780px; text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem;">
            <div>
              <h2 style="font-size: 1.45rem; font-weight: 800; color: var(--cob-wine); margin-bottom: 0.25rem;">Detalhes do Atendimento</h2>
              <p style="color: var(--text-muted); font-size: 0.9rem;">Resumo completo da consulta finalizada.</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeAppointmentDetailsModal()">Fechar</button>
          </div>
          <div id="appointmentDetailsContent"></div>
        </div>
      </div>
    `);
  },

  render(appointment) {
    const duration = this.formatDuration(appointment.startedAt, appointment.finishedAt);
    const requests = this.renderReceptionRequests(appointment.receptionRequests);

    return `
      <div style="display: grid; gap: 1rem;">
        <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: rgba(11, 14, 20, 0.35);">
          <div style="font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em;">Cliente</div>
          <div style="font-size: 1.45rem; font-weight: 800; color: var(--text-main); margin-top: 0.2rem;">${this.escape(appointment.clientName || 'Cliente sem nome')}</div>
          <div style="color: var(--text-muted); margin-top: 0.25rem;">${this.escape(appointment.clientPhone || 'Telefone nao informado')}</div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.75rem;">
          ${this.infoBox('Advogado', appointment.lawyerName)}
          ${this.infoBox('Sala', appointment.lawyerRoom)}
          ${this.infoBox('Status', this.statusLabel(appointment.status))}
          ${this.infoBox('Duracao da consulta', duration)}
          ${this.infoBox('Agendado para', `${this.formatDateBR(appointment.scheduledDate)} as ${appointment.scheduledTime || '--:--'}`)}
          ${this.infoBox('Criado em', this.formatDateTime(appointment.createdAt))}
          ${this.infoBox('Chamado em', this.formatDateTime(appointment.calledAt))}
          ${this.infoBox('Inicio', this.formatDateTime(appointment.startedAt))}
          ${this.infoBox('Finalizado em', this.formatDateTime(appointment.finishedAt))}
        </div>

        <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: rgba(11, 14, 20, 0.25);">
          <div style="font-size: 0.82rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Observacoes / Assunto</div>
          <div style="margin-top: 0.45rem; color: var(--text-main); line-height: 1.5;">${this.escape(appointment.notes || 'Nenhuma observacao registrada.')}</div>
        </div>

        <div style="padding: 1rem; border: 1px solid rgba(245, 158, 11, 0.35); border-radius: var(--radius-md); background: rgba(245, 158, 11, 0.08);">
          <div style="font-size: 0.82rem; color: var(--accent-gold); text-transform: uppercase; font-weight: 800;">Solicitacoes para a recepcao</div>
          <div style="margin-top: 0.45rem; color: var(--text-main); line-height: 1.5;">${requests}</div>
        </div>
      </div>
    `;
  },

  infoBox(label, value) {
    return `
      <div style="padding: 0.85rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: rgba(24, 32, 46, 0.45);">
        <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">${this.escape(label)}</div>
        <div style="font-size: 0.95rem; color: var(--text-main); font-weight: 650; margin-top: 0.25rem;">${this.escape(value || '---')}</div>
      </div>
    `;
  },

  renderReceptionRequests(requests) {
    if (!requests) return 'Nenhuma solicitacao registrada.';

    const items = [];
    if (requests.reschedule) items.push('Solicitar reagendamento');
    if (requests.copies) items.push('Xerox/copia de documentos');
    if (requests.signature) items.push('Assinatura de documentos');
    if (requests.documents) items.push('Recebimento/conferencia de documentos');

    const list = items.length > 0
      ? `<ul style="margin: 0.25rem 0 0 1.2rem; padding: 0;">${items.map(item => `<li>${this.escape(item)}</li>`).join('')}</ul>`
      : '';
    const note = requests.note
      ? `<div style="margin-top: 0.65rem;"><strong>Recado:</strong> ${this.escape(requests.note)}</div>`
      : '';

    return list || note ? `${list}${note}` : 'Nenhuma solicitacao registrada.';
  },

  statusLabel(status) {
    const labels = {
      aguardando: 'Aguardando',
      em_atendimento: 'Em atendimento',
      concluido: 'Concluido',
      cancelado: 'Cancelado'
    };
    return labels[status] || status || '---';
  },

  formatDateBR(dateStr) {
    if (!dateStr) return '---';
    const parts = String(dateStr).split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  },

  formatDateTime(iso) {
    if (!iso) return '---';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '---';

    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  formatDuration(startIso, endIso) {
    if (!startIso || !endIso) return '---';

    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '---';

    const totalSeconds = Math.floor((end - start) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes || hours) parts.push(`${minutes}min`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
  },

  escape(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

function closeAppointmentDetailsModal() {
  AppointmentDetails.close();
}
