// Zealift — app.js (Pass 2: Track + Scale + Phase + Me, alt groups, fixed tab bar)

const DAY_NAMES = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
const DAY_LABELS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_TYPES = ["Chest & Triceps","Back & Biceps","Chest & Back","Shoulders & Arms","Legs & Abs","Hybrid Circuit","Rest / Walk"];
const APP_VERSION = 'Beta 5.8';
const CATEGORIES = ["Free Weights - Bench","Free Weights - No Bench","Plate-Loaded","Pin-Loaded","Cable","Other"];
const CUSTOM_CATEGORIES_KEY = 'zealift_custom_categories';
function getCustomCategories(){
  try { return JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY) || '[]'); } catch(e){ return []; }
}
function addCustomCategory(name){
  const list = getCustomCategories();
  if (!list.includes(name)) list.push(name);
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(list));
}
// Merges the fixed defaults with any custom categories saved locally, plus any
// category actually in use on the user's own exercises (catches categories
// created on another device that this one hasn't cached yet).
async function getAllCategories(){
  const { data: userData } = await supabaseClient.auth.getUser();
  const result = await withTimeout(
    supabaseClient.from('exercises').select('category').eq('user_id', userData.user.id),
    15000
  );
  const inUse = result.__timeout || result.error ? [] : (result.data || []).map(r => r.category).filter(Boolean);
  const merged = [...CATEGORIES, ...getCustomCategories(), ...inUse];
  return [...new Set(merged)];
}

// A small reusable text-input modal, used for naming a new category or renaming
// an existing one, instead of the browser's native prompt() which looks jarring.
function promptText({ title, placeholder, initialValue, onConfirm }){
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:70; display:flex; align-items:flex-end;';
  overlay.innerHTML = `
    <div style="width:100%; background:var(--panel); border-radius:18px 18px 0 0; padding:20px 18px calc(20px + env(safe-area-inset-bottom, 0px)) 18px;">
      <div class="field-label" style="padding:0 0 8px 0;">${title}</div>
      <div class="field-card" style="margin-bottom:14px;"><input class="field-input" id="promptTextInput" placeholder="${placeholder||''}" value="${initialValue||''}" style="font-size:14px; font-weight:400;"></div>
      <div style="display:flex; gap:10px;">
        <button id="promptCancelBtn" style="flex:1; background:var(--ink); color:var(--slate); padding:12px; border-radius:10px; font-weight:600;">Cancel</button>
        <button id="promptOkBtn" style="flex:1; background:var(--flame); color:var(--ink); padding:12px; border-radius:10px; font-weight:600;">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#promptTextInput');
  input.focus();
  overlay.querySelector('#promptCancelBtn').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector('#promptOkBtn').onclick = () => {
    const val = input.value.trim();
    if (!val) return;
    overlay.remove();
    onConfirm(val);
  };
}

// Common starter exercises shown as quick-add suggestions on an empty day, keyed by
// day-type label. Falls back to a generic set for custom/renamed day types.
const STARTER_EXERCISES = {
  'chest & triceps': [
    { name: 'Barbell Bench Press', category: 'Free Weights - Bench' },
    { name: 'Dumbbell Incline Press', category: 'Free Weights - Bench' },
    { name: 'Tricep Pushdown', category: 'Cable' },
    { name: 'Chest Press Machine', category: 'Pin-Loaded' }
  ],
  'back & biceps': [
    { name: 'Lat Pulldown', category: 'Pin-Loaded' },
    { name: 'Seated Row', category: 'Pin-Loaded' },
    { name: 'Dumbbell Curl', category: 'Free Weights - No Bench' },
    { name: 'One Arm Dumbbell Row', category: 'Free Weights - Bench' }
  ],
  'chest & back': [
    { name: 'Bench Press', category: 'Free Weights - Bench' },
    { name: 'Lat Pulldown', category: 'Pin-Loaded' },
    { name: 'Chest Fly Machine', category: 'Pin-Loaded' },
    { name: 'Seated Row', category: 'Pin-Loaded' }
  ],
  'shoulders & arms': [
    { name: 'Shoulder Press Machine', category: 'Pin-Loaded' },
    { name: 'Dumbbell Lateral Raise', category: 'Free Weights - No Bench' },
    { name: 'Dumbbell Curl', category: 'Free Weights - No Bench' },
    { name: 'Tricep Extension', category: 'Cable' }
  ],
  'legs & abs': [
    { name: 'Leg Press', category: 'Pin-Loaded' },
    { name: 'Leg Extension', category: 'Pin-Loaded' },
    { name: 'Leg Curl', category: 'Pin-Loaded' },
    { name: 'Cable Crunch', category: 'Cable' }
  ],
  'hybrid circuit': [
    { name: 'Dumbbell Bench Press', category: 'Free Weights - Bench' },
    { name: 'Lat Pulldown', category: 'Pin-Loaded' },
    { name: 'Shoulder Press Machine', category: 'Pin-Loaded' },
    { name: 'Leg Press', category: 'Pin-Loaded' }
  ]
};
const DEFAULT_STARTERS = [
  { name: 'Bench Press', category: 'Free Weights - Bench' },
  { name: 'Lat Pulldown', category: 'Pin-Loaded' },
  { name: 'Squat', category: 'Other' },
  { name: 'Dumbbell Curl', category: 'Free Weights - No Bench' },
  { name: 'Plank', category: 'Other' }
];
function getStarterExercises(dayTypeLabel){
  const key = (dayTypeLabel || '').toLowerCase().trim();
  return STARTER_EXERCISES[key] || DEFAULT_STARTERS;
}
async function quickAddStarter(name, category, weekday){
  const { data: userData } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient.from('exercises').insert({
    user_id: userData.user.id, name, category, weekday, alt_group_id: null
  });
  if (error){ alert(error.message); return; }
  renderTrack();
}

function getGroupByPref(){ return localStorage.getItem('zealift_group_by') || 'equipment'; }
function setGroupByPref(v){ localStorage.setItem('zealift_group_by', v); }

// Groups a list of {name, category, ...} exercises either by their stored equipment
// category, or by primary muscle looked up dynamically against the cached exercise DB —
// same DB and matcher the form guide uses, so no schema change or per-exercise setup needed.
// Pulls exercises sharing the same alt group adjacent to each other, and puts
// all alt-grouped exercises at the top of the category, ahead of anything
// without an alt group. Relative order is preserved within each bucket.
function clusterByAltGroup(items){
  const buckets = new Map();
  const groupOrder = [];
  const ungrouped = [];
  items.forEach(item => {
    const gid = item.alt_group_id;
    if (!gid){
      ungrouped.push(item);
      return;
    }
    if (!buckets.has(gid)){
      buckets.set(gid, []);
      groupOrder.push(gid);
    }
    buckets.get(gid).push(item);
  });
  const clustered = [];
  groupOrder.forEach(gid => clustered.push(...buckets.get(gid)));
  return [...clustered, ...ungrouped];
}

async function groupExercisesByChoice(exercises, groupBy){
  const grouped = {};
  let orderedKeys;
  if (groupBy === 'muscle'){
    const db = await loadExerciseDB();
    const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    exercises.forEach(ex => {
      const m = matchExercise(ex.name, db);
      const label = (m && m.primaryMuscles && m.primaryMuscles[0]) ? cap(m.primaryMuscles[0]) : 'Other';
      (grouped[label] = grouped[label] || []).push(ex);
    });
    orderedKeys = Object.keys(grouped).sort((a,b) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b));
  } else {
    CATEGORIES.forEach(c => grouped[c] = []);
    exercises.forEach(ex => { (grouped[ex.category] || (grouped[ex.category] = [])).push(ex); });
    const knownCats = new Set(CATEGORIES);
    const extraCats = Object.keys(grouped).filter(c => !knownCats.has(c) && grouped[c].length > 0);
    orderedKeys = [...CATEGORIES, ...extraCats];
  }
  Object.keys(grouped).forEach(k => { grouped[k] = clusterByAltGroup(grouped[k]); });
  return { grouped, orderedKeys };
}
function removeSideIndex(){
  const a = document.getElementById('sideIndexEl');
  if (a) a.remove();
  const b = document.getElementById('sideIndexBubble');
  if (b) b.remove();
}

// Fixed-position side index (like iOS Contacts) that jumps to a section on tap,
// and drag-scrubs through them with a floating bubble showing the full name.
// `keys` are the section names in display order; `prefix` must match the id
// prefix used on each section header element (e.g. 'cat-' + slug).
let _lastSideIndexArgs = null;
function restoreSideIndexIfVisible(){
  if (!_lastSideIndexArgs) return;
  const { keys, prefix, bounds } = _lastSideIndexArgs;
  // Only restore if at least the first target section is actually still on screen -
  // otherwise we'd be re-attaching an index pointing at a screen that's gone.
  const firstSlug = prefix + (keys[0] || '').replace(/[^a-z0-9]/gi,'');
  if (keys.length && document.getElementById(firstSlug)){
    attachSideIndex(keys, prefix, bounds);
  }
}
function attachSideIndex(keys, prefix, bounds){
  removeSideIndex();
  bounds = bounds || { top: 170, bottom: 110 };
  _lastSideIndexArgs = { keys, prefix, bounds };
  const idx = document.createElement('div');
  idx.id = 'sideIndexEl';
  idx.style = `position:fixed; right:6px; top:${bounds.top}px; bottom:${bounds.bottom}px; display:flex; flex-direction:column; justify-content:center; gap:2px; padding:4px 8px 4px 3px; z-index:15; touch-action:none;`;
  idx.innerHTML = keys.map(cat => {
    const slug = prefix + cat.replace(/[^a-z0-9]/gi,'');
    const short = cat.length > 3 ? cat.slice(0,3) : cat;
    return `<div class="side-index-item" data-target="${slug}" data-fullname="${cat}" style="font-family:'JetBrains Mono',monospace; font-size:8.5px; color:var(--slate); padding:1.5px 3px; text-align:right;">${short}</div>`;
  }).join('');
  document.body.appendChild(idx);

  const bubble = document.createElement('div');
  bubble.id = 'sideIndexBubble';
  bubble.style = 'position:fixed; right:34px; background:var(--flame); color:var(--ink); font-family:\'Oswald\',sans-serif; font-weight:600; font-size:16px; padding:8px 16px; border-radius:12px 12px 12px 2px; display:none; z-index:16; box-shadow:0 4px 12px rgba(0,0,0,0.4); white-space:nowrap;';
  document.body.appendChild(bubble);

  const items = [...idx.querySelectorAll('.side-index-item')];
  function jumpTo(target){
    const el = document.getElementById(target);
    if (el) el.scrollIntoView({ behavior:'auto', block:'start' });
  }
  function nearestItem(clientY){
    let best = items[0], bestDist = Infinity;
    items.forEach(item => {
      const r = item.getBoundingClientRect();
      const mid = r.top + r.height/2;
      const dist = Math.abs(clientY - mid);
      if (dist < bestDist){ bestDist = dist; best = item; }
    });
    return best;
  }
  function showBubble(item){
    bubble.textContent = item.dataset.fullname;
    bubble.style.top = (item.getBoundingClientRect().top - 6) + 'px';
    bubble.style.display = 'block';
  }
  idx.addEventListener('pointerdown', (e) => {
    idx.setPointerCapture(e.pointerId);
    const item = nearestItem(e.clientY);
    showBubble(item);
    jumpTo(item.dataset.target);
  });
  idx.addEventListener('pointermove', (e) => {
    if (bubble.style.display !== 'block') return;
    const item = nearestItem(e.clientY);
    showBubble(item);
    jumpTo(item.dataset.target);
  });
  const endDrag = () => { bubble.style.display = 'none'; };
  idx.addEventListener('pointerup', endDrag);
  idx.addEventListener('pointercancel', endDrag);
}

function groupByToggleHtml(current){
  return `<div style="padding:10px 18px 10px 18px;">
    <div style="display:flex; border:1px solid var(--line);">
      <div class="groupby-chip ${current==='equipment'?'active':''}" data-groupby="equipment"
        style="flex:1; text-align:center; padding:7px 0; font-family:'Bebas Neue',sans-serif; font-size:13px; letter-spacing:1px; color:${current==='equipment'?'var(--ink)':'var(--slate)'}; background:${current==='equipment'?'var(--flame)':'transparent'};">EQUIPMENT</div>
      <div class="groupby-chip ${current==='muscle'?'active':''}" data-groupby="muscle"
        style="flex:1; text-align:center; padding:7px 0; font-family:'Bebas Neue',sans-serif; font-size:13px; letter-spacing:1px; color:${current==='muscle'?'var(--ink)':'var(--slate)'}; background:${current==='muscle'?'var(--flame)':'transparent'};">MUSCLE</div>
    </div>
  </div>`;
}
const ALT_COLORS = ["#2DD4BF","#9B7EDE","#E8A33D","#6FA8DC","#E8718D","#7FD17A"];

const QUOTES = [
  {t:"You have power over your mind — not outside events. Realize this, and you will find strength.", a:"Marcus Aurelius"},
  {t:"The impediment to action advances action. What stands in the way becomes the way.", a:"Marcus Aurelius"},
  {t:"Waste no more time arguing about what a good man should be. Be one.", a:"Marcus Aurelius"},
  {t:"If it is not right, do not do it; if it is not true, do not say it.", a:"Marcus Aurelius"},
  {t:"Difficulties strengthen the mind, as labor does the body.", a:"Seneca"},
  {t:"We suffer more in imagination than in reality.", a:"Seneca"},
  {t:"It is not that we have a short time to live, but that we waste a lot of it.", a:"Seneca"},
  {t:"He who is brave is free.", a:"Seneca"},
  {t:"Men are disturbed not by things, but by the views they take of them.", a:"Epictetus"},
  {t:"Make the best use of what is in your power, and take the rest as it happens.", a:"Epictetus"},
  {t:"First say to yourself what you would be; and then do what you have to do.", a:"Epictetus"},
  {t:"No man is free who is not master of himself.", a:"Epictetus"},
  {t:"That which does not kill us makes us stronger.", a:"Friedrich Nietzsche"},
  {t:"He who has a why to live can bear almost any how.", a:"Friedrich Nietzsche"},
  {t:"Victorious warriors win first, and then go to war.", a:"Sun Tzu"},
  {t:"The supreme art of war is to subdue the enemy without fighting.", a:"Sun Tzu"},
  {t:"Opportunities multiply as they are seized.", a:"Sun Tzu"},
  {t:"In the midst of chaos, there is also opportunity.", a:"Sun Tzu"},
  {t:"He will win who knows when to fight and when not to fight.", a:"Sun Tzu"},
  {t:"Far better it is to dare mighty things than to rank with those poor spirits who neither enjoy nor suffer much.", a:"Theodore Roosevelt"}
];

function todayQuote(){
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const idx = Math.floor((d - start) / 86400000);
  return QUOTES[idx % QUOTES.length];
}
function todayWeekday(){ const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }
function withTimeout(promise, ms){
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ __timeout: true }), ms); });
  return Promise.race([promise, timeout]).then((r) => { clearTimeout(timer); return r; });
}
function todayStr(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const app = document.getElementById('app');
let state = { selectedDay: todayWeekday(), exercises: [], session: null, currentTab: 'track', trackScrollY: 0 };

const ICON_TRACK = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="4" height="16" rx="1.2"/><rect x="17" y="4" width="4" height="16" rx="1.2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`;
const ICON_SCALE = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="3"/><circle cx="12" cy="12.5" r="5"/><line x1="12" y1="12.5" x2="15" y2="10"/></svg>`;
const ICON_PHASE = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 3h16 M4 21h16 M5 3c0 6 7 7 7 9s-7 3-7 9 M19 3c0 6-7 7-7 9s7 3 7 9"/></svg>`;
const ICON_BALANCE = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18"/></svg>`;
const ICON_ME = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="7.5" r="4"/><path d="M3 21c0-5 4-8 9-8s9 3 9 8"/></svg>`;
const ICON_CHECK = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8FBF7A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function renderTabbar(){
  return `<div class="tabbar">
    <button class="tab-item ${state.currentTab==='track'?'active':''}" data-tab="track">${ICON_TRACK}<span>Track</span></button>
    <button class="tab-item ${state.currentTab==='scale'?'active':''}" data-tab="scale">${ICON_SCALE}<span>Scale</span></button>
    <div class="fab-wrap"><button class="fab" id="fabBtn">${`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#17181A" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`}</button></div>
    <button class="tab-item ${state.currentTab==='balance'?'active':''}" data-tab="balance">${ICON_BALANCE}<span>Balance</span></button>
    <button class="tab-item ${state.currentTab==='me'?'active':''}" data-tab="me">${ICON_ME}<span>Me</span></button>
  </div>`;
}

function attachShellHandlers(){
  document.querySelectorAll('.tab-item').forEach(el => {
    el.onclick = () => {
      const tab = el.dataset.tab;
      state.currentTab = tab;
      removeSideIndex();
      if (tab === 'track') renderTrack();
      else if (tab === 'scale') renderScale();
      else if (tab === 'balance') renderBalance();
      else if (tab === 'me') renderMe();
    };
  });
  const fab = document.getElementById('fabBtn');
  if (fab) fab.onclick = () => {
    if (state.currentTab === 'scale') openLogWeightForm();
    else openPicker(); // track, balance, me all default to the set-logging picker
  };
}

// ---------- LOGIN ----------
function renderLogin(){
  app.innerHTML = `
    <div class="app-shell">
      <div class="login-wrap">
        <div class="logo-circle"><img src="icons/icon-inapp-192.png" width="48" height="48" alt=""></div>
        <div class="app-name">Zealift</div>
        <div class="login-sub">Sign in to sync your data</div>
        <input class="input-field" id="emailInput" type="email" placeholder="you@email.com" autocomplete="email">
        <button class="btn-primary" id="sendCodeBtn">Send Code</button>
        <div class="login-status" id="loginStatus"></div>
        <div class="login-error" id="loginError"></div>
        <div class="login-note">We'll email you a code. No password, no link to click.</div>
      </div>
    </div>`;

  document.getElementById('sendCodeBtn').onclick = async () => {
    const email = document.getElementById('emailInput').value.trim();
    const statusEl = document.getElementById('loginStatus');
    const errEl = document.getElementById('loginError');
    statusEl.textContent = ''; errEl.textContent = '';
    if (!email || !email.includes('@')){ errEl.textContent = 'Enter a valid email.'; return; }
    const btn = document.getElementById('sendCodeBtn');
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.textContent = 'Sending…';
    const { error } = await supabaseClient.auth.signInWithOtp({ email });
    if (error){
      btn.disabled = false; btn.style.opacity = '1'; btn.textContent = 'Send Code';
      errEl.textContent = error.message; return;
    }
    renderCodeEntry(email);
  };
}

function renderCodeEntry(email){
  app.innerHTML = `
    <div class="app-shell">
      <div class="login-wrap">
        <div class="logo-circle"><img src="icons/icon-inapp-192.png" width="48" height="48" alt=""></div>
        <div class="app-name">Zealift</div>
        <div class="login-sub">Enter the code sent to ${email}</div>
        <input class="input-field" id="codeInput" type="text" inputmode="numeric" placeholder="123456" maxlength="10" autocomplete="one-time-code" style="text-align:center; letter-spacing:4px; font-family:'JetBrains Mono', monospace;">
        <button class="btn-primary" id="verifyBtn">Verify</button>
        <div class="login-status" id="loginStatus"></div>
        <div class="login-error" id="loginError"></div>
        <div class="login-note"><span id="backBtn" style="text-decoration:underline; cursor:pointer;">Use a different email</span></div>
      </div>
    </div>`;

  document.getElementById('backBtn').onclick = renderLogin;
  const verifyBtn = document.getElementById('verifyBtn');
  const codeInputEl = document.getElementById('codeInput');
  const statusEl = document.getElementById('loginStatus');

  async function doVerify(){
    if (verifyBtn.disabled) return;
    const code = codeInputEl.value.trim();
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    if (!code || code.length < 6){ errEl.textContent = 'Enter the code from your email.'; return; }

    verifyBtn.disabled = true; codeInputEl.disabled = true; verifyBtn.textContent = 'Verifying…'; statusEl.textContent = '';

    const result = await withTimeout(supabaseClient.auth.verifyOtp({ email, token: code, type: 'email' }), 15000);

    if (result.__timeout){
      verifyBtn.disabled = false; codeInputEl.disabled = false; verifyBtn.textContent = 'Verify';
      errEl.textContent = 'Verification timed out after 15s.'; return;
    }
    if (result.error){
      verifyBtn.disabled = false; codeInputEl.disabled = false; verifyBtn.textContent = 'Verify';
      errEl.textContent = result.error.message; return;
    }
    statusEl.textContent = 'Verified — loading your data…';
    state.session = result.data.session;
    state.currentTab = 'track';
    await renderTrack();
    maybeShowOnboarding();
  }
  verifyBtn.onclick = doVerify;
  codeInputEl.onkeydown = (e) => { if (e.key === 'Enter') doVerify(); };
}

// ---------- TRACK ----------
async function loadExercises(){
  const result = await withTimeout(
    supabaseClient.from('exercises')
      .select('id, name, category, alt_group_id, alt_groups(name, color)')
      .eq('weekday', state.selectedDay)
      .eq('active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true }),
    15000
  );
  if (result.__timeout){ state.exercises = []; return; }
  const { data: exercises, error } = result;
  if (error){ console.error(error); state.exercises = []; return; }

  const exerciseIds = (exercises || []).map(ex => ex.id);
  let lastSetByExercise = {};
  let maxSetByExercise = {};
  if (exerciseIds.length){
    const setsResult = await withTimeout(
      supabaseClient.from('sets').select('exercise_id, weight, weight_unit, weight_type, reps, num_sets, logged_at')
        .in('exercise_id', exerciseIds).order('logged_at', { ascending: false }),
      15000
    );
    const allSets = setsResult.__timeout || setsResult.error ? [] : (setsResult.data || []);
    // Results are ordered newest-first, so the first time we see an exercise_id is its most recent set.
    allSets.forEach(s => { if (!lastSetByExercise[s.exercise_id]) lastSetByExercise[s.exercise_id] = s; });
    // Track the all-time best set per exercise, on ANY day - not just today's session.
    // Only weight-based units (kg/lb) are comparable across entries via conversion;
    // other unit types (pin/level/sec/etc) are compared as raw values, assuming a
    // given exercise stays on one consistent unit type in practice.
    allSets.forEach(s => {
      if (s.weight === null || s.weight === undefined) return;
      const current = maxSetByExercise[s.exercise_id];
      if (!current){ maxSetByExercise[s.exercise_id] = s; return; }
      const sVal = (s.weight_unit === 'kg' || s.weight_unit === 'lb') ? convertWeight(s.weight, s.weight_unit, 'kg') : s.weight;
      const curVal = (current.weight_unit === 'kg' || current.weight_unit === 'lb') ? convertWeight(current.weight, current.weight_unit, 'kg') : current.weight;
      if (s.weight_unit === current.weight_unit || ((s.weight_unit==='kg'||s.weight_unit==='lb') && (current.weight_unit==='kg'||current.weight_unit==='lb'))){
        if (sVal > curVal) maxSetByExercise[s.exercise_id] = s;
      }
    });
  }
  const withLogs = (exercises || []).map(ex => {
    const lastSet = lastSetByExercise[ex.id] || null;
    const loggedToday = lastSet && lastSet.logged_at === todayStr();
    const maxSet = maxSetByExercise[ex.id] || null;
    // Only worth showing as a distinct "PR" line if it's a genuinely different
    // set than the last one shown (otherwise it's just repeating the same info).
    const showPr = maxSet && lastSet && maxSet.logged_at !== lastSet.logged_at;
    return { ...ex, lastSet, loggedToday, maxSet, showPr };
  });

  // Resolve alt-group "complete via" logic: if any member of a group was logged today,
  // the whole group counts as done; the one actually logged shows real data, siblings show "via".
  const doneGroupMember = {};
  withLogs.forEach(ex => { if (ex.alt_group_id && ex.loggedToday) doneGroupMember[ex.alt_group_id] = ex.name; });
  withLogs.forEach(ex => {
    if (ex.alt_group_id && !ex.loggedToday && doneGroupMember[ex.alt_group_id]) {
      ex.completeVia = doneGroupMember[ex.alt_group_id];
    }
  });

  state.exercises = withLogs;
}

function formatSetsReps(s){
  if (s.num_sets && s.reps) return ` (${s.num_sets} × ${s.reps})`;
  if (s.reps) return ` × ${s.reps}`;
  if (s.num_sets) return ` × ${s.num_sets} sets`;
  return '';
}

// ---- Exercise Guide (external public-domain data: yuhonas/free-exercise-db, The Unlicense) ----
// Dynamic name lookup so this works for ANY exercise and ANY user, not a hardcoded table.
const EXDB_JSON_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const EXDB_IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const EXDB_CACHE_KEY = 'zealift_exdb_v1';
let _exdbCache = null;
let _exdbPromise = null;

const EXDB_SYNONYMS = {
  'skullcrusher':'triceps extension','skullcrushers':'triceps extension',
  'bayesian':'cable','iso':'leverage','hammer strength':'leverage',
  'meow':'wrist','farmer':'farmers walk','preacher':'preacher curl',
  'fly':'flye','flys':'flye','pec deck':'butterfly',
  'forearm':'wrist','forearms':'wrist'
};

function exdbNormalize(s){
  s = (s || '').toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');
  for (const k in EXDB_SYNONYMS){ if (s.includes(k)) s += ' ' + EXDB_SYNONYMS[k]; }
  s = s.replace(/[^a-z0-9 ]/g, ' ');
  const stop = new Set(['machine','the','a','with','via','plate','loaded','pin','free','weight','weights','strength','seated','standing']);
  let words = s.split(/\s+/).filter(w => w && !stop.has(w));
  words = words.map(w => (w.endsWith('s') && w.length > 3) ? w.slice(0, -1) : w);
  return new Set(words);
}

async function loadExerciseDB(){
  if (_exdbCache) return _exdbCache;
  if (_exdbPromise) return _exdbPromise;
  // Try localStorage cache first (only download once per device).
  try {
    const cached = localStorage.getItem(EXDB_CACHE_KEY);
    if (cached){ _exdbCache = JSON.parse(cached); return _exdbCache; }
  } catch(e){}
  _exdbPromise = (async () => {
    try {
      const res = await fetch(EXDB_JSON_URL);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      // Keep only the fields we need, to stay well under localStorage limits.
      const slim = data.map(e => ({
        name: e.name, primaryMuscles: e.primaryMuscles, secondaryMuscles: e.secondaryMuscles,
        instructions: e.instructions, equipment: e.equipment, level: e.level,
        mechanic: e.mechanic, images: e.images
      }));
      _exdbCache = slim;
      try { localStorage.setItem(EXDB_CACHE_KEY, JSON.stringify(slim)); } catch(e){}
      return slim;
    } catch(e){
      return null; // offline or unreachable — caller shows a graceful fallback
    }
  })();
  return _exdbPromise;
}

// Curated overrides for names the fuzzy matcher gets wrong: either it finds nothing
// (machine names free-exercise-db doesn't have, like "Pec Fly" or "Back Extension Bench"),
// or it false-positives on shared words (e.g. "Dead Hang" matching "Dead Bug").
// Muscle names sourced from Joel's own exercise notes where he documented them.
const EXERCISE_OVERRIDES = [
  { keywords: ['pec','fly'], primaryMuscles: ['chest'], secondaryMuscles: ['shoulders'] },
  { keywords: ['pullover'], primaryMuscles: ['lats'], secondaryMuscles: ['triceps','chest'] },
  { keywords: ['back','extension'], primaryMuscles: ['lower back'], secondaryMuscles: ['hamstrings','glutes'] },
  { keywords: ['x','wing'], primaryMuscles: ['lats'], secondaryMuscles: ['shoulders','biceps'] },
  { keywords: ['lat','pulldown'], primaryMuscles: ['lats'], secondaryMuscles: ['biceps','shoulders'] },
  { keywords: ['dead','hang'], primaryMuscles: ['lats'], secondaryMuscles: ['forearms','shoulders'] },
  // Two distinct exercises in Joel's plan with near-identical names but different
  // muscle emphasis per his own notes - keyword substring matching (no space vs
  // "easy bar" with a space) is what tells them apart, so order/specificity matters.
  { keywords: ['reverse','easybar'], primaryMuscles: ['forearms'], secondaryMuscles: ['biceps'] },
  { keywords: ['reverse','easy','bar'], primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'] },
  { keywords: ['reverse','ez'], primaryMuscles: ['forearms'], secondaryMuscles: ['biceps'] },
  // free-exercise-db categorizes generic "Dip Machine" and "Bench Press - Powerlifting"
  // as triceps-primary, but Joel's plan documents his specific machines as chest.
  { keywords: ['dip','machine'], primaryMuscles: ['chest'], secondaryMuscles: ['triceps','shoulders'] },
  { keywords: ['plate-loaded','horizontal'], primaryMuscles: ['chest'], secondaryMuscles: ['triceps','shoulders'] },
  // Fuzzy matching was landing this on "Cable Rear Delt Fly" (shoulders) purely on
  // word overlap - a low-to-high cable fly is an upper-chest exercise, not rear delt.
  { keywords: ['low-to-high','fly'], primaryMuscles: ['chest'], secondaryMuscles: ['shoulders'] },
  { keywords: ['kneeling','leg','curl'], primaryMuscles: ['hamstrings'], secondaryMuscles: [] },
  { keywords: ['hip','abductor'], primaryMuscles: ['glutes'], secondaryMuscles: [] }
];
function checkExerciseOverride(name){
  const n = (name || '').toLowerCase();
  for (const o of EXERCISE_OVERRIDES){
    if (o.keywords.every(k => n.includes(k))){
      return { name, primaryMuscles: o.primaryMuscles, secondaryMuscles: o.secondaryMuscles, instructions: [], images: [] };
    }
  }
  return null;
}
function fuzzyMatchExercise(name, db){
  if (!db) return null;
  const qwords = exdbNormalize(name);
  if (!qwords.size) return null;
  let best = null, bestScore = 0;
  for (const e of db){
    const ewords = exdbNormalize(e.name);
    if (!ewords.size) continue;
    let overlap = 0;
    for (const w of qwords){ if (ewords.has(w)) overlap++; }
    const score = overlap / Math.max(qwords.size, ewords.size);
    if (score > bestScore){ best = e; bestScore = score; }
  }
  return bestScore >= 0.34 ? best : null;
}

function matchExercise(name, db){
  const override = checkExerciseOverride(name);
  if (override){
    // Overrides only ever supply correct muscle info, not photos/instructions.
    // Separately try the real fuzzy match purely to borrow supplementary content
    // (image, steps, equipment/level) when a decent real entry exists - the
    // override's muscle data stays authoritative either way, since that's the
    // whole reason it exists (fixing names the fuzzy matcher gets wrong).
    const supplement = fuzzyMatchExercise(name, db);
    if (supplement && (!override.images.length || !override.instructions.length)){
      return {
        ...override,
        images: override.images.length ? override.images : supplement.images,
        instructions: override.instructions.length ? override.instructions : supplement.instructions,
        equipment: override.equipment || supplement.equipment,
        level: override.level || supplement.level,
        mechanic: override.mechanic || supplement.mechanic
      };
    }
    return override;
  }
  return fuzzyMatchExercise(name, db);
}

function convertWeight(value, fromUnit, toUnit){
  if (fromUnit === toUnit) return value;
  if (fromUnit === 'lb' && toUnit === 'kg') return value / 2.20462;
  if (fromUnit === 'kg' && toUnit === 'lb') return value * 2.20462;
  return value;
}

function formatSetValue(s, withAlt){
  const u = s.weight_unit;
  const perSuffix = (s.weight_type === 'per') ? ' per' : '';
  if (u === 'pin') return `Pin ${s.weight}`;
  if (u === 'level') return `Level ${s.weight}`;
  if (u === 'sec') return `${s.weight} sec${s.num_sets ? ' × ' + s.num_sets : ''}`;
  if (u === 'steps') return `${s.weight} steps`;
  if (u === 'bodyweight') return `Bodyweight${formatSetsReps(s)}`;
  if (u === 'lb-assist' || u === 'kg-assist') return `${s.weight}${u.replace('-assist','')} assist`;
  let alt = '';
  if (withAlt && s.weight !== null && (u === 'kg' || u === 'lb')){
    const other = u === 'kg' ? 'lb' : 'kg';
    const conv = Math.round(convertWeight(s.weight, u, other) * 10) / 10;
    alt = ` (${conv}${other})`;
  }
  return `${s.weight}${u}${alt}${perSuffix}${formatSetsReps(s)}`;
}

async function showAltGroupHistory(groupId, groupName){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeAltHist">✕</button><h1>${groupName}</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:0 18px 12px 18px; color:var(--slate);">Combined history across every exercise in this alt group.</div>
      <div id="altHistList"><div class="empty-state" style="padding:20px;">Loading…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeAltHist').onclick = () => overlay.remove();

  const exResult = await withTimeout(
    supabaseClient.from('exercises').select('id, name').eq('alt_group_id', groupId),
    15000
  );
  const members = exResult.__timeout || exResult.error ? [] : (exResult.data || []);
  const list = overlay.querySelector('#altHistList');
  if (members.length === 0){
    list.innerHTML = '<div class="empty-state" style="padding:20px;">No exercises in this group anymore.</div>';
    return;
  }
  const memberIds = members.map(m => m.id);
  const nameById = Object.fromEntries(members.map(m => [m.id, m.name]));
  const setsResult = await withTimeout(
    supabaseClient.from('sets').select('id, exercise_id, weight, weight_unit, weight_type, reps, num_sets, notes, logged_at')
      .in('exercise_id', memberIds).order('logged_at', { ascending: false }).limit(60),
    15000
  );
  const sets = setsResult.__timeout || setsResult.error ? [] : (setsResult.data || []);
  if (sets.length === 0){
    list.innerHTML = '<div class="empty-state" style="padding:20px;">No history logged yet for this group.</div>';
    return;
  }
  list.innerHTML = sets.map(s => `
    <div class="log-row" style="flex-direction:column; align-items:flex-start; gap:3px;">
      <div style="display:flex; justify-content:space-between; width:100%;">
        <div class="log-date">${s.logged_at}</div>
        <div class="log-weight">${formatSetValue(s, true)}</div>
      </div>
      <div class="small" style="color:var(--slate);">${nameById[s.exercise_id] || 'Unknown exercise'}</div>
    </div>`).join('');
}

function exerciseRow(ex){
  const groupName = ex.alt_groups ? ex.alt_groups.name : null;
  const groupColor = ex.alt_groups ? ex.alt_groups.color : null;
  const cornerTag = groupName
    ? `<div class="corner-tag alt-badge-tap" data-group-id="${ex.alt_group_id}" data-group-name="${groupName}" style="background:${groupColor};">${groupName}</div>`
    : '';
  const topPad = groupName ? 'padding-top:5px;' : '';

  let subtitle, showCheck, isDone = false;
  if (ex.loggedToday){
    subtitle = `<div class="ex-last done">✓ Logged today — ${formatSetValue(ex.lastSet)}</div>`;
    showCheck = true; isDone = true;
  } else if (ex.completeVia){
    subtitle = `<div class="ex-last via">↳ Complete via ${ex.completeVia}</div>`;
    showCheck = true; isDone = true;
  } else {
    subtitle = `<div class="ex-last">${ex.lastSet ? formatSetValue(ex.lastSet) + ' · ' + ex.lastSet.logged_at : 'Not logged yet'}</div>`;
    showCheck = false;
  }
  // Once something's done, the thick green rail + faint wash takes priority
  // over the alt-group's rail color - the corner tag still shows which alt
  // group it belongs to, but "completed" is the stronger signal at that point.
  const borderStyle = isDone
    ? `border-left:6px solid var(--good); background:#1A201A;`
    : (groupColor ? `border-left:4px solid ${groupColor};` : '');

  const mech = ex.mechanicInfo;
  const mechTag = mech ? `<span style="font-size:9px; padding:2px 5px; border-radius:4px; margin-left:5px; background:${mech.value==='compound'?'rgba(255,107,26,0.15)':'rgba(122,150,220,0.15)'}; color:${mech.value==='compound'?'#FF6B1A':'#7BA6C9'}; opacity:${mech.guessed?0.75:1};">${mech.guessed?'~':''}${mech.value==='compound'?'Compound':'Isolation'}</span>` : '';
  const prLine = ex.showPr
    ? `<div class="ex-last" style="color:#F0C542; margin-top:2px; font-weight:700;">🏆 PR ${formatSetValue(ex.maxSet)} · ${ex.maxSet.logged_at}</div>`
    : '';

  return `<div class="exercise" style="${borderStyle}" data-id="${ex.id}" data-name="${ex.name}">
    ${cornerTag}
    <div style="flex:1; min-width:0; ${topPad}">
      <div class="ex-name">${ex.name}${mechTag}</div>
      ${subtitle}
      ${prLine}
    </div>
    ${showCheck ? `<div class="check-circle">${ICON_CHECK}</div>` : `<div class="chev">›</div>`}
  </div>`;
}

