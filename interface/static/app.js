const svg = document.querySelector('#network-canvas');
const lossChart = document.querySelector('#loss-chart');
const canvasWrap = document.querySelector('#canvas-wrap');
const state = { zoom: 1, panX: 0, panY: 0, dragging: false, lastX: 0, lastY: 0, data: null };
const nodePositions = { x1: [120, 150], x2: [120, 330], h1: [450, 150], h2: [450, 330], out: [780, 240] };

const $ = (selector) => document.querySelector(selector);
const format = (value, digits = 4) => value == null ? '—' : Number(value).toFixed(digits);
const config = () => ({ learning_rate: $('#learning-rate').value, max_epochs: $('#max-epochs').value, target_loss: $('#target-loss').value, seed: $('#seed').value });

async function request(path, method = 'GET', body = null) {
  const response = await fetch(path, { method, headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la operación.');
  return payload;
}

function setBusy(isBusy) {
  document.querySelectorAll('.button').forEach(button => { button.disabled = isBusy; });
  $('#status-dot').parentElement.className = isBusy ? 'status busy' : 'status ready';
  $('#status-text').textContent = isBusy ? 'Procesando' : 'Sesión activa';
}

function update(data) {
  state.data = data;
  const progress = data.progress;
  $('#metric-epochs').textContent = progress.epochs;
  $('#metric-loss').textContent = format(progress.loss, 5);
  const correct = data.predictions.filter(row => row.is_correct).length;
  $('#metric-accuracy').textContent = data.predictions.length ? `${correct}/${data.predictions.length}` : '—';
  $('#status-dot').parentElement.className = data.ready ? 'status ready' : 'status';
  $('#status-text').textContent = progress.stop_reason ? 'Completado' : (data.ready ? 'Sesión activa' : 'Sin iniciar');
  drawNetwork(data);
  drawChart(progress.loss_history);
  drawPredictions(data.predictions);
  drawStep(data.last_step);
}

function viewportPoint(point) { return [point[0] * state.zoom + state.panX, point[1] * state.zoom + state.panY]; }
function drawNetwork(data) {
  const params = data.parameters || {};
  const links = [['x1','h1','w_x1_h1'],['x1','h2','w_x1_h2'],['x2','h1','w_x2_h1'],['x2','h2','w_x2_h2'],['h1','out','w_h1_o'],['h2','out','w_h2_o']];
  let content = `<rect width="900" height="440" fill="#fbfcfa"/>`;
  links.forEach(([from,to,key]) => {
    const a = viewportPoint(nodePositions[from]), b = viewportPoint(nodePositions[to]); const value = Number(params[key] || 0);
    const color = value >= 0 ? '#557da0' : '#ef816f'; const width = Math.min(7, 1.3 + Math.abs(value) * 2.8); const opacity = Math.min(.95, .38 + Math.abs(value) * .3);
    content += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/><text x="${(a[0]+b[0])/2}" y="${(a[1]+b[1])/2-7}" text-anchor="middle" fill="${color}" font-family="DM Mono" font-size="10">${format(value,2)}</text>`;
  });
  const activations = data.last_step?.activations_before || {};
  Object.entries(nodePositions).forEach(([key, position]) => {
    const [x,y] = viewportPoint(position); const value = key === 'x1' || key === 'x2' ? (data.last_step?.inputs?.[key === 'x1' ? 0 : 1] ?? 0) : key === 'out' ? activations.output : activations[key];
    const shown = value == null ? '—' : format(value,2); const fill = key === 'out' ? '#b9e8d2' : '#ffffff';
    content += `<circle cx="${x}" cy="${y}" r="34" fill="${fill}" stroke="#192326" stroke-width="1.5"/><text x="${x}" y="${y-3}" text-anchor="middle" fill="#192326" font-family="Space Grotesk" font-size="14" font-weight="600">${key === 'out' ? 'ŷ' : key}</text><text x="${x}" y="${y+15}" text-anchor="middle" fill="#758084" font-family="DM Mono" font-size="10">${shown}</text>`;
  });
  [['Entrada',[120,400]],['Oculta',[450,400]],['Salida',[780,400]]].forEach(([label,pos]) => { const [x,y] = viewportPoint(pos); content += `<text x="${x}" y="${y}" text-anchor="middle" fill="#a0aaa6" font-family="DM Mono" font-size="10" letter-spacing="1">${label.toUpperCase()}</text>`; });
  svg.innerHTML = content;
}

function drawChart(history) {
  if (!history.length) { lossChart.innerHTML = '<text x="360" y="100" text-anchor="middle" fill="#a0aaa6" font-family="DM Mono" font-size="11">Entrena para ver la curva de aprendizaje</text>'; $('#chart-value').textContent = '—'; return; }
  const max = Math.max(...history.map(row => row.loss), .01); const points = history.map((row, index) => `${12 + index / Math.max(1, history.length - 1) * 696},${170 - row.loss / max * 145}`).join(' ');
  lossChart.innerHTML = `<line x1="12" y1="170" x2="708" y2="170" stroke="#dce4e1"/><line x1="12" y1="25" x2="12" y2="170" stroke="#dce4e1"/><polyline points="${points}" fill="none" stroke="#3e8b6b" stroke-width="2.5"/><circle cx="${points.split(' ').at(-1).split(',')[0]}" cy="${points.split(' ').at(-1).split(',')[1]}" r="4" fill="#3e8b6b"/>`; $('#chart-value').textContent = format(history.at(-1).loss, 5);
}

function drawPredictions(predictions) {
  const table = $('#prediction-table');
  if (!predictions.length) { table.innerHTML = '<div class="prediction-empty">La tabla aparecerá después del primer paso.</div>'; return; }
  table.innerHTML = `<div class="prediction-row head"><span>Entrada</span><span>Objetivo</span><span>Salida</span><span>Estado</span></div>` + predictions.map(row => `<div class="prediction-row"><strong>(${row.inputs.join(', ')})</strong><span>${row.expected}</span><span>${format(row.output, 3)}</span><span class="${row.is_correct ? 'ok' : 'bad'}">${row.is_correct ? 'OK' : '—'}</span></div>`).join('');
}

function drawStep(last) {
  if (!last || last.kind === 'train') { $('#step-readout').innerHTML = '<span class="eyebrow">ÚLTIMA ACTUALIZACIÓN</span><p>Inicia una red para ver el detalle de cada iteración.</p>'; return; }
  const input = `(${last.inputs.join(', ')})`; $('#step-readout').innerHTML = `<span class="eyebrow">ITERACIÓN ${last.iteration} · ÉPOCA ${last.epoch}</span><p>Entrada <strong>${input}</strong> · objetivo <strong>${last.expected}</strong><br>Activación de salida <strong>${format(last.activations_before.output, 4)}</strong>${last.epoch_loss != null ? ` · pérdida <strong>${format(last.epoch_loss, 5)}</strong>` : ''}</p>`;
}

async function action(path, body = null) { setBusy(true); $('#footer-message').textContent = 'Actualizando estado...'; try { update(await request(path, 'POST', body)); $('#footer-message').textContent = 'Estado actualizado'; } catch (error) { $('#footer-message').textContent = error.message; } finally { setBusy(false); } }
$('#train-button').addEventListener('click', () => action('/api/train', config()));
$('#step-button').addEventListener('click', () => action('/api/step'));
$('#reset-button').addEventListener('click', () => action('/api/start', config()));
document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => { const mode = button.dataset.zoom; state.zoom = mode === 'reset' ? 1 : Math.max(.65, Math.min(1.7, state.zoom + (mode === 'in' ? .1 : -.1))); if (mode === 'reset') { state.panX = 0; state.panY = 0; } $('#zoom-label').textContent = `${Math.round(state.zoom * 100)}%`; drawNetwork(state.data || {parameters:{}}); }));
canvasWrap.addEventListener('wheel', event => { event.preventDefault(); state.zoom = Math.max(.65, Math.min(1.7, state.zoom + (event.deltaY < 0 ? .08 : -.08))); $('#zoom-label').textContent = `${Math.round(state.zoom * 100)}%`; drawNetwork(state.data || {parameters:{}}); }, { passive:false });
canvasWrap.addEventListener('pointerdown', event => { state.dragging = true; state.lastX = event.clientX; state.lastY = event.clientY; canvasWrap.classList.add('dragging'); canvasWrap.setPointerCapture(event.pointerId); });
canvasWrap.addEventListener('pointermove', event => { if (!state.dragging) return; state.panX += event.clientX - state.lastX; state.panY += event.clientY - state.lastY; state.lastX = event.clientX; state.lastY = event.clientY; drawNetwork(state.data || {parameters:{}}); });
canvasWrap.addEventListener('pointerup', () => { state.dragging = false; canvasWrap.classList.remove('dragging'); });
request('/api/state').then(update).catch(error => { $('#footer-message').textContent = error.message; });
