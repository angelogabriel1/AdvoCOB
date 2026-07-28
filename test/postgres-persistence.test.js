const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const managerSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'gerente.js'), 'utf8');

function sourceBetween(startMarker, endMarker) {
  const start = serverSource.indexOf(startMarker);
  const end = serverSource.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(start, -1, `Marcador inicial nao encontrado: ${startMarker}`);
  assert.notEqual(end, -1, `Marcador final nao encontrado: ${endMarker}`);
  return serverSource.slice(start, end);
}

test('persistencia comum altera apenas registros selecionados', () => {
  const incrementalSource = sourceBetween(
    'async function applyPostgresChanges',
    'async function replacePostgresData'
  );

  assert.doesNotMatch(incrementalSource, /delete from appointment_history/i);
  assert.doesNotMatch(incrementalSource, /delete from audit_logs/i);
  assert.doesNotMatch(incrementalSource, /delete from payment_requests/i);
  assert.doesNotMatch(incrementalSource, /delete from appointments/i);
  assert.match(incrementalSource, /delete from users where id = any/i);
  assert.match(incrementalSource, /delete from lawyers where id = any/i);
  assert.match(incrementalSource, /upsertAppointment\(client, appointment\)/);
  assert.match(incrementalSource, /insertHistoryEvent\(client, event\)/);
  assert.match(incrementalSource, /insertAuditLog\(client, log\)/);
});

test('todas as chamadas comuns informam mudancas incrementais', () => {
  assert.doesNotMatch(serverSource, /saveData\s*\(\s*db\s*\)\s*;/);
  assert.doesNotMatch(serverSource, /savePostgresData/);
});

test('substituicao integral fica restrita a restauracao de backup', () => {
  const replacementCalls = serverSource.match(/replacePostgresData\s*\(/g) || [];
  const queuedReplacementCalls = serverSource.match(/queuePostgresReplacement\s*\(/g) || [];
  const backupReplacementCalls = serverSource.match(/replaceAllDataFromBackup\s*\(/g) || [];

  assert.equal(replacementCalls.length, 2);
  assert.equal(queuedReplacementCalls.length, 2);
  assert.equal(backupReplacementCalls.length, 2);
});

test('envio de guia aceita arquivo ou link e persiste apenas metadados', () => {
  const guideRouteSource = sourceBetween(
    "app.put('/api/payment-requests/:id/guide'",
    "app.put('/api/payment-requests/:id/payment'"
  );
  const snapshotSource = sourceBetween(
    'function getPaymentRequestSnapshot',
    'function visiblePaymentRequestsForSession'
  );

  assert.match(guideRouteSource, /parseGuideUpload/);
  assert.match(guideRouteSource, /!req\.file && !guideLink/);
  assert.match(guideRouteSource, /uploadGuideFile\(request\.id, req\.file\)/);
  assert.match(guideRouteSource, /await saveData/);
  assert.match(serverSource, /guide_file_path = excluded\.guide_file_path/);
  assert.match(snapshotSource, /snapshot\.guideFileUrl\s*=/);
  assert.match(snapshotSource, /session\.role !== 'advogado' \|\| request\.status === 'pago'/);
  assert.doesNotMatch(snapshotSource, /guideFilePath\s*:/);
});

test('valor do pagamento e definido pelo advogado e preservado pela contadora', () => {
  const requestRouteSource = sourceBetween(
    "app.post('/api/payment-requests'",
    "app.get('/api/payment-requests/:id/guide-file'"
  );
  const guideRouteSource = sourceBetween(
    "app.put('/api/payment-requests/:id/guide'",
    "app.put('/api/payment-requests/:id/payment'"
  );
  const snapshotSource = sourceBetween(
    'function getPaymentRequestSnapshot',
    'function visiblePaymentRequestsForSession'
  );

  assert.match(requestRouteSource, /cleanGuideAmount/);
  assert.match(requestRouteSource, /Valor do pagamento e obrigatorio/);
  assert.match(requestRouteSource, /guideAmount: cleanGuideAmount/);
  assert.doesNotMatch(guideRouteSource, /req\.body\?\.guideAmount/);
  assert.doesNotMatch(guideRouteSource, /request\.guideAmount\s*=/);
  assert.match(snapshotSource, /guideAmount: request\.guideAmount \|\| ''/);
});

test('gerente envia comprovante por arquivo ou link sem expor o caminho privado', () => {
  const receiptDownloadRouteSource = sourceBetween(
    "app.get('/api/payment-requests/:id/receipt-file'",
    "app.put('/api/payment-requests/:id/payment'"
  );
  const paymentRouteSource = sourceBetween(
    "app.put('/api/payment-requests/:id/payment'",
    "app.get('/api/lawyers'"
  );
  const snapshotSource = sourceBetween(
    'function getPaymentRequestSnapshot',
    'function visiblePaymentRequestsForSession'
  );

  assert.match(paymentRouteSource, /parsePaymentReceiptUpload/);
  assert.match(paymentRouteSource, /!req\.file && !paymentReceiptLink/);
  assert.match(paymentRouteSource, /uploadPaymentReceiptFile\(request\.id, req\.file\)/);
  assert.match(paymentRouteSource, /await saveData/);
  assert.match(managerSource, /new FormData\(\)/);
  assert.match(managerSource, /formData\.append\('paymentReceiptFile'/);
  assert.match(managerSource, /body: formData/);
  assert.match(serverSource, /payment_receipt_file_path = excluded\.payment_receipt_file_path/);
  assert.match(snapshotSource, /snapshot\.paymentReceiptFileUrl\s*=/);
  assert.doesNotMatch(snapshotSource, /paymentReceiptFilePath\s*:/);
  assert.match(receiptDownloadRouteSource, /requireRole\('admin', 'advogado', 'gerente'\)/);
  assert.doesNotMatch(receiptDownloadRouteSource, /requireRole\([^)]*'contadora'/);
});