async function loadDayType(weekday){
  const { data: userData } = await supabaseClient.auth.getUser();
  if (!userData || !userData.user) return DAY_TYPES[weekday];
  const result = await withTimeout(
    supabaseClient.from('day_types').select('label').eq('user_id', userData.user.id).eq('weekday', weekday).maybeSingle(),
    15000
  );
  if (result.__timeout || result.error || !result.data) return DAY_TYPES[weekday];
  return result.data.label;
}

function openEditDayTypeForm(weekday, currentLabel){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeDT">✕</button><h1>Edit Day Type</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label">${DAY_LABELS[weekday]}</div>
      <div class="field-card"><input class="field-input" id="dayTypeInput" type="text" value="${currentLabel}" style="font-size:16px; font-weight:600;"></div>
      <button class="save-btn" id="saveDTBtn">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeDT').onclick = () => overlay.remove();
  overlay.querySelector('#saveDTBtn').onclick = async () => {
    const label = document.getElementById('dayTypeInput').value.trim();
    if (!label) return;
    const { data: userData } = await supabaseClient.auth.getUser();
    await supabaseClient.from('day_types').upsert({ user_id: userData.user.id, weekday, label }, { onConflict: 'user_id,weekday' });
    overlay.remove();
    if (state.currentTab === 'track') renderTrack();
  };
}

const DAY_PRESETS = {
  ppl:        { label: 'Push / Pull / Legs', cycle: ['Push','Pull','Legs'] },
  upperlower: { label: 'Upper / Lower',      cycle: ['Upper Body','Lower Body'] },
  brosplit:   { label: 'Bro Split',          cycle: ['Chest','Back','Shoulders','Legs','Arms'] },
  fullbody:   { label: 'Full Body',          cycle: ['Full Body'] },
  blank:      { label: 'Start Blank',        cycle: ['Workout Day'] }
};

// Fills Monday-first through the chosen number of active days with the preset's
// repeating cycle, leaving the remaining trailing days as Rest.
function computeWeekFromPreset(numDays, presetKey){
  const cycle = (DAY_PRESETS[presetKey] || DAY_PRESETS.ppl).cycle;
  const week = [];
  for (let i = 0; i < 7; i++){
    week.push(i < numDays ? cycle[i % cycle.length] : 'Rest');
  }
  return week;
}

// Small visual aids built from the app's real CSS classes, not approximations,
// so they stay pixel-consistent with the actual UI they're describing.
const ONBOARD_VISUALS = {
  makeItYours: `<div style="background:var(--panel); border-radius:12px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between;">
      <div style="font-family:'Oswald',sans-serif; font-size:15px; text-transform:uppercase;">Legs</div>
      <div style="color:var(--flame); font-size:11px;">✎ tap to rename</div>
    </div>`,
  logging: `<div style="display:flex; flex-direction:column; gap:6px;">
      <div class="exercise" style="background:rgba(143,191,122,0.1); border-radius:10px;">
        <div><div class="ex-name-row"><div class="ex-name">Incline Press</div><div class="badge" style="background:#2DD4BF26; color:#2DD4BF;">Press Alt</div></div><div class="ex-last done">✓ Logged today</div></div>
        <div class="check-circle">✓</div>
      </div>
      <div class="exercise" style="border-radius:10px;">
        <div><div class="ex-name-row"><div class="ex-name">HS Incline Press</div><div class="badge" style="background:#2DD4BF26; color:#2DD4BF;">Press Alt</div></div><div class="ex-last">Not logged yet</div></div>
        <div class="chev">›</div>
      </div>
    </div>`,
  adding: `<div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
      <div style="width:38px; height:38px; border-radius:50%; background:var(--flame); color:var(--ink); font-size:20px; font-weight:700; display:flex; align-items:center; justify-content:center;">+</div>
      <div style="width:100%; background:var(--panel); border-radius:10px; padding:8px 12px; font-size:11.5px;">
        <div style="padding:6px 0; color:var(--flame); border-bottom:1px solid var(--line);">+ Create New Exercise</div>
        <div style="padding:6px 0; color:var(--chalk);">Add Existing Exercise</div>
      </div>
    </div>`,
  tracking: `<div style="background:var(--panel); border-radius:10px; padding:12px;">
      <svg viewBox="0 0 200 40" width="100%" height="30"><polyline points="0,32 40,24 80,26 120,14 160,10 200,4" fill="none" stroke="var(--flame)" stroke-width="2.5"/></svg>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <div style="flex:1; text-align:center; font-size:10px; color:var(--slate);">⚖ SCALE</div>
        <div style="flex:1; text-align:center; font-size:10px; color:var(--slate);">📈 PHASE</div>
      </div>
    </div>`
};

