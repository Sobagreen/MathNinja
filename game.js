const CANVAS = /** @type {HTMLCanvasElement} */(document.getElementById('canvas'));
const CTX = CANVAS.getContext('2d', { alpha: false });
const DPI = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const TRAY = document.getElementById('tray');
const BTN_RESTART = document.getElementById('btnRestart');
const BTN_PAUSE = document.getElementById('btnPause');
const BTN_START_ENDLESS = document.getElementById('btnStartEndless');
const BTN_START_STORY = document.getElementById('btnStartStory');
const OVERLAY = document.getElementById('overlay');

const chipGoal = document.getElementById('chipGoal');
const chipFail = document.getElementById('chipFail');
const chipMode = document.getElementById('chipMode');

const craftSlotEls = [
  document.getElementById('craftSlot0'),
  document.getElementById('craftSlot1')
];
const craftOpEls = Array.from(document.querySelectorAll('.craft-op'));
const craftBar = document.getElementById('craftBar');
const craftHint = document.getElementById('craftHint');

let W = 0, H = 0;
let UISCALE = 1;

const BASE_TARGET_R = 34;
const BASE_TRAY_Y_OFFSET = 84;

const TARGET_SPAWN_INTERVAL_MS = 1900;
const TARGET_BASE_SPEED = 12;      // px / 16ms (до деления на 1000)
const TARGET_MAX_SPEED = 46;
const SHURIKEN_SPEED = 1100;
const SHURIKEN_ROT = 10;

const TRAY_CAPACITY = 8;
const TRAY_BASELINE_MIN = 1;
const TRAY_BASELINE_MAX = 5;
const TRAY_ADD_PROB = 0.6;

const MAX_WRONG = 3;

const CRAFT_COOLDOWN_MS = 4500;
const CRAFT_CAP = 160;

const LANE_MARGIN = 12;
let LANES = 3;

/**
 * @typedef {"basic"|"elite"|"boss"} EnemyTier
 * @typedef {{
 *  id:number,
 *  expr:string,
 *  answer:number,
 *  answers?:number[],
 *  exprs?:string[],
 *  x:number,
 *  y:number,
 *  vx:number,
 *  vy:number,
 *  r:number,
 *  alive:boolean,
 *  tier:EnemyTier,
 *  lane:number,
 *  phase:number,
 *  retryGranted:boolean,
 *  age:number,
 *  behavior:Behavior,
 *  shieldIndex?:number
 * }} Target
 * @typedef {{
 *  type:'sine'|'zigzag'|'drift'|'hover',
 *  anchorX:number,
 *  amplitude:number,
 *  frequency:number,
 *  offset:number,
 *  direction:number,
 *  period:number,
 *  elapsed:number,
 *  targetX:number,
 *  speed:number,
 *  verticalAmp:number,
 *  verticalFreq:number
 * }} Behavior
 * @typedef {{id:number, value:number, r:number, selected:boolean}} Shuriken
 */

/** @type {{correct:number, wrong:number, running:boolean, paused:boolean, over:boolean, goal:number|null}} */
let board = { correct:0, wrong:0, running:false, paused:false, over:false, goal:null };

/** @type {Target[]} */
let targets = [];
/** @type {{x:number,y:number,vx:number,vy:number,r:number,id:number,value:number,rot:number,alive:boolean}[]} */
let flying = [];
/** @type {Shuriken[]} */
let shurikens = [];

let selectedId = /** @type {number|null} */(null);
let lastSpawn = 0;
let timePrev = 0;
let lastMatchCheck = 0;
let spawnCounter = 0;

let storyToSpawn = 0;
let storyBossSpawned = false;

/** @type {{id:'endless'|'story', label:string, goalCorrect:number|null, storyTotal:number|null}} */
let gameMode = { id:'endless', label:'Бесконечный режим', goalCorrect:null, storyTotal:null };

const GAME_MODES = {
  endless: { id:'endless', label:'Бесконечный режим', goalCorrect:null, storyTotal:null },
  story: { id:'story', label:'Сюжетный режим', goalCorrect:18, storyTotal:15 }
};

const craftSlots = [/** @type {{value:number}|null} */(null), /** @type {{value:number}|null} */(null)];
let craftActiveSlot = /** @type {number|null} */(null);
let craftCooldownEndsAt = 0;

const rand = (a,b)=>Math.random()*(b-a)+a;
const randi= (a,b)=>Math.floor(rand(a,b+1));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const now = ()=>performance.now();

const BG_GRID_SPACING = 160;
let bgGridOffset = 0;
const BG_ORB_PALETTE = [
  ['rgba(0,240,255,0.28)','rgba(0,240,255,0)'],
  ['rgba(255,43,214,0.28)','rgba(255,43,214,0)'],
  ['rgba(138,255,0,0.25)','rgba(138,255,0,0)']
];
/** @type {{x:number,y:number,r:number,speed:number,pair:string[]}[]} */
const bgOrbs = [];

function recomputeScale(){
  const s = Math.min(W, H);
  UISCALE = Math.max(0.6, Math.min(1.0, s / 900));
}

function resize(){
  W = window.innerWidth; H = window.innerHeight;
  CANVAS.width = Math.floor(W * DPI);
  CANVAS.height = Math.floor(H * DPI);
  CANVAS.style.width = W+'px';
  CANVAS.style.height = H+'px';
  if (CTX){ CTX.setTransform(DPI,0,0,DPI,0,0); }
  recomputeScale();
  LANES = Math.max(3, Math.min(5, Math.floor(W / 260)));
  initBackground();
}
resize();
window.addEventListener('resize', resize);

