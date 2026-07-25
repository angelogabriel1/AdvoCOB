// Helper para envio de Lembrete por WhatsApp com mensagem pronta

function sendWhatsAppReminder(phone, clientName, lawyerName, lawyerRoom, dateStr, timeStr) {
  if (!phone) {
    alert('O cliente não possui um número de telefone cadastrado.');
    return;
  }

  // Limpar caracteres não numéricos do telefone
  let cleanPhone = String(phone).replace(/\D/g, '');

  // Se não tiver código de país (55), adicionar 55 se o número for brasileiro (10 ou 11 dígitos)
  if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    cleanPhone = '55' + cleanPhone;
  }

  // Formatador de Data BR (DD/MM/AAAA)
  let formattedDate = dateStr || 'hoje';
  if (dateStr && dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  const roomInfo = lawyerRoom ? `na ${lawyerRoom}` : '';
  const message = `Olá, ${clientName}! Confirmamos o seu agendamento no escritório *COB Advogados* com o(a) *${lawyerName}* para o dia *${formattedDate}* às *${timeStr}* ${roomInfo}.\n\nEm caso de dúvidas ou necessidade de reagendamento, responda a esta mensagem.`;

  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

// Helper para Exportação de Relatórios de Atendimento em CSV
function exportAppointmentsCSV(appointmentsList) {
  if (!appointmentsList || appointmentsList.length === 0) {
    alert('Não há agendamentos para exportar no momento.');
    return;
  }

  const headers = ['Data Agendamento', 'Horario', 'Cliente', 'Telefone', 'Advogado', 'Sala', 'Status', 'Observacoes'];
  const rows = appointmentsList.map(a => [
    a.scheduledDate || 'Hoje',
    a.scheduledTime || '',
    `"${(a.clientName || '').replace(/"/g, '""')}"`,
    `"${(a.clientPhone || '').replace(/"/g, '""')}"`,
    `"${(a.lawyerName || '').replace(/"/g, '""')}"`,
    `"${(a.lawyerRoom || '').replace(/"/g, '""')}"`,
    a.status || '',
    `"${(a.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `relatorio_atendimentos_cob_advogados_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportAppointmentsCSV(appointmentsList, filenamePrefix = 'relatorio_atendimentos_cob_advogados') {
  if (!appointmentsList || appointmentsList.length === 0) {
    alert('Nao ha agendamentos para exportar no momento.');
    return;
  }

  const headers = [
    'Data Agendamento',
    'Horario',
    'Cliente',
    'Telefone',
    'Advogado',
    'Sala',
    'Status',
    'Observacoes',
    'Criado em',
    'Chamado em',
    'Inicio Consulta',
    'Fim Consulta',
    'Duracao',
    'Solicitacoes Recepcao',
    'Recado Recepcao'
  ];

  const rows = appointmentsList.map(a => [
    a.scheduledDate || 'Hoje',
    a.scheduledTime || '',
    csvCell(a.clientName || ''),
    csvCell(a.clientPhone || ''),
    csvCell(a.lawyerName || ''),
    csvCell(a.lawyerRoom || ''),
    a.status || '',
    csvCell(a.notes || ''),
    formatCsvDateTime(a.createdAt),
    formatCsvDateTime(a.calledAt),
    formatCsvDateTime(a.startedAt),
    formatCsvDateTime(a.finishedAt),
    formatCsvDuration(a.startedAt, a.finishedAt),
    csvCell(formatReceptionRequests(a.receptionRequests)),
    csvCell(a.receptionRequests && a.receptionRequests.note ? a.receptionRequests.note : '')
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function csvCell(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function formatCsvDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR');
}

function formatCsvDuration(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '';

  const totalSeconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [String(hours).padStart(2, '0'), String(minutes).padStart(2, '0'), String(seconds).padStart(2, '0')].join(':');
}

function formatReceptionRequests(requests) {
  if (!requests) return '';

  const items = [];
  if (requests.reschedule) items.push('Reagendamento');
  if (requests.copies) items.push('Xerox/copia');
  if (requests.signature) items.push('Assinatura');
  if (requests.documents) items.push('Conferencia de documentos');

  return items.join(', ');
}