function showOnboarding(mode){
  mode = mode || 'full'; // 'full' (new user), 'teach' (tutorial replay), 'setup' (redo week only)
  const teachSteps = [
    { kind:'teach', title:'Welcome to Zealift',
      body:'Your gym plan, alt groups, and history — all in one place, synced to your account. A few quick things before you dive in.' },
    { kind:'teach', title:'Make It Yours', visual: ONBOARD_VISUALS.makeItYours,
      body:`Tap the workout type at the top of Track (e.g. "Back & Biceps") to rename it. Want to rearrange your whole week? Me → Swap Days moves an entire day's plan — and history — to a new weekday.` },
    { kind:'teach', title:'Logging a Set', visual: ONBOARD_VISUALS.logging,
      body:`Tap any exercise on Track to log it. Colored badges show alt groups — pick one from the group, not all of them. A green check means that slot's done for the day, even if a teammate exercise covered it.` },
    { kind:'teach', title:'Adding Workouts', visual: ONBOARD_VISUALS.adding,
      body:'Tap the + button to log a set for today. Not on the list? Use "Add Existing Exercise" to pull from your full library, or "Create New Exercise" to start fresh.' },
    { kind:'teach', title:'Track Everything', visual: ONBOARD_VISUALS.tracking,
      body:`Scale logs your body weight with a trend chart. Phase tracks your bulk/cut progress. Every set you've ever logged stays in that exercise's history, forever.` }
  ];
  const setupSteps = [
    { kind:'frequency' }, { kind:'preset' }, { kind:'confirm' }, { kind:'superset' }, { kind:'finish' }
  ];
  // Interleave: welcome -> frequency/preset/confirm -> make it yours -> logging -> superset -> adding -> tracking -> finish
  let steps;
  if (mode === 'teach') steps = teachSteps;
  else if (mode === 'setup') steps = setupSteps;
  else steps = [teachSteps[0], setupSteps[0], setupSteps[1], setupSteps[2], teachSteps[1], teachSteps[2], setupSteps[3], teachSteps[3], teachSteps[4], setupSteps[4]];

  let idx = 0;
  const wiz = { numDays: 5, presetKey: 'ppl', week: computeWeekFromPreset(5,'ppl'), superset: null };
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:40; display:flex; align-items:center; justify-content:center; padding:20px;';
  document.body.appendChild(overlay);

  function shell(inner, opts){
    opts = opts || {};
    const dots = steps.map((_, i) => `<div style="width:6px; height:6px; border-radius:50%; background:${i===idx?'var(--flame)':'var(--line)'};"></div>`).join('');
    overlay.innerHTML = `
      <div style="background:var(--panel); border-radius:20px; padding:26px 22px 22px 22px; width:100%; max-width:340px; max-height:88vh; overflow-y:auto; position:relative;">
        <div id="skipBtn" style="position:absolute; top:16px; right:18px; color:var(--slate); font-size:20px; cursor:pointer;">✕</div>
        ${inner}
        <div style="display:flex; gap:6px; justify-content:center; margin:18px 0;">${dots}</div>
        <div style="display:flex; gap:10px;">
          ${idx > 0 && !opts.noBack ? `<button id="backBtn" style="flex:1; padding:12px; border-radius:10px; background:var(--ink); color:var(--chalk); font-size:13px;">Back</button>` : ''}
          <button id="nextBtn" style="flex:2; padding:12px; border-radius:10px; background:var(--flame); color:var(--ink); font-weight:600; font-size:13px;" ${opts.nextDisabled ? 'disabled style="opacity:0.5;"' : ''}>${opts.nextLabel || (idx === steps.length - 1 ? 'Finish' : 'Next')}</button>
        </div>
      </div>`;
    overlay.querySelector('#skipBtn').onclick = close;
    const backBtn = overlay.querySelector('#backBtn');
    if (backBtn) backBtn.onclick = () => { idx--; render(); };
  }

  function render(){
    const step = steps[idx];
    if (step.kind === 'teach') renderTeach(step);
    else if (step.kind === 'frequency') renderFrequency();
    else if (step.kind === 'preset') renderPreset();
    else if (step.kind === 'confirm') renderConfirm();
    else if (step.kind === 'superset') renderSuperset();
    else if (step.kind === 'finish') renderFinish();
  }

  function renderTeach(step){
    shell(`
      <div style="font-family:'JetBrains Mono', monospace; font-size:10px; color:var(--brass); letter-spacing:1.5px; margin-bottom:10px;">${idx + 1} / ${steps.length}</div>
      <div style="font-family:'Oswald', sans-serif; font-size:20px; font-weight:600; margin-bottom:10px;">${step.title}</div>
      <div style="font-size:13px; color:var(--chalk); line-height:1.6; margin-bottom:14px;">${step.body}</div>
      ${step.visual ? `<div style="margin-bottom:6px;">${step.visual}</div>` : ''}
    `);
    overlay.querySelector('#nextBtn').onclick = () => advance();
  }

  function renderFrequency(){
    shell(`
      <div style="font-family:'Oswald', sans-serif; font-size:19px; text-transform:uppercase; margin-bottom:6px;">How many days a week?</div>
      <div style="font-size:11.5px; color:var(--slate); margin-bottom:18px; line-height:1.5;">Sets up your week — change it anytime from the Me tab.</div>
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        ${[3,4,5].map(n => `<button class="freqBtn" data-n="${n}" style="flex:1; background:${wiz.numDays===n?'var(--flame)':'var(--ink)'}; color:${wiz.numDays===n?'var(--ink)':'var(--chalk)'}; border-radius:10px; padding:14px 0; font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:600;">${n}</button>`).join('')}
      </div>
      <div style="display:flex; gap:8px; margin-bottom:6px;">
        ${[6,7].map(n => `<button class="freqBtn" data-n="${n}" style="flex:1; background:${wiz.numDays===n?'var(--flame)':'var(--ink)'}; color:${wiz.numDays===n?'var(--ink)':'var(--chalk)'}; border-radius:10px; padding:14px 0; font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:600;">${n}</button>`).join('')}
      </div>
    `);
    overlay.querySelectorAll('.freqBtn').forEach(b => {
      b.onclick = () => { wiz.numDays = parseInt(b.dataset.n,10); wiz.week = computeWeekFromPreset(wiz.numDays, wiz.presetKey); render(); };
    });
    overlay.querySelector('#nextBtn').onclick = () => advance();
  }

  function renderPreset(){
    shell(`
      <div style="font-family:'Oswald', sans-serif; font-size:19px; text-transform:uppercase; margin-bottom:6px;">Pick a starting point</div>
      <div style="font-size:11.5px; color:var(--slate); margin-bottom:16px; line-height:1.5;">A quick preset to build from — every day stays fully editable after.</div>
      <div style="display:flex; flex-wrap:wrap; gap:7px; margin-bottom:6px;">
        ${Object.entries(DAY_PRESETS).map(([k,v]) => `<button class="presetBtn" data-k="${k}" style="background:${wiz.presetKey===k?'var(--flame)':'var(--ink)'}; color:${wiz.presetKey===k?'var(--ink)':'var(--chalk)'}; border-radius:20px; padding:8px 14px; font-size:11.5px; ${wiz.presetKey===k?'font-weight:600;':''}">${v.label}</button>`).join('')}
      </div>
    `);
    overlay.querySelectorAll('.presetBtn').forEach(b => {
      b.onclick = () => { wiz.presetKey = b.dataset.k; wiz.week = computeWeekFromPreset(wiz.numDays, wiz.presetKey); render(); };
    });
    overlay.querySelector('#nextBtn').onclick = () => advance();
  }

  function renderConfirm(){
    const cycle = [...DAY_PRESETS[wiz.presetKey].cycle, 'Rest'];
    shell(`
      <div style="font-family:'Oswald', sans-serif; font-size:19px; text-transform:uppercase; margin-bottom:6px;">Confirm your week</div>
      <div style="font-size:11.5px; color:var(--slate); margin-bottom:14px;">Tap any day to cycle its type. You can rename it properly later too.</div>
      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:6px;">
        ${DAY_NAMES.map((d,i) => `<div class="dayCycle" data-i="${i}" style="display:flex; align-items:center; justify-content:space-between; background:var(--ink); border-radius:10px; padding:10px 14px; cursor:pointer;">
          <div style="font-family:'JetBrains Mono',monospace; font-size:10.5px; color:var(--slate); width:34px;">${d}</div>
          <div style="font-size:12px; font-weight:500; flex:1; ${wiz.week[i]==='Rest'?'color:var(--slate); font-style:italic;':''}">${wiz.week[i]}</div>
          <div style="color:var(--slate); font-size:12px;">↻</div>
        </div>`).join('')}
      </div>
    `);
    overlay.querySelectorAll('.dayCycle').forEach(row => {
      row.onclick = () => {
        const i = parseInt(row.dataset.i,10);
        const pos = cycle.indexOf(wiz.week[i]);
        wiz.week[i] = cycle[(pos + 1) % cycle.length];
        render();
      };
    });
    overlay.querySelector('#nextBtn').onclick = () => advance();
  }

  function renderSuperset(){
    shell(`
      <div style="font-family:'Oswald', sans-serif; font-size:19px; text-transform:uppercase; margin-bottom:6px;">Use supersets?</div>
      <div style="font-size:11.5px; color:var(--slate); margin-bottom:16px; line-height:1.5;">That badge you just saw is called an alt group — interchangeable exercises grouped together, like a machine vs. dumbbell version of the same lift.</div>
      <div style="display:flex; gap:10px; margin-bottom:6px;">
        <button class="ssBtn" data-v="yes" style="flex:1; background:${wiz.superset==='yes'?'var(--flame)':'var(--ink)'}; color:${wiz.superset==='yes'?'var(--ink)':'var(--chalk)'}; border-radius:12px; padding:14px 0; font-family:'Oswald',sans-serif; font-size:12px; text-transform:uppercase;">Yes, I use these</button>
        <button class="ssBtn" data-v="no" style="flex:1; background:${wiz.superset==='no'?'var(--flame)':'var(--ink)'}; color:${wiz.superset==='no'?'var(--ink)':'var(--chalk)'}; border-radius:12px; padding:14px 0; font-family:'Oswald',sans-serif; font-size:12px; text-transform:uppercase;">Not for now</button>
      </div>
    `);
    overlay.querySelectorAll('.ssBtn').forEach(b => { b.onclick = () => { wiz.superset = b.dataset.v; render(); }; });
    overlay.querySelector('#nextBtn').onclick = () => advance();
  }

  function renderFinish(){
    shell(`
      <div style="font-family:'Oswald', sans-serif; font-size:19px; text-transform:uppercase; margin-bottom:4px;">You're all set</div>
      <div style="font-size:11.5px; color:var(--slate); margin-bottom:14px;">Your week — editable anytime from the Me tab.</div>
      <div style="margin-bottom:6px;">
        ${DAY_NAMES.map((d,i) => `<div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--line); font-size:11.5px;">
          <div style="font-family:'JetBrains Mono',monospace; color:var(--slate);">${d}</div>
          <div style="${wiz.week[i]==='Rest'?'color:var(--slate);':''}">${wiz.week[i]}</div>
        </div>`).join('')}
      </div>
    `, { nextLabel: 'Start Training' });
    overlay.querySelector('#nextBtn').onclick = () => finishAndClose();
  }

  function advance(){
    if (idx === steps.length - 1) finishAndClose();
    else { idx++; render(); }
  }

  async function finishAndClose(){
    overlay.remove();
    // Only write day-type/superset data if this run actually included the setup steps.
    const hadSetup = steps.some(s => s.kind === 'finish' || s.kind === 'confirm');
    if (hadSetup){
      const { data: userData } = await supabaseClient.auth.getUser();
      if (userData && userData.user){
        for (let i = 0; i < 7; i++){
          await supabaseClient.from('day_types').upsert(
            { user_id: userData.user.id, weekday: i, label: wiz.week[i] },
            { onConflict: 'user_id,weekday' }
          );
        }
        if (wiz.superset !== null){
          await supabaseClient.auth.updateUser({ data: { usesSupersets: wiz.superset === 'yes' } });
        }
      }
      if (state.currentTab === 'track') renderTrack();
    }
    if (mode === 'full'){
      await supabaseClient.auth.updateUser({ data: { onboarded: true } });
    }
  }

  async function close(){
    overlay.remove();
    if (mode === 'full'){
      await supabaseClient.auth.updateUser({ data: { onboarded: true } });
    }
  }

  render();
}

async function maybeShowOnboarding(){
  const { data: userData } = await supabaseClient.auth.getUser();
  if (userData && userData.user && !userData.user.user_metadata.onboarded){
    showOnboarding('full');
  }
}

// Maps a (possibly custom, renamed) day-type label to target muscle names via
// keyword matching, so suggestions work even for days the user has renamed themselves.
const MUSCLE_KEYWORDS = [
  { words:['chest'], muscles:['chest'] },
  { words:['back'], muscles:['lats','middle back','lower back','traps'] },
  { words:['shoulder'], muscles:['shoulders'] },
  { words:['tricep'], muscles:['triceps'] },
  { words:['bicep'], muscles:['biceps'] },
  { words:['leg'], muscles:['quadriceps','hamstrings','calves','glutes'] },
  { words:['arm'], muscles:['biceps','triceps','forearms'] },
  { words:['ab','core'], muscles:['abdominals'] },
  { words:['glute'], muscles:['glutes'] },
  { words:['calf','calves'], muscles:['calves'] },
  { words:['quad'], muscles:['quadriceps'] },
  { words:['hamstring'], muscles:['hamstrings'] },
  { words:['push'], muscles:['chest','shoulders','triceps'] },
  { words:['pull'], muscles:['lats','biceps','middle back'] },
  { words:['upper'], muscles:['chest','back','shoulders','biceps','triceps','lats'] },
  { words:['lower'], muscles:['quadriceps','hamstrings','calves','glutes'] },
  { words:['full'], muscles:['chest','back','quadriceps','shoulders'] }
];
function getTargetMusclesForDayType(label){
  const n = (label || '').toLowerCase();
  const set = new Set();
  MUSCLE_KEYWORDS.forEach(k => { if (k.words.some(w => n.includes(w))) k.muscles.forEach(m => set.add(m)); });
  return [...set];
}
function namesAreSimilar(a, b){
  const wa = exdbNormalize(a), wb = exdbNormalize(b);
  if (!wa.size || !wb.size) return false;
  let overlap = 0;
  for (const w of wa){ if (wb.has(w)) overlap++; }
  return (overlap / Math.max(wa.size, wb.size)) >= 0.34;
}
const EQUIPMENT_TO_CATEGORY = {
  cable: 'Cable', machine: 'Pin-Loaded', barbell: 'Free Weights - No Bench',
  dumbbell: 'Free Weights - No Bench', 'body only': 'Other', kettlebells: 'Free Weights - No Bench',
  bands: 'Cable', 'e-z curl bar': 'Free Weights - No Bench', 'exercise ball': 'Other',
  'foam roll': 'Other', 'medicine ball': 'Other', other: 'Other'
};
async function getSuggestedExercises(dayTypeLabel, existingLibraryExercises){
  const targets = getTargetMusclesForDayType(dayTypeLabel);
  if (!targets.length) return [];
  const db = await loadExerciseDB();
  if (!db) return [];
  const existingNames = existingLibraryExercises.map(e => e.name);
  const candidates = db.filter(e => (e.primaryMuscles || []).some(m => targets.includes(m)));
  const fresh = candidates.filter(cand => !existingNames.some(name => namesAreSimilar(name, cand.name)));
  const starred = fresh.filter(e => POPULAR_EXERCISES.has(e.name)).sort(() => Math.random() - 0.5);
  const unstarred = fresh.filter(e => !POPULAR_EXERCISES.has(e.name)).sort(() => Math.random() - 0.5);
  // Prioritized, not exclusive: fill up to 4 of the 6 slots from starred exercises
  // when available, then top up the rest from whatever's left (unstarred first,
  // spilling into any remaining starred if the pool is thin) - so familiar staples
  // surface more often without every suggestion always being the same handful.
  const picked = starred.slice(0, 4);
  const rest = unstarred.concat(starred.slice(4)).sort(() => Math.random() - 0.5);
  picked.push(...rest.slice(0, 6 - picked.length));
  return picked.sort(() => Math.random() - 0.5);
}

async function openSuggestionPreview(name, category, navList){
  navList = navList || [];
  const navIdx = navList.findIndex(e => e.name === name);
  const navPrev = navIdx > 0 ? navList[navIdx - 1] : null;
  const navNext = (navIdx !== -1 && navIdx < navList.length - 1) ? navList[navIdx + 1] : null;
  const catFor = (item) => EQUIPMENT_TO_CATEGORY[item.equipment] || 'Other';

  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header" style="justify-content:space-between;">
      <div style="display:flex; align-items:center; gap:8px;">
        <button id="prevSugBtn" style="font-size:20px; ${navPrev ? '' : 'visibility:hidden;'}">‹</button>
        <button id="closeSugPreview">✕</button>
      </div>
      <h1 style="flex:1; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0 6px;">${name}</h1>
      <button id="nextSugBtn" style="font-size:20px; ${navNext ? '' : 'visibility:hidden;'}">›</button>
    </div>
    <div class="overlay-scroll">
      <div id="sugPreviewArea" style="padding:0 18px;"><div class="small" style="color:var(--slate);">Loading…</div></div>
      <button class="save-btn" id="addSuggestionBtn" style="margin-top:6px;">+ Add to ${DAY_LABELS[state.selectedDay]}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeSugPreview').onclick = () => { overlay.remove(); restoreSideIndexIfVisible(); };
  if (navPrev) overlay.querySelector('#prevSugBtn').onclick = () => { overlay.remove(); openSuggestionPreview(navPrev.name, catFor(navPrev), navList); };
  if (navNext) overlay.querySelector('#nextSugBtn').onclick = () => { overlay.remove(); openSuggestionPreview(navNext.name, catFor(navNext), navList); };

  let touchStartX = null;
  overlay.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive:true });
  overlay.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 70) return;
    if (dx < 0 && navNext){ overlay.remove(); openSuggestionPreview(navNext.name, catFor(navNext), navList); }
    else if (dx > 0 && navPrev){ overlay.remove(); openSuggestionPreview(navPrev.name, catFor(navPrev), navList); }
  }, { passive:true });

  const db = await loadExerciseDB();
  const match = matchExercise(name, db) || { name, primaryMuscles: [], secondaryMuscles: [], instructions: [], images: [] };
  overlay.querySelector('#sugPreviewArea').innerHTML = renderGuideContent(match);
  attachGuideImageLightbox(overlay.querySelector('#sugPreviewArea'), match.images);

  overlay.querySelector('#addSuggestionBtn').onclick = async () => {
    const { data: userData } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('exercises').insert({
      user_id: userData.user.id, name, category, weekday: state.selectedDay, alt_group_id: null
    });
    if (error){ alert(error.message); return; }
    overlay.remove();
    state.currentTab = 'track';
    renderTrack();
  };
}

async function renderTrack(){
  app.innerHTML = `<div class="app-shell"><div class="login-wrap"><div class="login-sub">Loading your exercises…</div></div></div>`;
  const [, dayTypeLabel] = await Promise.all([loadExercises(), loadDayType(state.selectedDay)]);

  // slot-based progress: exercises sharing an alt_group_id count once
  const seenGroups = new Set();
  let totalSlots = 0, doneSlots = 0;
  state.exercises.forEach(ex => {
    const key = ex.alt_group_id || ex.id;
    if (seenGroups.has(key)) return;
    seenGroups.add(key);
    totalSlots++;
    if (ex.loggedToday || ex.completeVia) doneSlots++;
  });
  const pct = totalSlots > 0 ? Math.round((doneSlots / totalSlots) * 100) : 0;

  const groupBy = getGroupByPref();
  const [{ grouped, orderedKeys }, exdb] = await Promise.all([
    groupExercisesByChoice(state.exercises, groupBy),
    loadExerciseDB()
  ]);
  state.exercises.forEach(ex => { ex.mechanicInfo = classifyMechanic(matchExercise(ex.name, exdb)); });

  let suggestions = [];
  if (state.exercises.length > 0){
    if (!state.suggestionsCache) state.suggestionsCache = {};
    const cacheKey = state.selectedDay;
    if (state.suggestionsCache[cacheKey]){
      suggestions = state.suggestionsCache[cacheKey];
    } else {
      const libResult = await withTimeout(
        supabaseClient.from('exercises').select('name').eq('active', true),
        15000
      );
      const fullLibrary = libResult.__timeout || libResult.error ? state.exercises : (libResult.data || []);
      suggestions = await getSuggestedExercises(dayTypeLabel, fullLibrary);
      state.suggestionsCache[cacheKey] = suggestions;
    }
  }

  const q = todayQuote();
  const dayChips = DAY_NAMES.map((d, i) => {
    const isSelected = i === state.selectedDay;
    const isToday = i === todayWeekday();
    return `<button class="day ${isSelected ? 'active' : ''} ${isToday ? 'today-marker' : ''}" data-day="${i}">${d}</button>`;
  }).join('');

  let listHtml = '';
  state.trackFlatOrder = [];
  orderedKeys.forEach(cat => {
    const items = grouped[cat] || [];
    if (items.length === 0) return;
    const slug = 'trackcat-' + cat.replace(/[^a-z0-9]/gi,'');
    const editIcon = groupBy === 'equipment'
      ? `<span class="cat-rename-btn" data-cat="${cat}" style="float:right; color:var(--slate); font-size:12px; cursor:pointer; padding:2px 6px;">✎</span>`
      : '';
    listHtml += `<div class="category" id="${slug}">${cat}${editIcon}</div>` + items.map(exerciseRow).join('');
    state.trackFlatOrder.push(...items.map(ex => ({ id: ex.id, name: ex.name })));
  });
  if (state.exercises.length === 0){
    const starters = getStarterExercises(dayTypeLabel);
    listHtml = `<div class="empty-state">No exercises set for ${DAY_LABELS[state.selectedDay]} yet.</div>
      <div class="category">Quick Add — Common for ${dayTypeLabel}</div>
      ${starters.map(s => `<div class="pick-row starter-add" data-name="${s.name}" data-cat="${s.category}"><div class="ex-name">${s.name}</div><div class="chev" style="color:var(--flame); font-size:20px;">+</div></div>`).join('')}
      <div style="padding:14px 18px;"><button class="btn-primary" id="emptyAddBtn">+ Add a Different Exercise</button></div>`;
  }
  let suggestionsHtml = '';
  if (suggestions.length > 0){
    const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    suggestionsHtml = `<div class="category" style="display:flex; align-items:center; justify-content:space-between;">
        <div>Try Something New for ${dayTypeLabel}</div>
        <div style="display:flex; gap:2px;">
          <button id="refreshSuggestions" style="background:none; width:38px; height:38px; display:flex; align-items:center; justify-content:center; border-radius:8px;"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--flame)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>
          <button id="seeAllSuggestions" style="background:none; width:38px; height:38px; display:flex; align-items:center; justify-content:center; border-radius:8px;"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--flame)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
        </div>
      </div>
      <div class="small" style="padding:0 18px 8px 18px; color:var(--slate);">Not in your library yet — pulled from a public exercise database based on today's focus.</div>
      ${suggestions.map(s => {
        const cat = EQUIPMENT_TO_CATEGORY[s.equipment] || 'Other';
        const muscleLabel = s.primaryMuscles && s.primaryMuscles[0] ? cap(s.primaryMuscles[0]) : '';
        const star = POPULAR_EXERCISES.has(s.name)
          ? `<span title="Popular staple" style="color:#F0C542; margin-left:5px;">★</span>` : '';
        return `<div class="pick-row suggestion-add" data-name="${s.name}" data-cat="${cat}">
          <div><div class="ex-name">${s.name}${star}</div><div class="small" style="color:var(--slate);">${muscleLabel}</div></div>
          <div class="chev" style="color:var(--flame); font-size:20px;">+</div>
        </div>`;
      }).join('')}`;
  }

  app.innerHTML = `
    <div class="app-shell">
      <div class="scroll-area">
        <div class="brandbar"><img src="icons/icon-inapp-32.png" alt=""><div class="name">ZEALIFT</div><button class="brandbar-timer" onclick="openTimer()" aria-label="Timer" style="margin-left:auto; background:none; color:var(--slate); padding:6px; display:flex; align-items:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M9 2h6"/></svg></button></div>
        <div class="day-strip">${dayChips}</div>
        <div class="header">
          <div class="eyebrow">${DAY_LABELS[state.selectedDay].toUpperCase()}</div>
          <h1 id="dayTypeHeader" style="cursor:pointer;">${dayTypeLabel}</h1>
          <div class="quote">"${q.t}" — ${q.a}</div>
        </div>
        <div style="margin:12px 18px 14px 18px; height:4px; background:var(--panel); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:var(--good); border-radius:4px;"></div>
        </div>
        ${state.exercises.length > 0 ? groupByToggleHtml(groupBy) : ''}
        ${listHtml}
        ${suggestionsHtml}
      </div>
      ${renderTabbar()}
    </div>`;

  attachShellHandlers();
  document.getElementById('dayTypeHeader').onclick = () => openEditDayTypeForm(state.selectedDay, dayTypeLabel);
  document.querySelectorAll('.cat-rename-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const oldName = btn.dataset.cat;
      promptText({
        title: `Rename "${oldName}"`, placeholder: 'New category name', initialValue: oldName,
        onConfirm: async (newName) => {
          if (newName === oldName) return;
          const { data: userData } = await supabaseClient.auth.getUser();
          const { error } = await supabaseClient.from('exercises')
            .update({ category: newName }).eq('user_id', userData.user.id).eq('category', oldName);
          if (error){ alert(error.message); return; }
          addCustomCategory(newName);
          renderTrack();
        }
      });
    };
  });
  document.querySelectorAll('.groupby-chip').forEach(chip => {
    chip.onclick = () => { setGroupByPref(chip.dataset.groupby); renderTrack(); };
  });
  const scrollEl = document.querySelector('.scroll-area');
  if (state.exercises.length > 0 && orderedKeys.some(k => (grouped[k]||[]).length)){
    attachSideIndex(orderedKeys.filter(k => (grouped[k]||[]).length), 'trackcat-', { top: 230, bottom: 100 });
  } else {
    removeSideIndex();
  }
  requestAnimationFrame(() => { scrollEl.scrollTop = state.trackScrollY; });
  scrollEl.onscroll = () => { state.trackScrollY = scrollEl.scrollTop; };
  document.querySelectorAll('.day').forEach(el => {
    el.onclick = () => { state.selectedDay = parseInt(el.dataset.day, 10); state.trackScrollY = 0; renderTrack(); };
  });
  document.querySelectorAll('.exercise').forEach(el => {
    let pressTimer = null;
    let longPressed = false;
    const start = () => {
      longPressed = false;
      pressTimer = setTimeout(() => { longPressed = true; showExerciseActionsMenu(el.dataset.id, el.dataset.name); }, 550);
    };
    const cancel = () => { clearTimeout(pressTimer); };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
    el.onclick = () => { if (!longPressed) openLogForm(el.dataset.id, el.dataset.name); };
  });
  document.querySelectorAll('.alt-badge-tap').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      showAltGroupHistory(el.dataset.groupId, el.dataset.groupName);
    };
  });
  const emptyBtn = document.getElementById('emptyAddBtn');
  if (emptyBtn) emptyBtn.onclick = openNewExerciseForm;
  document.querySelectorAll('.starter-add').forEach(el => {
    el.onclick = () => quickAddStarter(el.dataset.name, el.dataset.cat, state.selectedDay);
  });
  document.querySelectorAll('.suggestion-add').forEach(el => {
    el.onclick = () => openSuggestionPreview(el.dataset.name, el.dataset.cat);
  });
  const refreshBtn = document.getElementById('refreshSuggestions');
  if (refreshBtn) refreshBtn.onclick = () => {
    if (state.suggestionsCache) delete state.suggestionsCache[state.selectedDay];
    renderTrack();
  };
  const seeAllBtn = document.getElementById('seeAllSuggestions');
  if (seeAllBtn) seeAllBtn.onclick = () => openPicker('database');
}