function initBackground(){
  bgGridOffset = 0;
  bgOrbs.length = 0;
  const count = Math.round(18 + Math.max(W,H)/80);
  for (let i=0;i<count;i++){
    bgOrbs.push({
      x: Math.random(),
      y: Math.random(),
      r: rand(0.12,0.34),
      speed: rand(6,16),
      pair: BG_ORB_PALETTE[randi(0, BG_ORB_PALETTE.length-1)]
    });
  }
}
initBackground();

function reset(modeKey){
  gameMode = GAME_MODES[modeKey];
  board = { correct:0, wrong:0, running:false, paused:false, over:false, goal: gameMode.goalCorrect };
  targets = [];
  flying = [];
  shurikens = [];
  selectedId = null;
  spawnCounter = 0;
  lastSpawn = 0;
  timePrev = performance.now();
  lastMatchCheck = performance.now();
  storyToSpawn = gameMode.storyTotal ?? 0;
  storyBossSpawned = false;
  craftCooldownEndsAt = 0;
  craftActiveSlot = null;
  craftSlots[0] = null; craftSlots[1] = null;
  initBackground();
  if (BTN_PAUSE) BTN_PAUSE.textContent = 'Пауза';
  renderTray();
  updateCraftUI();
  refreshChips();
  draw(0, true);
}

function refreshChips(){
  if (board.goal!=null){
    chipGoal.innerHTML = `<strong>Цель:</strong> ${board.correct}/${board.goal}`;
  } else {
    chipGoal.innerHTML = `<strong>Цель:</strong> держись!`;
  }
  chipFail.innerHTML = `<strong>Ошибки:</strong> ${board.wrong}/${MAX_WRONG}`;
  chipMode.innerHTML = `<strong>Режим:</strong> ${gameMode.label}`;
}

function start(){
  OVERLAY.style.display='none';
  board.running = true;
  board.over = false;
  timePrev = performance.now();
  requestAnimationFrame(tick);
}

function end(victory){
  board.running = false;
  board.over = true;
  OVERLAY.style.display='grid';
  const titleEl = OVERLAY.querySelector('.title');
  if (titleEl){
    titleEl.innerHTML = victory
      ? '<span class="glitch" data-text="ПОБЕДА!">ПОБЕДА!</span>'
      : '<span class="glitch" data-text="ИГРА ОКОНЧЕНА">ИГРА ОКОНЧЕНА</span>';
  }
  const sub = OVERLAY.querySelector('.subtitle');
  if (sub){
    if (victory){
      sub.innerHTML = gameMode.id==='story'
        ? 'Ты прошил все щиты босса. Город снова дышит.'
        : `Рекорд: ${board.correct} точных попаданий.`;
    } else {
      sub.innerHTML = `Правильных: ${board.correct} · Ошибок: ${board.wrong}. Попробуешь ещё раз?`;
    }
  }
}

function chooseLane(){
  const occ = Array.from({length: LANES}, ()=>0);
  for (const t of targets){ if (t.alive && t.lane>=0 && t.lane<LANES) occ[t.lane]++; }
  let best = 0, bestVal = Infinity;
  for (let i=0;i<LANES;i++){ if (occ[i] < bestVal){ bestVal = occ[i]; best = i; } }
  const candidates = []; for (let i=0;i<LANES;i++) if (occ[i]===bestVal) candidates.push(i);
  return candidates[randi(0, candidates.length-1)];
}

function createBehavior(laneCenter, laneWidth){
  const roll = Math.random();
  if (roll < 0.3){
    return { type:'sine', anchorX:laneCenter, amplitude:laneWidth*0.28, frequency:rand(0.35,0.7), offset:rand(0,Math.PI*2), direction:0, period:0, elapsed:0, targetX:laneCenter, speed:0, verticalAmp:0, verticalFreq:0 };
  } else if (roll < 0.6){
    return { type:'zigzag', anchorX:laneCenter, amplitude:laneWidth*0.32, frequency:0, offset:0, direction:Math.random()<0.5?-1:1, period:rand(900,1600), elapsed:0, targetX:laneCenter, speed:rand(70,120), verticalAmp:0, verticalFreq:0 };
  } else if (roll < 0.82){
    return { type:'drift', anchorX:laneCenter, amplitude:laneWidth*0.25, frequency:0, offset:0, direction:0, period:0, elapsed:0, targetX:laneCenter + rand(-laneWidth*0.3, laneWidth*0.3), speed:rand(40,70), verticalAmp:0, verticalFreq:0 };
  }
  return { type:'hover', anchorX:laneCenter, amplitude:laneWidth*0.26, frequency:rand(0.35,0.65), offset:rand(0,Math.PI*2), direction:0, period:0, elapsed:0, targetX:laneCenter, speed:0, verticalAmp:rand(10,20), verticalFreq:rand(0.7,1.3) };
}

