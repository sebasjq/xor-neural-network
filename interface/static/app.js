const $ = (selector) => document.querySelector(selector);
const svg = $('#network-canvas');
const lossChart = $('#loss-chart');
const canvasWrap = $('#canvas-wrap');
const compactBoard = matchMedia('(max-width: 650px)');
const state = { zoom: 1, panX: 0, panY: 0, pointer: null, data: null, busy: false };
const edges = [
  ['x1', 'h1', 'w_x1_h1', .5], ['x1', 'h2', 'w_x1_h2', .36],
  ['x2', 'h1', 'w_x2_h1', .64], ['x2', 'h2', 'w_x2_h2', .5],
  ['h1', 'out', 'w_h1_o', .5], ['h2', 'out', 'w_h2_o', .5],
];

const format = (value, digits = 4) => value == null ? '—' : Number(value).toFixed(digits);
const config = () => ({
  learning_rate: $('#learning-rate').valueAsNumber,
  max_epochs: $('#max-epochs').valueAsNumber,
  target_loss: $('#target-loss').valueAsNumber,
  seed: $('#seed').value === '' ? null : $('#seed').valueAsNumber,
});

let activeDrawer = null;
function closeDrawer(restoreFocus = true) {
  const { panel, toggle } = activeDrawer;
  if (restoreFocus) toggle.focus();
  panel.inert = true;
  panel.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
  activeDrawer = null;
}

document.querySelectorAll('.drawer-toggle').forEach(toggle => {
  const panel = document.getElementById(toggle.getAttribute('aria-controls'));
  const closeButton = panel.querySelector('[data-close-drawer]');
  toggle.addEventListener('click', () => {
    if (activeDrawer?.panel === panel) {
      closeDrawer();
      return;
    }
    if (activeDrawer) closeDrawer(false);
    activeDrawer = { panel, toggle };
    panel.inert = false;
    panel.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    closeButton.focus({ preventScroll: true });
  });
  closeButton.addEventListener('click', () => closeDrawer());
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!parameterHelp.hidden) {
    parameterHelp.hidden = true;
  } else if (activeDrawer) {
    closeDrawer();
  }
});

async function request(path, body) {
  const options = body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la operación.');
  return payload;
}

function updateStatus(busy = false) {
  state.busy = busy;
  document.querySelectorAll('.button').forEach(button => {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
  });
  refreshSettings();
}

function showError(message = '') {
  const notice = $('#error-message');
  notice.textContent = message;
  notice.hidden = !message;
}

function update(data) {
  state.data = data;
  $('#metric-epochs').textContent = data.progress.epochs.toLocaleString('es-CO');
  $('#metric-loss').textContent = format(data.progress.loss, 5);
  const correct = data.predictions.filter(row => row.is_correct).length;
  $('#metric-accuracy').textContent = data.predictions.length ? correct + '/' + data.predictions.length : '—';
  drawNetwork();
  drawChart(data.progress.loss_history);
  drawPredictions(data.predictions);
  drawStep(data.last_step);
}

function updateNetworkView() {
  const width = compactBoard.matches ? 540 : 860;
  svg.querySelector('.network-scene').setAttribute('transform',
    `translate(${width / 2 + state.panX} ${220 + state.panY}) scale(${state.zoom}) translate(${-width / 2} -220)`);
}