function showExerciseActionsMenu(exerciseId, exerciseName){
  removeSideIndex();
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:20; display:flex; align-items:center; justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--panel); border-radius:16px; padding:10px 0; width:280px;">
      <div style="padding:12px 18px; font-family:'Oswald', sans-serif; font-size:14px; color:var(--slate); border-bottom:1px solid var(--line);">${exerciseName}</div>
      <div class="me-item" id="menuRename" style="border-bottom:1px solid var(--line); cursor:pointer;"><div>Rename Exercise</div><div class="chev">›</div></div>
      <div class="me-item" id="menuEditAlt" style="border-bottom:1px solid var(--line); cursor:pointer;"><div>Edit Alt Group</div><div class="chev">›</div></div>
      <div class="me-item" id="menuRemove" style="border-bottom:none; cursor:pointer;"><div style="color:var(--flame);">Remove from ${DAY_LABELS[state.selectedDay]}</div><div class="chev">›</div></div>
      <div style="text-align:center; padding:12px; color:var(--slate); font-size:13px; cursor:pointer;" id="menuCancel">Cancel</div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#menuCancel').onclick = () => overlay.remove();
  overlay.querySelector('#menuRename').onclick = () => { overlay.remove(); openRenameExerciseForm(exerciseId, exerciseName); };
  overlay.querySelector('#menuEditAlt').onclick = () => { overlay.remove(); openEditAltGroupForm(exerciseId, exerciseName); };
  overlay.querySelector('#menuRemove').onclick = () => { overlay.remove(); confirmRemoveExercise(exerciseId, exerciseName); };
}

function openRenameExerciseForm(exerciseId, exerciseName){
  let scope = 'everywhere'; // 'everywhere' or 'thisDay'
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeRename">✕</button><h1>Rename Exercise</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label">Name</div>
      <div class="field-card"><input class="field-input" id="renameInput" type="text" value="${exerciseName.replace(/"/g, '&quot;')}" style="font-size:15px; font-weight:400;"></div>
      <div class="field-label">Apply To</div>
      <div class="chip-row">
        <div class="chip active" data-scope="everywhere">Everywhere</div>
        <div class="chip" data-scope="thisDay">Just This Day</div>
      </div>
      <div class="form-sub" id="renameScopeHint" style="margin-top:0;">Renames every instance of this exercise across all days, and keeps all its logged history.</div>
      <button class="save-btn" id="saveRenameBtn">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeRename').onclick = () => overlay.remove();
  overlay.querySelectorAll('.chip[data-scope]').forEach(chip => {
    chip.onclick = () => {
      overlay.querySelectorAll('.chip[data-scope]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      scope = chip.dataset.scope;
      overlay.querySelector('#renameScopeHint').textContent = scope === 'everywhere'
        ? 'Renames every instance of this exercise across all days, and keeps all its logged history.'
        : 'Renames only the version on this specific day. Other days keep the original name.';
    };
  });
  overlay.querySelector('#saveRenameBtn').onclick = async () => {
    const newName = document.getElementById('renameInput').value.trim();
    if (!newName || newName === exerciseName){ overlay.remove(); return; }
    const { data: userData } = await supabaseClient.auth.getUser();
    let error;
    if (scope === 'everywhere'){
      // Rename all rows sharing the old name (an exercise can exist on multiple days), so history stays consistent.
      ({ error } = await supabaseClient.from('exercises')
        .update({ name: newName })
        .eq('user_id', userData.user.id)
        .eq('name', exerciseName));
    } else {
      // Just this one row, identified by id - other days keep the original name.
      ({ error } = await supabaseClient.from('exercises')
        .update({ name: newName })
        .eq('id', exerciseId));
    }
    if (error){ alert(error.message); return; }
    overlay.remove();
    if (state.currentTab === 'track') renderTrack();
  };
}

function openEditAltGroupForm(exerciseId, exerciseName){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeAlt">✕</button><h1>Alt Group</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label" style="padding-top:0;">${exerciseName} — ${DAY_LABELS[state.selectedDay]} only</div>
      <div id="altEditArea"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeAlt').onclick = () => overlay.remove();
  const area = overlay.querySelector('#altEditArea');
  pickAltGroup(area, async (picked) => {
    await supabaseClient.from('exercises').update({ alt_group_id: picked ? picked.id : null }).eq('id', exerciseId);
    overlay.remove();
    if (state.currentTab === 'track') renderTrack();
  });
}

function confirmRemoveExercise(exerciseId, exerciseName){
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:20; display:flex; align-items:center; justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--panel); border-radius:16px; padding:22px; width:280px; text-align:center;">
      <div style="font-family:'Oswald', sans-serif; font-size:16px; margin-bottom:8px;">Remove Exercise?</div>
      <div style="font-size:13px; color:var(--slate); margin-bottom:18px;">"${exerciseName}" will be hidden from this day. Your past logged sets are kept.</div>
      <div style="display:flex; gap:10px;">
        <button id="cancelRemove" style="flex:1; padding:11px; border-radius:10px; background:var(--ink); color:var(--chalk); font-size:13px;">Cancel</button>
        <button id="confirmRemove" style="flex:1; padding:11px; border-radius:10px; background:var(--flame); color:var(--ink); font-weight:600; font-size:13px;">Remove</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cancelRemove').onclick = () => overlay.remove();
  overlay.querySelector('#confirmRemove').onclick = async () => {
    overlay.remove();
    await supabaseClient.from('exercises').update({ active: false }).eq('id', exerciseId);
    showUndoToast(exerciseName, async () => {
      await supabaseClient.from('exercises').update({ active: true }).eq('id', exerciseId);
      renderTrack();
    });
    renderTrack();
  };
}

function confirmDeleteLog(setId, onDeleted){
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:25; display:flex; align-items:center; justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--panel); border-radius:16px; padding:22px; width:280px; text-align:center;">
      <div style="font-family:'Oswald', sans-serif; font-size:16px; margin-bottom:8px;">Delete This Log?</div>
      <div style="font-size:13px; color:var(--slate); margin-bottom:18px;">This removes the entry permanently. There's no undo.</div>
      <div style="display:flex; gap:10px;">
        <button id="cancelDel" style="flex:1; padding:11px; border-radius:10px; background:var(--ink); color:var(--chalk); font-size:13px;">Cancel</button>
        <button id="confirmDel" style="flex:1; padding:11px; border-radius:10px; background:var(--flame); color:var(--ink); font-weight:600; font-size:13px;">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cancelDel').onclick = () => overlay.remove();
  overlay.querySelector('#confirmDel').onclick = async () => {
    overlay.remove();
    await supabaseClient.from('sets').delete().eq('id', setId);
    onDeleted();
  };
}

function showUndoLastLogToast(setId){
  const toast = document.createElement('div');
  toast.style = 'position:fixed; bottom:100px; left:50%; transform:translateX(-50%); max-width:90%; background:var(--panel); border-radius:12px; padding:13px 16px; display:flex; align-items:center; gap:14px; z-index:30; box-shadow:0 8px 24px rgba(0,0,0,0.4);';
  toast.innerHTML = `<div style="font-size:13px;">Logged — same as last time</div><div id="undoLogBtn" style="color:var(--flame); font-weight:600; font-size:13px; white-space:nowrap;">Undo</div>`;
  document.body.appendChild(toast);
  const timer = setTimeout(() => toast.remove(), 5000);
  toast.querySelector('#undoLogBtn').onclick = async () => {
    clearTimeout(timer); toast.remove();
    await supabaseClient.from('sets').delete().eq('id', setId);
    if (state.currentTab === 'track') renderTrack();
  };
}

function showUndoToast(exerciseName, onUndo){
  const toast = document.createElement('div');
  toast.style = 'position:fixed; bottom:100px; left:50%; transform:translateX(-50%); max-width:90%; background:var(--panel); border-radius:12px; padding:13px 16px; display:flex; align-items:center; gap:14px; z-index:30; box-shadow:0 8px 24px rgba(0,0,0,0.4);';
  toast.innerHTML = `<div style="font-size:13px;">Removed "${exerciseName}"</div><div id="undoBtn" style="color:var(--flame); font-weight:600; font-size:13px; white-space:nowrap;">Undo</div>`;
  document.body.appendChild(toast);
  const timer = setTimeout(() => toast.remove(), 5000);
  toast.querySelector('#undoBtn').onclick = () => { clearTimeout(timer); toast.remove(); onUndo(); };
}

// Groups raw free-exercise-db records (not the user's own exercises) either by
// primary muscle or by their own equipment field directly.
const MECHANIC_NA_KEYWORDS = ['stretch','-smr','smr','warm up','cardio','bicycling','elliptical','treadmill','walk','jog','pose','mobility',
  'windmill','tibialis','drill','sprint','jumping','circle','rotation','toe touch','figure 8','straddle','pyramid',
  'stairmaster','step mill','recumbent','skating','hang','groin','knee across','ankle on','hug knees','locust','side bridge'];
const MECHANIC_COMPOUND_KEYWORDS = ['press','squat','row','pull-up','pullup','pull up','deadlift','dip','lunge','thrust','clean','snatch','chin-up','chin up'];
const MECHANIC_ISOLATION_KEYWORDS = ['curl','extension','fly','flye','raise','pushdown','crunch','shrug','kickback','pullover','abduction','adduction'];

// Real database mechanic field where available (~90% of entries); for the rest
// (mostly stretches/cardio/mobility drills, plus every manual override, which
// never sets mechanic), a keyword fallback - clearly a guess, marked as such,
// and honest about not applying at all to stretches/cardio rather than forcing
// a compound/isolation label onto something that isn't really either.
function classifyMechanic(match){
  if (!match) return null;
  if (match.mechanic === 'compound' || match.mechanic === 'isolation'){
    return { value: match.mechanic, guessed: false };
  }
  const n = (match.name || '').toLowerCase();
  if (MECHANIC_NA_KEYWORDS.some(k => n.includes(k))) return null;
  if (MECHANIC_COMPOUND_KEYWORDS.some(k => n.includes(k))) return { value:'compound', guessed:true };
  if (MECHANIC_ISOLATION_KEYWORDS.some(k => n.includes(k))) return { value:'isolation', guessed:true };
  return null;
}

// A couple of well-known staple exercises per muscle group - starred in the
// Database tab, and also given priority (not exclusivity) in Track's suggestions.
// Verified against exact real database names, not fuzzy-matched.
const POPULAR_EXERCISES = new Set([
  'Barbell Bench Press - Medium Grip', 'Dumbbell Bench Press', 'Incline Dumbbell Press', 'Pushups',
  'Pullups', 'Wide-Grip Lat Pulldown', 'Bent Over Two-Dumbbell Row', 'Straight-Arm Pulldown',
  'Standing Military Press', 'Dumbbell Shoulder Press', 'Side Lateral Raise', 'Arnold Dumbbell Press',
  'Barbell Curl', 'Dumbbell Bicep Curl', 'Hammer Curls', 'Concentration Curls',
  'Triceps Pushdown', 'Close-Grip Barbell Bench Press', 'Lying Triceps Press', 'Dips - Triceps Version',
  'Barbell Squat', 'Leg Press', 'Leg Extensions', 'Barbell Lunge',
  'Romanian Deadlift', 'Lying Leg Curls', 'Stiff-Legged Barbell Deadlift',
  'Barbell Hip Thrust', 'Barbell Glute Bridge', 'Single Leg Glute Bridge', 'Cable Hip Adduction',
  'Standing Calf Raises', 'Seated Calf Raise', 'Donkey Calf Raises', 'Calf Press On The Leg Press Machine',
  'Plank', 'Crunches', 'Hanging Leg Raise',
  'Wrist Roller', 'Seated Palm-Up Barbell Wrist Curl', 'Palms-Down Wrist Curl Over A Bench',
  'Barbell Shrug', 'Dumbbell Shrug', 'Cable Shrugs', 'Rack Pulls',
  'Bent Over Barbell Row', 'Seated Cable Rows', 'One-Arm Dumbbell Row', 'Lying T-Bar Row',
  'Barbell Deadlift', 'Hyperextensions (Back Extensions)', 'Good Morning', 'Superman'
]);

function muscleSubtitle(primaryMuscles, secondaryMuscles){
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const primary = (primaryMuscles || []).map(cap);
  const secondary = (secondaryMuscles || []).map(cap);
  if (!primary.length && !secondary.length) return '';
  let out = primary.join(', ');
  if (secondary.length) out += (out ? ' · ' : '') + secondary.join(', ');
  return out;
}

function groupDatabaseExercises(list, groupBy){
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const grouped = {};
  list.forEach(e => {
    const key = groupBy === 'muscle'
      ? ((e.primaryMuscles && e.primaryMuscles[0]) ? cap(e.primaryMuscles[0]) : 'Other')
      : (e.equipment ? cap(e.equipment) : 'Other');
    (grouped[key] = grouped[key] || []).push(e);
  });
  const orderedKeys = Object.keys(grouped).sort((a,b) => a==='Other'?1:b==='Other'?-1:a.localeCompare(b));
  return { grouped, orderedKeys };
}

async function openPicker(initialTab, jumpToMuscle){
  if (jumpToMuscle) setGroupByPref('muscle');
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closePicker">✕</button><h1>Log a Set</h1><div style="width:18px;"></div></div>
    <div style="display:flex; padding:0 18px; border-bottom:1px solid var(--line);">
      <div class="picker-toptab" data-tab="mine" style="flex:1; text-align:center; padding:10px 0; font-family:'Oswald',sans-serif; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--slate); border-bottom:2px solid transparent; cursor:pointer;">Your Exercises</div>
      <div class="picker-toptab" data-tab="database" style="flex:1; text-align:center; padding:10px 0; font-family:'Oswald',sans-serif; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--slate); border-bottom:2px solid transparent; cursor:pointer;">Database</div>
    </div>
    <div class="overlay-scroll" id="pickerBody"></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closePicker').onclick = () => { removeSideIndex(); overlay.remove(); };

  const result = await withTimeout(
    supabaseClient.from('exercises').select('id, name, category, weekday, alt_group_id').eq('active', true),
    15000
  );
  const all = result.__timeout || result.error ? [] : (result.data || []);

  function renderMineTab(){
    removeSideIndex();
    const body = overlay.querySelector('#pickerBody');
    body.innerHTML = `
      <div class="search-bar">🔍 <input id="pickerSearch" placeholder="Search your exercises…"></div>
      <div class="pick-row" id="createNewRow" style="border-bottom:1px solid var(--line);"><div class="ex-name" style="color:var(--flame);">+ Create New Exercise</div></div>
      <div id="pickerGroupToggle"></div>
      <div id="pickerList"><div class="empty-state">Loading…</div></div>`;
    body.querySelector('#createNewRow').onclick = () => { overlay.remove(); openNewExerciseForm(); };

    async function renderList(filter){
      const f = (filter || '').toLowerCase();
      const byName = {};
      all.forEach(ex => {
        const key = ex.name.toLowerCase();
        if (!byName[key] || ex.weekday < byName[key].weekday) byName[key] = ex;
      });
      const deduped = Object.values(byName).filter(ex => ex.name.toLowerCase().includes(f));
      const groupBy = getGroupByPref();
      const [{ grouped, orderedKeys }, db] = await Promise.all([
        groupExercisesByChoice(deduped, groupBy),
        loadExerciseDB()
      ]);

      let html = '';
      const presentKeys = orderedKeys.filter(k => (grouped[k]||[]).length);
      presentKeys.forEach(cat => {
        const items = (grouped[cat] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
        const slug = 'mine-' + cat.replace(/[^a-z0-9]/gi,'');
        html += `<div class="category" id="${slug}">${cat}</div>`;
        html += items.map(ex => {
          const match = matchExercise(ex.name, db);
          const muscles = match ? muscleSubtitle(match.primaryMuscles, match.secondaryMuscles) : '';
          const mech = classifyMechanic(match);
          const mechTag = mech ? `<span style="font-size:9px; padding:2px 5px; border-radius:4px; margin-left:5px; background:${mech.value==='compound'?'rgba(255,107,26,0.15)':'rgba(122,150,220,0.15)'}; color:${mech.value==='compound'?'#FF6B1A':'#7BA6C9'}; opacity:${mech.guessed?0.75:1};">${mech.guessed?'~':''}${mech.value==='compound'?'Compound':'Isolation'}</span>` : '';
          return `<div class="pick-row" data-id="${ex.id}" data-name="${ex.name}"><div><div class="ex-name">${ex.name}${mechTag}</div>${muscles ? `<div class="small" style="color:var(--slate);">${muscles}</div>` : ''}</div><div class="chev">›</div></div>`;
        }).join('');
      });
      body.querySelector('#pickerGroupToggle').innerHTML = groupByToggleHtml(groupBy);
      body.querySelectorAll('.groupby-chip').forEach(chip => {
        chip.onclick = () => { setGroupByPref(chip.dataset.groupby); renderList(body.querySelector('#pickerSearch').value); };
      });
      body.querySelector('#pickerList').innerHTML = html || '<div class="empty-state">No matches.</div>';
      if (presentKeys.length > 0){
        attachSideIndex(presentKeys, 'mine-', { top: 220, bottom: 110 });
      } else {
        removeSideIndex();
      }
      body.querySelectorAll('.pick-row[data-id]').forEach(el => {
        el.onclick = async () => {
          const picked = all.find(ex => ex.id === el.dataset.id);
          overlay.remove();
          if (!picked || picked.weekday === state.selectedDay){
            openLogForm(el.dataset.id, el.dataset.name);
            return;
          }
          const existingToday = all.find(ex => ex.weekday === state.selectedDay && ex.name.toLowerCase() === picked.name.toLowerCase());
          if (existingToday){
            openLogForm(existingToday.id, existingToday.name);
            return;
          }
          const { data: userData } = await supabaseClient.auth.getUser();
          const { data: inserted, error } = await supabaseClient.from('exercises').insert({
            user_id: userData.user.id, name: picked.name, category: picked.category,
            weekday: state.selectedDay, alt_group_id: null
          }).select();
          if (error){ alert(error.message); return; }
          openLogForm(inserted[0].id, picked.name);
        };
      });
    }
    renderList('');
    body.querySelector('#pickerSearch').oninput = (e) => renderList(e.target.value);
  }

  async function renderDatabaseTab(){
    const body = overlay.querySelector('#pickerBody');
    body.innerHTML = `<div class="small" style="padding:12px 18px; color:var(--slate);">Loading database…</div>`;
    const db = await loadExerciseDB();
    if (!db){
      body.innerHTML = `<div class="empty-state">Database unavailable offline.</div>`;
      return;
    }
    const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    body.innerHTML = `
      <div class="search-bar">🔍 <input id="dbSearch" placeholder="Search ${db.length} exercises…"></div>
      <div id="starterBlock"></div>
      <div id="dbGroupToggle"></div>
      <div id="dbList" style="padding-right:26px;"></div>`;

    const starterNames = ['Chest Press','Shoulder Press','Lat Pulldown','Tricep Pushdown','Bicep Curl','Leg Press','Seated Row','Plank'];
    const starterMatches = starterNames.map(n => matchExercise(n, db)).filter(Boolean);
    if (starterMatches.length){
      body.querySelector('#starterBlock').innerHTML = `
        <div style="margin:14px 18px 14px 18px; background:var(--panel); border-radius:14px; padding:14px 16px;">
          <div style="font-family:'Oswald',sans-serif; font-size:12.5px; letter-spacing:1px; text-transform:uppercase; color:var(--brass); margin-bottom:3px;">New to the gym?</div>
          <div style="font-size:11.5px; color:var(--slate); margin-bottom:11px;">A handful of reliable staples to start with.</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${starterMatches.map(m => `<div class="db-starter-chip" data-name="${m.name}" data-equip="${m.equipment||''}" style="background:var(--ink); border-radius:18px; padding:8px 14px; font-size:12px; color:var(--chalk); cursor:pointer;">${m.name}</div>`).join('')}
          </div>
        </div>`;
      body.querySelectorAll('.db-starter-chip').forEach(chip => {
        chip.onclick = () => { removeSideIndex(); openSuggestionPreview(chip.dataset.name, EQUIPMENT_TO_CATEGORY[chip.dataset.equip] || 'Other'); };
      });
    }

    function renderDbList(filter){
      const f = (filter || '').toLowerCase();
      const filtered = db.filter(e => e.name.toLowerCase().includes(f));
      const groupBy = getGroupByPref();
      const { grouped, orderedKeys } = groupDatabaseExercises(filtered, groupBy);
      let html = '';
      const presentKeys = orderedKeys.filter(k => (grouped[k]||[]).length);
      const flatOrder = []; // display order across every visible category, for swipe nav
      presentKeys.forEach(cat => {
        const items = (grouped[cat]||[]).slice().sort((a,b)=>a.name.localeCompare(b.name));
        const slug = 'cat-' + cat.replace(/[^a-z0-9]/gi,'');
        html += `<div class="category" id="${slug}">${cat}</div>`;
        html += items.map(e => {
          flatOrder.push({ name: e.name, equipment: e.equipment });
          const star = POPULAR_EXERCISES.has(e.name)
            ? `<span title="Popular staple" style="color:#F0C542; margin-left:5px;">★</span>` : '';
          const muscles = muscleSubtitle(e.primaryMuscles, e.secondaryMuscles);
          const mech = classifyMechanic(e);
          const mechTag = mech ? `<span style="font-size:9px; padding:2px 5px; border-radius:4px; margin-left:5px; background:${mech.value==='compound'?'rgba(255,107,26,0.15)':'rgba(122,150,220,0.15)'}; color:${mech.value==='compound'?'#FF6B1A':'#7BA6C9'}; opacity:${mech.guessed?0.75:1};">${mech.guessed?'~':''}${mech.value==='compound'?'Compound':'Isolation'}</span>` : '';
          const equipLine = [cap(e.equipment), cap(e.level)].filter(Boolean).join(' · ');
          return `<div class="pick-row db-pick" data-name="${e.name}" data-equip="${e.equipment||''}"><div><div class="ex-name">${e.name}${star}${mechTag}</div>${muscles ? `<div class="small" style="color:var(--slate);">${muscles}</div>` : ''}${equipLine ? `<div class="small" style="color:var(--slate); opacity:0.7; font-size:10.5px;">${equipLine}</div>` : ''}</div><div class="chev">›</div></div>`;
        }).join('');
      });
      body.querySelector('#dbGroupToggle').innerHTML = groupByToggleHtml(groupBy);
      body.querySelectorAll('.groupby-chip').forEach(chip => {
        chip.onclick = () => { setGroupByPref(chip.dataset.groupby); renderDbList(body.querySelector('#dbSearch').value); };
      });
      body.querySelector('#dbList').innerHTML = html || '<div class="empty-state">No matches.</div>';

      // Fixed side index over the whole screen, drag-scrub with a name bubble.
      attachSideIndex(presentKeys, 'cat-', { top: 170, bottom: 110 });

      if (jumpToMuscle && !filter){
        const slug = 'cat-' + jumpToMuscle.replace(/[^a-z0-9]/gi,'');
        const target = document.getElementById(slug);
        if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior:'auto', block:'start' }));
      }

      body.querySelectorAll('.db-pick').forEach(el => {
        el.onclick = () => {
          removeSideIndex();
          openSuggestionPreview(el.dataset.name, EQUIPMENT_TO_CATEGORY[el.dataset.equip] || 'Other', flatOrder);
        };
      });
    }
    renderDbList('');
    body.querySelector('#dbSearch').oninput = (e) => renderDbList(e.target.value);
  }

  overlay.querySelectorAll('.picker-toptab').forEach(tab => {
    tab.onclick = () => {
      overlay.querySelectorAll('.picker-toptab').forEach(t => {
        t.classList.remove('active'); t.style.color = 'var(--slate)'; t.style.borderBottomColor = 'transparent';
      });
      tab.classList.add('active'); tab.style.color = 'var(--chalk)'; tab.style.borderBottomColor = 'var(--flame)';
      overlay.querySelector('#pickerBody').scrollTop = 0;
      if (tab.dataset.tab === 'mine') renderMineTab(); else renderDatabaseTab();
    };
  });

  const startTab = overlay.querySelector(`.picker-toptab[data-tab="${initialTab === 'database' ? 'database' : 'mine'}"]`);
  startTab.classList.add('active'); startTab.style.color = 'var(--chalk)'; startTab.style.borderBottomColor = 'var(--flame)';
  if (initialTab === 'database') renderDatabaseTab(); else renderMineTab();
}