function spawnBasicExpressions(tier){
  let expr='', answer=0;
  if (tier==='basic'){
    const roll = Math.random();
    if (roll < 0.4){ const a = randi(1,20), b = randi(1,20); expr = `${a} + ${b}`; answer = a+b; }
    else if (roll < 0.8) { const a = randi(2,20), b = randi(1,a-1); expr = `${a} − ${b}`; answer = a-b; }
    else if (roll < 0.95){ const a = randi(2,9), b = randi(2,9); expr = `${a} × ${b}`; answer = a*b; }
    else { const a = randi(2,8), b = randi(2,8); expr = `${a*b} ÷ ${a}`; answer = b; }
  } else {
    const roll = Math.random();
    if (roll < 0.55){
      const a = randi(4,18), b = randi(2,9), c = randi(1,12);
      expr = `${a} + ${b} × ${c}`;
      answer = a + b*c;
    } else if (roll < 0.78){
      const a = randi(40,90), b = randi(2,9);
      expr = `${a} ÷ ${b}`;
      answer = Number((a/b).toFixed(2));
    } else if (roll < 0.92){
      const k = randi(2,6), m=randi(-8,12), x=randi(2,9);
      expr = `${k}x ${m>=0?'+':''}${m} при x=${x}`;
      answer = k*x + m;
    } else {
      const b=randi(-4,4), x=randi(2,9);
      expr = `x² ${b>=0?'+':''}${b} при x=${x}`;
      answer = x*x + b;
    }
  }
  return { expr, answer };
}

function spawnTarget(){
  const id = Math.floor(Math.random()*1e9);
  const progress = board.correct + board.wrong;
  /** @type {EnemyTier} */ let tier = 'basic';
  if (gameMode.id==='endless' || gameMode.id==='story'){
    if (progress >= 5){
      const eliteProb = clamp(0.25 + (progress-5)*0.08, 0.25, 0.85);
      if (Math.random()<eliteProb) tier='elite';
    }
  }

  const { expr, answer } = spawnBasicExpressions(tier);

  const lane = chooseLane();
  const laneWidth = (W - LANE_MARGIN*2) / LANES;
  const laneCenter = LANE_MARGIN + laneWidth*lane + laneWidth/2;
  const r = Math.round(BASE_TARGET_R * UISCALE * (tier==='elite'?1.05:1));
  const x = clamp(laneCenter, r+8, W - r - 8);
  const y = -r - 6;
  const progressNorm = clamp(spawnCounter / 60, 0, 1);
  const eased = progressNorm*progressNorm;
  const base = TARGET_BASE_SPEED + (TARGET_MAX_SPEED - TARGET_BASE_SPEED) * eased;
  const vy = rand(base*0.7, base*1.1) / 1000;
  const vx = 0;
  const behavior = createBehavior(laneCenter, laneWidth);
  const phase = Math.random() * Math.PI * 2;

  /** @type {Target} */
  const t = { id, expr, answer, x, y, vx, vy, r, alive:true, tier, lane, phase, retryGranted:false, age:0, behavior };
  spawnCounter++;
  ensureAnswerFor(t);
  return t;
}

function spawnBossTarget(){
  const id = Math.floor(Math.random()*1e9);
  const lane = Math.floor(LANES/2);
  const laneWidth = (W - LANE_MARGIN*2) / LANES;
  const laneCenter = LANE_MARGIN + laneWidth*lane + laneWidth/2;
  const r = Math.round(BASE_TARGET_R * UISCALE * 1.55);
  const x = clamp(laneCenter, r+12, W - r - 12);
  const y = -r - 10;
  const vy = rand(14,18) / 1000;
  const vx = 0;
  const phase = Math.random()*Math.PI*2;
  const behavior = { type:'hover', anchorX:laneCenter, amplitude:laneWidth*0.22, frequency:rand(0.6,0.9), offset:rand(0,Math.PI*2), direction:0, period:0, elapsed:0, targetX:laneCenter, speed:0, verticalAmp:18, verticalFreq:rand(0.6,1.0) };

  const shields = [
    { expr:`(12 + 7) × 2`, answer:38 },
    { expr:`(9 × 4) − 5`, answer:31 },
    { expr:`24 ÷ 3 + 18`, answer:26 }
  ];

  /** @type {Target} */
  const boss = {
    id,
    expr: shields[0].expr,
    answer: shields[0].answer,
    answers: shields.map(s=>s.answer),
    exprs: shields.map(s=>s.expr),
    x, y, vx, vy,
    r,
    alive:true,
    tier:'boss',
    lane,
    phase,
    retryGranted:false,
    age:0,
    behavior,
    shieldIndex:0
  };
  ensureAnswerFor(boss);
  return boss;
}

function addOrReplaceShuriken(value){
  const id = Math.floor(Math.random()*1e9);
  const r = Math.round(22 * UISCALE);
  const payload = { id, value: clamp(Number(value.toFixed ? Number(value.toFixed(2)) : value), -CRAFT_CAP, CRAFT_CAP), r, selected:false };
  if (shurikens.length >= TRAY_CAPACITY){
    let replIndex = shurikens.findIndex(s=>!s.selected);
    if (replIndex === -1) replIndex = 0;
    shurikens.splice(replIndex, 1, payload);
  } else {
    shurikens.push(payload);
  }
  return payload.id;
}

function addRandomShuriken(){
  const p = board.correct + board.wrong;
  let v = 0;
  if (Math.random()<0.18){
    v = randi(1,20);
  } else if (p < 5) v = randi(0, 30);
  else if (p < 9) v = randi(-5, 90);
  else {
    const bucket = randi(0,4);
    if (bucket===0) v=randi(-3,3);
    else if (bucket===1) v=randi(0,120);
    else if (bucket===2) v=randi(-10,10);
    else v=randi(50,150);
  }
  addOrReplaceShuriken(v);
}