function drawNetwork() {
  const width = compactBoard.matches ? 540 : 860;
  const columns = [width * .15, width * .5, width * .85];
  const positions = {
    x1: [columns[0], 153], x2: [columns[0], 303],
    h1: [columns[1], 153], h2: [columns[1], 303],
    out: [columns[2], 228],
  };
  svg.setAttribute('viewBox', '0 0 ' + width + ' 440');
  const parameters = state.data?.parameters || {};
  const last = state.data?.last_step;
  const preview = state.data?.activation_preview;
  const activations = preview ?? last?.activations_before;
  const inputs = preview?.inputs ?? last?.inputs;
  const values = { x1: inputs?.[0], x2: inputs?.[1], h1: activations?.h1, h2: activations?.h2, out: activations?.output };
  const labels = { x1: 'Entrada 1', x2: 'Entrada 2', h1: 'Oculta 1', h2: 'Oculta 2', out: 'Salida' };

  const links = edges.map(([from, to, key, labelPosition]) => {
    const [fromX, y1] = positions[from];
    const [toX, y2] = positions[to];
    const x1 = fromX + 41;
    const x2 = toX - 41;
    const reach = (x2 - x1) * .45;
    const path = `M${x1} ${y1} C${x1 + reach} ${y1} ${x2 - reach} ${y2} ${x2} ${y2}`;
    const value = parameters[key];
    const tone = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
    const stage = to === 'out' ? 'second' : 'first';
    const thickness = Math.min(4, 1.6 + Math.abs(value ?? 0) * .8);
    const t = labelPosition;
    const u = 1 - t;
    const x = u ** 3 * x1 + 3 * u ** 2 * t * (x1 + reach) + 3 * u * t ** 2 * (x2 - reach) + t ** 3 * x2;
    const y = y1 + (y2 - y1) * (3 * u * t ** 2 + t ** 3) - 11;
    return {
      path: `<g class="network-link ${tone} ${stage}">
        <path class="link-track" d="${path}" stroke-width="${thickness}"/>
        <path class="link-signal" d="${path}" pathLength="100"/>
      </g>`,
      label: value == null ? '' : `<text x="${x}" y="${y}" class="edge-weight ${tone}" text-anchor="middle">${format(value, 2)}</text>`,
    };
  });

  const nodes = Object.entries(positions).map(([key, [x, y]]) => {
    const stage = key === 'out' ? 'output' : key.startsWith('x') ? 'input' : 'hidden';
    const value = values[key];
    const displayValue = stage === 'input' ? value ?? '—' : format(value, 2);
    return `<g class="network-node ${stage}" transform="translate(${x} ${y})" text-anchor="middle">
      <circle class="node-halo" r="47"/>
      <circle class="node-shell" r="42"/>
      <text y="-2" class="node-label">${labels[key]}</text>
      <text y="19" class="node-value">${displayValue}</text>
    </g>`;
  });

  const layers = ['Entrada', 'Oculta', 'Salida'].map((label, index) =>
    `<text x="${columns[index]}" y="69" class="layer-label" text-anchor="middle">${label}</text>`
  );
  const example = last?.kind === 'train' && inputs
    ? `<text x="${width / 2}" y="391" class="network-note example-note" text-anchor="middle">Ejemplo de prueba · (${inputs.join(', ')})</text>`
    : '';

  svg.innerHTML = `<defs>
    <radialGradient id="node-fill" cx=".3" cy=".2" r=".85">
      <stop stop-color="#fff"/><stop offset=".65" stop-color="#f3f7ff"/><stop offset="1" stop-color="#e1eaff"/>
    </radialGradient>
    <radialGradient id="output-fill" cx=".3" cy=".2" r=".85">
      <stop stop-color="#fff"/><stop offset="1" stop-color="#d1edf3"/>
    </radialGradient>
    <filter id="node-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#273d7a" flood-opacity=".16"/></filter>
  </defs>
  <g class="network-scene">
    ${links.map(link => link.path).join('')}${links.map(link => link.label).join('')}${nodes.join('')}${layers.join('')}
    ${example}<text x="${width / 2}" y="391" class="network-note training-note" text-anchor="middle">Entrenando…</text>
  </g>`;
  updateNetworkView();
}


function drawChart(history) {
  const last = history.at(-1);
  if (!last) {
    lossChart.innerHTML = '<text x="160" y="68" text-anchor="middle" fill="#50617f" font-size="11">Entrena para ver la curva de aprendizaje</text>';
    return;
  }
  const max = history.reduce((peak, row) => Math.max(peak, row.loss), .01);
  const point = (row, index) => [12 + index / Math.max(1, history.length - 1) * 296, 112 - row.loss / max * 96];
  const stride = Math.ceil(history.length / 600);
  const points = [];
  for (let index = 0; index < history.length - 1; index += stride) {
    points.push(point(history[index], index).join(','));
  }
  const [endX, endY] = point(last, history.length - 1);
  points.push(endX + ',' + endY);
  lossChart.innerHTML = `<path d="M12 16v96h296" fill="none" stroke="#b7c6e0"/>
    <polyline points="${points.join(' ')}" fill="none" stroke="#315de9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${endX}" cy="${endY}" r="3.5" fill="#315de9"/>`;
}

