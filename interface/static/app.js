const $ = (selector) => document.querySelector(selector);
const svg = $('#network-canvas');
const lossChart = $('#loss-chart');
const canvasWrap = $('#canvas-wrap');
const workspace = $('.workspace');
const compactBoard = matchMedia('(max-width: 650px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const state = { zoom: 1, panX: 0, panY: 0, pointer: null, data: null, busy: false, run: null, speed: 'normal' };
const MIN_ZOOM = .65;
const MAX_ZOOM = 2.1;
const zoomLabel = $('#zoom-label');
const zoomOutButton = $('[data-zoom-step="-1"]');
const zoomInButton = $('[data-zoom-step="1"]');
const resetViewButton = $('[data-zoom="reset"]');
const trainButton = $('#train-button');
const stepButton = $('#step-button');
const stageCard = $('#stage-card');
const stageText = $('#stage-text');
const stageCount = $('#stage-count');
const stageSpark = $('#stage-spark');
const stageSkip = $('#stage-skip');
const stageStop = $('#stage-stop');
const stagePills = [...document.querySelectorAll('.stage-steps li')];
let viewTween = 0;
let introTimer = 0;
let cardTimer = 0;
let settleTimer = 0;
const edges = [
  ['x1', 'h1', 'w_x1_h1', .5], ['x1', 'h2', 'w_x1_h2', .36],
  ['x2', 'h1', 'w_x2_h1', .64], ['x2', 'h2', 'w_x2_h2', .5],
  ['h1', 'out', 'w_h1_o', .5], ['h2', 'out', 'w_h2_o', .5],
];

// Un "ejemplo" es una fila de la tabla Xor; cuatro ejemplos forman una época.
// `stage`: duración base de cada fase (ms). `guided`: cuántos ejemplos se
// muestran fase por fase antes de acelerar hasta la pérdida objetivo.
const SPEEDS = {
  slow: { stage: 1100, guided: 8 },
  normal: { stage: 700, guided: 4 },
  fast: { stage: 380, guided: 4 },
};
const PHASES = ['forward', 'error', 'backward', 'update'];
const exampleFactor = index => Math.max(.35, 1 - index * .22);

const format = (value, digits = 4) => value == null ? '—' : Number(value).toFixed(digits);
const signed = (value, digits = 2) => (value < 0 ? '−' : '+') + Math.abs(value).toFixed(digits);
const mix = (from, to, t) => Object.fromEntries(Object.keys(to).map(key =>
  [key, from[key] == null ? to[key] : from[key] + (to[key] - from[key]) * t]));
const config = () => ({
  learning_rate: $('#learning-rate').valueAsNumber,
  max_epochs: $('#max-epochs').valueAsNumber,
  target_loss: $('#target-loss').valueAsNumber,
  seed: $('#seed').value === '' ? null : $('#seed').valueAsNumber,
});
const isChanged = values => Boolean(state.data?.ready) &&
  Object.keys(values).some(key => values[key] !== state.data.configuration[key]);

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
    panel.focus({ preventScroll: true });
  });
});

// Un toque o clic fuera del panel lo cierra. Los botones de los paneles, la
// barra de vista y la ayuda de parámetros no cuentan como "fuera".
document.addEventListener('pointerdown', event => {
  if (!activeDrawer || !(event.target instanceof Element)) return;
  if (activeDrawer.panel.contains(event.target)) return;
  if (event.target.closest('.drawer-toggle, .view-dock, .parameter-help, .stage-card')) return;
  closeDrawer(false);
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!parameterHelp.hidden) {
    parameterHelp.hidden = true;
  } else if (activeDrawer) {
    closeDrawer();
  }
});

// ——— Desplegables internos (los de la flechita) con altura animada ———
// El cierre exclusivo de "Resultados" lo gestiona este código (en vez del
// atributo `name`) para poder animar también el que se cierra.
document.querySelectorAll('details[name]').forEach(details => {
  details.dataset.group = details.getAttribute('name');
  details.removeAttribute('name');
});

const isDetailsOpen = details => details._animation ? details._target : details.open;