// ---------- ALT GROUP PICKER (inline, used inside the new-exercise form) ----------
async function pickAltGroup(container, onPicked){
  container.innerHTML = `<div class="action-row" id="clearAltRow" style="border-color:var(--line);"><div class="ex-name" style="color:var(--slate); font-size:13px;">✕ No Alt Group</div></div><div class="search-bar">🔍 <input id="altSearch" placeholder="Search or create alt group…"></div><div id="altList"></div>`;
  container.querySelector('#clearAltRow').onclick = () => onPicked(null);
  const result = await withTimeout(supabaseClient.from('alt_groups').select('id, name, color'), 15000);
  const groups = result.__timeout || result.error ? [] : (result.data || []);

  function renderAlt(filter){
    const f = (filter || '').toLowerCase();
    const matches = groups.filter(g => g.name.toLowerCase().includes(f));
    let html = matches.map(g => `<div class="group-row" data-id="${g.id}" data-name="${g.name}"><div class="group-dot" style="background:${g.color};"></div><div class="ex-name">${g.name}</div></div>`).join('');
    if (filter) html += `<div class="action-row" id="createAltRow"><div class="ex-name" style="color:var(--flame);">+ Create "${filter}"</div></div>`;
    container.querySelector('#altList').innerHTML = html || '<div class="empty-state" style="padding:20px;">No groups yet — type a name to create one.</div>';
    container.querySelectorAll('.group-row[data-id]').forEach(el => {
      el.onclick = () => onPicked({ id: el.dataset.id, name: el.dataset.name });
    });
    const createRow = container.querySelector('#createAltRow');
    if (createRow) createRow.onclick = async () => {
      const color = ALT_COLORS[groups.length % ALT_COLORS.length];
      const { data: userData } = await supabaseClient.auth.getUser();
      const insertResult = await withTimeout(
        supabaseClient.from('alt_groups').insert({ user_id: userData.user.id, name: filter, color }).select(),
        15000
      );
      if (!insertResult.__timeout && insertResult.data && insertResult.data[0]){
        onPicked({ id: insertResult.data[0].id, name: insertResult.data[0].name });
      }
    };
  }
  renderAlt('');
  container.querySelector('#altSearch').oninput = (e) => renderAlt(e.target.value);
}

// ---------- NEW EXERCISE FORM ----------
async function openNewExerciseForm(){
  let selectedCategory = CATEGORIES[0];
  let selectedDay = state.selectedDay;
  let pickedAltGroup = null;
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeForm">✕</button><h1>New Exercise</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label">Name</div>
      <div class="field-card"><input class="field-input" id="exNameInput" placeholder="e.g. Incline Dumbbell Press" style="font-size:14px; font-weight:400;"></div>
      <div class="field-label">Category</div>
      <div class="chip-row" id="categoryChipRow"><div class="small" style="color:var(--slate); padding:8px 0;">Loading…</div></div>
      <div class="field-label">Day</div>
      <div class="chip-row">${DAY_NAMES.map((d,i) => `<div class="chip ${i===state.selectedDay?'active':''}" data-day="${i}">${d}</div>`).join('')}</div>
      <div class="field-label">Alt Group <span class="opt">(optional)</span></div>
      <div id="altGroupArea" class="field-card" style="display:block;"><div class="ex-name" style="color:var(--slate); font-size:13px;" id="altGroupPickBtn">Tap to choose or create…</div></div>
      <button class="save-btn" id="saveExerciseBtn">Add Exercise</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeForm').onclick = () => overlay.remove();

  async function renderCategoryChips(){
    const cats = await getAllCategories();
    const row = overlay.querySelector('#categoryChipRow');
    if (!cats.includes(selectedCategory)) selectedCategory = cats[0];
    row.innerHTML = cats.map(c => `<div class="chip ${c===selectedCategory?'active':''}" data-cat="${c}">${c}</div>`).join('')
      + `<div class="chip" id="newCategoryChip" style="color:var(--flame); border-color:var(--flame);">+ New</div>`;
    row.querySelectorAll('.chip[data-cat]').forEach(el => {
      el.onclick = () => { row.querySelectorAll('.chip[data-cat]').forEach(c=>c.classList.remove('active')); el.classList.add('active'); selectedCategory = el.dataset.cat; };
    });
    row.querySelector('#newCategoryChip').onclick = () => {
      promptText({
        title: 'New Category Name', placeholder: 'e.g. Bodyweight',
        onConfirm: (name) => { addCustomCategory(name); selectedCategory = name; renderCategoryChips(); }
      });
    };
  }
  await renderCategoryChips();

  overlay.querySelectorAll('.chip[data-day]').forEach(el => {
    el.onclick = () => { overlay.querySelectorAll('.chip[data-day]').forEach(c=>c.classList.remove('active')); el.classList.add('active'); selectedDay = parseInt(el.dataset.day,10); };
  });
  overlay.querySelector('#altGroupPickBtn').onclick = () => {
    const area = overlay.querySelector('#altGroupArea');
    area.style.background = 'none'; area.style.padding = '0'; area.style.margin = '0 18px 14px 18px';
    pickAltGroup(area, (picked) => {
      pickedAltGroup = picked;
      area.innerHTML = picked
        ? `<div class="field-card"><div class="ex-name">${picked.name} ✓</div></div>`
        : `<div class="field-card"><div class="ex-name" style="color:var(--slate);">No Alt Group</div></div>`;
    });
  };
  overlay.querySelector('#saveExerciseBtn').onclick = async () => {
    const name = document.getElementById('exNameInput').value.trim();
    if (!name) return;
    const { data: userData } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('exercises').insert({
      user_id: userData.user.id, name, category: selectedCategory, weekday: selectedDay,
      alt_group_id: pickedAltGroup ? pickedAltGroup.id : null
    });
    if (error){ alert(error.message); return; }
    overlay.remove();
    state.selectedDay = selectedDay;
    state.currentTab = 'track';
    renderTrack();
  };
}

// ---------- LOG SET FORM ----------
// ---- Muscle Map (original schematic figure, not third-party artwork) ----
// Simple front/back mannequin built from basic shapes; regions colored per
// the exercise's own primaryMuscles/secondaryMuscles. Entirely our own art,
// so there's no copyright question the way there is with illustrated anatomy charts.
const MUSCLE_SKELETON = [
  ['circle',80,22,16], ['rect',72,36,16,10,4], ['rect',48,46,64,90,18],
  ['rect',24,50,20,55,10], ['rect',116,50,20,55,10],
  ['rect',18,100,16,55,8], ['rect',126,100,16,55,8],
  ['rect',52,132,56,30,14], ['rect',52,158,24,70,12], ['rect',84,158,24,70,12],
  ['rect',54,224,20,60,10], ['rect',86,224,20,60,10]
];
const MUSCLE_REGIONS_FRONT = {
  neck: [['rect',72,34,16,10,5]],
  shoulders: [['circle',34,54,11],['circle',126,54,11]],
  chest: [['rect',54,52,52,26,10]],
  biceps: [['rect',26,58,16,38,8],['rect',118,58,16,38,8]],
  forearms: [['rect',20,100,12,48,6],['rect',128,100,12,48,6]],
  abdominals: [['rect',58,80,44,44,8]],
  abductors: [['rect',48,134,10,26,5],['rect',102,134,10,26,5]],
  adductors: [['rect',74,160,12,50,6]],
  quadriceps: [['rect',54,160,20,64,10],['rect',86,160,20,64,10]]
};
const MUSCLE_REGIONS_BACK = {
  traps: [['rect',58,46,44,20,8]],
  lats: [['rect',44,64,18,42,9],['rect',98,64,18,42,9]],
  'middle back': [['rect',62,64,36,30,8]],
  'lower back': [['rect',64,100,32,26,8]],
  triceps: [['rect',26,58,16,38,8],['rect',118,58,16,38,8]],
  glutes: [['rect',54,134,52,28,14]],
  hamstrings: [['rect',54,162,20,62,10],['rect',86,162,20,62,10]],
  calves: [['rect',54,226,20,56,10],['rect',86,226,20,56,10]]
};
function muscleShapeSvg(shape, fill, opacity){
  if (shape[0] === 'rect'){
    const [,x,y,w,h,rx] = shape;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" opacity="${opacity}"/>`;
  }
  const [,cx,cy,r] = shape;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
}
function renderMuscleFigure(regions, primarySet, secondarySet){
  let parts = MUSCLE_SKELETON.map(s => muscleShapeSvg(s, '#2A2C31', 1));
  for (const muscle in regions){
    let fill = null, op = 1;
    if (primarySet.has(muscle)){ fill = '#FF6B1A'; op = 1; }
    else if (secondarySet.has(muscle)){ fill = '#FF6B1A'; op = 0.4; }
    if (!fill) continue;
    regions[muscle].forEach(s => parts.push(muscleShapeSvg(s, fill, op)));
  }
  return `<svg viewBox="0 0 160 300" width="120" height="225">${parts.join('')}</svg>`;
}
function renderMuscleMap(primaryMuscles, secondaryMuscles){
  const primarySet = new Set(primaryMuscles || []);
  const secondarySet = new Set(secondaryMuscles || []);
  const all = new Set([...primarySet, ...secondarySet]);
  const hasFront = [...all].some(m => m in MUSCLE_REGIONS_FRONT);
  const hasBack = [...all].some(m => m in MUSCLE_REGIONS_BACK);
  if (!hasFront && !hasBack) return '';
  const figures = [];
  if (hasFront) figures.push(`<div style="text-align:center;">${renderMuscleFigure(MUSCLE_REGIONS_FRONT, primarySet, secondarySet)}<div class="small" style="color:var(--slate); margin-top:-4px;">Front</div></div>`);
  if (hasBack) figures.push(`<div style="text-align:center;">${renderMuscleFigure(MUSCLE_REGIONS_BACK, primarySet, secondarySet)}<div class="small" style="color:var(--slate); margin-top:-4px;">Back</div></div>`);
  return `<div style="display:flex; justify-content:center; gap:22px; background:var(--ink); border-radius:14px; padding:14px 8px 8px 8px; margin-bottom:12px;">${figures.join('')}</div>`;
}

// Free-exercise-db has no free-text description field, so we synthesize a short
// one from what it does give us (level/mechanic/equipment/muscles).
function synthesizeDescription(match){
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const muscles = (match.primaryMuscles || []).map(cap);
  const muscleText = muscles.length ? muscles.join(' and ') : null;
  if (match.level && match.equipment && match.mechanic){
    return `A ${match.level} ${match.mechanic} movement using ${match.equipment}${muscleText ? `, primarily working the ${muscleText}` : ''}.`;
  }
  if (muscleText) return `Primarily targets the ${muscleText}.`;
  return '';
}

// Full-screen enlarged view of a guide's images, with swipe/arrow navigation
// between them (every exercise has exactly 2 - start/end position).
function openImageLightbox(images, startIndex){
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:60; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; touch-action:none;';
  let idx = startIndex || 0;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style = 'position:absolute; top:calc(18px + env(safe-area-inset-top, 0px)); right:18px; background:none; color:#fff; font-size:20px; z-index:2;';
  closeBtn.onclick = () => overlay.remove();
  overlay.appendChild(closeBtn);

  const imgWrap = document.createElement('div');
  imgWrap.style = 'width:92vw; height:76vh; display:flex; align-items:center; justify-content:center; overflow:hidden;';
  overlay.appendChild(imgWrap);

  const img = document.createElement('img');
  img.style = 'max-width:100%; max-height:100%; border-radius:10px; background:#fff; transform-origin:center center; will-change:transform;';
  imgWrap.appendChild(img);

  const dots = document.createElement('div');
  dots.style = 'display:flex; gap:6px; margin-top:16px;';
  overlay.appendChild(dots);

  // Zoom/pan state - persists while viewing the same image, resets on navigation
  // (lifting your pinch fingers does NOT snap back, matching what was asked for).
  let scale = 1, tx = 0, ty = 0;
  function applyTransform(){
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function render(resetZoom){
    img.src = EXDB_IMG_BASE + images[idx];
    if (resetZoom){ scale = 1; tx = 0; ty = 0; applyTransform(); }
    dots.innerHTML = images.map((_, i) =>
      `<div style="width:6px; height:6px; border-radius:50%; background:${i===idx ? 'var(--flame)' : 'rgba(255,255,255,0.3)'};"></div>`
    ).join('');
  }
  render(true);

  let navPrevFn = null, navNextFn = null;
  if (images.length > 1){
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '‹';
    prevBtn.style = 'position:absolute; left:8px; top:50%; transform:translateY(-50%); background:none; color:#fff; font-size:34px; padding:10px 16px; z-index:2;';
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '›';
    nextBtn.style = 'position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; color:#fff; font-size:34px; padding:10px 16px; z-index:2;';
    navPrevFn = () => { idx = (idx - 1 + images.length) % images.length; render(true); };
    navNextFn = () => { idx = (idx + 1) % images.length; render(true); };
    prevBtn.onclick = navPrevFn;
    nextBtn.onclick = navNextFn;
    overlay.appendChild(prevBtn);
    overlay.appendChild(nextBtn);
  }

  // Touch handling: two fingers = pinch-zoom (and stays zoomed after release);
  // one finger while zoomed = pan; one finger at normal zoom = swipe to navigate.
  let mode = null; // 'pinch' | 'pan' | 'swipe' | null
  let pinchStartDist = 0, pinchStartScale = 1;
  let panStartX = 0, panStartY = 0, panStartTx = 0, panStartTy = 0;
  let swipeStartX = 0;

  function dist(t0, t1){
    return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
  }

  overlay.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2){
      mode = 'pinch';
      pinchStartDist = dist(e.touches[0], e.touches[1]);
      pinchStartScale = scale;
    } else if (e.touches.length === 1){
      if (scale > 1.05){
        mode = 'pan';
        panStartX = e.touches[0].clientX; panStartY = e.touches[0].clientY;
        panStartTx = tx; panStartTy = ty;
      } else {
        mode = 'swipe';
        swipeStartX = e.touches[0].clientX;
      }
    }
  }, { passive: true });

  overlay.addEventListener('touchmove', (e) => {
    if (mode === 'pinch' && e.touches.length === 2){
      const newDist = dist(e.touches[0], e.touches[1]);
      scale = Math.max(1, Math.min(4, pinchStartScale * (newDist / pinchStartDist)));
      applyTransform();
    } else if (mode === 'pan' && e.touches.length === 1){
      tx = panStartTx + (e.touches[0].clientX - panStartX);
      ty = panStartTy + (e.touches[0].clientY - panStartY);
      applyTransform();
    }
  }, { passive: true });

  overlay.addEventListener('touchend', (e) => {
    if (mode === 'swipe' && images.length > 1){
      const dx = e.changedTouches[0].clientX - swipeStartX;
      if (Math.abs(dx) >= 40){
        if (dx < 0) navNextFn(); else navPrevFn();
      }
    } else if (mode === 'pinch' && scale <= 1.02){
      // Snapped back to ~1x during the pinch itself - clean up any residual offset.
      scale = 1; tx = 0; ty = 0; applyTransform();
    }
    // Pinch/pan otherwise intentionally leave scale/tx/ty as-is - no snap-back.
    mode = null;
  }, { passive: true });
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

function attachGuideImageLightbox(container, images){
  if (!images || !images.length) return;
  container.querySelectorAll('.guide-thumb').forEach(thumb => {
    thumb.onclick = () => openImageLightbox(images, parseInt(thumb.dataset.idx, 10) || 0);
  });
}

function renderGuideContent(match){
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const primarySet = new Set(match.primaryMuscles || []);
  const muscleChips = [...(match.primaryMuscles||[]), ...(match.secondaryMuscles||[])].map(m => {
    const isPrimary = primarySet.has(m);
    return `<span style="display:inline-block; font-size:10px; padding:3px 8px; border-radius:20px; margin:2px 3px 2px 0;
      background:${isPrimary ? 'rgba(255,107,26,0.16)' : 'var(--panel)'};
      color:${isPrimary ? '#FF6B1A' : 'var(--slate)'};">${cap(m)}</span>`;
  }).join('');
  const description = synthesizeDescription(match);
  const imgs = (match.images || []).map((src, i) =>
    `<img src="${EXDB_IMG_BASE}${src}" alt="" class="guide-thumb" data-idx="${i}" style="width:100%; border-radius:10px; background:#fff; display:block; cursor:pointer;" loading="lazy">`
  ).join('');
  const imgGallery = imgs
    ? `<div style="display:grid; grid-template-columns:${match.images.length > 1 ? '1fr 1fr' : '1fr'}; gap:6px; margin-bottom:6px;">${imgs}</div>`
    : '';
  const googleQuery = encodeURIComponent(`${match.name} exercise form`);
  const googleBtn = `<a href="https://www.google.com/search?tbm=isch&q=${googleQuery}" target="_blank" rel="noopener"
    style="display:flex; align-items:center; justify-content:center; gap:6px; background:var(--panel); border-radius:8px; padding:9px; margin-bottom:12px; text-decoration:none;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <span style="font-size:11.5px; color:var(--slate); font-weight:600;">See more photos on Google Images</span>
  </a>`;
  const steps = (match.instructions||[]).map((s,i) =>
    `<div style="display:flex; gap:8px; margin-bottom:7px;">
       <span style="color:#FF6B1A; font-weight:600; font-size:12px; flex-shrink:0;">${i+1}</span>
       <span style="font-size:12.5px; color:var(--chalk); line-height:1.45;">${s}</span>
     </div>`).join('');
  const mech = classifyMechanic(match);
  const mechLabel = mech ? (mech.guessed ? `~${cap(mech.value)}` : cap(mech.value)) : null;
  const meta = [match.equipment, match.level, mechLabel].filter(Boolean).map(s => s.startsWith('~') ? s : cap(s)).join(' · ');
  return `
    <div style="margin-bottom:10px;">${muscleChips}</div>
    ${meta ? `<div class="small" style="color:var(--slate); margin-bottom:10px;">${meta}</div>` : ''}
    ${description ? `<div style="font-size:12.5px; color:var(--chalk); line-height:1.5; margin-bottom:12px;">${description}</div>` : ''}
    ${imgGallery}
    ${googleBtn}
    ${steps}
    <div class="small" style="color:var(--slate); margin-top:10px; font-style:italic; opacity:0.7;">Matched to "${match.name}".</div>
  `;
}

async function loadExerciseGuide(overlay, exerciseName){
  const area = overlay.querySelector('#guideArea');
  if (!area) return;
  area.innerHTML = `<div class="small" style="color:var(--slate); padding:0 18px;">Looking up form guide…</div>`;
  const db = await loadExerciseDB();
  const match = matchExercise(exerciseName, db);
  if (!match){
    area.innerHTML = db
      ? `<div class="small" style="color:var(--slate); padding:0 18px;">No form guide found for this exercise.</div>`
      : `<div class="small" style="color:var(--slate); padding:0 18px;">Form guide unavailable offline.</div>`;
    return;
  }
  area.innerHTML = `
    <div style="padding:0 18px;">
      <div id="guideToggle" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding:12px 0;">
        <div style="font-family:'Oswald',sans-serif; font-size:12px; letter-spacing:1px; text-transform:uppercase; color:var(--slate);">Form Guide</div>
        <div id="guideChev" style="color:var(--slate); font-size:14px; transition:transform 0.2s;">▾</div>
      </div>
      <div id="guideBody" style="display:none;">
        ${renderGuideContent(match)}
      </div>
    </div>`;
  const toggle = area.querySelector('#guideToggle');
  const body = area.querySelector('#guideBody');
  const chev = area.querySelector('#guideChev');
  attachGuideImageLightbox(body, match.images);
  toggle.onclick = () => {
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    chev.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
  };
}