function renderTray(){
  TRAY.innerHTML = '';
  const px = Math.round(56 * UISCALE);
  for (const s of shurikens){
    const div = document.createElement('div');
    const isSelected = s.selected;
    div.className = 'shuriken' + (isSelected ? ' selected' : '') + (craftActiveSlot!=null ? ' crafting' : '');
    div.style.width = div.style.height = px+'px';
    const span = document.createElement('span');
    span.textContent = String(s.value);
    span.style.fontSize = Math.round(14 * UISCALE)+'px';
    div.appendChild(span);
    div.addEventListener('click', ()=>{
      if (!board.running || board.paused || board.over) return;
      if (craftActiveSlot!=null && !isCraftOnCooldown()){
        assignToCraftSlot(craftActiveSlot, s.id);
        return;
      }
      selectedId = s.id;
      for (const k of shurikens) k.selected = (k.id===s.id);
      renderTray();
    });
    TRAY.appendChild(div);
  }
}

function ensureAnswerFor(t){
  const targetAnswer = t.answer;
  const has = shurikens.some(s => s.value === targetAnswer);
  if (has) return;
  addOrReplaceShuriken(targetAnswer);
  renderTray();
}

function maybeGrantRetry(value){
  const hasInTray = shurikens.some(s=>s.value===value);
  const hasInFlight = flying.some(f=>f.alive && f.value===value);
  if (hasInTray || hasInFlight) return;
  const t = targets.find(t=>t.alive && t.answer===value && !t.retryGranted);
  if (!t) return;
  t.retryGranted = true;
  addOrReplaceShuriken(value);
  renderTray();
}

function softlockGuard(){
  const alive = targets.filter(t=>t.alive);
  if (!alive.length) { lastMatchCheck = now(); return; }
  const need = new Set(alive.map(t=>t.answer));
  const hasMatch = shurikens.some(s=>need.has(s.value));
  if (hasMatch){ lastMatchCheck = now(); return; }
  const elapsed = now() - lastMatchCheck;
  if (elapsed > 2500){
    const a = alive[randi(0, alive.length-1)].answer;
    addOrReplaceShuriken(a);
    renderTray();
    lastMatchCheck = now();
  }
}

function updateCraftUI(){
  craftSlots.forEach((slot, idx)=>{
    const el = craftSlotEls[idx];
    if (!el) return;
    if (slot){
      el.textContent = String(slot.value);
      el.classList.remove('empty');
    } else {
      el.textContent = '–';
      el.classList.add('empty');
    }
    el.classList.toggle('active', craftActiveSlot===idx);
  });
  const onCooldown = isCraftOnCooldown();
  craftOpEls.forEach(el=>{
    const disabled = onCooldown || !craftSlots[0] || !craftSlots[1];
    el.classList.toggle('disabled', disabled);
    el.classList.toggle('selected', false);
  });
  if (onCooldown){
    const remain = Math.max(0, craftCooldownEndsAt - now());
    const pct = 1 - remain / CRAFT_COOLDOWN_MS;
    craftBar.style.width = `${Math.round(pct*100)}%`;
    craftHint.textContent = `Крафт перезаряжается: ${(remain/1000).toFixed(1)} с`;
  } else {
    const filled = craftSlots.filter(Boolean).length;
    craftBar.style.width = filled===2 ? '100%' : `${filled*50}%`;
    if (craftActiveSlot!=null){
      craftHint.textContent = craftActiveSlot===0 ? 'Выбери шурикен для слота A' : 'Выбери шурикен для слота B';
    } else if (filled===2){
      craftHint.textContent = 'Выбери знак для синтеза';
    } else if (filled===1){
      craftHint.textContent = 'Помести вторую цифру в свободный слот';
    } else {
      craftHint.textContent = 'Возьми шурикен и положи в слот A';
    }
  }
}

function isCraftOnCooldown(){
  return now() < craftCooldownEndsAt;
}

function assignToCraftSlot(slotIdx, shurikenId){
  const index = shurikens.findIndex(s=>s.id===shurikenId);
  if (index===-1) return;
  const s = shurikens[index];
  shurikens.splice(index,1);
  if (selectedId === shurikenId) selectedId = null;
  craftSlots[slotIdx] = { value: s.value };
  craftActiveSlot = craftSlots.findIndex((slot)=>!slot);
  if (craftActiveSlot===-1) craftActiveSlot = null;
  renderTray();
  updateCraftUI();
}

function returnCraftSlot(slotIdx){
  const slot = craftSlots[slotIdx];
  if (!slot) return;
  craftSlots[slotIdx] = null;
  addOrReplaceShuriken(slot.value);
  craftActiveSlot = slotIdx;
  renderTray();
  updateCraftUI();
}

craftSlotEls.forEach((el, idx)=>{
  el?.addEventListener('click', ()=>{
    if (!board.running || board.paused || board.over) return;
    if (isCraftOnCooldown()) return;
    if (craftSlots[idx]){ returnCraftSlot(idx); return; }
    craftActiveSlot = idx;
    updateCraftUI();
  });
});

craftOpEls.forEach(el=>{
  el.addEventListener('click', ()=>{
    if (!board.running || board.paused || board.over) return;
    if (isCraftOnCooldown()) return;
    if (!craftSlots[0] || !craftSlots[1]) return;
    const op = el.dataset.op || '+';
  const result = resolveCraft(op, craftSlots[0].value, craftSlots[1].value);
  craftSlots[0] = null;
  craftSlots[1] = null;
  craftActiveSlot = null;
  const id = addOrReplaceShuriken(result);
  for (const k of shurikens) k.selected = (k.id===id);
  selectedId = id;
  craftCooldownEndsAt = now() + CRAFT_COOLDOWN_MS;
  renderTray();
  craftBar.style.width = '0%';
  updateCraftUI();
});
});

