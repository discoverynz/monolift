// Zealift — app.js (Pass 2: Track + Scale + Phase + Me, alt groups, fixed tab bar)

const DAY_NAMES = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
const DAY_LABELS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_TYPES = ["Chest & Triceps","Back & Biceps","Chest & Back","Shoulders & Arms","Legs & Abs","Hybrid Circuit","Rest / Walk"];
const CATEGORIES = ["Free Weights - Bench","Free Weights - No Bench","Plate-Loaded","Pin-Loaded","Cable","Other"];
const ALT_COLORS = ["#2DD4BF","#9B7EDE","#E8A33D","#6FA8DC","#E8718D","#7FD17A"];

const QUOTES = [
  {t:"The impediment to action advances action.", a:"Marcus Aurelius"},
  {t:"We suffer more in imagination than in reality.", a:"Seneca"},
  {t:"What does not kill me makes me stronger.", a:"Nietzsche"},
  {t:"Be like water making its way through cracks.", a:"Bruce Lee"},
  {t:"Knowing yourself is the beginning of all wisdom.", a:"Aristotle"},
  {t:"Patience is bitter, but its fruit is sweet.", a:"Rousseau"},
  {t:"A journey of a thousand miles begins with a single step.", a:"Lao Tzu"},
  {t:"It does not matter how slowly you go, as long as you do not stop.", a:"Confucius"},
  {t:"Difficulties strengthen the mind, as labor does the body.", a:"Seneca"},
  {t:"The cave you fear to enter holds the treasure you seek.", a:"Joseph Campbell"},
  {t:"Discipline is the bridge between goals and accomplishment.", a:"Jim Rohn"},
  {t:"You must do the things you think you cannot do.", a:"Eleanor Roosevelt"},
  {t:"Strength does not come from winning. Your struggles develop your strengths.", a:"Arnold Schwarzenegger"},
  {t:"The mind is the limit — what it can conceive, you can achieve.", a:"Arnold Schwarzenegger"},
  {t:"Everybody wants to be a bodybuilder, but nobody wants to lift heavy weights.", a:"Ronnie Coleman"},
  {t:"Pain is just weakness leaving the body.", a:"Gym proverb"},
  {t:"The iron never lies to you.", a:"Henry Rollins"},
  {t:"You don't have to be extreme, just consistent.", a:"Gym proverb"},
  {t:"The last few reps are what make the muscle grow.", a:"Ronnie Coleman"},
  {t:"Suffer the pain of discipline, or suffer the pain of regret.", a:"Jim Rohn"},
  {t:"Strength grows in the moments you think you can't go on.", a:"Gym proverb"},
  {t:"What hurts today makes you stronger tomorrow.", a:"Jay Cutler"},
  {t:"The body achieves what the mind believes.", a:"Gym proverb"},
  {t:"Fall in love with the process; the results will come.", a:"Gym proverb"},
  {t:"Champions keep playing until they get it right.", a:"Billie Jean King"},
  {t:"Whether you think you can, or you think you can't, you're right.", a:"Henry Ford"},
  {t:"Out of suffering have emerged the strongest souls.", a:"Khalil Gibran"},
  {t:"He who has a why to live can bear almost any how.", a:"Nietzsche"},
  {t:"The obstacle is the way.", a:"Stoic proverb"},
  {t:"We are what we repeatedly do.", a:"Aristotle"},
  {t:"Make the best use of what is in your power.", a:"Epictetus"},
  {t:"Endurance is patience concentrated.", a:"Thomas Carlyle"},
  {t:"Small steps, every single day.", a:"Gym proverb"},
  {t:"Form follows discipline.", a:"Gym proverb"},
  {t:"Strong people are harder to kill, and more useful in general.", a:"Mark Rippetoe"},
  {t:"Weak is a choice.", a:"Gym proverb"},
  {t:"You don't find willpower — you build it, one rep at a time.", a:"Gym proverb"},
  {t:"The only bad workout is the one that didn't happen.", a:"Gym proverb"},
  {t:"Lift heavy, recover hard, repeat.", a:"Gym proverb"},
  {t:"Comfort is the enemy of progress.", a:"Gym proverb"},
  {t:"He who conquers himself is the mightiest warrior.", a:"Confucius"},
  {t:"It's not the mountain we conquer, but ourselves.", a:"Edmund Hillary"},
  {t:"Move a little every day, even when it's hard.", a:"Gym proverb"},
  {t:"The pain you feel today is the strength you feel tomorrow.", a:"Gym proverb"},
  {t:"He who is not satisfied with a little is satisfied with nothing.", a:"Epicurus"},
  {t:"Man is troubled not by real problems but by imagined anxieties.", a:"Epictetus"},
  {t:"The successful warrior is the average man, with laser-like focus.", a:"Bruce Lee"},
  {t:"The wound is the place where the light enters you.", a:"Rumi"},
  {t:"Amor fati — love your fate, for it is what you have.", a:"Stoic maxim"},
  {t:"Sweat is just fat, crying.", a:"Gym proverb"}
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
const ICON_ME = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="7.5" r="4"/><path d="M3 21c0-5 4-8 9-8s9 3 9 8"/></svg>`;
const ICON_CHECK = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3FCB7E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function renderTabbar(){
  return `<div class="tabbar">
    <button class="tab-item ${state.currentTab==='track'?'active':''}" data-tab="track">${ICON_TRACK}<span>Track</span></button>
    <button class="tab-item ${state.currentTab==='scale'?'active':''}" data-tab="scale">${ICON_SCALE}<span>Scale</span></button>
    <div class="fab-wrap"><button class="fab" id="fabBtn">${`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1B1C1F" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`}</button></div>
    <button class="tab-item ${state.currentTab==='phase'?'active':''}" data-tab="phase">${ICON_PHASE}<span>Phase</span></button>
    <button class="tab-item ${state.currentTab==='me'?'active':''}" data-tab="me">${ICON_ME}<span>Me</span></button>
  </div>`;
}

function attachShellHandlers(){
  document.querySelectorAll('.tab-item').forEach(el => {
    el.onclick = () => {
      const tab = el.dataset.tab;
      state.currentTab = tab;
      if (tab === 'track') renderTrack();
      else if (tab === 'scale') renderScale();
      else if (tab === 'phase') renderPhase();
      else if (tab === 'me') renderMe();
    };
  });
  const fab = document.getElementById('fabBtn');
  if (fab) fab.onclick = () => {
    if (state.currentTab === 'scale') openLogWeightForm();
    else openPicker(); // track, phase, me all default to the set-logging picker
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

  const withLogs = await Promise.all((exercises || []).map(async (ex) => {
    const setResult = await withTimeout(
      supabaseClient.from('sets').select('weight, weight_unit, weight_type, reps, num_sets, logged_at')
        .eq('exercise_id', ex.id).order('logged_at', { ascending: false }).limit(1),
      15000
    );
    const lastSet = setResult.__timeout ? null : (setResult.data && setResult.data[0]);
    const loggedToday = lastSet && lastSet.logged_at === todayStr();
    return { ...ex, lastSet, loggedToday };
  }));

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

function exerciseRow(ex){
  const groupName = ex.alt_groups ? ex.alt_groups.name : null;
  const groupColor = ex.alt_groups ? ex.alt_groups.color : null;
  const badge = groupName ? `<div class="badge" style="background:${groupColor}26; color:${groupColor};">${groupName}</div>` : '';
  const borderStyle = groupColor ? `border-left:3px solid ${groupColor};` : '';

  let subtitle, showCheck, doneStyle = '';
  if (ex.loggedToday){
    subtitle = `<div class="ex-last done">✓ Logged today — ${formatSetValue(ex.lastSet)}</div>`;
    showCheck = true; doneStyle = 'background:rgba(63,203,126,0.1);';
  } else if (ex.completeVia){
    subtitle = `<div class="ex-last via">↳ Complete via ${ex.completeVia}</div>`;
    showCheck = true; doneStyle = 'background:rgba(63,203,126,0.06);';
  } else {
    subtitle = `<div class="ex-last">${ex.lastSet ? formatSetValue(ex.lastSet) + ' · ' + ex.lastSet.logged_at : 'Not logged yet'}</div>`;
    showCheck = false;
  }

  return `<div class="exercise" style="${borderStyle} ${doneStyle}" data-id="${ex.id}" data-name="${ex.name}">
    <div><div class="ex-name-row"><div class="ex-name">${ex.name}</div>${badge}</div>${subtitle}</div>
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

const ONBOARDING_SLIDES = [
  {
    title: "Welcome to Zealift",
    body: "Your gym plan, alt groups, and history — all in one place, synced to your account. A few quick things before you dive in."
  },
  {
    title: "Logging a Set",
    body: "Tap any exercise on Track to log it. Colored badges show alt groups — pick one from the group, not all of them. A green check means that slot's done for the day, even if a teammate exercise covered it."
  },
  {
    title: "Adding Workouts",
    body: "Tap the + button to log a set for today. Not on the list? Use \"Add Existing Exercise\" to pull from your full library, or \"Create New Exercise\" to start fresh."
  },
  {
    title: "Make It Yours",
    body: "Tap the workout type at the top of Track (e.g. \"Back & Biceps\") to rename it. Want to rearrange your whole week? Me → Swap Days moves an entire day's plan — and history — to a new weekday."
  },
  {
    title: "Track Everything",
    body: "Scale logs your body weight with a trend chart. Phase tracks your bulk/cut progress. Every set you've ever logged stays in that exercise's history, forever."
  }
];

function showOnboarding(startIndex){
  let idx = startIndex || 0;
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:40; display:flex; align-items:center; justify-content:center; padding:20px;';
  document.body.appendChild(overlay);

  function render(){
    const slide = ONBOARDING_SLIDES[idx];
    const dots = ONBOARDING_SLIDES.map((_, i) =>
      `<div style="width:7px; height:7px; border-radius:50%; background:${i === idx ? 'var(--flame)' : 'var(--line)'};"></div>`
    ).join('');
    overlay.innerHTML = `
      <div style="background:var(--panel); border-radius:20px; padding:28px 24px 24px 24px; width:100%; max-width:340px; position:relative;">
        <div id="skipBtn" style="position:absolute; top:16px; right:18px; color:var(--slate); font-size:20px; cursor:pointer;">✕</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:10px; color:var(--brass); letter-spacing:1.5px; margin-bottom:10px;">${idx + 1} / ${ONBOARDING_SLIDES.length}</div>
        <div style="font-family:'Oswald', sans-serif; font-size:21px; font-weight:600; margin-bottom:12px;">${slide.title}</div>
        <div style="font-size:13.5px; color:var(--chalk); line-height:1.6; margin-bottom:24px;">${slide.body}</div>
        <div style="display:flex; gap:6px; justify-content:center; margin-bottom:20px;">${dots}</div>
        <div style="display:flex; gap:10px;">
          ${idx > 0 ? `<button id="backBtn" style="flex:1; padding:12px; border-radius:10px; background:var(--ink); color:var(--chalk); font-size:13px;">Back</button>` : ''}
          <button id="nextBtn" style="flex:2; padding:12px; border-radius:10px; background:var(--flame); color:var(--ink); font-weight:600; font-size:13px;">${idx === ONBOARDING_SLIDES.length - 1 ? 'Get Started' : 'Next'}</button>
        </div>
      </div>`;
    overlay.querySelector('#skipBtn').onclick = closeOnboarding;
    const backBtn = overlay.querySelector('#backBtn');
    if (backBtn) backBtn.onclick = () => { idx--; render(); };
    overlay.querySelector('#nextBtn').onclick = () => {
      if (idx === ONBOARDING_SLIDES.length - 1) closeOnboarding();
      else { idx++; render(); }
    };
  }

  async function closeOnboarding(){
    overlay.remove();
    await supabaseClient.auth.updateUser({ data: { onboarded: true } });
  }

  render();
}

async function maybeShowOnboarding(){
  const { data: userData } = await supabaseClient.auth.getUser();
  if (userData && userData.user && !userData.user.user_metadata.onboarded){
    showOnboarding(0);
  }
}

async function renderTrack(){
  app.innerHTML = `<div class="app-shell"><div class="login-wrap"><div class="login-sub">Loading your exercises…</div></div></div>`;
  await loadExercises();
  const dayTypeLabel = await loadDayType(state.selectedDay);

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

  const grouped = {};
  CATEGORIES.forEach(c => grouped[c] = []);
  state.exercises.forEach(ex => { (grouped[ex.category] || (grouped[ex.category] = [])).push(ex); });

  const q = todayQuote();
  const dayChips = DAY_NAMES.map((d, i) => {
    const isSelected = i === state.selectedDay;
    const isToday = i === todayWeekday();
    return `<button class="day ${isSelected ? 'active' : ''} ${isToday ? 'today-marker' : ''}" data-day="${i}">${d}</button>`;
  }).join('');

  let listHtml = '';
  const knownCats = new Set(CATEGORIES);
  const extraCats = Object.keys(grouped).filter(c => !knownCats.has(c) && grouped[c].length > 0);
  [...CATEGORIES, ...extraCats].forEach(cat => {
    const items = grouped[cat] || [];
    if (items.length === 0) return;
    listHtml += `<div class="category">${cat}</div>` + items.map(exerciseRow).join('');
  });
  if (state.exercises.length === 0){
    listHtml = `<div class="empty-state">No exercises set for ${DAY_LABELS[state.selectedDay]} yet.<br>
      <button class="btn-primary" id="emptyAddBtn">+ Add an Exercise</button></div>`;
  }

  app.innerHTML = `
    <div class="app-shell">
      <div class="scroll-area">
        <div class="brandbar"><img src="icons/icon-inapp-32.png" alt=""><div class="name">ZEALIFT</div></div>
        <div class="day-strip">${dayChips}</div>
        <div class="header">
          <div class="eyebrow">${DAY_LABELS[state.selectedDay].toUpperCase()}</div>
          <h1 id="dayTypeHeader" style="cursor:pointer;">${dayTypeLabel}</h1>
          <div class="quote">"${q.t}" — ${q.a}</div>
        </div>
        <div style="margin:12px 18px 0 18px; height:4px; background:var(--panel); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:var(--good); border-radius:4px;"></div>
        </div>
        ${listHtml}
      </div>
      ${renderTabbar()}
    </div>`;

  attachShellHandlers();
  document.getElementById('dayTypeHeader').onclick = () => openEditDayTypeForm(state.selectedDay, dayTypeLabel);
  const scrollEl = document.querySelector('.scroll-area');
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
  const emptyBtn = document.getElementById('emptyAddBtn');
  if (emptyBtn) emptyBtn.onclick = openNewExerciseForm;
}

function showExerciseActionsMenu(exerciseId, exerciseName){
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
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeRename">✕</button><h1>Rename Exercise</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label">Name</div>
      <div class="field-card"><input class="field-input" id="renameInput" type="text" value="${exerciseName.replace(/"/g, '&quot;')}" style="font-size:15px; font-weight:400;"></div>
      <div class="form-sub" style="margin-top:0;">This renames every instance of this exercise across all days, and keeps all its logged history.</div>
      <button class="save-btn" id="saveRenameBtn">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeRename').onclick = () => overlay.remove();
  overlay.querySelector('#saveRenameBtn').onclick = async () => {
    const newName = document.getElementById('renameInput').value.trim();
    if (!newName || newName === exerciseName){ overlay.remove(); return; }
    const { data: userData } = await supabaseClient.auth.getUser();
    // Rename all rows sharing the old name (an exercise can exist on multiple days), so history stays consistent.
    const { error } = await supabaseClient.from('exercises')
      .update({ name: newName })
      .eq('user_id', userData.user.id)
      .eq('name', exerciseName);
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

// ---------- PICKER (the + button on Track) — now shows ALL exercises across all days ----------
async function openPicker(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closePicker">✕</button><h1>Log a Set</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="search-bar">🔍 <input id="pickerSearch" placeholder="Search all exercises…"></div>
      <div class="pick-row" id="createNewRow" style="border-bottom:1px solid var(--line);"><div class="ex-name" style="color:var(--flame);">+ Create New Exercise</div></div>
      <div id="pickerList"><div class="empty-state">Loading…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closePicker').onclick = () => overlay.remove();
  overlay.querySelector('#createNewRow').onclick = () => { overlay.remove(); openNewExerciseForm(); };

  const result = await withTimeout(
    supabaseClient.from('exercises').select('id, name, category, weekday, alt_group_id').eq('active', true),
    15000
  );
  const all = result.__timeout || result.error ? [] : (result.data || []);

  function renderList(filter){
    const f = (filter || '').toLowerCase();
    const byName = {};
    all.forEach(ex => {
      const key = ex.name.toLowerCase();
      if (!byName[key] || ex.weekday < byName[key].weekday) byName[key] = ex;
    });
    const deduped = Object.values(byName).filter(ex => ex.name.toLowerCase().includes(f));
    const byCat = {};
    CATEGORIES.forEach(c => byCat[c] = []);
    deduped.forEach(ex => { (byCat[ex.category] || (byCat[ex.category] = [])).push(ex); });

    let html = '';
    const knownCats = new Set(CATEGORIES);
    const extraCats = Object.keys(byCat).filter(c => !knownCats.has(c) && byCat[c].length > 0);
    [...CATEGORIES, ...extraCats].forEach(cat => {
      const items = (byCat[cat] || []).sort((a, b) => a.name.localeCompare(b.name));
      if (items.length === 0) return;
      html += `<div class="category">${cat}</div>`;
      html += items.map(ex => `<div class="pick-row" data-id="${ex.id}" data-name="${ex.name}"><div class="ex-name">${ex.name}</div><div class="chev">›</div></div>`).join('');
    });
    overlay.querySelector('#pickerList').innerHTML = html || '<div class="empty-state">No matches.</div>';
    overlay.querySelectorAll('.pick-row[data-id]').forEach(el => {
      el.onclick = async () => {
        const picked = all.find(ex => ex.id === el.dataset.id);
        overlay.remove();
        if (!picked || picked.weekday === state.selectedDay){
          openLogForm(el.dataset.id, el.dataset.name);
          return;
        }
        // Not on today's day yet - check if a same-named exercise already exists today before creating a duplicate.
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
  overlay.querySelector('#pickerSearch').oninput = (e) => renderList(e.target.value);
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
function openNewExerciseForm(){
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
      <div class="chip-row">${CATEGORIES.map((c,i) => `<div class="chip ${i===0?'active':''}" data-cat="${c}">${c}</div>`).join('')}</div>
      <div class="field-label">Day</div>
      <div class="chip-row">${DAY_NAMES.map((d,i) => `<div class="chip ${i===state.selectedDay?'active':''}" data-day="${i}">${d}</div>`).join('')}</div>
      <div class="field-label">Alt Group <span class="opt">(optional)</span></div>
      <div id="altGroupArea" class="field-card" style="display:block;"><div class="ex-name" style="color:var(--slate); font-size:13px;" id="altGroupPickBtn">Tap to choose or create…</div></div>
      <button class="save-btn" id="saveExerciseBtn">Add Exercise</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeForm').onclick = () => overlay.remove();
  overlay.querySelectorAll('.chip[data-cat]').forEach(el => {
    el.onclick = () => { overlay.querySelectorAll('.chip[data-cat]').forEach(c=>c.classList.remove('active')); el.classList.add('active'); selectedCategory = el.dataset.cat; };
  });
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
function openLogForm(exerciseId, exerciseName){
  let unit = 'kg';
  let weightType = 'total';
  let lastEntry = null;
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeLog">✕</button><h1>${exerciseName}</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div id="sameAsLastArea" style="margin-bottom:18px;"></div>
      <div style="height:1px; background:var(--line); margin:0 18px 18px 18px;"></div>
      <div class="field-label">Weight or Time <span class="opt">(optional)</span></div>
      <div class="field-card">
        <input class="field-input" id="weightInput" type="number" inputmode="decimal" placeholder="0">
        <div class="unit-toggle">
          <button class="active" data-u="kg">kg</button><button data-u="lb">lb</button><button data-u="sec">sec</button><button data-u="pin">pin</button>
        </div>
      </div>
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
  overlay.querySelector('#closeLog').onclick = () => overlay.remove();
  overlay.querySelectorAll('.unit-toggle button').forEach(b => {
    b.onclick = () => { overlay.querySelectorAll('.unit-toggle button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); unit = b.dataset.u; };
  });
  overlay.querySelectorAll('.chip[data-wt]').forEach(b => {
    b.onclick = () => { overlay.querySelectorAll('.chip[data-wt]').forEach(x=>x.classList.remove('active')); b.classList.add('active'); weightType = b.dataset.wt; };
  });

  async function saveEntry(weight, unit, weightType, reps, numSets, notes){
    const { data: userData } = await supabaseClient.auth.getUser();
    const { data, error } = await supabaseClient.from('sets').insert({
      user_id: userData.user.id, exercise_id: exerciseId,
      weight, weight_unit: weight !== null ? unit : 'bodyweight',
      weight_type: weightType,
      num_sets: numSets, reps: reps,
      notes: notes || null,
      logged_at: todayStr()
    }).select();
    if (error){ alert(error.message); return null; }
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
        return `<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W - mR}" y2="${y.toFixed(1)}" stroke="#34363B" stroke-width="1"/>
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
        return `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(s.chartWeight).toFixed(1)}" r="${isLast ? 4 : 2.8}" fill="${isLast ? '#FF5630' : '#EDEAE2'}" stroke="#24262A" stroke-width="1.5"/>`;
      }).join('');

      chartHtml = `<div class="stat-card" style="margin:0 18px 16px 18px;">
        <div style="display:flex; justify-content:space-between; font-family:'JetBrains Mono', monospace; font-size:10px; color:var(--slate); margin-bottom:6px;">
          <span>Weight (${chartUnit})</span>
          <span>latest ${fmt(chartable[chartable.length-1].chartWeight)}${chartUnit}</span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto">
          <defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#FF5630" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="#FF5630" stop-opacity="0"/>
          </linearGradient></defs>
          ${gridLines}
          <polygon points="${areaPts}" fill="url(#areaFill)"/>
          <polyline points="${linePts}" fill="none" stroke="#FF5630" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
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

// ---------- SCALE ----------
async function loadBodyWeight(){
  const result = await withTimeout(
    supabaseClient.from('body_weight').select('weight, unit, logged_at').order('logged_at', { ascending: false }).limit(20),
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
  const rows = entries.map(e => `<div class="log-row"><div class="log-date">${e.logged_at}</div><div class="log-weight">${e.weight}${e.unit}</div></div>`).join('');

  let chartHtml = '';
  if (entries.length >= 2){
    const chrono = [...entries].reverse(); // oldest first for left-to-right chart
    const weights = chrono.map(e => e.weight);
    const min = Math.min(...weights), max = Math.max(...weights);
    const range = max - min || 1;
    const W = 300, H = 80, pad = 6;
    const points = chrono.map((e, i) => {
      const x = chrono.length === 1 ? W/2 : (i / (chrono.length - 1)) * W;
      const y = H - pad - ((e.weight - min) / range) * (H - pad*2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const dots = chrono.map((e, i) => {
      const [x, y] = points[i].split(',');
      const isLast = i === chrono.length - 1;
      return `<circle cx="${x}" cy="${y}" r="${isLast ? 3.5 : 3}" fill="${isLast ? '#FF5630' : '#8C8E94'}"/>`;
    }).join('');
    chartHtml = `<div class="stat-card">
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
        <polyline points="${points.join(' ')}" fill="none" stroke="#FF5630" stroke-width="2.5" stroke-linecap="round"/>
        ${dots}
      </svg>
      <div class="small" style="text-align:center; margin-top:4px;">${chrono[0].logged_at} → ${chrono[chrono.length-1].logged_at}</div>
    </div>`;
  }

  app.innerHTML = `
    <div class="app-shell">
      <div class="scroll-area">
        <div class="brandbar"><img src="icons/icon-inapp-32.png" alt=""><div class="name">ZEALIFT</div></div>
        <div class="header"><div class="eyebrow">BODY WEIGHT</div><h1>Scale</h1></div>
        <div class="stat-card">
          ${latest ? `<div class="big">${latest.weight}${latest.unit}</div><div class="small">${latest.logged_at}</div>${deltaHtml}` : `<div class="small">No entries yet — tap + to log your weight.</div>`}
        </div>
        ${chartHtml}
        <div class="section-label">Recent Entries</div>
        ${rows || '<div class="empty-state">Nothing logged yet.</div>'}
      </div>
      ${renderTabbar()}
    </div>`;
  attachShellHandlers();
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
    const { data: userData } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('body_weight').insert({
      user_id: userData.user.id, weight, unit, logged_at: todayStr()
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
  const totalWeeks = Math.max(1, Math.round((end - start) / (7*86400000)));
  const elapsedWeeks = Math.min(totalWeeks, Math.max(0, Math.round((now - start) / (7*86400000))));
  return { totalWeeks, elapsedWeeks, pct: Math.round((elapsedWeeks/totalWeeks)*100) };
}

async function renderPhase(){
  app.innerHTML = `<div class="app-shell"><div class="login-wrap"><div class="login-sub">Loading your phase…</div></div></div>`;
  const phase = await loadPhase();

  let bulkHtml, cutHtml;
  if (phase && phase.bulk_start && phase.bulk_end){
    const isActive = phase.current_phase === 'bulk';
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
    const isActive = phase.current_phase === 'cut';
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
        <div class="brandbar"><img src="icons/icon-inapp-32.png" alt=""><div class="name">ZEALIFT</div></div>
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
      <div class="field-label">Currently Active</div>
      <div class="chip-row">
        <div class="chip ${(!existing || existing.current_phase==='bulk') ? 'active':''}" data-phase="bulk">Bulk</div>
        <div class="chip ${(existing && existing.current_phase==='cut') ? 'active':''}" data-phase="cut">Cut</div>
      </div>
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
  let chosenPhase = (existing && existing.current_phase) || 'bulk';
  overlay.querySelector('#closeP').onclick = () => overlay.remove();
  overlay.querySelectorAll('.chip[data-phase]').forEach(el => {
    el.onclick = () => { overlay.querySelectorAll('.chip[data-phase]').forEach(c=>c.classList.remove('active')); el.classList.add('active'); chosenPhase = el.dataset.phase; };
  });
  overlay.querySelector('#savePBtn').onclick = async () => {
    const { data: userData } = await supabaseClient.auth.getUser();
    const payload = {
      user_id: userData.user.id,
      current_phase: chosenPhase,
      bulk_start: document.getElementById('bulkStart').value || null,
      bulk_end: document.getElementById('bulkEnd').value || null,
      cut_start: document.getElementById('cutStart').value || null,
      cut_end: document.getElementById('cutEnd').value || null
    };
    const { error } = await supabaseClient.from('phase_settings').upsert(payload, { onConflict: 'user_id' });
    if (error){ alert(error.message); return; }
    overlay.remove();
    renderPhase();
  };
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
      <div class="action-row" style="border-color:rgba(63,203,126,0.3); background:rgba(63,203,126,0.06);">
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
        <div class="brandbar"><img src="icons/icon-inapp-32.png" alt=""><div class="name">ZEALIFT</div></div>
        <div class="header"><div class="eyebrow">ACCOUNT</div><h1>Me</h1></div>
        <div class="account-card">
          <div class="avatar">${initial}</div>
          <div><div class="account-email">${email}</div><div class="account-tag">● Signed in</div></div>
        </div>
        <div class="me-item" id="swapDaysBtn"><div>Swap Days</div><div class="chev">›</div></div>
        <div class="me-item" id="replayTourBtn"><div>How Zealift Works</div><div class="chev">›</div></div>
        <div class="me-item" id="signOutBtn"><div>Sign Out</div><div class="chev">›</div></div>
      </div>
      ${renderTabbar()}
    </div>`;
  attachShellHandlers();
  document.getElementById('swapDaysBtn').onclick = openSwapDaysForm;
  document.getElementById('replayTourBtn').onclick = () => showOnboarding(0);
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