// ---------- PR CELEBRATION ----------
function celebratePR(exerciseName, weight, unit, priorBest){
  const gain = Math.round((weight - priorBest) * 10) / 10;
  const overlay = document.createElement('div');
  overlay.style = `position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,0.55); animation:prFade 0.25s ease;`;
  // Simple confetti dots.
  let confetti = '';
  const colors = ['#FF6B1A','#8FBF7A','#F0C542','#5A9BF0','#EDEAE2'];
  for (let i=0;i<28;i++){
    const left = Math.random()*100, delay = Math.random()*0.4, dur = 1.4+Math.random()*0.8;
    const c = colors[i % colors.length], size = 6+Math.random()*6;
    confetti += `<div style="position:absolute; top:-20px; left:${left}%; width:${size}px; height:${size}px;
      background:${c}; border-radius:2px; animation:prConfetti ${dur}s ${delay}s ease-in forwards;"></div>`;
  }
  overlay.innerHTML = `
    <style>
      @keyframes prFade{from{opacity:0}to{opacity:1}}
      @keyframes prConfetti{to{transform:translateY(105vh) rotate(${Math.random()*720}deg); opacity:0.2;}}
      @keyframes prPop{0%{transform:scale(0.6); opacity:0;}60%{transform:scale(1.08);}100%{transform:scale(1); opacity:1;}}
    </style>
    ${confetti}
    <div style="background:var(--panel); border-radius:20px; padding:28px 26px; text-align:center; max-width:300px;
      animation:prPop 0.4s ease; box-shadow:0 20px 60px rgba(0,0,0,0.6); position:relative;">
      <div style="font-size:38px; margin-bottom:6px;">🏆</div>
      <div style="font-family:'Oswald',sans-serif; font-size:20px; letter-spacing:1px; text-transform:uppercase; color:#FF6B1A; margin-bottom:6px;">New PR!</div>
      <div style="font-size:14px; color:var(--chalk); margin-bottom:4px;">${exerciseName}</div>
      <div style="font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:600; margin-bottom:4px;">${weight}${unit}</div>
      <div class="small" style="color:var(--slate);">+${gain}${unit} over your previous best of ${Math.round(priorBest*10)/10}${unit}</div>
      <button id="prClose" style="margin-top:18px; background:#FF6B1A; color:var(--ink); font-weight:600; border-radius:10px; padding:10px 24px; font-size:13px;">Nice</button>
    </div>`;
  document.body.appendChild(overlay);
  if (navigator.vibrate) navigator.vibrate([80,40,80,40,160]);
  overlay.querySelector('#prClose').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// ---------- PLATE CALCULATOR ----------
// Gym plates: 45, 35 (rarer), 25, 10 lb. Standard barbell = 45lb / ~20kg.
// Only makes sense for equipment you actually load plates onto — not dumbbells,
// not pin-loaded machines. Gated by exercise name since that's what's available.
function exerciseUsesLoadPlates(exerciseName){
  const n = (exerciseName || '').toLowerCase();
  return ['barbell','plate-loaded','plate loaded','hammer strength','iso-lateral','iso lateral',
          'leg press','hack squat','smith machine'].some(k => n.includes(k));
}
// weightType 'total' = classic barbell math (total = bar + plates on both sides).
// weightType 'per' = the number entered IS already the per-side/per-peg load — decompose it directly.
function computePlates(weight, unit, weightType){
  if (!weight || weight <= 0) return null;
  const toLb = (v, u) => u === 'kg' ? v * 2.20462 : v;
  if (weightType === 'per'){
    const perSideLb = toLb(weight, unit);
    return greedyPlates(perSideLb, [45,35,25,10]);
  }
  // 'total': subtract a standard bar, split the rest across both sides.
  const barLb = 45;
  const totalLb = toLb(weight, unit);
  const perSideLb = (totalLb - barLb) / 2;
  if (perSideLb < 0) return { belowBar: true };
  return greedyPlates(perSideLb, [45,35,25,10]);
}
function greedyPlates(perSideLb, plates){
  let remaining = perSideLb;
  const used = [];
  for (const p of plates){
    const n = Math.floor(remaining / p);
    if (n > 0){ used.push({n, p}); remaining -= n*p; }
  }
  return { used, leftover: Math.round(remaining*10)/10, perSide: Math.round(perSideLb*10)/10 };
}
function describePlates(res){
  if (!res) return '';
  if (res.belowBar) return `Below bar weight (45lb / 20kg bar).`;
  if (!res.used.length) return `Just the bar${res.leftover>0.1?` (+${res.leftover}lb short per side)`:''}.`;
  const desc = res.used.map(u => `${u.n}×${u.p}`).join(' + ');
  const short = res.leftover > 0.1 ? ` <span style="color:var(--flame);">(~${res.leftover}lb short)</span>` : '';
  return `Per side: <span style="color:var(--chalk); font-weight:600;">${desc}</span> lb${short}`;
}
function renderPlateCalc(overlay, exerciseName){
  const area = overlay.querySelector('#plateCalcArea');
  if (!area) return;
  if (!exerciseUsesLoadPlates(exerciseName)){ area.innerHTML = ''; return; }
  const wInput = overlay.querySelector('#weightInput');
  const activeUnit = overlay.querySelector('.unit-toggle button.active')?.dataset.u;
  const activeType = overlay.querySelector('.chip[data-wt].active')?.dataset.wt || 'total';
  const val = parseFloat(wInput?.value);
  if (!val || (activeUnit !== 'kg' && activeUnit !== 'lb')){ area.innerHTML = ''; return; }
  const res = computePlates(val, activeUnit, activeType);
  area.innerHTML = `<div class="small" style="color:var(--slate);">🏋 ${describePlates(res)}</div>`;
}
// Proactive hint shown immediately (before the person types anything), based on
// their last logged weight — "what did I load last time" is the useful question,
// not "here's a breakdown of the number I already lifted and am now recording."
function renderLastTimePlates(overlay, exerciseName, lastEntry){
  const area = overlay.querySelector('#lastTimePlatesArea');
  if (!area) return;
  if (!lastEntry || !exerciseUsesLoadPlates(exerciseName) ||
      lastEntry.weight === null || (lastEntry.weight_unit !== 'kg' && lastEntry.weight_unit !== 'lb')){
    area.innerHTML = ''; return;
  }
  const res = computePlates(lastEntry.weight, lastEntry.weight_unit, lastEntry.weight_type || 'total');
  area.innerHTML = `<div class="small" style="color:var(--slate); margin-top:4px;">🏋 Last time (${lastEntry.weight}${lastEntry.weight_unit}): ${describePlates(res)}</div>`;
}

function openLogForm(exerciseId, exerciseName){
  removeSideIndex();
  let unit = 'kg';
  let weightType = 'total';
  let lastEntry = null;

  // Prev/next navigation only makes sense if this exercise is part of today's
  // currently-displayed Track order (won't apply if opened from the picker/
  // suggestions/search, where there's no natural "list" to page through).
  const flatOrder = state.trackFlatOrder || [];
  const navIdx = flatOrder.findIndex(e => e.id === exerciseId);
  const navPrev = navIdx > 0 ? flatOrder[navIdx - 1] : null;
  const navNext = (navIdx !== -1 && navIdx < flatOrder.length - 1) ? flatOrder[navIdx + 1] : null;

  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header" style="justify-content:space-between;">
      <div style="display:flex; align-items:center; gap:8px;">
        <button id="prevExerciseBtn" style="font-size:20px; ${navPrev ? '' : 'visibility:hidden;'}">‹</button>
        <button id="closeLog">✕</button>
      </div>
      <h1 style="flex:1; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0 6px;">${exerciseName}</h1>
      <button id="nextExerciseBtn" style="font-size:20px; ${navNext ? '' : 'visibility:hidden;'}">›</button>
    </div>
    <div class="overlay-scroll">
      <div id="guideArea" style="margin-bottom:18px;"></div>
      <div id="sameAsLastArea" style="margin-bottom:18px;"></div>
      <div id="lastTimePlatesArea" style="padding:0 18px; margin-top:-14px; margin-bottom:14px;"></div>
      <div style="height:1px; background:var(--line); margin:0 18px 18px 18px;"></div>
      <div class="field-label">Weight or Time <span class="opt">(optional)</span></div>
      <div class="field-card">
        <input class="field-input" id="weightInput" type="number" inputmode="decimal" placeholder="0">
        <div class="unit-toggle">
          <button class="active" data-u="kg">kg</button><button data-u="lb">lb</button><button data-u="sec">sec</button><button data-u="pin">pin</button>
        </div>
      </div>
      <div id="plateCalcArea" style="padding:0 18px; margin-top:-6px; margin-bottom:6px;"></div>
      <div class="field-label">Per Side or Total?</div>
      <div class="chip-row">
        <div class="chip active" data-wt="total">Total</div>
        <div class="chip" data-wt="per">Per Side</div>
      </div>
      <div class="field-label">Sets <span class="opt">(optional)</span></div>
      <div class="field-card"><input class="field-input" id="setsInput" type="number" inputmode="numeric" placeholder="—"></div>
      <div class="field-label">Reps <span class="opt">(optional)</span></div>
      <div class="field-card"><input class="field-input" id="repsInput" type="number" inputmode="numeric" placeholder="—"></div>
      <div class="field-label">Notes <span class="opt">(optional)</span></div>
      <div class="field-card"><input class="field-input" id="notesInput" type="text" placeholder="Anything worth remembering" style="font-size:14px; font-weight:400;"></div>
      <button class="save-btn" id="saveSetBtn">Save Set</button>
      <div class="section-label">History</div>
      <div id="chartArea"></div>
      <div id="historyList"><div class="empty-state" style="padding:20px;">Loading…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeLog').onclick = () => {
    overlay.remove();
    if (state.currentTab === 'track') renderTrack();
  };
  if (navPrev) overlay.querySelector('#prevExerciseBtn').onclick = () => { overlay.remove(); openLogForm(navPrev.id, navPrev.name); };
  if (navNext) overlay.querySelector('#nextExerciseBtn').onclick = () => { overlay.remove(); openLogForm(navNext.id, navNext.name); };

  // Swipe left/right to page through exercises, same direction convention as the arrows.
  let touchStartX = null;
  overlay.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 70) return; // require a deliberate swipe, not an incidental scroll drag
    if (dx < 0 && navNext){ overlay.remove(); openLogForm(navNext.id, navNext.name); }
    else if (dx > 0 && navPrev){ overlay.remove(); openLogForm(navPrev.id, navPrev.name); }
  }, { passive: true });

  overlay.querySelector('#weightInput').addEventListener('input', () => renderPlateCalc(overlay, exerciseName));
  overlay.querySelectorAll('.unit-toggle button').forEach(b => {
    b.onclick = () => { overlay.querySelectorAll('.unit-toggle button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); unit = b.dataset.u; renderPlateCalc(overlay, exerciseName); };
  });
  overlay.querySelectorAll('.chip[data-wt]').forEach(b => {
    b.onclick = () => { overlay.querySelectorAll('.chip[data-wt]').forEach(x=>x.classList.remove('active')); b.classList.add('active'); weightType = b.dataset.wt; renderPlateCalc(overlay, exerciseName); };
  });


  async function saveEntry(weight, unit, weightType, reps, numSets, notes){
    const { data: userData } = await supabaseClient.auth.getUser();
    // Capture prior best BEFORE inserting, for PR detection (weight-based only).
    let priorBest = null;
    if (weight !== null && (unit === 'kg' || unit === 'lb')){
      const prevSets = await supabaseClient.from('sets')
        .select('weight, weight_unit')
        .eq('exercise_id', exerciseId)
        .in('weight_unit', ['kg','lb']);
      if (prevSets.data && prevSets.data.length){
        priorBest = Math.max(...prevSets.data.map(s => convertWeight(s.weight, s.weight_unit, unit)));
      }
    }
    const { data, error } = await supabaseClient.from('sets').insert({
      user_id: userData.user.id, exercise_id: exerciseId,
      weight, weight_unit: weight !== null ? unit : 'bodyweight',
      weight_type: weightType,
      num_sets: numSets, reps: reps,
      notes: notes || null,
      logged_at: todayStr()
    }).select();
    if (error){ alert(error.message); return null; }
    // Celebrate a new PR: strictly greater than the prior best, and there must be a prior best.
    if (priorBest !== null && weight > priorBest + 0.01){
      celebratePR(exerciseName, weight, unit, priorBest);
    }
    return data && data[0] ? data[0].id : null;
  }

  async function applySameAsLast(){
    if (!lastEntry) return;
    const insertedId = await saveEntry(
      lastEntry.weight, lastEntry.weight_unit, lastEntry.weight_type || 'total',
      lastEntry.reps || null, lastEntry.num_sets || null, null
    );
    if (insertedId){
      overlay.remove();
      if (state.currentTab === 'track') renderTrack();
      showUndoLastLogToast(insertedId);
    }
  }

  async function loadHistory(){
    const result = await withTimeout(
      supabaseClient.from('sets').select('id, weight, weight_unit, weight_type, reps, num_sets, notes, logged_at')
        .eq('exercise_id', exerciseId).order('logged_at', { ascending: false }).limit(30),
      15000
    );
    const list = overlay.querySelector('#historyList');
    if (result.__timeout || result.error){ list.innerHTML = '<div class="empty-state" style="padding:20px;">Could not load history.</div>'; return; }
    const sets = result.data || [];
    if (sets.length === 0){
      list.innerHTML = '<div class="empty-state" style="padding:20px;">No history yet — this will be your first entry.</div>';
      return;
    }
    lastEntry = sets[0];
    // Default the unit toggle to match the last logged unit
    if (lastEntry.weight_unit && ['kg','lb','sec','pin'].includes(lastEntry.weight_unit)){
      unit = lastEntry.weight_unit;
      overlay.querySelectorAll('.unit-toggle button').forEach(b => b.classList.toggle('active', b.dataset.u === unit));
    }
    // Default per/total to match too
    if (lastEntry.weight_type){
      weightType = lastEntry.weight_type;
      overlay.querySelectorAll('.chip[data-wt]').forEach(b => b.classList.toggle('active', b.dataset.wt === weightType));
    }
    overlay.querySelector('#sameAsLastArea').innerHTML =
      `<div class="action-row" id="sameAsLastBtn"><div class="ex-name" style="color:var(--flame); font-size:13px;">↻ Same as last time — ${formatSetValue(lastEntry)}</div></div>`;
    overlay.querySelector('#sameAsLastBtn').onclick = applySameAsLast;
    renderLastTimePlates(overlay, exerciseName, lastEntry);

    // Chart in one standard unit so mixed kg/lb entries plot coherently:
    // lb for Plate-Loaded (most common there), kg for everything else.
    const exResult = await withTimeout(
      supabaseClient.from('exercises').select('category').eq('id', exerciseId).maybeSingle(),
      15000
    );
    const category = (exResult.__timeout || exResult.error || !exResult.data) ? '' : exResult.data.category;
    const chartUnit = category === 'Plate-Loaded' ? 'lb' : 'kg';

    const chartable = sets
      .filter(s => s.weight !== null && (s.weight_unit === 'kg' || s.weight_unit === 'lb'))
      .map(s => ({ ...s, chartWeight: convertWeight(s.weight, s.weight_unit, chartUnit) }))
      .reverse();
    let chartHtml = '';
    if (chartable.length >= 2){
      const weights = chartable.map(s => s.chartWeight);
      const dataMin = Math.min(...weights), dataMax = Math.max(...weights);
      // Pad the y-range a little so the line isn't glued to the top/bottom edges.
      const span = (dataMax - dataMin) || 1;
      const yMin = Math.max(0, dataMin - span * 0.15);
      const yMax = dataMax + span * 0.15;
      const yRange = (yMax - yMin) || 1;

      // Plot area with real margins for the axes.
      const W = 320, H = 150;
      const mL = 34, mR = 10, mT = 12, mB = 22;
      const plotW = W - mL - mR, plotH = H - mT - mB;
      const fmt = (v) => (Math.round(v * 10) / 10).toString();

      const xAt = (i) => mL + (chartable.length === 1 ? plotW / 2 : (i / (chartable.length - 1)) * plotW);
      const yAt = (w) => mT + plotH - ((w - yMin) / yRange) * plotH;

      // Y gridlines + labels (3 rows: min, mid, max of the padded range).
      const yTicks = [yMin, (yMin + yMax) / 2, yMax];
      const gridLines = yTicks.map(t => {
        const y = yAt(t);
        return `<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W - mR}" y2="${y.toFixed(1)}" stroke="#2B2C2E" stroke-width="1"/>
                <text x="${mL - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-family="monospace" font-size="9" fill="#8C8E94">${fmt(t)}</text>`;
      }).join('');

      // X date labels: first, middle, last (short form).
      const shortDate = (d) => { const p = d.split('-'); return `${p[2]}/${p[1]}`; };
      const xIdx = chartable.length <= 2 ? [0, chartable.length - 1] : [0, Math.floor((chartable.length - 1) / 2), chartable.length - 1];
      const xLabels = xIdx.map(i => {
        const x = xAt(i);
        return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-family="monospace" font-size="9" fill="#8C8E94">${shortDate(chartable[i].logged_at)}</text>`;
      }).join('');

      const linePts = chartable.map((s, i) => `${xAt(i).toFixed(1)},${yAt(s.chartWeight).toFixed(1)}`).join(' ');
      // Area fill polygon (line + down to baseline).
      const areaPts = `${mL},${(mT + plotH).toFixed(1)} ${linePts} ${(W - mR)},${(mT + plotH).toFixed(1)}`;
      const dots = chartable.map((s, i) => {
        const isLast = i === chartable.length - 1;
        return `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(s.chartWeight).toFixed(1)}" r="${isLast ? 4 : 2.8}" fill="${isLast ? '#FF6B1A' : '#EDEAE2'}" stroke="#1C1D1F" stroke-width="1.5"/>`;
      }).join('');

      chartHtml = `<div class="stat-card" style="margin:0 18px 16px 18px;">
        <div style="display:flex; justify-content:space-between; font-family:'JetBrains Mono', monospace; font-size:10px; color:var(--slate); margin-bottom:6px;">
          <span>Weight (${chartUnit})</span>
          <span>latest ${fmt(chartable[chartable.length-1].chartWeight)}${chartUnit}</span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto">
          <defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#FF6B1A" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="#FF6B1A" stop-opacity="0"/>
          </linearGradient></defs>
          ${gridLines}
          <polygon points="${areaPts}" fill="url(#areaFill)"/>
          <polyline points="${linePts}" fill="none" stroke="#FF6B1A" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
          ${dots}
          ${xLabels}
        </svg>
      </div>`;
    }
    overlay.querySelector('#chartArea').innerHTML = chartHtml;

    list.innerHTML = sets.map(s =>
      `<div class="log-row" data-id="${s.id}" style="flex-direction:column; align-items:flex-start; gap:3px;">
        <div style="display:flex; justify-content:space-between; width:100%;"><div class="log-date">${s.logged_at}</div><div class="log-weight">${formatSetValue(s, true)}</div></div>
        ${s.notes ? `<div style="font-size:11px; color:var(--slate); font-style:italic;">${s.notes}</div>` : ''}
      </div>`
    ).join('');
    list.querySelectorAll('.log-row[data-id]').forEach(row => {
      let pressTimer = null;
      const start = () => { pressTimer = setTimeout(() => confirmDeleteLog(row.dataset.id, loadHistory), 550); };
      const cancel = () => clearTimeout(pressTimer);
      row.addEventListener('pointerdown', start);
      row.addEventListener('pointerup', cancel);
      row.addEventListener('pointerleave', cancel);
      row.addEventListener('pointercancel', cancel);
    });
  }
  loadHistory();
  loadExerciseGuide(overlay, exerciseName);

  overlay.querySelector('#saveSetBtn').onclick = async () => {
    const weightRaw = document.getElementById('weightInput').value;
    const setsVal = document.getElementById('setsInput').value;
    const repsVal = document.getElementById('repsInput').value;
    const notesVal = document.getElementById('notesInput').value.trim();
    if (!weightRaw && !setsVal && !repsVal){ alert('Enter at least one value — weight, time, sets, or reps.'); return; }
    const weight = weightRaw ? parseFloat(weightRaw) : null;
    const insertedId = await saveEntry(weight, unit, weightType, repsVal ? parseInt(repsVal,10) : null, setsVal ? parseInt(setsVal,10) : null, notesVal);
    if (insertedId){
      overlay.remove();
      if (state.currentTab === 'track') renderTrack();
    }
  };
}

// ---------- REST TIMER (standalone, manual) ----------
let _timerState = { interval:null, remaining:0, total:0, running:false };

const TIMER_SOUNDS = {
  chime:  { label:'Chime',  freq:880, type:'sine',     pattern:[[880,0.15],[1320,0.3]] },
  buzzer: { label:'Buzzer', freq:220, type:'sawtooth', pattern:[[220,0.25],[220,0.25]] },
  beep:   { label:'Beep',   freq:1000,type:'square',   pattern:[[1000,0.12],[1000,0.12],[1000,0.12]] },
  mute:   { label:'Mute',   pattern:[] }
};

function getTimerSound(){ return localStorage.getItem('zealift_timer_sound') || 'chime'; }
function setTimerSound(k){ localStorage.setItem('zealift_timer_sound', k); }
function getTimerDefault(){ return parseInt(localStorage.getItem('zealift_timer_default') || '90', 10); }
function setTimerDefault(s){ localStorage.setItem('zealift_timer_default', String(s)); }

// Encodes a mono Float32 PCM buffer into a WAV Blob (16-bit PCM).
function pcmToWavBlob(samples, sampleRate){
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => { for (let i=0;i<str.length;i++) view.setUint8(offset+i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + samples.length*2, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate*2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, samples.length*2, true);
  let off = 44;
  for (let i=0;i<samples.length;i++, off+=2){
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s*0x8000 : s*0x7FFF, true);
  }
  return new Blob([buffer], { type:'audio/wav' });
}

let _timerBlobCache = {};
async function renderTimerSoundBlob(key){
  if (_timerBlobCache[key]) return _timerBlobCache[key];
  const snd = TIMER_SOUNDS[key];
  if (!snd || !snd.pattern.length) return null;
  const sampleRate = 44100;
  const totalDur = snd.pattern.reduce((sum,[,dur]) => sum + dur + 0.06, 0) + 0.05;
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OfflineCtx(1, Math.ceil(sampleRate*totalDur), sampleRate);
  let t = 0;
  snd.pattern.forEach(([freq, dur]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = snd.type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t+0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    o.start(t); o.stop(t+dur+0.02);
    t += dur + 0.06;
  });
  const rendered = await ctx.startRendering();
  const blob = pcmToWavBlob(rendered.getChannelData(0), sampleRate);
  const url = URL.createObjectURL(blob);
  _timerBlobCache[key] = url;
  return url;
}

let _timerAlertEl = null;
async function playTimerSound(){
  const key = getTimerSound();
  if (navigator.vibrate && key !== 'mute') navigator.vibrate([200,100,200]);
  if (key === 'mute') return;
  try {
    const url = await renderTimerSoundBlob(key);
    if (!url) return;
    // A real <audio> element, not a live AudioContext oscillator - documented to be
    // far less likely to interrupt/duck background music or other apps' audio on iOS,
    // since Web Audio API playback and <audio>/<video> element playback are treated
    // differently by the OS audio session. Not a guaranteed fix (Apple doesn't expose
    // a real "mix with others" flag to web content), but the best-known mitigation.
    if (!_timerAlertEl){ _timerAlertEl = new Audio(); }
    _timerAlertEl.src = url;
    _timerAlertEl.play().catch(() => {});
  } catch(e){}
}