function resolveCraft(op, a, b){
  let result = 0;
  switch(op){
    case '+': result = a + b; break;
    case '-': result = a - b; break;
    case '×': result = a * b; break;
    case '÷':
      result = b===0 ? 0 : Number((a / b).toFixed(2));
      break;
    default: result = a + b;
  }
  return clamp(result, -CRAFT_CAP, CRAFT_CAP);
}

CANVAS.addEventListener('click', (e)=>{
  if (!board.running || board.paused || board.over) return;
  if (selectedId==null) return;
  const rect = CANVAS.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const idx = shurikens.findIndex(s=>s.id===selectedId);
  if (idx===-1) return;
  const s = shurikens[idx];
  shurikens.splice(idx,1);
  selectedId = null;
  renderTray();

  const sx = W/2, sy = H - Math.round(BASE_TRAY_Y_OFFSET * UISCALE);
  const dirx = mx - sx, diry = my - sy;
  const len = Math.hypot(dirx, diry) || 1;
  const vx = (dirx/len) * SHURIKEN_SPEED / 1000;
  const vy = (diry/len) * SHURIKEN_SPEED / 1000;

  flying.push({ id: s.id, value: s.value, x:sx, y:sy, vx, vy, r:Math.round(20*UISCALE), rot:0, alive:true });
});

function getMaxActive(){
  if (gameMode.id==='story'){
    if (storyBossSpawned) return 1;
    return 3;
  }
  const p = board.correct + board.wrong;
  if (p < 4) return 2;
  if (p < 8) return 3;
  return 4;
}

function updateTargets(dt, killY){
  for (const t of targets){
    if (!t.alive) continue;
    t.age += dt;
    t.y += t.vy * dt;
    const laneWidth = (W - LANE_MARGIN*2) / LANES;
    const laneMin = LANE_MARGIN + laneWidth*t.lane + laneWidth*0.15;
    const laneMax = LANE_MARGIN + laneWidth*t.lane + laneWidth*0.85;
    switch (t.behavior.type){
      case 'sine':
        t.x = t.behavior.anchorX + Math.sin((t.age/1000)*t.behavior.frequency*2*Math.PI + t.behavior.offset) * t.behavior.amplitude;
        break;
      case 'zigzag':
        t.behavior.elapsed += dt;
        if (t.behavior.elapsed >= t.behavior.period){ t.behavior.elapsed = 0; t.behavior.direction *= -1; }
        const maxDeviation = t.behavior.amplitude;
        const nextX = t.x + t.behavior.direction * t.behavior.speed * dt/1000;
        if (nextX > t.behavior.anchorX + maxDeviation || nextX < t.behavior.anchorX - maxDeviation){
          t.behavior.direction *= -1;
        }
        t.x += t.behavior.direction * t.behavior.speed * dt/1000;
        break;
      case 'drift':
        if (Math.abs(t.behavior.targetX - t.x) < 4){
          t.behavior.targetX = clamp(t.behavior.anchorX + rand(-laneWidth*0.35, laneWidth*0.35), laneMin, laneMax);
        }
        const dir = Math.sign(t.behavior.targetX - t.x);
        t.x += dir * t.behavior.speed * dt/1000;
        break;
      case 'hover':
        t.x = t.behavior.anchorX + Math.sin((t.age/1000)*t.behavior.frequency*2*Math.PI + t.behavior.offset) * t.behavior.amplitude;
        t.y += Math.sin((t.age/1000)*t.behavior.verticalFreq*2*Math.PI + t.behavior.offset) * t.behavior.verticalAmp * (dt/1000);
        break;
    }
    t.x = clamp(t.x, laneMin, laneMax);
    if (t.y > killY){
      t.alive = false;
      board.wrong++;
      refreshChips();
      if (board.wrong>=MAX_WRONG){ end(false); return true; }
    }
  }
  return false;
}

function updateFlying(dt){
  for (const f of flying){
    if (!f.alive) continue;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += SHURIKEN_ROT * dt/1000;
    if (f.x<-60 || f.x>W+60 || f.y<-80 || f.y>H+80) {
      f.alive=false;
      maybeGrantRetry(f.value);
    }
  }
}

function handleCorrectHit(target){
  board.correct++;
  refreshChips();
  lastMatchCheck = now();
  if (Math.random()<0.35 && shurikens.length<TRAY_CAPACITY){
    addRandomShuriken();
    renderTray();
  }
  if (board.goal!=null && board.correct>=board.goal){
    end(true);
    return true;
  }
  return false;
}

function checkCollisions(){
  for (const f of flying){
    if (!f.alive) continue;
    for (const t of targets){
      if (!t.alive) continue;
      const dx = t.x - f.x, dy = t.y - f.y;
      const d2 = dx*dx + dy*dy;
      const R = t.r + f.r;
      if (d2 <= R*R){
        const correct = (f.value === t.answer);
        if (correct){
          if (t.tier==='boss' && t.answers && t.exprs && typeof t.shieldIndex==='number'){
            const nextIndex = t.shieldIndex + 1;
            f.alive = false;
            if (handleCorrectHit(t)) return true;
            if (nextIndex < t.answers.length){
              t.shieldIndex = nextIndex;
              t.answer = t.answers[nextIndex];
              t.expr = t.exprs[nextIndex];
              t.retryGranted = false;
              t.r = Math.max(t.r * 0.94, BASE_TARGET_R * UISCALE * 1.25);
            } else {
              t.alive = false;
            }
          } else {
            t.alive = false;
            f.alive = false;
            if (handleCorrectHit(t)) return true;
          }
        } else {
          t.alive = (t.tier==='boss');
          f.alive = false;
          board.wrong++;
          refreshChips();
          if (board.wrong>=MAX_WRONG){ end(false); return true; }
        }
        break;
      }
    }
  }
  return false;
}

