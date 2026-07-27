const session = Auth.requireAuth('gerente');
const socket = Auth.createSocket();

let paymentRequests = [];

document.addEventListener('DOMContentLoaded', () => {
  renderCOBBrandHeader('cobBrandHeader');
  socket.emit('register_finance_room');
  loadPaymentRequests();
});

socket.on('init_data', (data) => {
  paymentRequests = data.paymentRequests || [];
  renderPaymentRequests();
});

socket.on('payment_requests_updated', (updatedRequests) => {
  paymentRequests = updatedRequests || [];
  renderPaymentRequests();
});

socket.on('payment_request_notice', (data) => {
  if (!data) return;
  if (data.request) paymentRequests = upsertPaymentRequest(paymentRequests, data.request);
  renderPaymentRequests();
  audioService.playNotificationChime();
  showToast(data.message || 'Solicitacao de pagamento atualizada.', 'info');
});

async function loadPaymentRequests() {
  try {
    const res = await Auth.authFetch('/api/payment-requests');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar solicitacoes.');

    paymentRequests = data || [];
    renderPaymentRequests();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Erro ao carregar solicitacoes.', 'danger');
  }
}

function renderPaymentRequests() {
  const ready = paymentRequests.filter(item => item.status === 'guia_gerada');
  renderRequestList('readyPaymentRequests', ready, true);
  renderRequestList('allPaymentRequests', paymentRequests, false);
}

function renderRequestList(containerId, requests, canPay) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!requests.length) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 1.25rem;">
        Nenhuma solicitacao encontrada.
      </div>
    `;
    return;
  }

  container.innerHTML = requests.map(item => `
    <div style="background: rgba(11, 14, 20, 0.45); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
        <div>
          <strong style="color: var(--text-main);">${escapeHtml(item.processNumber)}</strong>
          <div style="font-size: 0.82rem; color: var(--text-muted);">Advogado: ${escapeHtml(item.lawyerName || 'Nao informado')}</div>
          ${item.clientName ? `<div style="font-size: 0.82rem; color: var(--text-muted);">Cliente: ${escapeHtml(item.clientName)}</div>` : ''}
          ${item.notes ? `<div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem;">${escapeHtml(item.notes)}</div>` : ''}
        </div>
        ${renderStatusBadge(item.status)}
      </div>

      ${renderGuideSummary(item)}
      ${renderReceiptSummary(item)}
      ${canPay ? renderPaymentForm(item) : ''}
    </div>
  `).join('');
}

function renderPaymentForm(item) {
  return `
    <div style="border-top: 1px solid var(--border-color); margin-top: 0.9rem; padding-top: 0.9rem;">
      <div class="history-filters">
        <div class="form-group">
          <label for="receiptText_${item.id}">Dados do Comprovante *</label>
          <textarea id="receiptText_${item.id}" class="form-control" rows="2" maxlength="2000" placeholder="Identificador, observacao ou codigo do comprovante"></textarea>
        </div>
        <div class="form-group">
          <label for="receiptLink_${item.id}">Link do Comprovante</label>
          <input id="receiptLink_${item.id}" class="form-control" placeholder="https://...">
        </div>
      </div>
      <button type="button" class="btn btn-success" onclick="submitPayment('${item.id}')">Marcar como Pago e Enviar ao Advogado</button>
    </div>
  `;
}

async function submitPayment(requestId) {
  const paymentReceiptText = document.getElementById(`receiptText_${requestId}`).value.trim();
  const paymentReceiptLink = document.getElementById(`receiptLink_${requestId}`).value.trim();

  if (!paymentReceiptText && !paymentReceiptLink) {
    alert('Informe os dados do comprovante ou um link.');
    return;
  }

  try {
    const res = await Auth.authFetch(`/api/payment-requests/${requestId}/payment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentReceiptText, paymentReceiptLink })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erro ao registrar pagamento.');
      return;
    }

    paymentRequests = upsertPaymentRequest(paymentRequests, data.request);
    renderPaymentRequests();
    showToast('Pagamento registrado e comprovante enviado ao advogado.', 'success');
  } catch (err) {
    console.error(err);
    alert('Erro ao se comunicar com o servidor.');
  }
}

function renderGuideSummary(item) {
  if (!item.guideText && !item.guideLink && !item.guideAmount && !item.guideDueDate) {
    return `<div style="color: var(--text-muted); font-size: 0.82rem; margin-top: 0.75rem;">Aguardando guia da contadora.</div>`;
  }

  return `
    <div style="border-top: 1px solid var(--border-color); margin-top: 0.75rem; padding-top: 0.75rem; font-size: 0.82rem;">
      <strong style="color: var(--cob-silver-bright);">Guia recebida</strong>
      ${item.guideAmount ? `<span style="color: var(--text-muted); margin-left: 0.4rem;">Valor: ${escapeHtml(item.guideAmount)}</span>` : ''}
      ${item.guideDueDate ? `<span style="color: var(--text-muted); margin-left: 0.4rem;">Vencimento: ${formatDateBR(item.guideDueDate)}</span>` : ''}
      ${item.guideText ? `<div style="color: var(--text-muted); margin-top: 0.25rem;">${escapeHtml(item.guideText)}</div>` : ''}
      ${renderSafeLink(item.guideLink, 'Abrir guia')}
    </div>
  `;
}

function renderReceiptSummary(item) {
  if (!item.paymentReceiptText && !item.paymentReceiptLink) return '';

  return `
    <div style="border-top: 1px solid var(--border-color); margin-top: 0.75rem; padding-top: 0.75rem; font-size: 0.82rem; color: var(--accent-green);">
      <strong>Comprovante enviado ao advogado</strong>
      ${item.paymentReceiptText ? `<div style="color: var(--text-muted); margin-top: 0.25rem;">${escapeHtml(item.paymentReceiptText)}</div>` : ''}
      ${renderSafeLink(item.paymentReceiptLink, 'Abrir comprovante')}
    </div>
  `;
}

function renderStatusBadge(status) {
  const labels = { solicitada: 'Aguardando guia', guia_gerada: 'Pronta para pagar', pago: 'Pago' };
  const classes = { solicitada: 'badge-aguardando', guia_gerada: 'badge-em_atendimento', pago: 'badge-concluido' };
  return `<span class="badge ${classes[status] || 'badge-aguardando'}">${labels[status] || 'Solicitada'}</span>`;
}

function upsertPaymentRequest(list, request) {
  const withoutCurrent = (list || []).filter(item => item.id !== request.id);
  return [request, ...withoutCurrent].sort((a, b) =>
    new Date(b.updatedAt || b.requestedAt || 0) - new Date(a.updatedAt || a.requestedAt || 0)
  );
}

function renderSafeLink(url, label) {
  if (!url) return '';
  const cleanUrl = String(url).trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    return `<div style="color: var(--text-muted); margin-top: 0.25rem;">Link: ${escapeHtml(cleanUrl)}</div>`;
  }
  return `<a href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="margin-top: 0.5rem;">${escapeHtml(label)}</a>`;
}

function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
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