function openTimer(){
  if (_timerState.interval){ clearInterval(_timerState.interval); _timerState.interval = null; }
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.id = 'timerOverlay';
  const presets = [30,60,90,120,180,300];
  overlay.innerHTML = `
    <div class="form-header"><button id="closeTimer">✕</button><h1>Timer</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" style="display:flex; flex-direction:column; align-items:center;">
      <div id="timerDisplay" style="font-family:'JetBrains Mono',monospace; font-size:84px; font-weight:600; margin:24px 0 8px 0; letter-spacing:1px;">0:00</div>
      <div id="timerRing" style="width:230px; height:6px; background:var(--panel); border-radius:6px; overflow:hidden; margin-bottom:26px;">
        <div id="timerRingFill" style="height:100%; width:0%; background:#FF6B1A; transition:width 0.3s linear;"></div>
      </div>

      <div style="display:flex; gap:10px; margin-bottom:24px;">
        <button id="timerStartPause" style="background:#FF6B1A; color:var(--ink); font-weight:600; border-radius:12px; padding:14px 30px; font-size:15px; font-family:'Oswald',sans-serif; text-transform:uppercase; letter-spacing:1px;">Start</button>
        <button id="timerReset" style="background:var(--panel); color:var(--chalk); border-radius:12px; padding:14px 20px; font-size:14px;">Reset</button>
      </div>

      <div class="field-label" style="align-self:flex-start;">Presets</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; padding:0 18px 18px 18px; width:100%;">
        ${presets.map(p => `<button class="timer-preset" data-sec="${p}" style="background:var(--panel); color:var(--chalk); border-radius:20px; padding:9px 16px; font-size:13px; font-family:'JetBrains Mono',monospace;">${Math.floor(p/60)?Math.floor(p/60)+'m':''}${p%60?(p%60)+'s':''}</button>`).join('')}
      </div>

      <div class="field-label" style="align-self:flex-start;">Custom</div>
      <div style="display:flex; align-items:center; gap:8px; padding:0 18px 18px 18px; width:100%;">
        <input id="timerMin" type="number" inputmode="numeric" min="0" max="59" placeholder="min" class="field-input" style="text-align:center; background:var(--panel); border-radius:10px; padding:12px;">
        <span style="color:var(--slate); font-size:20px;">:</span>
        <input id="timerSec" type="number" inputmode="numeric" min="0" max="59" placeholder="sec" class="field-input" style="text-align:center; background:var(--panel); border-radius:10px; padding:12px;">
        <button id="timerSetCustom" style="background:var(--ink); color:var(--chalk); border-radius:10px; padding:12px 16px; font-size:13px;">Set</button>
      </div>

      <div class="field-label" style="align-self:flex-start;">Alert Sound</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; padding:0 18px 24px 18px; width:100%;">
        ${Object.entries(TIMER_SOUNDS).map(([k,v]) => `<button class="timer-sound" data-snd="${k}" style="border-radius:20px; padding:9px 16px; font-size:13px;">${v.label}</button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  _timerState.total = _timerState.total || getTimerDefault();
  _timerState.remaining = _timerState.total;
  _timerState.running = false;

  const disp = overlay.querySelector('#timerDisplay');
  const fill = overlay.querySelector('#timerRingFill');
  const startPauseBtn = overlay.querySelector('#timerStartPause');

  const paint = () => {
    const r = Math.max(0, _timerState.remaining);
    const m = Math.floor(r/60), s = r%60;
    disp.textContent = `${m}:${s.toString().padStart(2,'0')}`;
    disp.style.color = r<=0 ? '#8FBF7A' : 'var(--chalk)';
    const pct = _timerState.total>0 ? ((_timerState.total - r)/_timerState.total)*100 : 0;
    fill.style.width = `${Math.min(100,pct)}%`;
    startPauseBtn.textContent = _timerState.running ? 'Pause' : (r<=0 ? 'Start' : (r<_timerState.total ? 'Resume' : 'Start'));
  };

  const tick = () => {
    _timerState.interval = setInterval(() => {
      _timerState.remaining--;
      paint();
      if (_timerState.remaining <= 0){
        clearInterval(_timerState.interval); _timerState.interval = null;
        _timerState.running = false;
        playTimerSound();
        paint();
      }
    }, 1000);
  };

  const setTime = (sec) => {
    if (_timerState.interval){ clearInterval(_timerState.interval); _timerState.interval = null; }
    _timerState.total = sec; _timerState.remaining = sec; _timerState.running = false;
    setTimerDefault(sec);
    paint();
  };

  startPauseBtn.onclick = () => {
    if (_timerState.running){
      clearInterval(_timerState.interval); _timerState.interval = null;
      _timerState.running = false; paint();
    } else {
      if (_timerState.remaining <= 0){ _timerState.remaining = _timerState.total; }
      if (_timerState.remaining <= 0) return;
      _timerState.running = true; tick(); paint();
    }
  };
  overlay.querySelector('#timerReset').onclick = () => {
    if (_timerState.interval){ clearInterval(_timerState.interval); _timerState.interval = null; }
    _timerState.remaining = _timerState.total; _timerState.running = false; paint();
  };
  overlay.querySelector('#closeTimer').onclick = () => {
    // Keep the timer running in the background if active; just close the panel.
    overlay.remove();
  };
  overlay.querySelectorAll('.timer-preset').forEach(b => {
    b.onclick = () => setTime(parseInt(b.dataset.sec,10));
  });
  overlay.querySelector('#timerSetCustom').onclick = () => {
    const m = parseInt(overlay.querySelector('#timerMin').value || '0', 10);
    const s = parseInt(overlay.querySelector('#timerSec').value || '0', 10);
    const total = m*60 + s;
    if (total > 0) setTime(total);
  };

  const paintSoundBtns = () => {
    const cur = getTimerSound();
    overlay.querySelectorAll('.timer-sound').forEach(b => {
      const active = b.dataset.snd === cur;
      b.style.background = active ? 'rgba(255,107,26,0.16)' : 'var(--panel)';
      b.style.color = active ? '#FF6B1A' : 'var(--chalk)';
    });
  };
  overlay.querySelectorAll('.timer-sound').forEach(b => {
    b.onclick = () => { setTimerSound(b.dataset.snd); paintSoundBtns(); if (b.dataset.snd !== 'mute') playTimerSound(); };
  });
  paintSoundBtns();
  paint();
}

// ---------- SCALE ----------
async function loadBodyWeight(){
  const result = await withTimeout(
    supabaseClient.from('body_weight').select('id, weight, unit, logged_at, notes').order('logged_at', { ascending: false }).limit(20),
    15000
  );
  return result.__timeout || result.error ? [] : (result.data || []);
}

async function renderScale(){
  app.innerHTML = `<div class="app-shell"><div class="login-wrap"><div class="login-sub">Loading your weigh-ins…</div></div></div>`;
  const entries = await loadBodyWeight();
  const latest = entries[0];
  const prev = entries[1];
  let deltaHtml = '';
  if (latest && prev){
    const diff = (latest.weight - prev.weight).toFixed(1);
    const arrow = diff > 0 ? '↑' : (diff < 0 ? '↓' : '→');
    deltaHtml = `<div class="delta">${arrow} ${Math.abs(diff)}${latest.unit} since last entry</div>`;
  }
  const rows = entries.map(e => `<div class="log-row" data-id="${e.id}" style="flex-direction:column; align-items:flex-start; gap:3px;">
    <div style="display:flex; justify-content:space-between; width:100%;"><div class="log-date">${e.logged_at}</div><div class="log-weight">${e.weight}${e.unit}</div></div>
    ${e.notes ? `<div style="font-size:11px; color:var(--slate); font-style:italic;">${e.notes}</div>` : ''}
  </div>`).join('');

  let chartHtml = '';
  if (entries.length >= 2){
    const chrono = [...entries].reverse(); // oldest first for left-to-right chart
    const chartUnit = chrono[chrono.length - 1].unit === 'lb' ? 'lb' : 'kg';
    const weights = chrono.map(e => convertWeight(e.weight, e.unit, chartUnit));
    const dataMin = Math.min(...weights), dataMax = Math.max(...weights);
    const spanW = (dataMax - dataMin) || 1;
    const yMin = Math.max(0, dataMin - spanW * 0.15);
    const yMax = dataMax + spanW * 0.15;
    const yRange = (yMax - yMin) || 1;
    const W = 320, H = 150, mL = 34, mR = 10, mT = 12, mB = 22;
    const plotW = W - mL - mR, plotH = H - mT - mB;
    const fmt = (v) => (Math.round(v * 10) / 10).toString();
    const xAt = (i) => mL + (chrono.length === 1 ? plotW / 2 : (i / (chrono.length - 1)) * plotW);
    const yAt = (w) => mT + plotH - ((w - yMin) / yRange) * plotH;

    const yTicks = [yMin, (yMin + yMax) / 2, yMax];
    const gridLines = yTicks.map(t => {
      const y = yAt(t);
      return `<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W - mR}" y2="${y.toFixed(1)}" stroke="#2B2C2E" stroke-width="1"/>
              <text x="${mL - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-family="monospace" font-size="9" fill="#8C8E94">${fmt(t)}</text>`;
    }).join('');

    const shortDate = (d) => { const p = d.split('-'); return `${p[2]}/${p[1]}`; };
    const xIdx = chrono.length <= 2 ? [0, chrono.length - 1] : [0, Math.floor((chrono.length - 1) / 2), chrono.length - 1];
    const xLabels = xIdx.map(i => `<text x="${xAt(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-family="monospace" font-size="9" fill="#8C8E94">${shortDate(chrono[i].logged_at)}</text>`).join('');

    const linePts = chrono.map((e, i) => `${xAt(i).toFixed(1)},${yAt(convertWeight(e.weight, e.unit, chartUnit)).toFixed(1)}`).join(' ');
    const areaPts = `${mL},${(mT + plotH).toFixed(1)} ${linePts} ${(W - mR)},${(mT + plotH).toFixed(1)}`;
    const dots = chrono.map((e, i) => {
      const isLast = i === chrono.length - 1;
      return `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(convertWeight(e.weight, e.unit, chartUnit)).toFixed(1)}" r="${isLast ? 4 : 2.8}" fill="${isLast ? '#FF6B1A' : '#EDEAE2'}" stroke="#1C1D1F" stroke-width="1.5"/>`;
    }).join('');

    chartHtml = `<div class="stat-card">
      <div style="display:flex; justify-content:space-between; font-family:'JetBrains Mono', monospace; font-size:10px; color:var(--slate); margin-bottom:6px;">
        <span>Body weight (${chartUnit})</span>
        <span>latest ${fmt(convertWeight(chrono[chrono.length-1].weight, chrono[chrono.length-1].unit, chartUnit))}${chartUnit}</span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto">
        <defs><linearGradient id="scaleAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FF6B1A" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#FF6B1A" stop-opacity="0"/>
        </linearGradient></defs>
        ${gridLines}
        <polygon points="${areaPts}" fill="url(#scaleAreaFill)"/>
        <polyline points="${linePts}" fill="none" stroke="#FF6B1A" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
        ${xLabels}
      </svg>
    </div>`;
  }

  const phase = await loadPhase();
  const activePhase = phase ? determineActivePhase(phase) : null;
  let bulkHtml, cutHtml;
  if (phase && phase.bulk_start && phase.bulk_end){
    const isActive = activePhase === 'bulk';
    const w = weeksBetween(phase.bulk_start, phase.bulk_end);
    bulkHtml = `<div class="phase-card ${isActive ? 'active' : 'upcoming'}">
      <div class="top-row"><div class="name">Bulk</div><div class="status">${isActive ? 'ACTIVE' : 'SET'}</div></div>
      <div class="dates">${phase.bulk_start} → ${phase.bulk_end}</div>
      ${isActive && w ? `<div class="progress-track"><div class="progress-fill" style="width:${w.pct}%;"></div></div><div class="progress-labels"><span>Week ${w.elapsedWeeks} of ${w.totalWeeks}</span><span>${w.pct}%</span></div>` : ''}
    </div>`;
  } else {
    bulkHtml = `<div class="phase-card upcoming"><div class="top-row"><div class="name">Bulk</div><div class="status">NOT SET</div></div></div>`;
  }
  if (phase && phase.cut_start && phase.cut_end){
    const isActive = activePhase === 'cut';
    const w = weeksBetween(phase.cut_start, phase.cut_end);
    cutHtml = `<div class="phase-card ${isActive ? 'active' : 'upcoming'}">
      <div class="top-row"><div class="name">Cut</div><div class="status">${isActive ? 'ACTIVE' : 'SET'}</div></div>
      <div class="dates">${phase.cut_start} → ${phase.cut_end}</div>
      ${isActive && w ? `<div class="progress-track"><div class="progress-fill" style="width:${w.pct}%;"></div></div><div class="progress-labels"><span>Week ${w.elapsedWeeks} of ${w.totalWeeks}</span><span>${w.pct}%</span></div>` : ''}
    </div>`;
  } else {
    cutHtml = `<div class="phase-card upcoming"><div class="top-row"><div class="name">Cut</div><div class="status">NOT SET</div></div></div>`;
  }

  app.innerHTML = `
    <div class="app-shell">
      <div class="scroll-area">
        <div class="brandbar"><img src="icons/icon-inapp-32.png" alt=""><div class="name">ZEALIFT</div><button class="brandbar-timer" onclick="openTimer()" aria-label="Timer" style="margin-left:auto; background:none; color:var(--slate); padding:6px; display:flex; align-items:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M9 2h6"/></svg></button></div>
        <div class="header"><div class="eyebrow">BODY</div><h1>Scale</h1></div>
        <div class="stat-card">
          ${latest ? `<div class="big">${latest.weight}${latest.unit}</div><div class="small">${latest.logged_at}</div>${deltaHtml}` : `<div class="small">No entries yet — tap + to log your weight.</div>`}
        </div>
        ${chartHtml}
        <div class="section-label">Recent Entries</div>
        ${rows || '<div class="empty-state">Nothing logged yet.</div>'}
        <div class="section-label">Phase</div>
        <div class="section-label" style="padding-top:0; font-size:13px; color:var(--slate);">Bulk</div>
        ${bulkHtml}
        <div class="section-label" style="font-size:13px; color:var(--slate);">Cut</div>
        ${cutHtml}
        <div style="padding:0 18px; margin-top:16px;"><a class="edit-link" id="editPhaseLink">Edit dates</a></div>
      </div>
      ${renderTabbar()}
    </div>`;
  attachShellHandlers();
  const editPhaseLink = document.getElementById('editPhaseLink');
  if (editPhaseLink) editPhaseLink.onclick = () => openEditPhaseForm(phase);
  document.querySelectorAll('.scroll-area .log-row[data-id]').forEach(row => {
    let pressTimer = null;
    const start = () => { pressTimer = setTimeout(() => confirmDeleteBodyWeight(row.dataset.id), 550); };
    const cancel = () => clearTimeout(pressTimer);
    row.addEventListener('pointerdown', start);
    row.addEventListener('pointerup', cancel);
    row.addEventListener('pointerleave', cancel);
    row.addEventListener('pointercancel', cancel);
  });
}

function confirmDeleteBodyWeight(entryId){
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:25; display:flex; align-items:center; justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--panel); border-radius:16px; padding:22px; width:280px; text-align:center;">
      <div style="font-family:'Oswald', sans-serif; font-size:16px; margin-bottom:8px;">Delete Weigh-In?</div>
      <div style="font-size:13px; color:var(--slate); margin-bottom:18px;">This removes the entry permanently. There's no undo.</div>
      <div style="display:flex; gap:10px;">
        <button id="cancelBW" style="flex:1; padding:11px; border-radius:10px; background:var(--ink); color:var(--chalk); font-size:13px;">Cancel</button>
        <button id="confirmBW" style="flex:1; padding:11px; border-radius:10px; background:var(--flame); color:var(--ink); font-weight:600; font-size:13px;">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cancelBW').onclick = () => overlay.remove();
  overlay.querySelector('#confirmBW').onclick = async () => {
    overlay.remove();
    await supabaseClient.from('body_weight').delete().eq('id', entryId);
    renderScale();
  };
}