function update(dt){
  if (board.paused || board.over) return;

  lastSpawn += dt;
  const active = targets.filter(t=>t.alive).length;
  if (gameMode.id==='story'){
    if (!storyBossSpawned){
      if (storyToSpawn>0 && lastSpawn >= TARGET_SPAWN_INTERVAL_MS && active < getMaxActive()){
        lastSpawn = 0;
        targets.push(spawnTarget());
        storyToSpawn--;
        maybeFillTray();
      } else if (storyToSpawn===0 && active===0){
        storyBossSpawned = true;
        targets.push(spawnBossTarget());
      }
    }
  } else {
    if (lastSpawn >= TARGET_SPAWN_INTERVAL_MS && active < getMaxActive()){
      lastSpawn = 0;
      targets.push(spawnTarget());
      maybeFillTray();
    }
  }

  softlockGuard();

  const killY = H - Math.round(BASE_TRAY_Y_OFFSET*UISCALE) - 40;
  if (updateTargets(dt, killY)) return;
  updateFlying(dt);
  if (checkCollisions()) return;

  targets = targets.filter(t=>t.alive);
  flying = flying.filter(f=>f.alive);
}

function maybeFillTray(){
  if (shurikens.length < TRAY_BASELINE_MIN){ addRandomShuriken(); renderTray(); }
  else if (shurikens.length < Math.min(TRAY_CAPACITY, TRAY_BASELINE_MAX) && Math.random()<TRAY_ADD_PROB){ addRandomShuriken(); renderTray(); }
}

function drawBackground(dt){
  if (!CTX) return;
  const gradient = CTX.createLinearGradient(0,0,0,H);
  gradient.addColorStop(0,'#040814');
  gradient.addColorStop(0.55,'#0a1026');
  gradient.addColorStop(1,'#02040b');
  CTX.fillStyle = gradient;
  CTX.fillRect(0,0,W,H);

  const spacing = Math.max(40, Math.round(BG_GRID_SPACING * UISCALE));
  bgGridOffset = (bgGridOffset + dt * 0.04) % spacing;
  CTX.save();
  CTX.lineWidth = 1;
  CTX.strokeStyle = 'rgba(0,240,255,0.055)';
  for (let x = -spacing; x < W + spacing; x += spacing){
    CTX.beginPath();
    CTX.moveTo(x + bgGridOffset, 0);
    CTX.lineTo(x + bgGridOffset, H);
    CTX.stroke();
  }
  for (let y = -spacing; y < H + spacing; y += spacing){
    CTX.beginPath();
    CTX.moveTo(0, y + bgGridOffset);
    CTX.lineTo(W, y + bgGridOffset);
    CTX.stroke();
  }
  CTX.restore();

  for (const orb of bgOrbs){
    const px = orb.x * W;
    const py = orb.y * H;
    const radius = orb.r * Math.max(W,H);
    const g = CTX.createRadialGradient(px, py, 0, px, py, radius);
    g.addColorStop(0, orb.pair[0]);
    g.addColorStop(1, orb.pair[1]);
    CTX.fillStyle = g;
    CTX.beginPath();
    CTX.arc(px, py, radius, 0, Math.PI*2);
    CTX.fill();
    orb.y += (orb.speed * dt) / 12000;
    if (orb.y > 1.2){
      orb.y = -0.2;
      orb.x = Math.random();
      orb.speed = rand(6,16);
      orb.pair = BG_ORB_PALETTE[randi(0, BG_ORB_PALETTE.length-1)];
    }
  }

  const vignette = CTX.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.75);
  vignette.addColorStop(0,'rgba(0,0,0,0)');
  vignette.addColorStop(1,'rgba(0,0,0,0.55)');
  CTX.fillStyle = vignette;
  CTX.fillRect(0,0,W,H);
}

function drawShuriken(ctx, radius, color){
  const spikes = 4;
  const inner = radius * 0.42;
  ctx.save();
  ctx.beginPath();
  for (let i=0;i<spikes;i++){
    const ang = (Math.PI*2*i)/spikes;
    const xOuter = Math.cos(ang)*radius;
    const yOuter = Math.sin(ang)*radius;
    if (i===0) ctx.moveTo(xOuter,yOuter);
    const angMid = ang + Math.PI/(spikes*2);
    const xInner = Math.cos(angMid)*inner;
    const yInner = Math.sin(angMid)*inner;
    const angNext = ang + Math.PI*2/spikes;
    const xNext = Math.cos(angNext)*radius;
    const yNext = Math.sin(angNext)*radius;
    ctx.quadraticCurveTo(xInner, yInner, xNext, yNext);
  }
  ctx.closePath();
  ctx.shadowColor = color;
  ctx.shadowBlur = radius*0.7;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = Math.max(1, radius*0.14);
  ctx.stroke();
  ctx.restore();
}

