const session = Auth.requireAuth('contadora');
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
  showToast(data.message || 'Nova solicitacao recebida.', 'info');
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
  const pending = paymentRequests.filter(item => item.status === 'solicitada');
  renderRequestList('pendingGuideRequests', pending, true);
  renderRequestList('allGuideRequests', paymentRequests, false);
}

function renderRequestList(containerId, requests, canEditPending) {
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
      ${canEditPending ? renderGuideForm(item) : ''}
    </div>
  `).join('');
}

function renderGuideForm(item) {
  return `
    <div style="border-top: 1px solid var(--border-color); margin-top: 0.9rem; padding-top: 0.9rem;">
      <div class="history-filters">
        <div class="form-group">
          <label for="guideFile_${item.id}">Arquivo da Guia</label>
          <input id="guideFile_${item.id}" type="file" class="form-control" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp">
        </div>
        <div class="form-group">
          <label for="guideLink_${item.id}">Link da Guia (alternativa)</label>
          <input id="guideLink_${item.id}" class="form-control" value="${escapeHtml(item.guideLink || '')}" placeholder="https://...">
        </div>
        <div class="form-group">
          <label for="guideText_${item.id}">Dados complementares</label>
          <textarea id="guideText_${item.id}" class="form-control" rows="2" maxlength="2000" placeholder="Linha digitavel, codigo de barras ou detalhes da guia">${escapeHtml(item.guideText || '')}</textarea>
        </div>
        <div class="form-group">
          <label for="guideAmount_${item.id}">Valor</label>
          <input id="guideAmount_${item.id}" class="form-control" value="${escapeHtml(item.guideAmount || '')}" placeholder="Ex: R$ 150,00">
        </div>
        <div class="form-group">
          <label for="guideDueDate_${item.id}">Vencimento</label>
          <input id="guideDueDate_${item.id}" type="date" class="form-control" value="${escapeHtml(item.guideDueDate || '')}">
        </div>
      </div>
      <button id="submitGuide_${item.id}" type="button" class="btn btn-primary" onclick="submitGuide('${item.id}')">Enviar Guia ao Gerente</button>
    </div>
  `;
}

async function submitGuide(requestId) {
  const guideFile = document.getElementById(`guideFile_${requestId}`).files[0] || null;
  const guideText = document.getElementById(`guideText_${requestId}`).value.trim();
  const guideLink = document.getElementById(`guideLink_${requestId}`).value.trim();
  const guideAmount = document.getElementById(`guideAmount_${requestId}`).value.trim();
  const guideDueDate = document.getElementById(`guideDueDate_${requestId}`).value;
  const submitButton = document.getElementById(`submitGuide_${requestId}`);

  if (!guideFile && !guideLink) {
    alert('Anexe o arquivo da guia ou informe um link.');
    return;
  }

  const formData = new FormData();
  if (guideFile) formData.append('guideFile', guideFile);
  formData.append('guideText', guideText);
  formData.append('guideLink', guideLink);
  formData.append('guideAmount', guideAmount);
  formData.append('guideDueDate', guideDueDate);

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Enviando...';
    }

    const res = await Auth.authFetch(`/api/payment-requests/${requestId}/guide`, {
      method: 'PUT',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erro ao enviar guia.');
      return;
    }

    paymentRequests = upsertPaymentRequest(paymentRequests, data.request);
    renderPaymentRequests();
    showToast('Guia enviada ao gerente.', 'success');
  } catch (err) {
    console.error(err);
    alert('Erro ao se comunicar com o servidor.');
  } finally {
    if (submitButton && document.body.contains(submitButton)) {
      submitButton.disabled = false;
      submitButton.textContent = 'Enviar Guia ao Gerente';
    }
  }
}

function renderGuideSummary(item) {
  if (!item.guideText && !item.guideLink && !item.guideFileName && !item.guideAmount && !item.guideDueDate) return '';

  return `
    <div style="border-top: 1px solid var(--border-color); margin-top: 0.75rem; padding-top: 0.75rem; font-size: 0.82rem;">
      <strong style="color: var(--cob-silver-bright);">Guia registrada</strong>
      ${item.guideAmount ? `<span style="color: var(--text-muted); margin-left: 0.4rem;">Valor: ${escapeHtml(item.guideAmount)}</span>` : ''}
      ${item.guideDueDate ? `<span style="color: var(--text-muted); margin-left: 0.4rem;">Vencimento: ${formatDateBR(item.guideDueDate)}</span>` : ''}
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

function renderStatusBadge(status) {
  const labels = { solicitada: 'Solicitada', guia_gerada: 'Enviada ao gerente', pago: 'Paga' };
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