function openLogWeightForm(){
  let unit = 'kg';
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeW">✕</button><h1>Log Weight</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label">Weight</div>
      <div class="field-card">
        <input class="field-input" id="bwInput" type="number" inputmode="decimal" placeholder="0">
        <div class="unit-toggle"><button class="active" data-u="kg">kg</button><button data-u="lb">lb</button></div>
      </div>
      <div class="field-label">Notes (optional)</div>
      <div class="field-card"><input class="field-input" id="bwNotes" type="text" placeholder="Anything worth remembering"></div>
      <button class="save-btn" id="saveWBtn">Save Weight</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeW').onclick = () => overlay.remove();
  overlay.querySelectorAll('.unit-toggle button').forEach(b => {
    b.onclick = () => { overlay.querySelectorAll('.unit-toggle button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); unit = b.dataset.u; };
  });
  overlay.querySelector('#saveWBtn').onclick = async () => {
    const weight = parseFloat(document.getElementById('bwInput').value);
    if (!weight){ alert('Enter a weight.'); return; }
    const notes = document.getElementById('bwNotes').value.trim();
    const { data: userData } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('body_weight').insert({
      user_id: userData.user.id, weight, unit, logged_at: todayStr(), notes: notes || null
    });
    if (error){ alert(error.message); return; }
    overlay.remove();
    renderScale();
  };
}

// ---------- PHASE ----------
async function loadPhase(){
  const { data: userData } = await supabaseClient.auth.getUser();
  if (!userData || !userData.user) return null;
  const result = await withTimeout(
    supabaseClient.from('phase_settings').select('*').eq('user_id', userData.user.id).maybeSingle(),
    15000
  );
  if (result.__timeout || result.error || !result.data) return null;
  return result.data;
}

function weeksBetween(startStr, endStr){
  if (!startStr || !endStr) return null;
  const start = new Date(startStr), end = new Date(endStr), now = new Date();
  const totalDays = Math.max(1, Math.round((end - start) / 86400000));
  const totalWeeks = Math.max(1, Math.round(totalDays / 7));
  const daysElapsed = Math.max(0, Math.min(totalDays, Math.floor((now - start) / 86400000)));
  const elapsedWeeks = Math.min(totalWeeks, Math.floor(daysElapsed / 7) + 1);
  const pct = Math.round((daysElapsed / totalDays) * 100);
  return { totalWeeks, elapsedWeeks, pct };
}

// Determines which phase is actually active by checking today's real date against
// the stored ranges, rather than trusting a static field that never re-evaluates.
function determineActivePhase(phase){
  const today = todayStr();
  const inRange = (start, end) => start && end && today >= start && today <= end;
  if (inRange(phase.bulk_start, phase.bulk_end)) return 'bulk';
  if (inRange(phase.cut_start, phase.cut_end)) return 'cut';
  return phase.current_phase || null; // today falls in neither range - fall back to the stored value
}

async function renderPhase(){
  app.innerHTML = `<div class="app-shell"><div class="login-wrap"><div class="login-sub">Loading your phase…</div></div></div>`;
  const phase = await loadPhase();
  const activePhase = phase ? determineActivePhase(phase) : null;

  let bulkHtml, cutHtml;
  if (phase && phase.bulk_start && phase.bulk_end){
    const isActive = activePhase === 'bulk';
    const w = weeksBetween(phase.bulk_start, phase.bulk_end);
    bulkHtml = `<div class="phase-card ${isActive ? 'active' : 'upcoming'}">
      <div class="top-row"><div class="name">Bulk</div><div class="status">${isActive ? 'ACTIVE' : 'SET'}</div></div>
      <div class="dates">${phase.bulk_start} → ${phase.bulk_end}</div>
      ${isActive && w ? `<div class="progress-track"><div class="progress-fill" style="width:${w.pct}%;"></div></div><div class="progress-labels"><span>Week ${w.elapsedWeeks} of ${w.totalWeeks}</span><span>${w.pct}%</span></div>` : ''}
    </div>`;
  } else {
    bulkHtml = `<div class="phase-card upcoming"><div class="top-row"><div class="name">Bulk</div><div class="status">NOT SET</div></div></div>`;
  }
  if (phase && phase.cut_start && phase.cut_end){
    const isActive = activePhase === 'cut';
    const w = weeksBetween(phase.cut_start, phase.cut_end);
    cutHtml = `<div class="phase-card ${isActive ? 'active' : 'upcoming'}">
      <div class="top-row"><div class="name">Cut</div><div class="status">${isActive ? 'ACTIVE' : 'SET'}</div></div>
      <div class="dates">${phase.cut_start} → ${phase.cut_end}</div>
      ${isActive && w ? `<div class="progress-track"><div class="progress-fill" style="width:${w.pct}%;"></div></div><div class="progress-labels"><span>Week ${w.elapsedWeeks} of ${w.totalWeeks}</span><span>${w.pct}%</span></div>` : ''}
    </div>`;
  } else {
    cutHtml = `<div class="phase-card upcoming"><div class="top-row"><div class="name">Cut</div><div class="status">NOT SET</div></div></div>`;
  }

  app.innerHTML = `
    <div class="app-shell">
      <div class="scroll-area">
        <div class="brandbar"><img src="icons/icon-inapp-32.png" alt=""><div class="name">ZEALIFT</div><button class="brandbar-timer" onclick="openTimer()" aria-label="Timer" style="margin-left:auto; background:none; color:var(--slate); padding:6px; display:flex; align-items:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M9 2h6"/></svg></button></div>
        <div class="header"><div class="eyebrow">BULK / CUT</div><h1>Phase</h1></div>
        <div class="section-label">Bulk</div>
        ${bulkHtml}
        <div class="section-label">Cut</div>
        ${cutHtml}
        <div style="padding:0 18px; margin-top:16px;"><a class="edit-link" id="editPhaseLink">Edit dates</a></div>
      </div>
      ${renderTabbar()}
    </div>`;
  attachShellHandlers();
  document.getElementById('editPhaseLink').onclick = () => openEditPhaseForm(phase);
}

function openEditPhaseForm(existing){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeP">✕</button><h1>Edit Phase Dates</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="form-sub" style="margin-top:0;">Which phase is active is worked out automatically from today's date against these ranges - no need to set it manually.</div>
      <div class="field-label">Bulk Start</div>
      <div class="field-card"><input class="field-input" id="bulkStart" type="date" style="font-size:14px;" value="${existing && existing.bulk_start ? existing.bulk_start : ''}"></div>
      <div class="field-label">Bulk End</div>
      <div class="field-card"><input class="field-input" id="bulkEnd" type="date" style="font-size:14px;" value="${existing && existing.bulk_end ? existing.bulk_end : ''}"></div>
      <div class="field-label">Cut Start</div>
      <div class="field-card"><input class="field-input" id="cutStart" type="date" style="font-size:14px;" value="${existing && existing.cut_start ? existing.cut_start : ''}"></div>
      <div class="field-label">Cut End</div>
      <div class="field-card"><input class="field-input" id="cutEnd" type="date" style="font-size:14px;" value="${existing && existing.cut_end ? existing.cut_end : ''}"></div>
      <button class="save-btn" id="savePBtn">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeP').onclick = () => overlay.remove();
  overlay.querySelector('#savePBtn').onclick = async () => {
    const { data: userData } = await supabaseClient.auth.getUser();
    const payload = {
      user_id: userData.user.id,
      bulk_start: document.getElementById('bulkStart').value || null,
      bulk_end: document.getElementById('bulkEnd').value || null,
      cut_start: document.getElementById('cutStart').value || null,
      cut_end: document.getElementById('cutEnd').value || null
    };
    const { error } = await supabaseClient.from('phase_settings').upsert(payload, { onConflict: 'user_id' });
    if (error){ alert(error.message); return; }
    overlay.remove();
    renderScale();
  };
}

// ---------- BALANCE ----------
// Full 13-group taxonomy matching what matchExercise/free-exercise-db actually returns,
// each mapped to a display label and which body region(s) it should color.
const BALANCE_MUSCLES = [
  'chest','lats','traps','lower back','shoulders','biceps','triceps',
  'forearms','abdominals','quadriceps','hamstrings','glutes','calves'
];
const BALANCE_LABELS = {
  chest:'Chest', lats:'Lats / Back', traps:'Traps', 'lower back':'Lower Back',
  shoulders:'Shoulders', biceps:'Biceps', triceps:'Triceps', forearms:'Forearms',
  abdominals:'Abdominals', quadriceps:'Quadriceps', hamstrings:'Hamstrings',
  glutes:'Glutes', calves:'Calves'
};
// A commonly-cited general guideline (not personalized/clinical) for weekly working
// sets per muscle group for most people building muscle.
const BALANCE_TARGET_MIN = 10, BALANCE_TARGET_MAX = 20;

// Standard Push/Pull/Legs split mapping. Abdominals doesn't cleanly fit a 3-way
// push/pull/legs split, so it's folded into Legs (common in PPL programs that
// run core work on leg day) rather than dropped or forced into an ambiguous bucket.
const PPL_MAP = {
  chest:'push', shoulders:'push', triceps:'push',
  lats:'pull', traps:'pull', biceps:'pull', forearms:'pull', 'lower back':'pull',
  quadriceps:'legs', hamstrings:'legs', glutes:'legs', calves:'legs', abdominals:'legs'
};
const PPL_LABELS = { push:'Push', pull:'Pull', legs:'Legs' };
const PPL_COLORS = { push:'#E8492A', pull:'#3A6EA5', legs:'#8FBF7A' };

function pplTallyFrom(muscleTally){
  const totals = { push:0, pull:0, legs:0 };
  BALANCE_MUSCLES.forEach(m => { totals[PPL_MAP[m]] += (muscleTally[m] || 0); });
  return totals;
}

function pplBarsHtml(pplTally){
  const grand = Object.values(pplTally).reduce((a,b) => a+b, 0);
  return ['push','pull','legs'].map(bucket => {
    const count = pplTally[bucket];
    const pct = grand > 0 ? Math.round((count/grand)*100) : 0;
    const color = PPL_COLORS[bucket];
    // A rough even-thirds guideline (~33% each) - flags a bucket that's clearly
    // dominating or clearly missing relative to the other two.
    let status;
    if (grand === 0) status = { label:'NO DATA', color:'#3A6EA5' };
    else if (pct < 15) status = { label:'LOW SHARE', color:'#3A6EA5' };
    else if (pct > 50) status = { label:'DOMINANT', color:'#E8492A' };
    else status = { label:'BALANCED', color:'#8FBF7A' };
    return `<div class="bal-row">
      <div class="bal-toprow"><div class="bal-name">${PPL_LABELS[bucket]}</div><div class="bal-status" style="background:${status.color}26; color:${status.color};">${status.label}</div></div>
      <div class="bal-bar-track">
        <div class="bal-bar-fill" style="width:${pct}%; background:${color};"><span class="bal-count">${count} (${pct}%)</span></div>
      </div>
    </div>`;
  }).join('');
}

async function tallyLoggedThisWeek(){
  const { data: userData } = await supabaseClient.auth.getUser();
  const since = new Date(Date.now() - 6*86400000).toISOString().slice(0,10);
  const [exResult, setResult, db] = await Promise.all([
    withTimeout(supabaseClient.from('exercises').select('id, name').eq('user_id', userData.user.id), 15000),
    withTimeout(supabaseClient.from('sets').select('exercise_id, num_sets, logged_at').gte('logged_at', since), 15000),
    loadExerciseDB()
  ]);
  const exercises = exResult.__timeout || exResult.error ? [] : (exResult.data || []);
  const sets = setResult.__timeout || setResult.error ? [] : (setResult.data || []);
  const exById = {};
  exercises.forEach(ex => { exById[ex.id] = ex.name; });

  const tally = {};
  BALANCE_MUSCLES.forEach(m => tally[m] = 0);
  sets.forEach(s => {
    const name = exById[s.exercise_id];
    if (!name) return;
    const m = matchExercise(name, db);
    const muscle = m && m.primaryMuscles && m.primaryMuscles[0];
    if (muscle && tally.hasOwnProperty(muscle)) tally[muscle] += (s.num_sets || 1);
  });
  return tally;
}

async function tallyFullPlan(){
  const { data: userData } = await supabaseClient.auth.getUser();
  const [exResult, db] = await Promise.all([
    withTimeout(supabaseClient.from('exercises').select('id, name').eq('user_id', userData.user.id).eq('active', true), 15000),
    loadExerciseDB()
  ]);
  const exercises = exResult.__timeout || exResult.error ? [] : (exResult.data || []);

  const tally = {};
  BALANCE_MUSCLES.forEach(m => tally[m] = 0);
  exercises.forEach(ex => {
    const m = matchExercise(ex.name, db);
    const muscle = m && m.primaryMuscles && m.primaryMuscles[0];
    if (muscle && tally.hasOwnProperty(muscle)) tally[muscle] += 1;
  });
  return tally;
}

function statusForLoggedCount(count){
  if (count === 0) return { label:'NO DATA', color:'#3A6EA5' };
  if (count < BALANCE_TARGET_MIN * 0.4) return { label:'WAY BELOW', color:'#3A6EA5' };
  if (count < BALANCE_TARGET_MIN * 0.75) return { label:'BELOW TARGET', color:'#7BA6C9' };
  if (count < BALANCE_TARGET_MIN) return { label:'LOW-GOOD', color:'#F0C542' };
  if (count <= BALANCE_TARGET_MAX) return { label:'GOOD', color:'#8FBF7A' };
  return { label:'ABOVE TARGET', color:'#E8492A' };
}
function statusForPlanCount(count, maxCount){
  if (count === 0) return { label:'GAP', color:'#3A6EA5' };
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio < 0.25) return { label:'LIGHT', color:'#7BA6C9' };
  if (ratio < 0.75) return { label:'BALANCED', color:'#8FBF7A' };
  return { label:'HEAVY', color:'#E8492A' };
}

function balanceBarsHtml(tally, mode){
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const maxCount = Math.max(1, ...Object.values(tally));
  return BALANCE_MUSCLES.map(muscle => {
    const count = tally[muscle];
    const status = mode === 'logged' ? statusForLoggedCount(count) : statusForPlanCount(count, maxCount);
    const barMax = mode === 'logged' ? Math.max(maxCount, BALANCE_TARGET_MAX * 1.5) : maxCount;
    const widthPct = Math.min(100, Math.round((count / barMax) * 100));
    const targetZoneHtml = mode === 'logged'
      ? `<div class="bal-target-zone" style="left:${Math.round((BALANCE_TARGET_MIN/barMax)*100)}%; width:${Math.round(((BALANCE_TARGET_MAX-BALANCE_TARGET_MIN)/barMax)*100)}%;"></div>`
      : '';
    const suffix = mode === 'logged' ? '' : ' ex';
    return `<div class="bal-row" data-muscle="${cap(muscle)}" style="cursor:pointer;">
      <div class="bal-toprow"><div class="bal-name">${BALANCE_LABELS[muscle]}</div><div class="bal-status" style="background:${status.color}26; color:${status.color};">${status.label}</div></div>
      <div class="bal-bar-track">
        ${targetZoneHtml}
        <div class="bal-bar-fill" style="width:${widthPct}%; background:${status.color};"><span class="bal-count">${count}${suffix}</span></div>
      </div>
    </div>`;
  }).join('');
}

function balanceColorFor(tally, muscle, mode){
  const maxCount = Math.max(1, ...Object.values(tally));
  const status = mode === 'logged' ? statusForLoggedCount(tally[muscle]) : statusForPlanCount(tally[muscle], maxCount);
  return status.color;
}

// Front and back schematic body diagrams, colored per-region from the same tally
// data driving the bars above. Two static views stand in for true 3D rotation -
// a real rotatable model would need an actual mesh and Three.js, a separate build.
function balanceBodySvg(tally, mode, view){
  const c = (muscle) => balanceColorFor(tally, muscle, mode);
  const neutral = '#2A2C31';
  if (view === 'front'){
    return `<svg width="100" height="190" viewBox="0 0 160 320">
      <circle cx="80" cy="22" r="16" fill="${neutral}"/><rect x="72" y="36" width="16" height="10" rx="5" fill="${neutral}"/>
      <rect x="44" y="44" width="72" height="94" rx="26" fill="${neutral}"/>
      <rect x="26" y="48" width="18" height="30" rx="9" fill="${c('biceps')}"/><rect x="116" y="48" width="18" height="30" rx="9" fill="${c('biceps')}"/>
      <rect x="22" y="76" width="16" height="26" rx="8" fill="${c('forearms')}"/><rect x="122" y="76" width="16" height="26" rx="8" fill="${c('forearms')}"/>
      <rect x="50" y="130" width="60" height="32" rx="16" fill="${neutral}"/>
      <rect x="52" y="158" width="22" height="64" rx="11" fill="${c('quadriceps')}"/><rect x="86" y="158" width="22" height="64" rx="11" fill="${c('quadriceps')}"/>
      <rect x="54" y="220" width="18" height="58" rx="9" fill="${c('calves')}"/><rect x="86" y="220" width="18" height="58" rx="9" fill="${c('calves')}"/>
      <rect x="52" y="50" width="56" height="26" rx="12" fill="${c('chest')}"/>
      <circle cx="35" cy="50" r="10" fill="${c('shoulders')}"/><circle cx="125" cy="50" r="10" fill="${c('shoulders')}"/>
      <rect x="56" y="78" width="48" height="46" rx="10" fill="${c('abdominals')}"/>
    </svg>`;
  }
  return `<svg width="100" height="190" viewBox="0 0 160 320">
    <circle cx="80" cy="22" r="16" fill="${neutral}"/><rect x="72" y="36" width="16" height="10" rx="5" fill="${neutral}"/>
    <path d="M56 44 L104 44 L114 70 L46 70 Z" fill="${c('traps')}"/>
    <rect x="44" y="70" width="72" height="46" rx="14" fill="${c('lats')}"/>
    <rect x="44" y="116" width="72" height="22" rx="10" fill="${c('lower back')}"/>
    <rect x="26" y="48" width="18" height="30" rx="9" fill="${c('shoulders')}"/><rect x="116" y="48" width="18" height="30" rx="9" fill="${c('shoulders')}"/>
    <rect x="22" y="76" width="16" height="26" rx="8" fill="${c('triceps')}"/><rect x="122" y="76" width="16" height="26" rx="8" fill="${c('triceps')}"/>
    <rect x="20" y="100" width="14" height="26" rx="7" fill="${c('forearms')}"/><rect x="126" y="100" width="14" height="26" rx="7" fill="${c('forearms')}"/>
    <rect x="48" y="130" width="64" height="34" rx="14" fill="${c('glutes')}"/>
    <rect x="52" y="158" width="22" height="64" rx="11" fill="${c('hamstrings')}"/><rect x="86" y="158" width="22" height="64" rx="11" fill="${c('hamstrings')}"/>
    <rect x="54" y="220" width="18" height="58" rx="9" fill="${c('calves')}"/><rect x="86" y="220" width="18" height="58" rx="9" fill="${c('calves')}"/>
  </svg>`;
}

async function renderBalance(mode, view){
  mode = mode || state.balanceMode || 'logged';
  view = view || state.balanceView || 'muscle';
  state.balanceMode = mode;
  state.balanceView = view;
  app.innerHTML = `<div class="app-shell"><div class="login-wrap"><div class="login-sub">Crunching your balance…</div></div></div>`;
  const tally = mode === 'logged' ? await tallyLoggedThisWeek() : await tallyFullPlan();

  let bodyContentHtml;
  if (view === 'ppl'){
    const pplTally = pplTallyFrom(tally);
    bodyContentHtml = `
      <div class="section-label">${mode === 'logged' ? 'Sets Logged, By Split' : 'Plan Coverage, By Split'}</div>
      ${pplBarsHtml(pplTally)}
      <div class="small" style="padding:8px 18px 0 18px; color:var(--slate);">Abdominals is folded into Legs for this split - push/pull/legs doesn't have a clean third home for core work.</div>
    `;
  } else {
    const barsHtml = balanceBarsHtml(tally, mode);
    const frontSvg = balanceBodySvg(tally, mode, 'front');
    const backSvg = balanceBodySvg(tally, mode, 'back');
    bodyContentHtml = `
      <div class="section-label">${mode === 'logged' ? 'Sets Logged, By Muscle' : 'Plan Coverage, By Muscle'}</div>
      ${barsHtml}
      <div class="section-label" style="text-align:center;">Heat Map</div>
      <div style="display:flex; justify-content:center; gap:20px; padding:8px 0 20px 0;">
        <div style="text-align:center;"><div class="small" style="margin-bottom:4px;">FRONT</div>${frontSvg}</div>
        <div style="text-align:center;"><div class="small" style="margin-bottom:4px;">BACK</div>${backSvg}</div>
      </div>
    `;
  }

  app.innerHTML = `
    <div class="app-shell">
      <div class="scroll-area">
        <div class="brandbar"><img src="icons/icon-inapp-32.png" alt=""><div class="name">ZEALIFT</div></div>
        <div class="header"><div class="eyebrow">${mode === 'logged' ? 'LAST 7 DAYS' : 'WHOLE WEEKLY PLAN'}</div><h1>Balance</h1></div>
        <div class="seg" style="margin:10px 18px; display:flex; border:1px solid var(--line);">
          <div class="bal-seg-chip ${mode==='logged'?'active':''}" data-mode="logged" style="flex:1; text-align:center; padding:7px 0; font-family:'Bebas Neue',sans-serif; font-size:11.5px; letter-spacing:0.5px; color:${mode==='logged'?'var(--ink)':'var(--slate)'}; background:${mode==='logged'?'var(--flame)':'transparent'};">LOGGED THIS WEEK</div>
          <div class="bal-seg-chip ${mode==='plan'?'active':''}" data-mode="plan" style="flex:1; text-align:center; padding:7px 0; font-family:'Bebas Neue',sans-serif; font-size:11.5px; letter-spacing:0.5px; color:${mode==='plan'?'var(--ink)':'var(--slate)'}; background:${mode==='plan'?'var(--flame)':'transparent'};">FULL PLAN</div>
        </div>
        <div class="seg" style="margin:0 18px 10px 18px; display:flex; border:1px solid var(--line);">
          <div class="bal-view-chip ${view==='muscle'?'active':''}" data-view="muscle" style="flex:1; text-align:center; padding:6px 0; font-family:'Bebas Neue',sans-serif; font-size:11px; letter-spacing:0.5px; color:${view==='muscle'?'var(--ink)':'var(--slate)'}; background:${view==='muscle'?'var(--flame)':'transparent'};">MUSCLE GROUPS</div>
          <div class="bal-view-chip ${view==='ppl'?'active':''}" data-view="ppl" style="flex:1; text-align:center; padding:6px 0; font-family:'Bebas Neue',sans-serif; font-size:11px; letter-spacing:0.5px; color:${view==='ppl'?'var(--ink)':'var(--slate)'}; background:${view==='ppl'?'var(--flame)':'transparent'};">PUSH / PULL / LEGS</div>
        </div>
        ${mode === 'plan' ? `<div class="small" style="padding:0 18px 8px 18px; color:var(--slate);">Counts exercise slots across every day, regardless of what's been logged.</div>` : `<div class="small" style="padding:0 18px 8px 18px; color:var(--slate);">Target zone is a general guideline (~${BALANCE_TARGET_MIN}-${BALANCE_TARGET_MAX} weekly sets), not personalized advice.</div>`}
        ${bodyContentHtml}
      </div>
      ${renderTabbar()}
    </div>`;
  attachShellHandlers();
  document.querySelectorAll('.bal-seg-chip').forEach(chip => {
    chip.onclick = () => renderBalance(chip.dataset.mode, view);
  });
  document.querySelectorAll('.bal-view-chip').forEach(chip => {
    chip.onclick = () => renderBalance(mode, chip.dataset.view);
  });
  document.querySelectorAll('.bal-row[data-muscle]').forEach(row => {
    row.onclick = () => openPicker('database', row.dataset.muscle);
  });
}


// ---------- ME ----------
async function getDayStats(weekday){
  const { data: userData } = await supabaseClient.auth.getUser();
  if (!userData || !userData.user) return { weekday, label: DAY_TYPES[weekday], exerciseCount: 0, setCount: 0 };
  const exResult = await withTimeout(
    supabaseClient.from('exercises').select('id').eq('user_id', userData.user.id).eq('weekday', weekday).eq('active', true),
    15000
  );
  const exercises = exResult.__timeout || exResult.error ? [] : (exResult.data || []);
  let setCount = 0;
  if (exercises.length > 0){
    const ids = exercises.map(e => e.id);
    const setResult = await withTimeout(
      supabaseClient.from('sets').select('id', { count: 'exact', head: true }).in('exercise_id', ids),
      15000
    );
    setCount = setResult.__timeout || setResult.error ? 0 : (setResult.count || 0);
  }
  const label = await loadDayType(weekday);
  return { weekday, label, exerciseCount: exercises.length, setCount };
}

function openSwapDaysForm(){
  let dayA = null, dayB = null;
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeSwap">✕</button><h1>Swap Days</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="form-sub" style="margin-top:0;">Move an entire day's plan to a different weekday. All history follows automatically — nothing is lost or re-logged.</div>
      <div class="field-label">First Day</div>
      <div class="chip-row">${DAY_NAMES.map((d,i) => `<div class="chip" data-pick="a" data-day="${i}">${d}</div>`).join('')}</div>
      <div class="field-label">Second Day</div>
      <div class="chip-row">${DAY_NAMES.map((d,i) => `<div class="chip" data-pick="b" data-day="${i}">${d}</div>`).join('')}</div>
      <div id="swapPreview"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeSwap').onclick = () => overlay.remove();

  async function renderPreview(){
    const previewEl = overlay.querySelector('#swapPreview');
    if (dayA === null || dayB === null || dayA === dayB){ previewEl.innerHTML = ''; return; }
    previewEl.innerHTML = `<div class="empty-state" style="padding:20px;">Loading…</div>`;
    const [statsA, statsB] = await Promise.all([getDayStats(dayA), getDayStats(dayB)]);
    previewEl.innerHTML = `
      <div class="phase-card active" style="margin:14px 18px;">
        <div class="top-row"><div class="name" style="font-size:16px;">${DAY_LABELS[dayA]}</div></div>
        <div class="dates">${statsA.label} · ${statsA.exerciseCount} exercises · ${statsA.setCount} logged sets</div>
      </div>
      <div style="text-align:center; color:var(--flame); font-size:18px;">⇅</div>
      <div class="phase-card active" style="margin:14px 18px;">
        <div class="top-row"><div class="name" style="font-size:16px;">${DAY_LABELS[dayB]}</div></div>
        <div class="dates">${statsB.label} · ${statsB.exerciseCount} exercises · ${statsB.setCount} logged sets</div>
      </div>
      <div class="action-row" style="border-color:rgba(143,191,122,0.3); background:rgba(143,191,122,0.06);">
        <div style="font-size:11.5px; color:var(--good); line-height:1.6;">✓ After swapping: ${DAY_LABELS[dayB]} becomes "${statsA.label}," ${DAY_LABELS[dayA]} becomes "${statsB.label}." Every exercise, alt group, and logged set moves with its day.</div>
      </div>
      <button class="save-btn" id="confirmSwapBtn">Swap These Days</button>
    `;
    overlay.querySelector('#confirmSwapBtn').onclick = async () => {
      const btn = overlay.querySelector('#confirmSwapBtn');
      btn.disabled = true; btn.textContent = 'Swapping…';
      await performDaySwap(dayA, dayB);
      overlay.remove();
      state.selectedDay = dayB;
      state.currentTab = 'track';
      renderTrack();
    };
  }

  overlay.querySelectorAll('.chip[data-pick]').forEach(el => {
    el.onclick = () => {
      const pick = el.dataset.pick;
      const day = parseInt(el.dataset.day, 10);
      overlay.querySelectorAll(`.chip[data-pick="${pick}"]`).forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      if (pick === 'a') dayA = day; else dayB = day;
      renderPreview();
    };
  });
}

async function performDaySwap(dayA, dayB){
  const { data: userData } = await supabaseClient.auth.getUser();
  const uid = userData.user.id;

  // Capture exact row IDs first, since updating by weekday-match would lose track of
  // which rows belonged to which day once the first update runs.
  const [resA, resB] = await Promise.all([
    supabaseClient.from('exercises').select('id').eq('user_id', uid).eq('weekday', dayA),
    supabaseClient.from('exercises').select('id').eq('user_id', uid).eq('weekday', dayB)
  ]);
  const idsA = (resA.data || []).map(r => r.id);
  const idsB = (resB.data || []).map(r => r.id);

  if (idsA.length > 0) await supabaseClient.from('exercises').update({ weekday: dayB }).in('id', idsA);
  if (idsB.length > 0) await supabaseClient.from('exercises').update({ weekday: dayA }).in('id', idsB);

  const [dtA, dtB] = await Promise.all([
    supabaseClient.from('day_types').select('label').eq('user_id', uid).eq('weekday', dayA).maybeSingle(),
    supabaseClient.from('day_types').select('label').eq('user_id', uid).eq('weekday', dayB).maybeSingle()
  ]);
  const labelA = dtA.data ? dtA.data.label : DAY_TYPES[dayA];
  const labelB = dtB.data ? dtB.data.label : DAY_TYPES[dayB];
  await supabaseClient.from('day_types').upsert({ user_id: uid, weekday: dayA, label: labelB }, { onConflict: 'user_id,weekday' });
  await supabaseClient.from('day_types').upsert({ user_id: uid, weekday: dayB, label: labelA }, { onConflict: 'user_id,weekday' });
}

async function renderMe(){
  const { data: userData } = await supabaseClient.auth.getUser();
  const email = userData && userData.user ? userData.user.email : '';
  const initial = email ? email[0].toUpperCase() : '?';
  app.innerHTML = `
    <div class="app-shell">
      <div class="scroll-area">
        <div class="brandbar"><img src="icons/icon-inapp-32.png" alt=""><div class="name">ZEALIFT</div><button class="brandbar-timer" onclick="openTimer()" aria-label="Timer" style="margin-left:auto; background:none; color:var(--slate); padding:6px; display:flex; align-items:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M9 2h6"/></svg></button></div>
        <div class="header"><div class="eyebrow">ACCOUNT</div><h1>Me</h1></div>
        <div class="account-card">
          <div class="avatar">${initial}</div>
          <div><div class="account-email">${email}</div><div class="account-tag">● Signed in</div></div>
        </div>
        <div class="me-item" id="swapDaysBtn"><div>Swap Days</div><div class="chev">›</div></div>
        <div class="me-item" id="replayTourBtn"><div>How Zealift Works</div><div class="chev">›</div></div>
        <div class="me-item" id="redoWeekBtn"><div>Redo Week Setup</div><div class="chev">›</div></div>
        <div class="section-label">App</div>
        <div class="me-item" id="refreshAppBtn"><div>Refresh App</div><div class="chev">›</div></div>
        <div class="me-item" id="updateAppBtn"><div>Check for Updates</div><div class="chev">›</div></div>
        <div class="me-item" id="signOutBtn"><div>Sign Out</div><div class="chev">›</div></div>
        <div style="text-align:center; padding:18px 0; color:var(--slate); font-family:'JetBrains Mono',monospace; font-size:10.5px;">Zealift · ${APP_VERSION}</div>
      </div>
      ${renderTabbar()}
    </div>`;
  attachShellHandlers();
  document.getElementById('swapDaysBtn').onclick = openSwapDaysForm;
  document.getElementById('replayTourBtn').onclick = () => showOnboarding('teach');
  document.getElementById('redoWeekBtn').onclick = () => showOnboarding('setup');
  document.getElementById('refreshAppBtn').onclick = () => { location.reload(); };
  document.getElementById('updateAppBtn').onclick = async () => {
    const btn = document.getElementById('updateAppBtn');
    btn.querySelector('div').textContent = 'Updating…';
    try {
      if ('serviceWorker' in navigator){
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window){
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch(e){}
    location.reload();
  };
  document.getElementById('signOutBtn').onclick = async () => {
    await supabaseClient.auth.signOut();
  };
}

// ---------- INIT / AUTH STATE ----------
supabaseClient.auth.onAuthStateChange((_event, session) => {
  const hadSession = !!state.session;
  const hasSession = !!session;
  state.session = session;
  if (hadSession === hasSession) return;
  if (session) { state.currentTab = 'track'; renderTrack(); }
  else renderLogin();
});

supabaseClient.auth.getSession().then(({ data: { session } }) => {
  state.session = session;
  if (session) { renderTrack().then(maybeShowOnboarding); } else renderLogin();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js'));
}