function toggleDetails(details, willOpen) {
  const summary = details.querySelector(':scope > summary');
  const content = [...details.children].filter(child => child !== summary);
  if (willOpen && details.dataset.group) {
    document.querySelectorAll(`details[data-group="${details.dataset.group}"]`).forEach(other => {
      if (other !== details && isDetailsOpen(other)) toggleDetails(other, false);
    });
  }
  if (reducedMotion.matches || !details.animate) {
    details.open = willOpen;
    return;
  }

  // Altura de partida: la que se ve ahora (también si se interrumpe a mitad).
  const start = details.getBoundingClientRect().height;
  details._animations?.forEach(animation => animation.cancel());
  details.open = true;
  let end = details.offsetHeight;
  if (!willOpen) {
    details.open = false;
    end = details.offsetHeight;
    details.open = true;
  }

  details._target = willOpen;
  details.toggleAttribute('data-closing', !willOpen);
  // Recorta el contenido que sobra mientras cambia la altura, sin cortar el
  // fondo de la fila ni el anillo de foco a los lados.
  details.style.clipPath = 'inset(-6px -12px 0 -12px)';
  const duration = willOpen ? 400 : 300;
  const easing = 'cubic-bezier(.16, 1, .3, 1)';
  const height = details.animate(
    [{ height: start + 'px' }, { height: end + 'px' }],
    { duration, easing, fill: 'forwards' });
  const fade = content.map(child => child.animate(
    willOpen
      ? [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }]
      : [{ opacity: 1 }, { opacity: 0 }],
    { duration: willOpen ? duration * .85 : duration * .5, delay: willOpen ? 50 : 0, easing, fill: 'both' }));
  details._animations = [height, ...fade];
  details._animation = height;
  height.onfinish = () => {
    details._animations.forEach(animation => animation.cancel());
    details._animations = null;
    details._animation = null;
    details.open = willOpen;
    details.removeAttribute('data-closing');
    details.style.clipPath = '';
    if (willOpen) details.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };
}