function drawPredictions(predictions) {
  const table = $('#prediction-table');
  if (!predictions.length) {
    table.innerHTML = '<p class="prediction-empty">Los resultados aparecen después del primer paso.</p>';
    return;
  }
  const rows = predictions.map(row => `<tr>
    <td>(${row.inputs.join(', ')})</td><td>${row.expected}</td><td>${format(row.output, 3)}</td>
    <td class="${row.is_correct ? 'ok' : 'bad'}">${row.is_correct ? 'Correcto' : 'Error'}</td>
  </tr>`).join('');
  table.innerHTML = `<table class="prediction-table"><thead><tr>
    <th scope="col">Entrada</th><th scope="col">Objetivo</th><th scope="col">Salida</th><th scope="col">Estado</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function drawStep(last) {
  const status = $('#step-status');
  const details = $('#step-details');
  const readout = $('#step-readout');
  details.hidden = !last || last.kind === 'train';
  if (!last) {
    status.textContent = '';
    details.open = false;
    readout.replaceChildren();
  } else if (last.kind === 'train') {
    status.textContent = state.data.progress.stop_reason === 'target_loss'
      ? `Objetivo alcanzado en ${state.data.progress.epochs.toLocaleString('es-CO')} épocas. Pérdida ${format(state.data.progress.loss, 5)}.`
      : `Límite de ${state.data.progress.epochs.toLocaleString('es-CO')} épocas alcanzado. Pérdida ${format(state.data.progress.loss, 5)}; el objetivo aún no se alcanzó.`;
    details.open = false;
    readout.replaceChildren();
  } else {
    status.textContent = `Época ${last.epoch} · Ejemplo ${last.iteration} de 4.`;
    if (last.stop_reason === 'target_loss') status.textContent += ' Pérdida objetivo alcanzada.';
    if (last.stop_reason === 'max_epochs') status.textContent += ' Límite de épocas alcanzado.';
    readout.innerHTML = `<p>Entrada <strong>(${last.inputs.join(', ')})</strong> · objetivo <strong>${last.expected}</strong><br>
      Salida antes de actualizar los pesos <strong>${format(last.activations_before.output)}</strong>
      ${last.epoch_loss != null ? ` · pérdida <strong>${format(last.epoch_loss, 5)}</strong>` : ''}</p>`;
  }
}

async function action(path, body = {}) {
  updateStatus(true);
  showError();
  const training = path === '/api/train';
  if (training) svg.dataset.activity = 'training';
  $('#step-status').textContent = training ? 'Entrenando automáticamente…' : 'Actualizando la red…';
  try {
    const data = await request(path, body);
    svg.dataset.activity = training || path === '/api/step' ? 'pulse' : '';
    update(data);
  } catch (error) {
    svg.dataset.activity = '';
    showError(error.message);
    drawStep(state.data?.last_step);
  } finally {
    updateStatus();
  }
}

const settings = $('#settings');
const parameterFields = [...settings.querySelectorAll('input')];
const parameterHelp = $('#parameter-help');
const parameterAdvice = {
  'learning-rate': {
    title: 'Tasa de aprendizaje',
    text: 'Controla cuánto cambian los pesos. Para empezar, prueba entre 0,05 y 0,5; el valor inicial es 0,25. Este panel admite de 0,001 a 1, con hasta tres decimales.',
    range: 'Usa una tasa entre 0,001 y 1.',
    precision: 'La tasa admite hasta tres decimales.',
  },
  'max-epochs': {
    title: 'Épocas máximas',
    text: 'Una época recorre los cuatro ejemplos Xor. Prueba entre 1.000 y 10.000 épocas. El límite permitido es de 1 a 100.000. Puede terminar antes al alcanzar la pérdida objetivo.',
    range: 'Usa entre 1 y 100.000 épocas.',
    precision: 'Las épocas deben ser un número entero.',
  },
  'target-loss': {
    title: 'Pérdida objetivo',
    text: 'Prueba entre 0,001 y 0,01. Cuanto menor sea el objetivo, más entrenamiento puede necesitar. Se admite de 0,0001 a 0,5, con hasta cuatro decimales. Un objetivo alto puede detener la red muy pronto.',
    range: 'La pérdida objetivo debe estar entre 0,0001 y 0,5.',
    precision: 'La pérdida admite hasta cuatro decimales.',
  },
  seed: {
    title: 'Semilla',
    text: 'Puedes dejarla vacía para usar valores aleatorios. Usa, por ejemplo, 42 para repetir el experimento con los mismos parámetros. Se permiten enteros de −2.147.483.648 a 2.147.483.647.',
    range: 'La semilla debe estar entre −2.147.483.648 y 2.147.483.647.',
    precision: 'La semilla debe ser un número entero.',
  },
};

function parameterError(field) {
  const advice = parameterAdvice[field.id];
  if (field.validity.badInput) return 'Escribe un número válido.';
  if (field.validity.valueMissing) return advice.title + ' es obligatorio.';
  if (field.validity.rangeUnderflow || field.validity.rangeOverflow) return advice.range;
  if (field.validity.stepMismatch) return advice.precision;
  return '';
}

function refreshSettings() {
  parameterFields.forEach(field => { field.disabled = state.busy; });
  let firstError = '';
  for (const field of parameterFields) {
    const error = parameterError(field);
    field.setAttribute('aria-invalid', String(Boolean(error)));
    firstError ||= error;
  }
  $('#settings-feedback').textContent = firstError;
  const values = config();
  const changed = state.data?.ready && Object.keys(values).some(key => values[key] !== state.data.configuration[key]);
  const finished = Boolean(state.data?.progress.stop_reason);
  const blocked = state.busy || Boolean(firstError);
  $('#train-button').disabled = blocked;
  $('#step-button').disabled = blocked || (finished && !changed);
  $('#reset-button').disabled = blocked;
  $('#training-plan').textContent = firstError
    ? 'Corrige los parámetros para entrenar.'
    : `Hasta ${values.max_epochs.toLocaleString('es-CO')} épocas · pérdida ≤ ${values.target_loss.toLocaleString('es-CO', { maximumFractionDigits: 4 })}.${changed ? ' Los cambios iniciarán una nueva red.' : finished ? ' Entrenar red inicia un nuevo intento.' : ''}`;
  if (!parameterHelp.hidden) showParameterHelp(document.activeElement);
  return !firstError;
}

function positionParameterHelp(field) {
  const rect = field.getBoundingClientRect();
  const width = parameterHelp.offsetWidth;
  const height = parameterHelp.offsetHeight;
  const left = Math.max(12, Math.min(rect.left, innerWidth - width - 12));
  const top = rect.bottom + height + 20 <= innerHeight ? rect.bottom + 8 : rect.top - height - 8;
  parameterHelp.style.left = left + 'px';
  parameterHelp.style.top = Math.max(12, Math.min(top, innerHeight - height - 12)) + 'px';
}

function showParameterHelp(field) {
  const advice = parameterAdvice[field?.id];
  if (!advice) {
    parameterHelp.hidden = true;
    return;
  }
  $('#parameter-help-title').textContent = advice.title;
  $('#parameter-help-text').textContent = advice.text;
  $('#parameter-help-error').textContent = parameterError(field);
  parameterHelp.hidden = false;
  positionParameterHelp(field);
}

settings.addEventListener('submit', event => event.preventDefault());
settings.addEventListener('input', refreshSettings);
settings.addEventListener('focusin', event => showParameterHelp(event.target));
settings.addEventListener('focusout', () => { parameterHelp.hidden = true; });
window.addEventListener('resize', () => {
  if (!parameterHelp.hidden) positionParameterHelp(document.activeElement);
});
$('#training-drawer .drawer-content').addEventListener('scroll', () => {
  parameterHelp.hidden = true;
});

function validateSettings() {
  if (refreshSettings()) return true;
  $('#training-options').open = true;
  const invalid = parameterFields.find(field => !field.validity.valid);
  invalid.focus();
  showParameterHelp(invalid);
  return false;
}

$('#train-button').addEventListener('click', () => {
  if (validateSettings()) action('/api/train', config());
});
$('#step-button').addEventListener('click', () => {
  if (validateSettings()) action('/api/step', config());
});
$('#reset-button').addEventListener('click', () => {
  if (validateSettings()) action('/api/start', config());
});


function zoomTo(value) {
  state.zoom = Math.max(.65, Math.min(2.1, value));
  $('#zoom-label').textContent = Math.round(state.zoom * 100);
  $('#zoom-slider').value = Math.round(state.zoom * 100);
  updateNetworkView();
}

$('#zoom-slider').addEventListener('input', event => zoomTo(Number(event.target.value) / 100));
document.querySelectorAll('[data-zoom-step]').forEach(button => {
  button.addEventListener('click', () => zoomTo(state.zoom + Number(button.dataset.zoomStep) * .1));
});
document.querySelectorAll('[data-zoom="reset"]').forEach(button => {
  button.addEventListener('click', () => {
    state.panX = state.panY = 0;
    zoomTo(1);
  });
});
canvasWrap.addEventListener('wheel', event => {
  if (event.ctrlKey || event.deltaY === 0) return;
  event.preventDefault();
  zoomTo(state.zoom + (event.deltaY < 0 ? .08 : -.08));
}, { passive: false });

$('#pan-button').addEventListener('click', () => {
  const enabled = $('#pan-button').getAttribute('aria-pressed') !== 'true';
  $('#pan-button').setAttribute('aria-pressed', String(enabled));
  canvasWrap.classList.toggle('pan-disabled', !enabled);
});

canvasWrap.addEventListener('pointerdown', event => {
  if (event.button !== 0 || state.pointer || $('#pan-button').getAttribute('aria-pressed') !== 'true') return;
  state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvasWrap.classList.add('dragging');
  canvasWrap.setPointerCapture(event.pointerId);
});
canvasWrap.addEventListener('pointermove', event => {
  const pointer = state.pointer;
  if (pointer?.id !== event.pointerId) return;
  const scale = svg.getScreenCTM().a;
  state.panX += (event.clientX - pointer.x) / scale;
  state.panY += (event.clientY - pointer.y) / scale;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  updateNetworkView();
});
canvasWrap.addEventListener('lostpointercapture', event => {
  if (state.pointer?.id !== event.pointerId) return;
  state.pointer = null;
  canvasWrap.classList.remove('dragging');
});
compactBoard.addEventListener('change', drawNetwork);

drawNetwork();
drawChart([]);
drawPredictions([]);
drawStep();
updateStatus(true);
request('/api/state')
  .then(data => {
    update(data);
    Object.entries(data.configuration).forEach(([name, value]) => {
      $('#' + name.replaceAll('_', '-')).value = value ?? '';
    });
    updateStatus();
  })
  .catch(error => {
    updateStatus();
    showError(error.message);
  });

function initializeGlass() {
  if (!window.DisplacementUtils || !window.ResizeObserver) return;
  const surfaces = new Map();

  document.querySelectorAll('.liquid-glass').forEach(element => {
    surfaces.set(element, { size: '' });
  });

  const applyGlass = target => {
    const { size } = surfaces.get(target);
    const width = target.offsetWidth;
    const height = target.offsetHeight;
    if (!width || !height) return;
    const radius = Math.min(parseFloat(getComputedStyle(target).borderTopLeftRadius), width / 2, height / 2);
    const nextSize = [width, height, radius].join(',');
    if (size === nextSize) return;
    const filter = window.DisplacementUtils.getDisplacementFilter({
      width,
      height,
      radius,
      depth: 5,
      strength: 40,
      chromaticAberration: 2,
    });
    target.style.setProperty('--glass-filter', `blur(1px) url('${filter}') blur(2px) brightness(1.1) saturate(1.5)`);
    surfaces.get(target).size = nextSize;
  };

  const observer = new ResizeObserver(entries => {
    entries.forEach(({ target }) => applyGlass(target));
  });
  surfaces.forEach((_, element) => observer.observe(element, { box: 'border-box' }));
  surfaces.forEach((_, element) => applyGlass(element));
}

initializeGlass();