function draw(dt, clearOnly){
  if (!CTX) return;
  drawBackground(dt);
  if (clearOnly) return;

  drawHud();

  if (board.paused){
    drawPauseSheet();
    return;
  }

  for (const t of targets){
    if (!t.alive) continue;
    CTX.save();
    if (t.tier==='boss'){
      drawBoss(t);
    } else {
      drawEnemy(t);
    }
    CTX.restore();
  }

  for (const f of flying){
    CTX.save();
    CTX.translate(f.x, f.y);
    CTX.rotate(f.rot);
    drawShuriken(CTX, f.r, '#00f0ff');
    CTX.rotate(-f.rot);
    CTX.fillStyle='#fff';
    CTX.font = `700 ${Math.round(14*UISCALE)}px Inter, system-ui, sans-serif`;
    const s = String(f.value);
    const m = CTX.measureText(s);
    CTX.fillText(s, -m.width/2, Math.round(5*UISCALE));
    CTX.restore();
  }

  CTX.save();
  const trayY = H - Math.round(BASE_TRAY_Y_OFFSET*UISCALE);
  CTX.strokeStyle = 'rgba(0,240,255,.15)';
  CTX.beginPath();
  CTX.moveTo(0, trayY);
  CTX.lineTo(W, trayY);
  CTX.stroke();
  CTX.restore();
}

function drawHud(){
  CTX.save();
  const pad = Math.round(16 * UISCALE);
  const bw = Math.round(230 * UISCALE);
  const bh = Math.round(12 * UISCALE);
  const panelW = bw + Math.round(42 * UISCALE);
  const panelH = Math.round(74 * UISCALE);
  CTX.fillStyle = 'rgba(6,14,32,0.78)';
  CTX.strokeStyle = 'rgba(0,240,255,0.35)';
  CTX.lineWidth = Math.max(1, UISCALE);
  CTX.shadowColor = 'rgba(0,240,255,0.25)';
  CTX.shadowBlur = 18 * UISCALE;
  CTX.fillRect(pad - Math.round(12*UISCALE), pad - Math.round(12*UISCALE), panelW, panelH);
  CTX.shadowBlur = 0;
  CTX.strokeRect(pad - Math.round(12*UISCALE), pad - Math.round(12*UISCALE), panelW, panelH);

  if (board.goal!=null){
    const grad = CTX.createLinearGradient(pad, pad, pad + bw, pad);
    grad.addColorStop(0, 'rgba(0,240,255,0.2)');
    grad.addColorStop(1, 'rgba(138,255,0,0.4)');
    CTX.fillStyle = 'rgba(0,240,255,0.12)';
    CTX.fillRect(pad, pad, bw, bh);
    CTX.fillStyle = grad;
    CTX.fillRect(pad, pad, bw * (board.correct/board.goal), bh);
    CTX.strokeStyle = 'rgba(0,240,255,0.45)';
    CTX.strokeRect(pad-0.5, pad-0.5, bw+1, bh+1);
  } else {
    CTX.strokeStyle = 'rgba(0,240,255,0.35)';
    CTX.strokeRect(pad-0.5, pad-0.5, bw+1, bh+1);
  }

  CTX.fillStyle = '#d0faff';
  CTX.font = `700 ${Math.round(13*UISCALE)}px Inter, system-ui, sans-serif`;
  const goalText = board.goal!=null ? `Точные: ${board.correct}/${board.goal}` : `Точные: ${board.correct}`;
  CTX.fillText(goalText, pad, pad + Math.round(26*UISCALE));

  const bx = pad;
  const by = pad + Math.round(42*UISCALE);
  CTX.fillStyle = 'rgba(255,90,140,0.14)';
  CTX.fillRect(bx, by, bw, bh);
  const gradBad = CTX.createLinearGradient(bx, by, bx + bw, by);
  gradBad.addColorStop(0, 'rgba(255,90,90,0.4)');
  gradBad.addColorStop(1, 'rgba(255,43,214,0.45)');
  CTX.fillStyle = gradBad;
  CTX.fillRect(bx, by, bw * (board.wrong/MAX_WRONG), bh);
  CTX.strokeStyle = 'rgba(255,90,140,0.55)';
  CTX.strokeRect(bx-0.5, by-0.5, bw+1, bh+1);
  CTX.fillStyle = '#ffd8e3';
  CTX.fillText(`Ошибки: ${board.wrong}/${MAX_WRONG}`, bx, by + Math.round(26*UISCALE));
  CTX.restore();
}

function drawEnemy(t){
  let color = 'rgba(0,240,255,.9)', lbl='ВРАГ';
  if (t.tier==='elite'){ color='rgba(255,43,214,1)'; lbl='ЭЛИТА'; }
  CTX.shadowColor = color; CTX.shadowBlur = 16*UISCALE;
  CTX.beginPath();
  const sides = 6;
  for (let i=0;i<sides;i++){ const ang = (Math.PI*2*i)/sides; const x = t.x + Math.cos(ang)*t.r; const y = t.y + Math.sin(ang)*t.r; if(i===0) CTX.moveTo(x,y); else CTX.lineTo(x,y); }
  CTX.closePath(); CTX.fillStyle = 'rgba(20,12,24,.9)'; CTX.fill(); CTX.lineWidth = 2; CTX.strokeStyle = color; CTX.stroke();
  CTX.lineWidth = 1.5; CTX.strokeStyle = 'rgba(255,90,90,.85)';
  CTX.beginPath(); CTX.moveTo(t.x- t.r*1.1, t.y); CTX.lineTo(t.x+ t.r*1.1, t.y); CTX.stroke();
  CTX.beginPath(); CTX.moveTo(t.x, t.y- t.r*1.1); CTX.lineTo(t.x, t.y+ t.r*1.1); CTX.stroke();
  CTX.beginPath(); CTX.arc(t.x, t.y, t.r*0.42, 0, Math.PI*2); CTX.stroke();
  CTX.fillStyle = (t.tier==='elite') ? '#ff2bd6' : '#ff5a5a';
  CTX.font = `800 ${Math.round(10*UISCALE)}px Inter, system-ui, sans-serif`;
  const ml = CTX.measureText(lbl);
  CTX.fillText(lbl, t.x - ml.width/2, t.y - t.r - Math.round(6*UISCALE));
  CTX.shadowBlur = 0; CTX.fillStyle = '#e6f7ff';
  CTX.font = `700 ${Math.round(16*UISCALE)}px Inter, system-ui, sans-serif`;
  const txt = t.expr;
  const m = CTX.measureText(txt);
  CTX.fillText(txt, t.x - m.width/2, t.y + Math.round(6*UISCALE));
}