document.addEventListener('click', event => {
  const summary = event.target instanceof Element && event.target.closest('.panel-section > summary');
  if (!summary) return;
  event.preventDefault();
  const details = summary.parentElement;
  toggleDetails(details, !isDetailsOpen(details));
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
  refreshSettings();
}

function showError(message = '') {
  const notice = $('#error-message');
  notice.textContent = message;
  notice.hidden = !message;
}

// Actualiza los paneles sin volver a dibujar la red (la animación la mueve a mano).
function updatePanels(data) {
  $('#metric-epochs').textContent = data.progress.epochs.toLocaleString('es-CO');
  $('#metric-loss').textContent = format(data.progress.loss, 5);
  const correct = data.predictions.filter(row => row.is_correct).length;
  $('#metric-accuracy').textContent = data.predictions.length ? correct + '/' + data.predictions.length : '—';
  drawChart(data.progress.loss_history);
  drawPredictions(data.predictions);
  drawStep(data.last_step);
}

function update(data) {
  state.data = data;
  updatePanels(data);
  drawNetwork();
}

function updateNetworkView() {
  const width = compactBoard.matches ? 540 : 860;
  svg.querySelector('.network-scene').setAttribute('transform',
    `translate(${width / 2 + state.panX} ${220 + state.panY}) scale(${state.zoom}) translate(${-width / 2} -220)`);
  updateDock();
}

function updateDock() {
  zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
  zoomOutButton.setAttribute('aria-disabled', String(state.zoom <= MIN_ZOOM + .001));
  zoomInButton.setAttribute('aria-disabled', String(state.zoom >= MAX_ZOOM - .001));
  const isDefault = state.zoom === 1 && !state.panX && !state.panY;
  resetViewButton.setAttribute('aria-disabled', String(isDefault));
}

function playIntro() {
  svg.dataset.intro = 'play';
  clearTimeout(introTimer);
  introTimer = setTimeout(() => { svg.dataset.intro = 'done'; }, 4800);
}

function endIntro() {
  clearTimeout(introTimer);
  if (svg.dataset.intro !== 'wait') svg.dataset.intro = 'done';
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
      path: `<g class="network-link ${tone} ${stage}" data-edge="${key}">
        <path class="link-track" d="${path}" pathLength="100" stroke-width="${thickness}"/>
        <path class="link-signal" d="${path}" pathLength="100"/>
        <path class="link-back" d="${path}" pathLength="100"/>
      </g>`,
      label: value == null ? '' : `<text x="${x}" y="${y}" class="edge-weight ${tone}" data-edge="${key}" text-anchor="middle">${format(value, 3)}</text>
        <text x="${x}" y="${y + 27}" class="edge-delta ${stage}" data-edge="${key}" text-anchor="middle"></text>`,
    };
  });

  const nodes = Object.entries(positions).map(([key, [x, y]]) => {
    const stage = key === 'out' ? 'output' : key.startsWith('x') ? 'input' : 'hidden';
    const value = values[key];
    const displayValue = stage === 'input' ? value ?? '—' : format(value, 2);
    return `<g class="network-node ${stage}" data-node="${key}" transform="translate(${x} ${y})" text-anchor="middle">
      <circle class="node-halo" r="47"/>
      <circle class="node-shell" r="42"/>
      <text y="-2" class="node-label">${labels[key]}</text>
      <text y="19" class="node-value">${displayValue}</text>
      ${key === 'out' ? '<text y="72" class="node-error"></text>' : ''}
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
    ${example}
  </g>`;
  updateNetworkView();
}

// ——— Pintado "en el sitio": cambian números y colores sin redibujar la red ———
function setNodeValue(key, text, flash = false) {
  const element = svg.querySelector(`.network-node[data-node="${key}"] .node-value`);
  if (!element) return;
  element.textContent = text;
  if (flash && !reducedMotion.matches) {
    element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  }
}

function setNodeNote(text) {
  const note = svg.querySelector('.node-error');
  if (note) note.textContent = text;
}

function paintWeights(parameters) {
  edges.forEach(([, , key]) => {
    const value = parameters[key];
    if (value == null) return;
    const tone = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
    const group = svg.querySelector(`.network-link[data-edge="${key}"]`);
    const label = svg.querySelector(`.edge-weight[data-edge="${key}"]`);
    if (group) {
      group.classList.remove('positive', 'negative', 'neutral');
      group.classList.add(tone);
      group.querySelector('.link-track').setAttribute('stroke-width', Math.min(4, 1.6 + Math.abs(value) * .8));
    }
    if (label) {
      label.classList.remove('positive', 'negative', 'neutral');
      label.classList.add(tone);
      label.textContent = format(value, 3);
    }
  });
}

function paintDeltas(before, after) {
  edges.forEach(([, , key]) => {
    const element = svg.querySelector(`.edge-delta[data-edge="${key}"]`);
    if (!element) return;
    const delta = (after[key] ?? 0) - (before[key] ?? after[key] ?? 0);
    element.textContent = 'Δ ' + signed(delta, 3);
  });
}

function tweenWeights(from, to, duration, run) {
  if (run.fast || duration <= 0 || reducedMotion.matches) {
    paintWeights(to);
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const start = performance.now();
    const frame = now => {
      if (run.fast) {
        paintWeights(to);
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / duration);
      paintWeights(mix(from, to, 1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

// ——— Tarjeta de fases (abajo, centrada) ———
function markPhase(phase) {
  const order = PHASES.indexOf(phase);
  stagePills.forEach((pill, index) => {
    const active = phase !== 'done' && index === order;
    pill.classList.toggle('is-active', active);
    pill.classList.toggle('is-done', phase === 'done' || (order > -1 && index < order));
    if (active) pill.setAttribute('aria-current', 'step');
    else pill.removeAttribute('aria-current');
  });
}

function setStageText(text, animate = true) {
  if (stageText.textContent === text) return;
  stageText.textContent = text;
  if (animate && !reducedMotion.matches) {
    stageText.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
      { duration: 260, easing: 'ease-out' });
  }
}

function setStageControls() {
  const run = state.run;
  const label = run?.mode === 'train' && run.phase === 'guided' ? 'Acelerar' : 'Saltar animación';
  stageSkip.setAttribute('aria-label', label);
  stageSkip.title = label;
  stageStop.hidden = run?.mode !== 'train';
  $('#stage-actions').hidden = !run;
}

function showCard() {
  clearTimeout(cardTimer);
  stageCard.hidden = false;
  workspace.classList.add('has-stage');
}

function hideCard() {
  clearTimeout(cardTimer);
  stageCard.hidden = true;
  workspace.classList.remove('has-stage');
}

function drawSpark(history) {
  if (history.length < 2) {
    stageSpark.innerHTML = '';
    return;
  }
  const max = history.reduce((peak, row) => Math.max(peak, row.loss), .01);
  const stride = Math.ceil(history.length / 80);
  const point = (row, index) =>
    `${(2 + index / (history.length - 1) * 92).toFixed(1)},${(26 - row.loss / max * 22).toFixed(1)}`;
  const points = [];
  for (let index = 0; index < history.length - 1; index += stride) points.push(point(history[index], index));
  points.push(point(history.at(-1), history.length - 1));
  stageSpark.innerHTML = `<polyline points="${points.join(' ')}" fill="none" stroke="#315de9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// ——— Control de la ejecución animada ———
function createRun(mode) {
  const run = {
    mode,
    phase: 'guided',
    stopped: false,
    fast: false,
    skipGuided: false,
    wakers: new Set(),
    sleep(ms) {
      const wait = run.fast ? 0 : ms * (reducedMotion.matches ? .2 : 1);
      if (wait <= 0) return Promise.resolve();
      return new Promise(resolve => {
        const wake = () => {
          clearTimeout(timer);
          run.wakers.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, wait);
        run.wakers.add(wake);
      });
    },
    wake() { [...run.wakers].forEach(wake => wake()); },
    skip() {
      run.fast = true;
      if (run.phase === 'guided') run.skipGuided = true;
      run.wake();
    },
    stop() {
      run.stopped = true;
      run.fast = true;
      run.wake();
    },
  };
  return run;
}

function beginRun(mode) {
  endIntro();
  clearTimeout(settleTimer);
  const run = createRun(mode);
  state.run = run;
  showError();
  showCard();
  stageCard.dataset.mode = 'guided';
  stageSpark.innerHTML = '';
  svg.dataset.run = 'on';
  svg.dataset.stage = '';
  svg.dataset.deltas = 'none';
  svg.classList.remove('show-error');
  markPhase(null);
  setStageText('Preparando el ejemplo…', false);
  setStageControls();
  if (compactBoard.matches && activeDrawer) closeDrawer(false);
  renderRunUI();
  return run;
}

function endRun(message) {
  state.run = null;
  svg.dataset.run = '';
  svg.dataset.deltas = 'none';
  svg.classList.remove('show-error');
  markPhase('done');
  if (message) setStageText(message);
  setStageControls();
  renderRunUI();
  clearTimeout(cardTimer);
  cardTimer = setTimeout(hideCard, 7000);
}

// Al terminar, la red se redibuja con los datos finales y respira una vez.
function settle(data, message) {
  svg.dataset.stage = 'done';
  update(data);
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { if (svg.dataset.stage === 'done') svg.dataset.stage = ''; }, 1600);
  endRun(message);
}

function recover() {
  svg.dataset.stage = '';
  if (state.data) update(state.data);
}

function renderRunUI() {
  const training = state.run?.mode === 'train';
  trainButton.classList.toggle('is-running', training);
  trainButton.querySelector('strong').textContent = training ? 'Detener' : 'Entrenar';
  trainButton.querySelector('small').textContent = training ? 'Pausar aquí' : 'Automático';
  trainButton.querySelector('path').setAttribute('d', training ? 'M7 7h10v10H7z' : 'm9 5 11 7-11 7z');
  refreshSettings();
}

function summary(data) {
  const progress = data.progress;
  const epochs = progress.epochs.toLocaleString('es-CO');
  if (progress.stop_reason === 'target_loss') {
    return `Listo · objetivo alcanzado en ${epochs} épocas con pérdida ${format(progress.loss, 5)}.`;
  }
  if (progress.stop_reason === 'max_epochs') {
    return `Límite de ${epochs} épocas alcanzado · pérdida ${format(progress.loss, 5)}.`;
  }
  return `Detenido en la época ${epochs} · pérdida ${format(progress.loss, 5)}. Pulsa Entrenar para continuar.`;
}

// Si la red terminó o los parámetros cambiaron, se empieza una red nueva.
async function currentNetwork(values) {
  const data = state.data;
  if (data?.progress.stop_reason || isChanged(values)) {
    const fresh = await request('/api/start', values);
    update(fresh);
    return fresh;
  }
  return data;
}

// Un ejemplo completo, fase por fase: adelante → error → atrás → ajuste.
async function animateExample(previous, data, run, factor = 1) {
  const step = data.last_step;
  const before = previous?.parameters ?? {};
  const after = data.parameters ?? {};
  const [first, second] = step.inputs;
  const { h1, h2, output } = step.activations_before;
  const error = step.expected - output;
  const ms = SPEEDS[state.speed].stage * factor;

  setStageControls();
  stageCount.textContent = `Época ${step.epoch} · ejemplo ${step.iteration} de 4`;
  paintWeights(before);
  paintDeltas(before, after);
  svg.dataset.deltas = 'none';
  svg.classList.remove('show-error');
  setNodeNote('');
  setNodeValue('x1', first);
  setNodeValue('x2', second);
  ['h1', 'h2', 'out'].forEach(key => setNodeValue(key, '—'));

  const enter = (name, phase, text) => {
    svg.dataset.stage = name;
    svg.style.setProperty('--stage-ms', Math.max(ms, 60) + 'ms');
    markPhase(phase);
    setStageText(text);
  };

  enter('forward-hidden', 'forward', `La entrada (${first}, ${second}) viaja hacia las neuronas ocultas.`);
  await run.sleep(ms * .72);
  setNodeValue('h1', format(h1, 2), true);
  setNodeValue('h2', format(h2, 2), true);
  await run.sleep(ms * .28);

  enter('forward-output', 'forward', `Las ocultas envían su resultado a la salida: ${format(output, 2)}.`);
  await run.sleep(ms * .72);
  setNodeValue('out', format(output, 2), true);
  await run.sleep(ms * .28);

  enter('error', 'error', `Se esperaba ${step.expected} y la red dio ${format(output, 2)}: error ${signed(error, 2)}.`);
  setNodeNote(`error ${signed(error, 2)}`);
  svg.classList.add('show-error');
  await run.sleep(ms);

  enter('back-output', 'backward', 'Retropropagación: el error vuelve desde la salida y calcula cuánto debe cambiar cada peso de esa capa.');
  svg.dataset.deltas = 'second';
  await run.sleep(ms);

  enter('back-hidden', 'backward', 'Retropropagación: el error llega a las neuronas ocultas y calcula el cambio de los pesos de entrada.');
  svg.dataset.deltas = 'all';
  await run.sleep(ms);

  enter('update', 'update', 'Ajuste: cada peso suma su cambio (Δ) y el error baja un poco.');
  await tweenWeights(before, after, ms * 1.1, run);
  svg.dataset.deltas = 'none';
  svg.classList.remove('show-error');
  svg.dataset.stage = '';
  paintWeights(after);
  await run.sleep(ms * .15);
}

// Tras los ejemplos guiados: el resto de las épocas se reproduce acelerado.
async function fastForward(previous, data, run) {
  run.phase = 'turbo';
  run.fast = false;
  run.skipGuided = false;
  stageCard.dataset.mode = 'turbo';
  setStageControls();
  svg.dataset.stage = 'turbo';
  setNodeNote('');
  svg.classList.remove('show-error');

  const before = previous?.parameters ?? {};
  const after = data.parameters ?? {};
  const history = data.progress.loss_history;
  const startLength = previous?.progress.loss_history.length ?? 0;
  const startEpochs = previous?.progress.epochs ?? 0;
  const endEpochs = data.progress.epochs;
  const span = Math.max(10, endEpochs - startEpochs);
  const duration = (1400 + Math.log10(span) * 450) * (SPEEDS[state.speed].stage / 700);
  stageCount.textContent = 'Acelerado';
  $('#step-status').textContent = 'Entrenando de forma acelerada…';

  await new Promise(resolve => {
    const start = performance.now();
    const frame = now => {
      const t = run.fast || reducedMotion.matches ? 1 : Math.min(1, (now - start) / duration);
      const eased = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const epochs = Math.round(startEpochs + (endEpochs - startEpochs) * eased);
      const count = Math.max(1, Math.round(startLength + (history.length - startLength) * eased));
      const slice = history.slice(0, count);
      const loss = slice.at(-1)?.loss;
      $('#metric-epochs').textContent = epochs.toLocaleString('es-CO');
      $('#metric-loss').textContent = format(loss, 5);
      drawChart(slice);
      drawSpark(slice);
      paintWeights(mix(before, after, eased));
      markPhase(PHASES[Math.floor(now / 230) % PHASES.length]);
      setStageText(`Acelerando · época ${epochs.toLocaleString('es-CO')} · pérdida ${format(loss, 4)}`, false);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

async function runTraining() {
  if (state.run) return;
  const values = config();
  const run = beginRun('train');
  try {
    let current = await currentNetwork(values);
    for (let index = 0; !run.stopped && !run.skipGuided && index < SPEEDS[state.speed].guided && !current.progress.stop_reason; index++) {
      const next = await request('/api/step', values);
      await animateExample(current, next, run, exampleFactor(index));
      state.data = next;
      updatePanels(next);
      current = next;
    }
    if (!run.stopped && !current.progress.stop_reason) {
      const final = await request('/api/train', values);
      await fastForward(current, final, run);
      current = final;
    }
    settle(current, summary(current));
  } catch (error) {
    showError(error.message);
    recover();
    endRun('');
  }
}

async function runExample() {
  if (state.run) return;
  const values = config();
  const run = beginRun('step');
  try {
    const current = await currentNetwork(values);
    const next = await request('/api/step', values);
    await animateExample(current, next, run, 1);
    state.data = next;
    const message = next.progress.stop_reason
      ? summary(next)
      : `Ejemplo ${next.last_step.iteration} de 4 completado. Pulsa «Un ejemplo» para seguir.`;
    settle(next, message);
  } catch (error) {
    showError(error.message);
    recover();
    endRun('');
  }
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
    table.innerHTML = '<p class="prediction-empty">Los resultados aparecen después del primer ejemplo.</p>';
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

// Solo se usa para "Reiniciar sin entrenar".
async function action(path, body = {}) {
  endIntro();
  hideCard();
  updateStatus(true);
  showError();
  $('#step-status').textContent = 'Actualizando la red…';
  try {
    update(await request(path, body));
  } catch (error) {
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
  const running = Boolean(state.run);
  parameterFields.forEach(field => { field.disabled = state.busy || running; });
  let firstError = '';
  for (const field of parameterFields) {
    const error = parameterError(field);
    field.setAttribute('aria-invalid', String(Boolean(error)));
    firstError ||= error;
  }
  $('#settings-feedback').textContent = firstError;
  const values = config();
  const changed = isChanged(values);
  const finished = Boolean(state.data?.progress.stop_reason);
  const blocked = state.busy || running || Boolean(firstError);
  // Mientras se entrena, el botón principal funciona como "Detener".
  trainButton.disabled = state.run?.mode === 'train' ? state.run.stopped : blocked;
  stepButton.disabled = blocked || (finished && !changed);
  $('#reset-button').disabled = blocked;
  document.querySelectorAll('.button').forEach(button => {
    button.setAttribute('aria-busy', String(state.busy || running));
  });
  $('#training-plan').textContent = firstError
    ? 'Corrige los parámetros para entrenar.'
    : `Hasta ${values.max_epochs.toLocaleString('es-CO')} épocas · pérdida ≤ ${values.target_loss.toLocaleString('es-CO', { maximumFractionDigits: 4 })}.${changed ? ' Los cambios iniciarán una nueva red.' : finished ? ' Entrenar inicia un nuevo intento.' : ''}`;
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

trainButton.addEventListener('click', () => {
  if (state.run?.mode === 'train') {
    state.run.stop();
    renderRunUI();
    return;
  }
  if (validateSettings()) runTraining();
});
stepButton.addEventListener('click', () => {
  if (validateSettings()) runExample();
});
$('#reset-button').addEventListener('click', () => {
  if (validateSettings()) action('/api/start', config());
});
stageSkip.addEventListener('click', () => state.run?.skip());
stageStop.addEventListener('click', () => {
  state.run?.stop();
  renderRunUI();
});
document.querySelectorAll('input[name="speed"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.checked) state.speed = radio.value;
  });
});


function zoomTo(value) {
  cancelAnimationFrame(viewTween);
  state.zoom = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)) * 100) / 100;
  updateNetworkView();
}

function resetView() {
  cancelAnimationFrame(viewTween);
  const from = { zoom: state.zoom, panX: state.panX, panY: state.panY };
  const duration = reducedMotion.matches ? 0 : 420;
  const start = performance.now();
  const step = now => {
    const t = duration ? Math.min(1, (now - start) / duration) : 1;
    const eased = 1 - (1 - t) ** 3;
    state.zoom = t === 1 ? 1 : from.zoom + (1 - from.zoom) * eased;
    state.panX = t === 1 ? 0 : from.panX * (1 - eased);
    state.panY = t === 1 ? 0 : from.panY * (1 - eased);
    updateNetworkView();
    if (t < 1) viewTween = requestAnimationFrame(step);
  };
  viewTween = requestAnimationFrame(step);
}

document.querySelectorAll('[data-zoom-step]').forEach(button => {
  button.addEventListener('click', () => zoomTo(state.zoom + Number(button.dataset.zoomStep) * .1));
});
resetViewButton.addEventListener('click', resetView);
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
  cancelAnimationFrame(viewTween);
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
setTimeout(() => { if (svg.dataset.intro === 'wait') playIntro(); }, 1200);
request('/api/state')
  .then(data => {
    playIntro();
    update(data);
    Object.entries(data.configuration).forEach(([name, value]) => {
      $('#' + name.replaceAll('_', '-')).value = value ?? '';
    });
    updateStatus();
  })
  .catch(error => {
    playIntro();
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