function drawBoss(t){
  const gradient = CTX.createRadialGradient(t.x, t.y, t.r*0.2, t.x, t.y, t.r*1.05);
  gradient.addColorStop(0, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(0.5, 'rgba(0,240,255,0.25)');
  gradient.addColorStop(1, 'rgba(255,43,214,0.4)');
  CTX.fillStyle = gradient;
  CTX.beginPath();
  CTX.arc(t.x, t.y, t.r, 0, Math.PI*2);
  CTX.fill();
  CTX.lineWidth = 3;
  CTX.strokeStyle = 'rgba(255,255,255,0.5)';
  CTX.stroke();
  for (let i=0;i<3;i++){
    const radius = t.r * (0.6 - i*0.12);
    CTX.beginPath();
    CTX.setLineDash([4,4]);
    CTX.lineWidth = 2;
    CTX.strokeStyle = i < (t.shieldIndex ?? 0) ? 'rgba(255,43,214,0.2)' : 'rgba(0,240,255,0.6)';
    CTX.arc(t.x, t.y, radius, 0, Math.PI*2);
    CTX.stroke();
    CTX.setLineDash([]);
  }
  CTX.fillStyle = '#ffdcff';
  CTX.font = `800 ${Math.round(12*UISCALE)}px Inter, system-ui, sans-serif`;
  const lbl = 'БОСС';
  const ml = CTX.measureText(lbl);
  CTX.fillText(lbl, t.x - ml.width/2, t.y - t.r - Math.round(8*UISCALE));
  CTX.fillStyle = '#ffffff';
  CTX.font = `700 ${Math.round(18*UISCALE)}px Inter, system-ui, sans-serif`;
  const expr = t.expr;
  const m = CTX.measureText(expr);
  CTX.fillText(expr, t.x - m.width/2, t.y + Math.round(8*UISCALE));
  const shieldsLeft = t.answers ? (t.answers.length - (t.shieldIndex ?? 0)) : 0;
  CTX.fillStyle = '#9ad';
  CTX.font = `600 ${Math.round(12*UISCALE)}px Inter, system-ui, sans-serif`;
  const hint = `Щиты: ${Math.max(0, shieldsLeft)}`;
  const mh = CTX.measureText(hint);
  CTX.fillText(hint, t.x - mh.width/2, t.y + Math.round(26*UISCALE));
}

function drawPauseSheet(){
  CTX.save();
  CTX.fillStyle = 'rgba(4,8,20,0.82)';
  CTX.fillRect(0,0,W,H);
  const halo = CTX.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.45);
  halo.addColorStop(0,'rgba(0,240,255,0.2)');
  halo.addColorStop(1,'rgba(0,240,255,0)');
  CTX.fillStyle = halo;
  CTX.fillRect(0,0,W,H);
  CTX.fillStyle = '#e6f7ff';
  CTX.textAlign = 'center';
  CTX.font = `700 ${Math.round(24*UISCALE)}px Inter, system-ui, sans-serif`;
  CTX.fillText('Пауза — враги скрыты', W/2, H/2 - Math.round(6*UISCALE));
  CTX.font = `500 ${Math.round(14*UISCALE)}px Inter, system-ui, sans-serif`;
  CTX.fillStyle = '#9ad0ff';
  CTX.fillText('Нажми «Продолжить» или клавишу P, чтобы вернуться в бой', W/2, H/2 + Math.round(18*UISCALE));
  CTX.restore();
}

function tick(ts){
  if (!board.running) return;
  const dt = Math.min(48, ts - timePrev);
  timePrev = ts;
  update(dt);
  draw(dt, false);
  updateCraftUI();
  if (!board.over) requestAnimationFrame(tick);
}

BTN_START_ENDLESS?.addEventListener('click', ()=>{ reset('endless'); start(); });
BTN_START_STORY?.addEventListener('click', ()=>{ reset('story'); start(); });
BTN_RESTART?.addEventListener('click', ()=>{ board.running=false; reset(gameMode.id); OVERLAY.style.display='grid'; });
BTN_PAUSE?.addEventListener('click', ()=>{
  if (!board.running || board.over) return;
  board.paused = !board.paused;
  BTN_PAUSE.textContent = board.paused ? 'Продолжить' : 'Пауза';
  if (!board.paused){
    timePrev = performance.now();
    requestAnimationFrame(tick);
  }
});

window.addEventListener('keydown', (e)=>{
  if (e.key==='p' || e.key==='P'){ BTN_PAUSE?.click(); }
  if (e.key==='r' || e.key==='R'){ BTN_RESTART?.click(); }
});

reset('endless');
draw(0, false);
