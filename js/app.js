// MonoLift — app.js (Pass 2: Track + Scale + Phase + Me, alt groups, fixed tab bar)

const DAY_NAMES = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
const DAY_LABELS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
// The "Anytime" slot - exercises that belong to no particular weekday.
// Implemented as weekday 7 so it flows through every existing path (loading,
// adding, logging, history) without special-casing, while rendering as its
// own chip rather than masquerading as an eighth day of the week.
const ANY_DAY = 7;
const ANY_DAY_NAME = "ANY";
const ANY_DAY_LABEL = "Anytime";
function isAnyDay(weekday){ return Number(weekday) === ANY_DAY; }
function dayNameOf(weekday){ return isAnyDay(weekday) ? ANY_DAY_NAME : DAY_NAMES[weekday]; }
function dayLabelOf(weekday){ return isAnyDay(weekday) ? ANY_DAY_LABEL : DAY_LABELS[weekday]; }
const DAY_TYPES = ["Chest & Triceps","Back & Biceps","Chest & Back","Shoulders & Arms","Legs & Abs","Hybrid Circuit","Rest / Walk"];
const APP_VERSION = 'Beta 5.209';
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
  const userData = { user: await getCurrentUser() };
  const table = getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises';
  const result = await withTimeout(
    supabaseClient.from(table).select('category').eq('user_id', userData.user.id),
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
  const userData = { user: await getCurrentUser() };
  const compatEx = await fetchAllExercisesCompat(userData.user.id);
  const existingMatch = compatEx.find(ex => ex.weekday === weekday && ex.name.toLowerCase() === name.toLowerCase());
  if (existingMatch){ renderTrack(); return; }
  const { error } = await createExerciseForToday({ user_id: userData.user.id, name, category, weekday, alt_group_id: null });
  if (error){ alert(error.message); return; }
  renderTrack();
}

function getGroupByPref(){
  // Track only ever supports equipment/muscle - if a stale 'split' value is
  // sitting in the old shared key (from before this was separated out), fall
  // back to equipment rather than silently sorting by an option Track's own
  // toggle can't even display as selected.
  const v = localStorage.getItem('zealift_group_by_track') || localStorage.getItem('zealift_group_by');
  return (v === 'equipment' || v === 'muscle') ? v : 'equipment';
}
function setGroupByPref(v){ localStorage.setItem('zealift_group_by_track', v); }
function getPickerGroupByPref(){ return localStorage.getItem('zealift_group_by_picker') || 'split'; }
function setPickerGroupByPref(v){ localStorage.setItem('zealift_group_by_picker', v); }
function getSplitModePref(){ return localStorage.getItem('zealift_split_mode') || 'ppl'; }
function setSplitModePref(v){ localStorage.setItem('zealift_split_mode', v); }
function getSplitSubGroupPref(){ return localStorage.getItem('zealift_split_subgroup') || 'equipment'; }
// Rebuild Stage 4c feature flag - defaults OFF. When on, both the read path
// (loadExercises) and the write path (saveEntry, PR detection) consistently
// use exercise_master identity instead of the old per-day exercises table.
// Turning this off again requires no code push - it's just a local setting.
function getUseExerciseMasterFlag(){ return localStorage.getItem('zealift_use_exercise_master') === 'true'; }
function setUseExerciseMasterFlag(v){ localStorage.setItem('zealift_use_exercise_master', v ? 'true' : 'false'); }
// Self-heals the master flag from the database - if localStorage was wiped
// (a known iOS PWA behavior), the flag would silently read as 'false' and
// the app would start querying the OLD exercises table instead of the
// exercise_master/exercise_days tables the user has actually been using.
// That table can hold stale onboarding-era data, which is exactly the
// "everything reset to defaults I never set" behavior - the defaults ARE
// something the user chose, but at initial onboarding, months ago, and
// they'd been using the newer schema since.
// Only ever flips the flag ON, never off - flipping off could hide real data
// and there's no scenario where a user with master data legitimately wants
// the flag off. Runs as a background heal after each auth-checked page load;
// does not block reads. Skips silently if the master table doesn't exist
// (e.g. for a genuinely brand-new install).
let __masterFlagHealChecked = false;
let __masterFlagHealPromise = null;
async function healMasterFlagFromDb(){
  if (__masterFlagHealChecked) return;
  __masterFlagHealChecked = true;
  if (getUseExerciseMasterFlag()) return; // already on, nothing to heal
  try {
    const userData = { user: await getCurrentUser() };
    if (!userData || !userData.user) return;
    const result = await withTimeout(
      supabaseClient.from('exercise_master').select('id', { count: 'exact', head: true }).eq('user_id', userData.user.id).limit(1),
      15000
    );
    if (result.__timeout || result.error) return;
    // Any row at all means the user was using the master schema; heal the
    // flag so the app doesn't silently revert to the old table's data.
    if ((result.count || 0) > 0){
      setUseExerciseMasterFlag(true);
      if (state.currentTab === 'track') renderTrack();
    }
  } catch(e){ /* stay silent - localStorage still works, this is only a safety heal */ }
}
// Any code that WRITES to the flagged tables should await this promise
// first, to make sure the heal has completed and the flag is on its final
// value. Prevents a race where the user saves a set between boot and heal
// completion, which would route the write to the wrong table (invisible to
// subsequent reads, since the app queries the flag's healed value).
function awaitMasterFlagHealed(){
  if (__masterFlagHealChecked && !__masterFlagHealPromise) return Promise.resolve();
  return __masterFlagHealPromise || Promise.resolve();
}
function setSplitSubGroupPref(v){ localStorage.setItem('zealift_split_subgroup', v); }

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

// Muscle grouping is normally auto-detected by fuzzy-matching the exercise
// name against the exercise database - this lets a person pin a specific
// exercise to a muscle group manually, overriding the auto-detection when
// it's wrong or just not how they think about that exercise. The override
// stores the final label directly (e.g. "Rear Delts"), not a broad muscle
// that still needs further processing.
function getEffectiveMuscleLabel(ex, db){
  if (ex && ex.muscle_override && ex.muscle_override !== 'Calves (Gastrocnemius)' && ex.muscle_override !== 'Calves (Soleus)') return ex.muscle_override;
  const m = matchExercise(ex.name, db);
  const muscle = m && m.primaryMuscles && m.primaryMuscles[0];
  return muscle ? fineMuscleCategory(muscle, ex.name) : 'Other';
}

async function groupExercisesByChoice(exercises, groupBy, splitMode){
  const grouped = {};
  let orderedKeys;
  if (groupBy === 'muscle'){
    const db = await loadExerciseDB();
    exercises.forEach(ex => {
      const label = getEffectiveMuscleLabel(ex, db);
      (grouped[label] = grouped[label] || []).push(ex);
    });
    orderedKeys = Object.keys(grouped).sort((a,b) => a === 'Other' ? 1 : b === 'Other' ? -1 : muscleSortKey(a).localeCompare(muscleSortKey(b)));
  } else if (groupBy === 'split'){
    const db = await loadExerciseDB();
    const isUpperLower = splitMode === 'upperlower';
    const order = isUpperLower ? ['Upper','Lower','Other'] : ['Push','Pull','Legs','Other'];
    exercises.forEach(ex => {
      const match = matchExercise(ex.name, db);
      const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
      const ul = ex.upper_lower || classifyUpperLower(muscle);
      let label;
      if (isUpperLower){
        label = ul === 'upper' ? 'Upper' : ul === 'lower' ? 'Lower' : 'Other';
      } else {
        const pp = ex.push_pull || classifyPushPull(muscle, ex.name);
        label = ul === 'lower' ? 'Legs' : (pp === 'push' ? 'Push' : pp === 'pull' ? 'Pull' : 'Other');
      }
      (grouped[label] = grouped[label] || []).push(ex);
    });
    orderedKeys = order;
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
// Picker-specific: adds a third Split option with its own nested sub-choice
// (Push/Pull/Legs vs Upper/Lower), since those are two different ways of
// slicing the same exercises, not one flat category list.
function pickerGroupByToggleHtml(current, splitMode, splitSubGroup){
  return `<div style="padding:10px 18px 10px 18px;">
    <div style="display:flex; border:1px solid var(--line);">
      <div class="groupby-chip" data-groupby="equipment"
        style="flex:1; text-align:center; padding:7px 0; font-family:'Bebas Neue',sans-serif; font-size:12px; letter-spacing:0.5px; color:${current==='equipment'?'var(--ink)':'var(--slate)'}; background:${current==='equipment'?'var(--flame)':'transparent'};">EQUIPMENT</div>
      <div class="groupby-chip" data-groupby="muscle"
        style="flex:1; text-align:center; padding:7px 0; font-family:'Bebas Neue',sans-serif; font-size:12px; letter-spacing:0.5px; color:${current==='muscle'?'var(--ink)':'var(--slate)'}; background:${current==='muscle'?'var(--flame)':'transparent'};">MUSCLE</div>
      <div class="groupby-chip" data-groupby="split"
        style="flex:1; text-align:center; padding:7px 0; font-family:'Bebas Neue',sans-serif; font-size:12px; letter-spacing:0.5px; color:${current==='split'?'var(--ink)':'var(--slate)'}; background:${current==='split'?'var(--flame)':'transparent'};">SPLIT</div>
    </div>
    ${current==='split' ? `
    <div style="display:flex; gap:8px; margin-top:8px;">
      <div class="splitmode-chip ${splitMode!=='upperlower'?'active':''}" data-splitmode="ppl" style="flex:1; text-align:center; padding:6px 0; border-radius:14px; border:1px solid var(--line); font-size:11px; font-family:'Bebas Neue',sans-serif; letter-spacing:0.5px; color:${splitMode!=='upperlower'?'var(--ink)':'var(--slate)'}; background:${splitMode!=='upperlower'?'var(--flame)':'transparent'};">PUSH / PULL / LEGS</div>
      <div class="splitmode-chip ${splitMode==='upperlower'?'active':''}" data-splitmode="upperlower" style="flex:1; text-align:center; padding:6px 0; border-radius:14px; border:1px solid var(--line); font-size:11px; font-family:'Bebas Neue',sans-serif; letter-spacing:0.5px; color:${splitMode==='upperlower'?'var(--ink)':'var(--slate)'}; background:${splitMode==='upperlower'?'var(--flame)':'transparent'};">UPPER / LOWER</div>
    </div>
    <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
      <span style="font-family:'JetBrains Mono',monospace; font-size:9px; color:var(--slate); letter-spacing:0.5px; white-space:nowrap;">THEN BY</span>
      <div style="display:flex; gap:6px; flex:1;">
        <div class="splitsub-chip ${splitSubGroup!=='muscle'?'active':''}" data-splitsub="equipment" style="flex:1; text-align:center; padding:5px 0; border-radius:12px; border:1px solid var(--line); font-size:10px; font-family:'Bebas Neue',sans-serif; letter-spacing:0.5px; color:${splitSubGroup!=='muscle'?'var(--flame)':'var(--slate)'}; background:${splitSubGroup!=='muscle'?'rgba(255,107,26,0.12)':'transparent'};">EQUIPMENT</div>
        <div class="splitsub-chip ${splitSubGroup==='muscle'?'active':''}" data-splitsub="muscle" style="flex:1; text-align:center; padding:5px 0; border-radius:12px; border:1px solid var(--line); font-size:10px; font-family:'Bebas Neue',sans-serif; letter-spacing:0.5px; color:${splitSubGroup==='muscle'?'var(--flame)':'var(--slate)'}; background:${splitSubGroup==='muscle'?'rgba(255,107,26,0.12)':'transparent'};">MUSCLE</div>
      </div>
    </div>` : ''}
  </div>`;
}
const ALT_COLORS = ["#2DD4BF","#9B7EDE","#E8A33D","#6FA8DC","#E8718D","#7FD17A"];

// Movement-pattern keywords used to cluster exercises that are plausible
// alternates of each other - same primary muscle AND same basic movement,
// matching the organizing principle already visible in existing alt groups
// (Press Alt, Row Alt, Curl Alt) rather than just "same muscle" alone, which
// would wrongly lump presses and flyes together just because both hit chest.
const MOVEMENT_PATTERNS = ['press','curl','row','raise','extension','fly','flye','pulldown','pushdown','squat','lunge','deadlift','crunch','dip','shrug','thrust'];
// Push/Pull and Upper/Lower classifiers for the split scanner. Chest/shoulders/
// triceps are push, back/biceps/forearms are pull - standard convention. Legs
// don't map cleanly to push/pull by muscle alone, so those fall back to movement
// pattern (squat/press = push, curl/deadlift/thrust = pull). Abs and neck are
// left unclassified for both splits rather than forcing a guess either way.
function classifyPushPull(muscle, exerciseName){
  const m = (muscle || '').toLowerCase();
  const n = (exerciseName || '').toLowerCase();
  // Rear delt work is a pulling motion (posterior deltoid, same pattern as
  // rows/face pulls) even though the broad muscle match comes back as
  // "shoulders" - this needs to be checked before the blanket shoulders=push
  // rule below, or every rear delt exercise gets wrongly pushed onto Push day.
  if (m === 'shoulders' && (n.includes('rear delt') || n.includes('face pull') ||
      (n.includes('rear') && (n.includes('fly') || n.includes('flye') || n.includes('raise'))) ||
      (n.includes('reverse') && (n.includes('fly') || n.includes('flye'))))) return 'pull';
  if (['chest','shoulders','triceps'].includes(m)) return 'push';
  if (['lats','traps','biceps','forearms','lower back','middle back'].includes(m)) return 'pull';
  if (['quadriceps','hamstrings','glutes','calves'].includes(m)){
    if (n.includes('press') || n.includes('squat') || n.includes('lunge')) return 'push';
    if (n.includes('curl') || n.includes('deadlift') || n.includes('thrust')) return 'pull';
  }
  return null;
}
function classifyUpperLower(muscle){
  const m = (muscle || '').toLowerCase();
  if (['quadriceps','hamstrings','glutes','calves','adductors','abductors'].includes(m)) return 'lower';
  if (['chest','shoulders','lats','traps','biceps','triceps','forearms','lower back','middle back'].includes(m)) return 'upper';
  return null;
}

// Derives which category an exercise falls into for a given split type. PPL
// specifically needs a 3-way split, but push_pull only ever holds push/pull -
// so Legs is derived from upper_lower==='lower' first, and push_pull only
// decides Push vs Pull for whatever's left (upper-body exercises).
function deriveSplitCategory(ex, splitType, muscle){
  const m = (muscle || '').toLowerCase();
  if (splitType === 'ppl'){
    const ul = ex.upper_lower || classifyUpperLower(m);
    if (ul === 'lower') return 'legs';
    return ex.push_pull || classifyPushPull(m, ex.name) || null;
  }
  if (splitType === 'upperlower') return ex.upper_lower || classifyUpperLower(m) || null;
  if (splitType === 'muscle') return (m && RAW_MUSCLE_TO_REGION[m]) || null;
  if (splitType === 'arnold'){
    // Classic Arnold split: Chest+Back paired as opposing big-muscle supersets,
    // Shoulders+Arms paired together, Legs on their own - a genuinely different
    // grouping than Push/Pull, which separates chest and back instead of pairing them.
    if (['quadriceps','hamstrings','glutes','calves'].includes(m)) return 'legs';
    if (['chest','lats','traps','middle back','lower back'].includes(m)) return 'chestback';
    if (['shoulders','biceps','triceps','forearms'].includes(m)) return 'shouldersarms';
    return null;
  }
  if (splitType === 'fullbody'){
    // Every exercise qualifies for every full-body day - this isn't a partition
    // like the others, it's "everything, repeated." Handled specially in the
    // reorganizer's apply step (duplicated per day rather than moved once).
    return m ? 'fullbody' : null;
  }
  return null; // custom - no auto-derivation, fully manual
}
const SPLIT_CATEGORY_LABELS = { push:'Push', pull:'Pull', legs:'Legs', upper:'Upper', lower:'Lower', chestback:'Chest & Back', shouldersarms:'Shoulders & Arms', fullbody:'Full Body' };

// Checks whether an exercise matches ONE SPECIFIC category, regardless of
// "split type" - used by Custom split, where each day can be assigned any
// category from any of the other splits (mix and match), not just the
// categories belonging to one split. Kept consistent with the same rules
// deriveSplitCategory uses, just checkable against an arbitrary target
// instead of only returning one canonical category per exercise.
// Collapses alt-group siblings into a single slot each (they're meant to be
// interchangeable, not all done in one session), keeping the others as swap
// options attached to that slot rather than separate rows. Exercises with no
// alt group just become their own single-item slot.
function collapseAltGroups(items){
  const byGroup = {};
  const standalone = [];
  items.forEach(it => {
    if (it.altGroupId){
      (byGroup[it.altGroupId] = byGroup[it.altGroupId] || []).push(it);
    } else {
      standalone.push({ representative: it, swapOptions: [] });
    }
  });
  const grouped = Object.values(byGroup).map(members => {
    const sorted = [...members].sort((a,b) => a.name.localeCompare(b.name));
    return { representative: sorted[0], swapOptions: sorted.slice(1) };
  });
  return [...standalone, ...grouped];
}

// Once alt-groups are collapsed, a genuinely large day can still exceed what
// fits a session. Rather than an arbitrary cut, this rounds-robins across
// fine muscle regions (so a Push day doesn't accidentally load up on chest
// with no triceps) and prefers compound movements first within each region.
// Anything not selected stays visible, just unchecked by default - never
// removed, always one tap away from being added back.
function selectBalancedSlots(slots, targetSize, crossDayUsage){
  crossDayUsage = crossDayUsage || { region: {}, name: {} };
  if (slots.length <= targetSize) return { included: slots, excluded: [] };
  const byRegion = {};
  slots.forEach(s => {
    const rep = s.representative;
    const region = rep.muscle ? fineMuscleCategory(rep.muscle, rep.name) : 'Other';
    (byRegion[region] = byRegion[region] || []).push(s);
  });
  Object.values(byRegion).forEach(list => {
    list.sort((a, b) => {
      const am = a.representative.mechanic, bm = b.representative.mechanic;
      if (am !== bm){
        if (am === 'compound') return -1;
        if (bm === 'compound') return 1;
      }
      // Within a region, prefer whichever specific exercise has been used
      // less across the days already processed this week - tracked per
      // exercise name, not per signature, since multiple exercises sharing a
      // signature would otherwise always look identically "used" and never
      // actually get distinguished from each other here.
      const aUse = crossDayUsage.name[a.representative.name.toLowerCase()] || 0;
      const bUse = crossDayUsage.name[b.representative.name.toLowerCase()] || 0;
      return aUse - bUse;
    });
  });
  // Regions used less across the week so far get priority in the round-robin,
  // so an under-covered muscle group doesn't keep losing out to the same
  // heavily-favored ones on every single day.
  const regionKeys = Object.keys(byRegion).sort((a, b) => {
    const aUse = crossDayUsage.region[a] || 0;
    const bUse = crossDayUsage.region[b] || 0;
    return aUse - bUse;
  });
  const included = [];
  let idx = 0;
  while (included.length < targetSize && regionKeys.some(r => byRegion[r].length)){
    const region = regionKeys[idx % regionKeys.length];
    const list = byRegion[region];
    if (list.length) included.push(list.shift());
    idx++;
  }
  const includedSet = new Set(included);
  const excluded = slots.filter(s => !includedSet.has(s));
  return { included, excluded };
}

function exerciseMatchesCategory(ex, muscle, category){
  const m = (muscle || '').toLowerCase();
  const ul = ex.upper_lower || classifyUpperLower(m);
  const pp = ex.push_pull || classifyPushPull(m, ex.name);
  if (category === 'push') return pp === 'push' && ul !== 'lower';
  if (category === 'pull') return pp === 'pull' && ul !== 'lower';
  if (category === 'legs') return ul === 'lower';
  if (category === 'upper') return ul === 'upper';
  if (category === 'lower') return ul === 'lower';
  if (category === 'chestback') return ['chest','lats','traps','middle back','lower back'].includes(m);
  if (category === 'shouldersarms') return ['shoulders','biceps','triceps','forearms'].includes(m);
  if (category === 'fullbody') return !!m;
  return m === category; // bro-split style: category IS the muscle name directly
}

function movementPatternOf(name){
  const n = name.toLowerCase();
  if (n.includes('calf') || n.includes('calve')){
    if (!n.includes('stretch') && !n.includes('walk')) return 'raise';
  }
  return MOVEMENT_PATTERNS.find(p => n.includes(p)) || null;
}

// Groups a day's ungrouped exercises into proposed alt-group clusters (2+
// members sharing the same fine muscle region). Returns proposals only -
// nothing is created or assigned until the user confirms each one
// individually in the review screen.
// Muscle is the only matching signal - not movement pattern, not compound
// vs isolation. Whether a squat and a leg extension are close enough to
// swap for each other is a call the person makes for themselves; the
// algorithm's job is just to surface "these all hit the same muscle,"
// not to pre-filter out anything that isn't the exact same movement.
// Reused in the reorganize overflow and the add-exercise picker to hint
// "this looks like an alt for X" without relying on formal alt_group_id
// tags, since those may not exist yet.
function computeAltSignature(name, muscle, mechValue){
  if (!muscle) return null;
  return fineMuscleCategory(muscle, name);
}

async function proposeAltGroups(dayExercises){
  const db = await loadExerciseDB();
  const ungrouped = dayExercises.filter(ex => !ex.alt_group_id);
  // Fine muscle category is the only grouping signal. Calves is deliberately
  // collapsed to one category at the fineMuscleCategory level itself
  // (standing/seated/leg-press calf raises genuinely read as
  // interchangeable), but biceps long head vs short head vs brachialis, or
  // triceps long vs lateral head, are meaningfully different exercises that
  // should stay in their own groups rather than all getting lumped under one
  // generic muscle name.
  const buckets = {};
  ungrouped.forEach(ex => {
    const match = matchExercise(ex.name, db);
    const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
    if (!muscle) return;
    const fineMuscle = fineMuscleCategory(muscle, ex.name);
    (buckets[fineMuscle] = buckets[fineMuscle] || []).push(ex);
  });
  return Object.entries(buckets)
    .filter(([, members]) => members.length >= 2)
    .map(([key, members], i) => {
      const [fineMuscle] = key.split('|');
      return {
        suggestedName: `${fineMuscle} Alt`,
        muscle: fineMuscle,
        color: ALT_COLORS[i % ALT_COLORS.length],
        members
      };
    });
}

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
// How far back the per-exercise set history query reaches. This feeds the
// "last set", stagnation detection, and the all-time-max PR badge. Pulling
// unbounded history meant every Track render and every day-chip tap
// re-transferred the user's entire logging history, which grows without
// limit. Two years comfortably covers any lift the user is actively
// training - a "personal record" from more than two years ago on a lift
// you still do is effectively unheard of, and the badge is more meaningful
// scoped to recent training anyway.
const SET_HISTORY_WINDOW_DAYS = 730;
function setHistoryCutoff(){ return addDaysToDate(todayStr(), -SET_HISTORY_WINDOW_DAYS); }

// Cached, timeout-protected current user.
//
// supabaseClient.auth.getUser() can hit the network to validate/refresh the
// token. With no timeout that call can hang indefinitely, and since it sits
// at the top of every loader a single stalled call freezes the whole render
// on "Loading your exercises…" forever. The user also cannot change within a
// session, so calling it repeatedly per render was wasted round-trips.
//
// This caches the resolved user for the session, prefers the already-held
// local session object (no network at all), and hard-caps the fallback so a
// stalled auth call degrades into a normal error state instead of a hang.
let __cachedUser = null;
let __cachedUserPromise = null;
async function getCurrentUser(){
  if (__cachedUser) return __cachedUser;
  if (__cachedUserPromise) return __cachedUserPromise;
  __cachedUserPromise = (async () => {
    // The session we already hold carries the user - use it and skip the
    // network entirely, which is the common case after login.
    if (state.session && state.session.user){
      __cachedUser = state.session.user;
      return __cachedUser;
    }
    const res = await withTimeout(supabaseClient.auth.getUser(), 8000);
    if (res && !res.__timeout && res.data && res.data.user){
      __cachedUser = res.data.user;
      return __cachedUser;
    }
    return null;
  })().finally(() => { __cachedUserPromise = null; });
  return __cachedUserPromise;
}
function clearCachedUser(){ __cachedUser = null; __cachedUserPromise = null; }

function todayStr(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Single source of truth for "what calendar date does the currently-viewed
// day chip represent?" Both the header stats (Volume/Sets Today) and every
// exercise card's loggedToday flag use this so they never contradict each
// other. If the chip's this-week occurrence is in the future, targetIsFuture
// is true and callers should treat as no-data-yet (not fall back to last
// week's occurrence, which would misleadingly suggest activity).
function targetDateInfo(){
  const targetWeekday = state.selectedDay;
  // Anytime has no place in the calendar, so its stats are simply today's.
  if (isAnyDay(targetWeekday)){
    return { targetWeekday, targetDateStr: todayStr(), doneDateStr: todayStr(), targetDateIsToday: true, targetIsFuture: false };
  }
  const nowWd = todayWeekday();
  const daysDiff = targetWeekday - nowWd; // positive = future this week, 0 = today, negative = past this week
  const targetIsFuture = daysDiff > 0;
  const targetDateIsToday = daysDiff === 0;
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysDiff);
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  const targetDateStr = `${yyyy}-${mm}-${dd}`;
  // Which date decides whether a card shows as done. Sets are always
  // recorded with today's date, so when you work from a future day's plan -
  // doing Friday's session on Thursday - the completion check has to look at
  // today or nothing you just logged would ever turn green.
  const doneDateStr = targetIsFuture ? todayStr() : targetDateStr;
  return { targetWeekday, targetDateStr, doneDateStr, targetDateIsToday, targetIsFuture };
}

const SHORT_DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const SHORT_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Parses a plain YYYY-MM-DD string as a local calendar date rather than through
// the Date constructor directly, which would otherwise interpret it as UTC
// midnight and can shift the displayed day by one depending on timezone.
function formatLoggedDate(dateStr){
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${SHORT_DAY_NAMES[dt.getDay()]}, ${SHORT_MONTH_NAMES[dt.getMonth()]} ${d}`;
}

const app = document.getElementById('app');
let state = { selectedDay: todayWeekday(), exercises: [], session: null, currentTab: 'track', trackScrollY: 0, renderGeneration: 0 };

const ICON_TRACK = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="4" height="16" rx="1.2"/><rect x="17" y="4" width="4" height="16" rx="1.2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`;
const ICON_SCALE = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="3"/><circle cx="12" cy="12.5" r="5"/><line x1="12" y1="12.5" x2="15" y2="10"/></svg>`;
const ICON_BALANCE = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18"/></svg>`;
const ICON_PHASE = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 3 8-8"/><path d="M20 7v5h-5"/></svg>`;

// Shared brandbar. Me lives here as an icon on every screen rather than
// occupying a tab slot - it's an occasional settings destination, not a peer
// of the daily workflow. `extras` lets a screen inject its own controls
// (the Lift screen's location chip) to the left of the Me button.
function renderBrandbar(extras){
  return `<div class="brandbar"><img src="icons/logo.svg" alt=""><div class="name">MONOLIFT</div>
    <div class="bb-right">${extras || ''}
      <button class="icon-btn me" id="brandMeBtn" aria-label="Me">${ICON_ME}</button>
    </div></div>`;
}
const ICON_ME = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="7.5" r="4"/><path d="M3 21c0-5 4-8 9-8s9 3 9 8"/></svg>`;
const ICON_CHECK = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8FBF7A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function renderTabbar(){
  // NAMING NOTE: display labels differ from internal tab ids, which were
  // left unchanged to avoid a large error-prone rename across the file.
  // renderTrack() = exercise logging = "Lift" tab (id 'track').
  // renderScale() = bodyweight + measurements = "Track" tab (id 'scale').
  // renderPhaseTab() = bulk/cut + insights = "Phase" tab (id 'phase').
  return `<div class="tabbar">
    <button class="tab-item ${state.currentTab==='track'?'active':''}" data-tab="track">${ICON_TRACK}<span>Lift</span></button>
    <button class="tab-item ${state.currentTab==='balance'?'active':''}" data-tab="balance">${ICON_BALANCE}<span>Balance</span></button>
    <div class="fab-wrap"><button class="fab" id="fabBtn">${`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#17181A" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`}</button></div>
    <button class="tab-item ${state.currentTab==='scale'?'active':''}" data-tab="scale">${ICON_SCALE}<span>Track</span></button>
    <button class="tab-item ${state.currentTab==='phase'?'active':''}" data-tab="phase">${ICON_PHASE}<span>Phase</span></button>
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
      else if (tab === 'phase') renderPhaseTab();
      else if (tab === 'me') renderMe();
    };
  });
  const brandMe = document.getElementById('brandMeBtn');
  if (brandMe) brandMe.onclick = () => { state.currentTab = 'me'; removeSideIndex(); renderMe(); };
  const fab = document.getElementById('fabBtn');
  if (fab) fab.onclick = () => {
    // Weigh-in from both body screens - on Phase, weight is the input that
    // drives every insight on that page, so logging it there is the natural
    // action rather than an arbitrary one.
    if (state.currentTab === 'scale' || state.currentTab === 'phase') openLogWeightForm(state.lastMeasurementUnit);
    else openPicker(); // lift, balance default to the set-logging picker
  };
}

// ---------- LOGIN ----------
function renderLogin(){
  app.innerHTML = `
    <div class="app-shell">
      <div class="login-wrap">
        <div class="logo-circle"><img src="icons/icon-192-v5.png" srcset="icons/icon-192-v5.png 2x, icons/icon-384-v5.png 3x" width="48" height="48" alt="" style="width:48px; height:48px;"></div>
        <div class="app-name">MonoLift</div>
        <div class="login-sub">Sign in to sync your data</div>
        <input class="input-field" id="emailInput" type="email" placeholder="you@email.com" autocomplete="email">
        <button class="btn-primary" id="sendCodeBtn">Send Code</button>
        <div class="login-status" id="loginStatus"></div>
        <div class="login-error" id="loginError"></div>
        <div class="login-note">No password needed — we'll email you a sign-in code or link.</div>
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
        <div class="logo-circle"><img src="icons/icon-192-v5.png" srcset="icons/icon-192-v5.png 2x, icons/icon-384-v5.png 3x" width="48" height="48" alt="" style="width:48px; height:48px;"></div>
        <div class="app-name">MonoLift</div>
        <div class="login-sub">Check ${email} for a sign-in email</div>
        <div class="small" style="text-align:center; color:var(--slate); margin:-8px 0 4px 0; padding:0 20px; line-height:1.4;">If it has a code, enter it below. If it's a link instead, just tap it — that signs you in directly, no code needed.</div>
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
    if (!code || code.length < 6){ errEl.textContent = 'Enter the code from your email, or tap the link in it instead.'; return; }

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
async function loadExercises(generation){
  if (getUseExerciseMasterFlag()) return loadExercisesFromMaster(generation);
  // Stale-write guard - if the calling renderTrack has been superseded by
  // a later one, this call must not overwrite state.exercises with its
  // now-outdated day-specific data.
  const isStale = () => generation !== undefined && state.renderGeneration !== generation;
  const userData = { user: await getCurrentUser() };
  if (!userData || !userData.user){
    if (isStale()) return;
    state.exercises = null;
    state.exercisesError = 'session expired';
    return;
  }
  let result = await withTimeout(
    supabaseClient.from('exercises')
      .select('id, name, category, alt_group_id, alt_groups(name, color), location_ids, muscle_override, measurement_type, uses_door_anchor, door_anchor_level')
      .eq('user_id', userData.user.id)
      .eq('weekday', state.selectedDay)
      .eq('active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true }),
    15000
  );
  // Resilience fix: a query error here (e.g. a newer optional column like
  // muscle_override not existing yet because its migration hasn't been run)
  // used to silently wipe the entire exercise list, making the whole app look
  // like all workouts had disappeared. Retry without the optional field
  // rather than giving up entirely - the core exercise list should never
  // depend on a newer, optional column being present.
  if (!result.__timeout && result.error){
    console.error('Exercise query failed, retrying without muscle_override:', result.error);
    result = await withTimeout(
      supabaseClient.from('exercises')
        .select('id, name, category, alt_group_id, alt_groups(name, color), location_ids')
        .eq('user_id', userData.user.id)
        .eq('weekday', state.selectedDay)
        .eq('active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true }),
      15000
    );
  }
  if (isStale()) return;
  // A failed load must NEVER fall back to an empty state - that looks
  // identical to "your plan just got wiped" and prompts the empty-state
  // suggestions block to render, which looks like defaults being applied.
  // Use a null marker to signal load failure so renderTrack shows an
  // explicit error message instead.
  if (result.__timeout){ state.exercises = null; state.exercisesError = 'timeout'; return; }
  const { data: exercises, error } = result;
  if (error){ console.error(error); state.exercises = null; state.exercisesError = error.message || 'unknown error'; return; }
  state.exercisesError = null;

  const exerciseIds = (exercises || []).map(ex => ex.id);
  let lastSetByExercise = {};
  let maxSetByExercise = {};
  let loggedOnTargetByExId = new Set();
  if (exerciseIds.length){
    const userData = { user: await getCurrentUser() };
    // The same exercise name can exist as separate records on other days, each
    // with its own isolated set history. Find every sibling record sharing each
    // exercise's name so the PR reflects the true all-time best, not just what
    // happens to be logged against today's specific copy of the exercise.
    const namesResult = await withTimeout(
      supabaseClient.from('exercises').select('id, name').eq('user_id', userData.user.id),
      15000
    );
    const allUserExercises = namesResult.__timeout || namesResult.error ? [] : (namesResult.data || []);
    const idsByLowerName = {};
    allUserExercises.forEach(ex => {
      const key = (ex.name || '').toLowerCase();
      (idsByLowerName[key] = idsByLowerName[key] || []).push(ex.id);
    });
    const prQueryIds = new Set(exerciseIds);
    exercises.forEach(ex => {
      const siblings = idsByLowerName[(ex.name || '').toLowerCase()] || [];
      siblings.forEach(id => prQueryIds.add(id));
    });

    let setsResult = await withTimeout(
      supabaseClient.from('sets').select('exercise_id, weight, weight_unit, weight_type, reps, num_sets, logged_at, location_id, measurement_type, band_snapshot, band_resistance, band_resistance_unit')
        .in('exercise_id', [...prQueryIds]).gte('logged_at', setHistoryCutoff()).order('logged_at', { ascending: false }).limit(4000),
      15000
    );
    // Same resilience fix as the exercises query above - a newer optional
    // column not being migrated yet should never wipe out PR/history data for
    // every exercise on Track.
    let locationDataAvailable = true;
    if (!setsResult.__timeout && setsResult.error){
      console.error('Sets query failed, retrying without location_id:', setsResult.error);
      locationDataAvailable = false;
      setsResult = await withTimeout(
        supabaseClient.from('sets').select('exercise_id, weight, weight_unit, weight_type, reps, num_sets, logged_at')
          .in('exercise_id', [...prQueryIds]).gte('logged_at', setHistoryCutoff()).order('logged_at', { ascending: false }).limit(4000),
        15000
      );
    }
    let allSets = setsResult.__timeout || setsResult.error ? [] : (setsResult.data || []);
    const idToLowerName = {};
    allUserExercises.forEach(ex => { idToLowerName[ex.id] = (ex.name || '').toLowerCase(); });
    // Track's row preview reflects the currently EFFECTIVE location (falls
    // back to the default location, not just an explicit same-day pick -
    // getCurrentLocationId() returns null on any day you haven't re-tapped
    // a location chip, which is most days, silently disabling this scoping
    // almost all the time). Prefers the most recent set AT that location;
    // if this exercise has never been logged there, falls back to the most
    // recent set anywhere rather than showing nothing - the same two-tier
    // pattern already used correctly by "Same As Last Time" in the log form.
    const activeLocationId = effectiveLocationId();
    const filterByLocation = activeLocationId && locationDataAvailable;
    // Results are ordered newest-first, so the first time we see an
    // exercise_id at the target location is its most recent set there.
    if (filterByLocation){
      allSets.forEach(s => { if (s.location_id === activeLocationId && !lastSetByExercise[s.exercise_id]) lastSetByExercise[s.exercise_id] = s; });
    }
    // Any-location fallback for exercises with nothing at the current location.
    allSets.forEach(s => { if (!lastSetByExercise[s.exercise_id]) lastSetByExercise[s.exercise_id] = s; });
    // Set of exercise IDs that have a set logged on the target date (the
    // specific calendar date the current chip represents). This makes the
    // loggedToday flag on each card consistent with the header stats -
    // both use the same date reference.
    const targetInfo = targetDateInfo();
    allSets.forEach(s => { if (s.logged_at === targetInfo.doneDateStr) loggedOnTargetByExId.add(s.exercise_id); });
    // Track the all-time best set per exercise NAME (spanning every sibling record
    // across every day), on ANY day - not just today's session. Only weight-based
    // units (kg/lb) are comparable across entries via conversion; other unit types
    // (pin/level/sec/etc) are compared as raw values, assuming a given exercise
    // stays on one consistent unit type in practice.
    allSets.forEach(s => {
      if (s.weight === null || s.weight === undefined) return;
      const key = idToLowerName[s.exercise_id];
      if (!key) return;
      const current = maxSetByExercise[key];
      if (!current){ maxSetByExercise[key] = s; return; }
      const sVal = (s.weight_unit === 'kg' || s.weight_unit === 'lb') ? convertWeight(s.weight, s.weight_unit, 'kg') : s.weight;
      const curVal = (current.weight_unit === 'kg' || current.weight_unit === 'lb') ? convertWeight(current.weight, current.weight_unit, 'kg') : current.weight;
      if (s.weight_unit === current.weight_unit || ((s.weight_unit==='kg'||s.weight_unit==='lb') && (current.weight_unit==='kg'||current.weight_unit==='lb'))){
        if (sVal > curVal) maxSetByExercise[key] = s;
      }
    });
  }
  const withLogs = (exercises || []).map(ex => {
    const lastSet = lastSetByExercise[ex.id] || null;
    const loggedToday = loggedOnTargetByExId.has(ex.id);
    const maxSet = maxSetByExercise[(ex.name || '').toLowerCase()] || null;
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

  if (isStale()) return;
  state.exercises = withLogs;
}

// The exercise_master version of loadExercises - one row per real exercise,
// so all the old sibling-hunting-by-name logic (needed because the same
// exercise used to live as separate isolated records per day) simply isn't
// needed anymore. Produces the exact same output shape as loadExercises so
// everything downstream (renderTrack, exerciseRow, etc.) works unmodified.
// Flags an exercise as stagnant if its top weight hasn't increased across
// the last 3-4 completed sessions (today's own attempt is excluded, since
// it's in progress, not yet a completed comparison point). Needs at least 3
// distinct prior sessions before judging - not enough history otherwise.
function detectWeightStagnation(setsForExercise){
  const byDate = {};
  setsForExercise.forEach(s => {
    if (typeof s.weight !== 'number' || (s.weight_unit !== 'kg' && s.weight_unit !== 'lb')) return;
    const kg = s.weight_unit === 'lb' ? convertWeight(s.weight, 'lb', 'kg') : s.weight;
    const perSideKg = s.weight_type === 'per' ? kg * 2 : kg;
    if (!byDate[s.logged_at] || perSideKg > byDate[s.logged_at]) byDate[s.logged_at] = perSideKg;
  });
  const today = todayStr();
  // Need at least 3 completed (pre-today) sessions before judging anything -
  // not enough history otherwise.
  const priorSessions = Object.entries(byDate)
    .filter(([date]) => date !== today)
    .sort((a,b) => b[0].localeCompare(a[0]))
    .slice(0, 4);
  if (priorSessions.length < 3) return false;
  const oldestWeight = priorSessions[priorSessions.length-1][1];
  // Whatever's most recent overall - today's own log if it exists, otherwise
  // the last completed session - is what actually gets compared. A real
  // increase logged today clears the note immediately, same day.
  const mostRecentWeight = byDate[today] !== undefined ? byDate[today] : priorSessions[0][1];
  return mostRecentWeight <= oldestWeight + 0.01;
}

async function loadExercisesFromMaster(generation){
  const isStale = () => generation !== undefined && state.renderGeneration !== generation;
  const userData = { user: await getCurrentUser() };
  if (!userData || !userData.user){
    // Session gone mid-render - fail into the explicit error state rather
    // than crashing, so the user sees "Could not load" not a blank screen.
    if (isStale()) return;
    state.exercises = null;
    state.exercisesError = 'session expired';
    return;
  }
  const uid = userData.user.id;

  const result = await withTimeout(
    supabaseClient.from('exercise_days')
      .select('exercise_master_id, exercise_master(id, name, category, alt_group_id, alt_groups(name, color), location_ids, muscle_override, measurement_type, uses_door_anchor, door_anchor_level)')
      .eq('user_id', uid)
      .eq('weekday', state.selectedDay),
    15000
  );
  if (isStale()) return;
  // Failed load must NOT fall back to empty state - that looks identical
  // to "plan got wiped" and triggers the misleading suggestions block.
  if (result.__timeout || result.error){
    console.error('exercise_days query failed', result.error);
    state.exercises = null;
    state.exercisesError = result.__timeout ? 'timeout' : (result.error?.message || 'unknown error');
    return;
  }
  state.exercisesError = null;

  const exercises = (result.data || [])
    .map(row => row.exercise_master)
    .filter(Boolean)
    .sort((a,b) => (a.category||'').localeCompare(b.category||'') || a.name.localeCompare(b.name));

  const masterIds = exercises.map(ex => ex.id);
  let lastSetByExercise = {};
  let maxSetByExercise = {};
  let setsByExerciseId = {};
  let loggedOnTargetByExId = new Set();
  if (masterIds.length){
    let setsResult = await withTimeout(
      supabaseClient.from('sets').select('exercise_master_id, weight, weight_unit, weight_type, reps, num_sets, logged_at, location_id, measurement_type, band_snapshot, band_resistance, band_resistance_unit')
        .in('exercise_master_id', masterIds).gte('logged_at', setHistoryCutoff()).order('logged_at', { ascending: false }).limit(4000),
      15000
    );
    let locationDataAvailable = true;
    if (!setsResult.__timeout && setsResult.error){
      console.error('Sets query failed, retrying without location_id:', setsResult.error);
      locationDataAvailable = false;
      setsResult = await withTimeout(
        supabaseClient.from('sets').select('exercise_master_id, weight, weight_unit, weight_type, reps, num_sets, logged_at')
          .in('exercise_master_id', masterIds).gte('logged_at', setHistoryCutoff()).order('logged_at', { ascending: false }).limit(4000),
        15000
      );
    }
    let allSets = setsResult.__timeout || setsResult.error ? [] : (setsResult.data || []);
    // Same fix as the legacy loader above: use the EFFECTIVE location (falls
    // back to the default, not just an explicit same-day pick) and a
    // two-tier fallback - most recent AT this location, or most recent
    // anywhere if this exercise has never been logged here. PR (maxSet
    // below) is deliberately computed from the full unfiltered allSets, so a
    // true all-time best is not silently hidden just because it happened at
    // a different gym.
    const activeLocationId = effectiveLocationId();
    const filterByLocation = activeLocationId && locationDataAvailable;
    if (filterByLocation){
      allSets.forEach(s => { if (s.location_id === activeLocationId && !lastSetByExercise[s.exercise_master_id]) lastSetByExercise[s.exercise_master_id] = s; });
    }
    allSets.forEach(s => { if (!lastSetByExercise[s.exercise_master_id]) lastSetByExercise[s.exercise_master_id] = s; });
    allSets.forEach(s => {
      (setsByExerciseId[s.exercise_master_id] = setsByExerciseId[s.exercise_master_id] || []).push(s);
    });
    allSets.forEach(s => {
      if (s.weight === null || s.weight === undefined) return;
      const key = s.exercise_master_id;
      const current = maxSetByExercise[key];
      if (!current){ maxSetByExercise[key] = s; return; }
      const sVal = (s.weight_unit === 'kg' || s.weight_unit === 'lb') ? convertWeight(s.weight, s.weight_unit, 'kg') : s.weight;
      const curVal = (current.weight_unit === 'kg' || current.weight_unit === 'lb') ? convertWeight(current.weight, current.weight_unit, 'kg') : current.weight;
      if (s.weight_unit === current.weight_unit || ((s.weight_unit==='kg'||s.weight_unit==='lb') && (current.weight_unit==='kg'||current.weight_unit==='lb'))){
        if (sVal > curVal) maxSetByExercise[key] = s;
      }
    });
    // Set of exercise IDs that have a set logged on the target date (the
    // specific calendar date the current chip represents). Matches the
    // header stats' date reference so loggedToday flags on cards stay
    // consistent with the header numbers.
    const targetInfo = targetDateInfo();
    allSets.forEach(s => { if (s.logged_at === targetInfo.doneDateStr) loggedOnTargetByExId.add(s.exercise_master_id); });
  }

  const withLogs = exercises.map(ex => {
    const lastSet = lastSetByExercise[ex.id] || null;
    const loggedToday = loggedOnTargetByExId.has(ex.id);
    const maxSet = maxSetByExercise[ex.id] || null;
    const showPr = maxSet && lastSet && maxSet.logged_at !== lastSet.logged_at;
    const stagnant = detectWeightStagnation(setsByExerciseId[ex.id] || []);
    return { ...ex, lastSet, loggedToday, maxSet, showPr, stagnant };
  });

  const doneGroupMember = {};
  withLogs.forEach(ex => { if (ex.alt_group_id && ex.loggedToday) doneGroupMember[ex.alt_group_id] = ex.name; });
  withLogs.forEach(ex => {
    if (ex.alt_group_id && !ex.loggedToday && doneGroupMember[ex.alt_group_id]) {
      ex.completeVia = doneGroupMember[ex.alt_group_id];
    }
  });

  if (isStale()) return;
  state.exercises = withLogs;
}


// date alongside it, and once that date has passed, treat it as unset rather
// than silently staying stuck on whatever was picked days ago. Falls through
// to the designated Default Location (or Anywhere) each new day.
// Every "add this exercise to this day" path should go through here. The
// database now has a real unique constraint preventing same-day duplicates
// (see migration_unique_exercise_per_day.sql) - this is the backstop behind
// the app-level checks already in place at each call site, so even a path I
// missed, or a race condition, can't create a duplicate. A constraint
// violation here means someone else already created the exact same row a
// moment ago - not a real error, just fetch and reuse it.
// Wraps any button's async action with immediate visual feedback - shows
// interim text and disables the button the instant it's tapped, restores it
// once the action finishes either way. Meant to be used everywhere a button
// triggers something that talks to the network, since without this a slow
// connection makes it look like the tap did nothing at all.
// Replaces native confirm() everywhere in the app - confirm() is
// well-documented to be unreliable in standalone iOS PWA mode, sometimes
// returning false immediately with no dialog ever shown at all, which
// silently skips whatever came after it. This never depends on a native
// browser dialog.
function showConfirmDialog(message, onConfirm, opts){
  opts = opts || {};
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:60; display:flex; align-items:center; justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--panel); border-radius:16px; padding:22px; width:300px; text-align:center;">
      ${opts.title ? `<div style="font-family:'Oswald', sans-serif; font-size:16px; margin-bottom:8px;">${opts.title}</div>` : ''}
      <div style="font-size:13px; color:var(--slate); margin-bottom:18px; line-height:1.5;">${message}</div>
      <div style="display:flex; gap:10px;">
        <button id="genericConfirmCancel" style="flex:1; padding:11px; border-radius:10px; background:var(--ink); color:var(--chalk); font-size:13px;">Cancel</button>
        <button id="genericConfirmOk" style="flex:1; padding:11px; border-radius:10px; background:${opts.danger ? '#E8492A' : 'var(--flame)'}; color:${opts.danger ? 'white' : 'var(--ink)'}; font-weight:600; font-size:13px;">${opts.confirmLabel || 'Confirm'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#genericConfirmCancel').onclick = () => overlay.remove();
  let firing = false;
  overlay.querySelector('#genericConfirmOk').onclick = () => {
    if (firing) return; // prevent double-tap firing onConfirm twice for destructive actions
    firing = true;
    overlay.remove();
    onConfirm();
  };
}

async function withButtonLoading(btn, loadingText, asyncFn){
  if (!btn) return asyncFn();
  const originalText = btn.textContent;
  const originalDisabled = btn.disabled;
  btn.textContent = loadingText;
  btn.disabled = true;
  try {
    return await asyncFn();
  } finally {
    // The button (or its whole overlay) may have already been removed from
    // the DOM by the time this runs - only restore if it's still there.
    if (document.body.contains(btn)){
      btn.textContent = originalText;
      btn.disabled = originalDisabled;
    }
  }
}

async function insertExerciseSafely(payload){
  const result = await supabaseClient.from('exercises').insert(payload).select();
  if (!result.error) return { data: result.data, error: null, wasExisting: false };
  if (result.error.code === '23505'){
    const existing = await withTimeout(
      supabaseClient.from('exercises').select('*').eq('user_id', payload.user_id).eq('weekday', payload.weekday).ilike('name', payload.name).eq('active', true).maybeSingle(),
      15000
    );
    if (!existing.__timeout && !existing.error && existing.data){
      return { data: [existing.data], error: null, wasExisting: true };
    }
  }
  return { data: null, error: result.error, wasExisting: false };
}

// The one place any "add this exercise to this day" flow should go through.
// Under the old structure this is just insertExerciseSafely. Under the new
// structure, it finds-or-creates the master record by name, then links it to
// the requested day - critical, since every creation flow used to insert
// old-style per-day rows unconditionally, and passing that id into the log
// form under the new structure caused a foreign key violation the moment
// someone tried to save a set, since that id doesn't exist in exercise_master.
async function fetchAllExercisesCompat(uid){
  // Wait for the master-flag heal to complete before deciding which schema
  // to read from. Without this, callers like the reorganizer or merge
  // duplicates would base their write decisions on possibly-stale
  // old-table data if invoked during the boot window.
  await awaitMasterFlagHealed();
  if (!getUseExerciseMasterFlag()){
    const result = await withTimeout(
      supabaseClient.from('exercises').select('id, name, category, weekday, alt_group_id, push_pull, upper_lower, location_ids').eq('user_id', uid).eq('active', true),
      15000
    );
    return result.__timeout || result.error ? [] : (result.data || []);
  }
  // exercise_master is the full library - queried directly here, rather than
  // discovered indirectly through exercise_days, since the reorganizer needs
  // to know about every exercise the user has ever used to be able to place
  // it somewhere, not just whatever happens to currently be on a day. An
  // exercise with zero current placements (e.g. every day was just cleared)
  // still needs to show up here, or the reorganizer has nothing to work with
  // at all even though the exercise genuinely still exists.
  const [masterResult, daysResult] = await Promise.all([
    withTimeout(supabaseClient.from('exercise_master').select('id, name, category, alt_group_id, push_pull, upper_lower, location_ids').eq('user_id', uid), 15000),
    withTimeout(supabaseClient.from('exercise_days').select('id, exercise_master_id, weekday').eq('user_id', uid), 15000)
  ]);
  if (masterResult.__timeout || masterResult.error) return [];
  const masters = masterResult.data || [];
  const days = daysResult.__timeout || daysResult.error ? [] : (daysResult.data || []);
  const daysByMaster = {};
  days.forEach(d => { (daysByMaster[d.exercise_master_id] = daysByMaster[d.exercise_master_id] || []).push(d); });

  const compat = [];
  masters.forEach(m => {
    const placements = daysByMaster[m.id] || [];
    const base = { masterId: m.id, name: m.name, category: m.category, alt_group_id: m.alt_group_id, push_pull: m.push_pull, upper_lower: m.upper_lower, location_ids: m.location_ids };
    if (placements.length){
      placements.forEach(p => compat.push({ ...base, id: p.id, weekday: p.weekday }));
    } else {
      compat.push({ ...base, id: null, weekday: null }); // not currently on any day, but still needs to be discoverable
    }
  });
  return compat;
}

// Moves an exercise to a different day - under the old structure that's just
// updating the row's own weekday (and clearing alt_group_id in the same
// call, since both live on the same table). Under the new structure, weekday
// lives on exercise_days while alt_group_id lives on exercise_master, so
// these need to be two separate calls against two different tables.
async function moveExerciseToDay(item, newWeekday, clearAlt){
  invalidateTrackSnapshots(); // day contents change - stale snapshot must not survive
  const results = [];
  if (!getUseExerciseMasterFlag()){
    for (const id of item.ids){
      const payload = { weekday: newWeekday };
      if (clearAlt) payload.alt_group_id = null;
      const { data, error } = await supabaseClient.from('exercises').update(payload).eq('id', id).select();
      results.push({ id, ok: !error && data && data.length > 0, error: error ? error.message : (!data || !data.length ? 'update matched zero rows' : null) });
    }
    return results;
  }
  // An exercise can legitimately already be linked to several different days
  // at once (e.g. a Push exercise appearing on both Monday and Thursday under
  // a twice-weekly split) - trying to "move" every one of its existing links
  // to this one target day would collide with itself the moment more than one
  // of those links needs the same new weekday, which is exactly what was
  // causing the unique constraint violations. Instead: just make sure a link
  // for this exact exercise+day exists. Existing links on other days are left
  // completely alone - the exercise keeps showing up wherever else it
  // legitimately belongs, and the separate cleanup pass is what removes
  // anything that's genuinely stale now.
  if (!item.masterId){ results.push({ id: null, ok: false, error: 'no master id on this item' }); return results; }
  const existing = await withTimeout(
    supabaseClient.from('exercise_days').select('id').eq('exercise_master_id', item.masterId).eq('weekday', newWeekday).maybeSingle(),
    15000
  );
  if (!existing.__timeout && !existing.error && existing.data){
    results.push({ id: existing.data.id, ok: true, error: null }); // already exists, nothing to do
  } else {
    const userData = { user: await getCurrentUser() };
    const { data, error } = await supabaseClient.from('exercise_days').insert({
      user_id: userData.user.id, exercise_master_id: item.masterId, weekday: newWeekday
    }).select();
    results.push({ id: data && data[0] ? data[0].id : null, ok: !error && data && data.length > 0, error: error ? error.message : null });
  }
  if (clearAlt && item.masterId){
    await supabaseClient.from('exercise_master').update({ alt_group_id: null }).eq('id', item.masterId);
  }
  return results;
}

// Removes an exercise from a specific day - old structure soft-deactivates
// the row (it's day-specific already, so nothing else is affected). New
// structure deletes just that day's link, since the exercise_master record
// itself may still be legitimately placed on other days.
async function removeExerciseFromDay(exerciseRow){
  invalidateTrackSnapshots(); // day contents change - stale snapshot must not survive
  if (!getUseExerciseMasterFlag()){
    const { data, error } = await supabaseClient.from('exercises').update({ active: false }).eq('id', exerciseRow.id).select();
    return { ok: !error && data && data.length > 0, error: error ? error.message : (!data || !data.length ? 'update matched zero rows' : null) };
  }
  const { data, error } = await supabaseClient.from('exercise_days').delete().eq('id', exerciseRow.id).select();
  return { ok: !error && data && data.length > 0, error: error ? error.message : (!data || !data.length ? 'delete matched zero rows' : null) };
}

async function createExerciseForToday(payload){
  invalidateTrackSnapshots(); // day contents change - stale snapshot must not survive
  // Wait for the master-flag heal to complete before deciding which schema
  // to write to. Without this, a save during app boot could route to the
  // old exercises table while the app has healed to reading from the master
  // schema - the write would then be invisible to subsequent reads.
  await awaitMasterFlagHealed();
  if (!getUseExerciseMasterFlag()) return insertExerciseSafely(payload);

  // Use select + limit(1) instead of maybeSingle() - maybeSingle throws an
  // error if 2+ rows match, and previously that error path fell through to
  // INSERT a new exercise_master row here, multiplying any pre-existing
  // duplicates every time the user re-added the exercise anywhere. select
  // + limit(1) just takes the first match if there's any, so the function
  // becomes a duplicate-breaker rather than a duplicate-multiplier.
  const existingMaster = await withTimeout(
    supabaseClient.from('exercise_master').select('id').eq('user_id', payload.user_id).ilike('name', payload.name).limit(1),
    15000
  );
  let masterId;
  if (!existingMaster.__timeout && !existingMaster.error && existingMaster.data && existingMaster.data.length){
    masterId = existingMaster.data[0].id;
  } else {
    const { data: inserted, error } = await supabaseClient.from('exercise_master').insert({
      user_id: payload.user_id, name: payload.name, category: payload.category,
      alt_group_id: payload.alt_group_id || null, push_pull: payload.push_pull || null,
      upper_lower: payload.upper_lower || null, location_ids: payload.location_ids || null,
      measurement_type: payload.measurement_type || null,
      uses_door_anchor: !!payload.uses_door_anchor, door_anchor_level: payload.door_anchor_level || null
    }).select();
    if (error || !inserted || !inserted[0]) return { data: null, error: error || { message: 'Could not create exercise' }, wasExisting: false };
    masterId = inserted[0].id;
  }
  const dayResult = await supabaseClient.from('exercise_days').insert({
    user_id: payload.user_id, exercise_master_id: masterId, weekday: payload.weekday
  });
  // A unique-violation here just means this exercise is already on this day -
  // not a real error, the exercise still exists and is still usable.
  if (dayResult.error && dayResult.error.code !== '23505') return { data: null, error: dayResult.error, wasExisting: false };
  return { data: [{ id: masterId, name: payload.name, category: payload.category }], error: null, wasExisting: !!dayResult.error };
}

function getCurrentLocationId(){
  const raw = localStorage.getItem('zealift_current_location');
  if (!raw) return null;
  try {
    const { id, date } = JSON.parse(raw);
    if (date !== todayStr()) return null;
    return id || null;
  } catch(e){
    return null; // legacy plain-string value from before this format existed
  }
}
// Distinguishes "user explicitly picked Anywhere for today" (should NOT fall
// back to default) from "user hasn't picked anything today" (default applies).
// Both make getCurrentLocationId return null but they mean different things
// - so callers that need to know use this.
function hasExplicitCurrentLocation(){
  const raw = localStorage.getItem('zealift_current_location');
  if (!raw) return false;
  try {
    const { date } = JSON.parse(raw);
    return date === todayStr();
  } catch(e){ return false; }
}
// Single source of truth for "which location should filter/tagging use right
// now" - respects an explicit Anywhere pick, falls back to default otherwise.
function effectiveLocationId(){
  if (hasExplicitCurrentLocation()) return getCurrentLocationId();
  return getCurrentLocationId() || getDefaultLocationId();
}
function getDefaultLocationId(){ return localStorage.getItem('zealift_default_location') || null; }
function setDefaultLocationId(id){
  if (id) localStorage.setItem('zealift_default_location', id); else localStorage.removeItem('zealift_default_location');
  // Persist to the database too, in the background, so this survives a
  // cleared localStorage (a known iOS PWA issue) rather than being lost.
  (async () => {
    const userData = { user: await getCurrentUser() };
    if (!userData || !userData.user) return;
    await supabaseClient.from('locations').update({ is_default: false }).eq('user_id', userData.user.id).eq('is_default', true);
    if (id) await supabaseClient.from('locations').update({ is_default: true }).eq('id', id);
  })().catch(() => {}); // is_default column may not exist yet if the migration hasn't run - fail silently, localStorage still works
}
function getHideCompletedPref(){ return localStorage.getItem('zealift_hide_completed') === '1'; }
function setHideCompletedPref(v){ localStorage.setItem('zealift_hide_completed', v ? '1' : '0'); }
function setCurrentLocationId(id){
  // Both a real location ID and null (explicit Anywhere) are stored as the
  // same shape - so the reader can tell "user picked Anywhere today" apart
  // from "user hasn't picked anything today" (which falls back to default).
  localStorage.setItem('zealift_current_location', JSON.stringify({ id: id || null, date: todayStr() }));
}

// An exercise with no locations set is available everywhere (untagged = universal,
// so introducing locations doesn't break exercises nobody's gotten around to
// tagging yet). Otherwise it's available only where explicitly tagged.
function isAvailableAtLocation(ex, locationId){
  if (!locationId) return true;
  if (!ex.location_ids || ex.location_ids.length === 0) return true;
  return ex.location_ids.includes(locationId);
}

// Anytime exercises are never location-filtered, regardless of what location
// tags they happen to carry. This is a deliberate override, not just "no
// location set": an exercise created on Anytime before this fix may already
// have a stale location tag from whichever gym the user was at that day, and
// without this override it would stay invisible everywhere else forever -
// the exact bug this exists to close, for both old and new data.
function isAvailableOnSelectedDay(ex, locationId){
  if (isAnyDay(state.selectedDay)) return true;
  return isAvailableAtLocation(ex, locationId);
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

let _zealiftDbCache = null;
async function loadMonoLiftExerciseDB(){
  if (_zealiftDbCache) return _zealiftDbCache;
  const result = await withTimeout(
    supabaseClient.from('zealift_exercise_db').select('id, name, primary_muscle, secondary_muscles, equipment, mechanic, level, instructions').order('name'),
    15000
  );
  if (result.__timeout || result.error){ return []; } // table may not exist yet if the migration hasn't run
  _zealiftDbCache = (result.data || []).map(e => ({
    name: e.name, primaryMuscles: e.primary_muscle ? [e.primary_muscle] : [], secondaryMuscles: e.secondary_muscles || [],
    equipment: e.equipment, mechanic: e.mechanic, level: e.level, instructions: e.instructions,
    _source: 'zealift'
  }));
  return _zealiftDbCache;
}

const APP_OWNER_USER_ID = '08a8e277-f4e0-4b8f-a466-5f7b72e4dfc1';
async function isVerifiedContributor(userId){
  const result = await withTimeout(
    supabaseClient.from('verified_contributors').select('user_id').eq('user_id', userId).maybeSingle(),
    15000
  );
  if (result.__timeout || result.error) return false; // table may not exist yet if the migration hasn't run
  return !!result.data;
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
let _normalizedDbCache = null; // { forDb: <db array identity>, entries: [{e, words}] }
function getNormalizedDb(db){
  if (_normalizedDbCache && _normalizedDbCache.forDb === db) return _normalizedDbCache.entries;
  const entries = db.map(e => ({ e, words: exdbNormalize(e.name) })).filter(entry => entry.words.size);
  _normalizedDbCache = { forDb: db, entries };
  return entries;
}

function fuzzyMatchExercise(name, db){
  if (!db) return null;
  const qwords = exdbNormalize(name);
  if (!qwords.size) return null;
  let best = null, bestScore = 0;
  for (const { e, words: ewords } of getNormalizedDb(db)){
    let overlap = 0;
    for (const w of qwords){ if (ewords.has(w)) overlap++; }
    const score = overlap / Math.max(qwords.size, ewords.size);
    if (score > bestScore){ best = e; bestScore = score; }
  }
  return bestScore >= 0.34 ? best : null;
}

let _matchExerciseCache = null; // { forDb: <db array identity>, byName: Map }
function matchExercise(name, db){
  if (!_matchExerciseCache || _matchExerciseCache.forDb !== db){
    _matchExerciseCache = { forDb: db, byName: new Map() };
  }
  const cache = _matchExerciseCache.byName;
  if (cache.has(name)) return cache.get(name);
  const result = matchExerciseUncached(name, db);
  cache.set(name, result);
  return result;
}
function matchExerciseUncached(name, db){
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
  // Band sets read as their bands, not as a weight - the weight column is
  // deliberately null for them.
  if (s && (s.measurement_type === 'band' || s.weight_unit === 'band')){
    return `${formatBandSet(s)}${formatSetsReps(s)}`;
  }
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

  const table = getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises';
  const exResult = await withTimeout(
    supabaseClient.from(table).select('id, name').eq('alt_group_id', groupId),
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
  const idField = getUseExerciseMasterFlag() ? 'exercise_master_id' : 'exercise_id';
  const setsResult = await withTimeout(
    supabaseClient.from('sets').select('id, exercise_id, exercise_master_id, weight, weight_unit, weight_type, reps, num_sets, notes, logged_at, measurement_type, band_snapshot, band_resistance, band_resistance_unit')
      .in(idField, memberIds).order('logged_at', { ascending: false }).limit(60),
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
      <div class="small" style="color:var(--slate);">${nameById[s.exercise_master_id || s.exercise_id] || 'Unknown exercise'}</div>
    </div>`).join('');
}

async function quickSaveSet(exerciseId, exerciseName, best){
  if (!best) return false;
  // Wait for the master-flag heal to complete - same race protection as
  // saveEntry: a quick-save during app boot could otherwise land under the
  // wrong exercise-id field and be invisible to subsequent reads.
  await awaitMasterFlagHealed();
  const userData = { user: await getCurrentUser() };
  const useMaster = getUseExerciseMasterFlag();
  const idField = useMaster ? 'exercise_master_id' : 'exercise_id';
  const weight = best.weight, unit = best.weight_unit, weightType = best.weight_type || 'total';

  let priorBest = null;
  if (weight !== null && (unit === 'kg' || unit === 'lb')){
    // Sibling-aware PR check - see saveEntry for rationale.
    const siblingTable = useMaster ? 'exercise_master' : 'exercises';
    const siblingsResult = await supabaseClient.from(siblingTable).select('id').eq('user_id', userData.user.id).ilike('name', exerciseName);
    const siblingIds = (siblingsResult.data && siblingsResult.data.length) ? siblingsResult.data.map(r => r.id) : [exerciseId];
    const prevSets = await supabaseClient.from('sets')
      .select('weight, weight_unit')
      .in(idField, siblingIds)
      .in('weight_unit', ['kg','lb']);
    if (prevSets.data && prevSets.data.length){
      priorBest = Math.max(...prevSets.data.map(s => convertWeight(s.weight, s.weight_unit, unit)));
    }
  }
  const insertPayload = {
    user_id: userData.user.id,
    weight, weight_unit: weight !== null ? unit : 'bodyweight',
    weight_type: weightType,
    num_sets: null, reps: best.reps,
    notes: null,
    logged_at: todayStr(),
    location_id: effectiveLocationId()
  };
  insertPayload[idField] = exerciseId;
  invalidateTrackSnapshots(); // logged set changes done-flags and header stats
    const { data, error } = await supabaseClient.from('sets').insert(insertPayload).select();
  if (error || !data || !data.length){ alert(error ? error.message : 'Could not save that set.'); return false; }
  if (priorBest !== null && weight !== null && weight > priorBest + 0.01){
    celebratePR(exerciseName, weight, unit, priorBest);
  }
  return true;
}

function exerciseRow(ex){
  const groupNameRaw = ex.alt_groups ? ex.alt_groups.name : null;
  // Never show a day-of-week reference in the tag itself - a group can
  // legitimately apply regardless of which day it's viewed from, so a name
  // like "Back (Weds)" showing up on Monday is just confusing, not useful.
  const groupName = groupNameRaw
    ? groupNameRaw.replace(/\s*[\(\[]?\s*\b(mon(day)?|tue(s|sday)?|wed(s|nesday)?|thu(r|rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b\s*[\)\]]?\s*/gi, ' ').replace(/\s+/g,' ').trim() || null
    : null;
  const groupColor = ex.alt_groups ? ex.alt_groups.color : null;
  const cornerTag = groupName
    ? `<div class="corner-tag alt-badge-tap" data-group-id="${ex.alt_group_id}" data-group-name="${groupName}" style="background:${groupColor};">${groupName}</div>`
    : '';
  const topPad = groupName ? 'padding-top:5px;' : '';

  let subtitle, showCheck, isDone = false, hasQuickButtons = false;
  let quickSaveBtn = '';
  const glassBtnStyle = "background:linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015)); border:1px solid rgba(255,255,255,0.08); color:#C9CBD1;";
  if (ex.loggedToday){
    subtitle = `<div style="margin-top:12px;">
      <div style="text-align:center; padding:10px 0; border-radius:10px; background:linear-gradient(155deg, #9ED486, #6FA457); box-shadow:0 4px 12px rgba(143,191,122,0.25), inset 0 1px 0 rgba(255,255,255,0.3); font-size:11.5px; font-family:'Oswald',sans-serif; text-transform:uppercase; letter-spacing:0.3px; color:#0F1A0C; font-weight:700;">✓ Logged today — ${formatSetValue(ex.lastSet)}</div>
    </div>`;
    showCheck = false; isDone = true;
  } else if (ex.completeVia){
    subtitle = `<div style="margin-top:12px;">
      <div style="text-align:center; padding:9px 0; border-radius:10px; background:rgba(143,191,122,0.18); border:1px solid rgba(143,191,122,0.35); font-size:11.5px; font-family:'Oswald',sans-serif; text-transform:uppercase; letter-spacing:0.3px; color:var(--good); font-weight:600;">↳ Complete via ${ex.completeVia}</div>
    </div>`;
    showCheck = false; isDone = true;
  } else {
    // Quick log shows and re-logs your MOST RECENT set, not your all-time
    // best. Progressive overload usually means today's working weight isn't
    // your PR - one-tapping "quick save" against your all-time max would
    // silently log a heavier weight than you actually lifted today.
    const best = ex.lastSet || ex.maxSet;
    if (best){
      state.trackBestSetById = state.trackBestSetById || {};
      state.trackBestSetById[ex.id] = best;
      // Always state Per or Total explicitly for weight-based units - omitting
      // the word for "Total" reads as undefined/missing, not as a real answer.
      const isWeightUnit = best.weight_unit === 'kg' || best.weight_unit === 'lb';
      const quickLabel = isWeightUnit
        ? `${best.weight}${best.weight_unit} ${best.weight_type === 'per' ? 'Per' : 'Total'}`
        : formatSetValue(best);
      hasQuickButtons = true;
      subtitle = `<div style="display:flex; gap:8px; margin-top:12px;">
        <div class="ex-save-set-btn" data-id="${ex.id}" data-name="${ex.name}" style="flex:3; text-align:center; padding:10px 0; border-radius:10px; ${glassBtnStyle} font-size:11px; font-family:'Oswald',sans-serif; text-transform:uppercase; letter-spacing:0.4px;">Save Set</div>
        <div class="ex-quick-save-btn" data-id="${ex.id}" data-name="${ex.name}" style="flex:2; text-align:center; padding:10px 0; border-radius:10px; background:rgba(255,107,26,0.14); border:1px solid rgba(255,107,26,0.35); color:#FF9552; font-size:11px; font-family:'Oswald',sans-serif; text-transform:uppercase; letter-spacing:0.4px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${quickLabel}</div>
      </div>`;
    } else {
      hasQuickButtons = true;
      subtitle = `<div style="margin-top:12px;">
        <div class="ex-save-set-btn" data-id="${ex.id}" data-name="${ex.name}" style="text-align:center; padding:10px 0; border-radius:10px; ${glassBtnStyle} font-size:11px; font-family:'Oswald',sans-serif; text-transform:uppercase; letter-spacing:0.4px;">Save Set</div>
      </div>`;
    }
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
  const SPLIT_TAG_STYLE = { push:['#FF6B1A','Push'], pull:['#7BA6C9','Pull'], legs:['#C9A227','Legs'], upper:['#FF6B1A','Upper'], lower:['#C9A227','Lower'] };
  const splitInfo = ex.splitLabel ? SPLIT_TAG_STYLE[ex.splitLabel] : null;
  const splitTag = splitInfo ? `<span style="font-size:9px; padding:2px 5px; border-radius:4px; margin-left:5px; background:${splitInfo[0]}26; color:${splitInfo[0]};">${splitInfo[1]}</span>` : '';

  const stagnantNote = ex.stagnant
    ? `<div style="font-size:10.5px; color:#E8A33D; margin-top:8px; display:flex; align-items:center; gap:5px;"><span>📈</span>Same weight a few sessions running — try increasing</div>`
    : '';

  return `<div class="exercise" style="${borderStyle}" data-id="${ex.id}" data-name="${ex.name}">
    ${cornerTag}
    <div style="flex:1; min-width:0; ${topPad}">
      <div class="ex-name">${ex.name}${splitTag}${mechTag}</div>
      ${subtitle}
      ${stagnantNote}
    </div>
    ${showCheck ? `<div class="check-circle">${ICON_CHECK}</div>` : (hasQuickButtons || isDone ? '' : `<div class="chev">›</div>`)}
  </div>`;
}

async function loadDayType(weekday){
  const userData = { user: await getCurrentUser() };
  // Not signed in - genuinely nothing to load, return null so the caller
  // shows a neutral fallback (DAY_NAMES[weekday] = "MON", "TUE" etc.) rather
  // than a hardcoded default plan that was never actually set by anyone.
  if (!userData || !userData.user) return null;
  const result = await withTimeout(
    supabaseClient.from('day_types').select('label').eq('user_id', userData.user.id).eq('weekday', weekday).maybeSingle(),
    15000
  );
  // Transient timeout or error - the real label might exist in the database
  // but we couldn't fetch it right now. Do NOT fall back to a hardcoded
  // default label ("Chest & Triceps" etc.) since that misleadingly looks
  // like the day was silently reset to defaults. Return a sentinel that the
  // caller can render as a placeholder instead.
  if (result.__timeout) return { __unavailable: true, reason: 'timeout' };
  if (result.error) return { __unavailable: true, reason: 'error', error: result.error };
  // Genuinely no row - user has never set a label for this weekday.
  if (!result.data) return null;
  return result.data.label;
}

// Small confirm popover anchored near the button that triggered it - guards
// small icon buttons (easy to mis-tap) from firing their action immediately.
// Dismisses on outside tap. description is optional for lower-stakes actions.
function showPreCheckPopover(anchorEl, title, description, onConfirm){
  document.querySelectorAll('.precheck-popover').forEach(p => p.remove());
  const rect = anchorEl.getBoundingClientRect();
  const popover = document.createElement('div');
  popover.className = 'precheck-popover';
  popover.style = `position:fixed; top:${rect.bottom + 8}px; left:${Math.max(12, rect.left - 60)}px; z-index:80; background:var(--panel); border:1px solid ${description ? 'var(--flame)' : 'var(--line)'}; border-radius:${description?'12px':'10px'}; padding:${description?'14px':'10px 12px'}; box-shadow:0 8px 24px rgba(0,0,0,0.5); width:${description?'220px':'auto'}; white-space:${description?'normal':'nowrap'};`;
  popover.innerHTML = `
    ${description ? `<div style="font-family:'Bebas Neue',sans-serif; font-size:14px; color:var(--flame); margin-bottom:4px;">${title.toUpperCase()}</div>
      <div style="font-size:10.5px; color:var(--slate); line-height:1.5; margin-bottom:12px;">${description}</div>`
      : `<div style="font-size:11px; margin-bottom:8px;">${title}</div>`}
    <div style="display:flex; gap:${description?'8px':'6px'};">
      <div class="precheck-cancel" style="${description?'flex:1;':''} text-align:center; background:var(--ink); border:1px solid var(--line); border-radius:${description?'8px':'6px'}; padding:${description?'9px':'5px 10px'}; font-size:${description?'11px':'10px'}; color:var(--slate);">Cancel</div>
      <div class="precheck-confirm" style="${description?'flex:1;':''} text-align:center; background:var(--flame); color:var(--ink); border-radius:${description?'8px':'6px'}; padding:${description?'9px':'5px 10px'}; font-size:${description?'11px':'10px'}; font-weight:700;">${description ? 'Continue' : 'OK'}</div>
    </div>`;
  document.body.appendChild(popover);
  const dismiss = (e) => {
    if (popover.contains(e.target)) return;
    popover.remove();
    document.removeEventListener('click', dismiss, true);
  };
  setTimeout(() => document.addEventListener('click', dismiss, true), 0);
  popover.querySelector('.precheck-cancel').onclick = () => popover.remove();
  popover.querySelector('.precheck-confirm').onclick = () => { popover.remove(); onConfirm(); };
}

// Locations and "Environments" were the same locations table behind two
// separate menu entries and two screens - genuinely duplicated effort that
// made one concept look like two. Merged into a single Locations page: the
// list itself (add, rename, delete, equipment tags) plus the default and the
// bulk assign tool. Equipment you OWN and carry - bands - is a different
// concept and now lives on its own page.
function openLocationSubPage(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeLocSubPage">✕</button><h1>Locations</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:6px 18px 10px 18px; color:var(--slate); line-height:1.55;">The places you train. Tag what each one has so suggestions match what's actually available.</div>
      <div id="locSubList"><div class="small" style="padding:14px 18px; color:var(--slate);">Loading…</div></div>
      <div style="padding:10px 18px 4px 18px;"><button class="btn-primary" id="addLocationBtn" style="width:100%;">+ Add a location</button></div>
      <div class="section-label" style="padding-top:18px;">Settings</div>
      <div class="me-item" id="subDefaultLocationBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Default Location</div><div class="small" style="color:var(--slate); margin-top:2px;">Used when logging if Track isn't set to a specific place</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subBulkLocationBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Assign Exercises</div><div class="small" style="color:var(--slate); margin-top:2px;">Tell the app which exercises exist where, gym by gym</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeLocSubPage').onclick = () => overlay.remove();
  overlay.querySelector('#subDefaultLocationBtn').onclick = () => openDefaultLocationPicker();
  overlay.querySelector('#subBulkLocationBtn').onclick = () => openBulkLocationAssign();

  async function renderList(){
    const listArea = overlay.querySelector('#locSubList');
    const locations = await loadLocations();
    if (!locations.length){
      listArea.innerHTML = `<div class="empty-state" style="padding:18px;">No locations yet — add the gyms you train at.</div>`;
      return;
    }
    listArea.innerHTML = locations.map(l => {
      const tags = l.equipment_tags || [];
      const tagLabel = tags.length
        ? tags.map(t => (EQUIPMENT_CATEGORIES.find(e => e.key === t) || {}).label || t).join(' · ')
        : 'No equipment tagged yet';
      return `<div class="loc-row" data-id="${l.id}" data-name="${l.name}">
        <div style="flex:1; min-width:0;">
          <div class="ex-name" style="font-size:13.5px;">${l.name}${l.is_default ? ' <span class="loc-default-tag">Default</span>' : ''}</div>
          <div class="small" style="color:var(--slate); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${tagLabel}</div>
        </div>
        <button class="loc-act" data-act="equip" data-id="${l.id}" data-name="${l.name}">Equipment</button>
        <button class="loc-act" data-act="rename" data-id="${l.id}" data-name="${l.name}">✎</button>
        <button class="loc-act" data-act="delete" data-id="${l.id}" data-name="${l.name}">🗑</button>
      </div>`;
    }).join('');
    listArea.querySelectorAll('.loc-act').forEach(btn => {
      btn.onclick = () => {
        const { act, id, name } = btn.dataset;
        const loc = locations.find(l => l.id === id);
        if (act === 'equip'){ openEditLocationEquipmentScreen(id, name, loc ? (loc.equipment_tags || []) : [], renderList); return; }
        if (act === 'rename'){
          promptText({ title: 'Rename Location', placeholder: 'Name', initialValue: name,
            onConfirm: async (newName) => {
              if (!newName || newName === name) return;
              await supabaseClient.from('locations').update({ name: newName }).eq('id', id);
              warmInvalidate();
              renderList();
            } });
          return;
        }
        showConfirmDialog(
          `Delete "${name}"? Sets already logged there keep their record — only the location itself is removed.`,
          async () => {
            await supabaseClient.from('locations').delete().eq('id', id);
            warmInvalidate();
            renderList();
          }, { title: 'Delete Location?', danger: true, confirmLabel: 'Delete' });
      };
    });
  }
  overlay.querySelector('#addLocationBtn').onclick = () => {
    promptText({ title: 'New Location', placeholder: 'e.g. Bali Apartment',
      onConfirm: async (name) => {
        const created = await createLocation(name);
        if (created) openEditLocationEquipmentScreen(created.id, created.name, [], renderList);
        else renderList();
      } });
  };
  renderList();
}

// Equipment you own and carry with you, as opposed to equipment a gym has.
// Bands live here; this is the natural home for anything else portable.
function openEquipmentSubPage(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeEquip">✕</button><h1>Equipment</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:6px 18px 10px 18px; color:var(--slate); line-height:1.55;">Kit you own rather than kit a gym has — so it's available on any day, at any location.</div>
      <div class="me-item" id="subMyBandsBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Resistance Bands</div><div class="small" style="color:var(--slate); margin-top:2px;" id="bandCountLabel">—</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeEquip').onclick = () => overlay.remove();
  overlay.querySelector('#subMyBandsBtn').onclick = () => openMyBandsScreen();
  loadBands().then(bands => {
    const el = document.getElementById('bandCountLabel');
    if (el) el.textContent = bands.length
      ? `${bands.length} band${bands.length===1?'':'s'} — ${bands.map(b=>b.label).join(', ')}`
      : 'None set up yet';
  });
}

function openRebuildToolsSubPage(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeRebuildSubPage">✕</button><h1>Rebuild Tools</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:0 18px 14px 18px; color:var(--slate); line-height:1.5;">Tools for the exercise_master migration. Stage 2 is a one-time seed migration - re-running it after Stage 4c is ON will WIPE current new-table data and rebuild from the old exercises table snapshot.</div>
      <div class="me-item" id="subMigrateMasterBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Migrate to Exercise Master</div><div class="small" style="color:var(--slate); margin-top:2px;">Stage 2 - one-time seed from old exercises table. Refuses to wipe if new schema is in active use.</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subExportBackupBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Export Full Backup</div><div class="small" style="color:var(--slate); margin-top:2px;">Stage 3 - a real downloadable file with everything</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subVerifyBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Verify New Data Matches Old</div><div class="small" style="color:var(--slate); margin-top:2px;">Stage 4a - day-by-day comparison</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subLinkSetsBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Link Sets to Exercise Master</div><div class="small" style="color:var(--slate); margin-top:2px;">Stage 4b - links every set to the new structure</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div style="margin:12px 18px 12px 18px; background:var(--panel); border:1px solid #4a2f16; border-radius:10px; padding:14px;">
        <div class="ex-name" style="font-size:13px; color:#E8A33D;">Use New Exercise Structure</div>
        <div class="small" style="color:var(--slate); margin-top:4px; line-height:1.5;">Stage 4c - switches Track and History to read and write through exercise_master. Turning this off takes effect immediately, no app update needed.</div>
        <div id="masterFlagToggle" style="margin-top:10px;"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeRebuildSubPage').onclick = () => overlay.remove();
  overlay.querySelector('#subMigrateMasterBtn').onclick = openMigrateToMasterScreen;
  overlay.querySelector('#subExportBackupBtn').onclick = openExportFullBackupScreen;
  overlay.querySelector('#subVerifyBtn').onclick = openVerifyMigrationScreen;
  overlay.querySelector('#subLinkSetsBtn').onclick = openLinkSetsToMasterScreen;
  function renderMasterFlagToggle(){
    const on = getUseExerciseMasterFlag();
    const toggleArea = overlay.querySelector('#masterFlagToggle');
    toggleArea.innerHTML = `<div class="chip-row">
      <div class="chip ${!on?'active':''}" id="masterFlagOff">OFF (current app)</div>
      <div class="chip ${on?'active':''}" id="masterFlagOn" style="${on?'background:#E8A33D; color:var(--ink);':''}">ON (new structure)</div>
    </div>`;
    toggleArea.querySelector('#masterFlagOff').onclick = () => {
      showConfirmDialog(
        'Turning this off makes Track read and write from the OLD exercises table. Any data you have in the new exercise_master tables will not be visible until you turn it back on. Only do this if you know what you are doing.',
        () => { setUseExerciseMasterFlag(false); renderMasterFlagToggle(); if (state.currentTab === 'track') renderTrack(); },
        { title: 'Switch off new structure?', danger: true, confirmLabel: 'Switch off' }
      );
    };
    toggleArea.querySelector('#masterFlagOn').onclick = () => { setUseExerciseMasterFlag(true); renderMasterFlagToggle(); if (state.currentTab === 'track') renderTrack(); };
  }
  renderMasterFlagToggle();
}

function openPlanSubPage(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closePlanSubPage">✕</button><h1>Plan</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="me-item" id="subReorganizeBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Reorganize</div><div class="small" style="color:var(--slate); margin-top:2px;">Whole week or just one day - MonoLift rebuilds it for you</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subSwapDaysBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Swap Days</div><div class="small" style="color:var(--slate); margin-top:2px;">Swap what's on two specific days</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subRedoWeekBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Redo Week Setup</div><div class="small" style="color:var(--slate); margin-top:2px;">Start the whole week over from scratch</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subScanSplitTagsBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Tag Workouts</div><div class="small" style="color:var(--slate); margin-top:2px;">Push, pull, upper, lower - what Reorganize uses to build a split automatically</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subRebuildToolsBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div style="color:#E8A33D;">Rebuild Tools</div><div class="small" style="color:var(--slate); margin-top:2px;">In-progress data structure migration - safe, in-progress, reversible</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subWipeAltsBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div style="color:#E8492A;">Wipe &amp; Rebuild Alt Groups</div><div class="small" style="color:var(--slate); margin-top:2px;">Clear everything and start over, reviewed day by day</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subClearDayBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div style="color:#E8492A;">Clear a Day</div><div class="small" style="color:var(--slate); margin-top:2px;">Remove every exercise from one day - history is kept</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subMergeDupesBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div style="color:#E8492A;">Merge Duplicates</div><div class="small" style="color:var(--slate); margin-top:2px;">Fix exercises that ended up as separate records with the same name</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      ${localStorage.getItem('zealift_reorg_snapshot') ? `<div class="me-item" id="subRevertReorgBtn"><div style="color:#E8A33D;">Revert Last Reorganization</div><div class="chev">›</div></div>` : ''}
      <div class="me-item" id="subSimulateDayChangeBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div style="color:#7BA6C9;">Simulate Day Change</div><div class="small" style="color:var(--slate); margin-top:2px;">Pretend the day just rolled over - runs the same code the app runs at midnight, so you can see what your view will look like without changing any data</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closePlanSubPage').onclick = () => overlay.remove();
  overlay.querySelector('#subReorganizeBtn').onclick = openReorganizeChoice;
  overlay.querySelector('#subSwapDaysBtn').onclick = openSwapDaysForm;
  overlay.querySelector('#subRedoWeekBtn').onclick = () => {
    showConfirmDialog(
      'Redo Week Setup will replace your day labels (Mon: Chest & Triceps etc.) with whatever preset you pick in the wizard. Your actual exercises and their day placements stay put. If you just wanted to change one day\'s label, tap the label at the top of Track instead.',
      () => showOnboarding('setup'),
      { title: 'Redo Week Setup?', confirmLabel: 'Continue' }
    );
  };
  overlay.querySelector('#subScanSplitTagsBtn').onclick = openSplitTagReview;
  overlay.querySelector('#subRebuildToolsBtn').onclick = openRebuildToolsSubPage;
  overlay.querySelector('#subWipeAltsBtn').onclick = openWipeAltGroupsScreen;
  overlay.querySelector('#subClearDayBtn').onclick = openClearDayScreen;
  overlay.querySelector('#subMergeDupesBtn').onclick = openMergeDuplicateExercisesScreen;
  overlay.querySelector('#subSimulateDayChangeBtn').onclick = simulateDayChange;
  const subRevertBtn = overlay.querySelector('#subRevertReorgBtn');
  if (subRevertBtn) subRevertBtn.onclick = revertLastReorganization;
}

// Diagnostic: manually trigger the same code path that runs when the
// calendar day rolls over, so the user can verify what will happen at real
// midnight without waiting for it. No data is changed - this just simulates
// the client-side rollover (advancing selectedDay if appropriate, expiring
// today-scoped localStorage entries, and re-rendering Track). Shows a plain
// diagnostic of what changed so the behavior is auditable.
async function simulateDayChange(){
  const beforeSelectedDay = state.selectedDay;
  const beforeToday = __lastKnownWeekday;
  const simulatedToday = (beforeToday + 1) % 7;
  const currentLocationRaw = localStorage.getItem('zealift_current_location');

  // Snapping rule: mirror the visibilitychange handler exactly - only follow
  // the calendar forward if the user was viewing what was "today" at the
  // moment of rollover. Otherwise their intentional day selection is kept.
  const wasViewingToday = beforeSelectedDay === beforeToday;
  const afterSelectedDay = wasViewingToday ? simulatedToday : beforeSelectedDay;

  // Today-scoped localStorage that would naturally expire at midnight - the
  // getCurrentLocationId reader already checks todayStr() and returns null
  // when the stored date no longer matches, so on a real rollover the same
  // outcome happens on next read. Simulate that here so the diagnostic
  // report is honest about what would happen.
  let currentLocationExpiredOnRollover = false;
  if (currentLocationRaw){
    try {
      const parsed = JSON.parse(currentLocationRaw);
      if (parsed.date === todayStr()) currentLocationExpiredOnRollover = true;
    } catch(e){}
  }

  __lastKnownWeekday = simulatedToday;
  state.selectedDay = afterSelectedDay;
  // Force getCurrentLocationId to return null for this simulation, matching
  // the natural rollover behavior. Stashed and restored after the render so
  // this remains a pure simulation and not an actual data write.
  const stashedCurrentLocation = currentLocationExpiredOnRollover ? currentLocationRaw : null;
  if (currentLocationExpiredOnRollover) localStorage.removeItem('zealift_current_location');

  await renderTrack();

  // Restore anything we temporarily cleared so the app returns to its real
  // state - simulation is purely a preview, not a durable change.
  if (stashedCurrentLocation) localStorage.setItem('zealift_current_location', stashedCurrentLocation);
  __lastKnownWeekday = beforeToday;

  const summary = [
    `Simulated calendar day rolled from ${DAY_NAMES[beforeToday]} to ${DAY_NAMES[simulatedToday]}.`,
    ``,
    `Track view: ${wasViewingToday ? `snapped from ${DAY_NAMES[beforeSelectedDay]} to ${DAY_NAMES[afterSelectedDay]} (you were on "today" so it followed)` : `stayed on ${DAY_NAMES[beforeSelectedDay]} (you were intentionally viewing a different day so it was kept)`}.`,
    ``,
    `Today's Done marks: cleared naturally (loggedToday recomputes against the new today's date).`,
    `Volume/Sets/Streak Today: recomputed for the new day - previous day's totals no longer count.`,
    currentLocationExpiredOnRollover ? `Current location: expired (was day-scoped to yesterday). Default location still applies if set.` : `Current location: no active override to expire.`,
    ``,
    `The plan itself (which exercises are on which day) was not touched - it never is on a rollover, only ever by an explicit action from you.`,
    ``,
    `This was a simulation only. Nothing in the database was changed. The real day is still ${DAY_NAMES[todayWeekday()]}.`
  ].join('\n');
  alert(summary);
}

async function openLinkSetsToMasterScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeLinkSets">✕</button><h1>Link Sets to Exercise Master</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="linkSetsBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Reading everything…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeLinkSets').onclick = () => overlay.remove();

  const userData = { user: await getCurrentUser() };
  const uid = userData.user.id;
  const body = overlay.querySelector('#linkSetsBody');

  const [oldExResult, masterResult, setsResult] = await Promise.all([
    withTimeout(supabaseClient.from('exercises').select('id, name, active').eq('user_id', uid), 15000),
    withTimeout(supabaseClient.from('exercise_master').select('id, name').eq('user_id', uid), 15000),
    withTimeout(supabaseClient.from('sets').select('id, exercise_id, exercise_master_id, logged_at').eq('user_id', uid), 15000)
  ]);
  if (oldExResult.__timeout || oldExResult.error || masterResult.__timeout || masterResult.error || setsResult.__timeout || setsResult.error){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">Could not read one of the tables needed. Nothing was touched - try again.</div>`;
    return;
  }

  const oldExById = {};
  (oldExResult.data || []).forEach(ex => { oldExById[ex.id] = ex; });
  const masterIdByName = {};
  (masterResult.data || []).forEach(m => { masterIdByName[m.name.toLowerCase()] = m.id; });

  const allSets = setsResult.data || [];
  const toLink = [];
  const unmatched = [];
  const alreadyLinked = [];
  allSets.forEach(s => {
    if (s.exercise_master_id){ alreadyLinked.push(s); return; }
    const oldEx = oldExById[s.exercise_id];
    const masterId = oldEx ? masterIdByName[oldEx.name.toLowerCase()] : null;
    if (masterId) toLink.push({ setId: s.id, masterId });
    else unmatched.push({ set: s, oldEx });
  });

  body.innerHTML = `
    <div class="small" style="padding:12px 18px; color:var(--slate); line-height:1.6;">Only ever writes to the new exercise_master_id column - the original exercise_id on every set is never touched or removed. ${allSets.length} total sets found.</div>
    <div class="proposal-card" style="margin:0 18px 10px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px;">
      <div class="small" style="color:var(--good);">✓ ${toLink.length} sets ready to link</div>
      ${alreadyLinked.length ? `<div class="small" style="color:var(--slate); margin-top:4px;">${alreadyLinked.length} already linked from a prior run</div>` : ''}
    </div>
    ${unmatched.length ? `
      <div class="small" style="padding:0 18px 8px 18px; color:#E8492A;">${unmatched.length} sets could not be matched - here's exactly why each one:</div>
      ${unmatched.map(u => {
        let reason;
        if (!u.oldEx) reason = 'The exercise this set was logged against no longer exists at all - a genuinely orphaned reference.';
        else if (u.oldEx.active === false) reason = `Exercise "${u.oldEx.name}" is inactive/deactivated, so it wasn't included when Stage 2 built the master list (which only looked at active exercises).`;
        else reason = `Exercise "${u.oldEx.name}" is active but has no matching master record - Stage 2 may need re-running.`;
        return `<div class="proposal-card" style="margin:0 18px 8px 18px; background:var(--panel); border:1px solid #4a2f16; border-radius:10px; padding:12px 14px;">
          <div class="small" style="color:var(--slate);">Set logged ${u.set.logged_at || 'unknown date'}, exercise_id ${u.set.exercise_id}</div>
          <div class="small" style="color:#E8A33D; margin-top:4px;">${reason}</div>
        </div>`;
      }).join('')}
    ` : ''}
    ${unmatched.length ? '' : `<button class="save-btn" id="confirmLinkSetsBtn" style="margin:0 18px 20px 18px;">Link ${toLink.length} Sets</button>`}
  `;
  if (unmatched.length) return;

  body.querySelector('#confirmLinkSetsBtn').onclick = async () => {
    const btn = body.querySelector('#confirmLinkSetsBtn');
    btn.textContent = 'Linking…';
    let linked = 0;
    const errors = [];
    for (const { setId, masterId } of toLink){
      const { error } = await supabaseClient.from('sets').update({ exercise_master_id: masterId }).eq('id', setId);
      if (error) errors.push({ setId, message: error.message });
      else linked++;
    }
    if (errors.length){
      body.innerHTML = `
        <div class="small" style="padding:12px 18px; color:var(--good);">✓ ${linked} sets linked successfully.</div>
        <div class="small" style="padding:0 18px 8px 18px; color:#E8492A;">${errors.length} failed - exact reason for each:</div>
        ${errors.map(e => `<div class="proposal-card" style="margin:0 18px 8px 18px; background:var(--panel); border:1px solid #4a2f16; border-radius:10px; padding:12px 14px;">
          <div class="small" style="color:var(--slate);">Set ID ${e.setId}</div>
          <div class="small" style="color:#E8A33D; margin-top:4px;">${e.message}</div>
        </div>`).join('')}
      `;
      return;
    }
    overlay.remove();
    alert(`Linked ${linked} sets. Every set's original exercise_id is unchanged.`);
  };
}

async function openVerifyMigrationScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeVerify">✕</button><h1>Verify New Data Matches Old</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="verifyBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Comparing every day…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeVerify').onclick = () => overlay.remove();

  const userData = { user: await getCurrentUser() };
  const uid = userData.user.id;
  const body = overlay.querySelector('#verifyBody');

  const [oldResult, masterResult, daysResult] = await Promise.all([
    withTimeout(supabaseClient.from('exercises').select('name, weekday').eq('user_id', uid).eq('active', true), 15000),
    withTimeout(supabaseClient.from('exercise_master').select('id, name').eq('user_id', uid), 15000),
    withTimeout(supabaseClient.from('exercise_days').select('exercise_master_id, weekday').eq('user_id', uid), 15000)
  ]);
  if (oldResult.__timeout || oldResult.error || masterResult.__timeout || masterResult.error || daysResult.__timeout || daysResult.error){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">Could not read one of the tables needed to compare. Nothing was touched - try again.</div>`;
    return;
  }

  const oldByDay = {};
  (oldResult.data || []).forEach(ex => { (oldByDay[ex.weekday] = oldByDay[ex.weekday] || new Set()).add(ex.name.toLowerCase()); });

  const masterNameById = {};
  (masterResult.data || []).forEach(m => { masterNameById[m.id] = m.name; });
  const newByDay = {};
  (daysResult.data || []).forEach(d => {
    const name = masterNameById[d.exercise_master_id];
    if (!name) return;
    (newByDay[d.weekday] = newByDay[d.weekday] || new Set()).add(name.toLowerCase());
  });

  let allMatch = true;
  const rows = [];
  for (let wd = 0; wd < 7; wd++){
    const oldSet = oldByDay[wd] || new Set();
    const newSet = newByDay[wd] || new Set();
    const missing = [...oldSet].filter(n => !newSet.has(n));
    const extra = [...newSet].filter(n => !oldSet.has(n));
    const match = missing.length === 0 && extra.length === 0;
    if (!match) allMatch = false;
    rows.push({ day: DAY_NAMES[wd], oldCount: oldSet.size, newCount: newSet.size, match, missing, extra });
  }

  body.innerHTML = `
    <div class="small" style="padding:12px 18px; color:${allMatch ? 'var(--good)' : '#E8492A'}; line-height:1.6;">${allMatch ? '✓ Every day matches exactly. Safe to move forward with switching the live app over.' : '✗ Found a mismatch - do not switch anything live over until this is resolved.'}</div>
    ${rows.map(r => `
      <div class="proposal-card" style="margin:0 18px 10px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="ex-name" style="font-size:13px;">${r.day}</div>
          <div class="small" style="color:${r.match ? 'var(--good)' : '#E8492A'};">${r.match ? '✓ match' : '✗ mismatch'} (${r.oldCount} old / ${r.newCount} new)</div>
        </div>
        ${r.missing.length ? `<div class="small" style="color:#E8492A; margin-top:4px;">Missing from new: ${r.missing.join(', ')}</div>` : ''}
        ${r.extra.length ? `<div class="small" style="color:#E8492A; margin-top:4px;">Extra in new: ${r.extra.join(', ')}</div>` : ''}
      </div>
    `).join('')}
  `;
}

async function openExportFullBackupScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeExportBackup">✕</button><h1>Export Full Backup</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:12px 18px; color:var(--slate); line-height:1.6;">Stage 3 of the rebuild: a real, downloadable file with everything in your account - exercises, sets, alt groups, locations, day labels, plan backups, body weight, and phase settings. Not just a snapshot inside the app - an actual file you keep, that could be used to restore from if anything ever needed it. Nothing about your account changes by generating this.</div>
      <div id="exportStatus" style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px;"><div class="small" style="color:var(--slate);">Ready to export.</div></div>
      <button class="save-btn" id="doExportBtn" style="margin:0 18px 20px 18px;">Generate Backup File</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeExportBackup').onclick = () => overlay.remove();

  overlay.querySelector('#doExportBtn').onclick = async () => {
    const btn = overlay.querySelector('#doExportBtn');
    const statusArea = overlay.querySelector('#exportStatus');
    btn.textContent = 'Exporting…';
    btn.disabled = true;
    const userData = { user: await getCurrentUser() };
    const uid = userData.user.id;

    const tables = ['exercises', 'sets', 'alt_groups', 'locations', 'day_types', 'plan_backups', 'body_weight', 'phase_settings', 'exercise_master', 'exercise_days'];
    const backup = { exported_at: new Date().toISOString(), user_id: uid, app_version: APP_VERSION, tables: {} };
    const errors = [];
    for (const table of tables){
      const result = await withTimeout(supabaseClient.from(table).select('*').eq('user_id', uid), 20000);
      if (result.__timeout || result.error){
        errors.push(`${table}: ${result.error ? result.error.message : 'timed out'}`);
        backup.tables[table] = null;
      } else {
        backup.tables[table] = result.data || [];
      }
      statusArea.innerHTML = `<div class="small" style="color:var(--slate);">Exported ${table} (${backup.tables[table] ? backup.tables[table].length : 'failed'})…</div>`;
    }

    const rowCounts = Object.entries(backup.tables).map(([t, rows]) => `${t}: ${rows ? rows.length : 'FAILED'}`).join('\n');
    statusArea.innerHTML = `<div class="ex-name" style="font-size:13px; margin-bottom:6px; color:${errors.length ? '#E8492A' : 'var(--good)'};">${errors.length ? `${errors.length} table(s) failed to export` : '✓ Export complete'}</div><div class="small" style="color:var(--slate); white-space:pre-line;">${rowCounts}</div>`;

    if (errors.length){
      btn.textContent = 'Retry Export';
      btn.disabled = false;
      return;
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zealift-full-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    btn.textContent = 'Download Again';
    btn.disabled = false;
  };
}

async function openMigrateToMasterScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeMigrate">✕</button><h1>Migrate to Exercise Master</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div id="migrateStatus" style="margin:12px 18px 0 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px;"><div class="small" style="color:var(--slate);">Checking current status…</div></div>
      <div id="migrateBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Reading your current exercises…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeMigrate').onclick = () => overlay.remove();

  const userData = { user: await getCurrentUser() };

  // Live status check - what's actually in the new tables right now, not a
  // number to remember from a dismissed alert.
  const statusArea = overlay.querySelector('#migrateStatus');
  const [masterCountResult, daysCountResult] = await Promise.all([
    withTimeout(supabaseClient.from('exercise_master').select('id, name').eq('user_id', userData.user.id), 15000),
    withTimeout(supabaseClient.from('exercise_days').select('id').eq('user_id', userData.user.id), 15000)
  ]);
  if (masterCountResult.__timeout || masterCountResult.error){
    statusArea.innerHTML = `<div class="small" style="color:#E8492A;">Could not check current status: ${masterCountResult.error ? masterCountResult.error.message : 'timed out'}. If this says the table doesn't exist, Stage 1's SQL migration hasn't been run yet.</div>`;
  } else {
    const masterRows = masterCountResult.data || [];
    const dayRows = daysCountResult.__timeout || daysCountResult.error ? [] : (daysCountResult.data || []);
    statusArea.innerHTML = masterRows.length
      ? `<div class="ex-name" style="font-size:13px; margin-bottom:4px; color:var(--good);">✓ Currently migrated: ${masterRows.length} exercises, ${dayRows.length} day-links</div><div class="small" style="color:var(--slate);">${masterRows.slice(0,5).map(m=>m.name).join(', ')}${masterRows.length>5 ? `, +${masterRows.length-5} more` : ''}</div>`
      : `<div class="small" style="color:var(--slate);">Nothing migrated yet.</div>`;
  }

  const exResult = await withTimeout(
    supabaseClient.from('exercises').select('id, name, category, weekday, alt_group_id, push_pull, upper_lower, muscle_override, location_ids, active').eq('user_id', userData.user.id),
    15000
  );
  const body = overlay.querySelector('#migrateBody');
  if (exResult.__timeout || exResult.error){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">Could not read your exercises: ${exResult.error ? exResult.error.message : 'timed out'}. Nothing was touched.</div>`;
    return;
  }
  const all = exResult.data || [];
  if (!all.length){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">No exercises found to migrate.</div>`;
    return;
  }

  // Group by name - this is the actual deduplication step. Includes
  // inactive/deactivated exercises too, since sets logged against them are
  // still real history that needs somewhere to link to - only excluding
  // them here was the actual reason some sets came back unmatched. Template
  // selection prefers an active member with an alt group over an inactive
  // one, since that's the most trustworthy source for current category/tags.
  // Day-links, however, only ever come from active members - a deactivated
  // exercise correctly gets a master record but no current day placement.
  const byName = {};
  all.forEach(ex => { (byName[ex.name.toLowerCase()] = byName[ex.name.toLowerCase()] || []).push(ex); });
  const groups = Object.values(byName).map(members => {
    const sorted = [...members].sort((a, b) => {
      const aScore = (a.active ? 2 : 0) + (a.alt_group_id ? 1 : 0);
      const bScore = (b.active ? 2 : 0) + (b.alt_group_id ? 1 : 0);
      return bScore - aScore;
    });
    const template = sorted[0];
    const weekdays = [...new Set(members.filter(m => m.active).map(m => m.weekday))].sort((a,b) => a - b);
    return { template, weekdays, memberCount: members.length };
  });

  body.innerHTML = `
    <div class="small" style="padding:12px 18px; color:var(--slate); line-height:1.6;">Reads the OLD exercises table and writes to the NEW exercise_master and exercise_days tables. If new-table data already exists it gets WIPED first - this is a one-time seed migration, not an incremental sync.</div>
    <div class="proposal-card" style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px;">
      <div class="ex-name" style="font-size:14px; margin-bottom:6px;">${groups.length} distinct exercises found in OLD table</div>
      <div class="small" style="color:var(--slate);">from ${all.length} current day-by-day records, spanning ${groups.reduce((s,g)=>s+g.weekdays.length,0)} day-links total</div>
    </div>
    <button class="save-btn" id="confirmMigrateBtn" style="margin:0 18px 20px 18px; background:${getUseExerciseMasterFlag() && masterCountResult.data && masterCountResult.data.length > 0 ? '#E8492A' : ''};">${getUseExerciseMasterFlag() && masterCountResult.data && masterCountResult.data.length > 0 ? 'DANGER: Wipe & Rebuild from OLD Table' : 'Write to New Tables'}</button>
  `;

  body.querySelector('#confirmMigrateBtn').onclick = async () => {
    // CRITICAL: If the user has real master data AND is actively using the
    // new schema (flag on), this migration would DELETE their real current
    // data and replace it with whatever the OLD exercises table contains -
    // which could be a months-old onboarding snapshot. That's the exact
    // "app reset to defaults I never set" symptom. Refuse loudly.
    const currentMasterCount = masterCountResult.data ? masterCountResult.data.length : 0;
    const currentDayCount = daysCountResult.data ? daysCountResult.data.length : 0;
    if (getUseExerciseMasterFlag() && currentMasterCount > 0){
      showConfirmDialog(
        `You have ${currentMasterCount} exercises and ${currentDayCount} day-links in the NEW schema right now, and the app is set to use it (Stage 4c = ON). Running this migration would DELETE ALL of that and rebuild from a snapshot of the OLD exercises table - which may be months out of date. Only do this if you are certain the OLD table is more current than what you have now (extremely unusual). Type MIGRATE to confirm.`,
        async () => {
          const typed = prompt('Type MIGRATE (all caps) to confirm you want to WIPE the new schema and rebuild from the old exercises table:');
          if (typed !== 'MIGRATE'){
            alert('Cancelled. Nothing was touched.');
            return;
          }
          await performActualMigration();
        },
        { title: 'This will WIPE your current data', danger: true, confirmLabel: 'I understand' }
      );
      return;
    }
    await performActualMigration();
  };

  async function performActualMigration(){
    const btn = body.querySelector('#confirmMigrateBtn');
    btn.textContent = 'Migrating…';
    // Idempotent: clear any prior run first so re-running after adding more
    // exercises rebuilds cleanly from the current source of truth, rather
    // than accumulating stale duplicates in the new tables.
    await supabaseClient.from('exercise_days').delete().eq('user_id', userData.user.id);
    await supabaseClient.from('exercise_master').delete().eq('user_id', userData.user.id);

    let created = 0, dayLinks = 0, errors = [];
    for (const g of groups){
      const t = g.template;
      const { data: inserted, error } = await supabaseClient.from('exercise_master').insert({
        user_id: userData.user.id, name: t.name, category: t.category, alt_group_id: t.alt_group_id,
        push_pull: t.push_pull, upper_lower: t.upper_lower, muscle_override: t.muscle_override, location_ids: t.location_ids
      }).select();
      if (error || !inserted || !inserted[0]){ errors.push(`${t.name}: ${error ? error.message : 'no row returned'}`); continue; }
      created++;
      for (const weekday of g.weekdays){
        const { error: dayError } = await supabaseClient.from('exercise_days').insert({
          user_id: userData.user.id, exercise_master_id: inserted[0].id, weekday
        });
        if (dayError) errors.push(`${t.name} (${dayNameOf(weekday)}): ${dayError.message}`);
        else dayLinks++;
      }
    }
    if (errors.length){
      body.innerHTML = `
        <div class="small" style="padding:12px 18px; color:var(--good);">✓ ${created} exercises created, ${dayLinks} day-links.</div>
        <div class="small" style="padding:0 18px 8px 18px; color:#E8492A;">${errors.length} failed - exact reason for each:</div>
        ${errors.map(e => `<div class="proposal-card" style="margin:0 18px 8px 18px; background:var(--panel); border:1px solid #4a2f16; border-radius:10px; padding:12px 14px;">
          <div class="small" style="color:#E8A33D;">${e}</div>
        </div>`).join('')}
      `;
      return;
    }
    overlay.remove();
    alert(`Created ${created} master exercises with ${dayLinks} day-links. Your original exercises table was not touched - the app is unaffected.`);
  };
}




function openReorganizeChoice(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeReorgChoice">✕</button><h1>Reorganize</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:8px 18px 16px 18px; color:var(--slate); line-height:1.5;">Rebuild your whole week around a new split, or just change one day - everything else stays put either way.</div>
      <div class="pick-row" id="reorgWholeWeekRow">
        <div><div class="ex-name">Whole Week</div><div class="small" style="color:var(--slate); margin-top:2px;">PPL, Arnold, Bro Split, Full Body, or your own</div></div>
        <div class="chev">›</div>
      </div>
      <div class="pick-row" id="reorgOneDayRow">
        <div><div class="ex-name">Just One Day</div><div class="small" style="color:var(--slate); margin-top:2px;">Change one day's focus, nothing else touched</div></div>
        <div class="chev">›</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeReorgChoice').onclick = () => overlay.remove();
  overlay.querySelector('#reorgWholeWeekRow').onclick = () => { overlay.remove(); openPlanReorganizer(); };
  overlay.querySelector('#reorgOneDayRow').onclick = () => { overlay.remove(); openChangeSingleDay(); };
}

async function openRetagLocationFromNotesScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeRetag">✕</button><h1>Retag Location From Notes</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="retagBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Reading your locations and set history…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeRetag').onclick = () => overlay.remove();

  const userData = { user: await getCurrentUser() };
  const uid = userData.user.id;
  const body = overlay.querySelector('#retagBody');

  const [locResult, setsResult] = await Promise.all([
    withTimeout(supabaseClient.from('locations').select('id, name').eq('user_id', uid), 15000),
    withTimeout(supabaseClient.from('sets').select('id, notes, location_id').eq('user_id', uid), 15000)
  ]);
  if (locResult.__timeout || locResult.error || setsResult.__timeout || setsResult.error){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">Could not read your locations or set history. Nothing was touched - try again.</div>`;
    return;
  }
  const locations = locResult.data || [];
  const smalesLoc = locations.find(l => /smales/i.test(l.name));
  const funcFitLoc = locations.find(l => /functional\s*fitness/i.test(l.name));
  if (!smalesLoc || !funcFitLoc){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">Could not find both locations by name - need one matching "Smales" and one matching "Functional Fitness". ${!smalesLoc ? 'No Smales location found. ' : ''}${!funcFitLoc ? 'No Functional Fitness location found.' : ''} Nothing was touched.</div>`;
    return;
  }

  const allSets = setsResult.data || [];
  const toSmales = [];
  const toFuncFit = [];
  allSets.forEach(s => {
    const targetId = /smales/i.test(s.notes || '') ? smalesLoc.id : funcFitLoc.id;
    if (s.location_id === targetId) return; // already correct, nothing to do
    if (targetId === smalesLoc.id) toSmales.push(s); else toFuncFit.push(s);
  });

  body.innerHTML = `
    <div class="small" style="padding:12px 18px; color:var(--slate); line-height:1.6;">${allSets.length} total logged sets found. Every set gets tagged ${funcFitLoc.name}, unless its notes mention Smales in some form, in which case it gets tagged ${smalesLoc.name} - matching how you used to log it. Only the location tag changes - weight, date, and notes are untouched.</div>
    <div class="proposal-card" style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px;">
      <div class="small" style="color:var(--good);">${toSmales.length} sets to be tagged ${smalesLoc.name}</div>
      <div class="small" style="color:var(--good); margin-top:4px;">${toFuncFit.length} sets to be tagged ${funcFitLoc.name}</div>
      <div class="small" style="color:var(--slate); margin-top:4px;">${allSets.length - toSmales.length - toFuncFit.length} already correctly tagged, no change needed</div>
    </div>
    ${(toSmales.length + toFuncFit.length) ? `<button class="save-btn" id="confirmRetagBtn" style="margin:0 18px 20px 18px;">Retag ${toSmales.length + toFuncFit.length} Sets</button>` : ''}
  `;

  body.querySelector('#confirmRetagBtn') && (body.querySelector('#confirmRetagBtn').onclick = async () => {
    const btn = body.querySelector('#confirmRetagBtn');
    btn.textContent = 'Retagging…';
    let updated = 0;
    const errors = [];
    for (const s of [...toSmales, ...toFuncFit]){
      const targetId = toSmales.includes(s) ? smalesLoc.id : funcFitLoc.id;
      const { error } = await supabaseClient.from('sets').update({ location_id: targetId }).eq('id', s.id);
      if (error) errors.push({ setId: s.id, message: error.message });
      else updated++;
    }
    if (errors.length){
      body.innerHTML = `
        <div class="small" style="padding:12px 18px; color:var(--good);">✓ ${updated} sets retagged successfully.</div>
        <div class="small" style="padding:0 18px 8px 18px; color:#E8492A;">${errors.length} failed:</div>
        ${errors.map(e => `<div class="proposal-card" style="margin:0 18px 8px 18px; background:var(--panel); border:1px solid #4a2f16; border-radius:10px; padding:12px 14px;"><div class="small" style="color:#E8A33D;">Set ${e.setId}: ${e.message}</div></div>`).join('')}
      `;
      return;
    }
    overlay.remove();
    alert(`Retagged ${updated} sets by location.`);
    if (state.currentTab === 'track') renderTrack();
  });
}

async function openMergeDuplicateExercisesScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeMergeDupes">✕</button><h1>Merge Duplicates</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:8px 18px 16px 18px; color:var(--slate);">Scans for exercises that ended up as separate records sharing the same name - a real cause of wrong "on day" badges and unnecessary slowdown. History from every duplicate is kept and merged onto whichever one survives; nothing is lost.</div>
      <div id="mergeDupesBody" style="padding:0 18px;"><div class="small" style="color:var(--slate);">Scanning…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeMergeDupes').onclick = () => overlay.remove();

  await awaitMasterFlagHealed();
  const userData = { user: await getCurrentUser() };
  const uid = userData.user.id;
  const body = overlay.querySelector('#mergeDupesBody');
  const useMaster = getUseExerciseMasterFlag();

  if (!useMaster){
    // Legacy schema: duplicates are same-name records on the same weekday
    const exResult = await withTimeout(
      supabaseClient.from('exercises').select('id, name, weekday, alt_group_id, created_at').eq('user_id', uid).eq('active', true),
      15000
    );
    if (exResult.__timeout || exResult.error){
      body.innerHTML = `<div class="empty-state" style="padding:24px 0;">Could not read your exercises. Try again.</div>`;
      return;
    }
    const all = exResult.data || [];
    const byKey = {};
    all.forEach(ex => {
      const key = ex.weekday + '|' + ex.name.toLowerCase();
      (byKey[key] = byKey[key] || []).push(ex);
    });
    const dupeGroups = Object.values(byKey).filter(g => g.length > 1);
    if (!dupeGroups.length){
      body.innerHTML = `<div class="empty-state" style="padding:24px 0;">No duplicates found - your exercise library is clean.</div>`;
      return;
    }
    body.innerHTML = `
      <div style="margin-bottom:14px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px;">
        <div class="ex-name" style="font-size:13px; margin-bottom:8px;">${dupeGroups.length} case${dupeGroups.length===1?'':'s'} of duplicate records on the same day</div>
        ${dupeGroups.map(g => `<div class="small" style="color:var(--slate); padding:2px 0;">• ${g[0].name} on ${dayNameOf(g[0].weekday)} (${g.length} copies)</div>`).join('')}
      </div>
      <button class="save-btn" id="confirmMergeDupesBtn" style="margin:0 0 20px 0;">Merge Duplicates</button>
    `;
    body.querySelector('#confirmMergeDupesBtn').onclick = () => {
      showConfirmDialog(`Merges ${dupeGroups.length} case${dupeGroups.length===1?'':'s'} of duplicates. Set history from every copy is moved onto whichever one survives.`, async () => {
        await withButtonLoading(body.querySelector('#confirmMergeDupesBtn'), 'Merging…', async () => {
          let mergedCount = 0;
          const errors = [];
          for (const group of dupeGroups){
            // Survivor: whichever has an alt_group_id > oldest
            const sorted = [...group].sort((a, b) => {
              if (!!a.alt_group_id !== !!b.alt_group_id) return a.alt_group_id ? -1 : 1;
              return (a.created_at || '').localeCompare(b.created_at || '');
            });
            const survivor = sorted[0];
            const duplicates = sorted.slice(1);
            for (const dup of duplicates){
              try {
                await supabaseClient.from('sets').update({ exercise_id: survivor.id }).eq('exercise_id', dup.id);
                await supabaseClient.from('exercises').update({ active: false }).eq('id', dup.id);
                mergedCount++;
              } catch(e){
                errors.push(`${dup.name}: ${e.message}`);
              }
            }
          }
          overlay.remove();
          if (state.currentTab === 'track') renderTrack();
          alert(errors.length
            ? `Merged ${mergedCount} duplicate record${mergedCount===1?'':'s'}. ${errors.length} failed:\n${errors.join('\n')}`
            : `Merged ${mergedCount} duplicate record${mergedCount===1?'':'s'} across ${dupeGroups.length} case${dupeGroups.length===1?'':'s'}.`);
        });
      }, { title: 'Merge Duplicate Exercises?', confirmLabel: 'Merge' });
    };
    return;
  }

  const [mastersResult, daysResult] = await Promise.all([
    withTimeout(supabaseClient.from('exercise_master').select('id, name, created_at').eq('user_id', uid), 15000),
    withTimeout(supabaseClient.from('exercise_days').select('id, exercise_master_id, weekday').eq('user_id', uid), 15000)
  ]);
  if (mastersResult.__timeout || mastersResult.error){
    body.innerHTML = `<div class="empty-state" style="padding:24px 0;">Could not read your exercises. Try again.</div>`;
    return;
  }
  const masters = mastersResult.data || [];
  const days = daysResult.__timeout || daysResult.error ? [] : (daysResult.data || []);
  const daysByMaster = {};
  days.forEach(d => { (daysByMaster[d.exercise_master_id] = daysByMaster[d.exercise_master_id] || []).push(d); });

  const byName = {};
  masters.forEach(m => {
    const key = m.name.toLowerCase();
    (byName[key] = byName[key] || []).push(m);
  });
  const dupeGroups = Object.values(byName).filter(group => group.length > 1);

  if (!dupeGroups.length){
    body.innerHTML = `<div class="empty-state" style="padding:24px 0;">No duplicates found - your exercise library is clean.</div>`;
    return;
  }

  body.innerHTML = `
    <div style="margin-bottom:14px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px;">
      <div class="ex-name" style="font-size:13px; margin-bottom:8px;">${dupeGroups.length} exercise${dupeGroups.length===1?'':'s'} have duplicate records</div>
      ${dupeGroups.map(g => `<div class="small" style="color:var(--slate); padding:2px 0;">• ${g[0].name} (${g.length} copies)</div>`).join('')}
    </div>
    <button class="save-btn" id="confirmMergeDupesBtn" style="margin:0 0 20px 0;">Merge Duplicates</button>
  `;
  body.querySelector('#confirmMergeDupesBtn').onclick = () => {
    showConfirmDialog(`Merges ${dupeGroups.length} set${dupeGroups.length===1?'':'s'} of duplicate exercises. All history is kept and combined onto one record per exercise.`, async () => {
      await withButtonLoading(body.querySelector('#confirmMergeDupesBtn'), 'Merging…', async () => {
        let mergedCount = 0;
        const errors = [];
        for (const group of dupeGroups){
          // Survivor: whichever copy has the most day-placements, tiebroken by
          // being first in the list (stable, not meaningful beyond determinism).
          const survivor = group.slice().sort((a, b) => (daysByMaster[b.id]||[]).length - (daysByMaster[a.id]||[]).length)[0];
          const survivorDayweekdays = new Set((daysByMaster[survivor.id]||[]).map(d => d.weekday));
          const duplicates = group.filter(m => m.id !== survivor.id);
          for (const dup of duplicates){
            try {
              // Reassign this duplicate's logged sets onto the survivor - this is
              // the actual history, so it has to move, not just get dropped.
              await supabaseClient.from('sets').update({ exercise_master_id: survivor.id }).eq('exercise_master_id', dup.id);
              // Reassign day-links, but only where the survivor doesn't already
              // have that day (would hit the unique constraint otherwise) -
              // in that case the duplicate's link is just deleted instead.
              const dupDays = daysByMaster[dup.id] || [];
              for (const dayLink of dupDays){
                if (survivorDayweekdays.has(dayLink.weekday)){
                  await supabaseClient.from('exercise_days').delete().eq('id', dayLink.id);
                } else {
                  await supabaseClient.from('exercise_days').update({ exercise_master_id: survivor.id }).eq('id', dayLink.id);
                  survivorDayweekdays.add(dayLink.weekday);
                }
              }
              await supabaseClient.from('exercise_master').delete().eq('id', dup.id);
              mergedCount++;
            } catch(e){
              errors.push(`${dup.name}: ${e.message}`);
            }
          }
        }
        overlay.remove();
        if (state.currentTab === 'track') renderTrack();
        alert(errors.length
          ? `Merged ${mergedCount} duplicate record${mergedCount===1?'':'s'}. ${errors.length} failed:\n${errors.join('\n')}`
          : `Merged ${mergedCount} duplicate record${mergedCount===1?'':'s'} across ${dupeGroups.length} exercise${dupeGroups.length===1?'':'s'}.`);
      });
    }, { title: 'Merge Duplicate Exercises?', confirmLabel: 'Merge' });
  };
}

async function openWipeAltGroupsScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeWipeAlts">✕</button><h1>Wipe &amp; Rebuild Alt Groups</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="wipeAltsBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Checking current alt groups…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeWipeAlts').onclick = () => overlay.remove();

  const userData = { user: await getCurrentUser() };
  const uid = userData.user.id;
  const body = overlay.querySelector('#wipeAltsBody');

  const [groupsResult, exResult] = await Promise.all([
    withTimeout(supabaseClient.from('alt_groups').select('id, name').eq('user_id', uid), 15000),
    withTimeout(supabaseClient.from(getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises').select('id').eq('user_id', uid).not('alt_group_id', 'is', null), 15000)
  ]);
  const groups = groupsResult.__timeout || groupsResult.error ? [] : (groupsResult.data || []);
  const taggedCount = exResult.__timeout || exResult.error ? 0 : (exResult.data || []).length;

  body.innerHTML = `
    <div class="small" style="padding:12px 18px; color:var(--slate); line-height:1.6;">This clears every alt group assignment - a genuine restart, not an attempt to fix the existing mess in place. ${groups.length} group${groups.length===1?'':'s'} and ${taggedCount} tagged exercise${taggedCount===1?'':'s'} found right now.<br><br>After wiping, go to each day and use Auto-Group Alts to rebuild - it'll propose clusters based on muscle and movement, and you review, rename, or reject each one before anything is applied. Nothing gets forced together automatically.</div>
    <button class="save-btn" id="confirmWipeBtn" style="margin:0 18px 20px 18px; background:#E8492A;">Wipe All ${groups.length} Groups</button>
  `;

  body.querySelector('#confirmWipeBtn').onclick = () => {
    showConfirmDialog(`This clears alt group tags from ${taggedCount} exercises. Nothing else is touched - names, weights, history, all stay exactly as they are.`, async () => {
      await withButtonLoading(body.querySelector('#confirmWipeBtn'), 'Wiping…', async () => {
        const useMaster = getUseExerciseMasterFlag();
        const table = useMaster ? 'exercise_master' : 'exercises';
        await supabaseClient.from(table).update({ alt_group_id: null }).eq('user_id', uid).not('alt_group_id', 'is', null);
        await supabaseClient.from('alt_groups').delete().eq('user_id', uid);
        overlay.remove();
        alert(`Wiped. Go to each day and use Auto-Group Alts (long-press any exercise) to rebuild, one day at a time.`);
        if (state.currentTab === 'track') renderTrack();
      });
    }, { title: 'Wipe All Alt Groups?', danger: true, confirmLabel: 'Wipe' });
  };
}

async function openClearDayScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeClearDay">✕</button><h1>Clear a Day</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:8px 18px 16px 18px; color:var(--slate);">Removes every exercise from the day you pick. History for those exercises is untouched - this only clears what's showing on that day.</div>
      <div class="chip-row" id="clearDayChips" style="padding:0 18px;">
        ${DAY_NAMES.map((d, i) => `<div class="chip" data-day="${i}">${d}</div>`).join('')}<div class="chip chip-any" data-day="${ANY_DAY}">${ANY_DAY_NAME}</div>
      </div>
      <div id="clearDayBody"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeClearDay').onclick = () => overlay.remove();

  overlay.querySelectorAll('#clearDayChips .chip').forEach(chip => {
    chip.onclick = async () => {
      overlay.querySelectorAll('#clearDayChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const dayIdx = parseInt(chip.dataset.day, 10);
      const body = overlay.querySelector('#clearDayBody');
      body.innerHTML = `<div class="small" style="padding:16px 18px; color:var(--slate);">Checking ${dayNameOf(dayIdx)}…</div>`;

      const userData = { user: await getCurrentUser() };
      const allExercises = await fetchAllExercisesCompat(userData.user.id);
      const onThisDay = allExercises.filter(ex => ex.weekday === dayIdx);

      if (!onThisDay.length){
        body.innerHTML = `<div class="empty-state" style="padding:24px 18px;">${dayNameOf(dayIdx)} is already empty.</div>`;
        return;
      }
      body.innerHTML = `
        <div style="margin:12px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px;">
          <div class="ex-name" style="font-size:13px; margin-bottom:8px;">${onThisDay.length} exercise${onThisDay.length===1?'':'s'} on ${dayNameOf(dayIdx)}</div>
          ${onThisDay.map(ex => `<div class="small" style="color:var(--slate); padding:2px 0;">• ${ex.name}</div>`).join('')}
        </div>
        <button class="save-btn" id="confirmClearDayBtn" style="margin:0 18px 20px 18px; background:#E8492A;">Clear ${dayNameOf(dayIdx)}</button>
      `;
      body.querySelector('#confirmClearDayBtn').onclick = () => {
        showConfirmDialog(`Removes ${onThisDay.length} exercises from ${dayNameOf(dayIdx)}. Their logged history is kept.`, async () => {
          await withButtonLoading(body.querySelector('#confirmClearDayBtn'), 'Clearing…', async () => {
            const failures = [];
            for (const ex of onThisDay){
              const result = await removeExerciseFromDay(ex);
              if (!result.ok) failures.push({ name: ex.name, error: result.error });
            }
            overlay.remove();
            if (failures.length){
              alert(`${onThisDay.length - failures.length} of ${onThisDay.length} cleared. ${failures.length} failed:\n${failures.map(f => `${f.name}: ${f.error}`).join('\n')}`);
            } else {
              alert(`${dayNameOf(dayIdx)} cleared.`);
            }
            if (state.currentTab === 'track') renderTrack();
          });
        }, { title: `Clear ${dayNameOf(dayIdx)}?`, danger: true, confirmLabel: 'Clear' });
      };
    };
  });
}

// Maps a friendly, checkbox-able equipment category to the exercise
// database's actual `equipment` field values, so a location's equipment
// selection can directly filter which exercises are realistic there.
const EQUIPMENT_CATEGORIES = [
  { key: 'barbell', label: 'Barbell', dbValues: ['barbell', 'e-z curl bar'] },
  { key: 'dumbbell', label: 'Dumbbells', dbValues: ['dumbbell'] },
  { key: 'cable', label: 'Cables', dbValues: ['cable'] },
  { key: 'machine', label: 'Machines', dbValues: ['machine'] },
  { key: 'kettlebells', label: 'Kettlebells', dbValues: ['kettlebells'] },
  { key: 'bands', label: 'Resistance Bands', dbValues: ['bands'] },
  { key: 'bodyweight', label: 'Bodyweight Only', dbValues: ['body only'] },
  { key: 'medicine ball', label: 'Medicine Ball', dbValues: ['medicine ball'] },
  { key: 'exercise ball', label: 'Exercise Ball', dbValues: ['exercise ball'] },
  { key: 'foam roll', label: 'Foam Roller', dbValues: ['foam roll'] },
  { key: 'other', label: 'Other / Misc', dbValues: ['other'] }
];

async function openApproveContributorsScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeApprove">✕</button><h1>Approve Contributors</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:8px 18px 16px 18px; color:var(--slate); line-height:1.5;">Approve someone by their account email so they can contribute to the shared MonoLift database. They'll need to have already signed in at least once.</div>
      <div style="padding:0 18px;">
        <input id="approveEmailInput" type="email" placeholder="their@email.com" class="input-field" style="margin-bottom:12px;">
        <button class="save-btn" id="approveBtn" style="margin:0;">Approve</button>
        <div class="small" id="approveStatus" style="margin-top:10px; text-align:center;"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeApprove').onclick = () => overlay.remove();
  overlay.querySelector('#approveBtn').onclick = async () => {
    const btn = overlay.querySelector('#approveBtn');
    const statusEl = overlay.querySelector('#approveStatus');
    const email = overlay.querySelector('#approveEmailInput').value.trim();
    if (!email){ statusEl.textContent = 'Enter an email first.'; statusEl.style.color = 'var(--slate)'; return; }
    await withButtonLoading(btn, 'Approving…', async () => {
      const { data, error } = await supabaseClient.rpc('approve_contributor_by_email', { target_email: email });
      if (error){
        statusEl.textContent = `Error: ${error.message}. If this mentions a missing function, the verified_contributors migration needs to be run first.`;
        statusEl.style.color = '#E8492A';
      } else if (data === 'approved'){
        statusEl.textContent = `Approved - ${email} can now contribute.`;
        statusEl.style.color = 'var(--good)';
        overlay.querySelector('#approveEmailInput').value = '';
      } else if (data === 'user_not_found'){
        statusEl.textContent = `No account found for ${email} - they need to sign in at least once first.`;
        statusEl.style.color = '#E8A33D';
      } else {
        statusEl.textContent = 'Not authorized to approve contributors.';
        statusEl.style.color = '#E8492A';
      }
    });
  };
}

async function openPublishToMonoLiftScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closePublishMonoLift">✕</button><h1>MonoLift Database</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:8px 18px 16px 18px; color:var(--slate); line-height:1.5;">A shared exercise library, separate from the public database, built from what real users have actually added - gym-specific machines and variants the public one doesn't have. Anything you contribute here becomes visible to every MonoLift user, tagged with a ⚡ MonoLift badge in the picker.</div>
      <div id="publishList"><div class="small" style="padding:16px 18px; color:var(--slate);">Scanning your library…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closePublishMonoLift').onclick = () => overlay.remove();

  const userData = { user: await getCurrentUser() };
  const verified = await isVerifiedContributor(userData.user.id);
  if (!verified){
    overlay.querySelector('#publishList').innerHTML = `<div class="empty-state" style="padding:24px 18px;">Contributing to the shared MonoLift database needs approval first - this keeps it clean and reliable for everyone. Reach out and it'll get sorted quickly.</div>`;
    return;
  }
  const [allExercises, publicDb, zealiftDb] = await Promise.all([
    fetchAllExercisesCompat(userData.user.id), loadExerciseDB(), loadMonoLiftExerciseDB()
  ]);
  const zealiftNamesLower = new Set(zealiftDb.map(e => e.name.toLowerCase()));
  const seenNames = new Set();
  const candidates = [];
  allExercises.forEach(ex => {
    const lower = ex.name.toLowerCase();
    if (seenNames.has(lower)) return;
    seenNames.add(lower);
    if (zealiftNamesLower.has(lower)) return; // already contributed
    if (publicDb && matchExercise(ex.name, publicDb)) return; // already covered by the public database
    candidates.push({ name: ex.name });
  });

  const selected = {}; // name -> { muscle }
  const listArea = overlay.querySelector('#publishList');
  if (!candidates.length){
    listArea.innerHTML = `<div class="empty-state" style="padding:20px 18px;">Nothing to contribute right now - every exercise in your library is either already covered by the public database or already in the MonoLift database.</div>`;
    return;
  }
  listArea.innerHTML = `
    <div style="padding:0 18px;">
      ${candidates.map(c => `
        <div style="background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin-bottom:8px;">
          <div class="publish-row" data-name="${c.name}" style="display:flex; align-items:center; gap:10px; cursor:pointer;">
            <div class="check-circle publish-check" data-name="${c.name}" style="opacity:0.3; flex-shrink:0;">${ICON_CHECK}</div>
            <div class="ex-name" style="font-size:13px;">${c.name}</div>
          </div>
          <div class="publish-muscle-row" data-name="${c.name}" style="display:none; flex-direction:column; gap:6px; margin-top:10px; padding-top:10px; border-top:1px solid var(--line);">
            <div class="small" style="color:var(--slate);">Primary muscle</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${BALANCE_MUSCLES.map(m => `<div class="chip publish-muscle-chip" data-name="${c.name}" data-muscle="${m}" style="font-size:11px; padding:6px 10px;">${BALANCE_LABELS[m]}</div>`).join('')}
            </div>
            <div class="small" style="color:var(--slate); margin-top:4px;">Equipment</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${EQUIPMENT_CATEGORIES.map(cat => `<div class="chip publish-equip-chip" data-name="${c.name}" data-equip="${cat.dbValues[0]}" style="font-size:11px; padding:6px 10px;">${cat.label}</div>`).join('')}
            </div>
          </div>
        </div>
      `).join('')}
      <button class="save-btn" id="publishBtn" style="margin:14px 0 24px 0;" disabled>Select exercises to contribute</button>
    </div>`;

  function updatePublishBtn(){
    const btn = overlay.querySelector('#publishBtn');
    const ready = Object.keys(selected).filter(name => selected[name].muscle && selected[name].equipment);
    const pending = Object.keys(selected).length - ready.length;
    if (!Object.keys(selected).length){ btn.disabled = true; btn.textContent = 'Select exercises to contribute'; }
    else if (pending > 0){ btn.disabled = true; btn.textContent = `Tag ${pending} more exercise${pending===1?'':'s'}`; }
    else { btn.disabled = false; btn.textContent = `Contribute ${ready.length} Exercise${ready.length===1?'':'s'}`; }
  }

  overlay.querySelectorAll('.publish-row').forEach(row => {
    row.onclick = () => {
      const name = row.dataset.name;
      const checkEl = [...overlay.querySelectorAll('.publish-check')].find(el => el.dataset.name === name);
      const muscleRow = [...overlay.querySelectorAll('.publish-muscle-row')].find(el => el.dataset.name === name);
      if (selected[name]){
        delete selected[name];
        checkEl.style.opacity = '0.3';
        muscleRow.style.display = 'none';
      } else {
        selected[name] = { muscle: null, equipment: null };
        checkEl.style.opacity = '1';
        muscleRow.style.display = 'flex';
      }
      updatePublishBtn();
    };
  });
  overlay.querySelectorAll('.publish-muscle-chip').forEach(chip => {
    chip.onclick = (e) => {
      e.stopPropagation();
      const name = chip.dataset.name;
      if (!selected[name]) return;
      selected[name].muscle = chip.dataset.muscle;
      overlay.querySelectorAll('.publish-muscle-chip').forEach(c => { if (c.dataset.name === name) c.classList.remove('active'); });
      chip.classList.add('active');
      updatePublishBtn();
    };
  });
  overlay.querySelectorAll('.publish-equip-chip').forEach(chip => {
    chip.onclick = (e) => {
      e.stopPropagation();
      const name = chip.dataset.name;
      if (!selected[name]) return;
      selected[name].equipment = chip.dataset.equip;
      overlay.querySelectorAll('.publish-equip-chip').forEach(c => { if (c.dataset.name === name) c.classList.remove('active'); });
      chip.classList.add('active');
      updatePublishBtn();
    };
  });
  overlay.querySelector('#publishBtn').onclick = async () => {
    const btn = overlay.querySelector('#publishBtn');
    await withButtonLoading(btn, 'Publishing…', async () => {
      const rows = Object.entries(selected)
        .filter(([, v]) => v.muscle && v.equipment)
        .map(([name, v]) => ({ name, primary_muscle: v.muscle, equipment: v.equipment, contributed_by: userData.user.id }));
      const { error } = await supabaseClient.from('zealift_exercise_db').insert(rows);
      if (error){
        alert(`Could not publish: ${error.message}\n\nIf this mentions a missing table, the MonoLift database migration needs to be run first.`);
        return;
      }
      _zealiftDbCache = null; // force a fresh load next time the database tab opens
      overlay.remove();
      alert(`Published! ${rows.length} exercise${rows.length===1?'':'s'} now visible to every MonoLift user.`);
    });
  };
}



function openEditLocationEquipmentScreen(locationId, locationName, currentTags, onSaved){
  const selected = new Set(currentTags || []);
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeEditEnvEquip">✕</button><h1>${locationName}</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:8px 18px 16px 18px; color:var(--slate);">Select everything actually available at this location. Leave everything unselected to skip filtering here entirely.</div>
      <div id="envEquipChips" style="display:flex; flex-wrap:wrap; gap:8px; padding:0 18px;">
        ${EQUIPMENT_CATEGORIES.map(c => `<div class="chip env-equip-chip ${selected.has(c.key)?'active':''}" data-key="${c.key}">${c.label}</div>`).join('')}
      </div>
      <button class="save-btn" id="saveEnvEquipBtn" style="margin:24px 18px 20px 18px;">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeEditEnvEquip').onclick = () => overlay.remove();
  overlay.querySelectorAll('.env-equip-chip').forEach(chip => {
    chip.onclick = () => {
      const key = chip.dataset.key;
      if (selected.has(key)){ selected.delete(key); chip.classList.remove('active'); }
      else { selected.add(key); chip.classList.add('active'); }
    };
  });
  overlay.querySelector('#saveEnvEquipBtn').onclick = async () => {
    await withButtonLoading(overlay.querySelector('#saveEnvEquipBtn'), 'Saving…', async () => {
      const { error } = await supabaseClient.from('locations').update({ equipment_tags: [...selected] }).eq('id', locationId);
      if (error){
        alert(`Could not save: ${error.message}\n\nIf this mentions a missing column, the equipment_tags migration needs to be run first.`);
        return;
      }
      overlay.remove();
      if (onSaved) onSaved();
    });
  };
}

async function openManageLocationsScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeManageLoc">✕</button><h1>Manage Locations</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="action-row" id="newLocRowManage"><div class="ex-name" style="color:var(--flame);">+ New Location</div></div>
      <div id="manageLocList"><div class="small" style="padding:16px 18px; color:var(--slate);">Loading…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeManageLoc').onclick = () => overlay.remove();
  overlay.querySelector('#newLocRowManage').onclick = () => {
    promptText({
      title: 'New Location Name', placeholder: 'e.g. Home Gym',
      onConfirm: async (name) => { await createLocation(name); render(); }
    });
  };

  async function render(){
    const listArea = overlay.querySelector('#manageLocList');
    listArea.innerHTML = `<div class="small" style="padding:16px 18px; color:var(--slate);">Loading…</div>`;
    const locations = await loadLocations();
    if (!locations.length){
      listArea.innerHTML = `<div class="empty-state" style="padding:20px 18px;">No locations yet.</div>`;
      return;
    }
    listArea.innerHTML = locations.map(l => `
      <div class="proposal-card" style="margin:0 18px 10px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
        <div class="ex-name" style="font-size:13.5px;">${l.name}</div>
        <div style="display:flex; gap:8px;">
          <button class="manage-loc-rename" data-id="${l.id}" data-name="${l.name}" style="background:var(--ink); color:var(--slate); padding:8px 12px; border-radius:8px; font-size:11.5px;">Rename</button>
          <button class="manage-loc-delete" data-id="${l.id}" data-name="${l.name}" style="background:var(--ink); color:#E8492A; padding:8px 12px; border-radius:8px; font-size:11.5px;">Delete</button>
        </div>
      </div>
    `).join('');
    listArea.querySelectorAll('.manage-loc-rename').forEach(btn => {
      btn.onclick = () => {
        promptText({
          title: 'Rename Location', placeholder: 'Name', initialValue: btn.dataset.name,
          onConfirm: async (newName) => { await supabaseClient.from('locations').update({ name: newName }).eq('id', btn.dataset.id); render(); }
        });
      };
    });
    listArea.querySelectorAll('.manage-loc-delete').forEach(btn => {
      btn.onclick = () => {
        showConfirmDialog(`Exercises tagged to "${btn.dataset.name}" will just lose that tag - nothing else is affected.`, async () => {
          // Clear this location from every exercise's location_ids first, so
          // nothing points at a deleted row.
          const userData = { user: await getCurrentUser() };
          const table = getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises';
          const exResult = await withTimeout(supabaseClient.from(table).select('id, location_ids').eq('user_id', userData.user.id), 15000);
          const affected = (exResult.data || []).filter(ex => (ex.location_ids || []).includes(btn.dataset.id));
          for (const ex of affected){
            await supabaseClient.from(table).update({ location_ids: ex.location_ids.filter(id => id !== btn.dataset.id) }).eq('id', ex.id);
          }
          await supabaseClient.from('locations').delete().eq('id', btn.dataset.id);
          render();
        }, { title: `Delete "${btn.dataset.name}"?`, danger: true, confirmLabel: 'Delete' });
      };
    });
  }
  render();
}

async function openDefaultLocationPicker(){
  const locations = await loadLocations();
  const currentId = getDefaultLocationId();
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:70; display:flex; align-items:flex-end;';
  overlay.innerHTML = `
    <div style="width:100%; background:var(--panel); border-radius:18px 18px 0 0; padding:20px 18px calc(20px + env(safe-area-inset-bottom, 0px)) 18px;">
      <div class="field-label" style="padding:0 0 4px 0;">Default Location</div>
      <div class="small" style="padding:0 0 12px 0; color:var(--slate); line-height:1.5;">Used when logging a set if Track isn't currently set to a specific location.</div>
      ${state.locationDefaultColumnMissing ? `<div style="background:#2a1618; border:1px solid #5c2b2f; border-radius:10px; padding:11px 13px; margin-bottom:12px;">
        <div class="small" style="color:#E8492A; line-height:1.5;">⚠ Your default location is only stored on this device right now, so it gets lost whenever the browser clears its storage — which is why it may have stopped applying each day.</div>
        <div class="small" style="color:var(--slate); line-height:1.5; margin-top:6px;">Run <span style="color:var(--chalk); font-family:'JetBrains Mono',monospace;">migration_location_default.sql</span> in Supabase to make it stick permanently.</div>
      </div>` : ''}
      <div class="pick-row" data-loc="" style="${!currentId ? 'color:var(--flame);' : ''}"><div class="ex-name">None</div>${!currentId ? '<span>✓</span>' : ''}</div>
      ${locations.map(l => `<div class="pick-row" data-loc="${l.id}" style="${l.id===currentId ? 'color:var(--flame);' : ''}"><div class="ex-name">${l.name}</div>${l.id===currentId ? '<span>✓</span>' : ''}</div>`).join('')}
      <div class="pick-row" id="newDefaultLocRow"><div class="ex-name" style="color:var(--flame);">+ New Location</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelectorAll('.pick-row[data-loc]').forEach(row => {
    row.onclick = () => { setDefaultLocationId(row.dataset.loc || null); overlay.remove(); };
  });
  overlay.querySelector('#newDefaultLocRow').onclick = () => {
    promptText({
      title: 'New Location Name', placeholder: 'e.g. Home Gym',
      onConfirm: async (name) => {
        const loc = await createLocation(name);
        overlay.remove();
        if (loc) setDefaultLocationId(loc.id);
      }
    });
  };
}

function openLocationPicker(locations, currentId){
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:70; display:flex; align-items:flex-end;';
  overlay.innerHTML = `
    <div style="width:100%; background:var(--panel); border-radius:18px 18px 0 0; padding:20px 18px calc(20px + env(safe-area-inset-bottom, 0px)) 18px;">
      <div class="field-label" style="padding:0 0 8px 0;">Switch Location</div>
      <div class="pick-row" data-loc="" style="${!currentId ? 'color:var(--flame);' : ''}"><div class="ex-name">Anywhere <span class="small" style="color:var(--slate);">(no filter)</span></div>${!currentId ? '<span>✓</span>' : ''}</div>
      ${locations.map(l => `<div class="pick-row" data-loc="${l.id}" style="${l.id===currentId ? 'color:var(--flame);' : ''}"><div class="ex-name">${l.name}</div>${l.id===currentId ? '<span>✓</span>' : ''}</div>`).join('')}
      <div class="pick-row" id="newLocRow"><div class="ex-name" style="color:var(--flame);">+ New Location</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelectorAll('.pick-row[data-loc]').forEach(row => {
    row.onclick = () => {
      setCurrentLocationId(row.dataset.loc || null);
      overlay.remove();
      renderTrack();
    };
  });
  overlay.querySelector('#newLocRow').onclick = () => {
    promptText({
      title: 'New Location Name', placeholder: 'e.g. Home Gym',
      onConfirm: async (name) => {
        const loc = await createLocation(name);
        overlay.remove();
        if (loc) setCurrentLocationId(loc.id);
        renderTrack();
      }
    });
  };
}

function openEditDayTypeForm(weekday, currentLabel){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeDT">✕</button><h1>Edit Day Type</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label">${dayLabelOf(weekday)}</div>
      <div class="field-card"><input class="field-input" id="dayTypeInput" type="text" value="${currentLabel}" style="font-size:16px; font-weight:600;"></div>
      <button class="save-btn" id="saveDTBtn">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeDT').onclick = () => overlay.remove();
  overlay.querySelector('#saveDTBtn').onclick = async () => {
    const label = document.getElementById('dayTypeInput').value.trim();
    if (!label) return;
    await withButtonLoading(overlay.querySelector('#saveDTBtn'), 'Saving…', async () => {
      const userData = { user: await getCurrentUser() };
      invalidateTrackSnapshots();
      await supabaseClient.from('day_types').upsert({ user_id: userData.user.id, weekday, label }, { onConflict: 'user_id,weekday' });
      overlay.remove();
      if (state.currentTab === 'track') renderTrack();
    });
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
    { kind:'teach', title:'Welcome to MonoLift',
      body:'Your gym plan, alt groups, and history — all in one place, synced to your account. A few quick things before you dive in.' },
    { kind:'teach', title:'Make It Yours', visual: ONBOARD_VISUALS.makeItYours,
      body:`Tap the workout type at the top of Lift (e.g. "Back & Biceps") to rename it. Want to rearrange your whole week? Me → Swap Days moves an entire day's plan — and history — to a new weekday.` },
    { kind:'teach', title:'Logging a Set', visual: ONBOARD_VISUALS.logging,
      body:`Tap any exercise on Lift to log it. Colored badges show alt groups — pick one from the group, not all of them. A green check means that slot's done for the day, even if a teammate exercise covered it.` },
    { kind:'teach', title:'Adding Workouts', visual: ONBOARD_VISUALS.adding,
      body:'Tap the + button to log a set for today. Not on the list? Use "Add Existing Exercise" to pull from your full library, or "Create New Exercise" to start fresh.' },
    { kind:'teach', title:'Track Everything', visual: ONBOARD_VISUALS.tracking,
      body:`Track logs your body weight and measurements with trend charts, plus your bulk/cut phase progress. Every set you've ever logged stays in that exercise's history, forever.` }
  ];
  const setupSteps = [
    { kind:'frequency' }, { kind:'preset' }, { kind:'confirm' }, { kind:'superset' }, { kind:'location' }, { kind:'finish' }
  ];
  // Interleave: welcome -> frequency/preset/confirm -> make it yours -> logging -> superset -> adding -> tracking -> location -> finish
  let steps;
  if (mode === 'teach') steps = teachSteps;
  else if (mode === 'setup') steps = setupSteps;
  else steps = [teachSteps[0], setupSteps[0], setupSteps[1], setupSteps[2], teachSteps[1], teachSteps[2], setupSteps[3], teachSteps[3], teachSteps[4], setupSteps[4], setupSteps[5]];

  let idx = 0;
  const wiz = { numDays: 5, presetKey: 'ppl', week: computeWeekFromPreset(5,'ppl'), superset: null, locations: [], defaultLocationIdx: 0 };
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
    else if (step.kind === 'location') renderLocationStep();
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

  function renderLocationStep(){
    const expandedIdx = wiz._locExpandedIdx;
    shell(`
      <div style="font-family:'Oswald', sans-serif; font-size:19px; text-transform:uppercase; margin-bottom:6px;">Where Do You Train?</div>
      <div style="font-size:11.5px; color:var(--slate); margin-bottom:14px; line-height:1.5;">Optional, but useful - add each gym you use, and what equipment it has, so suggestions match reality. Skip this and add it anytime from Me → Locations.</div>
      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <input id="newLocInput" placeholder="e.g. Home Gym" style="flex:1; background:var(--ink); border:1px solid var(--line); border-radius:10px; padding:11px 12px; color:var(--chalk); font-size:13px;">
        <button id="addLocBtn" style="background:var(--flame); color:var(--ink); border-radius:10px; padding:0 16px; font-weight:600; font-size:13px;">Add</button>
      </div>
      <div id="wizLocList" style="display:flex; flex-direction:column; gap:8px; margin-bottom:6px; max-height:280px; overflow-y:auto;">
        ${wiz.locations.map((loc, i) => `
          <div style="background:var(--ink); border:1px solid var(--line); border-radius:10px; padding:10px 12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:8px;">
                <div class="wizLocDefault" data-i="${i}" style="width:16px; height:16px; border-radius:50%; border:1.5px solid ${wiz.defaultLocationIdx===i?'var(--flame)':'var(--slate)'}; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">${wiz.defaultLocationIdx===i?'<div style="width:8px; height:8px; border-radius:50%; background:var(--flame);"></div>':''}</div>
                <div style="font-size:13px; color:var(--chalk);">${loc.name}</div>
              </div>
              <div style="display:flex; gap:10px; align-items:center;">
                <div class="wizLocEquipToggle" data-i="${i}" style="font-size:11px; color:#7BA6C9; cursor:pointer;">${loc.equipment_tags.length ? `${loc.equipment_tags.length} set` : 'Equipment'}</div>
                <div class="wizLocRemove" data-i="${i}" style="color:var(--slate); font-size:15px; cursor:pointer;">✕</div>
              </div>
            </div>
            ${expandedIdx === i ? `
              <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; padding-top:10px; border-top:1px solid var(--line);">
                ${EQUIPMENT_CATEGORIES.map(c => `<div class="wizEquipChip chip ${loc.equipment_tags.includes(c.key)?'active':''}" data-i="${i}" data-key="${c.key}" style="font-size:11px; padding:6px 10px;">${c.label}</div>`).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
      ${wiz.locations.length > 1 ? `<div class="small" style="color:var(--slate); margin-top:4px;">Tap the circle to set which one is your default.</div>` : ''}
    `, { nextLabel: wiz.locations.length ? 'Next' : 'Skip for now' });
    overlay.querySelector('#addLocBtn').onclick = () => {
      const input = overlay.querySelector('#newLocInput');
      const name = input.value.trim();
      if (!name) return;
      wiz.locations.push({ name, equipment_tags: [] });
      wiz._locExpandedIdx = wiz.locations.length - 1; // jump straight into equipment for the one just added
      render();
    };
    overlay.querySelector('#newLocInput').onkeydown = (e) => { if (e.key === 'Enter') overlay.querySelector('#addLocBtn').click(); };
    overlay.querySelectorAll('.wizLocDefault').forEach(el => {
      el.onclick = () => { wiz.defaultLocationIdx = parseInt(el.dataset.i, 10); render(); };
    });
    overlay.querySelectorAll('.wizLocEquipToggle').forEach(el => {
      el.onclick = () => { const i = parseInt(el.dataset.i, 10); wiz._locExpandedIdx = wiz._locExpandedIdx === i ? null : i; render(); };
    });
    overlay.querySelectorAll('.wizLocRemove').forEach(el => {
      el.onclick = () => {
        const i = parseInt(el.dataset.i, 10);
        wiz.locations.splice(i, 1);
        if (wiz.defaultLocationIdx >= wiz.locations.length) wiz.defaultLocationIdx = 0;
        if (wiz._locExpandedIdx === i) wiz._locExpandedIdx = null;
        render();
      };
    });
    overlay.querySelectorAll('.wizEquipChip').forEach(chip => {
      chip.onclick = () => {
        const i = parseInt(chip.dataset.i, 10);
        const key = chip.dataset.key;
        const tags = wiz.locations[i].equipment_tags;
        const pos = tags.indexOf(key);
        if (pos === -1) tags.push(key); else tags.splice(pos, 1);
        render();
      };
    });
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
      const userData = { user: await getCurrentUser() };
      if (userData && userData.user){
        // In 'setup' mode the user explicitly tapped Redo Setup Week and
        // wants their labels rewritten - overwrite is expected. In 'full'
        // mode though, this wizard is auto-triggered and could re-fire on a
        // returning user (e.g. session refresh with stale user_metadata),
        // so we must NOT overwrite existing labels there - reading and
        // skipping any weekday that already has one.
        const preserveExisting = (mode === 'full');
        const existingByWeekday = {};
        if (preserveExisting){
          const existingResult = await withTimeout(
            supabaseClient.from('day_types').select('weekday, label').eq('user_id', userData.user.id),
            15000
          );
          if (!existingResult.__timeout && !existingResult.error){
            (existingResult.data || []).forEach(r => { existingByWeekday[r.weekday] = r.label; });
          }
        }
        for (let i = 0; i < 7; i++){
          if (preserveExisting && existingByWeekday[i]) continue;
          await supabaseClient.from('day_types').upsert(
            { user_id: userData.user.id, weekday: i, label: wiz.week[i] },
            { onConflict: 'user_id,weekday' }
          );
        }
        if (wiz.superset !== null){
          await supabaseClient.auth.updateUser({ data: { usesSupersets: wiz.superset === 'yes' } });
        }
        if (wiz.locations.length){
          for (let i = 0; i < wiz.locations.length; i++){
            const loc = wiz.locations[i];
            const created = await createLocation(loc.name);
            if (!created) continue;
            if (loc.equipment_tags.length){
              await supabaseClient.from('locations').update({ equipment_tags: loc.equipment_tags }).eq('id', created.id);
            }
            if (i === wiz.defaultLocationIdx) setDefaultLocationId(created.id);
          }
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
  const userData = { user: await getCurrentUser() };
  if (!userData || !userData.user) return;
  if (userData.user.user_metadata.onboarded) return; // already onboarded, done
  // If the metadata says not-onboarded but the user has real data, they're
  // clearly a returning user whose metadata is stale (e.g. session refresh
  // race, or the flag was never persisted correctly on their original run).
  // Never re-fire the onboarding wizard on top of real data - just silently
  // heal the flag so this check passes cleanly on future opens.
  const [dayTypesResult, mastersResult, oldExResult] = await Promise.all([
    withTimeout(supabaseClient.from('day_types').select('weekday', { count: 'exact', head: true }).eq('user_id', userData.user.id).limit(1), 10000),
    withTimeout(supabaseClient.from('exercise_master').select('id', { count: 'exact', head: true }).eq('user_id', userData.user.id).limit(1), 10000),
    withTimeout(supabaseClient.from('exercises').select('id', { count: 'exact', head: true }).eq('user_id', userData.user.id).limit(1), 10000)
  ]);
  // Fail-safe: if ANY of the checks couldn't complete (timeout or error), do
  // NOT show onboarding. A network hiccup here shouldn't be able to fire the
  // wizard on a returning user - the cost of a false-positive (showing
  // onboarding to someone who doesn't need it) is potentially wiping their
  // plan, while the cost of a false-negative (skipping onboarding for a new
  // user) is just that they see Track empty and have to add exercises
  // manually, which is recoverable.
  const anyCheckFailed = dayTypesResult.__timeout || dayTypesResult.error
    || mastersResult.__timeout || mastersResult.error
    || oldExResult.__timeout || oldExResult.error;
  if (anyCheckFailed) return;
  const hasDayTypes = (dayTypesResult.count || 0) > 0;
  const hasMaster = (mastersResult.count || 0) > 0;
  const hasOldEx = (oldExResult.count || 0) > 0;
  if (hasDayTypes || hasMaster || hasOldEx){
    // Real data exists - user is not new, mark them as onboarded and skip.
    try { await supabaseClient.auth.updateUser({ data: { onboarded: true } }); } catch(e){}
    return;
  }
  showOnboarding('full');
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
async function getSuggestedExercises(dayTypeLabel, fullLibrary, todayNames){
  const targets = getTargetMusclesForDayType(dayTypeLabel);
  if (!targets.length) return [];
  const db = await loadExerciseDB();
  if (!db) return [];
  const libraryNames = fullLibrary.map(e => e.name);
  const today = todayNames || new Set();

  // From the user's own library: things they've used before that fit today's
  // focus but aren't already sitting on today's list. Matched against the
  // database purely to read off primary muscles for the target-muscle filter.
  const libraryCandidates = fullLibrary
    .filter(ex => !today.has(ex.name.toLowerCase()))
    .map(ex => ({ ex, match: matchExercise(ex.name, db) }))
    .filter(({ match }) => match && (match.primaryMuscles || []).some(m => targets.includes(m)));
  const dedupedLibrary = [];
  const seenLibraryNames = new Set();
  libraryCandidates.sort(() => Math.random() - 0.5).forEach(({ ex, match }) => {
    const key = ex.name.toLowerCase();
    if (seenLibraryNames.has(key)) return;
    seenLibraryNames.add(key);
    dedupedLibrary.push({ ...match, name: ex.name, source: 'library' });
  });
  const libraryPicks = dedupedLibrary.slice(0, 4);

  // From the public database: genuinely new to the user, not already
  // anywhere in their library (not just today).
  const candidates = db.filter(e => (e.primaryMuscles || []).some(m => targets.includes(m)));
  const fresh = candidates.filter(cand => !libraryNames.some(name => namesAreSimilar(name, cand.name)));
  const starred = fresh.filter(e => POPULAR_EXERCISES.has(e.name)).sort(() => Math.random() - 0.5);
  const unstarred = fresh.filter(e => !POPULAR_EXERCISES.has(e.name)).sort(() => Math.random() - 0.5);
  // Prioritized, not exclusive: fill up to half the slots from starred exercises
  // when available, then top up the rest from whatever's left (unstarred first,
  // spilling into any remaining starred if the pool is thin) - so familiar staples
  // surface more often without every suggestion always being the same handful.
  const picked = starred.slice(0, 2);
  const rest = unstarred.concat(starred.slice(2)).sort(() => Math.random() - 0.5);
  picked.push(...rest.slice(0, 4 - picked.length));
  const databasePicks = picked.sort(() => Math.random() - 0.5).map(e => ({ ...e, source: 'database' }));

  return [...libraryPicks, ...databasePicks];
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
      <button class="save-btn" id="addSuggestionBtn" style="margin-top:6px;">+ Add to ${dayLabelOf(state.selectedDay)}</button>
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

  overlay.querySelector('#addSuggestionBtn').onclick = async () => { await withButtonLoading(overlay.querySelector('#addSuggestionBtn'), 'Adding…', async () => {
    // Capture the target day at the moment of tap, not lazily inside the
    // async chain - state.selectedDay could shift between the existence
    // check and the write (day chip re-tap, day-rollover snap).
    const targetDay = state.selectedDay;
    const userData = { user: await getCurrentUser() };
    // This was the actual source of same-day duplicates: tapping "+ Add" more
    // than once on the same suggestion (e.g. navigating back to it, or
    // re-adding after it resurfaces) inserted a brand new record every time
    // with no check for one already existing today. Now checks first, same
    // as the other add-exercise flow already does correctly.
    const compatEx = await fetchAllExercisesCompat(userData.user.id);
    const existingMatch = compatEx.find(ex => ex.weekday === targetDay && ex.name.toLowerCase() === name.toLowerCase());
    if (existingMatch){
      overlay.remove();
      state.currentTab = 'track';
      openLogForm(existingMatch.masterId || existingMatch.id, name);
      return;
    }
    const { error } = await createExerciseForToday({ user_id: userData.user.id, name, category, weekday: targetDay, alt_group_id: null });
    if (error){ alert(error.message); return; }
    overlay.remove();
    state.currentTab = 'track';
    renderTrack();
  }); };
}

async function fetchTrackHeaderStats(){
  const userData = { user: await getCurrentUser() };
  if (!userData || !userData.user) return { volumeKg: 0, setsToday: 0, streak: 0, targetDateIsToday: true, targetWeekday: todayWeekday(), targetIsFuture: false };
  // Shared date logic - see targetDateInfo() at the top.
  // Uses the same done-date as the exercise cards. Without this you could
  // log Friday's session on Thursday, see every card turn green, and read
  // "Volume FRI: 0" directly above them - two correct-in-isolation answers
  // that contradict each other on screen.
  const { targetWeekday, doneDateStr, targetDateIsToday, targetIsFuture } = targetDateInfo();
  const targetDateStr = doneDateStr;
  const since = new Date(Date.now() - 60*86400000).toISOString().slice(0,10);
  // Two narrow queries instead of one wide one. Volume and set count need
  // full detail but only for a SINGLE date; the streak needs 60 days but
  // only the dates themselves. Previously this pulled full rows for the
  // whole 60-day window - six columns of every set the user logged in two
  // months - to compute a number that only reads logged_at.
  const [targetResult, streakResult] = await Promise.all([
    withTimeout(
          supabaseClient.from('sets')
            .select('weight, weight_unit, weight_type, reps, num_sets, logged_at')
            .eq('user_id', userData.user.id).eq('logged_at', targetDateStr),
          15000),
    withTimeout(
      supabaseClient.from('sets').select('logged_at')
        .eq('user_id', userData.user.id).gte('logged_at', since),
      15000)
  ]);
  const targetSets = (targetResult.__timeout || targetResult.error) ? [] : (targetResult.data || []);
  const streakSets = (streakResult.__timeout || streakResult.error) ? [] : (streakResult.data || []);
  const setsToday = targetSets.reduce((sum, s) => sum + (Number(s.num_sets) || 1), 0);
  let volumeKg = 0;
  targetSets.forEach(s => {
    const weightNum = Number(s.weight);
    if (s.weight === null || s.weight === undefined || isNaN(weightNum)) return;
    if (s.weight_unit !== 'kg' && s.weight_unit !== 'lb') return;
    const kgWeight = s.weight_unit === 'lb' ? convertWeight(weightNum, 'lb', 'kg') : weightNum;
    const perSideMultiplier = s.weight_type === 'per' ? 2 : 1;
    // reps is optional in the save form - fall back to 1 rather than
    // excluding the set entirely, since a missing rep count shouldn't
    // erase otherwise-real weight data from the total.
    const repsNum = Number(s.reps) || 1;
    volumeKg += kgWeight * perSideMultiplier * repsNum * (Number(s.num_sets) || 1);
  });
  const streak = computeConsistencyStreak(streakSets);
  return { volumeKg: Math.round(volumeKg), setsToday, streak: streak.current, targetDateIsToday, targetWeekday, targetIsFuture };
}

// Suggestions markup, shared by the inline (cached) render and the
// deferred injection so the two can never drift apart.
// ---------- Instant-render snapshot cache ----------
//
// The Track screen needs a Supabase round trip before it can show anything,
// so every open displayed "Loading your exercises…" for the length of a
// network request - even though the answer is almost always byte-identical
// to the previous open. This caches the resolved exercise list locally so
// the next open paints instantly from it, then refreshes in the background
// and re-renders only if something actually changed.
//
// Safety properties this deliberately maintains:
// - Keyed by user id, so switching accounts can never surface another
//   account's plan.
// - Keyed by weekday and location, since those change what's shown.
// - Carries a schema version, so if the exercise shape changes in future the
//   old snapshots are ignored rather than fed to a renderer expecting new
//   fields.
// - Only ever holds REAL user data that came back from a successful query -
//   never defaults, never a guess - so it cannot reintroduce the "my plan
//   reset to exercises I never picked" class of bug.
const SNAPSHOT_SCHEMA = 3;
const SNAPSHOT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

function snapshotKey(uid, weekday, locationId){
  return `ml_snap_${SNAPSHOT_SCHEMA}_${uid}_${weekday}_${locationId || 'any'}`;
}
function readTrackSnapshot(uid, weekday, locationId){
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(snapshotKey(uid, weekday, locationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== SNAPSHOT_SCHEMA) return null;
    if (!Array.isArray(parsed.exercises)) return null;
    if (Date.now() - (parsed.at || 0) > SNAPSHOT_MAX_AGE_MS) return null;
    return parsed;
  } catch(e){ return null; }
}
function writeTrackSnapshot(uid, weekday, locationId, exercises, dayTypeLabel, headerStats, locations){
  if (!uid || !Array.isArray(exercises)) return;
  try {
    localStorage.setItem(snapshotKey(uid, weekday, locationId), JSON.stringify({
      schema: SNAPSHOT_SCHEMA, at: Date.now(), exercises, dayTypeLabel, headerStats,
      locations: (locations || []).map(l => ({ id: l.id, name: l.name, is_default: l.is_default }))
    }));
  } catch(e){ /* quota or private mode - the app works fine without it */ }
}
// Any write that changes what a day contains invalidates every snapshot for
// this user, since a single change can affect multiple days (moves, alt
// groups, renames). Cheap to rebuild, and far safer than trying to surgically
// patch individual keys.
function invalidateTrackSnapshots(){
  // The warm in-memory cache reflects the same underlying data, so anything
  // that invalidates a snapshot must invalidate it too - otherwise a tab
  // switch could show a value the user just changed.
  warmInvalidate();
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.startsWith('ml_snap_')) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
  } catch(e){}
}

// ---------- Warm data cache ----------
//
// Tab switches were re-fetching data that is virtually always unchanged, so
// every tap cost a network round trip and a "Loading…" screen. This holds the
// last resolved value per key in memory and hands it back synchronously when
// warm, which lets a screen render with no await at all, while a refresh runs
// behind the paint and repaints only if something actually changed.
//
// In-memory rather than localStorage on purpose: the complaint is about
// switching tabs within a session, and keeping it in memory means it cannot
// outlive a sign-out or go stale across days.
const _warm = new Map();
const WARM_TTL_MS = 60 * 1000;

function warmPeek(key){
  const hit = _warm.get(key);
  return hit ? hit.value : undefined;
}
// Returns { value, fresh } - value may be a cached result. When not fresh the
// caller should also await refresh() and repaint if the result differs.
function warmGet(key, loader){
  const hit = _warm.get(key);
  const isFresh = hit && (Date.now() - hit.at) < WARM_TTL_MS;
  if (isFresh){
    return { value: hit.value, fresh: true, refresh: null };
  }
  const refresh = (async () => {
    try {
      const value = await loader();
      _warm.set(key, { value, at: Date.now() });
      return value;
    } catch(e){
      // Keep whatever we had rather than blanking the screen on a hiccup.
      return hit ? hit.value : null;
    }
  })();
  return { value: hit ? hit.value : undefined, fresh: false, refresh };
}
function warmInvalidate(prefix){
  if (!prefix){ _warm.clear(); return; }
  [..._warm.keys()].filter(k => k.startsWith(prefix)).forEach(k => _warm.delete(k));
}

// Warms the data behind the tabs the user hasn't opened yet, once the first
// screen is painted and the main thread is free. By the time they tap Track,
// Phase or Balance the answer is usually already in memory, so the switch is
// instant instead of paying a round trip on first visit.
let _prefetchDone = false;
function prefetchOtherTabs(){
  if (_prefetchDone) return;
  _prefetchDone = true;
  const run = () => {
    // Body weight and phase are shared by both Track and Phase, so warming
    // them covers two tabs for the price of one.
    warmGet('bodyWeight', loadBodyWeight).refresh;
    warmGet('phase', loadPhase).refresh;
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1200);
}

function buildSuggestionsHtml(suggestions, effectiveDayTypeLabel){
  if (!suggestions || !suggestions.length) return '';
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const libraryItems = suggestions.filter(s => s.source === 'library');
  const databaseItems = suggestions.filter(s => s.source !== 'library');
  const renderSuggestionRow = (s) => {
    const cat = EQUIPMENT_TO_CATEGORY[s.equipment] || 'Other';
    const muscleLabel = s.primaryMuscles && s.primaryMuscles[0] ? cap(s.primaryMuscles[0]) : '';
    const star = POPULAR_EXERCISES.has(s.name)
      ? `<span title="Popular staple" style="color:#F0C542; margin-left:5px;">★</span>` : '';
    return `<div class="pick-row suggestion-add" data-name="${s.name}" data-cat="${cat}">
      <div><div class="ex-name">${s.name}${star}</div><div class="small" style="color:var(--slate);">${muscleLabel}</div></div>
      <div class="chev" style="color:var(--flame); font-size:20px;">+</div>
    </div>`;
  };
  return `<div class="category" style="display:flex; align-items:center; justify-content:space-between;">
      <div>Try Something New for ${effectiveDayTypeLabel}</div>
      <div style="display:flex; gap:2px;">
        <button id="refreshSuggestions" style="background:none; width:38px; height:38px; display:flex; align-items:center; justify-content:center; border-radius:8px;"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--flame)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>
        <button id="seeAllSuggestions" style="background:none; width:38px; height:38px; display:flex; align-items:center; justify-content:center; border-radius:8px;"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--flame)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
      </div>
    </div>
    ${libraryItems.length ? `<div class="small" style="padding:0 18px 8px 18px; color:var(--slate);">From your own library - used before, just not on ${dayLabelOf(state.selectedDay)}.</div>${libraryItems.map(renderSuggestionRow).join('')}` : ''}
    ${databaseItems.length ? `<div class="small" style="padding:${libraryItems.length ? '10px' : '0'} 18px 8px 18px; color:var(--slate);">Not in your library yet — pulled from a public exercise database based on today's focus.</div>${databaseItems.map(renderSuggestionRow).join('')}` : ''}`;

}

async function renderTrack(){
  // Concurrency guard: if another renderTrack fires while this one is
  // awaiting, both would race to write state.exercises - the stale one
  // could win and show wrong-day data. Each call gets a generation number;
  // if state.renderGeneration changes during any await, this call is stale
  // and returns without touching UI or state.
  const myGeneration = ++state.renderGeneration;
  const isStale = () => state.renderGeneration !== myGeneration;

  // FAST PATH. Everything below the network fetch is pure computation over
  // data we very likely already have from last time. Painting a snapshot
  // first turns the open from "spinner for a network round trip" into
  // "content immediately, quietly corrected a moment later" - which is the
  // difference between the app feeling slow and feeling instant, without
  // showing anything that isn't real logged data.
  const snapUid = (state.session && state.session.user) ? state.session.user.id : null;
  const snapLoc = effectiveLocationId();
  const snap = readTrackSnapshot(snapUid, state.selectedDay, snapLoc);
  let paintedFromSnapshot = false;
  if (snap){
    const exdbCached = _exdbCache; // only if already in memory - never block
    if (exdbCached){
      state.exercises = snap.exercises;
      state.exercisesError = null;
      try {
        await renderTrackFromData(snap.dayTypeLabel, snap.headerStats, exdbCached, snap.locations || [], myGeneration, isStale, true);
        paintedFromSnapshot = true;
      } catch(e){
        // A snapshot that can't render is not worth debugging at the user's
        // expense - fall through to the normal path and let it repaint.
        console.error('Snapshot render failed, falling back:', e);
      }
    }
  }
  if (isStale()) return;
  if (!paintedFromSnapshot){
    app.innerHTML = `<div class="app-shell"><div class="login-wrap"><div class="login-sub">Loading your exercises…</div></div></div>`;
  }

  // Everything the first paint needs, started at once. loadExerciseDB and
  // loadLocations don't depend on any of the other results, so awaiting them
  // in a second batch just stacked another full round-trip latency onto the
  // load with nothing gained.
  const [, dayTypeLabel, headerStats, exdb, allLocations] = await Promise.all([
    loadExercises(myGeneration),
    loadDayType(state.selectedDay),
    fetchTrackHeaderStats(),
    loadExerciseDB(),
    loadLocations()
  ]);
  if (isStale()) return;

  // Store the fresh result for the next open. Only ever real data from a
  // successful load - a failed load leaves state.exercises null and is
  // skipped here, so a snapshot can never preserve an error state.
  if (Array.isArray(state.exercises) && snapUid){
    writeTrackSnapshot(snapUid, state.selectedDay, snapLoc, state.exercises, dayTypeLabel, headerStats, allLocations);
  }
  return renderTrackFromData(dayTypeLabel, headerStats, exdb, allLocations, myGeneration, isStale, false);
}

async function renderTrackFromData(dayTypeLabel, headerStats, exdb, allLocations, myGeneration, isStale, fromSnapshot){
  // dayTypeLabel can be: a string (real label from DB), null (no row - user
  // never set one), or an { __unavailable } marker (transient fetch failure).
  // Only the first is a real label; the other two must not silently fall
  // back to a hardcoded default plan, which was the "resetting to defaults
  // I never set" behavior. Downstream code operates on effectiveDayTypeLabel.
  const dayTypeUnavailable = dayTypeLabel && typeof dayTypeLabel === 'object' && dayTypeLabel.__unavailable;
  const effectiveDayTypeLabel = (typeof dayTypeLabel === 'string' && dayTypeLabel)
    ? dayTypeLabel
    : (dayTypeUnavailable ? '—' : (isAnyDay(state.selectedDay) ? ANY_DAY_LABEL : dayNameOf(state.selectedDay)));

  // Coerce a load-failed null into an empty array for the intermediate
  // computations (progress, muscles, sorting) so nothing crashes. The load
  // failure signal is preserved in state.exercisesError and the render
  // branches at the bottom check that first, showing the error state
  // instead of the misleading empty state.
  const loadFailed = state.exercises === null;
  const workingExercises = loadFailed ? [] : state.exercises;

  // slot-based progress: exercises sharing an alt_group_id count once
  const seenGroups = new Set();
  let totalSlots = 0, doneSlots = 0;
  workingExercises.forEach(ex => {
    const key = ex.alt_group_id || ex.id;
    if (seenGroups.has(key)) return;
    seenGroups.add(key);
    totalSlots++;
    if (ex.loggedToday || ex.completeVia) doneSlots++;
  });
  const pct = totalSlots > 0 ? Math.round((doneSlots / totalSlots) * 100) : 0;

  const groupBy = getGroupByPref();
  workingExercises.forEach(ex => { ex.mechanicInfo = classifyMechanic(matchExercise(ex.name, exdb)); });
  const splitModePref = getSplitModePref();
  const isUpperLowerMode = splitModePref === 'upperlower';
  workingExercises.forEach(ex => {
    const match = matchExercise(ex.name, exdb);
    const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
    const ul = ex.upper_lower || classifyUpperLower(muscle);
    if (isUpperLowerMode){
      ex.splitLabel = ul === 'upper' ? 'upper' : ul === 'lower' ? 'lower' : null;
    } else {
      const pp = ex.push_pull || classifyPushPull(muscle, ex.name);
      ex.splitLabel = ul === 'lower' ? 'legs' : (pp === 'push' ? 'push' : pp === 'pull' ? 'pull' : null);
    }
  });
  const currentLocationId = effectiveLocationId();
  workingExercises.forEach(ex => { ex.locationAvailable = isAvailableOnSelectedDay(ex, currentLocationId); });
  const currentLocationName = allLocations.find(l => l.id === currentLocationId)?.name || null;
  const hideCompleted = getHideCompletedPref();
  // Strict location filter: only what's actually available here, full stop -
  // not exercises that aren't here even if an alt-group swap exists elsewhere.
  // A separate list from state.exercises so progress stats above still
  // reflect the whole day's plan, not just what's visible right now.
  const visibleExercises = workingExercises.filter(ex =>
    ex.locationAvailable && (!hideCompleted || !(ex.loggedToday || ex.completeVia))
  );
  const { grouped, orderedKeys } = await groupExercisesByChoice(visibleExercises, groupBy);

  let suggestions = [];
  // Only use what's already cached for this render. Computing suggestions
  // cold requires fetching the user's whole exercise library and running
  // matching against the exercise database - real work, for a block that
  // sits at the very bottom of the page. Blocking the exercises the user
  // actually opened the app for behind it is the wrong trade, so a cold
  // computation is kicked off after paint and injected when ready.
  let suggestionsPending = false;
  if (workingExercises.length > 0){
    if (!state.suggestionsCache) state.suggestionsCache = {};
    const cacheKey = state.selectedDay;
    if (state.suggestionsCache[cacheKey]) suggestions = state.suggestionsCache[cacheKey];
    else suggestionsPending = true;
  }

  const q = todayQuote();
  const dayChips = DAY_NAMES.map((d, i) => {
    const isSelected = i === state.selectedDay;
    const isToday = i === todayWeekday();
    return `<button class="day ${isSelected ? 'active' : ''} ${isToday ? 'today-marker' : ''}" data-day="${i}">${d}</button>`;
  }).join('')
  // The Anytime slot sits at the end of the row, visually distinct so it
  // doesn't read as an eighth day of the week. This is where exercises that
  // belong to no particular day live - band work, travel sessions, anything
  // improvised.
  + `<button class="day day-any ${state.selectedDay === ANY_DAY ? 'active' : ''}" data-day="${ANY_DAY}" aria-label="Anytime">${ANY_DAY_NAME}</button>`;

  let listHtml = '';
  state.trackFlatOrder = [];
  state.trackBestSetById = {};
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
  if (state.exercises === null){
    // Load failed - explicit error state, NOT empty state. Empty state
    // looks like "your plan got wiped" and shows default suggestions,
    // which is exactly the confusing symptom the user has reported.
    listHtml = `<div class="empty-state" style="padding:24px 18px; text-align:center;">
      <div style="font-size:14px; color:#E8492A; margin-bottom:6px;">Could not load your exercises</div>
      <div style="font-size:12px; color:var(--slate); margin-bottom:14px;">${state.exercisesError === 'timeout' ? 'The request timed out.' : 'Something went wrong reading your data.'} Your plan is not lost - just try again.</div>
      <button class="btn-primary" id="retryLoadBtn" style="max-width:220px; margin:0 auto;">Retry</button>
    </div>`;
  } else if (state.exercises.length === 0){
    const starters = getStarterExercises(effectiveDayTypeLabel);
    listHtml = `<div class="empty-state">No exercises set for ${dayLabelOf(state.selectedDay)} yet.</div>
      <div class="category">Quick Add — Common for ${effectiveDayTypeLabel}</div>
      ${starters.map(s => `<div class="pick-row starter-add" data-name="${s.name}" data-cat="${s.category}"><div class="ex-name">${s.name}</div><div class="chev" style="color:var(--flame); font-size:20px;">+</div></div>`).join('')}
      <div style="padding:14px 18px;"><button class="btn-primary" id="emptyAddBtn">+ Add a Different Exercise</button></div>
      <div style="padding:0 18px 14px 18px;"><button class="btn-primary" id="logOffPlanBtn" style="width:100%; background:var(--panel); color:var(--chalk); border:1px solid var(--line);">Log something off-plan</button></div>`;
  } else if (visibleExercises.length === 0 && currentLocationId){
    // The user HAS exercises on this day, but every one of them is tagged
    // for a different location so they all got filtered out. Without this
    // guard the day would look empty AND the "Try Something New" suggestion
    // block below would render - which looks exactly like the plan got
    // wiped and replaced with defaults, when actually it's a location
    // filter hiding real user data. Show what's really happening and
    // offer a one-tap escape.
    const hiddenCount = state.exercises.length;
    listHtml = `<div class="empty-state" style="padding:24px 18px; text-align:center;">
      <div style="font-size:14px; color:var(--chalk); margin-bottom:6px;">All ${hiddenCount} of your ${dayLabelOf(state.selectedDay)} exercises are tagged for another location.</div>
      <div style="font-size:12px; color:var(--slate); margin-bottom:14px;">They're not gone - just filtered out because you're currently at <span style="color:var(--flame);">${currentLocationName || 'a specific location'}</span>.</div>
      <button class="btn-primary" id="logOffPlanBtn" style="max-width:240px; margin:0 auto 8px auto;">Log what's here</button>
      <button class="btn-primary" id="clearLocationBtn" style="max-width:240px; margin:0 auto; background:var(--panel); color:var(--chalk); border:1px solid var(--line);">Show exercises from anywhere</button>
    </div>`;
  }
  const suppressSuggestionsForLocation = visibleExercises.length === 0 && workingExercises.length > 0 && currentLocationId;
  const suppressForLoadFailure = loadFailed;
  const suggestionsHtml = (suggestions.length > 0 && !suppressSuggestionsForLocation && !suppressForLoadFailure)
    ? buildSuggestionsHtml(suggestions, effectiveDayTypeLabel) : '';

  app.innerHTML = `
    <div class="app-shell">
      <div class="scroll-area">
        ${renderBrandbar(allLocations.length > 0 ? `<div id="locSwitcher" style="display:flex; align-items:center; gap:5px; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:5px 10px 5px 8px; cursor:pointer;">
            <span style="font-size:10px;">📍</span>
            <span style="font-family:'Bebas Neue',sans-serif; font-size:10px; color:var(--flame); letter-spacing:0.5px;">${currentLocationName ? currentLocationName.toUpperCase() : 'ANYWHERE'}</span>
          </div>` : '')}
        <div class="day-strip">${dayChips}</div>
        <div class="header">
          <div class="eyebrow">${dayLabelOf(state.selectedDay).toUpperCase()}</div>
          <h1 id="dayTypeHeader" style="cursor:pointer;${dayTypeUnavailable ? ' color:#E8A33D;' : ''}">${effectiveDayTypeLabel}</h1>
          <div class="quote">"${q.t}" — ${q.a}</div>
        </div>
        <div style="display:flex; margin:14px 18px 0 18px; border-radius:14px; overflow:hidden;
          background:linear-gradient(165deg, #202226, #191a1d); border:1px solid rgba(255,255,255,0.06);
          box-shadow:0 8px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03);">
          <div style="flex:1; text-align:center; padding:14px 6px; border-right:1px solid rgba(255,255,255,0.06);">
            <div style="font-family:'JetBrains Mono',monospace; font-size:17px; font-weight:600; color:var(--chalk);">${headerStats.volumeKg.toLocaleString()}kg</div>
            <div style="font-size:8.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.4px; margin-top:2px;">Volume ${headerStats.targetDateIsToday ? 'Today' : dayLabelOf(headerStats.targetWeekday)}</div>
          </div>
          <div style="flex:1; text-align:center; padding:14px 6px; border-right:1px solid rgba(255,255,255,0.06);">
            <div style="font-family:'JetBrains Mono',monospace; font-size:17px; font-weight:600; color:var(--flame);">${headerStats.streak}</div>
            <div style="font-size:8.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.4px; margin-top:2px;">Day Streak</div>
          </div>
          <div style="flex:1; text-align:center; padding:14px 6px;">
            <div style="font-family:'JetBrains Mono',monospace; font-size:17px; font-weight:600; color:var(--chalk);">${headerStats.setsToday}</div>
            <div style="font-size:8.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.4px; margin-top:2px;">Sets ${headerStats.targetDateIsToday ? 'Today' : dayLabelOf(headerStats.targetWeekday)}</div>
          </div>
        </div>
        <div style="padding:8px 18px 0 18px; display:flex; gap:8px; flex-wrap:wrap;">
          ${isAnyDay(state.selectedDay) && workingExercises.length > 0 ? `<button id="toolbarClearAnyBtn" style="display:flex; align-items:center; gap:6px; height:38px; padding:0 14px; border-radius:10px; background:var(--panel); border:1px solid var(--line); color:var(--slate);">
            <span style="font-family:'Bebas Neue',sans-serif; font-size:12px; letter-spacing:0.5px;">CLEAR</span>
          </button>` : ''}
          <button id="toolbarTimerBtn" style="display:flex; align-items:center; gap:6px; height:38px; padding:0 14px; border-radius:10px; background:rgba(255,107,26,0.10); border:1px solid rgba(255,107,26,0.45); color:var(--flame);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M9 2h6"/></svg>
            <span style="font-family:'Bebas Neue',sans-serif; font-size:12px; letter-spacing:0.5px;">TIMER</span>
          </button>
          ${workingExercises.some(ex => !ex.alt_group_id) ? `<button id="toolbarAutoGroupBtn" style="display:flex; align-items:center; gap:6px; height:38px; padding:0 14px; border-radius:10px; background:var(--panel); border:1px solid var(--line); color:var(--slate);">
            <span style="font-family:'Bebas Neue',sans-serif; font-size:12px; letter-spacing:0.5px;">ALTS</span>
          </button>` : ''}
          ${workingExercises.some(ex => ex.loggedToday || ex.completeVia) ? `<button id="toolbarHideCompletedBtn" style="display:flex; align-items:center; gap:6px; height:38px; padding:0 14px; border-radius:10px; background:${hideCompleted?'rgba(255,107,26,0.12)':'var(--panel)'}; border:1px solid ${hideCompleted?'var(--flame)':'var(--line)'}; color:${hideCompleted?'var(--flame)':'var(--slate)'};">
            <span style="font-family:'Bebas Neue',sans-serif; font-size:12px; letter-spacing:0.5px;">HIDE</span>
          </button>` : ''}
        </div>
        <div style="margin:12px 18px 14px 18px; height:5px; background:rgba(255,255,255,0.04); border-radius:3px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; border-radius:3px; background:linear-gradient(90deg, #FF7A2E, #FFAA5C); box-shadow:0 0 10px rgba(255,107,26,0.5);"></div>
        </div>
        ${workingExercises.length > 0 ? groupByToggleHtml(groupBy) : ''}
        ${listHtml}
        <div id="suggestionsSlot">${suggestionsHtml}</div>
      </div>
      ${renderTabbar()}
    </div>`;

  attachShellHandlers();
  prefetchOtherTabs(); // warm the other tabs while the main thread is idle
  // Suggestions were deferred off the critical path - compute them now that
  // the page is interactive and inject into the reserved slot. Guarded by the
  // same generation token as the render, so a stale computation from a
  // superseded render can never overwrite the current day's suggestions.
  if (suggestionsPending && !suppressSuggestionsForLocation && !loadFailed && !fromSnapshot){
    (async () => {
      try {
        const u = await getCurrentUser();
        if (!u || isStale()) return;
        const compatEx = await fetchAllExercisesCompat(u.id);
        if (isStale()) return;
        const fullLibrary = compatEx.length ? compatEx.map(ex => ({ name: ex.name })) : workingExercises;
        const todayNames = new Set(workingExercises.map(ex => ex.name.toLowerCase()));
        const computed = await getSuggestedExercises(effectiveDayTypeLabel, fullLibrary, todayNames);
        if (isStale()) return;
        state.suggestionsCache[state.selectedDay] = computed;
        const slot = document.getElementById('suggestionsSlot');
        if (slot && computed.length){
          slot.innerHTML = buildSuggestionsHtml(computed, effectiveDayTypeLabel);
          attachSuggestionHandlers();
        }
      } catch(e){
        // Suggestions are a nice-to-have - never let a failure here disturb
        // the page the user is already using.
        console.error('Deferred suggestions failed:', e);
      }
    })();
  }
  document.getElementById('dayTypeHeader').onclick = () => openEditDayTypeForm(state.selectedDay, typeof dayTypeLabel === 'string' ? dayTypeLabel : '');
  const locSwitcher = document.getElementById('locSwitcher');
  if (locSwitcher) locSwitcher.onclick = () => openLocationPicker(allLocations, currentLocationId);
  const clearAnyBtn = document.getElementById('toolbarClearAnyBtn');
  if (clearAnyBtn) clearAnyBtn.onclick = () => {
    const count = workingExercises.length;
    showConfirmDialog(
      `Remove all ${count} exercise${count===1?'':'s'} from Anytime? Every set you've logged against them is kept, and the exercises stay in your library — this only empties the Anytime slot.`,
      async () => {
        await withButtonLoading(clearAnyBtn, 'Clearing…', async () => {
          const failures = [];
          for (const ex of workingExercises){
            const result = await removeExerciseFromDay(ex);
            if (!result.ok) failures.push(ex.name);
          }
          invalidateTrackSnapshots();
          renderTrack();
          if (failures.length) alert(`Could not remove: ${failures.join(', ')}. Nothing else was affected.`);
        });
      }, { title: 'Clear Anytime?', danger: true, confirmLabel: 'Clear' });
  };
  const timerBtn = document.getElementById('toolbarTimerBtn');
  if (timerBtn) timerBtn.onclick = () => openTimer();
  const autoGroupBtn = document.getElementById('toolbarAutoGroupBtn');
  if (autoGroupBtn) autoGroupBtn.onclick = () => openAutoAltReview();
  const hideCompletedBtn = document.getElementById('toolbarHideCompletedBtn');
  if (hideCompletedBtn) hideCompletedBtn.onclick = () => { setHideCompletedPref(!hideCompleted); renderTrack(); };
  document.querySelectorAll('.cat-rename-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const oldName = btn.dataset.cat;
      promptText({
        title: `Rename "${oldName}"`, placeholder: 'New category name', initialValue: oldName,
        onConfirm: async (newName) => {
          if (newName === oldName) return;
          const userData = { user: await getCurrentUser() };
          const table = getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises';
          const { error } = await supabaseClient.from(table)
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
  if (workingExercises.length > 0 && orderedKeys.some(k => (grouped[k]||[]).length)){
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
  document.querySelectorAll('.ex-save-set-btn').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); openLogForm(el.dataset.id, el.dataset.name); };
  });
  document.querySelectorAll('.ex-quick-save-btn').forEach(el => {
    el.onclick = async (e) => {
      e.stopPropagation();
      if (el.dataset.saving) return; // guards against a double-tap firing two inserts
      el.dataset.saving = '1';
      const originalText = el.textContent;
      el.textContent = 'Saving…';
      const best = (state.trackBestSetById || {})[el.dataset.id];
      const ok = await quickSaveSet(el.dataset.id, el.dataset.name, best);
      if (ok) renderTrack();
      else { el.textContent = originalText; delete el.dataset.saving; }
    };
  });
  document.querySelectorAll('.alt-badge-tap').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      showAltGroupHistory(el.dataset.groupId, el.dataset.groupName);
    };
  });
  const emptyBtn = document.getElementById('emptyAddBtn');
  if (emptyBtn) emptyBtn.onclick = openNewExerciseForm;
  const retryBtn = document.getElementById('retryLoadBtn');
  if (retryBtn) retryBtn.onclick = () => { state.exercises = []; renderTrack(); };
  const clearLocBtn = document.getElementById('clearLocationBtn');
  if (clearLocBtn) clearLocBtn.onclick = () => openLocationPicker(allLocations, currentLocationId);
  const offPlanBtn = document.getElementById('logOffPlanBtn');
  if (offPlanBtn) offPlanBtn.onclick = () => openPicker('offplan');
  document.querySelectorAll('.starter-add').forEach(el => {
    el.onclick = () => quickAddStarter(el.dataset.name, el.dataset.cat, state.selectedDay);
  });
  attachSuggestionHandlers();
}

// Shared by the inline render and the deferred injection - suggestion rows
// that appear after paint need the same wiring as ones present at paint.
function attachSuggestionHandlers(){
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
      <div class="me-item" id="menuEditCategory" style="border-bottom:1px solid var(--line); cursor:pointer;"><div>Edit Category</div><div class="chev">›</div></div>
      <div class="me-item" id="menuEditMuscle" style="border-bottom:1px solid var(--line); cursor:pointer;"><div>Edit Muscle Group</div><div class="chev">›</div></div>
      <div class="me-item" id="menuEditLoc" style="border-bottom:1px solid var(--line); cursor:pointer;"><div>Edit Push/Pull/Upper/Lower/Location</div><div class="chev">›</div></div>
      <div class="me-item" id="menuRemove" style="border-bottom:none; cursor:pointer;"><div style="color:var(--flame);">Remove from ${dayLabelOf(state.selectedDay)}</div><div class="chev">›</div></div>
      <div style="text-align:center; padding:12px; color:var(--slate); font-size:13px; cursor:pointer;" id="menuCancel">Cancel</div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#menuCancel').onclick = () => overlay.remove();
  overlay.querySelector('#menuRename').onclick = () => { overlay.remove(); openRenameExerciseForm(exerciseId, exerciseName); };
  overlay.querySelector('#menuEditAlt').onclick = () => { overlay.remove(); openEditAltGroupForm(exerciseId, exerciseName); };
  overlay.querySelector('#menuEditCategory').onclick = () => { overlay.remove(); openEditCategoryForm(exerciseId, exerciseName); };
  overlay.querySelector('#menuEditMuscle').onclick = () => { overlay.remove(); openEditMuscleForm(exerciseId, exerciseName); };
  overlay.querySelector('#menuEditLoc').onclick = () => { overlay.remove(); openEditTagsForm(exerciseId, exerciseName); };
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
    await withButtonLoading(overlay.querySelector('#saveRenameBtn'), 'Renaming…', async () => {
      const userData = { user: await getCurrentUser() };
      let error;
      if (getUseExerciseMasterFlag()){
        // Under the new structure only one record is SUPPOSED to exist per
        // exercise name, but duplicates can happen from historical bugs.
        // Rename every matching row so no ghost copies with the old name
        // linger and confuse sibling-based operations (PR detection, history
        // merging, all use ilike name matching).
        const sameNameResult = await withTimeout(
          supabaseClient.from('exercise_master').select('id').eq('user_id', userData.user.id).ilike('name', exerciseName),
          15000
        );
        const ids = (sameNameResult.__timeout || sameNameResult.error) ? [exerciseId] : (sameNameResult.data || []).map(r => r.id);
        const idList = ids.length ? ids : [exerciseId];
        for (const id of idList){
          const { error: e } = await supabaseClient.from('exercise_master').update({ name: newName }).eq('id', id);
          if (e){ error = e; break; }
        }
      } else if (scope === 'everywhere'){
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
    });
  };
}

function openEditAltGroupForm(exerciseId, exerciseName){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeAlt">✕</button><h1>Alt Group</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label" style="padding-top:0;">${exerciseName} — ${dayLabelOf(state.selectedDay)} only</div>
      <div id="altEditArea"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeAlt').onclick = () => overlay.remove();
  const area = overlay.querySelector('#altEditArea');
  pickAltGroup(area, async (picked) => {
    const useMaster = getUseExerciseMasterFlag();
    const table = useMaster ? 'exercise_master' : 'exercises';
    if (useMaster){
      // Update every same-name sibling exercise_master row too, in case duplicates
      // exist. Otherwise the alt group would only apply to the tapped copy and
      // silently miss its ghosts, making group behavior inconsistent.
      const userData = { user: await getCurrentUser() };
      const sameNameResult = await withTimeout(
        supabaseClient.from('exercise_master').select('id').eq('user_id', userData.user.id).ilike('name', exerciseName),
        15000
      );
      const ids = (sameNameResult.__timeout || sameNameResult.error) ? [exerciseId] : (sameNameResult.data || []).map(r => r.id);
      for (const id of (ids.length ? ids : [exerciseId])){
        await supabaseClient.from('exercise_master').update({ alt_group_id: picked ? picked.id : null }).eq('id', id);
      }
    } else {
      await supabaseClient.from(table).update({ alt_group_id: picked ? picked.id : null }).eq('id', exerciseId);
    }
    overlay.remove();
    if (state.currentTab === 'track') renderTrack();
  });
}

function openEditMuscleForm(exerciseId, exerciseName){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  const regions = {};
  Object.entries(MUSCLE_SORT_REGION).forEach(([label, region]) => { (regions[region] = regions[region] || []).push(label); });
  overlay.innerHTML = `
    <div class="form-header"><button id="closeMuscleEdit">✕</button><h1>Edit Muscle Group</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label" style="padding-top:0;">${exerciseName}</div>
      <div class="small" style="padding:0 18px 10px 18px; color:var(--slate); line-height:1.5;">Overrides auto-detection for Muscle mode grouping. Applies to every day this exercise appears on.</div>
      <div class="pick-row" id="resetMuscleRow"><div class="ex-name" style="color:var(--flame);">↺ Reset to Auto-Detect</div></div>
      ${Object.entries(regions).map(([region, labels]) => `
        <div class="category">${region.toUpperCase()}</div>
        <div class="chip-row" style="flex-wrap:wrap;">${labels.map(l => `<div class="chip" data-muscle="${l}">${l}</div>`).join('')}</div>
      `).join('')}
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeMuscleEdit').onclick = () => overlay.remove();

  async function apply(muscleOverride){
    if (getUseExerciseMasterFlag()){
      const userData = { user: await getCurrentUser() };
      const sameNameResult = await withTimeout(
        supabaseClient.from('exercise_master').select('id').eq('user_id', userData.user.id).ilike('name', exerciseName),
        15000
      );
      const ids = (sameNameResult.__timeout || sameNameResult.error) ? [exerciseId] : (sameNameResult.data || []).map(r => r.id);
      for (const id of (ids.length ? ids : [exerciseId])){
        await supabaseClient.from('exercise_master').update({ muscle_override: muscleOverride }).eq('id', id);
      }
      overlay.remove();
      if (state.currentTab === 'track') renderTrack();
      return;
    }
    const userData = { user: await getCurrentUser() };
    const sameNameResult = await withTimeout(
      supabaseClient.from('exercises').select('id').eq('user_id', userData.user.id).ilike('name', exerciseName),
      15000
    );
    const ids = (sameNameResult.__timeout || sameNameResult.error) ? [exerciseId] : (sameNameResult.data || []).map(r => r.id);
    for (const id of (ids.length ? ids : [exerciseId])){
      await supabaseClient.from('exercises').update({ muscle_override: muscleOverride }).eq('id', id);
    }
    overlay.remove();
    if (state.currentTab === 'track') renderTrack();
  }
  overlay.querySelector('#resetMuscleRow').onclick = () => apply(null);
  overlay.querySelectorAll('.chip[data-muscle]').forEach(chip => {
    chip.onclick = () => apply(chip.dataset.muscle);
  });
}

function openEditCategoryForm(exerciseId, exerciseName){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeCatEdit">✕</button><h1>Edit Category</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label" style="padding-top:0;">${exerciseName}</div>
      <div class="small" style="padding:0 18px 10px 18px; color:var(--slate); line-height:1.5;">Applies to every day this exercise appears on, not just this one - it's the same exercise wherever it shows up.</div>
      <div class="chip-row" id="editCatChipRow" style="flex-wrap:wrap;"><div class="small" style="color:var(--slate); padding:8px 0;">Loading…</div></div>
      <button class="save-btn" id="saveCatBtn">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeCatEdit').onclick = () => overlay.remove();

  let selectedCategory = null;
  (async () => {
    const [cats, exResult] = await Promise.all([
      getAllCategories(),
      withTimeout(supabaseClient.from(getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises').select('category').eq('id', exerciseId).maybeSingle(), 15000)
    ]);
    selectedCategory = (exResult.__timeout || exResult.error || !exResult.data) ? null : exResult.data.category;
    const row = overlay.querySelector('#editCatChipRow');
    row.innerHTML = cats.map(c => `<div class="chip ${c===selectedCategory?'active':''}" data-cat="${c}">${c}</div>`).join('')
      + `<div class="chip" id="editCatNewChip" style="color:var(--flame); border-color:var(--flame);">+ New</div>`;
    row.querySelectorAll('.chip[data-cat]').forEach(el => {
      el.onclick = () => { row.querySelectorAll('.chip[data-cat]').forEach(c=>c.classList.remove('active')); el.classList.add('active'); selectedCategory = el.dataset.cat; };
    });
    row.querySelector('#editCatNewChip').onclick = () => {
      promptText({
        title: 'New Category Name', placeholder: 'e.g. Bodyweight',
        onConfirm: (name) => { addCustomCategory(name); selectedCategory = name; overlay.querySelector('#saveCatBtn').click(); }
      });
    };
  })();

  overlay.querySelector('#saveCatBtn').onclick = async () => {
    if (!selectedCategory) return;
    await withButtonLoading(overlay.querySelector('#saveCatBtn'), 'Saving…', async () => {
      if (getUseExerciseMasterFlag()){
        // Update every same-name sibling row so duplicates stay in sync.
        const userData = { user: await getCurrentUser() };
        const sameNameResult = await withTimeout(
          supabaseClient.from('exercise_master').select('id').eq('user_id', userData.user.id).ilike('name', exerciseName),
          15000
        );
        const ids = (sameNameResult.__timeout || sameNameResult.error) ? [exerciseId] : (sameNameResult.data || []).map(r => r.id);
        for (const id of (ids.length ? ids : [exerciseId])){
          await supabaseClient.from('exercise_master').update({ category: selectedCategory }).eq('id', id);
        }
        overlay.remove();
        if (state.currentTab === 'track') renderTrack();
        return;
      }
      const userData = { user: await getCurrentUser() };
      const sameNameResult = await withTimeout(
        supabaseClient.from('exercises').select('id').eq('user_id', userData.user.id).ilike('name', exerciseName),
        15000
      );
      const ids = (sameNameResult.__timeout || sameNameResult.error) ? [exerciseId] : (sameNameResult.data || []).map(r => r.id);
      for (const id of (ids.length ? ids : [exerciseId])){
        await supabaseClient.from('exercises').update({ category: selectedCategory }).eq('id', id);
      }
      overlay.remove();
      if (state.currentTab === 'track') renderTrack();
    });
  };
}

function openEditTagsForm(exerciseId, exerciseName){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeTags">✕</button><h1>Edit Tags</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label" style="padding-top:0;">${exerciseName}</div>
      <div class="field-label">Push / Pull</div>
      <div class="chip-row" id="tagPushPullRow"><div class="small" style="color:var(--slate); padding:8px 0;">Loading…</div></div>
      <div class="field-label">Upper / Lower</div>
      <div class="chip-row" id="tagUpperLowerRow"></div>
      <div class="field-label">Locations <span class="opt">(optional, pick any)</span></div>
      <div class="chip-row" id="tagLocationRow"></div>
      <button class="save-btn" id="saveTagsBtn">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeTags').onclick = () => overlay.remove();

  let pushPull = null, upperLower = null, locationIds = [];
  (async () => {
    const [exResult, locs] = await Promise.all([
      withTimeout(supabaseClient.from(getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises').select('push_pull, upper_lower, location_ids').eq('id', exerciseId).maybeSingle(), 15000),
      loadLocations()
    ]);
    const data = exResult.__timeout || exResult.error || !exResult.data ? {} : exResult.data;
    pushPull = data.push_pull || null;
    upperLower = data.upper_lower || null;
    locationIds = data.location_ids || [];

    const ppRow = overlay.querySelector('#tagPushPullRow');
    ppRow.innerHTML = ['push','pull'].map(v => `<div class="chip ${pushPull===v?'active':''}" data-pp="${v}">${cap(v)}</div>`).join('');
    ppRow.querySelectorAll('.chip').forEach(el => {
      el.onclick = () => { const already = el.classList.contains('active'); ppRow.querySelectorAll('.chip').forEach(c=>c.classList.remove('active')); pushPull = already ? null : el.dataset.pp; if (!already) el.classList.add('active'); };
    });

    const ulRow = overlay.querySelector('#tagUpperLowerRow');
    ulRow.innerHTML = ['upper','lower'].map(v => `<div class="chip ${upperLower===v?'active':''}" data-ul="${v}">${cap(v)}</div>`).join('');
    ulRow.querySelectorAll('.chip').forEach(el => {
      el.onclick = () => { const already = el.classList.contains('active'); ulRow.querySelectorAll('.chip').forEach(c=>c.classList.remove('active')); upperLower = already ? null : el.dataset.ul; if (!already) el.classList.add('active'); };
    });

    renderLocChips(locs);
  })();

  function renderLocChips(locs){
    const row = overlay.querySelector('#tagLocationRow');
    row.innerHTML = locs.map(l => `<div class="chip ${locationIds.includes(l.id)?'active':''}" data-loc="${l.id}">${l.name}</div>`).join('')
      + `<div class="chip" id="tagNewLocChip" style="color:var(--flame); border-color:var(--flame);">+ New</div>`;
    row.querySelectorAll('.chip[data-loc]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.loc;
        if (locationIds.includes(id)){ locationIds = locationIds.filter(x=>x!==id); el.classList.remove('active'); }
        else { locationIds.push(id); el.classList.add('active'); }
      };
    });
    row.querySelector('#tagNewLocChip').onclick = () => {
      promptText({
        title: 'New Location Name', placeholder: 'e.g. Home Gym',
        onConfirm: async (name) => { const loc = await createLocation(name); if (loc) locationIds.push(loc.id); renderLocChips(await loadLocations()); }
      });
    };
  }

  overlay.querySelector('#saveTagsBtn').onclick = async () => { await withButtonLoading(overlay.querySelector('#saveTagsBtn'), 'Saving…', async () => {
    const table = getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises';
    await supabaseClient.from(table).update({ push_pull: pushPull, upper_lower: upperLower, location_ids: locationIds }).eq('id', exerciseId);
    overlay.remove();
    if (state.currentTab === 'track') renderTrack();
  }); };
}

function openEditLocationForm(exerciseId, exerciseName){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeLoc">✕</button><h1>Locations</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label" style="padding-top:0;">${exerciseName}</div>
      <div class="chip-row" id="editLocChipRow"><div class="small" style="color:var(--slate); padding:8px 0;">Loading…</div></div>
      <div class="small" style="padding:0 18px 8px 18px; color:var(--slate);">Leave blank for available everywhere. Pick more than one if it exists at multiple locations.</div>
      <button class="save-btn" id="saveLocBtn">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeLoc').onclick = () => overlay.remove();

  let selectedIds = [];
  (async () => {
    const [locs, exResult] = await Promise.all([
      loadLocations(),
      withTimeout(supabaseClient.from(getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises').select('location_ids').eq('id', exerciseId).maybeSingle(), 15000)
    ]);
    selectedIds = (exResult.__timeout || exResult.error || !exResult.data) ? [] : (exResult.data.location_ids || []);
    renderChips(locs);
  })();

  function renderChips(locs){
    const row = overlay.querySelector('#editLocChipRow');
    row.innerHTML = locs.map(l => `<div class="chip ${selectedIds.includes(l.id)?'active':''}" data-loc="${l.id}">${l.name}</div>`).join('')
      + `<div class="chip" id="newLocChip2" style="color:var(--flame); border-color:var(--flame);">+ New</div>`;
    row.querySelectorAll('.chip[data-loc]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.loc;
        if (selectedIds.includes(id)){ selectedIds = selectedIds.filter(x=>x!==id); el.classList.remove('active'); }
        else { selectedIds.push(id); el.classList.add('active'); }
      };
    });
    row.querySelector('#newLocChip2').onclick = () => {
      promptText({
        title: 'New Location Name', placeholder: 'e.g. Home Gym',
        onConfirm: async (name) => {
          const loc = await createLocation(name);
          if (loc) selectedIds.push(loc.id);
          renderChips(await loadLocations());
        }
      });
    };
  }

  overlay.querySelector('#saveLocBtn').onclick = async () => { await withButtonLoading(overlay.querySelector('#saveLocBtn'), 'Saving…', async () => {
    const table = getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises';
    await supabaseClient.from(table).update({ location_ids: selectedIds }).eq('id', exerciseId);
    overlay.remove();
    if (state.currentTab === 'track') renderTrack();
  }); };
}

async function deleteExerciseEntirelyNow(exerciseName){
  invalidateTrackSnapshots(); // day contents change - stale snapshot must not survive
  const userData = { user: await getCurrentUser() };
  const uid = userData.user.id;
  if (getUseExerciseMasterFlag()){
    // Use select (multiple rows OK) instead of maybeSingle - if there are
    // any duplicate exercise_master rows sharing this name, the previous
    // maybeSingle would error out and this function would silently do
    // nothing, leaving the user's "delete entirely" action a no-op.
    const masterResult = await withTimeout(
      supabaseClient.from('exercise_master').select('id').eq('user_id', uid).ilike('name', exerciseName),
      15000
    );
    if (!masterResult.__timeout && !masterResult.error && masterResult.data && masterResult.data.length){
      const ids = masterResult.data.map(r => r.id);
      for (const id of ids){
        await supabaseClient.from('sets').delete().eq('exercise_master_id', id);
        await supabaseClient.from('exercise_days').delete().eq('exercise_master_id', id);
        await supabaseClient.from('exercise_master').delete().eq('id', id);
      }
    }
  } else {
    const exResult = await withTimeout(
      supabaseClient.from('exercises').select('id').eq('user_id', uid).ilike('name', exerciseName),
      15000
    );
    const ids = (exResult.__timeout || exResult.error ? [] : exResult.data || []).map(e => e.id);
    for (const id of ids){
      await supabaseClient.from('sets').delete().eq('exercise_id', id);
      await supabaseClient.from('exercises').delete().eq('id', id);
    }
  }
}

function confirmDeleteExerciseEntirely(exerciseName, onDeleted){
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:60; display:flex; align-items:center; justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--panel); border-radius:16px; padding:22px; width:300px; text-align:center;">
      <div style="font-family:'Oswald', sans-serif; font-size:16px; margin-bottom:8px;">Delete Permanently?</div>
      <div style="font-size:13px; color:var(--slate); margin-bottom:18px;">"${exerciseName}" will be removed from every day, and all logged history for it will be deleted. Cannot be undone.</div>
      <div style="display:flex; gap:10px;">
        <button id="cancelDeleteEntire" style="flex:1; padding:11px; border-radius:10px; background:var(--ink); color:var(--chalk); font-size:13px;">Cancel</button>
        <button id="confirmDeleteEntire" style="flex:1; padding:11px; border-radius:10px; background:#E8492A; color:white; font-weight:600; font-size:13px;">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cancelDeleteEntire').onclick = () => overlay.remove();
  overlay.querySelector('#confirmDeleteEntire').onclick = async () => {
    overlay.remove();
    await deleteExerciseEntirelyNow(exerciseName);
    if (onDeleted) onDeleted();
  };
}

function confirmRemoveExercise(exerciseId, exerciseName){
  const useMaster = getUseExerciseMasterFlag();
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:20; display:flex; align-items:center; justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--panel); border-radius:16px; padding:22px; width:300px; text-align:center;">
      <div style="font-family:'Oswald', sans-serif; font-size:16px; margin-bottom:8px;">Remove Exercise?</div>
      <div style="font-size:13px; color:var(--slate); margin-bottom:14px;">"${exerciseName}" will be hidden from this day. Your past logged sets are kept.</div>
      <div id="deleteEntirelyRow" style="display:flex; align-items:flex-start; gap:8px; text-align:left; padding:10px 12px; background:var(--ink); border-radius:10px; margin-bottom:16px; cursor:pointer;">
        <div class="check-circle" id="deleteEntirelyCheck" style="opacity:0.3; margin-top:1px; flex-shrink:0;">${ICON_CHECK}</div>
        <div style="font-size:11.5px; color:var(--slate); line-height:1.4;">Also permanently delete all logged history for this exercise${useMaster ? ' - since it uses the new shared structure, this removes it everywhere, not just today' : ''}. Cannot be undone.</div>
      </div>
      <div style="display:flex; gap:10px;">
        <button id="cancelRemove" style="flex:1; padding:11px; border-radius:10px; background:var(--ink); color:var(--chalk); font-size:13px;">Cancel</button>
        <button id="confirmRemove" style="flex:1; padding:11px; border-radius:10px; background:var(--flame); color:var(--ink); font-weight:600; font-size:13px;">Remove</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  let deleteEntirely = false;
  overlay.querySelector('#deleteEntirelyRow').onclick = () => {
    deleteEntirely = !deleteEntirely;
    overlay.querySelector('#deleteEntirelyCheck').style.opacity = deleteEntirely ? '1' : '0.3';
  };
  overlay.querySelector('#cancelRemove').onclick = () => overlay.remove();
  overlay.querySelector('#confirmRemove').onclick = async () => {
    overlay.remove();
    if (deleteEntirely){
      if (useMaster){
        await supabaseClient.from('sets').delete().eq('exercise_master_id', exerciseId);
        await supabaseClient.from('exercise_days').delete().eq('exercise_master_id', exerciseId);
        await supabaseClient.from('exercise_master').delete().eq('id', exerciseId);
      } else {
        await supabaseClient.from('sets').delete().eq('exercise_id', exerciseId);
        await supabaseClient.from('exercises').delete().eq('id', exerciseId);
      }
      renderTrack();
      return;
    }
    if (useMaster){
      // Capture the weekday at the moment of removal - not lazily inside
      // the undo callback, since state.selectedDay may have changed by
      // then (user switched days, or the day-rollover snap fired).
      const removalWeekday = state.selectedDay;
      const { data, error } = await supabaseClient.from('exercise_days').delete().eq('exercise_master_id', exerciseId).eq('weekday', removalWeekday).select();
      if (error || !data || !data.length){
        alert(`Could not remove "${exerciseName}": ${error ? error.message : 'no matching row found for today - it may already be gone, or something is out of sync. Try refreshing the app.'}`);
        renderTrack();
        return;
      }
      showUndoToast(exerciseName, async () => {
        const userData = { user: await getCurrentUser() };
        await supabaseClient.from('exercise_days').insert({ user_id: userData.user.id, exercise_master_id: exerciseId, weekday: removalWeekday });
        renderTrack();
      });
      renderTrack();
      return;
    }
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
  let deleting = false;
  overlay.querySelector('#confirmDel').onclick = async () => {
    if (deleting) return;
    deleting = true;
    overlay.remove();
    invalidateTrackSnapshots();
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
    invalidateTrackSnapshots();
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
const MECHANIC_COMPOUND_KEYWORDS = ['press','squat','row','pull-up','pullup','pull up','pulldown','deadlift','dip','lunge','thrust','clean','snatch','chin-up','chin up'];
const MECHANIC_ISOLATION_KEYWORDS = ['curl','extension','fly','flye','raise','pushdown','crunch','shrug','kickback','pullover','abduction','adduction'];

// Real database mechanic field where available (~90% of entries); for the rest
// (mostly stretches/cardio/mobility drills, plus every manual override, which
// never sets mechanic), a keyword fallback - clearly a guess, marked as such,
// and honest about not applying at all to stretches/cardio rather than forcing
// a compound/isolation label onto something that isn't really either.
function classifyMechanic(match){
  if (!match) return null;
  // Verified correction: the source database inconsistently tags some fly
  // variants (mostly incline/decline dumbbell flys) as compound, but fly
  // movements are single-joint isolation exercises no matter the equipment
  // or angle - confirmed by checking every fly entry in the actual data,
  // not a guess, so this takes priority over the source's own field.
  const n0 = (match.name || '').toLowerCase();
  if (n0.includes('fly') || n0.includes('flye')) return { value:'isolation', guessed:false };
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

function cap(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// Finer subdivision within a broad muscle group, inferred from exercise name
// keywords since free-exercise-db only provides broad categories (chest,
// shoulders, lats) with no upper/mid/lower or delt-head detail. Falls back to
// the broad category when genuinely ambiguous (stretches, Olympic lifts,
// unspecified raises) rather than forcing an unreliable guess.
function fineMuscleCategory(broadMuscle, exerciseName){
  const n = (exerciseName || '').toLowerCase();
  const m = (broadMuscle || '').toLowerCase();
  if (m === 'chest'){
    if (n.includes('incline')) return 'Upper Chest';
    if (n.includes('decline')) return 'Lower Chest';
    return 'Mid Chest';
  }
  if (m === 'shoulders'){
    if (n.includes('face pull')) return 'Rear Delts';
    if ((n.includes('rear') || n.includes('reverse fly') || n.includes('reverse flye')) &&
        (n.includes('raise') || n.includes('row') || n.includes('fly') || n.includes('flye') || n.includes('delt'))) return 'Rear Delts';
    if (n.includes('lateral') || (n.includes('side') && n.includes('raise'))) return 'Side Delts';
    if (n.includes('front') && (n.includes('raise') || n.includes('delt'))) return 'Front Delts';
    if (n.includes('press')) return 'Front Delts';
    return cap(broadMuscle);
  }
  if (m === 'lats'){
    if (n.includes('row')) return 'Upper Back';
    return 'Lats';
  }
  if (m === 'triceps'){
    // Long head crosses the shoulder joint, so it's emphasized whenever the
    // arm goes overhead or the elbow is positioned behind the body (lying
    // extensions, skullcrushers). Lateral head dominates pushdown-style
    // movements where the arm stays at the side.
    if (n.includes('overhead') || n.includes('skullcrusher') || n.includes('french press') ||
        (n.includes('lying') && n.includes('extension'))) return 'Triceps (Long Head)';
    if (n.includes('pushdown') || n.includes('push-down') || n.includes('push down') || n.includes('kickback')) return 'Triceps (Lateral Head)';
    return 'Triceps';
  }
  if (m === 'biceps'){
    // Long head is emphasized when the arm trails behind the body plane
    // (incline curls); short head dominates when the arm is held in front
    // (preacher, concentration curls). Hammer grip is checked first since
    // it determines brachialis-dominance regardless of the angle - an
    // incline hammer curl is still a brachialis movement, not a long-head one.
    if (n.includes('hammer')) return 'Brachialis';
    if (n.includes('incline')) return 'Biceps (Long Head)';
    if (n.includes('preacher') || n.includes('concentration') || n.includes('spider')) return 'Biceps (Short Head)';
    return 'Biceps';
  }
  // Calves are deliberately left as one broad category - unlike the splits
  // above, gastrocnemius vs soleus isn't a meaningful enough distinction in
  // practice for someone picking between standing, seated, or leg press calf
  // raises; they read as interchangeable, not genuinely different exercises.
  if (m === 'forearms'){
    // Matches the exact convention already used in the plan itself - curling
    // the wrist works the flexors, extending/reversing it works the extensors.
    if (n.includes('reverse') || n.includes('extensor') || n.includes('extension')) return 'Forearms (Extensors)';
    if (n.includes('flexor') || n.includes('wrist curl') || n.includes('forearm curl') || n.includes('pushdown')) return 'Forearms (Flexors)';
    return 'Forearms';
  }
  if (m === 'traps'){
    if (n.includes('shrug')) return 'Traps (Upper)';
    return 'Traps';
  }
  // Quadriceps, hamstrings, and glutes are deliberately left as broad
  // categories - unlike the ones above, there's no reliable per-exercise-name
  // signal for which specific head or muscle within these groups is being
  // targeted (a "Leg Extension" doesn't reliably tell you rectus femoris vs
  // vastus lateralis the way "seated calf raise" reliably tells you soleus).
  // Forcing a guess here would be more likely to mislead than help.
  return cap(broadMuscle);
}

// Groups related subcategories together when sorting Muscle mode, so e.g. Lower
// Back and Middle Back sort adjacent to each other instead of being scattered
// apart by whatever else happens to fall alphabetically between them (Mid Chest
// would otherwise land between Lower Back and Middle Back in a pure A-Z sort).
// Used by the edit-muscle picker to group chips by region (Chest, Shoulders,
// etc) - a different concern from sort order, so kept separate.
const MUSCLE_SORT_REGION = {
  'Upper Chest':'Chest', 'Mid Chest':'Chest', 'Lower Chest':'Chest', 'Chest':'Chest',
  'Front Delts':'Shoulders', 'Side Delts':'Shoulders', 'Rear Delts':'Shoulders', 'Shoulders':'Shoulders',
  'Lats':'Back', 'Upper Back':'Back', 'Middle back':'Back', 'Lower back':'Back', 'Traps':'Back', 'Traps (Upper)':'Back',
  'Biceps':'Arms', 'Biceps (Long Head)':'Arms', 'Biceps (Short Head)':'Arms', 'Brachialis':'Arms',
  'Triceps':'Arms', 'Triceps (Long Head)':'Arms', 'Triceps (Lateral Head)':'Arms',
  'Forearms':'Arms', 'Forearms (Flexors)':'Arms', 'Forearms (Extensors)':'Arms',
  'Quadriceps':'Legs', 'Hamstrings':'Legs', 'Glutes':'Legs', 'Adductors':'Legs', 'Abductors':'Legs',
  'Calves':'Legs',
  'Abdominals':'Core', 'Neck':'Neck'
};
// True anatomical top-to-bottom order, not alphabetical within a region -
// neck and traps sit at the top of the body, calves at the bottom.
const MUSCLE_ANATOMICAL_ORDER = [
  'Neck', 'Traps (Upper)', 'Traps',
  'Front Delts', 'Side Delts', 'Rear Delts', 'Shoulders',
  'Upper Chest', 'Mid Chest', 'Lower Chest', 'Chest',
  'Lats', 'Upper Back', 'Middle back', 'Lower back',
  'Biceps (Long Head)', 'Biceps (Short Head)', 'Biceps', 'Brachialis',
  'Triceps (Long Head)', 'Triceps (Lateral Head)', 'Triceps',
  'Forearms (Flexors)', 'Forearms (Extensors)', 'Forearms',
  'Abdominals',
  'Glutes', 'Quadriceps', 'Hamstrings', 'Adductors', 'Abductors',
  'Calves'
];
function muscleSortKey(label){
  const idx = MUSCLE_ANATOMICAL_ORDER.indexOf(label);
  return String(idx === -1 ? 999 : idx).padStart(3,'0') + '|' + label;
}

function groupDatabaseExercises(list, groupBy, splitMode){
  const grouped = {};
  const isUpperLower = splitMode === 'upperlower';
  list.forEach(e => {
    const muscle = (e.primaryMuscles && e.primaryMuscles[0]) || null;
    let key;
    if (groupBy === 'muscle') key = muscle ? fineMuscleCategory(muscle, e.name) : 'Other';
    else if (groupBy === 'split'){
      const ul = classifyUpperLower(muscle);
      if (isUpperLower){
        key = ul === 'upper' ? 'Upper' : ul === 'lower' ? 'Lower' : 'Other';
      } else {
        const pp = classifyPushPull(muscle, e.name);
        key = ul === 'lower' ? 'Legs' : (pp === 'push' ? 'Push' : pp === 'pull' ? 'Pull' : 'Other');
      }
    }
    else key = e.equipment ? cap(e.equipment) : 'Other';
    (grouped[key] = grouped[key] || []).push(e);
  });
  const splitOrder = isUpperLower ? ['Upper','Lower','Other'] : ['Push','Pull','Legs','Other'];
  const sortFn = groupBy === 'muscle'
    ? (a,b) => a==='Other'?1:b==='Other'?-1:muscleSortKey(a).localeCompare(muscleSortKey(b))
    : groupBy === 'split'
    ? (a,b) => splitOrder.indexOf(a) - splitOrder.indexOf(b)
    : (a,b) => a==='Other'?1:b==='Other'?-1:a.localeCompare(b);
  const orderedKeys = Object.keys(grouped).sort(sortFn);
  return { grouped, orderedKeys };
}

// Ensures an exercise row exists to log against, WITHOUT attaching it to any
// weekday. This is the whole mechanic behind off-plan logging: a set needs an
// exercise to belong to, but nothing needs to appear on a day the user didn't
// choose. Reuses an existing exercise of the same name where there is one, so
// a hotel-gym Lat Pulldown lands in the same history as the one on your
// Tuesday rather than starting a parallel record.
async function ensureExerciseExistsUnattached(uid, name, category){
  await awaitMasterFlagHealed();
  const useMaster = getUseExerciseMasterFlag();
  if (useMaster){
    const existing = await withTimeout(
      supabaseClient.from('exercise_master').select('id').eq('user_id', uid).ilike('name', name).limit(1),
      15000
    );
    if (!existing.__timeout && !existing.error && existing.data && existing.data.length){
      return existing.data[0].id;
    }
    const created = await withTimeout(
      supabaseClient.from('exercise_master')
        .insert({ user_id: uid, name, category: category || 'Other', location_ids: null })
        .select(),
      15000
    );
    if (created.__timeout || created.error || !created.data || !created.data.length) return null;
    return created.data[0].id;
  }
  // Legacy schema has no separate master table - an exercise IS a row on a
  // weekday, so there's no way to represent one without a day. Fall back to
  // today rather than failing the log outright.
  const created = await insertExerciseSafely({
    user_id: uid, name, category: category || 'Other', weekday: state.selectedDay, alt_group_id: null
  });
  return (created && created.data && created.data[0]) ? created.data[0].id : null;
}

async function openPicker(initialTab, jumpToMuscle){
  // 'offplan' means log against an exercise WITHOUT attaching it to a
  // weekday - used for holiday/random-gym sessions. It's a logging mode,
  // not a separate screen, so the picker itself is unchanged.
  let offPlanMode = initialTab === 'offplan';
  if (offPlanMode) initialTab = null;
  if (jumpToMuscle) setPickerGroupByPref('muscle');
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closePicker">✕</button><h1 id="pickerTitle">${offPlanMode ? 'Log Off-Plan' : 'Log a Set'}</h1><div style="width:18px;"></div></div>
    <div class="offplan-toggle-row">
      <div style="flex:1;">
        <div class="offplan-toggle-title">Log off-plan</div>
        <div class="offplan-toggle-sub">Log this without adding it to ${dayNameOf(state.selectedDay)} — for improvised sessions or a gym you're only at once.</div>
      </div>
      <button class="switch ${offPlanMode ? '' : 'off'}" id="offPlanSwitch"></button>
    </div>
    <div style="display:flex; padding:0 18px; border-bottom:1px solid var(--line);">
      <div class="picker-toptab" data-tab="mine" style="flex:1; text-align:center; padding:10px 0; font-family:'Oswald',sans-serif; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--slate); border-bottom:2px solid transparent; cursor:pointer;">Your Exercises</div>
      <div class="picker-toptab" data-tab="database" style="flex:1; text-align:center; padding:10px 0; font-family:'Oswald',sans-serif; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--slate); border-bottom:2px solid transparent; cursor:pointer;">Database</div>
    </div>
    <div class="overlay-scroll" id="pickerBody"></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closePicker').onclick = () => { removeSideIndex(); overlay.remove(); };
  const offPlanSwitch = overlay.querySelector('#offPlanSwitch');
  if (offPlanSwitch) offPlanSwitch.onclick = () => {
    offPlanMode = !offPlanMode;
    offPlanSwitch.classList.toggle('off', !offPlanMode);
    const title = overlay.querySelector('#pickerTitle');
    if (title) title.textContent = offPlanMode ? 'Log Off-Plan' : 'Log a Set';
  };

  const userData = { user: await getCurrentUser() };
  const all = await fetchAllExercisesCompat(userData.user.id);
  // Matches Track's own location resolution - an exercise linked to today but
  // hidden from Track's display because it's tagged for a different location
  // shouldn't claim "on [Day]" here either, or the badge contradicts what's
  // actually visible on the day itself.
  const currentLocationId = effectiveLocationId();
  // If the active location has equipment set up, expand its selected
  // categories into the actual exercise-database equipment values they cover -
  // an empty set here means "no filter", not "nothing available".
  let allowedEquipmentValues = null;
  if (currentLocationId){
    const allLocations = await loadLocations();
    const activeLoc = allLocations.find(l => l.id === currentLocationId);
    if (activeLoc && activeLoc.equipment_tags && activeLoc.equipment_tags.length){
      allowedEquipmentValues = new Set();
      activeLoc.equipment_tags.forEach(key => {
        const cat = EQUIPMENT_CATEGORIES.find(c => c.key === key);
        if (cat) cat.dbValues.forEach(v => allowedEquipmentValues.add(v));
      });
    }
  }

  // Multi-select state, shared across both tabs since a long-press should be
  // able to start a selection that then gets confirmed with one action,
  // rather than adding exercises one at a time.
  const selection = { active: false, items: new Map() }; // id -> {name, category}
  function renderSelectionBar(rerenderList, onAdd, onDelete, onRename){
    let bar = overlay.querySelector('#selectionBar');
    if (!selection.active || selection.items.size === 0){
      if (bar) bar.remove();
      return;
    }
    const count = selection.items.size;
    const html = `
      <div id="selectionBar" style="position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--line); padding:12px 18px calc(12px + env(safe-area-inset-bottom)) 18px; display:flex; flex-wrap:wrap; gap:10px; z-index:30;">
        <button id="selectionCancel" style="padding:11px 16px; border-radius:10px; background:var(--ink); color:var(--chalk); font-size:13px;">Cancel</button>
        ${onRename && count === 1 ? `<button id="selectionRename" style="padding:11px 16px; border-radius:10px; background:var(--ink); color:var(--flame); font-size:13px;">Rename</button>` : ''}
        ${onDelete ? `<button id="selectionDelete" style="padding:11px 16px; border-radius:10px; background:#E8492A; color:white; font-size:13px;">Delete ${count}</button>` : ''}
        <button id="selectionAdd" class="save-btn" style="flex:1; margin:0; min-width:140px;">Add ${count} to ${dayNameOf(state.selectedDay)}</button>
      </div>`;
    if (bar) bar.outerHTML = html; else overlay.insertAdjacentHTML('beforeend', html);
    overlay.querySelector('#selectionCancel').onclick = () => { selection.active = false; selection.items.clear(); renderSelectionBar(); rerenderList(); };
    overlay.querySelector('#selectionAdd').onclick = onAdd;
    if (onDelete) overlay.querySelector('#selectionDelete').onclick = onDelete;
    if (onRename && count === 1) overlay.querySelector('#selectionRename').onclick = onRename;
  }

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
      const groupBy = getPickerGroupByPref();
      const splitMode = getSplitModePref();
      const splitSubGroup = getSplitSubGroupPref();
      const [{ grouped, orderedKeys }, db] = await Promise.all([
        groupExercisesByChoice(deduped, groupBy, splitMode),
        loadExerciseDB()
      ]);
      const isOnDayHere = ex => ex.weekday === state.selectedDay && isAvailableAtLocation(ex, currentLocationId);
      const todayNames = new Set(all.filter(isOnDayHere).map(ex => ex.name.toLowerCase()));
      const todaySignatures = {}; // signature -> exercise name, for exercises already on today
      all.filter(isOnDayHere).forEach(ex => {
        const m = matchExercise(ex.name, db);
        const muscle = m && m.primaryMuscles && m.primaryMuscles[0];
        const mech = classifyMechanic(m);
        const sig = computeAltSignature(ex.name, muscle, mech ? mech.value : null);
        if (sig && !todaySignatures[sig]) todaySignatures[sig] = ex.name;
      });
      // Cross-reference within the picker's own list too, not just against
      // what's already on today - alphabetical order decides which one is
      // "the original" and which ones get flagged as alts of it, so this is
      // stable regardless of which category happens to render first.
      const listSignatures = {};
      [...deduped].sort((a,b) => a.name.localeCompare(b.name)).forEach(ex => {
        const m = matchExercise(ex.name, db);
        const muscle = m && m.primaryMuscles && m.primaryMuscles[0];
        const mech = classifyMechanic(m);
        const sig = computeAltSignature(ex.name, muscle, mech ? mech.value : null);
        if (sig && !listSignatures[sig]) listSignatures[sig] = ex.name;
      });

      function renderExerciseRow(ex){
        const match = matchExercise(ex.name, db);
        const muscles = match ? muscleSubtitle(match.primaryMuscles, match.secondaryMuscles) : '';
        const mech = classifyMechanic(match);
        const mechTag = mech ? `<span style="font-size:9px; padding:2px 5px; border-radius:4px; margin-left:5px; background:${mech.value==='compound'?'rgba(255,107,26,0.15)':'rgba(122,150,220,0.15)'}; color:${mech.value==='compound'?'#FF6B1A':'#7BA6C9'}; opacity:${mech.guessed?0.75:1};">${mech.guessed?'~':''}${mech.value==='compound'?'Compound':'Isolation'}</span>` : '';
        // Split tag - same visual and classification as Track, so a Push exercise
        // reads the same here as it does on the Track cards. Uses muscle-based
        // fallback for untagged exercises, matching Track's own logic exactly.
        const primaryMuscle = match && match.primaryMuscles && match.primaryMuscles[0];
        const ul = ex.upper_lower || classifyUpperLower(primaryMuscle);
        let splitLabel = null;
        if (splitMode === 'upperlower'){
          splitLabel = ul === 'upper' ? 'upper' : ul === 'lower' ? 'lower' : null;
        } else {
          const pp = ex.push_pull || classifyPushPull(primaryMuscle, ex.name);
          splitLabel = ul === 'lower' ? 'legs' : (pp === 'push' ? 'push' : pp === 'pull' ? 'pull' : null);
        }
        const SPLIT_TAG_STYLE = { push:['#FF6B1A','Push'], pull:['#7BA6C9','Pull'], legs:['#C9A227','Legs'], upper:['#FF6B1A','Upper'], lower:['#C9A227','Lower'] };
        const splitInfo = splitLabel ? SPLIT_TAG_STYLE[splitLabel] : null;
        const splitTag = splitInfo ? `<span style="font-size:9px; padding:2px 5px; border-radius:4px; margin-left:5px; background:${splitInfo[0]}26; color:${splitInfo[0]};">${splitInfo[1]}</span>` : '';
        const alreadyToday = todayNames.has(ex.name.toLowerCase())
          ? `<span style="font-size:9px; padding:2px 6px; border-radius:4px; margin-left:5px; background:rgba(143,191,122,0.15); color:var(--good);">✓ On ${dayNameOf(state.selectedDay)}</span>` : '';
        const sig = computeAltSignature(ex.name, match && match.primaryMuscles && match.primaryMuscles[0], mech ? mech.value : null);
        const todayHintName = (!alreadyToday && sig && todaySignatures[sig] && todaySignatures[sig] !== ex.name) ? todaySignatures[sig] : null;
        const listHintName = (!todayHintName && sig && listSignatures[sig] && listSignatures[sig] !== ex.name) ? listSignatures[sig] : null;
        const altHint = todayHintName
          ? `<div class="small" style="color:var(--slate); opacity:0.7; font-style:italic; margin-top:1px;">alt for ${todayHintName} (on ${dayNameOf(state.selectedDay)})</div>`
          : listHintName ? `<div class="small" style="color:var(--slate); opacity:0.7; font-style:italic; margin-top:1px;">alt for ${listHintName}</div>` : '';
        return `<div class="pick-row" data-id="${ex.masterId || ex.id}" data-name="${ex.name}" data-category="${ex.category||''}" style="${selection.active ? 'display:flex; align-items:center; gap:10px;' : ''}">${selection.active ? `<div class="check-circle" style="opacity:${selection.items.has(ex.masterId||ex.id)?1:0.3}; flex-shrink:0;">${ICON_CHECK}</div>` : ''}<div style="flex:1;"><div class="ex-name">${ex.name}${splitTag}${mechTag}${alreadyToday}</div>${muscles ? `<div class="small" style="color:var(--slate);">${muscles}</div>` : ''}${altHint}</div>${selection.active ? '' : '<div class="chev">›</div>'}</div>`;
      }

      let html = '';
      const presentKeys = orderedKeys.filter(k => (grouped[k]||[]).length);
      for (const cat of presentKeys){
        const items = (grouped[cat] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
        const slug = 'mine-' + cat.replace(/[^a-z0-9]/gi,'');
        html += `<div class="category" id="${slug}">${cat}</div>`;
        if (groupBy === 'split'){
          // Nested: reuse the same Equipment/Muscle grouping within this split
          // section instead of building separate logic for it.
          const { grouped: subGrouped, orderedKeys: subOrderedKeys } = await groupExercisesByChoice(items, splitSubGroup);
          const presentSubKeys = subOrderedKeys.filter(k => (subGrouped[k]||[]).length);
          presentSubKeys.forEach((subCat, subIdx) => {
            const subItems = (subGrouped[subCat] || []).slice().sort((a,b) => a.name.localeCompare(b.name));
            const divider = subIdx > 0 ? 'margin-top:14px; border-top:1px solid var(--line);' : '';
            html += `<div class="small" style="${divider} padding:10px 18px 5px 18px; color:var(--chalk); font-family:'Bebas Neue',sans-serif; font-size:14px; letter-spacing:0.5px;">${subCat}</div>`;
            html += subItems.map(renderExerciseRow).join('');
          });
        } else {
          html += items.map(renderExerciseRow).join('');
        }
      }
      body.querySelector('#pickerGroupToggle').innerHTML = pickerGroupByToggleHtml(groupBy, splitMode, splitSubGroup);
      body.querySelectorAll('.groupby-chip').forEach(chip => {
        chip.onclick = () => { setPickerGroupByPref(chip.dataset.groupby); renderList(body.querySelector('#pickerSearch').value); };
      });
      body.querySelectorAll('.splitmode-chip').forEach(chip => {
        chip.onclick = () => { setSplitModePref(chip.dataset.splitmode); renderList(body.querySelector('#pickerSearch').value); };
      });
      body.querySelectorAll('.splitsub-chip').forEach(chip => {
        chip.onclick = () => { setSplitSubGroupPref(chip.dataset.splitsub); renderList(body.querySelector('#pickerSearch').value); };
      });
      body.querySelector('#pickerList').innerHTML = html || '<div class="empty-state">No matches.</div>';
      if (presentKeys.length > 0){
        attachSideIndex(presentKeys, 'mine-', { top: 220, bottom: 110 });
      } else {
        removeSideIndex();
      }
      body.querySelectorAll('.pick-row[data-id]').forEach(el => {
        let pressTimer = null;
        let longPressed = false;
        const start = () => {
          longPressed = false;
          pressTimer = setTimeout(() => {
            longPressed = true;
            if (!selection.active){ selection.active = true; selection.items.clear(); }
            const id = el.dataset.id;
            if (selection.items.has(id)) selection.items.delete(id);
            else selection.items.set(id, { name: el.dataset.name, category: el.dataset.category });
            renderList(body.querySelector('#pickerSearch').value);
          }, 550);
        };
        const cancel = () => { clearTimeout(pressTimer); };
        el.addEventListener('pointerdown', start);
        el.addEventListener('pointerup', cancel);
        el.addEventListener('pointerleave', cancel);
        el.addEventListener('pointercancel', cancel);
        el.onclick = async () => {
          if (longPressed) return;
          if (selection.active){
            const id = el.dataset.id;
            if (selection.items.has(id)) selection.items.delete(id);
            else selection.items.set(id, { name: el.dataset.name, category: el.dataset.category });
            if (selection.items.size === 0) selection.active = false;
            renderList(body.querySelector('#pickerSearch').value);
            return;
          }
          // Capture at tap time - state.selectedDay could shift under the
          // async flow if another handler fires.
          const targetDay = state.selectedDay;
          const picked = all.find(ex => (ex.masterId || ex.id) === el.dataset.id);
          overlay.remove();
          if (!picked || picked.weekday === targetDay){
            openLogForm(el.dataset.id, el.dataset.name);
            return;
          }
          const existingToday = all.find(ex => ex.weekday === targetDay && ex.name.toLowerCase() === picked.name.toLowerCase());
          if (existingToday){
            openLogForm(existingToday.masterId || existingToday.id, existingToday.name);
            return;
          }
          const userData = { user: await getCurrentUser() };
          if (offPlanMode){
            // Off-plan: the whole point is NOT to add this to the weekday
            // plan. The exercise itself must exist to log against, but we
            // deliberately skip the exercise_days link, so it never appears
            // on a day the user didn't choose. This is the entire "dayless"
            // mechanic - one skipped insert.
            const masterId = await ensureExerciseExistsUnattached(userData.user.id, picked.name, picked.category);
            if (!masterId){ alert('Could not prepare that exercise.'); return; }
            openLogForm(masterId, picked.name, true);
            return;
          }
          const { data: inserted, error } = await createExerciseForToday({
            user_id: userData.user.id, name: picked.name, category: picked.category,
            weekday: targetDay, alt_group_id: null
          });
          if (error){ alert(error.message); return; }
          openLogForm(inserted[0].id, picked.name, true);
        };
      });

      renderSelectionBar(
        () => renderList(body.querySelector('#pickerSearch').value),
        async () => {
          const btn = overlay.querySelector('#selectionAdd');
          const items = [...selection.items.values()];
          // Capture at tap time; state.selectedDay could shift during the async work.
          const targetDay = state.selectedDay;
          await withButtonLoading(btn, 'Adding…', async () => {
            const userData = { user: await getCurrentUser() };
            const errors = [];
            for (const item of items){
              const alreadyToday = all.find(ex => ex.weekday === targetDay && ex.name.toLowerCase() === item.name.toLowerCase());
              if (alreadyToday) continue; // already there, nothing to do
              const { error } = await createExerciseForToday({
                user_id: userData.user.id, name: item.name, category: item.category || 'Other', weekday: targetDay, alt_group_id: null
              });
              if (error) errors.push(`${item.name}: ${error.message}`);
            }
            overlay.remove();
            state.currentTab = 'track';
            renderTrack();
            if (errors.length) alert(`${items.length - errors.length} of ${items.length} added.\n\n${errors.length} failed:\n${errors.join('\n')}`);
          });
        },
        () => {
          const items = [...selection.items.values()];
          showConfirmDialog(`Permanently delete ${items.length} exercise${items.length===1?'':'s'}? Every day they appear on, and all logged history, will be removed.`, async () => {
            for (const item of items){
              await deleteExerciseEntirelyNow(item.name);
            }
            selection.active = false;
            selection.items.clear();
            renderList(body.querySelector('#pickerSearch').value);
          }, { title: `Delete ${items.length} Exercises?`, danger: true, confirmLabel: 'Delete' });
        },
        () => {
          const item = [...selection.items.values()][0];
          promptText({
            title: 'Rename Exercise', placeholder: 'New name', initialValue: item.name,
            onConfirm: async (newName) => {
              if (!newName || newName === item.name){ selection.active = false; selection.items.clear(); renderList(body.querySelector('#pickerSearch').value); return; }
              const userData = { user: await getCurrentUser() };
              if (getUseExerciseMasterFlag()){
                // Handle any duplicate rows sharing this name - previously
                // maybeSingle would error on 2+ matches and rename would
                // silently do nothing.
                const masterResult = await withTimeout(
                  supabaseClient.from('exercise_master').select('id').eq('user_id', userData.user.id).ilike('name', item.name),
                  15000
                );
                if (!masterResult.__timeout && !masterResult.error && masterResult.data && masterResult.data.length){
                  for (const row of masterResult.data){
                    await supabaseClient.from('exercise_master').update({ name: newName }).eq('id', row.id);
                  }
                }
              } else {
                await supabaseClient.from('exercises').update({ name: newName }).eq('user_id', userData.user.id).ilike('name', item.name);
              }
              selection.active = false;
              selection.items.clear();
              renderList(body.querySelector('#pickerSearch').value);
              if (state.currentTab === 'track') renderTrack();
            }
          });
        }
      );
    }
    renderList('');
    body.querySelector('#pickerSearch').oninput = (e) => renderList(e.target.value);
  }

  async function renderDatabaseTab(){
    const body = overlay.querySelector('#pickerBody');
    body.innerHTML = `<div class="small" style="padding:12px 18px; color:var(--slate);">Loading database…</div>`;
    const [publicDb, zealiftDb] = await Promise.all([loadExerciseDB(), loadMonoLiftExerciseDB()]);
    if (!publicDb){
      body.innerHTML = `<div class="empty-state">Database unavailable offline.</div>`;
      return;
    }
    publicDb.forEach(e => { if (!e._source) e._source = 'public'; });
    const db = [...publicDb, ...zealiftDb];
    const sourceFilter = state._pickerSourceFilter || 'all';
    const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    const filterBannerHtml = allowedEquipmentValues ? `
      <div style="margin:10px 18px 0 18px; background:rgba(123,166,201,0.12); border:1px solid rgba(123,166,201,0.3); border-radius:10px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
        <div class="small" style="color:#7BA6C9;">Filtered to what's set up for this location</div>
        <button id="showAllEquipBtn" style="background:none; color:#7BA6C9; font-size:11px; text-decoration:underline; flex-shrink:0; margin-left:8px;">Show all</button>
      </div>` : '';
    const sourceToggleHtml = zealiftDb.length ? `
      <div style="display:flex; gap:8px; margin:10px 18px 0 18px;">
        <div class="db-source-chip ${sourceFilter==='all'?'active':''}" data-src="all" style="flex:1; text-align:center; padding:7px 0; border-radius:10px; background:${sourceFilter==='all'?'var(--flame)':'var(--panel)'}; color:${sourceFilter==='all'?'var(--ink)':'var(--chalk)'}; font-size:11.5px; border:1px solid var(--line); cursor:pointer;">All (${db.length})</div>
        <div class="db-source-chip ${sourceFilter==='zealift'?'active':''}" data-src="zealift" style="flex:1; text-align:center; padding:7px 0; border-radius:10px; background:${sourceFilter==='zealift'?'var(--flame)':'var(--panel)'}; color:${sourceFilter==='zealift'?'var(--ink)':'var(--chalk)'}; font-size:11.5px; border:1px solid var(--line); cursor:pointer;">⚡ MonoLift DB (${zealiftDb.length})</div>
      </div>` : '';
    body.innerHTML = `
      ${filterBannerHtml}
      ${sourceToggleHtml}
      <div class="search-bar">🔍 <input id="dbSearch" placeholder="Search ${db.length} exercises…"></div>
      <div id="starterBlock"></div>
      <div id="dbGroupToggle"></div>
      <div id="dbList" style="padding-right:26px;"></div>`;
    const showAllBtn = body.querySelector('#showAllEquipBtn');
    if (showAllBtn) showAllBtn.onclick = () => { allowedEquipmentValues = null; renderDatabaseTab(); };
    body.querySelectorAll('.db-source-chip').forEach(chip => {
      chip.onclick = () => { state._pickerSourceFilter = chip.dataset.src; renderDatabaseTab(); };
    });

    const starterNames = ['Chest Press','Shoulder Press','Lat Pulldown','Tricep Pushdown','Bicep Curl','Leg Press','Seated Row','Plank'];
    const starterMatches = sourceFilter === 'zealift' ? [] : starterNames.map(n => matchExercise(n, publicDb)).filter(Boolean);
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
      let filtered = db.filter(e => e.name.toLowerCase().includes(f));
      if (sourceFilter === 'zealift') filtered = filtered.filter(e => e._source === 'zealift');
      if (allowedEquipmentValues){
        filtered = filtered.filter(e => !e.equipment || allowedEquipmentValues.has(e.equipment));
      }
      const groupBy = getPickerGroupByPref();
      const splitMode = getSplitModePref();
      const splitSubGroup = getSplitSubGroupPref();
      const { grouped, orderedKeys } = groupDatabaseExercises(filtered, groupBy, splitMode);
      let html = '';
      const presentKeys = orderedKeys.filter(k => (grouped[k]||[]).length);
      const flatOrder = []; // display order across every visible category, for swipe nav
      const isOnDayHere = ex => ex.weekday === state.selectedDay && isAvailableAtLocation(ex, currentLocationId);
      const todayNames = new Set(all.filter(isOnDayHere).map(ex => ex.name.toLowerCase()));
      const todaySignatures = {};
      all.filter(isOnDayHere).forEach(ex => {
        const m = matchExercise(ex.name, db);
        const muscle = m && m.primaryMuscles && m.primaryMuscles[0];
        const mech = classifyMechanic(m);
        const sig = computeAltSignature(ex.name, muscle, mech ? mech.value : null);
        if (sig && !todaySignatures[sig]) todaySignatures[sig] = ex.name;
      });
      // Cross-reference within the filtered list itself too - muscle data is
      // already right there on each entry, no extra lookup needed.
      const listSignatures = {};
      [...filtered].sort((a,b) => a.name.localeCompare(b.name)).forEach(e => {
        const mech = classifyMechanic(e);
        const sig = computeAltSignature(e.name, e.primaryMuscles && e.primaryMuscles[0], mech ? mech.value : null);
        if (sig && !listSignatures[sig]) listSignatures[sig] = e.name;
      });

      function renderDbRow(e){
        flatOrder.push({ name: e.name, equipment: e.equipment });
        const star = POPULAR_EXERCISES.has(e.name)
          ? `<span title="Popular staple" style="color:#F0C542; margin-left:5px;">★</span>` : '';
        const zealiftBadge = e._source === 'zealift'
          ? `<span title="Contributed to the shared MonoLift database" style="font-size:9px; padding:2px 6px; border-radius:4px; margin-left:5px; background:rgba(232,73,42,0.15); color:var(--flame);">⚡ MonoLift</span>` : '';
        const alreadyToday = todayNames.has(e.name.toLowerCase())
          ? `<span style="font-size:9px; padding:2px 6px; border-radius:4px; margin-left:5px; background:rgba(143,191,122,0.15); color:var(--good);">✓ On ${dayNameOf(state.selectedDay)}</span>` : '';
        const muscles = muscleSubtitle(e.primaryMuscles, e.secondaryMuscles);
        const mech = classifyMechanic(e);
        const mechTag = mech ? `<span style="font-size:9px; padding:2px 5px; border-radius:4px; margin-left:5px; background:${mech.value==='compound'?'rgba(255,107,26,0.15)':'rgba(122,150,220,0.15)'}; color:${mech.value==='compound'?'#FF6B1A':'#7BA6C9'}; opacity:${mech.guessed?0.75:1};">${mech.guessed?'~':''}${mech.value==='compound'?'Compound':'Isolation'}</span>` : '';
        const equipLine = [cap(e.equipment), cap(e.level)].filter(Boolean).join(' · ');
        const sig = computeAltSignature(e.name, e.primaryMuscles && e.primaryMuscles[0], mech ? mech.value : null);
        const todayHintName = (!alreadyToday && sig && todaySignatures[sig] && todaySignatures[sig] !== e.name) ? todaySignatures[sig] : null;
        const listHintName = (!todayHintName && sig && listSignatures[sig] && listSignatures[sig] !== e.name) ? listSignatures[sig] : null;
        const altHint = todayHintName
          ? `<div class="small" style="color:var(--slate); opacity:0.7; font-style:italic; margin-top:1px;">alt for ${todayHintName} (on ${dayNameOf(state.selectedDay)})</div>`
          : listHintName ? `<div class="small" style="color:var(--slate); opacity:0.7; font-style:italic; margin-top:1px;">alt for ${listHintName}</div>` : '';
        return `<div class="pick-row db-pick" data-name="${e.name}" data-equip="${e.equipment||''}" style="${selection.active ? 'display:flex; align-items:center; gap:10px;' : ''}">${selection.active ? `<div class="check-circle" style="opacity:${selection.items.has(e.name)?1:0.3}; flex-shrink:0;">${ICON_CHECK}</div>` : ''}<div style="flex:1;"><div class="ex-name">${e.name}${star}${zealiftBadge}${mechTag}${alreadyToday}</div>${muscles ? `<div class="small" style="color:var(--slate);">${muscles}</div>` : ''}${equipLine ? `<div class="small" style="color:var(--slate); opacity:0.7; font-size:10.5px;">${equipLine}</div>` : ''}${altHint}</div>${selection.active ? '' : '<div class="chev">›</div>'}</div>`;
      }

      presentKeys.forEach(cat => {
        const items = (grouped[cat]||[]).slice().sort((a,b)=>a.name.localeCompare(b.name));
        const slug = 'cat-' + cat.replace(/[^a-z0-9]/gi,'');
        html += `<div class="category" id="${slug}">${cat}</div>`;
        if (groupBy === 'split'){
          const { grouped: subGrouped, orderedKeys: subOrderedKeys } = groupDatabaseExercises(items, splitSubGroup);
          const presentSubKeys = subOrderedKeys.filter(k => (subGrouped[k]||[]).length);
          presentSubKeys.forEach((subCat, subIdx) => {
            const subItems = (subGrouped[subCat] || []).slice().sort((a,b) => a.name.localeCompare(b.name));
            const divider = subIdx > 0 ? 'margin-top:14px; border-top:1px solid var(--line);' : '';
            html += `<div class="small" style="${divider} padding:10px 18px 5px 18px; color:var(--chalk); font-family:'Bebas Neue',sans-serif; font-size:14px; letter-spacing:0.5px;">${subCat}</div>`;
            html += subItems.map(renderDbRow).join('');
          });
        } else {
          html += items.map(renderDbRow).join('');
        }
      });
      body.querySelector('#dbGroupToggle').innerHTML = pickerGroupByToggleHtml(groupBy, splitMode, splitSubGroup);
      body.querySelectorAll('.groupby-chip').forEach(chip => {
        chip.onclick = () => { setPickerGroupByPref(chip.dataset.groupby); renderDbList(body.querySelector('#dbSearch').value); };
      });
      body.querySelectorAll('.splitmode-chip').forEach(chip => {
        chip.onclick = () => { setSplitModePref(chip.dataset.splitmode); renderDbList(body.querySelector('#dbSearch').value); };
      });
      body.querySelectorAll('.splitsub-chip').forEach(chip => {
        chip.onclick = () => { setSplitSubGroupPref(chip.dataset.splitsub); renderDbList(body.querySelector('#dbSearch').value); };
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
        let pressTimer = null;
        let longPressed = false;
        const start = () => {
          longPressed = false;
          pressTimer = setTimeout(() => {
            longPressed = true;
            if (!selection.active){ selection.active = true; selection.items.clear(); }
            const name = el.dataset.name;
            if (selection.items.has(name)) selection.items.delete(name);
            else selection.items.set(name, { name, category: EQUIPMENT_TO_CATEGORY[el.dataset.equip] || 'Other' });
            renderDbList(body.querySelector('#dbSearch').value);
          }, 550);
        };
        const cancel = () => { clearTimeout(pressTimer); };
        el.addEventListener('pointerdown', start);
        el.addEventListener('pointerup', cancel);
        el.addEventListener('pointerleave', cancel);
        el.addEventListener('pointercancel', cancel);
        el.onclick = () => {
          if (longPressed) return;
          if (selection.active){
            const name = el.dataset.name;
            if (selection.items.has(name)) selection.items.delete(name);
            else selection.items.set(name, { name, category: EQUIPMENT_TO_CATEGORY[el.dataset.equip] || 'Other' });
            if (selection.items.size === 0) selection.active = false;
            renderDbList(body.querySelector('#dbSearch').value);
            return;
          }
          removeSideIndex();
          openSuggestionPreview(el.dataset.name, EQUIPMENT_TO_CATEGORY[el.dataset.equip] || 'Other', flatOrder);
        };
      });

      renderSelectionBar(
        () => renderDbList(body.querySelector('#dbSearch').value),
        async () => {
          const btn = overlay.querySelector('#selectionAdd');
          const items = [...selection.items.values()];
          await withButtonLoading(btn, 'Adding…', async () => {
            const userData = { user: await getCurrentUser() };
            const errors = [];
            for (const item of items){
              const alreadyToday = todayNames.has(item.name.toLowerCase());
              if (alreadyToday) continue;
              const { error } = await createExerciseForToday({
                user_id: userData.user.id, name: item.name, category: item.category, weekday: state.selectedDay, alt_group_id: null
              });
              if (error) errors.push(`${item.name}: ${error.message}`);
            }
            overlay.remove();
            state.currentTab = 'track';
            renderTrack();
            if (errors.length) alert(`${items.length - errors.length} of ${items.length} added.\n\n${errors.length} failed:\n${errors.join('\n')}`);
          });
        }
      );
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
      selection.active = false; selection.items.clear(); renderSelectionBar();
      if (tab.dataset.tab === 'mine') renderMineTab(); else renderDatabaseTab();
    };
  });

  const startTab = overlay.querySelector(`.picker-toptab[data-tab="${initialTab === 'database' ? 'database' : 'mine'}"]`);
  startTab.classList.add('active'); startTab.style.color = 'var(--chalk)'; startTab.style.borderBottomColor = 'var(--flame)';
  if (initialTab === 'database') renderDatabaseTab(); else renderMineTab();
}

// ---------- AUTO ALT GROUP REVIEW ----------
async function openAutoAltReview(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeAutoAlt">✕</button><h1>Auto-Group Alts</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="autoAltBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Scanning today's exercises…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeAutoAlt').onclick = () => overlay.remove();

  const exercisesForAlt = state.exercises || [];
  const proposals = await proposeAltGroups(exercisesForAlt);
  const body = overlay.querySelector('#autoAltBody');
  proposals.forEach((p, i) => { p.included = true; p.id = 'proposal-' + i; });

  // Ungrouped exercises that actually match an EXISTING group's signature -
  // this is what stops fragmented duplicate groups from piling up over
  // multiple runs. Without this, an exercise added after a group was already
  // created would either get silently skipped, or - worse - end up
  // clustered into a brand new group with the same name as one that already
  // exists, which is exactly how you get two different "Lat Pulldown Alt"
  // groups with different colors.
  const db2 = await loadExerciseDB();
  const existingGroupSignature = {}; // alt_group_id -> signature, from whichever member is already there
  const existingGroupName = {};
  exercisesForAlt.filter(ex => ex.alt_group_id).forEach(ex => {
    if (existingGroupSignature[ex.alt_group_id]) return;
    const match = matchExercise(ex.name, db2);
    const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
    const mech = classifyMechanic(match);
    const sig = computeAltSignature(ex.name, muscle, mech ? mech.value : null);
    if (sig){ existingGroupSignature[ex.alt_group_id] = sig; existingGroupName[ex.alt_group_id] = ex.alt_groups ? ex.alt_groups.name : 'this group'; }
  });
  const clusteredIdsFromProposals = new Set();
  proposals.forEach(p => p.members.forEach(m => clusteredIdsFromProposals.add(m.id)));
  const joinProposals = [];
  exercisesForAlt.filter(ex => !ex.alt_group_id && !clusteredIdsFromProposals.has(ex.id)).forEach(ex => {
    const match = matchExercise(ex.name, db2);
    const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
    const mech = classifyMechanic(match);
    const sig = computeAltSignature(ex.name, muscle, mech ? mech.value : null);
    if (!sig) return;
    const matchGroupId = Object.keys(existingGroupSignature).find(gid => existingGroupSignature[gid] === sig);
    if (matchGroupId) joinProposals.push({ id: 'join-' + ex.id, exercise: ex, groupId: matchGroupId, groupName: existingGroupName[matchGroupId], included: true });
  });
  const joinedIds = new Set(joinProposals.map(j => j.exercise.id));

  // For exercises that don't already have a same-day cluster, suggest real
  // database exercises that share the same muscle+pattern+mechanic - a
  // standalone exercise otherwise never gets an alt suggestion at all.
  const clusteredIds = new Set(clusteredIdsFromProposals);
  const standalone = exercisesForAlt.filter(ex => !ex.alt_group_id && !clusteredIds.has(ex.id) && !joinedIds.has(ex.id));
  const todayNamesLower = new Set(exercisesForAlt.map(ex => ex.name.toLowerCase()));
  const db = await loadExerciseDB();
  const suggestions = [];
  standalone.forEach(ex => {
    const match = matchExercise(ex.name, db);
    const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
    const mech = classifyMechanic(match);
    const sig = computeAltSignature(ex.name, muscle, mech ? mech.value : null);
    if (!sig) return;
    const candidates = db.filter(dbEx => {
      if (todayNamesLower.has(dbEx.name.toLowerCase())) return false;
      const dbMech = classifyMechanic(dbEx);
      return computeAltSignature(dbEx.name, dbEx.primaryMuscles && dbEx.primaryMuscles[0], dbMech ? dbMech.value : null) === sig;
    }).slice(0, 6);
    if (candidates.length) suggestions.push({ id: 'sugg-' + ex.id, forExercise: ex, candidates, picked: null });
  });

  if (!proposals.length && !suggestions.length && !joinProposals.length){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">No obvious groupings or suggestions found among today's ungrouped exercises. This works best when exercises share both a muscle and a movement pattern (e.g. two different presses for chest).</div>`;
    return;
  }

  function render(){
    body.innerHTML = `
      <div class="small" style="padding:12px 18px; color:var(--slate);">Review before confirming - nothing is applied yet. Rename, remove members, or skip a group entirely.</div>
      ${proposals.map(p => `
        <div class="proposal-card" data-pid="${p.id}" style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-left:4px solid ${p.color}; border-radius:10px; padding:12px 14px; opacity:${p.included ? 1 : 0.45};">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <input class="proposal-name-input" data-pid="${p.id}" value="${p.suggestedName}" style="background:none; border:none; color:var(--chalk); font-family:'Oswald',sans-serif; font-size:14px; font-weight:600; flex:1;">
            <button class="proposal-toggle" data-pid="${p.id}" style="background:none; color:${p.included ? 'var(--good)' : 'var(--slate)'}; font-size:11px; font-weight:600; padding:4px 8px;">${p.included ? 'INCLUDED' : 'SKIPPED'}</button>
          </div>
          <div class="small" style="color:var(--slate); margin-bottom:8px;">${p.muscle}</div>
          ${p.members.map(m => `<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0;"><div class="ex-name" style="font-size:13px;">${m.name}</div><span class="proposal-remove-member" data-pid="${p.id}" data-mid="${m.id}" style="color:var(--slate); font-size:12px; padding:2px 6px;">✕</span></div>`).join('')}
        </div>
      `).join('')}
      ${joinProposals.length ? `<div class="small" style="padding:6px 18px 10px 18px; color:var(--slate);">These already match an existing group on today's list - joining keeps everything under one group instead of creating a duplicate.</div>` : ''}
      ${joinProposals.map(j => `
        <div class="proposal-card" data-jid="${j.id}" style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; opacity:${j.included ? 1 : 0.45};">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div>
              <div class="ex-name" style="font-size:13px;">${j.exercise.name}</div>
              <div class="small" style="color:var(--slate); margin-top:2px;">Join "${j.groupName}"</div>
            </div>
            <button class="join-toggle" data-jid="${j.id}" style="background:none; color:${j.included ? 'var(--good)' : 'var(--slate)'}; font-size:11px; font-weight:600; padding:4px 8px;">${j.included ? 'INCLUDED' : 'SKIPPED'}</button>
          </div>
        </div>
      `).join('')}
      ${suggestions.length ? `<div class="small" style="padding:6px 18px 10px 18px; color:var(--slate);">These don't have a match on today's list yet - pick one to add it and group it with the original in one step.</div>` : ''}
      ${suggestions.map(s => `
        <div class="proposal-card" data-sid="${s.id}" style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px;">
          <div class="ex-name" style="font-size:13px; margin-bottom:8px;">${s.forExercise.name}</div>
          <div class="chip-row" style="flex-wrap:wrap;">
            <div class="chip suggestion-none ${!s.picked?'active':''}" data-sid="${s.id}">None</div>
            ${s.candidates.map(c => `<div class="chip suggestion-pick ${s.picked===c.name?'active':''}" data-sid="${s.id}" data-name="${c.name}">${c.name}</div>`).join('')}
          </div>
        </div>
      `).join('')}
      <button class="save-btn" id="confirmAutoAltBtn" style="margin:0 18px 20px 18px;">Apply</button>
    `;
    body.querySelectorAll('.proposal-name-input').forEach(input => {
      input.oninput = () => { proposals.find(p => p.id === input.dataset.pid).suggestedName = input.value; };
    });
    body.querySelectorAll('.proposal-toggle').forEach(btn => {
      btn.onclick = () => { const p = proposals.find(p => p.id === btn.dataset.pid); p.included = !p.included; render(); };
    });
    body.querySelectorAll('.proposal-remove-member').forEach(btn => {
      btn.onclick = () => {
        const p = proposals.find(p => p.id === btn.dataset.pid);
        p.members = p.members.filter(m => m.id !== btn.dataset.mid);
        render();
      };
    });
    body.querySelectorAll('.join-toggle').forEach(btn => {
      btn.onclick = () => { const j = joinProposals.find(j => j.id === btn.dataset.jid); j.included = !j.included; render(); };
    });
    body.querySelectorAll('.suggestion-none').forEach(chip => {
      chip.onclick = () => { suggestions.find(s => s.id === chip.dataset.sid).picked = null; render(); };
    });
    body.querySelectorAll('.suggestion-pick').forEach(chip => {
      chip.onclick = () => { suggestions.find(s => s.id === chip.dataset.sid).picked = chip.dataset.name; render(); };
    });
    body.querySelector('#confirmAutoAltBtn').onclick = async () => { await withButtonLoading(body.querySelector('#confirmAutoAltBtn'), 'Applying…', async () => {
      const toApply = proposals.filter(p => p.included && p.members.length >= 2);
      const toJoin = joinProposals.filter(j => j.included);
      const toAddAsAlt = suggestions.filter(s => s.picked);
      const userData = { user: await getCurrentUser() };
      const useMaster = getUseExerciseMasterFlag();
      const memberTable = useMaster ? 'exercise_master' : 'exercises';
      for (const p of toApply){
        const insertResult = await withTimeout(
          supabaseClient.from('alt_groups').insert({ user_id: userData.user.id, name: p.suggestedName, color: p.color }).select(),
          15000
        );
        const groupId = insertResult.__timeout || !insertResult.data ? null : insertResult.data[0].id;
        if (!groupId) continue;
        for (const m of p.members){
          await supabaseClient.from(memberTable).update({ alt_group_id: groupId }).eq('id', m.id);
        }
      }
      for (const j of toJoin){
        await supabaseClient.from(memberTable).update({ alt_group_id: j.groupId }).eq('id', j.exercise.id);
      }
      for (const s of toAddAsAlt){
        const insertResult = await withTimeout(
          supabaseClient.from('alt_groups').insert({ user_id: userData.user.id, name: s.forExercise.name + ' Alt', color: ALT_COLORS[Math.floor(Math.random()*ALT_COLORS.length)] }).select(),
          15000
        );
        const groupId = insertResult.__timeout || !insertResult.data ? null : insertResult.data[0].id;
        if (!groupId) continue;
        const category = s.candidates.find(c => c.name === s.picked);
        const created = await createExerciseForToday({
          user_id: userData.user.id, name: s.picked, category: category ? EQUIPMENT_TO_CATEGORY[category.equipment] || s.forExercise.category : s.forExercise.category,
          weekday: state.selectedDay, alt_group_id: groupId
        });
        await supabaseClient.from(memberTable).update({ alt_group_id: groupId }).eq('id', s.forExercise.id);
        if (created.data && created.data[0] && getUseExerciseMasterFlag()){
          await supabaseClient.from('exercise_master').update({ alt_group_id: groupId }).eq('id', created.data[0].id);
        }
      }
      overlay.remove();
      renderTrack();
    }); };
  }
  render();
}


// ---------- SPLIT TAG SCANNER ----------
async function proposeSplitTags(){
  const userData = { user: await getCurrentUser() };
  const [all, db] = await Promise.all([
    fetchAllExercisesCompat(userData.user.id),
    loadExerciseDB()
  ]);
  // Work on distinct names - a name missing a tag on ANY of its records counts
  // as needing review, and the fix applies to every record sharing that name.
  const byName = {};
  all.forEach(ex => {
    const key = ex.name.toLowerCase();
    if (!byName[key]) byName[key] = { name: ex.name, ids: [], hasPP: false, hasUL: false };
    byName[key].ids.push(ex.masterId || ex.id);
    if (ex.push_pull) byName[key].hasPP = true;
    if (ex.upper_lower) byName[key].hasUL = true;
  });
  const proposals = [];
  let alreadyTaggedCount = 0;
  Object.values(byName).forEach(item => {
    if (item.hasPP && item.hasUL) { alreadyTaggedCount++; return; } // already fully tagged, nothing to propose
    const match = matchExercise(item.name, db);
    const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
    const pp = classifyPushPull(muscle, item.name);
    const ul = classifyUpperLower(muscle);
    // Previously skipped entirely here if neither could be inferred, which
    // silently dropped exercises from the count - "X of Y tagged" no longer
    // added up because some untagged exercises just vanished. Now every
    // untagged exercise shows up, pre-filled where the classifier could
    // confidently guess, blank where it couldn't, so the math is always exact
    // and nothing is silently excluded.
    proposals.push({ name: item.name, ids: item.ids, muscle: muscle ? cap(muscle) : 'Other', pushPull: pp, upperLower: ul });
  });
  proposals.sort((a,b) => a.muscle.localeCompare(b.muscle) || a.name.localeCompare(b.name));
  return { proposals, alreadyTaggedCount, totalDistinct: Object.keys(byName).length };
}

async function openSplitTagReview(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeSplitReview">✕</button><h1>Tag Push/Pull/Upper/Lower</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="splitReviewBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Scanning your exercises…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeSplitReview').onclick = () => overlay.remove();

  const { proposals, alreadyTaggedCount, totalDistinct } = await proposeSplitTags();
  const body = overlay.querySelector('#splitReviewBody');
  if (!proposals.length){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">All ${totalDistinct} of your exercises are already tagged, or nothing could be confidently inferred for what's left.</div>`;
    return;
  }
  proposals.forEach((p, i) => { p.id = 'sp-' + i; p.included = true; });

  function render(){
    let lastMuscle = null;
    body.innerHTML = `
      <div class="small" style="padding:12px 18px; color:var(--slate); line-height:1.6;">This tags exercises as Push/Pull and Upper/Lower, which is what Reorganize uses to build a PPL or Upper/Lower split automatically - an exercise with no tag gets skipped when reorganizing your whole week.<br><br>${alreadyTaggedCount} of your ${totalDistinct} exercises are already tagged - these ${proposals.length} still need it. Review and adjust before applying, nothing saves until you confirm.</div>
      ${proposals.map(p => {
        const header = p.muscle !== lastMuscle ? (lastMuscle = p.muscle, `<div class="category">${p.muscle}</div>`) : '';
        return `${header}
        <div class="proposal-card" data-pid="${p.id}" style="margin:0 18px 10px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 14px; opacity:${p.included?1:0.45};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div class="ex-name" style="font-size:13px;">${p.name}</div>
            <button class="sp-toggle" data-pid="${p.id}" style="background:none; color:${p.included?'var(--good)':'var(--slate)'}; font-size:10px; font-weight:600;">${p.included?'INCLUDED':'SKIPPED'}</button>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${['push','pull'].map(v => `<span class="sp-chip" data-pid="${p.id}" data-field="pushPull" data-val="${v}" style="font-size:10.5px; padding:4px 10px; border-radius:12px; border:1px solid var(--line); background:${p.pushPull===v?'var(--flame)':'transparent'}; color:${p.pushPull===v?'var(--ink)':'var(--slate)'};">${cap(v)}</span>`).join('')}
            ${['upper','lower'].map(v => `<span class="sp-chip" data-pid="${p.id}" data-field="upperLower" data-val="${v}" style="font-size:10.5px; padding:4px 10px; border-radius:12px; border:1px solid var(--line); background:${p.upperLower===v?'#3A6EA5':'transparent'}; color:${p.upperLower===v?'#fff':'var(--slate)'};">${cap(v)}</span>`).join('')}
          </div>
        </div>`;
      }).join('')}
      <button class="save-btn" id="confirmSplitBtn" style="margin:0 18px 20px 18px;">Apply Tags</button>
    `;
    body.querySelectorAll('.sp-toggle').forEach(btn => {
      btn.onclick = () => { const p = proposals.find(p=>p.id===btn.dataset.pid); p.included = !p.included; render(); };
    });
    body.querySelectorAll('.sp-chip').forEach(chip => {
      chip.onclick = () => {
        const p = proposals.find(p=>p.id===chip.dataset.pid);
        const field = chip.dataset.field, val = chip.dataset.val;
        p[field] = p[field] === val ? null : val; // tap again to clear
        render();
      };
    });
    body.querySelector('#confirmSplitBtn').onclick = async () => {
      const btn = body.querySelector('#confirmSplitBtn');
      btn.textContent = 'Applying…';
      const toApply = proposals.filter(p => p.included && (p.pushPull || p.upperLower));
      const table = getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises';
      let successCount = 0;
      const errors = [];
      for (const p of toApply){
        for (const id of p.ids){
          const { error } = await supabaseClient.from(table).update({ push_pull: p.pushPull, upper_lower: p.upperLower }).eq('id', id);
          if (error){ errors.push(`${p.name}: ${error.message}`); }
          else { successCount++; }
        }
      }
      if (errors.length){
        alert(`${successCount} saved, but ${errors.length} failed:\n\n${errors.slice(0,5).join('\n')}${errors.length>5 ? `\n…and ${errors.length-5} more` : ''}`);
        btn.textContent = 'Apply Tags';
        return;
      }
      overlay.remove();
      if (state.currentTab === 'track') renderTrack();
    };
  }
  render();
}

// ---------- BULK LOCATION ASSIGN ----------
async function openBulkLocationAssign(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeBulkLoc">✕</button><h1>Assign to a Location</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="bulkLocStep1">
      <div class="small" style="padding:10px 18px; color:var(--slate); line-height:1.5;">Pick a location, then tick exactly which exercises belong there.</div>
      <div id="bulkLocList"><div class="small" style="padding:16px 18px; color:var(--slate);">Loading…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeBulkLoc').onclick = () => overlay.remove();

  async function renderLocationPicker(){
    const locs = await loadLocations();
    const listArea = overlay.querySelector('#bulkLocList');
    listArea.innerHTML = locs.map(l => `<div class="pick-row" data-loc-id="${l.id}" data-loc-name="${l.name}"><div class="ex-name">${l.name}</div><div class="chev">›</div></div>`).join('')
      + `<div class="action-row" id="createLocRow"><div class="ex-name" style="color:var(--flame);">+ New Location</div></div>`;
    listArea.querySelectorAll('.pick-row[data-loc-id]').forEach(row => {
      row.onclick = () => renderExerciseChecklist(row.dataset.locId, row.dataset.locName);
    });
    listArea.querySelector('#createLocRow').onclick = () => {
      promptText({
        title: 'New Location Name', placeholder: 'e.g. Functional Fitness',
        onConfirm: async (name) => {
          const loc = await createLocation(name);
          if (loc) renderExerciseChecklist(loc.id, loc.name);
        }
      });
    };
  }

  async function renderExerciseChecklist(locId, locName){
    const body = overlay.querySelector('#bulkLocStep1');
    body.innerHTML = `<div class="small" style="padding:16px 18px; color:var(--slate);">Loading exercises…</div>`;

    const userData = { user: await getCurrentUser() };
    const all = await fetchAllExercisesCompat(userData.user.id);
    const byName = {};
    all.forEach(ex => {
      if (!byName[ex.name]) byName[ex.name] = { ids: [], category: ex.category || 'Other', alreadyHere: (ex.location_ids||[]).includes(locId) };
      byName[ex.name].ids.push(ex.masterId || ex.id);
    });
    const names = Object.keys(byName).sort();
    const checked = new Set(names.filter(n => byName[n].alreadyHere));
    const originallyChecked = new Set(checked); // snapshot, so confirm only touches what actually changed

    // Group by equipment category (Cable, Pin-Loaded, Free Weights - Bench, etc)
    // instead of one long flat list, with a tick-all/untick-all per category for
    // fast bulk organization when many exercises share the same equipment.
    const byCategory = {};
    names.forEach(n => { (byCategory[byName[n].category] = byCategory[byName[n].category] || []).push(n); });
    const categories = Object.keys(byCategory).sort();

    function render(){
      body.innerHTML = `
        <div class="form-sub" style="padding:10px 18px 4px 18px;">${locName} — tick the exercises that belong here</div>
        ${categories.map(cat => {
          const catNames = byCategory[cat];
          const allChecked = catNames.every(n => checked.has(n));
          return `
          <div class="category" style="display:flex; align-items:center; justify-content:space-between;">
            <span>${cat}</span>
            <span class="cat-toggle-all" data-cat="${cat}" style="font-family:'JetBrains Mono',monospace; font-size:9.5px; color:var(--flame); text-decoration:underline; cursor:pointer; text-transform:none; letter-spacing:0;">${allChecked ? 'Untick All' : 'Tick All'}</span>
          </div>
          ${catNames.map(n => `<div class="pick-row bulk-check-row" data-name="${n}" style="cursor:pointer;">
            <div class="ex-name" style="font-size:12.5px;">${n}</div>
            <span style="font-size:16px; color:${checked.has(n) ? 'var(--flame)' : 'var(--line)'};">${checked.has(n) ? '☑' : '☐'}</span>
          </div>`).join('')}
        `}).join('')}
        <button class="save-btn" id="confirmBulkLocBtn" style="margin-top:10px;">Save (${checked.size} at "${locName}")</button>
      `;
      body.querySelectorAll('.bulk-check-row').forEach(row => {
        row.onclick = () => {
          const n = row.dataset.name;
          if (checked.has(n)) checked.delete(n); else checked.add(n);
          render();
        };
      });
      body.querySelectorAll('.cat-toggle-all').forEach(btn => {
        btn.onclick = () => {
          const catNames = byCategory[btn.dataset.cat];
          const allChecked = catNames.every(n => checked.has(n));
          catNames.forEach(n => { if (allChecked) checked.delete(n); else checked.add(n); });
          render();
        };
      });
      body.querySelector('#confirmBulkLocBtn').onclick = async () => {
        const confirmBtn = body.querySelector('#confirmBulkLocBtn');
        confirmBtn.textContent = 'Saving…';
        let successCount = 0;
        const errors = [];
        for (const n of names){
          const isChecked = checked.has(n);
          const was = originallyChecked.has(n);
          if (isChecked === was) continue; // unchanged, nothing to write
          const item = byName[n];
          const table = getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises';
          for (const id of item.ids){
            const exRow = all.find(e => (e.masterId || e.id) === id);
            const existing = (exRow && exRow.location_ids) || [];
            // Only ever touches this one location's membership - every other
            // location already tagged on this exercise is left exactly as-is.
            const updated = isChecked
              ? [...new Set([...existing, locId])]
              : existing.filter(id2 => id2 !== locId);
            const { error } = await supabaseClient.from(table).update({ location_ids: updated }).eq('id', id);
            if (error){ errors.push(`${n}: ${error.message}`); }
            else { successCount++; }
          }
        }
        if (errors.length){
          alert(`${successCount} saved, but ${errors.length} failed:\n\n${errors.slice(0,5).join('\n')}${errors.length>5 ? `\n…and ${errors.length-5} more` : ''}`);
          confirmBtn.textContent = `Save (${checked.size} at "${locName}")`;
          return;
        }
        overlay.remove();
        if (state.currentTab === 'track') renderTrack();
      };
    }
    render();
  }

  renderLocationPicker();
}

// ---------- PLAN BACKUPS ----------
async function createPlanBackup(name){
  const userData = { user: await getCurrentUser() };
  let exercises;
  try {
    exercises = await fetchAllExercisesCompat(userData.user.id);
  } catch(e) {
    return { backup: null, errorMessage: 'Could not read your exercises: ' + e.message };
  }
  // Snapshot the stable identity (master id under the new structure, since a
  // day-link id is ephemeral and won't mean anything after a later
  // reorganization) alongside weekday and every other tag.
  exercises = exercises.map(ex => ({
    id: ex.masterId || ex.id, name: ex.name, category: ex.category, weekday: ex.weekday,
    alt_group_id: ex.alt_group_id, push_pull: ex.push_pull, upper_lower: ex.upper_lower, location_ids: ex.location_ids
  }));

  // The insert can genuinely fail at the network level on mobile (not just
  // resolve with an error field) - "TypeError: Load failed" is Safari's raw
  // fetch failure message, not something Supabase's own error handling ever
  // sees, so it needs its own try/catch. One retry since this is more likely
  // a transient blip than a real problem with the data.
  async function attemptInsert(){
    try {
      return await withTimeout(
        supabaseClient.from('plan_backups').insert({ user_id: userData.user.id, name, snapshot: exercises }).select(),
        15000
      );
    } catch(e) {
      return { __threw: true, message: e.message };
    }
  }
  let result = await attemptInsert();
  if (result.__threw){
    await new Promise(r => setTimeout(r, 800));
    result = await attemptInsert();
  }
  if (result.__threw) return { backup: null, errorMessage: `Network error saving the backup (${result.message}). Check your connection and try again.` };
  if (result.__timeout) return { backup: null, errorMessage: 'Timed out saving the backup.' };
  if (result.error) return { backup: null, errorMessage: result.error.message };
  if (!result.data || !result.data[0]) return { backup: null, errorMessage: 'No data returned after saving.' };
  return { backup: result.data[0], errorMessage: null };
}
async function loadPlanBackups(){
  const userData = { user: await getCurrentUser() };
  const result = await withTimeout(
    supabaseClient.from('plan_backups').select('id, name, created_at, snapshot').eq('user_id', userData.user.id).order('created_at', { ascending: false }),
    15000
  );
  return result.__timeout || result.error ? [] : (result.data || []);
}
// Restores by matching exercise ID - exercises that still exist get their
// weekday/category/split tags/locations set back to what the backup recorded.
// Anything deleted since the backup is skipped rather than recreated, and the
// summary honestly reports what happened either way.
async function restorePlanBackup(backup){
  const userData = { user: await getCurrentUser() };
  if (getUseExerciseMasterFlag()){
    const masterResult = await withTimeout(
      supabaseClient.from('exercise_master').select('id').eq('user_id', userData.user.id), 15000
    );
    const currentIds = new Set((masterResult.data || []).map(e => e.id));
    let restored = 0, skipped = 0;
    for (const ex of backup.snapshot){
      if (!currentIds.has(ex.id)){ skipped++; continue; }
      await supabaseClient.from('exercise_master').update({
        category: ex.category, alt_group_id: ex.alt_group_id,
        push_pull: ex.push_pull, upper_lower: ex.upper_lower, location_ids: ex.location_ids
      }).eq('id', ex.id);
      await moveExerciseToDay({ masterId: ex.id, ids: [] }, ex.weekday, false);
      restored++;
    }
    return { restored, skipped };
  }
  const currentResult = await withTimeout(
    supabaseClient.from('exercises').select('id').eq('user_id', userData.user.id),
    15000
  );
  const currentIds = new Set((currentResult.data || []).map(e => e.id));
  let restored = 0, skipped = 0;
  for (const ex of backup.snapshot){
    if (!currentIds.has(ex.id)){ skipped++; continue; }
    await supabaseClient.from('exercises').update({
      category: ex.category, weekday: ex.weekday, alt_group_id: ex.alt_group_id,
      push_pull: ex.push_pull, upper_lower: ex.upper_lower, location_ids: ex.location_ids
    }).eq('id', ex.id);
    restored++;
  }
  return { restored, skipped };
}

// Read-only look at what's actually in a saved plan, grouped by day.
function openBackupDetailView(backup){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  const byDay = {};
  (backup.snapshot || []).forEach(ex => { (byDay[ex.weekday] = byDay[ex.weekday] || []).push(ex); });
  const dayBlocks = DAY_NAMES.map((d, i) => {
    const items = (byDay[i] || []).slice().sort((a,b) => a.name.localeCompare(b.name));
    if (!items.length) return '';
    return `<div class="category">${d.toUpperCase()}</div>` + items.map(ex =>
      `<div class="pick-row" style="cursor:default;"><div><div class="ex-name" style="font-size:12.5px;">${ex.name}</div><div class="small" style="color:var(--slate);">${ex.category || ''}</div></div></div>`
    ).join('');
  }).join('');

  overlay.innerHTML = `
    <div class="form-header"><button id="closeDetail">✕</button><h1>${backup.name}</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:8px 18px 12px 18px; color:var(--slate);">Saved ${formatLoggedDate((backup.created_at||'').slice(0,10))} · ${(backup.snapshot||[]).length} exercises · view only</div>
      ${dayBlocks || `<div class="empty-state" style="padding:20px 18px;">Nothing in this backup.</div>`}
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeDetail').onclick = () => overlay.remove();
}

// Custom confirmation screen replacing the native confirm() flow - an explicit
// choice about whether to also back up the current setup first, not just an
// automatic thing that happens without asking.
function openRestoreConfirmScreen(backup, listOverlay, onDone){
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:70; display:flex; align-items:flex-end;';
  let alsoBackup = true;
  overlay.innerHTML = `
    <div style="width:100%; background:var(--panel); border-radius:18px 18px 0 0; padding:22px 18px calc(22px + env(safe-area-inset-bottom, 0px)) 18px;">
      <div style="font-family:'Bebas Neue',sans-serif; font-size:19px; letter-spacing:1px; margin-bottom:6px;">Restore "${backup.name}"?</div>
      <div class="small" style="color:var(--slate); line-height:1.5; margin-bottom:16px;">This replaces your current day/category/tag setup with what's in this backup. ${backup.snapshot.length} exercises will be affected.</div>
      <div id="alsoBackupRow" style="display:flex; align-items:center; gap:10px; padding:12px 14px; background:var(--ink); border-radius:10px; margin-bottom:18px; cursor:pointer;">
        <span id="alsoBackupCheck" style="font-size:18px; color:var(--flame);">☑</span>
        <div>
          <div style="font-size:13px; font-weight:600;">Backup my current setup first</div>
          <div class="small" style="color:var(--slate);">Recommended - lets you undo this restore later</div>
        </div>
      </div>
      <div style="display:flex; gap:10px;">
        <button id="cancelRestoreBtn" style="flex:1; background:var(--ink); color:var(--slate); padding:13px; border-radius:10px; font-weight:600;">Cancel</button>
        <button id="confirmRestoreBtn" style="flex:1; background:var(--flame); color:var(--ink); padding:13px; border-radius:10px; font-weight:600;">Yes, Restore</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector('#cancelRestoreBtn').onclick = () => overlay.remove();
  overlay.querySelector('#alsoBackupRow').onclick = () => {
    alsoBackup = !alsoBackup;
    overlay.querySelector('#alsoBackupCheck').textContent = alsoBackup ? '☑' : '☐';
    overlay.querySelector('#alsoBackupCheck').style.color = alsoBackup ? 'var(--flame)' : 'var(--slate)';
  };
  overlay.querySelector('#confirmRestoreBtn').onclick = async () => {
    const proceedWithRestore = async () => {
      const { restored, skipped } = await restorePlanBackup(backup);
      overlay.remove();
      if (listOverlay) listOverlay.remove();
      alert(`Restored ${restored} exercises.${skipped ? ' ' + skipped + ' from this backup no longer exist and were skipped.' : ''}`);
      if (onDone) onDone();
    };
    if (alsoBackup){
      const { backup: safetyBackup, errorMessage } = await createPlanBackup(`Before restoring "${backup.name}" — ${todayStr()}`);
      if (!safetyBackup){
        showConfirmDialog(`Could not save the safety backup (${errorMessage}). Restore anyway with no way back?`, proceedWithRestore, { title: 'Safety Backup Failed', danger: true, confirmLabel: 'Restore Anyway' });
        return;
      }
    }
    await proceedWithRestore();
  };
}

async function openBackupPlanScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeBackup">✕</button><h1>Backup Plan</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="small" style="padding:10px 18px; color:var(--slate); line-height:1.5;">Save your current plan as a named snapshot, so you can switch splits and come back to it later.</div>
      <div class="action-row" id="saveBackupRow"><div class="ex-name" style="color:var(--flame);">+ Save Current Plan</div></div>
      <div class="section-label">Saved Plans</div>
      <div id="backupList"><div class="small" style="padding:16px 18px; color:var(--slate);">Loading…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeBackup').onclick = () => overlay.remove();

  overlay.querySelector('#saveBackupRow').onclick = () => {
    const defaultName = `Backup - ${SHORT_MONTH_NAMES[new Date().getMonth()]} ${new Date().getDate()}`;
    promptText({
      title: 'Name This Plan', placeholder: 'e.g. Bro Split, PPL, Upper/Lower', initialValue: defaultName,
      onConfirm: async (name) => {
        const { backup, errorMessage } = await createPlanBackup(name);
        if (!backup){ alert('Could not save the backup: ' + errorMessage); return; }
        renderList();
      }
    });
  };

  async function renderList(){
    const listArea = overlay.querySelector('#backupList');
    listArea.innerHTML = `<div class="small" style="padding:16px 18px; color:var(--slate);">Loading…</div>`;
    const backups = await loadPlanBackups();
    if (!backups.length){
      listArea.innerHTML = `<div class="empty-state" style="padding:20px 18px;">No saved plans yet.</div>`;
      return;
    }
    listArea.innerHTML = backups.map(b => `
      <div class="proposal-card backup-card" data-id="${b.id}" style="margin:0 18px 10px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; cursor:pointer;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <div class="ex-name" style="font-size:13.5px;">${b.name}</div>
          <span class="small" style="color:var(--slate);">${(b.snapshot||[]).length} exercises</span>
        </div>
        <div class="small" style="color:var(--slate); margin-bottom:10px;">${formatLoggedDate((b.created_at||'').slice(0,10))} · tap to view</div>
        <div style="display:flex; gap:8px;">
          <button class="backup-restore-btn" data-id="${b.id}" style="flex:1; background:var(--flame); color:var(--ink); padding:9px; border-radius:8px; font-weight:600; font-size:12px;">Restore</button>
          <button class="backup-rename-btn" data-id="${b.id}" data-name="${b.name}" style="background:var(--ink); color:var(--slate); padding:9px 14px; border-radius:8px; font-size:12px;">Rename</button>
          <button class="backup-delete-btn" data-id="${b.id}" style="background:var(--ink); color:#E8492A; padding:9px 14px; border-radius:8px; font-size:12px;">Delete</button>
        </div>
      </div>
    `).join('');

    listArea.querySelectorAll('.backup-card').forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('button')) return; // let the action buttons handle their own clicks
        openBackupDetailView(backups.find(b => b.id === card.dataset.id));
      };
    });
    listArea.querySelectorAll('.backup-restore-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openRestoreConfirmScreen(backups.find(b => b.id === btn.dataset.id), overlay, () => {
          if (state.currentTab === 'track'){ state.selectedDay = todayWeekday(); renderTrack(); }
        });
      };
    });
    listArea.querySelectorAll('.backup-rename-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        promptText({
          title: 'Rename Plan', placeholder: 'Name', initialValue: btn.dataset.name,
          onConfirm: async (newName) => {
            await supabaseClient.from('plan_backups').update({ name: newName }).eq('id', btn.dataset.id);
            renderList();
          }
        });
      };
    });
    listArea.querySelectorAll('.backup-delete-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        showConfirmDialog('This cannot be undone.', async () => {
          await supabaseClient.from('plan_backups').delete().eq('id', btn.dataset.id);
          renderList();
        }, { title: 'Delete This Saved Plan?', danger: true, confirmLabel: 'Delete' });
      };
    });
  }
  renderList();
}

// ---------- PLAN REORGANIZER ----------
// Broad region grouping used only by Bro Split's day-assignment screen - maps
// the exercise database's raw primaryMuscles values to generic groupings
// (Chest, Back, Arms, Legs, etc.) instead of showing every individual muscle
// as its own separate option, and lets a day combine more than one region
// (e.g. Chest + Triceps in one day, the classic bro-split combo).
const RAW_MUSCLE_TO_REGION = {
  chest: 'Chest', shoulders: 'Shoulders',
  lats: 'Back', traps: 'Back', 'lower back': 'Back', 'middle back': 'Back',
  biceps: 'Arms', triceps: 'Arms', forearms: 'Arms',
  quadriceps: 'Legs', hamstrings: 'Legs', glutes: 'Legs', calves: 'Legs', adductors: 'Legs', abductors: 'Legs',
  abdominals: 'Core', neck: 'Neck'
};

const SPLIT_TYPES = [
  { id:'ppl', label:'Push / Pull / Legs', desc:'The gym-bro classic. Push muscles one day, pull the next, legs when you\'re ready to suffer.', cats:['push','pull','legs','rest'] },
  { id:'upperlower', label:'Upper / Lower', desc:'Half your body today, the other half tomorrow. Efficient, no-nonsense.', cats:['upper','lower','rest'] },
  { id:'arnold', label:'Arnold Split', desc:'Chest+Back paired, Shoulders+Arms paired, Legs solo - the exact rotation the Austrian Oak trained on. Not for the faint of heart.', cats:['chestback','shouldersarms','legs','rest'] },
  { id:'fullbody', label:'Full Body', desc:'Hit almost everything, every session. Old school, brutally efficient, not for people who hate long workouts.', cats:['fullbody','rest'] },
  { id:'muscle', label:'Bro Split', desc:'One muscle, one day, all business. The most iconic split in gym history - yes it\'s basically a meme, and yes, it works.', cats:null }, // populated dynamically from what's actually in use
  { id:'custom', label:'Custom', desc:'Build it exactly your way, day by day.', cats:null }
];

// ---------- CHANGE ONE DAY ----------
// Lightweight alternative to the full reorganizer for changing a single day's
// focus without needing to re-specify every other day - the full reorganizer
// requires you to correctly reassign every day you want preserved in the same
// session, or exercises can end up moving somewhere unintended. This only
// ever touches the one day picked.
async function openChangeSingleDay(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  document.body.appendChild(overlay);
  let targetDay = null;
  let newCategory = null;

  function renderStep1(){
    overlay.innerHTML = `
      <div class="form-header"><button id="closeChangeDay">✕</button><h1>Change One Day</h1><div style="width:18px;"></div></div>
      <div class="overlay-scroll">
        <div class="small" style="padding:8px 18px 16px 18px; color:var(--slate); line-height:1.5;">Pick a day to change. Nothing else in your week is touched.</div>
        ${DAY_NAMES.map((d,i) => `<div class="pick-row" data-day="${i}"><div class="ex-name">${d}</div><div class="chev">›</div></div>`).join('')}
      </div>`;
    overlay.querySelector('#closeChangeDay').onclick = () => overlay.remove();
    overlay.querySelectorAll('.pick-row').forEach(row => {
      row.onclick = () => { targetDay = parseInt(row.dataset.day, 10); renderStep2(); };
    });
  }

  async function renderStep2(){
    overlay.innerHTML = `<div class="form-header"><button id="closeChangeDay">✕</button><h1>${DAY_NAMES[targetDay]}'s New Focus</h1><div style="width:18px;"></div></div>
      <div class="overlay-scroll"><div class="small" style="padding:20px 18px; color:var(--slate);">Loading…</div></div>`;
    overlay.querySelector('#closeChangeDay').onclick = () => overlay.remove();

    const userData = { user: await getCurrentUser() };
    const [compatEx, db] = await Promise.all([
      fetchAllExercisesCompat(userData.user.id),
      loadExerciseDB()
    ]);
    const names = [...new Set(compatEx.map(e=>e.name))];
    const muscles = new Set();
    names.forEach(n => { const m = matchExercise(n, db); if (m && m.primaryMuscles && m.primaryMuscles[0]) muscles.add(m.primaryMuscles[0]); });
    const cats = ['push','pull','legs','upper','lower','chestback','shouldersarms','fullbody', ...muscles, 'rest'];

    const body = overlay.querySelector('.overlay-scroll');
    body.innerHTML = `
      <div class="small" style="padding:0 18px 12px 18px; color:var(--slate);">What should this day focus on now?</div>
      <div class="chip-row" style="flex-wrap:wrap;">
        ${cats.map(c => `<div class="chip" data-cat="${c}">${SPLIT_CATEGORY_LABELS[c] || cap(c)}</div>`).join('')}
        <div class="chip" data-cat="custom" style="color:var(--flame); border-color:var(--flame);">Manual</div>
      </div>
    `;
    body.querySelectorAll('.chip').forEach(chip => {
      chip.onclick = () => { newCategory = chip.dataset.cat; renderStep3(); };
    });
  }

  async function renderStep3(){
    overlay.innerHTML = `<div class="form-header"><button id="closeChangeDay">✕</button><h1>Preview</h1><div style="width:18px;"></div></div>
      <div class="overlay-scroll" id="changeDayBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Building preview…</div></div>`;
    overlay.querySelector('#closeChangeDay').onclick = () => overlay.remove();

    const userData = { user: await getCurrentUser() };
    const [allExercises, db] = await Promise.all([
      fetchAllExercisesCompat(userData.user.id),
      loadExerciseDB()
    ]);
    const byName = {};
    allExercises.forEach(ex => {
      if (!byName[ex.name]) byName[ex.name] = { name: ex.name, ids: [], masterId: ex.masterId || null, weekday: ex.weekday, altGroupId: ex.alt_group_id, push_pull: ex.push_pull, upper_lower: ex.upper_lower };
      byName[ex.name].ids.push(ex.id);
    });
    const namedList = await Promise.all(Object.values(byName).map(async item => {
      const match = matchExercise(item.name, db);
      const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
      return { ...item, muscle };
    }));

    const currentlyHere = namedList.filter(n => n.weekday === targetDay);
    const incoming = newCategory === 'custom' ? [] :
      namedList.filter(n => n.weekday !== targetDay && exerciseMatchesCategory(n, n.muscle, newCategory));
    const staying = newCategory === 'custom' ? currentlyHere :
      currentlyHere.filter(n => exerciseMatchesCategory(n, n.muscle, newCategory));
    const leaving = currentlyHere.filter(n => !staying.some(s => s.name === n.name));

    const body = overlay.querySelector('#changeDayBody');
    const included = new Set([...incoming, ...staying].map(n => n.name));
    function render(){
      body.innerHTML = `
        <div class="banner" style="margin:8px 18px 16px 18px; background:#251a12; border:1px solid #4a2f16; border-radius:10px; padding:12px 14px; font-size:11.5px; color:#E8A33D; line-height:1.5;">⚠ Only ${DAY_NAMES[targetDay]} changes. Every other day stays exactly as it is. Your current setup is saved automatically first.</div>
        <div class="category">MOVING TO ${DAY_NAMES[targetDay]}</div>
        ${[...incoming, ...staying].map(n => `<div class="pick-row reorg-item" data-name="${n.name}" style="cursor:pointer;"><div class="ex-name">${n.name}</div><span style="color:${included.has(n.name)?'var(--flame)':'var(--slate)'};">${included.has(n.name)?'☑':'☐'}</span></div>`).join('') || `<div class="empty-state" style="padding:14px 18px;">Nothing matches this category yet.</div>`}
        ${leaving.length ? `<div class="category" style="color:#E8492A;">NO LONGER FITS - WILL BE DEACTIVATED</div>
          <div class="small" style="padding:0 18px 8px 18px; color:var(--slate);">Removed from your active rotation, but history is kept. Untick to keep it here anyway.</div>
          ${leaving.map(n => `<div class="pick-row reorg-item" data-name="${n.name}" data-leaving="1" style="cursor:pointer;"><div class="ex-name">${n.name}</div><span style="color:${included.has(n.name)?'var(--flame)':'#E8492A'};">${included.has(n.name)?'☑ keep':'☐ remove'}</span></div>`).join('')}` : ''}
        <button class="save-btn" id="confirmChangeDayBtn" style="margin:16px 18px 20px 18px;">Confirm</button>
      `;
      body.querySelectorAll('.reorg-item').forEach(row => {
        row.onclick = () => {
          const n = row.dataset.name;
          if (included.has(n)) included.delete(n); else included.add(n);
          render();
        };
      });
      body.querySelector('#confirmChangeDayBtn').onclick = async () => { await withButtonLoading(body.querySelector('#confirmChangeDayBtn'), 'Applying…', async () => {
        // Snapshot includes masterId (master schema only - undefined/ignored
        // for legacy) so a revert can RECREATE a link that got deleted by
        // cleanup, not just update-by-id a row that may no longer exist.
        const snapshot = allExercises.map(ex => ({ id: ex.id, weekday: ex.weekday, masterId: ex.masterId }));
        localStorage.setItem('zealift_reorg_snapshot', JSON.stringify({ snapshot, at: new Date().toISOString() }));

        // Same conservative alt-group rule as the full reorganizer: if a
        // sibling isn't also ending up on this day, clear the link rather
        // than leave a group half-scattered.
        const finalHere = new Set([...incoming, ...staying].filter(n => included.has(n.name)).map(n => n.name));
        const altGroupsToClear = new Set();
        namedList.forEach(n => {
          if (!n.altGroupId) return;
          const siblingsOfGroup = namedList.filter(s => s.altGroupId === n.altGroupId);
          const allHere = siblingsOfGroup.every(s => finalHere.has(s.name) || (s.weekday === targetDay && !leaving.some(l=>l.name===s.name)));
          if (!allHere) altGroupsToClear.add(n.altGroupId);
        });

        for (const n of incoming){
          if (!included.has(n.name)) continue;
          const clearAlt = n.altGroupId && altGroupsToClear.has(n.altGroupId);
          await moveExerciseToDay(n, targetDay, clearAlt);
        }
        for (const n of leaving){
          if (included.has(n.name)) continue; // kept anyway, don't deactivate
          for (const id of n.ids){
            await removeExerciseFromDay({ id, masterId: n.masterId });
          }
        }
        // Sync the day's header label to the new focus too - otherwise Track
        // keeps showing the old label even though the exercises underneath
        // have genuinely changed, the same inconsistency the full
        // reorganizer already guards against. Manual/Custom is skipped since
        // there's no single category name to derive a label from.
        if (newCategory !== 'custom'){
          await supabaseClient.from('day_types').upsert(
            { user_id: userData.user.id, weekday: targetDay, label: SPLIT_CATEGORY_LABELS[newCategory] || cap(newCategory) },
            { onConflict: 'user_id,weekday' }
          );
        }
        overlay.remove();
        state.selectedDay = targetDay;
        state.currentTab = 'track';
        renderTrack();
      }); };
    }
    render();
  }

  renderStep1();
}

async function openPlanReorganizer(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  document.body.appendChild(overlay);
  let splitType = null;
  let dayAssignments = {}; // weekday index -> category string ('rest' or null = no exercises move here)

  function renderStep1(){
    overlay.innerHTML = `
      <div class="form-header"><button id="closeReorg">✕</button><h1>Reorganize Week</h1><div style="width:18px;"></div></div>
      <div class="overlay-scroll">
        <div class="small" style="padding:8px 18px 16px 18px; color:var(--slate); line-height:1.5;">Pick a split style. The next steps preview exactly what would move where before anything actually changes.</div>
        ${SPLIT_TYPES.map(s => `<div class="pick-row" data-split="${s.id}" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
          <div style="flex:1;">
            <div class="ex-name" style="margin-bottom:3px;">${s.label}</div>
            <div class="small" style="color:var(--slate); line-height:1.4;">${s.desc}</div>
          </div>
          <div class="chev" style="margin-top:2px;">›</div>
        </div>`).join('')}
      </div>`;
    overlay.querySelector('#closeReorg').onclick = () => overlay.remove();
    overlay.querySelectorAll('.pick-row').forEach(row => {
      row.onclick = () => { splitType = row.dataset.split; renderStep2(); };
    });
  }

  async function renderStep2(){
    overlay.innerHTML = `<div class="form-header"><button id="closeReorg">✕</button><h1>Assign Days</h1><div style="width:18px;"></div></div>
      <div class="overlay-scroll"><div class="small" style="padding:20px 18px; color:var(--slate);">Loading…</div></div>`;
    overlay.querySelector('#closeReorg').onclick = () => overlay.remove();

    let cats = SPLIT_TYPES.find(s=>s.id===splitType).cats;
    if (splitType === 'muscle' || splitType === 'custom'){
      const userData = { user: await getCurrentUser() };
      const [compatEx, db] = await Promise.all([
        fetchAllExercisesCompat(userData.user.id),
        loadExerciseDB()
      ]);
      const names = [...new Set(compatEx.map(e=>e.name))];
      const muscles = new Set();
      const regions = new Set();
      names.forEach(n => {
        const m = matchExercise(n, db);
        const muscle = m && m.primaryMuscles && m.primaryMuscles[0];
        if (!muscle) return;
        muscles.add(muscle);
        if (RAW_MUSCLE_TO_REGION[muscle]) regions.add(RAW_MUSCLE_TO_REGION[muscle]);
      });
      cats = splitType === 'muscle'
        ? [...regions, 'rest']
        // Custom mixes every category from every other split together, so any
        // day can be Push, or Legs, or a specific muscle, or Chest & Back, or
        // Full Body, or fully manual - genuine mix and match, not locked to
        // one split's category set.
        : ['push','pull','legs','upper','lower','chestback','shouldersarms','fullbody', ...muscles, 'rest'];
    }

    const isBroSplit = splitType === 'muscle';
    const body = overlay.querySelector('.overlay-scroll');
    body.innerHTML = `
      <div class="small" style="padding:8px 18px 16px 18px; color:var(--slate);">What should each day focus on? Pick "Rest" for days that shouldn't get anything assigned.${isBroSplit ? ' Tap more than one to combine them on the same day (Chest + Triceps, for example).' : ''}</div>
      ${DAY_NAMES.map((d,i) => `
        <div class="field-label">${d.toUpperCase()}</div>
        <div class="chip-row" data-day="${i}">
          ${cats.map(c => `<div class="chip" data-cat="${c}">${SPLIT_CATEGORY_LABELS[c] || cap(c)}</div>`).join('')}
          <div class="chip" data-cat="custom" style="color:var(--flame); border-color:var(--flame);">Custom</div>
        </div>
      `).join('')}
      <button class="save-btn" id="toPreviewBtn" style="margin-top:10px;">Preview Changes</button>
    `;
    body.querySelectorAll('.chip-row[data-day]').forEach(row => {
      row.querySelectorAll('.chip').forEach(chip => {
        chip.onclick = () => {
          if (isBroSplit && chip.dataset.cat !== 'custom' && chip.dataset.cat !== 'rest'){
            // Multi-select: toggle this region on/off, clearing Rest/Custom
            // (which are mutually exclusive with picking real regions).
            row.querySelectorAll('.chip[data-cat="rest"], .chip[data-cat="custom"]').forEach(c => c.classList.remove('active'));
            chip.classList.toggle('active');
            const picked = [...row.querySelectorAll('.chip.active')].map(c => c.dataset.cat);
            dayAssignments[row.dataset.day] = picked.length ? picked : null;
          } else {
            row.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
            chip.classList.add('active');
            dayAssignments[row.dataset.day] = chip.dataset.cat;
          }
        };
      });
    });
    body.querySelector('#toPreviewBtn').onclick = () => withButtonLoading(body.querySelector('#toPreviewBtn'), 'Building preview…', () => renderStep3());
  }

  async function renderStep3(){
    overlay.innerHTML = `<div class="form-header"><button id="closeReorg">✕</button><h1>Preview</h1><div style="width:18px;"></div></div>
      <div class="overlay-scroll" id="reorgPreviewBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Building preview…</div></div>`;
    overlay.querySelector('#closeReorg').onclick = () => overlay.remove();

    const userData = { user: await getCurrentUser() };
    const [allExercises, db] = await Promise.all([
      fetchAllExercisesCompat(userData.user.id),
      loadExerciseDB()
    ]);

    // Build the set of "weekday|exercisename" pairs the user has actually
    // logged sets against. These are protected from the cleanup step later -
    // an automated tidy-up must never silently remove a placement the user
    // has done real work on (this is exactly how a manually-built Sunday
    // session got wiped when Sunday was marked Rest in a reorganize).
    const protectedDayNames = new Set();
    try {
      const useMaster = getUseExerciseMasterFlag();
      const idField = useMaster ? 'exercise_master_id' : 'exercise_id';
      const setsResult = await withTimeout(
        supabaseClient.from('sets').select(`${idField}, logged_at`).eq('user_id', userData.user.id),
        15000
      );
      if (!setsResult.__timeout && !setsResult.error && setsResult.data){
        const nameById = {};
        allExercises.forEach(ex => {
          const key = useMaster ? ex.masterId : ex.id;
          if (key) nameById[key] = ex.name.toLowerCase();
        });
        setsResult.data.forEach(s => {
          const name = nameById[s[idField]];
          if (!name || !s.logged_at) return;
          const d = new Date(s.logged_at + 'T00:00:00');
          const jsDay = d.getDay();
          const weekday = jsDay === 0 ? 6 : jsDay - 1; // app uses Monday-first weekdays
          protectedDayNames.add(weekday + '|' + name);
        });
      }
    } catch(e){
      // If this lookup fails, leave the set empty rather than blocking the
      // whole reorganize - the confirm screen still lists removals explicitly.
      console.error('Could not build protected-set list for reorganize:', e);
    }

    // Group all exercises by distinct name, deriving each name's category once.
    const byName = {};
    allExercises.forEach(ex => {
      const key = ex.name.toLowerCase();
      if (!byName[key]) byName[key] = { name: ex.name, ids: [], masterId: ex.masterId || null };
      byName[key].ids.push(ex.id);
    });
    const namedList = Object.values(byName).map(item => {
      const sample = allExercises.find(e => e.name === item.name);
      const match = matchExercise(item.name, db);
      const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
      const category = deriveSplitCategory(sample, splitType, muscle);
      const mech = classifyMechanic(match);
      const altSignature = computeAltSignature(item.name, muscle, mech ? mech.value : null);
      return { ...item, category, muscle, mechanic: mech ? mech.value : null, altSignature, altGroupId: sample.alt_group_id, push_pull: sample.push_pull, upper_lower: sample.upper_lower };
    });

    const body = overlay.querySelector('#reorgPreviewBody');
    const dayPlans = DAY_NAMES.map((d, i) => {
      const assignedCat = dayAssignments[i];
      const isMulti = Array.isArray(assignedCat);
      const isCustom = assignedCat === 'custom';
      let items = [];
      if (assignedCat && assignedCat !== 'rest' && !isCustom){
        if (isMulti){
          items = namedList.filter(n => assignedCat.includes(n.category));
        } else {
          items = splitType === 'custom'
            ? namedList.filter(n => exerciseMatchesCategory(n, n.muscle, assignedCat))
            : namedList.filter(n => n.category === assignedCat);
        }
      }
      const label = isCustom ? 'Custom'
        : isMulti ? assignedCat.map(c => SPLIT_CATEGORY_LABELS[c] || cap(c)).join(' & ')
        : (assignedCat ? (SPLIT_CATEGORY_LABELS[assignedCat] || cap(assignedCat)) : 'Not Assigned');
      return { day: d, dayIdx: i, catLabel: label, isCustom, items };
    });

    // Alt groups from the OLD structure may not make sense under the NEW
    // split - forcing them to stay together risks pairing exercises that
    // only happened to share a day before, not because they're actually
    // interchangeable under this split. Conservative approach instead: if a
    // group's members would all naturally land on the same day anyway, keep
    // it - it's still coherent. Otherwise clear the grouping entirely rather
    // than guessing, and let Auto-Group Alts rebuild sensible groups for the
    // new day structure afterward.
    const altGroupDays = {}; // altGroupId -> Set of dayIdx its members landed on
    const altGroupAllMembers = {}; // altGroupId -> all member names (whether placed or not)
    namedList.forEach(n => {
      if (!n.altGroupId) return;
      (altGroupAllMembers[n.altGroupId] = altGroupAllMembers[n.altGroupId] || []).push(n.name);
      const home = dayPlans.find(dp => !dp.isCustom && dp.items.some(it => it.name === n.name));
      altGroupDays[n.altGroupId] = altGroupDays[n.altGroupId] || new Set();
      if (home) altGroupDays[n.altGroupId].add(home.dayIdx);
    });
    const altGroupsToClear = new Set();
    Object.entries(altGroupAllMembers).forEach(([groupId, members]) => {
      const days = altGroupDays[groupId] || new Set();
      // Naturally coherent only if every member landed, and all on the same day.
      const staysCoherent = days.size === 1 && members.every(name =>
        dayPlans.some(dp => !dp.isCustom && dp.items.some(it => it.name === name))
      );
      if (!staysCoherent) altGroupsToClear.add(groupId);
    });
    // Custom days start empty - the person picks exactly what goes there from
    // everything available, rather than anything being auto-derived for them.
    const customSelections = {};
    dayPlans.forEach(dp => { if (dp.isCustom) customSelections[dp.dayIdx] = new Set(); });

    // Option D: collapse alt-group siblings into one slot each (only one of
    // them needs doing in a session, not all), then balance whatever's left
    // against a realistic session size instead of pre-including every single
    // matching exercise - which is how a Push day ends up with 39 items.
    const SESSION_TARGET = 12;
    const swapChoices = {}; // "dayIdx|slotIndex" -> chosen name, if swapped from the default representative
    // Tracks how many times each muscle region and each specific exercise
    // signature has been selected across days already processed - lets a
    // custom split with real overlap (Push/Upper both touching chest, for
    // instance) actually balance across the whole week instead of each day
    // being decided in total isolation from every other day.
    const crossDayUsage = { region: {}, name: {} };
    dayPlans.forEach(dp => {
      if (dp.isCustom) return;
      const itemsForCollapse = dp.items.map(it =>
        (it.altGroupId && altGroupsToClear.has(it.altGroupId)) ? { ...it, altGroupId: null } : it
      );
      const allSlots = collapseAltGroups(itemsForCollapse);
      const { included, excluded } = selectBalancedSlots(allSlots, SESSION_TARGET, crossDayUsage);
      dp.slots = included;
      dp.excludedSlots = excluded;
      included.forEach(slot => {
        const rep = slot.representative;
        const region = rep.muscle ? fineMuscleCategory(rep.muscle, rep.name) : 'Other';
        crossDayUsage.region[region] = (crossDayUsage.region[region] || 0) + 1;
        crossDayUsage.name[rep.name.toLowerCase()] = (crossDayUsage.name[rep.name.toLowerCase()] || 0) + 1;
      });
      // For the overflow list: which excluded items look like alts of
      // something already included, using the same signal Auto-Alt uses -
      // this works immediately even with no formal alt-group tags yet.
      const includedBySignature = {};
      included.forEach(slot => {
        if (slot.representative.altSignature) includedBySignature[slot.representative.altSignature] = slot.representative.name;
      });
      dp.excludedSlots.forEach(slot => {
        const sig = slot.representative.altSignature;
        slot.altHintFor = sig ? includedBySignature[sig] || null : null;
      });
    });

    // Weekly balance summary - shown at the top of the preview so imbalances
    // across the whole split are visible, not just per-day.
    const weeklyRegionCounts = {};
    dayPlans.forEach(dp => {
      (dp.slots || []).forEach(slot => {
        const rep = slot.representative;
        const region = rep.muscle ? fineMuscleCategory(rep.muscle, rep.name) : 'Other';
        weeklyRegionCounts[region] = (weeklyRegionCounts[region] || 0) + 1;
      });
    });

    body.innerHTML = `
      <div class="banner" style="margin:8px 18px 16px 18px; background:#251a12; border:1px solid #4a2f16; border-radius:10px; padding:12px 14px; font-size:11.5px; color:#E8A33D; line-height:1.5;">⚠ Nothing changes until you confirm below. Your current layout is saved automatically and can be restored with one tap from Me → Data if this isn't right.${altGroupsToClear.size ? ` ${altGroupsToClear.size} alt group${altGroupsToClear.size===1?'':'s'} would be scattered by this split, so ${altGroupsToClear.size===1?'it':'they'} will be cleared rather than forced together — use Auto-Group Alts afterward to rebuild ones that make sense here.` : ''}</div>
      ${Object.keys(weeklyRegionCounts).length ? `
      <div style="margin:0 18px 16px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px;">
        <div class="ex-name" style="font-size:12px; margin-bottom:8px;">Weekly muscle coverage</div>
        ${Object.entries(weeklyRegionCounts).sort((a,b) => MUSCLE_ANATOMICAL_ORDER.indexOf(a[0]) - MUSCLE_ANATOMICAL_ORDER.indexOf(b[0])).map(([region, count]) => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:3px 0;">
            <span class="small" style="color:var(--slate);">${region}</span>
            <span class="small" style="color:${count <= 1 ? '#E8A33D' : 'var(--slate)'};">${count} session${count===1?'':'s'}${count<=1?' — light coverage':''}</span>
          </div>
        `).join('')}
      </div>` : ''}
      ${dayPlans.map(dp => `
        <div class="day-card" data-day="${dp.dayIdx}" style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden;">
          <div style="padding:10px 14px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line);">
            <div style="font-family:'Bebas Neue',sans-serif; font-size:15px;">${dp.day.toUpperCase()}</div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:9px; padding:3px 8px; border-radius:10px; background:rgba(255,107,26,0.15); color:var(--flame);">${dp.catLabel.toUpperCase()}</div>
          </div>
          ${dp.isCustom ? `
            <div style="padding:8px 14px; font-size:11px; color:var(--slate);">Pick exactly what goes here - starts empty.</div>
            <div class="pick-row custom-picker-toggle" data-day="${dp.dayIdx}" style="cursor:pointer;"><div class="ex-name" style="color:var(--flame); font-size:12.5px;">+ Add Exercises</div></div>
            <div class="custom-selected-list" data-day="${dp.dayIdx}"></div>
          ` : `
            ${dp.slots.length ? `<div style="padding:6px 14px 2px 14px; font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--slate);">${dp.slots.length} exercises for the session${dp.excludedSlots.length ? ` · ${dp.excludedSlots.length} more available below` : ''}</div>` : `<div style="padding:10px 14px; font-size:11px; color:var(--slate);">${dp.catLabel==='Not Assigned'||dp.catLabel==='Rest' ? 'Nothing assigned' : 'No matching exercises found'}</div>`}
            ${dp.slots.map((slot, si) => {
              const chosenName = swapChoices[dp.dayIdx + '|' + si] || slot.representative.name;
              return `<div class="reorg-item" data-day="${dp.dayIdx}" data-name="${chosenName}" style="display:flex; justify-content:space-between; align-items:center; padding:7px 14px; font-size:12px;">
                <span>${chosenName}${slot.swapOptions.length ? ` <span class="reorg-swap" data-day="${dp.dayIdx}" data-slot="${si}" style="color:var(--flame); font-size:10.5px; text-decoration:underline;">↺ ${slot.swapOptions.length} alt${slot.swapOptions.length===1?'':'s'}</span>` : ''}</span>
                <span class="reorg-rm" style="color:var(--slate); font-size:11px;">✕</span>
              </div>`;
            }).join('')}
            ${dp.excludedSlots.length ? `
              <div class="pick-row reorg-show-more" data-day="${dp.dayIdx}" style="cursor:pointer;"><div class="ex-name" style="color:var(--slate); font-size:11.5px;">+ ${dp.excludedSlots.length} more matching exercises</div></div>
              <div class="reorg-excluded-list" data-day="${dp.dayIdx}" style="display:none;">
                ${dp.excludedSlots.map((slot, si) => `<div class="reorg-excluded-item" data-day="${dp.dayIdx}" data-name="${slot.representative.name}" style="display:flex; justify-content:space-between; align-items:center; padding:7px 14px; font-size:12px; color:var(--slate);">
                  <span>${slot.representative.name}${slot.altHintFor ? ` <span style="font-size:10px; color:var(--slate); opacity:0.7; font-style:italic;">(alt for ${slot.altHintFor})</span>` : ''}</span>
                  <span class="reorg-add" style="color:var(--flame); font-size:11px;">+ add</span>
                </div>`).join('')}
              </div>
            ` : ''}
          `}
        </div>
      `).join('')}
      <button class="save-btn" id="confirmReorgBtn" style="margin:0 18px 20px 18px;">Confirm &amp; Apply</button>
    `;

    // Compute and display exactly what would be REMOVED before the user
    // confirms. Without this the confirm screen only ever showed additions,
    // so exercises sitting on a day about to be marked Rest would silently
    // disappear with no warning anywhere in the flow.
    (function renderRemovalPreview(){
      const reorganizedDayIdxsPreview = new Set(dayPlans.filter(dp => !dp.isCustom && dayAssignments[dp.dayIdx]).map(dp => dp.dayIdx));
      const plannedNames = new Set();
      dayPlans.forEach(dp => {
        if (dp.isCustom){
          (customSelections[dp.dayIdx] ? [...customSelections[dp.dayIdx]] : []).forEach(n => plannedNames.add(dp.dayIdx + '|' + n.toLowerCase()));
        } else {
          dp.slots.forEach((slot, si) => {
            const chosenName = swapChoices[dp.dayIdx + '|' + si] || slot.representative.name;
            plannedNames.add(dp.dayIdx + '|' + chosenName.toLowerCase());
          });
        }
      });
      const willRemove = [], willProtect = [];
      allExercises.forEach(ex => {
        if (!reorganizedDayIdxsPreview.has(ex.weekday)) return;
        const key = ex.weekday + '|' + ex.name.toLowerCase();
        if (plannedNames.has(key)) return;
        if (protectedDayNames.has(key)) willProtect.push({ name: ex.name, day: dayNameOf(ex.weekday) });
        else willRemove.push({ name: ex.name, day: dayNameOf(ex.weekday) });
      });
      if (!willRemove.length && !willProtect.length) return;
      const panel = document.createElement('div');
      panel.style = 'margin:0 18px 16px 18px;';
      panel.innerHTML = `
        ${willRemove.length ? `<div style="background:#2a1618; border:1px solid #5c2b2f; border-radius:10px; padding:12px 14px; margin-bottom:${willProtect.length?'10px':'0'};">
          <div class="ex-name" style="font-size:12px; color:#E8492A; margin-bottom:6px;">${willRemove.length} exercise${willRemove.length===1?'':'s'} will be removed from ${willRemove.length===1?'its':'their'} current day</div>
          <div style="max-height:140px; overflow-y:auto;">${willRemove.map(r => `<div class="small" style="color:#E89A93; padding:2px 0;">• ${r.name} <span style="color:var(--slate);">(from ${r.day})</span></div>`).join('')}</div>
          <div class="small" style="color:var(--slate); margin-top:7px; line-height:1.45;">These have no logged sets on that day. The exercise and all its history stay in your library — only the day placement is removed.</div>
        </div>` : ''}
        ${willProtect.length ? `<div style="background:#16210f; border:1px solid #2f4a1d; border-radius:10px; padding:12px 14px;">
          <div class="ex-name" style="font-size:12px; color:var(--good); margin-bottom:6px;">${willProtect.length} exercise${willProtect.length===1?'':'s'} kept — you've logged sets on ${willProtect.length===1?'it':'them'}</div>
          <div style="max-height:120px; overflow-y:auto;">${willProtect.map(r => `<div class="small" style="color:#A8D492; padding:2px 0;">• ${r.name} <span style="color:var(--slate);">(on ${r.day})</span></div>`).join('')}</div>
          <div class="small" style="color:var(--slate); margin-top:7px; line-height:1.45;">Real training is never removed automatically. Remove ${willProtect.length===1?'it':'them'} manually from Track if you don't want ${willProtect.length===1?'it':'them'} there.</div>
        </div>` : ''}`;
      const confirmBtn = body.querySelector('#confirmReorgBtn');
      confirmBtn.parentNode.insertBefore(panel, confirmBtn);
    })();

    // Removing a shown item means it stays where it is - tracked via a simple
    // exclusion set, pre-populated with anything the balancing step left out
    // by default so the confirm step has one consistent source of truth.
    const excluded = new Set();
    dayPlans.forEach(dp => {
      if (dp.isCustom || !dp.excludedSlots) return;
      dp.excludedSlots.forEach(slot => excluded.add(dp.dayIdx + '|' + slot.representative.name));
    });
    body.querySelectorAll('.reorg-item').forEach(row => {
      row.querySelector('.reorg-rm').onclick = () => {
        excluded.add(row.dataset.day + '|' + row.dataset.name);
        row.style.opacity = '0.3'; row.style.textDecoration = 'line-through';
      };
    });
    body.querySelectorAll('.reorg-show-more').forEach(toggle => {
      toggle.onclick = () => {
        const list = body.querySelector(`.reorg-excluded-list[data-day="${toggle.dataset.day}"]`);
        list.style.display = list.style.display === 'none' ? 'block' : 'none';
      };
    });
    body.querySelectorAll('.reorg-add').forEach(btn => {
      btn.onclick = (e) => {
        const row = e.target.closest('.reorg-excluded-item');
        excluded.delete(row.dataset.day + '|' + row.dataset.name);
        row.style.color = 'var(--chalk)';
        btn.textContent = '✓ included';
        btn.style.color = 'var(--good)';
      };
    });
    body.querySelectorAll('.reorg-swap').forEach(swapBtn => {
      swapBtn.onclick = (e) => {
        e.stopPropagation();
        const dp = dayPlans.find(d => d.dayIdx === parseInt(swapBtn.dataset.day, 10));
        const slot = dp.slots[parseInt(swapBtn.dataset.slot, 10)];
        const options = [slot.representative, ...slot.swapOptions];
        const popover = document.createElement('div');
        popover.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:80; display:flex; align-items:flex-end;';
        popover.innerHTML = `<div style="width:100%; background:var(--panel); border-radius:18px 18px 0 0; padding:20px 18px calc(20px + env(safe-area-inset-bottom, 0px)) 18px;">
          <div class="field-label" style="padding:0 0 8px 0;">Swap This Slot</div>
          ${options.map(o => `<div class="pick-row swap-option" data-name="${o.name}"><div class="ex-name">${o.name}</div></div>`).join('')}
        </div>`;
        document.body.appendChild(popover);
        popover.onclick = (ev) => { if (ev.target === popover) popover.remove(); };
        popover.querySelectorAll('.swap-option').forEach(opt => {
          opt.onclick = () => {
            const key = swapBtn.dataset.day + '|' + swapBtn.dataset.slot;
            const oldName = swapBtn.closest('.reorg-item').dataset.name;
            excluded.delete(dp.dayIdx + '|' + oldName);
            swapChoices[key] = opt.dataset.name;
            const row = swapBtn.closest('.reorg-item');
            row.dataset.name = opt.dataset.name;
            row.querySelector('span').innerHTML = `${opt.dataset.name}${slot.swapOptions.length ? ` <span class="reorg-swap" style="color:var(--flame); font-size:10.5px; text-decoration:underline;">↺ swapped</span>` : ''}`;
            popover.remove();
          };
        });
      };
    });

    function renderCustomList(dayIdx){
      const listArea = body.querySelector(`.custom-selected-list[data-day="${dayIdx}"]`);
      const selected = [...customSelections[dayIdx]];
      listArea.innerHTML = selected.map(name => `<div class="reorg-item" data-day="${dayIdx}" data-name="${name}" style="display:flex; justify-content:space-between; align-items:center; padding:7px 14px; font-size:12px;"><span>${name}</span><span class="custom-rm" data-day="${dayIdx}" data-name="${name}" style="color:var(--slate); font-size:11px;">✕</span></div>`).join('');
      listArea.querySelectorAll('.custom-rm').forEach(btn => {
        btn.onclick = () => { customSelections[btn.dataset.day].delete(btn.dataset.name); renderCustomList(btn.dataset.day); };
      });
    }
    body.querySelectorAll('.custom-picker-toggle').forEach(toggle => {
      toggle.onclick = () => {
        const dayIdx = toggle.dataset.day;
        promptText({
          title: 'Search exercise name to add', placeholder: 'Type a name…',
          onConfirm: (typed) => {
            const found = namedList.find(n => n.name.toLowerCase() === typed.trim().toLowerCase())
              || namedList.find(n => n.name.toLowerCase().includes(typed.trim().toLowerCase()));
            if (found) customSelections[dayIdx].add(found.name);
            else alert('No exercise matching "' + typed + '" found.');
            renderCustomList(dayIdx);
          }
        });
      };
    });

    body.querySelector('#confirmReorgBtn').onclick = async () => { await withButtonLoading(body.querySelector('#confirmReorgBtn'), 'Applying…', async () => { try {
      // Snapshot current weekday assignments before touching anything, so this
      // can be reverted in one tap from Me -> Data. Includes masterId (master
      // schema only) so a revert can RECREATE a link the cleanup step deleted,
      // not just update-by-id a row that may no longer exist by the time
      // Revert is tapped.
      const snapshot = allExercises.map(ex => ({ id: ex.id, weekday: ex.weekday, masterId: ex.masterId }));
      localStorage.setItem('zealift_reorg_snapshot', JSON.stringify({ snapshot, at: new Date().toISOString() }));

      // Full Body is fundamentally different from the other splits: every
      // exercise belongs on every full-body day, not partitioned one-per-day.
      // A single exercise record can only have one weekday, so the first
      // full-body day moves the originals there, and every subsequent
      // full-body day gets real duplicate records instead of silently
      // stealing the same exercise away from the day before it.
      let fullBodyDaysSeen = 0;
      const touchedDayNames = new Set(); // "weekday|name" for every exercise explicitly moved or created this run, ON that specific day - NOT just the name alone, since the same exercise can legitimately be moved to one day while a stale link on a completely different day still needs cleaning up
      const silentFailures = []; // writes that completed with no error but affected zero rows

      for (const dp of dayPlans){
        if (dp.isCustom){
          for (const name of customSelections[dp.dayIdx]){
            const match = namedList.find(n => n.name === name);
            if (!match) continue;
            touchedDayNames.add(dp.dayIdx + '|' + name);
            const clearAlt = match.altGroupId && altGroupsToClear.has(match.altGroupId);
            const moveResults = await moveExerciseToDay(match, dp.dayIdx, clearAlt);
            moveResults.filter(r => !r.ok).forEach(r => silentFailures.push({ name, action: 'move to ' + dp.day, error: r.error }));
          }
          continue;
        }
        const isFullBodyRepeat = splitType === 'fullbody' && dp.slots.length && fullBodyDaysSeen > 0;
        if (splitType === 'fullbody' && dp.slots.length) fullBodyDaysSeen++;

        const allCandidateSlots = [...dp.slots.map((slot, si) => ({ slot, si })), ...dp.excludedSlots.map(slot => ({ slot, si: null }))];
        for (const { slot, si } of allCandidateSlots){
          const resolvedName = si !== null ? (swapChoices[dp.dayIdx + '|' + si] || slot.representative.name) : slot.representative.name;
          if (excluded.has(String(dp.dayIdx) + '|' + resolvedName)) continue;
          const it = namedList.find(n => n.name === resolvedName);
          if (!it) continue;
          touchedDayNames.add(dp.dayIdx + '|' + resolvedName);
          const clearAlt = it.altGroupId && altGroupsToClear.has(it.altGroupId);
          if (isFullBodyRepeat){
            const sample = allExercises.find(e => e.name === it.name);
            if (!sample) continue;
            await createExerciseForToday({
              user_id: userData.user.id, name: sample.name, category: sample.category,
              weekday: dp.dayIdx, alt_group_id: clearAlt ? null : sample.alt_group_id,
              push_pull: sample.push_pull, upper_lower: sample.upper_lower, location_ids: sample.location_ids
            });
          } else {
            const moveResults = await moveExerciseToDay(it, dp.dayIdx, clearAlt);
            moveResults.filter(r => !r.ok).forEach(r => silentFailures.push({ name: resolvedName, action: 'move to ' + dp.day, error: r.error }));
          }
        }
      }

      // Cleanup pass: an exercise sitting on a day that's being reorganized,
      // but that wasn't actually placed there by the new plan (so this exact
      // day+name pair was never touched above), would otherwise be silently
      // stranded on its old weekday - exactly how a repurposed day
      // (Wednesday going from Chest to Legs, say) ends up still showing old
      // chest exercises alongside the new leg ones. Checking the pair (not
      // just the name) matters because the same exercise moving to a new day
      // must not protect its separate, genuinely stale link on the old day.
      // Old structure soft-deactivates; new structure removes just that
      // day's link, since the exercise itself may still be legitimately
      // placed elsewhere.
      const reorganizedDayIdxs = new Set(dayPlans.filter(dp => !dp.isCustom && dayAssignments[dp.dayIdx]).map(dp => dp.dayIdx));
      const cleanedUp = [];
      const cleanupErrors = [];
      for (const ex of allExercises){
        if (!reorganizedDayIdxs.has(ex.weekday)) continue;
        if (touchedDayNames.has(ex.weekday + '|' + ex.name)) continue;
        // NEVER silently remove an exercise the user has actually logged sets
        // against. An automated tidy-up sweeping away real, deliberate work
        // is far worse than leaving a stale placement behind - the user can
        // always remove it manually, but they can't get back a day's worth of
        // logging they didn't know had been unlinked.
        if (protectedDayNames.has(ex.weekday + '|' + ex.name.toLowerCase())) continue;
        try {
          const result = await removeExerciseFromDay(ex);
          if (result.ok) cleanedUp.push({ name: ex.name, fromDay: dayNameOf(ex.weekday) });
          else silentFailures.push({ name: ex.name, action: 'remove from ' + dayNameOf(ex.weekday), error: result.error });
        } catch (e) {
          cleanupErrors.push({ name: ex.name, error: e.message });
        }
      }

      // Sync the day's header label to match its new category - otherwise
      // Track keeps showing the old label (e.g. "Chest & Triceps") even
      // though the actual exercises underneath have genuinely changed.
      // Custom days are skipped since those are hand-picked, not derived.
      // Days the user didn't assign a category to are skipped completely -
      // otherwise their existing label would get silently overwritten with
      // the "Not Assigned" placeholder, wiping any custom label the user
      // had set (via day type edit, previous onboarding, previous reorg).
      for (const dp of dayPlans){
        if (dp.isCustom) continue;
        if (!dayAssignments[dp.dayIdx]) continue; // day wasn't reorganized, leave its label alone
        await supabaseClient.from('day_types').upsert(
          { user_id: userData.user.id, weekday: dp.dayIdx, label: dp.catLabel },
          { onConflict: 'user_id,weekday' }
        );
      }

      overlay.remove();
      state.selectedDay = todayWeekday();
      state.currentTab = 'track';
      renderTrack();

      // Diagnostic summary - shows exactly what happened instead of silently
      // trusting it worked, since that trust has been wrong before.
      setTimeout(() => {
        const report = document.createElement('div');
        report.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:70; display:flex; align-items:center; justify-content:center; padding:20px;';
        report.innerHTML = `
          <div style="background:var(--panel); border-radius:16px; padding:20px; width:100%; max-width:340px; max-height:80vh; overflow-y:auto;">
            <div class="ex-name" style="font-size:14px; margin-bottom:4px;">What Actually Happened</div>
            <div class="small" style="color:var(--slate); margin-bottom:4px;">${touchedDayNames.size} exercise placements moved or created</div>
            <div class="small" style="color:${cleanedUp.length ? 'var(--good)' : 'var(--slate)'}; margin-bottom:${cleanupErrors.length ? '4px' : '12px'};">${cleanedUp.length} stale exercises removed from repurposed days${cleanedUp.length ? ':' : ''}</div>
            ${cleanedUp.length ? `<div style="max-height:150px; overflow-y:auto; margin-bottom:12px;">${cleanedUp.map(c => `<div class="small" style="color:var(--slate); padding:2px 0;">• ${c.name} (was on ${c.fromDay})</div>`).join('')}</div>` : ''}
            ${cleanupErrors.length ? `<div class="small" style="color:#E8492A; margin-bottom:4px;">${cleanupErrors.length} failed to clean up:</div><div style="max-height:120px; overflow-y:auto; margin-bottom:12px;">${cleanupErrors.map(c => `<div class="small" style="color:#E8A33D; padding:2px 0;">• ${c.name}: ${c.error}</div>`).join('')}</div>` : ''}
            ${silentFailures.length ? `<div class="small" style="color:#E8492A; margin-bottom:4px; font-weight:600;">⚠ ${silentFailures.length} writes completed with no error but affected zero rows - this is the actual smoking gun if things still look wrong:</div><div style="max-height:150px; overflow-y:auto; margin-bottom:12px;">${silentFailures.map(f => `<div class="small" style="color:#E8A33D; padding:2px 0;">• ${f.name} - ${f.action}: ${f.error}</div>`).join('')}</div>` : `<div class="small" style="color:var(--good); margin-bottom:12px;">✓ Every write was verified to actually affect a row - no silent failures.</div>`}
            <button id="closeReorgReport" class="save-btn" style="margin-top:8px;">Close</button>
          </div>`;
        document.body.appendChild(report);
        report.querySelector('#closeReorgReport').onclick = () => report.remove();
      }, 100);
    } catch (err) {
      alert(`Something went wrong applying the reorganization: ${err.message}\n\nNothing may have been fully applied - check Track and use Revert Last Reorganization from Me -> Data if anything looks wrong.`);
    } }); };
  }

  renderStep1();
}

async function revertLastReorganization(){
  const raw = localStorage.getItem('zealift_reorg_snapshot');
  if (!raw){ alert('No reorganization to revert.'); return; }
  const { snapshot } = JSON.parse(raw);
  const useMaster = getUseExerciseMasterFlag();
  const table = useMaster ? 'exercise_days' : 'exercises';
  showConfirmDialog(`Restore ${snapshot.length} exercises to their previous days?`, async () => {
    const userData = { user: await getCurrentUser() };
    let recreated = 0, updated = 0, failed = 0;
    for (const item of snapshot){
      const result = await supabaseClient.from(table).update({ weekday: item.weekday }).eq('id', item.id).select();
      if (!result.error && result.data && result.data.length){
        updated++;
        continue;
      }
      // Zero rows matched - the row was DELETED (not just moved) by a
      // cleanup step, e.g. an exercise that was on a day later marked
      // "Rest" during this reorganization. An update can't bring back a
      // deleted row, so recreate the link instead. Only possible on the
      // master schema, where masterId identifies the actual exercise
      // independent of the (now-gone) day-link row.
      if (useMaster && item.masterId && userData && userData.user){
        // Guard against creating a duplicate link if the user already
        // manually re-added this exercise to this day before hitting Revert.
        const existingResult = await supabaseClient.from('exercise_days').select('id').eq('user_id', userData.user.id).eq('exercise_master_id', item.masterId).eq('weekday', item.weekday).limit(1);
        if (!existingResult.error && existingResult.data && existingResult.data.length){
          updated++; // already present - count as restored, nothing to do
          continue;
        }
        const { error: insertError } = await supabaseClient.from('exercise_days').insert({
          user_id: userData.user.id, exercise_master_id: item.masterId, weekday: item.weekday
        });
        if (!insertError) recreated++; else failed++;
      } else {
        failed++;
      }
    }
    localStorage.removeItem('zealift_reorg_snapshot');
    if (state.currentTab === 'track') renderTrack();
    alert(`Reverted. ${updated} restored directly, ${recreated} recreated (had been removed by cleanup)${failed ? `, ${failed} could not be restored` : ''}.`);
  }, { title: 'Revert Reorganization?', confirmLabel: 'Restore' });
}

async function pickAltGroup(container, onPicked){
  container.innerHTML = `<div class="action-row" id="clearAltRow" style="border-color:var(--line);"><div class="ex-name" style="color:var(--slate); font-size:13px;">✕ No Alt Group</div></div><div class="search-bar">🔍 <input id="altSearch" placeholder="Search or create alt group…"></div><div id="altList"></div>`;
  container.querySelector('#clearAltRow').onclick = () => onPicked(null);
  const result = await withTimeout(supabaseClient.from('alt_groups').select('id, name, color'), 15000);
  const groups = result.__timeout || result.error ? [] : (result.data || []);

  function renderAlt(filter){
    const f = (filter || '').toLowerCase();
    const matches = groups.filter(g => g.name.toLowerCase().includes(f));
    let html = matches.map(g => `<div class="group-row" data-id="${g.id}" data-name="${g.name}">
      <div class="group-dot" style="background:${g.color};"></div>
      <div class="ex-name" style="flex:1;">${g.name}</div>
      <span class="alt-rename-btn" data-id="${g.id}" data-name="${g.name}" style="color:var(--slate); font-size:13px; padding:4px 8px;">✎</span>
      <span class="alt-delete-btn" data-id="${g.id}" data-name="${g.name}" style="color:var(--slate); font-size:13px; padding:4px 8px;">🗑</span>
    </div>`).join('');
    if (filter) html += `<div class="action-row" id="createAltRow"><div class="ex-name" style="color:var(--flame);">+ Create "${filter}"</div></div>`;
    container.querySelector('#altList').innerHTML = html || '<div class="empty-state" style="padding:20px;">No groups yet — type a name to create one.</div>';
    container.querySelectorAll('.group-row').forEach(el => {
      el.onclick = (e) => {
        if (e.target.classList.contains('alt-rename-btn') || e.target.classList.contains('alt-delete-btn')) return;
        onPicked({ id: el.dataset.id, name: el.dataset.name });
      };
    });
    container.querySelectorAll('.alt-rename-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        promptText({
          title: 'Rename Alt Group', placeholder: 'Group name', initialValue: btn.dataset.name,
          onConfirm: async (newName) => {
            if (newName === btn.dataset.name) return;
            const { error } = await supabaseClient.from('alt_groups').update({ name: newName }).eq('id', btn.dataset.id);
            if (error){ alert(error.message); return; }
            const g = groups.find(g => g.id === btn.dataset.id);
            if (g) g.name = newName;
            renderAlt(container.querySelector('#altSearch').value);
          }
        });
      };
    });
    container.querySelectorAll('.alt-delete-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        showConfirmDialog(`Exercises in "${btn.dataset.name}" will keep their names but lose the alt-group link.`, async () => {
          const userData = { user: await getCurrentUser() };
          const memberTable = getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises';
          // Clear the reference on every exercise pointing at this group first, so
          // nothing is left referencing a group that no longer exists.
          await supabaseClient.from(memberTable).update({ alt_group_id: null }).eq('user_id', userData.user.id).eq('alt_group_id', btn.dataset.id);
          const { error } = await supabaseClient.from('alt_groups').delete().eq('id', btn.dataset.id);
          if (error){ alert(error.message); return; }
          const idx = groups.findIndex(g => g.id === btn.dataset.id);
          if (idx !== -1) groups.splice(idx, 1);
          renderAlt(container.querySelector('#altSearch').value);
        }, { title: `Delete "${btn.dataset.name}"?`, danger: true, confirmLabel: 'Delete' });
      };
    });
    const createRow = container.querySelector('#createAltRow');
    if (createRow) createRow.onclick = async () => {
      const color = ALT_COLORS[groups.length % ALT_COLORS.length];
      const userData = { user: await getCurrentUser() };
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

// ---------- LOCATIONS ----------
async function loadLocations(){
  const userData = { user: await getCurrentUser() };
  const result = await withTimeout(
    supabaseClient.from('locations').select('id, name, equipment_tags, is_default').eq('user_id', userData.user.id).order('name'),
    15000
  );
  let locations;
  let isDefaultColumnMissing = false;
  if (!result.__timeout && !result.error){
    locations = result.data || [];
  } else {
    // equipment_tags/is_default columns may not exist yet if the migration
    // hasn't been run - retry without them rather than silently losing
    // every location. Flag it though: without is_default, the DB-backed
    // self-heal below can never restore a cleared default location, so the
    // "defaults to my gym each day" behaviour silently stops working
    // permanently once localStorage is cleared (a known iOS PWA issue).
    // Surfacing this beats letting it fail invisibly forever.
    isDefaultColumnMissing = !result.__timeout && !!result.error;
    const fallback = await withTimeout(
      supabaseClient.from('locations').select('id, name').eq('user_id', userData.user.id).order('name'),
      15000
    );
    locations = fallback.__timeout || fallback.error ? [] : (fallback.data || []).map(l => ({ ...l, equipment_tags: [], is_default: false }));
  }
  state.locationDefaultColumnMissing = isDefaultColumnMissing;
  // Self-heal: if localStorage's default location got cleared (a known iOS
  // PWA issue) but the database still has one marked, restore it here -
  // this runs every time Track loads, so it recovers on the very next load.
  if (!getDefaultLocationId()){
    const dbDefault = locations.find(l => l.is_default);
    if (dbDefault) localStorage.setItem('zealift_default_location', dbDefault.id);
  }
  // Second self-heal: if localStorage's default OR current location ID points
  // to a location that no longer exists (deleted via UI, SQL, or another
  // device), CLEAR that stale reference. Otherwise every exercise on Track
  // that has any location_ids gets filtered out since the current-location
  // ID doesn't match any of the exercise's remaining ones - Track looks
  // empty even though the data is fine. Only clear when the actual list
  // was successfully loaded, so a transient query failure doesn't wipe
  // valid references.
  if (locations.length || (result.data !== null && result.data !== undefined)){
    const knownIds = new Set(locations.map(l => l.id));
    const currentDefault = getDefaultLocationId();
    if (currentDefault && !knownIds.has(currentDefault)){
      localStorage.removeItem('zealift_default_location');
    }
    const currentRaw = localStorage.getItem('zealift_current_location');
    if (currentRaw){
      try {
        const parsed = JSON.parse(currentRaw);
        if (parsed.id && !knownIds.has(parsed.id)){
          localStorage.removeItem('zealift_current_location');
        }
      } catch(e){ /* legacy value - safe to leave, getCurrentLocationId returns null */ }
    }
  }
  return locations;
}
async function createLocation(name){
  const userData = { user: await getCurrentUser() };
  const result = await withTimeout(
    supabaseClient.from('locations').insert({ user_id: userData.user.id, name }).select(),
    15000
  );
  return result.__timeout || result.error || !result.data ? null : result.data[0];
}

// ---------- NEW EXERCISE FORM ----------
async function openNewExerciseForm(opts){
  let selectedCategory = CATEGORIES[0];
  let selectedDay = state.selectedDay;
  let pickedAltGroup = null;
  let selectedPushPull = null;
  let selectedUpperLower = null;
  // Arriving from My Bands pre-selects Band, so the loop from "I own these
  // bands" to "I have an exercise I can log against them" is one tap.
  let selectedMeasurement = (opts && opts.measurement) || 'weight';
  // Default to wherever you actually are - EXCEPT on Anytime, whose whole
  // point is "not tied to a particular day or place". Auto-tagging its
  // location meant an Anytime exercise created at your default gym silently
  // vanished the moment that default changed (a new home gym, a trip) since
  // isAvailableAtLocation then excluded it everywhere else. Creating on a
  // real weekday still defaults to today's location, since that case really
  // does almost always mean "this exists here".
  const todaysLocation = isAnyDay(selectedDay) ? null : effectiveLocationId();
  let selectedLocationIds = todaysLocation ? [todaysLocation] : [];
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeForm">✕</button><h1>New Exercise</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label">Name</div>
      <div class="field-card"><input class="field-input" id="exNameInput" placeholder="e.g. Incline Dumbbell Press" style="font-size:14px; font-weight:400;"></div>
      <div class="field-label">How is it measured</div>
      <div class="chip-row" id="measurementRow">
        ${MEASUREMENT_TYPES.map(m => `<div class="chip ${m.key===selectedMeasurement?'active':''}" data-mt="${m.key}">${m.label}</div>`).join('')}
      </div>
      <div class="small" id="measurementHint" style="padding:0 18px 8px 18px; color:var(--slate); line-height:1.5;"></div>
      <div id="doorAnchorArea" style="display:none;">
        <div class="toggle-row" id="doorAnchorToggleRow">
          <div style="flex:1;">
            <div class="toggle-row-title">Uses a door anchor</div>
            <div class="toggle-row-sub">A lot of band and tube exercises loop through a door anchor — optional, but worth noting for next time.</div>
          </div>
          <button class="switch off" id="doorAnchorSwitch"></button>
        </div>
        <div id="anchorLevelArea" style="display:none;">
          <div class="field-label">Anchor Height / Level <span class="opt">(optional)</span></div>
          <div class="field-card"><input class="field-input" id="anchorLevelInput" type="text" style="font-size:15px;" placeholder="e.g. Top slot, or Level 3"></div>
        </div>
      </div>
      <div class="field-label">Category</div>
      <div class="chip-row" id="categoryChipRow"><div class="small" style="color:var(--slate); padding:8px 0;">Loading…</div></div>
      <div class="field-label">Day</div>
      <div class="chip-row">${DAY_NAMES.map((d,i) => `<div class="chip ${i===state.selectedDay?'active':''}" data-day="${i}">${d}</div>`).join('')}<div class="chip chip-any ${state.selectedDay===ANY_DAY?'active':''}" data-day="${ANY_DAY}">${ANY_DAY_NAME}</div></div>
      <div class="small" style="padding:0 18px 8px 18px; color:var(--slate); line-height:1.5;">Pick <b style="color:var(--chalk);">ANY</b> for things that aren't tied to a weekday — band work, travel sessions, anything improvised.</div>
      <div class="field-label">Push / Pull <span class="opt">(optional)</span></div>
      <div class="chip-row" id="pushPullRow">
        <div class="chip" data-pp="push">Push</div>
        <div class="chip" data-pp="pull">Pull</div>
      </div>
      <div class="field-label">Upper / Lower <span class="opt">(optional)</span></div>
      <div class="chip-row" id="upperLowerRow">
        <div class="chip" data-ul="upper">Upper</div>
        <div class="chip" data-ul="lower">Lower</div>
      </div>
      <div class="field-label">Locations <span class="opt">(optional, pick any that apply)</span></div>
      <div class="chip-row" id="locationChipRow"><div class="small" style="color:var(--slate); padding:8px 0;">Loading…</div></div>
      <div class="small" style="padding:0 18px 8px 18px; color:var(--slate);">Defaults to where you are now. Clear it if it's available everywhere (dumbbells, cables, bodyweight), or pick several if it exists at more than one.</div>
      <div class="field-label">Alt Group <span class="opt">(optional)</span></div>
      <div id="altGroupArea" class="field-card" style="display:block;"><div class="ex-name" style="color:var(--slate); font-size:13px;" id="altGroupPickBtn">Tap to choose or create…</div></div>
      <button class="save-btn" id="saveExerciseBtn">Add Exercise</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeForm').onclick = () => overlay.remove();

  const measurementHintEl = overlay.querySelector('#measurementHint');
  let usesDoorAnchor = false;
  const setMeasurementHint = () => {
    const m = MEASUREMENT_TYPES.find(x => x.key === selectedMeasurement);
    measurementHintEl.textContent = m ? m.hint : '';
    // Door anchor setup is specific to band work - showing it for every
    // measurement type would just be clutter for exercises it never applies to.
    const doorArea = overlay.querySelector('#doorAnchorArea');
    if (doorArea) doorArea.style.display = selectedMeasurement === 'band' ? 'block' : 'none';
  };
  setMeasurementHint();
  overlay.querySelectorAll('#measurementRow .chip').forEach(el => {
    el.onclick = () => {
      selectedMeasurement = el.dataset.mt;
      overlay.querySelectorAll('#measurementRow .chip').forEach(c=>c.classList.remove('active'));
      el.classList.add('active');
      setMeasurementHint();
    };
  });
  const doorAnchorSwitch = overlay.querySelector('#doorAnchorSwitch');
  if (doorAnchorSwitch) doorAnchorSwitch.onclick = () => {
    usesDoorAnchor = !usesDoorAnchor;
    doorAnchorSwitch.classList.toggle('off', !usesDoorAnchor);
    const lvlArea = overlay.querySelector('#anchorLevelArea');
    if (lvlArea) lvlArea.style.display = usesDoorAnchor ? 'block' : 'none';
  };

  overlay.querySelectorAll('#pushPullRow .chip').forEach(el => {
    el.onclick = () => {
      const already = el.classList.contains('active');
      overlay.querySelectorAll('#pushPullRow .chip').forEach(c=>c.classList.remove('active'));
      selectedPushPull = already ? null : el.dataset.pp;
      if (!already) el.classList.add('active');
    };
  });
  overlay.querySelectorAll('#upperLowerRow .chip').forEach(el => {
    el.onclick = () => {
      const already = el.classList.contains('active');
      overlay.querySelectorAll('#upperLowerRow .chip').forEach(c=>c.classList.remove('active'));
      selectedUpperLower = already ? null : el.dataset.ul;
      if (!already) el.classList.add('active');
    };
  });

  async function renderLocationChips(){
    const locs = await loadLocations();
    const row = overlay.querySelector('#locationChipRow');
    row.innerHTML = locs.map(l => `<div class="chip ${selectedLocationIds.includes(l.id)?'active':''}" data-loc="${l.id}">${l.name}</div>`).join('')
      + `<div class="chip" id="newLocationChip" style="color:var(--flame); border-color:var(--flame);">+ New</div>`;
    row.querySelectorAll('.chip[data-loc]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.loc;
        if (selectedLocationIds.includes(id)){ selectedLocationIds = selectedLocationIds.filter(x=>x!==id); el.classList.remove('active'); }
        else { selectedLocationIds.push(id); el.classList.add('active'); }
      };
    });
    row.querySelector('#newLocationChip').onclick = () => {
      promptText({
        title: 'New Location Name', placeholder: 'e.g. Home Gym',
        onConfirm: async (name) => {
          const loc = await createLocation(name);
          if (loc) selectedLocationIds.push(loc.id);
          renderLocationChips();
        }
      });
    };
  }
  await renderLocationChips();

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
    await withButtonLoading(overlay.querySelector('#saveExerciseBtn'), 'Saving…', async () => {
      const userData = { user: await getCurrentUser() };
      const compatEx = await fetchAllExercisesCompat(userData.user.id);
      const existingMatch = compatEx.find(ex => ex.weekday === selectedDay && ex.name.toLowerCase() === name.toLowerCase());
      if (existingMatch){
        alert(`"${name}" already exists on ${dayNameOf(selectedDay)} - opening it instead of creating a duplicate.`);
        overlay.remove();
        state.selectedDay = selectedDay;
        state.currentTab = 'track';
        openLogForm(existingMatch.id, name);
        return;
      }
      const { error } = await createExerciseForToday({
        user_id: userData.user.id, name, category: selectedCategory, weekday: selectedDay,
        alt_group_id: pickedAltGroup ? pickedAltGroup.id : null,
        push_pull: selectedPushPull, upper_lower: selectedUpperLower, location_ids: selectedLocationIds,
        measurement_type: selectedMeasurement === 'weight' ? null : selectedMeasurement,
        uses_door_anchor: usesDoorAnchor,
        door_anchor_level: usesDoorAnchor ? (document.getElementById('anchorLevelInput').value.trim() || null) : null
      });
      if (error){ alert(error.message); return; }
      overlay.remove();
      state.selectedDay = selectedDay;
      state.currentTab = 'track';
      renderTrack();
    });
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
function openLogForm(exerciseId, exerciseName, isNewToDay){
  removeSideIndex();
  let unit = 'kg';
  let weightType = 'total';
  let lastEntry = null;
  // Band exercises swap the weight field for a band picker. Resolved from
  // the exercise already in state where possible so the form doesn't need
  // an extra round trip just to know which shape to render.
  let exInState = (state.exercises || []).find(e => (e.masterId || e.id) === exerciseId);
  let measurementType = measurementTypeOf(exInState);
  let selectedBands = [];
  // Defaults to whatever location is currently active on Track, falling back
  // to the designated default location if Track is in Anywhere mode. Only
  // starts genuinely unassigned if neither is set.
  let selectedLocationId = effectiveLocationId();

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
      <div id="tagInfoArea" style="padding:0 18px; margin-bottom:10px;"></div>
      <div id="guideArea" style="margin-bottom:18px;"></div>
      <div id="sameAsLastArea" style="margin-bottom:18px;"></div>
      <button class="save-btn" id="saveSetBtn" style="margin-bottom:18px;">Save Set</button>
      <div style="height:1px; background:var(--line); margin:0 18px 18px 18px;"></div>
      <div id="bandPickerArea" style="display:none;">
        <div class="field-label">Band <span class="opt">tap two to stack them</span></div>
        <div class="band-pick-row" id="bandPickRow"><div class="small" style="color:var(--slate); padding:8px 18px;">Loading…</div></div>
        <div class="small" id="bandPickHint" style="padding:0 18px 8px 18px; color:var(--slate); line-height:1.5;"></div>
      </div>
      <div id="weightArea">
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
      </div>
      <div class="field-label">Location <span class="opt">(some machines differ by location)</span></div>
      <div class="chip-row" id="setLocationRow" style="flex-wrap:wrap;"><div class="small" style="color:var(--slate); padding:8px 0;">Loading…</div></div>
      <div class="field-label">Sets <span class="opt">(optional)</span></div>
      <div class="field-card"><input class="field-input" id="setsInput" type="number" inputmode="numeric" placeholder="—"></div>
      <div class="field-label">Reps <span class="opt">(optional)</span></div>
      <div class="field-card"><input class="field-input" id="repsInput" type="number" inputmode="numeric" placeholder="—"></div>
      <div class="field-label">Notes <span class="opt">(optional)</span></div>
      <div class="field-card"><input class="field-input" id="notesInput" type="text" placeholder="Anything worth remembering" style="font-size:14px; font-weight:400;"></div>
      <div class="section-label">History</div>
      <div id="chartArea"></div>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; padding:0 18px 6px 18px; font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.5px; color:var(--slate); text-transform:uppercase;">
        <div>Date</div><div style="text-align:center;">Location</div><div style="text-align:right;">Weight</div>
      </div>
      <div id="historyList"><div class="empty-state" style="padding:20px;">Loading…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeLog').onclick = () => {
    overlay.remove();
    if (state.currentTab === 'track') renderTrack();
  };
  if (navPrev) overlay.querySelector('#prevExerciseBtn').onclick = () => { overlay.remove(); openLogForm(navPrev.id, navPrev.name); };
  if (navNext) overlay.querySelector('#nextExerciseBtn').onclick = () => { overlay.remove(); openLogForm(navNext.id, navNext.name); };

  // Band exercises swap the weight field for a band picker.
  function applyBandFormShape(){
    const wArea = overlay.querySelector('#weightArea');
    const bArea = overlay.querySelector('#bandPickerArea');
    if (!wArea || !bArea) return;
    wArea.style.display = 'none';
    bArea.style.display = 'block';
    // A door-anchor reminder, set once at exercise-creation time, saves
    // re-figuring out the setup every time - especially useful weeks later
    // or in an unfamiliar room.
    if (exInState && exInState.uses_door_anchor){
      const existingBanner = overlay.querySelector('#anchorReminderBanner');
      if (!existingBanner){
        const banner = document.createElement('div');
        banner.id = 'anchorReminderBanner';
        banner.className = 'anchor-reminder';
        banner.innerHTML = `<span>🚪 Door anchor${exInState.door_anchor_level ? ` — ${exInState.door_anchor_level}` : ''}</span>`;
        bArea.parentNode.insertBefore(banner, bArea);
      }
    }
    (async () => {
      const bands = await loadBands();
      const row = overlay.querySelector('#bandPickRow');
      const hint = overlay.querySelector('#bandPickHint');
      if (!row) return;
      if (!bands.length){
        row.innerHTML = `<div style="padding:4px 18px 8px 18px; width:100%;"><button class="btn-primary" id="setupBandsBtn" style="width:100%;">Set up your bands first</button></div>`;
        if (hint) hint.textContent = 'Add the bands you own once, then they appear here every time.';
        const b = row.querySelector('#setupBandsBtn');
        if (b) b.onclick = () => { overlay.remove(); openMyBandsScreen(); };
        return;
      }
      const paint = () => {
        row.innerHTML = bands.map(b => {
          const on = selectedBands.some(x => x.id === b.id);
          return `<button class="band-pick ${on?'sel':''}" data-id="${b.id}">
            <span class="band-pick-swatch" style="background:${b.colour};"></span>
            <span class="band-pick-name">${b.label}</span>
            <span class="band-pick-res">${b.resistance != null ? `${b.resistance}${b.resistance_unit||'lb'}` : '—'}</span>
          </button>`;
        }).join('');
        const combined = combinedBandResistance(selectedBands);
        if (hint) hint.innerHTML = selectedBands.length
          ? `Logging <b style="color:var(--chalk);">${selectedBands.map(b=>b.label).join(' + ')}</b>${combined ? ` — ${combined.value}${combined.unit} combined` : ''}.`
          : 'Pick the band you used. Tap two if you doubled up.';
        row.querySelectorAll('.band-pick').forEach(btn => {
          btn.onclick = () => {
            const b = bands.find(x => x.id === btn.dataset.id);
            if (selectedBands.some(x => x.id === b.id)) selectedBands = selectedBands.filter(x => x.id !== b.id);
            else selectedBands.push(b);
            paint();
          };
        });
      };
      paint();
    })();
  }
  if (measurementType === 'band') applyBandFormShape();

  // state is the fast path, but an exercise created seconds ago - or one on a
  // different day than the one being viewed - isn't in it yet. Defaulting
  // those to 'weight' meant a freshly created band exercise opened with a
  // weight field and no band picker at all, which is exactly the case a user
  // hits first. So when state doesn't know, ask the database.
  if (!exInState){
    (async () => {
      const table = getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises';
      const r = await withTimeout(
        supabaseClient.from(table).select('measurement_type, uses_door_anchor, door_anchor_level').eq('id', exerciseId).maybeSingle(), 10000);
      if (r.__timeout || r.error || !r.data) return;
      const resolved = r.data.measurement_type || 'weight';
      // Feed the anchor reminder even though this exercise wasn't in state -
      // applyBandFormShape reads off exInState, so patch in what we just
      // learned rather than duplicating the banner logic here.
      if (r.data.uses_door_anchor) exInState = { uses_door_anchor: true, door_anchor_level: r.data.door_anchor_level };
      if (resolved === measurementType && resolved !== 'band') return;
      measurementType = resolved;
      if (resolved === 'band') applyBandFormShape();
    })();
  }

  overlay.querySelectorAll('.unit-toggle button').forEach(b => {
    b.onclick = () => { overlay.querySelectorAll('.unit-toggle button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); unit = b.dataset.u; };
  });
  overlay.querySelectorAll('.chip[data-wt]').forEach(b => {
    b.onclick = () => { overlay.querySelectorAll('.chip[data-wt]').forEach(x=>x.classList.remove('active')); b.classList.add('active'); weightType = b.dataset.wt; };
  });


  async function saveEntry(weight, unit, weightType, reps, numSets, notes){
    // Wait for the master-flag heal to complete before choosing which ID
    // field to write to. Without this, a set saved during app boot could
    // land under exercise_id when the app is reading via exercise_master_id
    // (or vice versa) - the set exists in the database but is invisible.
    await awaitMasterFlagHealed();
    const userData = { user: await getCurrentUser() };
    const useMaster = getUseExerciseMasterFlag();
    const idField = useMaster ? 'exercise_master_id' : 'exercise_id';
    // Capture prior best BEFORE inserting, for PR detection (weight-based only).
    // Look at every same-name sibling exercise record's sets - otherwise a
    // duplicate row (which we know can exist) would hide real historic best
    // weights, causing PR celebrations to fire on non-actual PRs.
    let priorBest = null;
    if (measurementType === 'band'){
      // Band progression is resistance first, reps as the tiebreak - which
      // is why the printed rating matters: without it, band sets can't be
      // ordered against each other at all.
      const combinedNow = combinedBandResistance(selectedBands);
      if (combinedNow){
        const prev = await withTimeout(
          supabaseClient.from('sets').select('band_resistance, band_resistance_unit, reps')
            .eq(idField, exerciseId).not('band_resistance', 'is', null),
          10000);
        if (!prev.__timeout && !prev.error && prev.data && prev.data.length){
          const best = prev.data.reduce((m, r) => {
            const v = convertWeight(Number(r.band_resistance), r.band_resistance_unit || 'lb', combinedNow.unit);
            if (!m || v > m.res || (v === m.res && (Number(r.reps)||0) > m.reps)) return { res: v, reps: Number(r.reps)||0 };
            return m;
          }, null);
          if (best){
            const repsNow = Number(reps) || 0;
            if (combinedNow.value > best.res || (combinedNow.value === best.res && repsNow > best.reps)){
              celebratePR(exerciseName, combinedNow.value, combinedNow.unit, best.res);
            }
          }
        }
      }
    } else if (weight !== null && (unit === 'kg' || unit === 'lb')){
      const siblingTable = useMaster ? 'exercise_master' : 'exercises';
      const siblingsResult = await withTimeout(
        supabaseClient.from(siblingTable).select('id').eq('user_id', userData.user.id).ilike('name', exerciseName),
        10000
      );
      const siblingIds = (siblingsResult.__timeout || siblingsResult.error || !siblingsResult.data || !siblingsResult.data.length)
        ? [exerciseId]
        : siblingsResult.data.map(r => r.id);
      const prevSets = await withTimeout(
        supabaseClient.from('sets').select('weight, weight_unit').in(idField, siblingIds).in('weight_unit', ['kg','lb']),
        10000
      );
      if (!prevSets.__timeout && !prevSets.error && prevSets.data && prevSets.data.length){
        priorBest = Math.max(...prevSets.data.map(s => convertWeight(s.weight, s.weight_unit, unit)));
      }
    }
    const insertPayload = {
      user_id: userData.user.id,
      weight, weight_unit: weight !== null ? unit : 'bodyweight',
      weight_type: weightType,
      num_sets: numSets, reps: reps,
      notes: notes || null,
      logged_at: todayStr(),
      location_id: selectedLocationId
    };
    // An exercise with no weekday link is being logged off-plan.
    if (isNewToDay && !(state.exercises || []).some(e => (e.masterId || e.id) === exerciseId)){
      insertPayload.off_plan = true;
    }
    if (measurementType === 'band'){
      // Copy the bands' details onto the set rather than only referencing
      // them, so correcting a rating or deleting a band later can never
      // rewrite what this set says it was.
      const combined = combinedBandResistance(selectedBands);
      insertPayload.measurement_type = 'band';
      insertPayload.band_snapshot = buildBandSnapshot(selectedBands);
      insertPayload.band_resistance = combined ? combined.value : null;
      insertPayload.band_resistance_unit = combined ? combined.unit : null;
      // Weight is meaningless for a band set - leave it null rather than
      // writing a number that would pollute weight-based PR and volume maths.
      insertPayload.weight = null;
      insertPayload.weight_unit = 'band';
      insertPayload.weight_type = 'total';
    }
    insertPayload[idField] = exerciseId;
    invalidateTrackSnapshots(); // logged set changes done-flags and header stats
    const { data, error } = await supabaseClient.from('sets').insert(insertPayload).select();
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
    const userData = { user: await getCurrentUser() };
    const useMaster = getUseExerciseMasterFlag();
    const idField = useMaster ? 'exercise_master_id' : 'exercise_id';
    let idsToQuery = [exerciseId];
    // Look up every record for this user sharing this exercise's name and
    // merge all their sets. In the LEGACY schema this is required because
    // each day has its own separate record. In the MASTER schema this is
    // technically supposed to be a no-op (one row per name), but we've
    // proven duplicates can happen (from historical race conditions and
    // the pre-fix multiplier bug) - any sets logged against a duplicate
    // row would otherwise be invisible in the history view. Defensive
    // sibling lookup here catches them regardless of schema.
    const siblingTable = useMaster ? 'exercise_master' : 'exercises';
    const sameNameResult = await withTimeout(
      supabaseClient.from(siblingTable).select('id').eq('user_id', userData.user.id).ilike('name', exerciseName),
      15000
    );
    const allIds = (sameNameResult.__timeout || sameNameResult.error)
      ? [exerciseId]
      : (sameNameResult.data || []).map(r => r.id);
    idsToQuery = allIds.length ? allIds : [exerciseId];

    let result = await withTimeout(
      supabaseClient.from('sets').select('id, weight, weight_unit, weight_type, reps, num_sets, notes, logged_at, location_id, measurement_type, band_snapshot, band_resistance, band_resistance_unit')
        .in(idField, idsToQuery).order('logged_at', { ascending: false }).limit(30),
      15000
    );
    let locationColumnAvailable = true;
    if (!result.__timeout && result.error){
      console.error('History query failed, retrying without location_id:', result.error);
      locationColumnAvailable = false;
      result = await withTimeout(
        supabaseClient.from('sets').select('id, weight, weight_unit, weight_type, reps, num_sets, notes, logged_at')
          .in(idField, idsToQuery).order('logged_at', { ascending: false }).limit(30),
        15000
      );
    }
    const list = overlay.querySelector('#historyList');
    if (result.__timeout || result.error){ list.innerHTML = '<div class="empty-state" style="padding:20px;">Could not load history.</div>'; return; }
    const sets = result.data || [];
    if (sets.length === 0){
      list.innerHTML = '<div class="empty-state" style="padding:20px;">No history yet — this will be your first entry.</div>';
      return;
    }
    // "Same as last time" should reflect the last set AT THIS LOCATION, not
    // some other gym's weights - especially important on machines where the
    // same-named exercise can have very different scales (a pin-loaded stack
    // at one gym vs plate-loaded at another). Falls back to any-location if
    // this exercise hasn't been logged at the current location yet.
    const currentLocation = effectiveLocationId();
    const setAtCurrentLoc = currentLocation && locationColumnAvailable
      ? sets.find(s => s.location_id === currentLocation)
      : null;
    lastEntry = setAtCurrentLoc || sets[0];
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
      supabaseClient.from(getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises').select('category').eq('id', exerciseId).maybeSingle(),
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

    const allLocationsForHistory = locationColumnAvailable ? await loadLocations() : [];
    list.innerHTML = sets.map(s => {
      const locName = locationColumnAvailable && s.location_id
        ? (allLocationsForHistory.find(l => l.id === s.location_id)?.name || '—')
        : '—';
      return `<div class="log-row" data-id="${s.id}" style="flex-direction:column; align-items:flex-start; gap:3px;">
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; align-items:center; width:100%; gap:6px;">
          <div class="log-date">${formatLoggedDate(s.logged_at)}</div>
          <div style="font-size:11px; color:var(--slate); text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📍 ${locName}</div>
          <div class="log-weight" style="text-align:right;">${formatSetValue(s, true)}</div>
        </div>
        ${s.notes ? `<div style="font-size:11px; color:var(--slate); margin-top:2px;"><span style="opacity:0.7;">Notes:</span> <span style="font-style:italic;">${s.notes}</span></div>` : ''}
      </div>`;
    }).join('');
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
  (async () => {
    const [result, allLocations] = await Promise.all([
      withTimeout(
        supabaseClient.from(getUseExerciseMasterFlag() ? 'exercise_master' : 'exercises').select('category, push_pull, upper_lower, location_ids').eq('id', exerciseId).maybeSingle(),
        15000
      ),
      loadLocations()
    ]);
    const data = result.__timeout || result.error || !result.data ? null : result.data;

    // Location chips - rendered before the early-return below so this always
    // populates even if the exercise's own tag-data fetch fails.
    const locRow = overlay.querySelector('#setLocationRow');
    function renderLocRow(){
      locRow.innerHTML = `<div class="chip ${!selectedLocationId?'active':''}" data-loc="">Unassigned</div>`
        + allLocations.map(l => `<div class="chip ${selectedLocationId===l.id?'active':''}" data-loc="${l.id}">${l.name}</div>`).join('')
        + `<div class="chip" id="setLocNewChip" style="color:var(--flame); border-color:var(--flame);">+ New</div>`;
      locRow.querySelectorAll('.chip[data-loc]').forEach(chip => {
        chip.onclick = () => { selectedLocationId = chip.dataset.loc || null; renderLocRow(); };
      });
      locRow.querySelector('#setLocNewChip').onclick = () => {
        promptText({
          title: 'New Location Name', placeholder: 'e.g. Home Gym',
          onConfirm: async (name) => {
            const loc = await createLocation(name);
            allLocations.push(loc);
            if (loc) selectedLocationId = loc.id;
            renderLocRow();
          }
        });
      };
    }
    renderLocRow();

    // This was missing entirely before - push/pull, upper/lower, and locations
    // were being saved and used everywhere else (the reorganizer, the scanner,
    // Track's swap suggestions) but never actually shown when looking at the
    // exercise itself.
    const tagArea = overlay.querySelector('#tagInfoArea');
    if (!data){ tagArea.innerHTML = ''; return; }
    const tags = [];
    if (data.push_pull) tags.push({ label: cap(data.push_pull), color: '#FF6B1A' });
    if (data.upper_lower) tags.push({ label: cap(data.upper_lower), color: '#3A6EA5' });
    const locNames = (data.location_ids || []).map(id => allLocations.find(l => l.id === id)?.name).filter(Boolean);
    locNames.forEach(name => tags.push({ label: name, color: '#8FBF7A' }));
    tagArea.innerHTML = tags.length
      ? tags.map(t => `<span style="display:inline-block; font-size:10.5px; font-weight:600; padding:4px 10px; border-radius:12px; margin:2px 4px 2px 0; background:${t.color}26; color:${t.color};">${t.label}</span>`).join('') + `<span id="tagEditLink" style="display:inline-block; font-size:10.5px; color:var(--slate); margin:2px 0 2px 6px; text-decoration:underline;">edit</span>`
      : `<span class="small" style="color:var(--slate);">No tags set — </span><span id="tagEditLink" style="font-size:10.5px; color:var(--flame); text-decoration:underline;">add Push/Pull, Upper/Lower, or Location</span>`;
    const editLink = tagArea.querySelector('#tagEditLink');
    if (editLink) editLink.onclick = () => openEditTagsForm(exerciseId, exerciseName);
  })();

  async function handleSaveClick(){
    const weightRaw = document.getElementById('weightInput').value;
    const setsVal = document.getElementById('setsInput').value;
    const repsVal = document.getElementById('repsInput').value;
    const notesVal = document.getElementById('notesInput').value.trim();
    if (!weightRaw && !setsVal && !repsVal){
      // Nothing to save - the exercise is already sitting on today's list
      // (added the moment it was picked), so just close cleanly instead of
      // treating this like an error.
      overlay.remove();
      if (state.currentTab === 'track') renderTrack();
      return;
    }
    const weight = weightRaw ? parseFloat(weightRaw) : null;
    const insertedId = await withButtonLoading(overlay.querySelector('#saveSetBtn'), 'Saving…', () =>
      saveEntry(weight, unit, weightType, repsVal ? parseInt(repsVal,10) : null, setsVal ? parseInt(setsVal,10) : null, notesVal)
    );
    if (insertedId){
      overlay.remove();
      if (state.currentTab === 'track') renderTrack();
    }
  }
  overlay.querySelector('#saveSetBtn').onclick = handleSaveClick;
  // Button label reflects what tapping it will actually do - "Add to [Day]"
  // only when this exercise is genuinely new to today (nothing entered yet
  // means it just confirms the add), "Save Set" the moment any value is
  // entered, or always for an exercise that was already on the list.
  function updateSaveBtnLabel(){
    const btn = overlay.querySelector('#saveSetBtn');
    const hasValue = document.getElementById('weightInput').value || document.getElementById('setsInput').value || document.getElementById('repsInput').value;
    btn.textContent = (hasValue || !isNewToDay) ? 'Save Set' : `Add to ${dayNameOf(state.selectedDay)}`;
  }
  ['weightInput', 'setsInput', 'repsInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateSaveBtnLabel);
  });
  updateSaveBtnLabel();
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

// How an exercise is measured. Null in the database means 'weight', so every
// exercise that existed before this feature keeps working untouched.
const MEASUREMENT_TYPES = [
  { key:'weight',     label:'Weight',     hint:'Weight × reps. Barbell, dumbbell, machine, cable.' },
  { key:'band',       label:'Band',       hint:'Which band × reps. Resistance is a level, not a fixed number.' },
  { key:'bodyweight', label:'Bodyweight', hint:'Reps only. Push-ups, pull-ups, dips.' },
  { key:'time',       label:'Time',       hint:'Seconds held. Planks, dead hangs, carries.' },
  { key:'distance',   label:'Distance',   hint:'Steps or metres. Walking lunges, sled push, farmer carries.' }
];
function measurementTypeOf(ex){ return (ex && ex.measurement_type) || 'weight'; }

// ---------- BANDS ----------
// Resistance bands are equipment the user owns, not a mode. They live in
// Me -> Equipment and can be used on any day, at any location, exactly like
// dumbbells.
const BAND_COLOURS = [
  { hex:'#E8C86B', name:'Yellow' }, { hex:'#E8492A', name:'Red' },
  { hex:'#8FBF7A', name:'Green' },  { hex:'#6C8FBF', name:'Blue' },
  { hex:'#3A3B3F', name:'Black' },  { hex:'#B060C0', name:'Purple' },
  { hex:'#E88A3D', name:'Orange' }, { hex:'#A0A4AB', name:'Grey' }
];

async function loadBands(){
  const u = await getCurrentUser();
  if (!u) return [];
  const r = await withTimeout(
    supabaseClient.from('bands').select('*').eq('user_id', u.id).order('sort_order', { ascending: true }),
    15000
  );
  if (r.__timeout || r.error) return [];
  return r.data || [];
}

// Accepts a single figure or a range like "15-35". A range sorts on its
// midpoint, which is the only sensible single number to compare bands by.
function parseResistance(raw){
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range){
    const lo = parseFloat(range[1]), hi = parseFloat(range[2]);
    if (isNaN(lo) || isNaN(hi)) return null;
    return Math.round(((lo + hi) / 2) * 10) / 10;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Copies the bands' details onto the set rather than only referencing them,
// so correcting a rating or deleting a band later never rewrites history.
function buildBandSnapshot(bands){
  return (bands || []).map(b => ({
    id: b.id, label: b.label, colour: b.colour,
    resistance: b.resistance == null ? null : Number(b.resistance),
    resistance_unit: b.resistance_unit || 'lb'
  }));
}
// Combined nominal resistance - summed when bands are stacked, which is how
// doubling up actually behaves. Returns null when none of the bands carry a
// printed figure, in which case ordering falls back to band position.
function combinedBandResistance(bands){
  const withValues = (bands || []).filter(b => b.resistance != null);
  if (!withValues.length) return null;
  const unit = withValues[0].resistance_unit || 'lb';
  const total = withValues.reduce((sum, b) => {
    const v = Number(b.resistance);
    const inUnit = (b.resistance_unit || 'lb') === unit ? v : convertWeight(v, b.resistance_unit || 'lb', unit);
    return sum + inUnit;
  }, 0);
  return { value: Math.round(total * 10) / 10, unit };
}

function formatBandSet(s){
  const snap = s.band_snapshot || [];
  if (!snap.length) return 'Band';
  const names = snap.map(b => b.label).join(' + ');
  const res = s.band_resistance != null ? ` ${s.band_resistance}${s.band_resistance_unit || 'lb'}` : '';
  return `${names}${res}`;
}

async function openMyBandsScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeBands">✕</button><h1>My Bands</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="bandsBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Loading…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeBands').onclick = () => { overlay.remove(); };

  async function render(){
    const bands = await loadBands();
    const body = overlay.querySelector('#bandsBody');
    body.innerHTML = `
      <div class="small" style="padding:6px 18px 12px 18px; color:var(--slate); line-height:1.55;">
        Ordered lightest to heaviest — that order is what tells the app which band is a step up. Add the resistance printed on each one if it has it.
      </div>
      ${bands.length ? bands.map((b, i) => `
        <div class="band-row" data-id="${b.id}">
          <div class="band-swatch" style="background:${b.colour};"></div>
          <div class="band-label">${b.label}</div>
          <div class="band-res">${b.resistance != null ? `${b.resistance} ${b.resistance_unit || 'lb'}` : '—'}</div>
          <button class="band-act" data-act="up" data-id="${b.id}" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="band-act" data-act="down" data-id="${b.id}" ${i === bands.length-1 ? 'disabled' : ''}>▼</button>
          <button class="band-act" data-act="edit" data-id="${b.id}">✎</button>
        </div>`).join('')
        : `<div class="empty-state" style="padding:26px 18px; text-align:center; line-height:1.55;">No bands yet.<br><span class="small" style="color:var(--slate);">Add each band you own so you can log against them.</span></div>`}
      <div style="padding:14px 18px 6px 18px;"><button class="btn-primary" id="addBandBtn" style="width:100%;">+ Add a band</button></div>
      ${bands.length ? `<div style="padding:0 18px 14px 18px;">
        <button class="btn-primary" id="createBandExBtn" style="width:100%; background:var(--panel); color:var(--chalk); border:1px solid var(--line);">Create a band exercise</button>
        <div class="small" style="color:var(--slate); line-height:1.5; padding-top:8px;">Bands are equipment — you still need an exercise to log against. This creates one set to Band, ready to put on a day or on ANY.</div>
      </div>` : ''}`;

    body.querySelector('#addBandBtn').onclick = () => openBandForm(null, bands, render);
    const createBandEx = body.querySelector('#createBandExBtn');
    if (createBandEx) createBandEx.onclick = () => { overlay.remove(); openNewExerciseForm({ measurement: 'band' }); };
    body.querySelectorAll('.band-act').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const band = bands.find(b => b.id === id);
        if (btn.dataset.act === 'edit'){ openBandForm(band, bands, render); return; }
        const idx = bands.findIndex(b => b.id === id);
        const swapWith = btn.dataset.act === 'up' ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= bands.length) return;
        // Swap sort_order with the neighbour. Writing both explicitly keeps
        // the ordering stable rather than relying on implicit index maths.
        const a = bands[idx], b = bands[swapWith];
        await Promise.all([
          supabaseClient.from('bands').update({ sort_order: b.sort_order }).eq('id', a.id),
          supabaseClient.from('bands').update({ sort_order: a.sort_order }).eq('id', b.id)
        ]);
        warmInvalidate('bands');
        render();
      };
    });
  }
  render();
}

function openBandForm(existing, allBands, onDone){
  let colour = existing ? existing.colour : BAND_COLOURS[2].hex;
  let unit = existing ? (existing.resistance_unit || 'lb') : 'lb';
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header">
      <button id="closeBF">✕</button><h1>${existing ? 'Edit Band' : 'Add Band'}</h1>
      ${existing ? `<button id="delBand" style="color:#E8492A; font-size:13px; background:none; border:none;">Delete</button>` : `<div style="width:18px;"></div>`}
    </div>
    <div class="overlay-scroll">
      <div class="field-label">Colour</div>
      <div class="band-colour-row" id="colourRow">
        ${BAND_COLOURS.map(c => `<button class="band-colour ${c.hex===colour?'sel':''}" data-hex="${c.hex}" style="background:${c.hex};" aria-label="${c.name}"></button>`).join('')}
      </div>
      <div class="field-label">Label</div>
      <div class="field-card"><input class="field-input" id="bandLabel" type="text" style="font-size:15px;" placeholder="e.g. Green" value="${existing ? existing.label : ''}"></div>
      <div class="field-label">Resistance <span class="opt">as printed — optional</span></div>
      <div class="field-card">
        <input class="field-input" id="bandRes" type="text" inputmode="decimal" placeholder="30 or 15-35" value="${existing && existing.resistance != null ? existing.resistance : ''}">
        <div class="unit-toggle" id="bandUnit">
          <button class="${unit==='kg'?'active':''}" data-u="kg">kg</button>
          <button class="${unit==='lb'?'active':''}" data-u="lb">lb</button>
        </div>
      </div>
      <div class="small" style="padding:0 18px 8px 18px; color:var(--slate); line-height:1.5;">A range like <b style="color:var(--chalk);">15-35</b> works — it sorts on the midpoint. Leave blank if yours are unmarked and it'll order by position alone.</div>
      <button class="save-btn" id="saveBandBtn">${existing ? 'Save Band' : 'Add Band'}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeBF').onclick = () => overlay.remove();
  overlay.querySelectorAll('.band-colour').forEach(b => {
    b.onclick = () => {
      colour = b.dataset.hex;
      overlay.querySelectorAll('.band-colour').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
    };
  });
  overlay.querySelector('#bandUnit').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      unit = b.dataset.u;
      overlay.querySelectorAll('#bandUnit button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });
  const delBtn = overlay.querySelector('#delBand');
  if (delBtn) delBtn.onclick = () => {
    showConfirmDialog(
      `Delete the ${existing.label} band? Sets you've already logged with it keep their recorded details — nothing in your history changes.`,
      async () => {
        await supabaseClient.from('bands').delete().eq('id', existing.id);
        warmInvalidate('bands');
        overlay.remove();
        onDone && onDone();
      }, { title: 'Delete Band?', danger: true, confirmLabel: 'Delete' });
  };
  overlay.querySelector('#saveBandBtn').onclick = async () => {
    await withButtonLoading(overlay.querySelector('#saveBandBtn'), 'Saving…', async () => {
      const label = document.getElementById('bandLabel').value.trim();
      if (!label){ alert('Give the band a label.'); return; }
      const resistance = parseResistance(document.getElementById('bandRes').value);
      const u = await getCurrentUser();
      if (!u) return;
      if (existing){
        const { error } = await supabaseClient.from('bands')
          .update({ label, colour, resistance, resistance_unit: unit }).eq('id', existing.id);
        if (error){ alert(error.message); return; }
      } else {
        // New bands go to the end; the user reorders from the list.
        const maxOrder = (allBands || []).reduce((m, b) => Math.max(m, b.sort_order || 0), 0);
        const { error } = await supabaseClient.from('bands').insert({
          user_id: u.id, label, colour, resistance, resistance_unit: unit, sort_order: maxOrder + 1
        });
        if (error){ alert(error.message); return; }
      }
      warmInvalidate('bands');
      overlay.remove();
      onDone && onDone();
    });
  };
}

// ---------- SCALE ----------
// goodDirection declares which way each site should move to count as
// progress: waist and hips are fat-storage sites where shrinking is the
// goal, everything else is muscle girth where growing is. Declared once
// here so the body map, trend chart, delta chart and log form all label it
// consistently, rather than each inferring it from its own hardcoded list.
const MEASUREMENT_FIELDS = [
  { key: 'neck', label: 'Neck', group: 'Upper Body', goodDirection: 'up' },
  { key: 'chest', label: 'Chest', group: 'Upper Body', goodDirection: 'up' },
  { key: 'left_arm', label: 'Left Arm', group: 'Upper Body', goodDirection: 'up' },
  { key: 'right_arm', label: 'Right Arm', group: 'Upper Body', goodDirection: 'up' },
  { key: 'waist', label: 'Waist', group: 'Core', goodDirection: 'down' },
  { key: 'hips', label: 'Hips', group: 'Core', goodDirection: 'down' },
  { key: 'left_thigh', label: 'Left Thigh', group: 'Lower Body', goodDirection: 'up' },
  { key: 'right_thigh', label: 'Right Thigh', group: 'Lower Body', goodDirection: 'up' },
  { key: 'left_calf', label: 'Left Calf', group: 'Lower Body', goodDirection: 'up' },
  { key: 'right_calf', label: 'Right Calf', group: 'Lower Body', goodDirection: 'up' },
];
function goodDirectionFor(key){
  const f = MEASUREMENT_FIELDS.find(x => x.key === key);
  return f ? f.goodDirection : 'up';
}
function directionLabel(key){
  return goodDirectionFor(key) === 'down' ? '↓ lower is better' : '↑ higher is better';
}
function isFavourableChange(key, delta){
  if (Math.abs(delta) < 0.2) return null; // effectively unchanged
  return goodDirectionFor(key) === 'down' ? delta < 0 : delta > 0;
}
const MEASUREMENT_GROUPS = ['Upper Body', 'Core', 'Lower Body'];
// Short labels for the history-row pills, so "Left Arm" -> "L Arm" etc. and
// the pill row doesn't wrap onto four lines for someone who fills in all 10.
const MEASUREMENT_SHORT_LABELS = {
  neck: 'Neck', chest: 'Chest', left_arm: 'L Arm', right_arm: 'R Arm',
  waist: 'Waist', hips: 'Hips', left_thigh: 'L Thigh', right_thigh: 'R Thigh',
  left_calf: 'L Calf', right_calf: 'R Calf'
};

async function loadBodyWeight(){
  const result = await withTimeout(
    supabaseClient.from('body_weight').select('id, weight, unit, logged_at, notes, measurement_unit, body_fat_pct, neck, chest, waist, hips, left_arm, right_arm, left_thigh, right_thigh, left_calf, right_calf').order('logged_at', { ascending: false }).limit(20),
    15000
  );
  return result.__timeout || result.error ? [] : (result.data || []);
}

async function renderScale(){
  // Only show a loading screen when there is genuinely nothing to show. If
  // the data is already warm we render straight from it and refresh behind
  // the paint, so switching to this tab is instant rather than costing a
  // round trip every single time.
  const wEntries = warmGet('bodyWeight', loadBodyWeight);
  const wPhase = warmGet('phase', loadPhase);
  if (wEntries.value === undefined || wPhase.value === undefined){
    app.innerHTML = `<div class="app-shell"><div class="login-wrap"><div class="login-sub">Loading your weigh-ins…</div></div></div>`;
  }
  const entries = wEntries.value !== undefined ? wEntries.value : await wEntries.refresh;
  // Repaint once the background refresh lands, but only if it actually
  // changed something - a needless repaint would scroll-jump the page.
  if (wEntries.refresh || wPhase.refresh){
    const beforeEntries = JSON.stringify(entries);
    Promise.all([wEntries.refresh, wPhase.refresh]).then(([freshEntries]) => {
      if (state.currentTab !== 'scale') return;
      if (freshEntries && JSON.stringify(freshEntries) !== beforeEntries) renderScale();
    }).catch(() => {});
  }
  const latest = entries[0];
  const prev = entries[1];
  // Cache the most recent measurement unit used (if any entry has one) so
  // the Log Weigh-In form can default to it without an extra query.
  const lastWithMeasurements = entries.find(e => e.measurement_unit);
  state.lastMeasurementUnit = lastWithMeasurements ? lastWithMeasurements.measurement_unit : null;
  let deltaHtml = '';
  if (latest && prev){
    const diff = (latest.weight - prev.weight).toFixed(1);
    const arrow = diff > 0 ? '↑' : (diff < 0 ? '↓' : '→');
    deltaHtml = `<div class="delta">${arrow} ${Math.abs(diff)}${latest.unit} since last entry</div>`;
  }
  const rows = entries.map(e => {
    const filledMeasurements = MEASUREMENT_FIELDS.filter(f => e[f.key] !== null && e[f.key] !== undefined);
    const bfPill = (e.body_fat_pct != null)
      ? `<div class="measure-pill bf">BF <b>${e.body_fat_pct}%</b></div>` : '';
    const pillsHtml = (filledMeasurements.length || bfPill)
      ? `<div class="measure-pills">${bfPill}${filledMeasurements.map(f => `<div class="measure-pill">${MEASUREMENT_SHORT_LABELS[f.key]} <b>${e[f.key]}${e.measurement_unit || 'cm'}</b></div>`).join('')}</div>`
      : '';
    return `<div class="log-row" data-id="${e.id}" style="flex-direction:column; align-items:flex-start; gap:5px;">
    <div style="display:flex; justify-content:space-between; width:100%;"><div class="log-date">${formatLoggedDate(e.logged_at)}</div><div class="log-weight">${e.weight}${e.unit}</div></div>
    ${e.notes ? `<div style="font-size:11px; color:var(--slate); font-style:italic;">${e.notes}</div>` : ''}
    ${pillsHtml}
  </div>`;
  }).join('');

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

  // Body profile (height/formula) is stored on phase_settings and is the
  // only thing Track needs from it - for the composition bar. Everything
  // else phase-related now lives on the Phase tab.
  const phase = wPhase.value !== undefined ? wPhase.value : await wPhase.refresh;

  // ---- Measurements visual section ----
  // Chronological entries that actually carry tape data. Everything in this
  // block self-suppresses when there isn't enough logged to be meaningful,
  // so a user who only tracks bodyweight never sees empty scaffolding.
  const measuredChrono = [...entries].filter(e => e.measurement_unit).sort((a,b) => a.logged_at.localeCompare(b.logged_at));
  let measurementsHtml = '';
  if (measuredChrono.length >= 2){
    // Only offer a chip for metrics with at least two data points - a chip
    // that opens an un-drawable chart is worse than no chip.
    const available = MEASUREMENT_FIELDS.filter(f => measuredChrono.filter(e => e[f.key] != null).length >= 2);
    if (available.length){
      if (!state.selectedMetric || !available.some(f => f.key === state.selectedMetric)){
        // Default to waist when present - it's the metric that moves most
        // meaningfully during a phase for most people.
        state.selectedMetric = available.some(f => f.key === 'waist') ? 'waist' : available[0].key;
      }
      const sel = available.find(f => f.key === state.selectedMetric);
      const pts = measuredChrono.filter(e => e[sel.key] != null)
        .map(e => ({ date: e.logged_at, value: e[sel.key] }));
      const unit = measuredChrono[measuredChrono.length-1].measurement_unit;
      const first = pts[0].value, last = pts[pts.length-1].value;
      const change = +(last - first).toFixed(1);
      const good = isFavourableChange(sel.key, change);
      const accent = good === null ? '#8C8E94' : (good ? '#8FBF7A' : '#E8A33D');
      measurementsHtml = `
        <div class="section-label" style="padding-top:20px;">Measurements</div>
        <div class="stat-card">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
            <span style="font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--slate);">${sel.label.toUpperCase()} · ${unit.toUpperCase()} <span style="color:#5d5f64;">· ${directionLabel(sel.key)}</span></span>
            <span style="font-family:'JetBrains Mono',monospace; font-size:11px; color:${accent};">${change>=0?'+':''}${change}${unit} overall</span>
          </div>
          ${renderMetricChart(pts, unit, accent)}
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
            ${available.map(f => `<button class="metric-chip ${f.key===state.selectedMetric?'active':''}" data-metric="${f.key}">${MEASUREMENT_SHORT_LABELS[f.key]}</button>`).join('')}
          </div>
        </div>
        ${renderBodyMap(measuredChrono)}
        ${renderMeasurementDeltaChart(measuredChrono)}
        ${(phase && phase.height_cm && phase.bf_formula)
          ? renderCompositionBar(partitionWeightChange(
              measuredChrono.filter(e => e.waist && e.neck)[0],
              measuredChrono.filter(e => e.waist && e.neck).slice(-1)[0],
              phase.height_cm, phase.bf_formula))
          : previewWrap(
              renderCompositionBar(partitionWeightChange(sampleMeasurementEntries()[0], sampleMeasurementEntries().slice(-1)[0], 180, 'male')),
              'See fat vs lean',
              'Add your height and we can estimate how much of your weight change is fat versus muscle — the thing the scale can never tell you.',
              'Add height')}`;
    }
  }
  // Not enough measurement history yet - show what the section becomes once
  // it is populated, using clearly-labelled sample data. A blank section
  // teaches nothing; seeing the body map and charts you unlock is both more
  // informative and more motivating than an empty state ever is.
  if (!measurementsHtml){
    const sample = sampleMeasurementEntries();
    const samplePts = sample.map(e => ({ date: e.logged_at, value: e.waist }));
    const loggedCount = measuredChrono.length;
    const need = loggedCount === 0
      ? 'Log your measurements twice — a couple of weeks apart — to see your own.'
      : 'One more measurement entry and these switch to your own data.';
    measurementsHtml = `
      <div class="section-label" style="padding-top:20px;">Measurements</div>
      ${previewWrap(`<div class="stat-card">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
            <span style="font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--slate);">WAIST · CM <span style="color:#5d5f64;">· ↓ lower is better</span></span>
            <span style="font-family:'JetBrains Mono',monospace; font-size:11px; color:#8FBF7A;">-4.0cm overall</span>
          </div>
          ${renderMetricChart(samplePts, 'cm', '#8FBF7A')}
        </div>`,
        'Track every measurement over time',
        need + ' Tap any body part to chart it.',
        'Log measurements')}
      ${previewWrap(renderBodyMap(sample), 'Your whole body at a glance',
        'Every site you measure gets mapped and colour-coded by whether it moved the way you want.', null)}
      ${previewWrap(renderMeasurementDeltaChart(sample), 'See what moved most',
        'Ranks every measurement by how much it changed, so the biggest wins surface first.', null)}
      ${previewWrap(renderCompositionBar(partitionWeightChange(sample[0], sample[sample.length-1], 180, 'male')),
        'Fat vs lean, estimated',
        'With your height added, waist and neck measurements estimate how much of your change was fat versus muscle.',
        'Add height')}`;
  }


  // ---- Body fat section ----
  // Measured readings and tape-derived estimates are kept as separate series
  // rather than one silently overriding the other. Seeing both is the
  // interesting part: once you know your estimate runs consistently high or
  // low against a real scan, you can trust it between scans.
  let bodyFatHtml = '';
  const bfChrono = [...entries].sort((a,b) => a.logged_at.localeCompare(b.logged_at));
  const measuredPts = bfChrono.filter(e => e.body_fat_pct != null)
    .map(e => ({ date: e.logged_at, value: Math.round(e.body_fat_pct * 10) / 10 }));
  const estimatedPts = (phase && phase.height_cm && phase.bf_formula)
    ? bfChrono.map(e => {
        const est = estimateBodyFatPct(e, phase.height_cm, phase.bf_formula);
        return est == null ? null : { date: e.logged_at, value: est };
      }).filter(Boolean)
    : [];
  const hasBoth = measuredPts.length >= 1 && estimatedPts.length >= 1;

  if (measuredPts.length || estimatedPts.length){
    // Default view: measured when available, since it's the better number.
    const validViews = hasBoth ? ['both','measured','estimated']
      : (measuredPts.length ? ['measured'] : ['estimated']);
    if (!state.bfView || !validViews.includes(state.bfView)) state.bfView = validViews[0];
    const view = state.bfView;

    const primary = measuredPts.length ? measuredPts : estimatedPts;
    const latest = primary[primary.length - 1];
    const overall = primary.length >= 2 ? +(latest.value - primary[0].value).toFixed(1) : null;
    const accent = overall == null ? '#8C8E94' : (overall < 0 ? '#8FBF7A' : (overall > 0 ? '#E8A33D' : '#8C8E94'));

    // Where a date has both a scan and an estimate, the gap between them is
    // the calibration figure - how far off the tape method runs for this
    // specific body. Averaged across every overlapping date.
    let biasNote = '';
    if (hasBoth){
      const estByDate = Object.fromEntries(estimatedPts.map(p => [p.date, p.value]));
      const gaps = measuredPts.filter(p => estByDate[p.date] != null)
        .map(p => estByDate[p.date] - p.value);
      if (gaps.length){
        const avgGap = gaps.reduce((a,b)=>a+b,0) / gaps.length;
        const rounded = Math.round(Math.abs(avgGap) * 10) / 10;
        biasNote = rounded < 0.4
          ? `Your tape estimate tracks your scans closely (within ${rounded}%). You can trust it between scans.`
          : `Your tape estimate reads about <b>${rounded}% ${avgGap > 0 ? 'higher' : 'lower'}</b> than your scans. Knowing that offset makes the estimate useful between scans.`;
      }
    }

    const seriesFor = () => {
      const m = { label:'Measured', color:'#FF6B1A', points: measuredPts, dashed:false };
      const e = { label:'Estimated', color:'#6C8FBF', points: estimatedPts, dashed:true };
      if (view === 'measured') return [m];
      if (view === 'estimated') return [e];
      return [m, e];
    };

    bodyFatHtml = `
      <div class="section-label" style="padding-top:20px;">Body Fat</div>
      <div class="stat-card">
        <div style="display:flex; align-items:baseline; justify-content:space-between;">
          <div>
            <div class="big">${latest.value}%</div>
            <div class="small">${formatLoggedDate(latest.date)} · ${measuredPts.length ? 'measured' : 'estimated from tape'}</div>
          </div>
          ${overall != null ? `<div style="font-family:'JetBrains Mono',monospace; font-size:13px; color:${accent};">${overall>=0?'+':''}${overall}% overall</div>` : ''}
        </div>
        ${hasBoth ? `<div style="display:flex; gap:6px; margin-top:12px;">
          ${validViews.map(v => `<button class="bf-view-chip ${v===view?'active':''}" data-bfview="${v}">${v === 'both' ? 'Both' : v === 'measured' ? 'Measured' : 'Estimated'}</button>`).join('')}
        </div>` : ''}
        <div style="margin-top:10px;">
          ${(view === 'both' ? renderMultiSeriesChart(seriesFor(), '%')
             : (seriesFor()[0].points.length >= 2
                ? renderMetricChart(seriesFor()[0].points, '%', seriesFor()[0].color)
                : `<div style="font-size:11.5px; color:var(--slate); line-height:1.5;">Log body fat on another weigh-in to start a trend.</div>`))}
        </div>
        ${biasNote ? `<div style="font-size:11px; color:var(--slate); line-height:1.55; margin-top:11px; padding-top:11px; border-top:1px solid var(--line);">${biasNote}</div>` : ''}
        ${(!measuredPts.length) ? `<div style="font-size:10.5px; color:#5d5f64; line-height:1.5; margin-top:9px; padding-top:9px; border-top:1px solid var(--line);">Estimated from your waist and neck. A reading from a DEXA scan, InBody or smart scale will be shown alongside it.</div>` : ''}
        ${(measuredPts.length && !estimatedPts.length && !(phase && phase.height_cm)) ? `<div style="font-size:10.5px; color:#5d5f64; line-height:1.5; margin-top:9px; padding-top:9px; border-top:1px solid var(--line);">Add your height and we can also estimate body fat from your tape measurements between scans.</div>` : ''}
      </div>`;
  } else {
    bodyFatHtml = `
      <div class="section-label" style="padding-top:20px;">Body Fat</div>
      ${previewWrap(`<div class="stat-card">
          <div class="big">21.9%</div><div class="small">measured</div>
          <div style="margin-top:10px;">${renderMultiSeriesChart([
            { label:'Measured', color:'#FF6B1A', dashed:false, points: sampleMeasurementEntries().map((e,i) => ({ date:e.logged_at, value:[24.1,23.4,22.8,22.2,21.9][i] })) },
            { label:'Estimated', color:'#6C8FBF', dashed:true, points: sampleMeasurementEntries().map((e,i) => ({ date:e.logged_at, value:[26.0,25.2,24.5,24.0,23.7][i] })) }
          ], '%')}</div>
        </div>`,
        'Track body fat percentage',
        'Log readings from a DEXA scan, InBody or smart scale — and add your height to also estimate it from your tape measurements, so you can compare the two.',
        'Log a reading')}`;
  }

  app.innerHTML = `
    <div class="app-shell">
      <div class="scroll-area">
        ${renderBrandbar()}
        <div class="header"><div class="eyebrow">BODY</div><h1>Track</h1></div>
        <div class="stat-card">
          ${latest ? `<div class="big">${latest.weight}${latest.unit}</div><div class="small">${latest.logged_at}</div>${deltaHtml}` : `<div class="small">No entries yet — tap + to log your weight.</div>`}
        </div>
        ${chartHtml}
        ${bodyFatHtml}
        ${measurementsHtml}
        <div class="section-label">Recent Entries</div>
        ${rows || '<div class="empty-state">Nothing logged yet.</div>'}
      </div>
      ${renderTabbar()}
    </div>`;
  attachShellHandlers();
  document.querySelectorAll('.bf-view-chip').forEach(chip => {
    chip.onclick = () => {
      state.bfView = chip.dataset.bfview;
      const scrollEl = document.querySelector('.scroll-area');
      const y = scrollEl ? scrollEl.scrollTop : 0;
      renderScale().then(() => {
        // Preserve scroll so switching source doesn't jump the page.
        const el = document.querySelector('.scroll-area');
        if (el) el.scrollTop = y;
      });
    };
  });
  document.querySelectorAll('.preview-cta').forEach(btn => {
    btn.onclick = () => {
      // 'Add height' opens the body profile; anything else prompts a weigh-in
      // with the measurements section pre-expanded.
      if (btn.textContent.trim() === 'Add height') openBodyProfileForm(phase);
      else openLogWeightForm(state.lastMeasurementUnit, true);
    };
  });
  document.querySelectorAll('.metric-chip').forEach(chip => {
    chip.onclick = () => {
      state.selectedMetric = chip.dataset.metric;
      const scrollEl = document.querySelector('.scroll-area');
      const y = scrollEl ? scrollEl.scrollTop : 0;
      renderScale().then(() => {
        // Restore scroll so switching metrics doesn't yank the user back to
        // the top of the page on every tap.
        const el = document.querySelector('.scroll-area');
        if (el) el.scrollTop = y;
      });
    };
  });
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

function buildInsightsSectionHtml(insights, tip, knowledge){
  const INSIGHT_ICONS = {
    rate: '<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v6h-6"/>',
    project: '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>',
    strength: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
    tape: '<rect x="2" y="8" width="20" height="8" rx="2"/><path d="M6 12v2M10 12v2M14 12v2M18 12v2"/>',
    cadence: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    body: '<circle cx="12" cy="5" r="3"/><path d="M12 8v8M8 21l4-5 4 5M7 12h10"/>',
    trend: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    plateau: '<path d="M3 12h6l3-6 3 6h6"/><path d="M3 18h18"/>',
    whoosh: '<path d="M12 3v14"/><path d="M6 13l6 6 6-6"/>',
    energy: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    compare: '<path d="M4 20V8M12 20V4M20 20v-7"/>',
    consistency: '<path d="M20 6L9 17l-5-5"/>'
  };
  return (insights.length || tip || knowledge.concept) ? `
    <div class="section-label" style="padding-top:22px;">Insights</div>
    ${insights.map(c => `
      <div class="insight-card ${c.tone}">
        <div class="insight-head">
          <div class="insight-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${INSIGHT_ICONS[c.icon] || ''}</svg></div>
          <div class="insight-title">${c.title}</div>
          ${c.stat ? `<div class="insight-stat">${c.stat}</div>` : ''}
        </div>
        <div class="insight-body">${c.body}</div>
        ${c.action ? `<button class="insight-action" data-action="${c.action}">${c.actionLabel}</button>` : ''}
      </div>`).join('')}
    ${tip ? `<div class="tip-card">
        <div class="tip-eyebrow">Worth knowing</div>
        <div class="tip-title">${tip.title}</div>
        <div class="tip-body">${tip.body}</div>
      </div>` : ''}
    ${knowledge.concept ? `<div class="concept-card">
        <div class="concept-eyebrow">The idea · changes daily</div>
        <div class="concept-title">${knowledge.concept.title}</div>
        <div class="concept-body">${knowledge.concept.body}</div>
      </div>` : ''}
    ${knowledge.line ? `<div class="quote-card">
        <div class="quote-mark">&ldquo;</div>
        <div class="quote-text">${knowledge.line.text}</div>
        <div class="quote-who">— ${knowledge.line.who}</div>
      </div>` : ''}
    ${insights.length ? `<div class="insight-footnote">Worked out from your own weigh-ins and logged sets in this phase. General training guidance — not medical advice.</div>` : ''}
  ` : '';
}

// Sample data used only for the locked previews below. Clearly labelled as
// an example wherever it renders - the point is to show what the feature
// looks like once populated, never to imply it's the user's own data.
function sampleMeasurementEntries(){
  const mk = (daysAgo, waist, arm, chest, thigh, calf, neck, hips, w) => ({
    logged_at: addDaysToDate(todayStr(), daysAgo), weight: w, unit: 'kg', measurement_unit: 'cm',
    waist, left_arm: arm, right_arm: arm, chest, left_thigh: thigh, right_thigh: thigh,
    left_calf: calf, right_calf: calf, neck, hips
  });
  return [
    mk(-56, 95.0, 37.8, 105.0, 62.0, 39.0, 40.0, 103.0, 101.3),
    mk(-42, 94.1, 37.9, 104.7, 61.7, 39.1, 39.9, 102.3, 100.5),
    mk(-28, 92.9, 38.1, 104.5, 61.4, 39.2, 39.8, 101.5, 99.6),
    mk(-14, 91.7, 38.3, 104.2, 61.1, 39.2, 39.7, 100.7, 98.7),
    mk(0,   91.0, 38.5, 104.1, 60.9, 39.3, 39.7, 100.2, 98.2)
  ];
}

function previewWrap(inner, headline, sub, ctaLabel){
  return `<div class="preview-block">
    <div class="preview-art">${inner}</div>
    <div class="preview-overlay">
      <div class="preview-badge">Example</div>
      <div class="preview-headline">${headline}</div>
      <div class="preview-sub">${sub}</div>
      ${ctaLabel ? `<button class="preview-cta" id="previewLogBtn">${ctaLabel}</button>` : ''}
    </div>
  </div>`;
}

// ---------- PHASE TAB ----------
// Promoted out of Track into its own screen. Track had grown to weight +
// chart + measurements + body map + delta chart + composition + phase +
// thirteen insights + knowledge in a single scroll; splitting gives two
// focused screens instead of one unfocused one.
async function renderPhaseTab(){
  // Shares both loaders with Track, so arriving here from that tab (or after
  // the idle prefetch) needs no network at all and shows no loading screen.
  const wEntries = warmGet('bodyWeight', loadBodyWeight);
  const wPhase = warmGet('phase', loadPhase);
  if (wEntries.value === undefined || wPhase.value === undefined){
    app.innerHTML = `<div class="app-shell"><div class="login-wrap"><div class="login-sub">Loading your phase…</div></div></div>`;
  }
  const entries = wEntries.value !== undefined ? wEntries.value : await wEntries.refresh;
  if (wEntries.refresh || wPhase.refresh){
    const beforeEntries = JSON.stringify(entries);
    Promise.all([wEntries.refresh, wPhase.refresh]).then(([freshEntries]) => {
      if (state.currentTab !== 'phase') return;
      if (freshEntries && JSON.stringify(freshEntries) !== beforeEntries) renderPhaseTab();
    }).catch(() => {});
  }
  const lastWithMeasurements = entries.find(e => e.measurement_unit);
  state.lastMeasurementUnit = lastWithMeasurements ? lastWithMeasurements.measurement_unit : null;
  const phase = wPhase.value !== undefined ? wPhase.value : await wPhase.refresh;
  const phaseHtml = await buildPhaseHeroHtml(phase, entries);

  // Sets power the strength-retention insight. Only fetched from the active
  // phase's start onward so this stays a small bounded query.
  let phaseSets = [];
  const activeKindForSets = phase ? determineActivePhase(phase) : null;
  if (activeKindForSets && phase[`${activeKindForSets}_start`]){
    const ud = { user: await getCurrentUser() };
    if (ud && ud.user){
      const r = await withTimeout(
        supabaseClient.from('sets')
          .select('weight, weight_unit, weight_type, reps, num_sets, logged_at')
          .eq('user_id', ud.user.id)
          .gte('logged_at', phase[`${activeKindForSets}_start`]),
        15000
      );
      if (!r.__timeout && !r.error) phaseSets = r.data || [];
    }
  }

  const insights = buildPhaseInsights(phase, entries, phaseSets);
  const tip = buildPhaseTip(phase);
  const knowledge = buildKnowledgeCards(phase);
  const insightsHtml = buildInsightsSectionHtml(insights, tip, knowledge);

  app.innerHTML = `
    <div class="app-shell">
      <div class="scroll-area">
        ${renderBrandbar()}
        <div class="header"><div class="eyebrow">BULK / CUT</div><h1>Phase</h1></div>
        ${phaseHtml}
        ${insightsHtml}
      </div>
      ${renderTabbar()}
    </div>`;
  attachShellHandlers();
  const editPhaseLink = document.getElementById('editPhaseLink');
  if (editPhaseLink) editPhaseLink.onclick = () => openEditPhaseForm(phase);
  const phaseNudgeBtn = document.getElementById('phaseNudgeBtn');
  if (phaseNudgeBtn) phaseNudgeBtn.onclick = () => openEditPhaseForm(phase);
  const pausePhaseBtn = document.getElementById('pausePhaseBtn');
  if (pausePhaseBtn) pausePhaseBtn.onclick = () => {
    showConfirmDialog(
      'Your phase dates freeze while paused - nothing counts against them. When you resume, every date shifts forward by however long you were paused, so you pick up exactly where you left off.',
      async () => { await setPhasePaused(phase, true); renderPhaseTab(); },
      { title: 'Pause Bulk/Cut Cycle?', confirmLabel: 'Pause' }
    );
  };
  const resumePhaseBtn = document.getElementById('resumePhaseBtn');
  if (resumePhaseBtn) resumePhaseBtn.onclick = async () => {
    await withButtonLoading(resumePhaseBtn, 'Resuming…', async () => {
      await setPhasePaused(phase, false);
      renderPhaseTab();
    });
  };
  document.querySelectorAll('.insight-action').forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.action === 'setupBodyProfile') openBodyProfileForm(phase);
    };
  });
}

// Builds the revamped Phase section: a big color-coded hero card for
// whichever phase is currently active (or the nearest relevant state if
// neither is active), a mini preview card for the other phase, and a
// full-cycle timeline bar. weightEntries is the already-loaded body_weight
// list (avoids a second query) used to compute the start->current->change
// stats for the active phase from real weigh-ins during that window.
async function buildPhaseHeroHtml(phase, weightEntries){
  const editLinkHtml = `<div style="padding:0 18px; margin-top:14px; display:flex; gap:18px; align-items:center;"><a class="edit-link" id="editPhaseLink">Edit phase dates</a><a class="edit-link" id="pausePhaseBtn">Pause cycle</a></div>`;
  const editOnlyLinkHtml = `<div style="padding:0 18px; margin-top:14px;"><a class="edit-link" id="editPhaseLink">Edit phase dates</a></div>`;
  const hasBulk = phase && phase.bulk_start && phase.bulk_end;
  const hasCut = phase && phase.cut_start && phase.cut_end;

  if (!hasBulk && !hasCut){
    return `<div class="phase-hero none">
      <div class="icon-circle"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.1-2.8-2.8L7 14.1"/></svg></div>
      <div class="empty-title">No Phase Set</div>
      <div class="empty-sub">Set your bulk and cut dates to track progress against a plan, with weight change pulled automatically from your weigh-ins.</div>
      <button class="btn-primary" id="editPhaseLink" style="width:100%;">Set Bulk / Cut Dates</button>
    </div>`;
  }

  if (isPhasePaused(phase)){
    // Which phase was running when the pause started - computed against the
    // pause date, not today, since the dates are deliberately frozen.
    const pausedOn = phase.paused_at;
    const inRangeAt = (start, end, d) => start && end && d >= start && d <= end;
    const heldKind = inRangeAt(phase.bulk_start, phase.bulk_end, pausedOn) ? 'bulk'
      : inRangeAt(phase.cut_start, phase.cut_end, pausedOn) ? 'cut' : null;
    const days = daysPaused(phase);
    let heldDetail = '';
    if (heldKind){
      const w = weeksBetweenAtDate(phase[`${heldKind}_start`], phase[`${heldKind}_end`], pausedOn);
      heldDetail = `Your ${heldKind === 'bulk' ? 'Bulk' : 'Cut'} is on hold${w ? ` at Week ${w.elapsedWeeks} of ${w.totalWeeks}` : ''}.`;
    } else {
      heldDetail = 'Your cycle is on hold.';
    }
    return `<div class="phase-hero paused">
      <div class="eyebrow-row"><div class="tag">Paused</div><div class="daysleft">${days === 0 ? 'Paused today' : `${days} day${days===1?'':'s'} paused`}</div></div>
      <div class="big-name">On Hold</div>
      <div class="week-of">${heldDetail} Nothing counts against it while paused.</div>
      <div class="paused-note">When you resume, every phase date shifts forward by however long you were paused — so you pick up exactly where you left off, not further along.</div>
      <button class="btn-primary" id="resumePhaseBtn" style="width:100%; margin-top:14px;">Resume Cycle</button>
    </div>` + editOnlyLinkHtml;
  }

  const activePhase = determineActivePhase(phase);
  const findWeightNear = (dateStr, preferBefore) => {
    // Finds the weigh-in closest to a given date, preferring entries on or
    // before it when preferBefore is true (for "start weight") and on or
    // after it otherwise (for "current/latest weight"). Falls back to the
    // closest entry in either direction if no exact-side match exists, so a
    // phase's stats aren't blank just because you didn't weigh in on the
    // exact start date.
    if (!weightEntries.length) return null;
    const sorted = [...weightEntries].sort((a,b) => a.logged_at.localeCompare(b.logged_at));
    if (preferBefore){
      const before = sorted.filter(e => e.logged_at <= dateStr);
      return before.length ? before[before.length - 1] : sorted[0];
    } else {
      const after = sorted.filter(e => e.logged_at <= dateStr);
      return after.length ? after[after.length - 1] : null;
    }
  };

  const renderHeroFor = (kind, start, end) => {
    const w = weeksBetween(start, end);
    const today = todayStr();
    const daysLeft = Math.max(0, Math.round((new Date(end) - new Date(today)) / 86400000));
    const startEntry = findWeightNear(start, true);
    const currentEntry = findWeightNear(today, false) || startEntry;
    let statsHtml = '';
    if (startEntry && currentEntry && startEntry.id !== currentEntry.id){
      const unit = currentEntry.unit;
      const startW = convertWeight(startEntry.weight, startEntry.unit, unit);
      const curW = convertWeight(currentEntry.weight, currentEntry.unit, unit);
      const change = curW - startW;
      // "Positive" (on-track) direction differs by phase: gaining is the
      // goal in a bulk, losing is the goal in a cut. Color reflects that,
      // not just whether the number went up or down.
      const isOnTrack = kind === 'bulk' ? change >= 0 : change <= 0;
      statsHtml = `<div class="phase-stats-row">
        <div class="phase-stat"><div class="label">Start Weight</div><div class="value">${fmtNum(startW)}${unit}</div></div>
        <div class="phase-stat"><div class="label">Current</div><div class="value">${fmtNum(curW)}${unit}</div></div>
        <div class="phase-stat"><div class="label">Change</div><div class="value ${isOnTrack ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${fmtNum(change)}${unit}</div></div>
      </div>`;
    }
    const repeatBadge = (phase.schedule_mode === 'auto' && phase.auto_repeat) ? `<span class="repeat-badge">↻ Auto-Repeating</span>` : '';
    // Proactive nudge in the final week of a phase - either a friendly heads
    // up (next phase already scheduled) or a call to action (nothing
    // scheduled after this one ends, so the user isn't left with an
    // expired phase and no idea what happened).
    let nudgeHtml = '';
    if (daysLeft <= 7){
      const otherKind = kind === 'bulk' ? 'cut' : 'bulk';
      const otherHasFutureDates = phase[`${otherKind}_start`] && phase[`${otherKind}_start`] >= end;
      if (otherHasFutureDates){
        nudgeHtml = `<div class="ending-soon-nudge">
          <div class="txt">Your ${kind === 'bulk' ? 'Bulk' : 'Cut'} ends in <b>${daysLeft} day${daysLeft===1?'':'s'}</b>. ${otherKind === 'bulk' ? 'Bulk' : 'Cut'} is already scheduled to start right after.</div>
          <button id="phaseNudgeBtn">Review</button>
        </div>`;
      } else {
        nudgeHtml = `<div class="ending-soon-nudge">
          <div class="txt">Your ${kind === 'bulk' ? 'Bulk' : 'Cut'} ends in <b>${daysLeft} day${daysLeft===1?'':'s'}</b>. What's next?</div>
          <button id="phaseNudgeBtn">Schedule</button>
        </div>`;
      }
    }
    return `<div class="phase-hero ${kind}">
      <div class="eyebrow-row"><div class="tag">Active Phase</div><div class="daysleft">${daysLeft} day${daysLeft===1?'':'s'} left</div></div>
      <div class="big-name">${kind === 'bulk' ? 'Bulk' : 'Cut'}${repeatBadge}</div>
      <div class="week-of">${w ? `Week ${w.elapsedWeeks} of ${w.totalWeeks} · ` : ''}${formatLoggedDate(start)} — ${formatLoggedDate(end)}</div>
      ${w ? `<div class="progress-track"><div class="progress-fill" style="width:${w.pct}%;"></div></div><div class="progress-labels"><span>${w.pct}% through</span><span>Week ${w.elapsedWeeks}/${w.totalWeeks}</span></div>` : ''}
      ${statsHtml}
      ${nudgeHtml}
    </div>`;
  };

  const renderMiniFor = (kind, start, end, status) => `<div class="phase-mini ${kind}">
    <div class="left"><div class="dot"></div><div><div class="name">${kind === 'bulk' ? 'Bulk' : 'Cut'}</div><div class="dates">${formatLoggedDate(start)} → ${formatLoggedDate(end)}</div></div></div>
    <div class="status-tag">${status}</div>
  </div>`;

  const renderCycleTimeline = () => {
    if (!hasBulk || !hasCut) return '';
    // Only render the combined cycle bar when both phases are set and form
    // a sensible back-to-back (or overlapping) range - otherwise there's no
    // single meaningful timeline to draw.
    const allDates = [phase.bulk_start, phase.bulk_end, phase.cut_start, phase.cut_end].sort();
    const cycleStart = allDates[0], cycleEnd = allDates[allDates.length - 1];
    const isRepeating = phase.schedule_mode === 'auto' && phase.auto_repeat;
    // When repeating, reserve a third of the bar's width for a hatched
    // "ghost" segment representing future cycles that haven't been
    // concretely computed yet (they get generated lazily by
    // advanceAutoScheduleIfNeeded once the current cycle actually elapses,
    // rather than pre-writing years of dates to the database now).
    const ghostFraction = isRepeating ? 0.35 : 0;
    const realFraction = 1 - ghostFraction;
    const totalSpan = Math.max(1, (new Date(cycleEnd) - new Date(cycleStart)) / 86400000);
    const ghostPct = ghostFraction * 100;
    const today = todayStr();
    const segFor = (kind) => {
      const start = phase[`${kind}_start`], end = phase[`${kind}_end`];
      const pct = Math.max(0, Math.min(100, ((new Date(end) - new Date(start)) / 86400000) / totalSpan * 100 * realFraction));
      const marker = (today >= start && today <= end)
        ? `<div class="cycle-today-marker" style="left:${((new Date(today)-new Date(start))/86400000)/((new Date(end)-new Date(start))/86400000)*100}%;"></div>` : '';
      return `<div class="cycle-seg ${kind}" style="width:${pct}%;">${marker}</div>`;
    };
    // Render segments in real chronological order - whichever phase starts
    // first is drawn first. Previously this was hardcoded bulk-then-cut,
    // which drew the bar backwards relative to its own date labels whenever
    // the cut ran first (as auto-scheduling produces for a mid-cut setup).
    const chronological = phase.bulk_start <= phase.cut_start ? ['bulk','cut'] : ['cut','bulk'];
    return `<div class="section-label" style="padding-top:14px;">Full Cycle</div>
      <div class="cycle-timeline">
        <div class="cycle-track">
          ${chronological.map(segFor).join('')}
          ${isRepeating ? `<div class="cycle-seg ghost" style="width:${ghostPct}%;"></div>` : ''}
        </div>
        <div class="cycle-labels"><span>${formatLoggedDate(cycleStart)}</span><span>${isRepeating ? `Repeating beyond ${formatLoggedDate(cycleEnd)} →` : formatLoggedDate(cycleEnd)}</span></div>
      </div>`;
  };

  // Works out how to present the non-active phase relative to today, rather
  // than assuming a fixed bulk-then-cut order. Auto-scheduling chains
  // whichever phase is currently running into the other one, so when the
  // user sets up mid-cut the bulk legitimately comes AFTER the cut - the
  // old hardcoded "Just Finished / Complete" was wrong in exactly that case.
  const describeOtherPhase = (kind) => {
    const start = phase[`${kind}_start`], end = phase[`${kind}_end`];
    if (!start || !end) return null;
    const today = todayStr();
    if (today > end) return { label: 'Just Finished', status: 'Complete' };
    if (today < start) return { label: 'Up Next', status: 'Scheduled' };
    return { label: 'Also Active', status: 'Overlapping' }; // overlapping ranges - surface rather than mislabel
  };

  // Shows the next few cycles rather than only the immediate next phase, so
  // the user can see where the pattern actually takes them. Projected
  // entries (extrapolated from auto-repeat rather than concretely stored)
  // are visually distinguished so speculative dates never look booked.
  const renderUpNextList = () => {
    const upcoming = projectUpcomingPhases(phase, 3);
    if (!upcoming.length) return '';
    const anyProjected = upcoming.some(u => u.isProjected);
    return `<div class="section-label" style="padding-top:6px; display:flex; align-items:center; justify-content:space-between;">
        <span>Up Next</span>
        ${anyProjected ? `<span style="font-family:'JetBrains Mono',monospace; font-size:9px; color:var(--slate); letter-spacing:0.3px; text-transform:none;">dashed = projected</span>` : ''}
      </div>
      ${upcoming.map((u, i) => {
        const weeks = Math.max(1, Math.round((new Date(u.end) - new Date(u.start)) / (86400000 * 7)));
        const startsIn = Math.round((new Date(u.start) - new Date(todayStr())) / 86400000);
        return `<div class="phase-mini ${u.kind}${u.isProjected ? ' projected' : ''}">
          <div class="left">
            <div class="dot"></div>
            <div>
              <div class="name">${u.kind === 'bulk' ? 'Bulk' : 'Cut'} <span style="font-family:'JetBrains Mono',monospace; font-size:10.5px; color:var(--slate); font-weight:400;">${weeks}wk</span></div>
              <div class="dates">${formatLoggedDate(u.start)} → ${formatLoggedDate(u.end)}</div>
            </div>
          </div>
          <div class="status-tag">${u.isProjected ? 'Projected' : (startsIn <= 0 ? 'Scheduled' : `in ${startsIn}d`)}</div>
        </div>`;
      }).join('')}`;
  };

  if (activePhase === 'bulk' && hasBulk){
    const d = hasCut ? describeOtherPhase('cut') : null;
    const finishedCard = (d && d.label === 'Just Finished')
      ? `<div class="section-label" style="padding-top:6px;">Just Finished</div>${renderMiniFor('cut', phase.cut_start, phase.cut_end, d.status)}` : '';
    return renderHeroFor('bulk', phase.bulk_start, phase.bulk_end)
      + finishedCard + renderUpNextList()
      + renderCycleTimeline() + editLinkHtml;
  }
  if (activePhase === 'cut' && hasCut){
    const d = hasBulk ? describeOtherPhase('bulk') : null;
    const finishedCard = (d && d.label === 'Just Finished')
      ? `<div class="section-label" style="padding-top:6px;">Just Finished</div>${renderMiniFor('bulk', phase.bulk_start, phase.bulk_end, d.status)}` : '';
    return renderHeroFor('cut', phase.cut_start, phase.cut_end)
      + finishedCard + renderUpNextList()
      + renderCycleTimeline() + editLinkHtml;
  }

  // Neither phase is active today - either genuinely between two set
  // phases (gap week), or only one phase has been set and it's not
  // currently running. Explain clearly rather than silently showing both
  // as inactive cards with no context.
  const today = todayStr();
  let gapMessage = null;
  if (hasBulk && hasCut){
    if (today < phase.bulk_start){
      gapMessage = `Your Bulk is scheduled to start ${formatLoggedDate(phase.bulk_start)}.`;
    } else if (today > phase.bulk_end && today < phase.cut_start){
      const daysSince = Math.round((new Date(today) - new Date(phase.bulk_end)) / 86400000);
      gapMessage = `Your Bulk ended ${daysSince} day${daysSince===1?'':'s'} ago. Cut is scheduled to start ${formatLoggedDate(phase.cut_start)}.`;
    } else if (today > phase.cut_end){
      const daysSince = Math.round((new Date(today) - new Date(phase.cut_end)) / 86400000);
      gapMessage = `Your Cut ended ${daysSince} day${daysSince===1?'':'s'} ago.`;
    }
  } else if (hasBulk && today < phase.bulk_start){
    gapMessage = `Your Bulk is scheduled to start ${formatLoggedDate(phase.bulk_start)}.`;
  } else if (hasBulk && today > phase.bulk_end){
    gapMessage = `Your Bulk ended ${formatLoggedDate(phase.bulk_end)}.`;
  } else if (hasCut && today < phase.cut_start){
    gapMessage = `Your Cut is scheduled to start ${formatLoggedDate(phase.cut_start)}.`;
  } else if (hasCut && today > phase.cut_end){
    gapMessage = `Your Cut ended ${formatLoggedDate(phase.cut_end)}.`;
  }

  return `<div class="phase-hero none">
    <div class="icon-circle" style="color:var(--slate);"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></div>
    <div class="empty-title">Between Phases</div>
    <div class="empty-sub">${gapMessage || 'No phase is currently active.'}</div>
    <button class="btn-primary" id="editPhaseLink" style="width:100%; background:var(--panel); color:var(--chalk); border:1px solid var(--line);">Edit Phase Dates</button>
  </div>` + renderCycleTimeline();
}

function openBodyProfileForm(existing){
  let formula = (existing && existing.bf_formula) || 'male';
  // Height is always STORED as cm so every downstream calculation works in
  // one unit; this toggle only affects entry and display.
  let heightUnit = localStorage.getItem('zealift_height_unit') || 'cm';
  const existingCm = existing && existing.height_cm ? Number(existing.height_cm) : null;
  const cmToFtIn = (cm) => {
    const totalIn = cm / 2.54;
    let ft = Math.floor(totalIn / 12);
    let inch = Math.round(totalIn - ft * 12);
    if (inch === 12){ ft += 1; inch = 0; } // rounding can tip 11.6" up to a full foot
    return { ft, inch };
  };
  const startFtIn = existingCm ? cmToFtIn(existingCm) : { ft: '', inch: '' };

  const heightFieldHtml = () => heightUnit === 'cm'
    ? `<div class="field-card">
        <input class="field-input" id="heightCm" type="number" inputmode="decimal" placeholder="0" value="${existingCm ? Math.round(existingCm) : ''}">
        <div style="font-size:13px; color:var(--slate);">cm</div>
      </div>`
    : `<div style="display:flex; gap:8px; margin:0 18px 12px;">
        <div class="field-card" style="flex:1; margin:0;">
          <input class="field-input" id="heightFt" type="number" inputmode="numeric" placeholder="0" value="${startFtIn.ft}">
          <div style="font-size:13px; color:var(--slate);">ft</div>
        </div>
        <div class="field-card" style="flex:1; margin:0;">
          <input class="field-input" id="heightIn" type="number" inputmode="numeric" placeholder="0" value="${startFtIn.inch}">
          <div style="font-size:13px; color:var(--slate);">in</div>
        </div>
      </div>`;

  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeBP">✕</button><h1>Body Profile</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="form-sub" style="margin-top:0;">Used to estimate body composition from your tape measurements. The estimate has a few points of error either way, but that error stays consistent — so the change over time is what's genuinely reliable.</div>
      <div class="field-label" style="display:flex; align-items:center; justify-content:space-between; padding-right:18px;">
        <span>Height</span>
        <div class="unit-toggle" id="heightUnitToggle">
          <button class="${heightUnit==='cm'?'active':''}" data-hu="cm">cm</button>
          <button class="${heightUnit==='ftin'?'active':''}" data-hu="ftin">ft/in</button>
        </div>
      </div>
      <div id="heightFieldWrap">${heightFieldHtml()}</div>
      <div class="field-label">Formula Variant</div>
      <div class="form-sub" style="padding-top:0;">The US Navy method has two forms with different inputs — the second additionally uses your hip measurement.</div>
      <div style="display:flex; gap:8px; margin:0 18px 14px;">
        <button class="bf-formula-btn ${formula==='male'?'active':''}" data-f="male" style="flex:1; border-radius:12px; padding:12px; font-family:'Oswald',sans-serif; font-weight:600; font-size:13px; border:1px solid var(--line);">Waist &amp; Neck</button>
        <button class="bf-formula-btn ${formula==='female'?'active':''}" data-f="female" style="flex:1; border-radius:12px; padding:12px; font-family:'Oswald',sans-serif; font-weight:600; font-size:13px; border:1px solid var(--line);">Waist, Neck &amp; Hip</button>
      </div>
      <button class="save-btn" id="saveBPBtn">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeBP').onclick = () => overlay.remove();

  // Carry whatever is already typed across a unit switch, so toggling
  // doesn't silently wipe a half-entered value.
  const readHeightCm = () => {
    if (heightUnit === 'cm'){
      const v = parseFloat((document.getElementById('heightCm') || {}).value);
      return isNaN(v) ? null : v;
    }
    const ft = parseFloat((document.getElementById('heightFt') || {}).value) || 0;
    const inch = parseFloat((document.getElementById('heightIn') || {}).value) || 0;
    if (!ft && !inch) return null;
    return (ft * 12 + inch) * 2.54;
  };
  overlay.querySelector('#heightUnitToggle').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      const carried = readHeightCm();
      heightUnit = b.dataset.hu;
      localStorage.setItem('zealift_height_unit', heightUnit);
      overlay.querySelectorAll('#heightUnitToggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.getElementById('heightFieldWrap').innerHTML = heightFieldHtml();
      if (carried){
        if (heightUnit === 'cm') document.getElementById('heightCm').value = Math.round(carried);
        else {
          const { ft, inch } = cmToFtIn(carried);
          document.getElementById('heightFt').value = ft;
          document.getElementById('heightIn').value = inch;
        }
      }
    };
  });
  overlay.querySelectorAll('.bf-formula-btn').forEach(b => {
    b.onclick = () => {
      formula = b.dataset.f;
      overlay.querySelectorAll('.bf-formula-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });
  overlay.querySelector('#saveBPBtn').onclick = async () => { await withButtonLoading(overlay.querySelector('#saveBPBtn'), 'Saving…', async () => {
    const h = readHeightCm();
    if (!h || h < 100 || h > 250){
      alert(heightUnit === 'cm' ? 'Enter a height in centimetres.' : 'Enter a height in feet and inches.');
      return;
    }
    const userData = { user: await getCurrentUser() };
    const { error } = await supabaseClient.from('phase_settings')
      .upsert({ user_id: userData.user.id, height_cm: Math.round(h * 10) / 10, bf_formula: formula }, { onConflict: 'user_id' });
    if (error){ alert(error.message); return; }
    overlay.remove();
    renderScale();
  }); };
}

function openBodyProfileFormFromPhase(phase){ openBodyProfileForm(phase); }

function fmtNum(n){
  const rounded = Math.round(n * 10) / 10;
  return rounded.toString();
}

// ---------- Rotating knowledge library ----------
// Concepts are tagged by which phase they're relevant to, so what surfaces
// matches what the user is actually doing. Rotation is deterministic on
// day-of-year rather than random, so the card changes daily but stays
// stable across re-renders within a day instead of flickering on every tap.
const PHASE_CONCEPTS = [
  { tags:['cut'], title:`Adaptive thermogenesis`,
    body:`Your body defends against a deficit by quietly reducing energy spend — less fidgeting, less spontaneous movement, slightly cheaper muscle contractions. This is why a deficit that worked in week two stops working by week eight without you eating a single calorie more. It's not a metabolism "breaking"; it's a moving target.` },
  { tags:['cut'], title:`Why the scale lies after hard training`,
    body:`A demanding session causes muscle damage, and repair pulls water into the tissue. You can finish a heavy week visibly leaner and still weigh more, purely from inflammation and glycogen. This is the single most common reason people abandon a diet that was actually working.` },
  { tags:['cut'], title:`Diet breaks`,
    body:`Planned stretches at maintenance — one to two weeks — partially restore the hormonal and behavioural drift that builds during a long deficit. Total fat loss usually ends up similar or better than an uninterrupted cut, because adherence over the whole period is higher.` },
  { tags:['cut','bulk'], title:`Protein is the one you don't cut`,
    body:`In a deficit, protein is what tells your body to burn fat rather than break down muscle for fuel. In a surplus, it's the raw material for new tissue. It's the one macro worth being stubborn about in either direction.` },
  { tags:['bulk'], title:`Your rate of gain has a ceiling`,
    body:`A beginner might add a kilo of muscle a month. Someone five years in might manage that in six months. Eating past that ceiling doesn't accelerate muscle — the excess simply goes to fat. This is why experienced lifters bulk slower, not faster.` },
  { tags:['bulk'], title:`A surplus is permission, not instruction`,
    body:`Extra calories don't build muscle. Training builds muscle; the surplus just makes it possible. A bulk without progressive overload in the log is, mechanically, just a slow fat gain with extra steps.` },
  { tags:['any'], title:`Progressive overload is the whole game`,
    body:`Nearly every effective programme is a different wrapper around one idea: do slightly more over time. More weight, more reps, more sets, better range, less rest. If nothing in your log is trending up across months, no amount of exercise selection will fix it.` },
  { tags:['any'], title:`Junk volume`,
    body:`Sets taken far from failure with light loads add fatigue without much stimulus. Ten hard sets often beat twenty soft ones — and cost half the recovery. If you're always sore but never stronger, this is usually why.` },
  { tags:['any'], title:`Muscle memory is real`,
    body:`Training adds permanent nuclei to muscle fibres. They survive detraining, so regaining lost size after a layoff is dramatically faster than building it the first time. Time off is far less catastrophic than it feels.` },
  { tags:['any'], title:`Sleep is a training variable`,
    body:`Restricting sleep to around five hours has been shown to shift the composition of weight lost toward lean mass and away from fat — same diet, worse outcome. It's the highest-leverage thing most people ignore entirely.` },
  { tags:['any'], title:`Weekly averages beat daily readings`,
    body:`Bodyweight swings 1–2kg on water, sodium, and gut contents alone — often more than a whole week of real change. A single reading is noise. The average of seven is signal.` },
  { tags:['any'], title:`The minimum effective dose`,
    body:`Meaningful muscle can be maintained on a fraction of the volume it took to build. During busy periods or a hard cut, cutting sets while keeping loads heavy preserves far more than the reverse.` },
  { tags:['any'], title:`Specificity cuts both ways`,
    body:`You adapt to what you actually do. That's why the lift you avoid stays weak, and why "I'll fix my squat with more leg press" rarely works. The fastest route to being better at something is usually doing that thing.` },
  { tags:['cut'], title:`The last few kilos are different`,
    body:`Fat loss gets harder as you get leaner, not easier — hunger signalling rises, energy falls, and the deficit as a share of a now-smaller body gets steeper. Expecting the final stretch to feel like the first is why people quit at 80% done.` },
  { tags:['bulk'], title:`Creatine and the scale jump`,
    body:`Starting creatine typically adds 1–2kg of intramuscular water within a fortnight. It's not fat and it isn't muscle — but it will look like a sudden gain, so it's worth knowing before you blame your diet.` }
];

// Kept deliberately short and attributed. The aim is a line that reframes
// something, not motivational-poster filler.
const TRAINING_LINES = [
  { text:`Everybody wants to be a bodybuilder, but nobody wants to lift heavy weights.`, who:'Ronnie Coleman' },
  { text:`Strength is a skill.`, who:'Pavel Tsatsouline' },
  { text:`The bar doesn't care how you feel.`, who:`Gym adage` },
  { text:`Discipline equals freedom.`, who:'Jocko Willink' },
  { text:`You can't rush a harvest.`, who:'Proverb' },
  { text:`Consistency beats intensity.`, who:'Training adage' }
];

function pickRotating(list){
  if (!list.length) return null;
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  return list[dayOfYear % list.length];
}

function buildKnowledgeCards(phase){
  const kind = phase ? determineActivePhase(phase) : null;
  const relevant = PHASE_CONCEPTS.filter(c => c.tags.includes('any') || (kind && c.tags.includes(kind)));
  const concept = pickRotating(relevant.length ? relevant : PHASE_CONCEPTS);
  const line = pickRotating(TRAINING_LINES);
  return { concept, line };
}

// ---------- Measurement visualisations ----------

// Generic line chart used by the per-measurement trend view. Mirrors the
// body-weight chart's visual language so the whole Track tab reads as one
// coherent thing rather than a collection of differently-styled widgets.
function renderMetricChart(points, unit, accent){
  if (!points || points.length < 2) return '';
  const vals = points.map(p => p.value);
  const dataMin = Math.min(...vals), dataMax = Math.max(...vals);
  const span = (dataMax - dataMin) || 1;
  const yMin = dataMin - span * 0.2, yMax = dataMax + span * 0.2;
  const yRange = (yMax - yMin) || 1;
  const W = 320, H = 140, mL = 34, mR = 10, mT = 12, mB = 22;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const fmt = v => (Math.round(v * 10) / 10).toString();
  const xAt = i => mL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yAt = v => mT + plotH - ((v - yMin) / yRange) * plotH;
  const gridLines = [yMin, (yMin + yMax) / 2, yMax].map(t => {
    const y = yAt(t);
    return `<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W-mR}" y2="${y.toFixed(1)}" stroke="#2B2C2E" stroke-width="1"/>
      <text x="${mL-5}" y="${(y+3).toFixed(1)}" text-anchor="end" font-family="monospace" font-size="9" fill="#8C8E94">${fmt(t)}</text>`;
  }).join('');
  const shortDate = d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; };
  const xIdx = points.length <= 2 ? [0, points.length-1] : [0, Math.floor((points.length-1)/2), points.length-1];
  const xLabels = xIdx.map(i => `<text x="${xAt(i).toFixed(1)}" y="${H-6}" text-anchor="middle" font-family="monospace" font-size="9" fill="#8C8E94">${shortDate(points[i].date)}</text>`).join('');
  const linePts = points.map((p,i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ');
  const areaPts = `${mL},${(mT+plotH).toFixed(1)} ${linePts} ${(W-mR)},${(mT+plotH).toFixed(1)}`;
  const dots = points.map((p,i) => {
    const last = i === points.length-1;
    return `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.value).toFixed(1)}" r="${last?4:2.8}" fill="${last?accent:'#EDEAE2'}" stroke="#1C1D1F" stroke-width="1.5"/>`;
  }).join('');
  const gid = 'mFill' + Math.random().toString(36).slice(2,8);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="auto">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient></defs>
    ${gridLines}
    <polygon points="${areaPts}" fill="url(#${gid})"/>
    <polyline points="${linePts}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${xLabels}
  </svg>`;
}

// Multi-series line chart. Used to plot measured and estimated body fat on
// one set of axes: the y-scale spans every series so the offset between them
// is visible, which independently-scaled charts would hide entirely.
function renderMultiSeriesChart(series, unit){
  const withData = series.filter(s => s.points && s.points.length);
  if (!withData.length) return '';
  const allVals = withData.flatMap(s => s.points.map(p => p.value));
  const allDates = [...new Set(withData.flatMap(s => s.points.map(p => p.date)))].sort();
  if (allDates.length < 2) return '';
  const dataMin = Math.min(...allVals), dataMax = Math.max(...allVals);
  const span = (dataMax - dataMin) || 1;
  const yMin = dataMin - span * 0.2, yMax = dataMax + span * 0.2;
  const yRange = (yMax - yMin) || 1;
  const W = 320, H = 140, mL = 34, mR = 10, mT = 12, mB = 22;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const fmt = v => (Math.round(v * 10) / 10).toString();
  const xAt = d => mL + (allDates.indexOf(d) / (allDates.length - 1)) * plotW;
  const yAt = v => mT + plotH - ((v - yMin) / yRange) * plotH;
  const gridLines = [yMin, (yMin + yMax) / 2, yMax].map(t => {
    const y = yAt(t);
    return `<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W-mR}" y2="${y.toFixed(1)}" stroke="#2B2C2E" stroke-width="1"/>
      <text x="${mL-5}" y="${(y+3).toFixed(1)}" text-anchor="end" font-family="monospace" font-size="9" fill="#8C8E94">${fmt(t)}</text>`;
  }).join('');
  const shortDate = d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; };
  const xIdx = [0, Math.floor((allDates.length-1)/2), allDates.length-1];
  const xLabels = [...new Set(xIdx)].map(i => `<text x="${xAt(allDates[i]).toFixed(1)}" y="${H-6}" text-anchor="middle" font-family="monospace" font-size="9" fill="#8C8E94">${shortDate(allDates[i])}</text>`).join('');
  const paths = withData.map(s => {
    const pts = s.points.map(p => `${xAt(p.date).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ');
    const dots = s.points.map(p => `<circle cx="${xAt(p.date).toFixed(1)}" cy="${yAt(p.value).toFixed(1)}" r="3" fill="${s.color}" stroke="#1C1D1F" stroke-width="1.4"/>`).join('');
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="5 4"' : ''}/>${dots}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="auto">${gridLines}${paths}${xLabels}</svg>
    <div style="display:flex; gap:14px; justify-content:center; margin-top:7px;">
      ${withData.map(s => `<span style="font-size:9.5px; color:var(--slate); display:flex; align-items:center; gap:5px;">
        <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="${s.color}" stroke-width="2.4"${s.dashed ? ' stroke-dasharray="4 3"' : ''}/></svg>${s.label}</span>`).join('')}
    </div>`;
}

// Anatomical body map. Each measured region gets a marker coloured by
// direction of change, so the shape of your progress is readable at a
// glance in a way a column of numbers never is - you can immediately see
// "waist down, arms up" as a picture rather than assembling it mentally.
function renderBodyMap(measuredEntries){
  if (!measuredEntries || measuredEntries.length < 2) return '';
  const a = measuredEntries[0], b = measuredEntries[measuredEntries.length - 1];
  const u = b.measurement_unit || 'cm';
  const delta = k => (a[k] != null && b[k] != null) ? +(b[k] - a[k]).toFixed(1) : null;
  // Regions positioned against the silhouette drawn below. `x,y` is the
  // marker on the body; `lx,ly` is where the callout text sits, kept
  // separate so labels can be spaced apart vertically without moving the
  // anatomical markers off their actual positions.
  const regions = [
    { key:'neck',        label:'Neck',    x:100, y:47,  lx:44,  ly:44,  leftSide:true },
    { key:'chest',       label:'Chest',   x:100, y:74,  lx:158, ly:70,  leftSide:false },
    { key:'left_arm',    label:'L Arm',   x:62,  y:92,  lx:44,  ly:96,  leftSide:true },
    { key:'right_arm',   label:'R Arm',   x:138, y:92,  lx:158, ly:100, leftSide:false },
    { key:'waist',       label:'Waist',   x:100, y:104, lx:44,  ly:126, leftSide:true },
    { key:'hips',        label:'Hips',    x:100, y:126, lx:158, ly:132, leftSide:false },
    { key:'left_thigh',  label:'L Thigh', x:84,  y:166, lx:44,  ly:166, leftSide:true },
    { key:'right_thigh', label:'R Thigh', x:116, y:166, lx:158, ly:172, leftSide:false },
    { key:'left_calf',   label:'L Calf',  x:84,  y:216, lx:44,  ly:212, leftSide:true },
    { key:'right_calf',  label:'R Calf',  x:116, y:216, lx:158, ly:218, leftSide:false }
  ].map(r => ({ ...r, d: delta(r.key) })).filter(r => r.d != null);
  if (!regions.length) return '';
  // Waist/hips shrinking is favourable; limb and chest girth growing is
  // favourable. Colour encodes that rather than raw direction, so green
  // always means "the way you'd want it to go".
  const colourFor = (r) => {
    const good = isFavourableChange(r.key, r.d);
    if (good === null) return '#8C8E94';
    return good ? '#8FBF7A' : '#E8A33D';
  };
  const markers = regions.map(r => {
    const c = colourFor(r);
    const anchor = r.leftSide ? 'end' : 'start';
    const lineEndX = r.lx + (r.leftSide ? 6 : -6);
    return `<path d="M${r.x} ${r.y} L${(r.x + lineEndX) / 2} ${r.y} L${(r.x + lineEndX) / 2} ${r.ly} L${lineEndX} ${r.ly}" fill="none" stroke="${c}" stroke-width="1" stroke-dasharray="2 2" opacity="0.5"/>
      <circle cx="${r.x}" cy="${r.y}" r="3.4" fill="${c}" stroke="#17181A" stroke-width="1.2"/>
      <text x="${r.lx}" y="${r.ly - 2}" text-anchor="${anchor}" font-family="'JetBrains Mono',monospace" font-size="8" fill="#8C8E94">${r.label}</text>
      <text x="${r.lx}" y="${r.ly + 8}" text-anchor="${anchor}" font-family="'JetBrains Mono',monospace" font-size="9.5" font-weight="600" fill="${c}">${r.d >= 0 ? '+' : ''}${r.d.toFixed(1)}${u}</text>`;
  }).join('');
  return `<div class="stat-card" style="padding-bottom:8px;">
    <div style="display:flex; justify-content:space-between; font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--slate); margin-bottom:2px;">
      <span>Body map</span><span>${formatLoggedDate(a.logged_at)} → ${formatLoggedDate(b.logged_at)}</span>
    </div>
    <svg viewBox="-6 8 212 240" width="100%" height="auto" style="max-height:300px;">
      <g fill="none" stroke="#3A3B3F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="100" cy="26" r="13"/>
        <path d="M100 39 L100 50"/>
        <path d="M78 56 Q100 48 122 56 L128 104 Q100 112 72 104 Z"/>
        <path d="M78 58 L60 76 L56 118"/>
        <path d="M122 58 L140 76 L144 118"/>
        <path d="M76 106 L82 150 L80 196 L78 232"/>
        <path d="M124 106 L118 150 L120 196 L122 232"/>
        <path d="M82 150 L118 150"/>
      </g>
      ${markers}
    </svg>
    <div style="border-top:1px solid var(--line); margin-top:4px; padding-top:9px;">
      <div style="display:flex; gap:14px; justify-content:center; margin-bottom:7px;">
        <span style="font-size:9.5px; color:var(--slate);"><span style="color:#8FBF7A;">●</span> moving the right way</span>
        <span style="font-size:9.5px; color:var(--slate);"><span style="color:#E8A33D;">●</span> moving the wrong way</span>
      </div>
      <div style="display:flex; gap:14px; justify-content:center;">
        <span style="font-size:9.5px; color:var(--slate);">Waist &amp; hips: <span style="color:var(--chalk);">↓ lower is better</span></span>
        <span style="font-size:9.5px; color:var(--slate);">Everywhere else: <span style="color:var(--chalk);">↑ higher is better</span></span>
      </div>
    </div>
  </div>`;
}

// Stacked fat/lean composition bar. Shows the two ends of the phase side by
// side so the shift is visible as area, not just as a signed number.
function renderCompositionBar(split){
  if (!split) return '';
  const rowFor = (label, weightVal, bfPct) => {
    const fat = weightVal * bfPct / 100, lean = weightVal - fat;
    const fatPct = (fat / weightVal) * 100;
    return `<div style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; font-family:'JetBrains Mono',monospace; font-size:9.5px; color:var(--slate); margin-bottom:4px;">
        <span>${label}</span><span>${fmtNum(weightVal)}${split.unit} · ${bfPct}% BF</span>
      </div>
      <div style="display:flex; height:22px; border-radius:6px; overflow:hidden; background:var(--ink);">
        <div style="width:${(100-fatPct).toFixed(1)}%; background:linear-gradient(90deg,#8FBF7A,#A8D492); display:flex; align-items:center; padding-left:7px;">
          <span style="font-family:'JetBrains Mono',monospace; font-size:9px; color:#17181A; font-weight:700;">${fmtNum(lean)}</span>
        </div>
        <div style="width:${fatPct.toFixed(1)}%; background:linear-gradient(90deg,#E8A33D,#E8C06B); display:flex; align-items:center; justify-content:flex-end; padding-right:7px;">
          <span style="font-family:'JetBrains Mono',monospace; font-size:9px; color:#17181A; font-weight:700;">${fmtNum(fat)}</span>
        </div>
      </div>
    </div>`;
  };
  const wStart = split.startWeight, wEnd = split.endWeight;
  return `<div class="stat-card">
    <div style="font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--slate); margin-bottom:9px;">Composition shift</div>
    ${rowFor('Phase start', wStart, split.bfStart)}
    ${rowFor('Now', wEnd, split.bfEnd)}
    <div style="display:flex; gap:8px; margin-top:4px;">
      <div style="flex:1; background:var(--ink); border-radius:9px; padding:9px 11px;">
        <div style="font-size:9.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.4px;">Fat</div>
        <div style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:600; color:${split.fatChange<=0?'#8FBF7A':'#E8A33D'};">${split.fatChange>=0?'+':''}${split.fatChange}${split.unit}</div>
      </div>
      <div style="flex:1; background:var(--ink); border-radius:9px; padding:9px 11px;">
        <div style="font-size:9.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.4px;">Lean</div>
        <div style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:600; color:${split.leanChange>=0?'#8FBF7A':'#E8A33D'};">${split.leanChange>=0?'+':''}${split.leanChange}${split.unit}</div>
      </div>
    </div>
    <div style="display:flex; gap:12px; justify-content:center; padding-top:9px;">
      <span style="font-size:9.5px; color:var(--slate);"><span style="color:#8FBF7A;">■</span> lean mass</span>
      <span style="font-size:9.5px; color:var(--slate);"><span style="color:#E8A33D;">■</span> fat mass</span>
    </div>
  </div>`;
}

// Diverging bar chart ranking every measurement by how much it moved.
// Sorted by magnitude so the biggest movers surface first.
function renderMeasurementDeltaChart(measuredEntries){
  if (!measuredEntries || measuredEntries.length < 2) return '';
  const a = measuredEntries[0], b = measuredEntries[measuredEntries.length-1];
  const u = b.measurement_unit || 'cm';
  const rows = MEASUREMENT_FIELDS
    .filter(f => a[f.key] != null && b[f.key] != null)
    .map(f => ({ label: f.label, key: f.key, d: +(b[f.key] - a[f.key]).toFixed(1) }))
    .filter(r => Math.abs(r.d) >= 0.05)
    .sort((x,y) => Math.abs(y.d) - Math.abs(x.d));
  if (rows.length < 2) return '';
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.d)));
  return `<div class="stat-card">
    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;">
      <span style="font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--slate);">Measurement change (${u})</span>
      <span style="font-size:9px; color:#5d5f64;">arrow = better direction</span>
    </div>
    ${rows.map(r => {
      const good = isFavourableChange(r.key, r.d);
      const c = good === null ? '#8C8E94' : (good ? '#8FBF7A' : '#E8A33D');
      const arrow = goodDirectionFor(r.key) === 'down' ? '↓' : '↑';
      const w = (Math.abs(r.d) / maxAbs) * 50;
      return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <div style="width:70px; font-size:10.5px; color:var(--slate); text-align:right; flex-shrink:0;">${r.label} <span style="color:#5d5f64; font-size:9px;" title="${goodDirectionFor(r.key)==='down'?'lower is better':'higher is better'}">${arrow}</span></div>
        <div style="flex:1; display:flex; align-items:center; height:16px; position:relative;">
          <div style="position:absolute; left:50%; top:0; bottom:0; width:1px; background:#2B2C2E;"></div>
          <div style="position:absolute; ${r.d < 0 ? `right:50%;` : `left:50%;`} width:${w.toFixed(1)}%; height:11px; background:${c}; border-radius:3px;"></div>
        </div>
        <div style="width:44px; font-family:'JetBrains Mono',monospace; font-size:10px; color:${c}; flex-shrink:0;">${r.d>=0?'+':''}${r.d.toFixed(1)}</div>
      </div>`;
    }).join('')}
  </div>`;
}

// ---------- Body analytics primitives ----------

// Exponentially-weighted moving average of bodyweight. Daily scale readings
// swing 1-2kg on water, sodium and gut content alone, which is often larger
// than a whole week of real change - so the raw number is close to useless
// day to day. The EMA is the standard fix: it weights recent readings more
// heavily than a flat average while still smoothing the noise, giving a
// "trend weight" that moves only when something real is happening.
function computeTrendWeight(entries, halfLifeDays){
  if (!entries || !entries.length) return null;
  const sorted = [...entries].sort((a,b) => a.logged_at.localeCompare(b.logged_at));
  const unit = sorted[sorted.length - 1].unit;
  const alphaFor = (gapDays) => 1 - Math.pow(0.5, gapDays / (halfLifeDays || 10));
  let trend = convertWeight(sorted[0].weight, sorted[0].unit, unit);
  let prevDate = sorted[0].logged_at;
  const series = [{ logged_at: prevDate, trend }];
  for (let i = 1; i < sorted.length; i++){
    const w = convertWeight(sorted[i].weight, sorted[i].unit, unit);
    const gap = Math.max(1, Math.round((new Date(sorted[i].logged_at) - new Date(prevDate)) / 86400000));
    const a = alphaFor(gap);
    trend = trend + a * (w - trend);
    prevDate = sorted[i].logged_at;
    series.push({ logged_at: prevDate, trend });
  }
  return { current: trend, unit, series, latestScale: convertWeight(sorted[sorted.length-1].weight, sorted[sorted.length-1].unit, unit) };
}

// US Navy circumference method. Returns an estimated body-fat percentage
// from tape measurements plus height. It's an estimate with a few points of
// error either way, but its VALUE is that the error is consistent - so the
// change over time is far more trustworthy than any single reading, which
// is exactly what matters when tracking a phase.
function estimateBodyFatPct(entry, heightCm, formula){
  if (!entry || !heightCm || !formula) return null;
  const u = entry.measurement_unit;
  if (!u) return null;
  const toCm = (v) => v == null ? null : (u === 'in' ? v * 2.54 : v);
  const waist = toCm(entry.waist), neck = toCm(entry.neck), hip = toCm(entry.hips);
  if (!waist || !neck) return null;
  let bf;
  if (formula === 'female'){
    if (!hip) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(heightCm)) - 450;
  } else {
    if (waist - neck <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(heightCm)) - 450;
  }
  if (!isFinite(bf) || bf <= 0 || bf > 70) return null;
  return Math.round(bf * 10) / 10;
}

// Resolves the best available body fat figure for an entry, preferring a
// directly-measured reading (DEXA, InBody, calipers) over the tape-based
// Navy estimate. Returns the source too, so the UI can say which it used -
// the two carry very different confidence and conflating them would be
// misleading.
function resolveBodyFat(entry, heightCm, formula){
  if (!entry) return null;
  if (entry.body_fat_pct != null && entry.body_fat_pct > 0){
    return { pct: Math.round(entry.body_fat_pct * 10) / 10, source: 'measured' };
  }
  const est = estimateBodyFatPct(entry, heightCm, formula);
  return est == null ? null : { pct: est, source: 'estimated' };
}

// Splits a weight change into estimated fat and lean components using
// body-fat figures at each end. This is the number people actually care
// about and almost never get: losing 3kg means something completely
// different if it was 3kg of fat versus 1.5kg fat and 1.5kg muscle.
function partitionWeightChange(startEntry, endEntry, heightCm, formula){
  const bfS = resolveBodyFat(startEntry, heightCm, formula);
  const bfE = resolveBodyFat(endEntry, heightCm, formula);
  if (!bfS || !bfE) return null;
  const bfStart = bfS.pct, bfEnd = bfE.pct;
  // If either end is estimated, the whole comparison inherits that lower
  // confidence - a measured-to-estimated comparison is not a measured one.
  const source = (bfS.source === 'measured' && bfE.source === 'measured') ? 'measured'
    : (bfS.source === 'estimated' && bfE.source === 'estimated') ? 'estimated' : 'mixed';
  const unit = endEntry.unit;
  const wStart = convertWeight(startEntry.weight, startEntry.unit, unit);
  const wEnd = convertWeight(endEntry.weight, endEntry.unit, unit);
  const fatStart = wStart * bfStart / 100, fatEnd = wEnd * bfEnd / 100;
  const leanStart = wStart - fatStart, leanEnd = wEnd - fatEnd;
  return {
    unit,
    source,
    startWeight: Math.round(wStart * 10) / 10,
    endWeight: Math.round(wEnd * 10) / 10,
    bfStart, bfEnd, bfChange: Math.round((bfEnd - bfStart) * 10) / 10,
    fatChange: Math.round((fatEnd - fatStart) * 10) / 10,
    leanChange: Math.round((leanEnd - leanStart) * 10) / 10,
    totalChange: Math.round((wEnd - wStart) * 10) / 10
  };
}

// ---------- Phase Insights ----------
// Everything here is derived from the user's own weigh-ins and logged sets
// inside the current phase window. Each card self-suppresses when there
// isn't enough data to say something actually true, so the section stays
// honest rather than padding itself with generic filler.
function buildPhaseInsights(phase, weightEntries, sets){
  if (!phase || isPhasePaused(phase)) return [];
  const kind = determineActivePhase(phase);
  if (!kind) return [];
  const start = phase[`${kind}_start`], end = phase[`${kind}_end`];
  if (!start || !end) return [];
  const today = todayStr();
  const cards = [];

  const inPhase = (d) => d >= start && d <= today;
  const phaseWeights = (weightEntries || []).filter(e => inPhase(e.logged_at))
    .sort((a,b) => a.logged_at.localeCompare(b.logged_at));
  const daysElapsed = Math.max(1, Math.round((new Date(today) - new Date(start)) / 86400000));
  const weeksElapsed = daysElapsed / 7;

  // --- 1. Rate check: actual %/week vs the target rate for this phase ---
  if (phaseWeights.length >= 2 && weeksElapsed >= 1){
    const first = phaseWeights[0], last = phaseWeights[phaseWeights.length - 1];
    const unit = last.unit;
    const startW = convertWeight(first.weight, first.unit, unit);
    const curW = convertWeight(last.weight, last.unit, unit);
    const change = curW - startW;
    const actualRatePct = Math.abs(change / startW * 100) / weeksElapsed;
    const targetRatePct = PHASE_RATE_PER_WEEK[kind] * 100;
    const goingRightWay = kind === 'bulk' ? change >= 0 : change <= 0;
    const ratio = actualRatePct / targetRatePct;
    let verdict, tone, detail;
    if (!goingRightWay){
      verdict = kind === 'bulk' ? 'Losing during a bulk' : 'Gaining during a cut';
      tone = 'warn';
      detail = `You're moving the opposite way to your ${kind}. A week or two of this is usually just water or timing noise — a sustained trend means intake needs a look.`;
    } else if (ratio > 1.5){
      verdict = 'Faster than target';
      tone = 'warn';
      detail = kind === 'cut'
        ? `At ${actualRatePct.toFixed(2)}%/week you're cutting well above the ~${targetRatePct}% guideline. Aggressive cuts cost more lean mass and get harder to sustain.`
        : `At ${actualRatePct.toFixed(2)}%/week you're gaining well above the ~${targetRatePct}% guideline, which usually means more of the gain is fat than it needs to be.`;
    } else if (ratio < 0.4){
      verdict = 'Slower than target';
      tone = 'neutral';
      detail = `At ${actualRatePct.toFixed(2)}%/week you're well under the ~${targetRatePct}% guideline. Not a problem in itself — just means this phase will take longer than the dates suggest.`;
    } else {
      verdict = 'On target';
      tone = 'good';
      detail = `${actualRatePct.toFixed(2)}%/week against a ~${targetRatePct}% guideline. That's the range where most people hold onto muscle.`;
    }
    cards.push({ icon: 'rate', title: verdict, tone, body: detail,
      stat: `${change >= 0 ? '+' : ''}${fmtNum(change)}${unit} over ${Math.round(weeksElapsed)}wk` });
  }

  // --- 2. Projected finish from the user's ACTUAL trend, not the generic rate ---
  if (phaseWeights.length >= 3 && weeksElapsed >= 1.5){
    const first = phaseWeights[0], last = phaseWeights[phaseWeights.length - 1];
    const unit = last.unit;
    const startW = convertWeight(first.weight, first.unit, unit);
    const curW = convertWeight(last.weight, last.unit, unit);
    const perWeek = (curW - startW) / weeksElapsed;
    const weeksRemaining = Math.max(0, (new Date(end) - new Date(today)) / (86400000 * 7));
    if (weeksRemaining > 0.5){
      const projected = curW + perWeek * weeksRemaining;
      cards.push({ icon: 'project', title: 'Projected finish', tone: 'neutral',
        body: `If your current trend holds for the remaining ${weeksRemaining.toFixed(1)} weeks, you'll finish this ${kind} around <b>${fmtNum(projected)}${unit}</b>. This uses your real weigh-ins, not the generic rate estimate.`,
        stat: `${fmtNum(curW)}${unit} → ${fmtNum(projected)}${unit}` });
    }
  }

  // --- 3. Strength retention: is training volume holding up? ---
  // The question that actually matters in a cut and that bodyweight alone
  // can't answer. Compares average weekly volume across the first and
  // second half of the elapsed phase.
  const phaseSets = (sets || []).filter(s => inPhase(s.logged_at));
  if (phaseSets.length >= 8 && daysElapsed >= 21){
    const midpoint = addDaysToDate(start, Math.floor(daysElapsed / 2));
    const volOf = (arr) => arr.reduce((sum, s) => {
      const w = Number(s.weight);
      if (!w || isNaN(w) || (s.weight_unit !== 'kg' && s.weight_unit !== 'lb')) return sum;
      const kg = s.weight_unit === 'lb' ? convertWeight(w, 'lb', 'kg') : w;
      return sum + kg * (s.weight_type === 'per' ? 2 : 1) * (Number(s.reps) || 1) * (Number(s.num_sets) || 1);
    }, 0);
    const firstHalf = phaseSets.filter(s => s.logged_at < midpoint);
    const secondHalf = phaseSets.filter(s => s.logged_at >= midpoint);
    if (firstHalf.length >= 3 && secondHalf.length >= 3){
      const halfWeeks = Math.max(0.5, daysElapsed / 2 / 7);
      const v1 = volOf(firstHalf) / halfWeeks, v2 = volOf(secondHalf) / halfWeeks;
      if (v1 > 0){
        const pctChange = (v2 - v1) / v1 * 100;
        let title, tone, body;
        if (pctChange >= 5){
          title = 'Strength trending up';
          tone = 'good';
          body = kind === 'cut'
            ? `Your weekly training volume is up ${Math.round(pctChange)}% in the back half of this cut. Adding work while losing weight is the best signal you're keeping muscle.`
            : `Weekly volume is up ${Math.round(pctChange)}% in the back half of this bulk — the extra food is going somewhere useful.`;
        } else if (pctChange > -10){
          title = 'Strength holding';
          tone = 'good';
          body = kind === 'cut'
            ? `Weekly volume is within ${Math.abs(Math.round(pctChange))}% of where it started. Holding your work rate through a cut is exactly what you want.`
            : `Weekly volume is steady through this bulk.`;
        } else {
          title = 'Volume slipping';
          tone = 'warn';
          body = kind === 'cut'
            ? `Weekly volume is down ${Math.abs(Math.round(pctChange))}% in the back half of this cut. Some drop is normal deep into a deficit, but a big fall often means the deficit is too steep or recovery is short.`
            : `Weekly volume is down ${Math.abs(Math.round(pctChange))}% in the back half of this bulk, which is worth a look given you're eating to grow.`;
        }
        cards.push({ icon: 'strength', title, tone, body,
          stat: `${pctChange >= 0 ? '+' : ''}${Math.round(pctChange)}% weekly volume` });
      }
    }
  }

  // --- 4. Recomposition signal from tape measurements ---
  const measured = phaseWeights.filter(e => e.measurement_unit && (e.waist || e.chest || e.left_arm || e.right_arm));
  if (measured.length >= 2){
    const a = measured[0], b = measured[measured.length - 1];
    const diff = (k) => (a[k] != null && b[k] != null) ? b[k] - a[k] : null;
    const waistD = diff('waist');
    const armD = [diff('left_arm'), diff('right_arm')].filter(v => v != null);
    const chestD = diff('chest');
    const upperD = armD.length ? armD.reduce((x,y)=>x+y,0)/armD.length : chestD;
    if (waistD != null && upperD != null){
      const u = b.measurement_unit;
      if (waistD < -0.3 && upperD >= -0.2){
        cards.push({ icon: 'tape', title: 'Recomp signal', tone: 'good',
          body: `Your waist is down ${Math.abs(waistD).toFixed(1)}${u} while your upper-body measurements have held. That's the shape change people actually want — and it's invisible on the scale alone.`,
          stat: `Waist ${waistD.toFixed(1)}${u} · Upper ${upperD >= 0 ? '+' : ''}${upperD.toFixed(1)}${u}` });
      } else if (waistD > 0.3 && kind === 'bulk' && upperD > 0.3){
        cards.push({ icon: 'tape', title: 'Gaining everywhere', tone: 'neutral',
          body: `Waist up ${waistD.toFixed(1)}${u} and upper body up ${upperD.toFixed(1)}${u}. Normal in a bulk — but if the waist is climbing faster than the arms and chest, the surplus is probably bigger than it needs to be.`,
          stat: `Waist +${waistD.toFixed(1)}${u} · Upper +${upperD.toFixed(1)}${u}` });
      }
    }
  }

  // --- 5. Weigh-in cadence: is the trend line even trustworthy? ---
  if (daysElapsed >= 14){
    const perWeek = phaseWeights.length / weeksElapsed;
    if (perWeek < 1){
      cards.push({ icon: 'cadence', title: 'Weigh in more often', tone: 'neutral',
        body: `You've logged ${phaseWeights.length} weigh-in${phaseWeights.length===1?'':'s'} in ${Math.round(weeksElapsed)} weeks. Daily bodyweight swings of 1–2kg from water and food are normal, so with sparse entries a single reading can look like real progress when it isn't. Two or three a week makes the trend readable.`,
        stat: `${perWeek.toFixed(1)}/week` });
    }
  }

  // --- 6. Body composition split: fat vs lean ---
  // The single most valuable thing here. A scale cannot tell you whether
  // 3kg lost was fat or muscle, and that distinction is the entire point
  // of a well-run cut. Requires height + formula + tape measurements at
  // both ends of the window.
  // Usable for composition if it has a measured reading, or the tape figures
  // the estimate needs. Measured entries work without height configured.
  const measuredEntries = phaseWeights.filter(e =>
    e.body_fat_pct != null || (e.measurement_unit && e.waist && e.neck));
  const canPartition = measuredEntries.length >= 2 && (
    measuredEntries.filter(e => e.body_fat_pct != null).length >= 2 || (phase.height_cm && phase.bf_formula));
  if (canPartition){
    const split = partitionWeightChange(measuredEntries[0], measuredEntries[measuredEntries.length-1], phase.height_cm, phase.bf_formula);
    if (split){
      const u = split.unit;
      const goodCut = kind === 'cut' && split.fatChange < 0 && split.leanChange >= -0.5;
      const goodBulk = kind === 'bulk' && split.leanChange > 0 && split.leanChange >= Math.abs(split.fatChange) * 0.5;
      let body;
      if (goodCut){
        body = `Of the ${fmtNum(Math.abs(split.totalChange))}${u} you've lost, an estimated <b>${fmtNum(Math.abs(split.fatChange))}${u} was fat</b> and lean mass held roughly steady. That's a well-run cut — most of what left was what you wanted gone.`;
      } else if (kind === 'cut' && split.leanChange < -0.5){
        body = `Of the ${fmtNum(Math.abs(split.totalChange))}${u} lost, an estimated ${fmtNum(Math.abs(split.fatChange))}${u} was fat and <b>${fmtNum(Math.abs(split.leanChange))}${u} was lean mass</b>. Losing lean during a cut usually points at too steep a deficit, not enough protein, or training volume having dropped off.`;
      } else if (goodBulk){
        body = `Of the ${fmtNum(split.totalChange)}${u} gained, an estimated <b>${fmtNum(split.leanChange)}${u} was lean mass</b> and ${fmtNum(split.fatChange)}${u} fat. A favourable ratio for a bulk.`;
      } else if (kind === 'bulk'){
        body = `Of the ${fmtNum(split.totalChange)}${u} gained, an estimated ${fmtNum(split.fatChange)}${u} was fat versus ${fmtNum(split.leanChange)}${u} lean. Fat outpacing lean usually means the surplus is larger than it needs to be.`;
      } else {
        body = `Estimated ${fmtNum(split.fatChange)}${u} fat and ${fmtNum(split.leanChange)}${u} lean change so far.`;
      }
      const srcNote = split.source === 'measured'
        ? ` Body fat moved ${split.bfStart}% → ${split.bfEnd}%, from your logged readings.`
        : split.source === 'mixed'
        ? ` Body fat moved ${split.bfStart}% → ${split.bfEnd}% — one end measured, the other estimated from tape, so treat the gap loosely.`
        : ` Body fat estimate moved ${split.bfStart}% → ${split.bfEnd}%, calculated from your tape measurements.`;
      cards.push({ icon: 'body', title: 'Fat vs lean', tone: (goodCut || goodBulk) ? 'good' : 'warn',
        body: body + srcNote,
        stat: `${split.bfChange >= 0 ? '+' : ''}${split.bfChange}% BF` });
    }
  } else if (measuredEntries.length >= 2 && (!phase.height_cm || !phase.bf_formula)){
    // Has tape data but no height, and not enough measured readings to skip it.
    cards.push({ icon: 'body', title: 'Unlock body composition', tone: 'neutral',
      body: `You're already logging waist and neck measurements — add your height and we can estimate what portion of your weight change is fat versus lean mass, which the scale alone can never tell you.`,
      action: 'setupBodyProfile', actionLabel: 'Add height' });
  }

  // --- 7. Trend weight vs scale weight ---
  const trend = computeTrendWeight(phaseWeights, 10);
  if (trend && phaseWeights.length >= 4){
    const gap = trend.latestScale - trend.current;
    if (Math.abs(gap) >= 0.4){
      cards.push({ icon: 'trend', title: gap > 0 ? 'Scale is above your trend' : 'Scale is below your trend',
        tone: 'neutral',
        body: `Your last weigh-in read ${fmtNum(trend.latestScale)}${trend.unit}, but your smoothed trend weight is <b>${fmtNum(trend.current)}${trend.unit}</b>. Day-to-day readings swing on water, salt and food volume — the trend is what's actually moving. ${gap > 0 ? 'Today reading high is almost always fluid, not fat.' : 'Today reading low is a fluid dip, not a sudden loss.'}`,
        stat: `Trend ${fmtNum(trend.current)}${trend.unit}` });
    }
  }

  // --- 8. Plateau / whoosh detection ---
  if (trend && trend.series.length >= 6 && daysElapsed >= 21){
    const recent = trend.series.filter(p => p.logged_at >= addDaysToDate(today, -14));
    if (recent.length >= 3){
      const drift = recent[recent.length-1].trend - recent[0].trend;
      // Signed by phase direction: a cut is expected to trend down, a bulk
      // up. Without the sign, the "big drop" comparison below was true for
      // any loss whatsoever during a cut rather than only unusually large ones.
      const startWeightForRate = phaseWeights[0] ? convertWeight(phaseWeights[0].weight, phaseWeights[0].unit, trend.unit) : 0;
      const expectedPerFortnight = startWeightForRate * PHASE_RATE_PER_WEEK[kind] * 2 * (kind === 'bulk' ? 1 : -1);
      const stalled = Math.abs(drift) < Math.abs(expectedPerFortnight) * 0.3;
      if (stalled){
        cards.push({ icon: 'plateau', title: 'Trend has flattened', tone: 'warn',
          body: kind === 'cut'
            ? `Your trend weight has barely moved in two weeks. Genuine stalls happen — but fat loss is also famously non-linear, and a flat stretch often breaks with a sudden drop once retained water releases. Before changing anything, check that the last fortnight's intake and step count actually matched the fortnight before it.`
            : `Your trend weight has been flat for two weeks. In a bulk that usually just means the surplus has quietly shrunk as bodyweight and activity rose — what worked at the start needs topping up as you get bigger.`,
          stat: `${drift >= 0 ? '+' : ''}${fmtNum(drift)}${trend.unit} / 14d` });
      } else if (kind === 'cut' && drift < expectedPerFortnight * 1.8){
        cards.push({ icon: 'whoosh', title: 'Big drop this fortnight', tone: 'neutral',
          body: `Your trend weight fell ${fmtNum(Math.abs(drift))}${trend.unit} in two weeks — well above your usual pace. Sharp drops after a flat stretch are typically retained water finally releasing rather than a sudden burst of fat loss, so expect it to level off rather than continue at this rate.`,
          stat: `${fmtNum(drift)}${trend.unit} / 14d` });
      }
    }
  }

  // --- 9. Implied daily energy balance ---
  // Descriptive, not prescriptive - derived purely from observed rate of
  // change using the standard ~7700 kcal per kg of bodyweight figure.
  if (phaseWeights.length >= 4 && weeksElapsed >= 2){
    const first = phaseWeights[0], last = phaseWeights[phaseWeights.length - 1];
    const unit = last.unit;
    const changeKg = convertWeight(last.weight, last.unit, 'kg') - convertWeight(first.weight, first.unit, 'kg');
    const kcalPerDay = Math.round((changeKg * 7700) / daysElapsed / 10) * 10;
    if (Math.abs(kcalPerDay) >= 80){
      cards.push({ icon: 'energy', title: kcalPerDay < 0 ? 'Implied daily deficit' : 'Implied daily surplus', tone: 'neutral',
        body: `Your rate of change over ${Math.round(weeksElapsed)} weeks works out to roughly <b>${Math.abs(kcalPerDay)} kcal/day</b> ${kcalPerDay < 0 ? 'below' : 'above'} maintenance. This is read backwards from what your body actually did, so unlike a calculator estimate it already accounts for your real metabolism, NEAT and how accurately you've been tracking.`,
        stat: `${kcalPerDay > 0 ? '+' : ''}${kcalPerDay} kcal/day` });
    }
  }

  // --- 10. Day-of-week weight pattern ---
  if (phaseWeights.length >= 10){
    const byDay = {};
    phaseWeights.forEach(e => {
      const jsDay = new Date(e.logged_at + 'T00:00:00').getDay();
      const wd = jsDay === 0 ? 6 : jsDay - 1;
      const w = convertWeight(e.weight, e.unit, phaseWeights[phaseWeights.length-1].unit);
      (byDay[wd] = byDay[wd] || []).push(w);
    });
    const avgs = Object.entries(byDay).filter(([,arr]) => arr.length >= 2)
      .map(([wd, arr]) => ({ wd: +wd, avg: arr.reduce((a,b)=>a+b,0)/arr.length }));
    if (avgs.length >= 4){
      const overall = avgs.reduce((s,a)=>s+a.avg,0) / avgs.length;
      const high = avgs.reduce((m,a) => a.avg > m.avg ? a : m);
      const low = avgs.reduce((m,a) => a.avg < m.avg ? a : m);
      const spread = high.avg - low.avg;
      if (spread >= 0.4){
        cards.push({ icon: 'calendar', title: 'Your weekly rhythm', tone: 'neutral',
          body: `You consistently weigh most on <b>${DAY_NAMES[high.wd]}</b> and least on <b>${DAY_NAMES[low.wd]}</b> — a spread of ${fmtNum(spread)}${trend ? trend.unit : 'kg'}. That's almost always food volume and sodium from the days before, not real change. Worth comparing like-for-like days rather than reading a Monday against a Friday.`,
          stat: `${fmtNum(spread)}${trend ? trend.unit : 'kg'} swing` });
      }
    }
  }

  // --- 11. Comparison against the same point in the previous cycle ---
  const prevKindStart = phase[`${kind}_start`];
  const priorEntries = (weightEntries || []).filter(e => e.logged_at < prevKindStart);
  if (priorEntries.length >= 4 && weeksElapsed >= 2){
    // Find weigh-ins from the equivalent stretch one full cycle back.
    const cycleLenDays = (phase.bulk_weeks && phase.cut_weeks) ? (phase.bulk_weeks + phase.cut_weeks) * 7 : null;
    if (cycleLenDays){
      const refStart = addDaysToDate(start, -cycleLenDays);
      const refPoint = addDaysToDate(today, -cycleLenDays);
      const window = priorEntries.filter(e => e.logged_at >= refStart && e.logged_at <= refPoint);
      if (window.length >= 2){
        const unit = phaseWeights.length ? phaseWeights[phaseWeights.length-1].unit : window[0].unit;
        const prevChange = convertWeight(window[window.length-1].weight, window[window.length-1].unit, unit)
          - convertWeight(window[0].weight, window[0].unit, unit);
        const nowChange = convertWeight(phaseWeights[phaseWeights.length-1].weight, phaseWeights[phaseWeights.length-1].unit, unit)
          - convertWeight(phaseWeights[0].weight, phaseWeights[0].unit, unit);
        const better = kind === 'cut' ? nowChange < prevChange : nowChange > prevChange;
        cards.push({ icon: 'compare', title: better ? 'Ahead of last cycle' : 'Behind last cycle', tone: better ? 'good' : 'neutral',
          body: `At this same point one cycle ago you were ${fmtNum(prevChange)}${unit} into that phase. You're currently ${fmtNum(nowChange)}${unit} — ${better ? 'a better result at the same stage' : 'slightly behind that pace'}. Same-stage comparisons are far more useful than comparing against your all-time best.`,
          stat: `${fmtNum(nowChange)}${unit} vs ${fmtNum(prevChange)}${unit}` });
      }
    }
  }

  // --- 12. Fastest-moving measurement ---
  if (measured.length >= 2){
    const a = measured[0], b = measured[measured.length - 1];
    const u = b.measurement_unit;
    const deltas = MEASUREMENT_FIELDS
      .filter(f => a[f.key] != null && b[f.key] != null)
      .map(f => ({ label: f.label, delta: b[f.key] - a[f.key] }))
      .filter(d => Math.abs(d.delta) >= 0.2);
    if (deltas.length >= 2){
      const biggest = deltas.reduce((m,d) => Math.abs(d.delta) > Math.abs(m.delta) ? d : m);
      cards.push({ icon: 'tape', title: 'Biggest tape change', tone: 'neutral',
        body: `<b>${biggest.label}</b> has moved the most this phase at ${biggest.delta >= 0 ? '+' : ''}${biggest.delta.toFixed(1)}${u}. Tape measurements catch shape changes that bodyweight completely misses — particularly during a recomp where the scale can sit still for weeks.`,
        stat: `${biggest.label} ${biggest.delta >= 0 ? '+' : ''}${biggest.delta.toFixed(1)}${u}` });
    }
  }

  // --- 13. Training consistency inside this phase ---
  if (phaseSets.length >= 5 && weeksElapsed >= 2){
    const trainingDays = new Set(phaseSets.map(s => s.logged_at)).size;
    const perWeek = trainingDays / weeksElapsed;
    cards.push({ icon: 'consistency', title: 'Training consistency', tone: perWeek >= 3 ? 'good' : 'neutral',
      body: `You've trained on ${trainingDays} separate days this phase — averaging <b>${perWeek.toFixed(1)} sessions a week</b>. ${perWeek >= 4 ? 'That frequency is doing more for your result than any dietary fine-tuning will.' : perWeek >= 3 ? 'A solid, sustainable rhythm.' : 'Frequency is the cheapest lever available if progress stalls.'}`,
      stat: `${perWeek.toFixed(1)}/week` });
  }

  return cards;
}

// Contextual guidance tied to which phase you're in and how far through it -
// the advice that's relevant in week 1 of a bulk is not the advice that's
// relevant in the last fortnight of a cut, so a single static tips list
// would be mostly noise.
function buildPhaseTip(phase){
  if (!phase) return null;
  if (isPhasePaused(phase)){
    return { title: 'Pausing is a real strategy', body: `Extended time at maintenance between phases lets appetite, hormones and training performance normalise. Long uninterrupted deficits get progressively harder to sustain — a deliberate break is often what makes the next cut work.` };
  }
  const kind = determineActivePhase(phase);
  if (!kind) return { title: 'Between phases', body: `Time at maintenance is genuinely useful — it's when a lot of recomposition happens, especially after a long cut. It doesn't have to be dead time.` };
  const start = phase[`${kind}_start`], end = phase[`${kind}_end`];
  const w = weeksBetween(start, end);
  if (!w) return null;
  const pct = w.pct;
  if (kind === 'cut'){
    if (pct < 20) return { title: 'Early cut: ignore the first drop', body: `The fast loss in the first week or two is mostly water and glycogen, not fat. Don't extrapolate it — and don't panic when the rate slows to something more normal, because that slower number is the real one.` };
    if (pct < 70) return { title: 'Mid cut: protect the work rate', body: `This is where training volume usually starts sliding. Keeping your loads heavy — even with slightly fewer sets — is what signals your body to hold onto muscle while losing weight. Cutting intensity to "save energy" tends to cost you the exact thing you're dieting to keep.` };
    return { title: 'Late cut: the hardest stretch', body: `Adherence and recovery both tend to dip here while the scale moves slowest. If you're stalling and miserable, ending the cut a week or two early at a good result beats grinding out a bad one. The dates are a plan, not a contract.` };
  }
  if (pct < 20) return { title: 'Early bulk: slower is better', body: `Early scale jumps are largely glycogen and water refilling — a good sign, but not muscle. Muscle accrues slowly enough that a fast-moving scale in week three usually means the surplus is bigger than it needs to be.` };
  if (pct < 70) return { title: 'Mid bulk: the surplus is for training', body: `Extra food only turns into muscle if there's a training stimulus asking for it. This is the stretch to be adding reps or load on your main lifts — a bulk without progressive overload is mostly just a gain in bodyfat.` };
  return { title: 'Late bulk: plan the exit', body: `Deciding in advance when to stop is what keeps a bulk from drifting into a long slow fat gain. Knowing your next cut is already scheduled makes it much easier to end this one on time.` };
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
    warmInvalidate('bodyWeight');
    await supabaseClient.from('body_weight').delete().eq('id', entryId);
    renderScale();
  };
}

function openLogWeightForm(lastMeasurementUnit, expandMeasurements){
  let unit = 'kg';
  let measurementUnit = lastMeasurementUnit || 'cm';
  // Opened from a measurements preview - land with the section already open
  // rather than making the user find and tap the disclosure row again.
  let measurementsExpanded = !!expandMeasurements;
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';

  const measureFieldHtml = (f) => `
        <div class="measure-field">
          <div class="mlabel">${f.label} <span class="opt-tag" title="${f.goodDirection === 'down' ? 'lower is better' : 'higher is better'}">${f.goodDirection === 'down' ? '↓' : '↑'}</span></div>
          <div class="minput-row"><input class="mf-input" data-key="${f.key}" type="number" inputmode="decimal" placeholder="—"><span class="unit-suffix mf-unit-label">${measurementUnit}</span></div>
        </div>`;
  const measureGroupHtml = (group) => `
      <div class="measure-group-label">${group}</div>
      <div class="measure-grid">
        ${MEASUREMENT_FIELDS.filter(f => f.group === group).map(measureFieldHtml).join('')}
      </div>`;

  overlay.innerHTML = `
    <div class="form-header"><button id="closeW">✕</button><h1>Log Weigh-In</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="field-label"><span style="color:var(--flame); font-size:14px;">●</span> Weight</div>
      <div class="field-card">
        <input class="field-input" id="bwInput" type="number" inputmode="decimal" placeholder="0">
        <div class="unit-toggle"><button class="active" data-u="kg">kg</button><button data-u="lb">lb</button></div>
      </div>

      <div class="field-label">Body Fat <span class="opt">(optional)</span></div>
      <div class="field-card">
        <input class="field-input" id="bfInput" type="number" inputmode="decimal" step="0.1" placeholder="—">
        <div style="font-size:15px; color:var(--slate);">%</div>
      </div>
      <div style="font-size:11px; color:var(--slate); line-height:1.5; padding:0 18px 4px 18px;">From a DEXA scan, InBody, smart scale or calipers. A measured reading always takes priority over the estimate calculated from your tape measurements.</div>

      <div class="measure-toggle-row" id="measureToggleRow">
        <div class="left">
          <div class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12H3M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/></svg></div>
          <div>
            <div class="title">Body Measurements</div>
            <div class="sub" id="measureSub">Optional — track arms, waist &amp; more</div>
          </div>
        </div>
        <div class="chev${measurementsExpanded ? ' open' : ''}" id="measureChev">›</div>
      </div>

      <div class="measure-section" id="measureSection" style="display:${measurementsExpanded ? 'block' : 'none'};">
        <div class="measure-unit-row">
          <span class="lbl">MEASUREMENT UNIT</span>
          <div class="unit-toggle" id="measureUnitToggle"><button class="${measurementUnit==='cm'?'active':''}" data-mu="cm">cm</button><button class="${measurementUnit==='in'?'active':''}" data-mu="in">in</button></div>
        </div>
        <div style="font-size:11px; color:var(--slate); line-height:1.5; padding:0 0 10px 0;">Every field is optional — fill in what you measure. <span style="color:var(--chalk);">↓</span> marks sites where shrinking is progress (waist, hips); <span style="color:var(--chalk);">↑</span> marks muscle girth where growing is.</div>
        ${MEASUREMENT_GROUPS.map(measureGroupHtml).join('')}
      </div>

      <div class="field-label">Notes <span class="opt">(optional)</span></div>
      <div class="field-card"><input class="field-input" id="bwNotes" type="text" placeholder="Anything worth remembering"></div>
      <button class="save-btn" id="saveWBtn">Save Weigh-In</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeW').onclick = () => overlay.remove();
  overlay.querySelectorAll('.field-card .unit-toggle button').forEach(b => {
    b.onclick = () => { overlay.querySelectorAll('.field-card .unit-toggle button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); unit = b.dataset.u; };
  });

  const updateMeasureSub = () => {
    const filled = overlay.querySelectorAll('.mf-input').length
      ? [...overlay.querySelectorAll('.mf-input')].filter(i => i.value.trim() !== '').length
      : 0;
    const sub = overlay.querySelector('#measureSub');
    sub.textContent = measurementsExpanded
      ? `${filled} of ${MEASUREMENT_FIELDS.length} filled in`
      : 'Optional — track arms, waist & more';
  };

  overlay.querySelector('#measureToggleRow').onclick = () => {
    measurementsExpanded = !measurementsExpanded;
    overlay.querySelector('#measureSection').style.display = measurementsExpanded ? 'block' : 'none';
    overlay.querySelector('#measureChev').classList.toggle('open', measurementsExpanded);
    updateMeasureSub();
  };
  overlay.querySelectorAll('.mf-input').forEach(inp => { inp.addEventListener('input', updateMeasureSub); });
  overlay.querySelector('#measureUnitToggle').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      overlay.querySelector('#measureUnitToggle').querySelectorAll('button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      measurementUnit = b.dataset.mu;
      overlay.querySelectorAll('.mf-unit-label').forEach(el => { el.textContent = measurementUnit; });
    };
  });

  overlay.querySelector('#saveWBtn').onclick = async () => {
    const weight = parseFloat(document.getElementById('bwInput').value);
    if (!weight){ alert('Enter a weight.'); return; }
    await withButtonLoading(overlay.querySelector('#saveWBtn'), 'Saving…', async () => {
      const notes = document.getElementById('bwNotes').value.trim();
      const userData = { user: await getCurrentUser() };
      const payload = {
        user_id: userData.user.id, weight, unit, logged_at: todayStr(), notes: notes || null
      };
      const bfRaw = document.getElementById('bfInput').value.trim();
      if (bfRaw !== ''){
        const bf = parseFloat(bfRaw);
        // Guard against a mistyped value being stored as though it were real -
        // anything outside this range is a typo, not a body composition.
        if (isNaN(bf) || bf < 2 || bf > 70){ alert('Enter a body fat percentage between 2 and 70, or leave it blank.'); return; }
        payload.body_fat_pct = bf;
      }
      // Only attach measurement fields (and the unit that governs them) if at
      // least one was actually filled in - keeps weight-only entries from
      // carrying a pointless measurement_unit value with all-null fields.
      const anyMeasurementFilled = [...overlay.querySelectorAll('.mf-input')].some(i => i.value.trim() !== '');
      if (anyMeasurementFilled){
        payload.measurement_unit = measurementUnit;
        MEASUREMENT_FIELDS.forEach(f => {
          const val = overlay.querySelector(`.mf-input[data-key="${f.key}"]`).value.trim();
          payload[f.key] = val === '' ? null : parseFloat(val);
        });
      }
      warmInvalidate('bodyWeight');
      const { error } = await supabaseClient.from('body_weight').insert(payload);
      if (error){ alert(error.message); return; }
      overlay.remove();
      renderScale();
    });
  };
}

// ---------- PHASE ----------
async function loadPhase(){
  const userData = { user: await getCurrentUser() };
  if (!userData || !userData.user) return null;
  const result = await withTimeout(
    supabaseClient.from('phase_settings').select('*').eq('user_id', userData.user.id).maybeSingle(),
    15000
  );
  if (result.__timeout || result.error || !result.data) return null;
  return await advanceAutoScheduleIfNeeded(result.data);
}

// Typical rate of bodyweight change per week used for the projection helper
// text on duration pickers - general periodization guidance, not a
// personalized or clinical figure. Bulk: ~0.35%/week (lean bulk). Cut:
// ~0.7%/week (a sustainable, muscle-sparing rate for most lifters).
const PHASE_RATE_PER_WEEK = { bulk: 0.0035, cut: 0.007 };

function projectPhaseWeightChange(startWeight, weeks, kind){
  if (!startWeight || !weeks) return null;
  const rate = PHASE_RATE_PER_WEEK[kind];
  const direction = kind === 'bulk' ? 1 : -1;
  const changeAmount = Math.round(startWeight * rate * weeks * direction * 10) / 10;
  const finishWeight = Math.round((startWeight + changeAmount) * 10) / 10;
  return { changeAmount, finishWeight, ratePct: Math.round(rate * 1000) / 10 };
}

function addDaysToDate(dateStr, days){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isPhasePaused(phase){
  return !!(phase && phase.paused_at);
}

function daysPaused(phase){
  if (!isPhasePaused(phase)) return 0;
  return Math.max(0, Math.round((new Date(todayStr()) - new Date(phase.paused_at)) / 86400000));
}

// Pausing records WHEN the pause started and deliberately leaves the phase
// dates untouched. Resuming then shifts every date forward by the elapsed
// pause duration, so progress is preserved rather than draining away while
// the user isn't training - someone who pauses in Week 6 of 8 comes back to
// Week 6 of 8, not Week 8.
async function setPhasePaused(phase, paused){
  const userData = { user: await getCurrentUser() };
  if (!userData || !userData.user) return null;
  if (paused){
    const payload = { paused_at: todayStr() };
    warmInvalidate('phase');
    const { error } = await supabaseClient.from('phase_settings').update(payload).eq('user_id', userData.user.id);
    if (error){ alert(error.message); return null; }
    return { ...phase, ...payload };
  }
  const shift = daysPaused(phase);
  const payload = { paused_at: null };
  ['bulk_start','bulk_end','cut_start','cut_end'].forEach(k => {
    if (phase[k]) payload[k] = addDaysToDate(phase[k], shift);
  });
  warmInvalidate('phase');
    const { error } = await supabaseClient.from('phase_settings').update(payload).eq('user_id', userData.user.id);
  if (error){ alert(error.message); return null; }
  return { ...phase, ...payload };
}

// Returns the next `count` upcoming phases after today. Concretely-scheduled
// phases (already stored as real dates) come first and are marked
// isProjected:false. If auto-repeat is on, the cycle is then extrapolated
// beyond those using the stored week durations to fill the remainder, marked
// isProjected:true - so the UI can distinguish "this is actually booked" from
// "this is where the pattern takes you", rather than presenting speculative
// dates with the same confidence as real ones.
function projectUpcomingPhases(phase, count){
  if (!phase) return [];
  const today = todayStr();
  const upcoming = [];

  ['bulk','cut'].forEach(kind => {
    const start = phase[`${kind}_start`], end = phase[`${kind}_end`];
    if (start && end && start > today) upcoming.push({ kind, start, end, isProjected: false });
  });
  upcoming.sort((a,b) => a.start.localeCompare(b.start));

  const canProject = phase.schedule_mode === 'auto' && phase.auto_repeat
    && phase.bulk_weeks && phase.cut_weeks && !isPhasePaused(phase);
  if (canProject){
    // Continue the alternating pattern from whichever phase runs last -
    // either the last upcoming one, or (if nothing is upcoming) whichever
    // currently-set phase ends latest.
    let lastKind, lastEnd;
    if (upcoming.length){
      lastKind = upcoming[upcoming.length - 1].kind;
      lastEnd = upcoming[upcoming.length - 1].end;
    } else {
      const bulkEnd = phase.bulk_end, cutEnd = phase.cut_end;
      if (bulkEnd && cutEnd){
        lastKind = bulkEnd >= cutEnd ? 'bulk' : 'cut';
        lastEnd = bulkEnd >= cutEnd ? bulkEnd : cutEnd;
      } else if (bulkEnd){ lastKind = 'bulk'; lastEnd = bulkEnd; }
      else if (cutEnd){ lastKind = 'cut'; lastEnd = cutEnd; }
    }
    const weeksFor = { bulk: phase.bulk_weeks, cut: phase.cut_weeks };
    let guard = 0;
    while (lastEnd && upcoming.length < count && guard++ < 20){
      const nextKind = lastKind === 'bulk' ? 'cut' : 'bulk';
      const nextStart = lastEnd;
      const nextEnd = addWeeksToDate(nextStart, weeksFor[nextKind]);
      upcoming.push({ kind: nextKind, start: nextStart, end: nextEnd, isProjected: true });
      lastKind = nextKind; lastEnd = nextEnd;
    }
  }
  return upcoming.slice(0, count);
}

function addWeeksToDate(dateStr, weeks){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Chains concrete bulk/cut date ranges starting from anchorStart, in the
// given order (['bulk','cut'] or ['cut','bulk']), using the two durations.
// This is the single place that turns "12 weeks then 8 weeks" into actual
// calendar dates - used both by the Edit Phase form's live preview and by
// the auto-repeat cycle advancement.
function computeChainedDates(anchorStart, order, bulkWeeks, cutWeeks){
  const weeksFor = { bulk: bulkWeeks, cut: cutWeeks };
  const dates = {};
  let cursor = anchorStart;
  order.forEach(kind => {
    const start = cursor;
    const end = addWeeksToDate(start, weeksFor[kind]);
    dates[`${kind}_start`] = start;
    dates[`${kind}_end`] = end;
    cursor = end;
  });
  return dates;
}

// Self-healing cycle advancement: if the user has auto_repeat on and the
// currently-stored bulk/cut dates have both fully elapsed (they haven't
// opened the app in a while), silently compute and persist the next
// iteration of the cycle - shifting the whole thing forward by full cycle
// lengths until today falls within (or before) the new range. Without this,
// a repeat-enabled user who skips a few weeks would come back to find their
// phase just... expired, with no indication of what comes next.
async function advanceAutoScheduleIfNeeded(phase){
  if (!phase || phase.schedule_mode !== 'auto' || !phase.auto_repeat) return phase;
  // Never advance the cycle while paused - the whole point of a pause is
  // that time stops counting against the phase, so rolling it forward
  // underneath a paused user would defeat it entirely.
  if (isPhasePaused(phase)) return phase;
  if (!phase.bulk_weeks || !phase.cut_weeks) return phase;
  if (!phase.bulk_start || !phase.bulk_end || !phase.cut_start || !phase.cut_end) return phase;
  const today = todayStr();
  const cycleEnd = phase.bulk_end > phase.cut_end ? phase.bulk_end : phase.cut_end;
  if (today <= cycleEnd) return phase; // cycle hasn't fully elapsed yet, nothing to do

  // Figure out phase order from whichever currently starts first, and the
  // total cycle length, then shift forward by whole cycles until today is
  // within (or before) the new range.
  const order = phase.bulk_start <= phase.cut_start ? ['bulk','cut'] : ['cut','bulk'];
  const anchor = order[0] === 'bulk' ? phase.bulk_start : phase.cut_start;
  const cycleWeeks = phase.bulk_weeks + phase.cut_weeks;
  // Number of FULLY completed cycles between the original anchor and today -
  // advancing by exactly this many cycles lands us on the cycle that
  // contains (or starts closest before) today. Using floor (not ceil) is
  // what makes this land on the right cycle rather than overshooting into
  // a future one.
  let cyclesElapsed = Math.max(1, Math.floor(weeksBetweenRaw(anchor, today) / cycleWeeks));
  let newAnchor = addWeeksToDate(anchor, cyclesElapsed * cycleWeeks);
  let newDates = computeChainedDates(newAnchor, order, phase.bulk_weeks, phase.cut_weeks);
  // Safety check: if today is still past the new cycle's end (can happen
  // right at a boundary, or if floor undershot by one due to the original
  // cycle already being elapsed at the very start), advance one more cycle.
  let newCycleEnd = newDates.bulk_end > newDates.cut_end ? newDates.bulk_end : newDates.cut_end;
  while (today > newCycleEnd){
    newAnchor = addWeeksToDate(newAnchor, cycleWeeks);
    newDates = computeChainedDates(newAnchor, order, phase.bulk_weeks, phase.cut_weeks);
    newCycleEnd = newDates.bulk_end > newDates.cut_end ? newDates.bulk_end : newDates.cut_end;
  }
  const updated = { ...phase, ...newDates };
  const userData = { user: await getCurrentUser() };
  if (userData && userData.user){
    await supabaseClient.from('phase_settings').update(newDates).eq('user_id', userData.user.id);
  }
  return updated;
}

// Raw week count between two date strings (not rounded up to a minimum of 1
// like weeksBetween's totalWeeks - this is used for cycle-count math where
// exact precision matters).
function weeksBetweenRaw(startStr, endStr){
  return (new Date(endStr) - new Date(startStr)) / (86400000 * 7);
}

// Progress through a date range as of a specific date. Used by the paused
// card to report the week number frozen at the moment of pausing, rather
// than letting it drift forward while the cycle is on hold.
function weeksBetweenAtDate(startStr, endStr, asOfStr){
  if (!startStr || !endStr) return null;
  const start = new Date(startStr), end = new Date(endStr), ref = new Date(asOfStr);
  const totalDays = Math.max(1, Math.round((end - start) / 86400000));
  const totalWeeks = Math.max(1, Math.round(totalDays / 7));
  const daysElapsed = Math.max(0, Math.min(totalDays, Math.floor((ref - start) / 86400000)));
  const elapsedWeeks = Math.min(totalWeeks, Math.floor(daysElapsed / 7) + 1);
  const pct = Math.round((daysElapsed / totalDays) * 100);
  return { totalWeeks, elapsedWeeks, pct };
}

function weeksBetween(startStr, endStr){
  return weeksBetweenAtDate(startStr, endStr, todayStr());
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

const PHASE_DURATION_PRESETS = {
  bulk: [ { label: 'Lean', weeks: 10 }, { label: 'Standard', weeks: 12 }, { label: 'Extended', weeks: 16 } ],
  cut:  [ { label: 'Fast', weeks: 6 }, { label: 'Standard', weeks: 8 }, { label: 'Gradual', weeks: 12 } ]
};

function openPhaseDurationInfoSheet(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeInfo">✕</button><h1>Choosing a Duration</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" style="padding:6px 18px;">
      <div style="font-size:12px; color:var(--slate); margin-bottom:16px; line-height:1.5;">General guidance, not personalized medical advice — adjust based on how your body actually responds.</div>
      <div style="background:var(--panel); border-radius:14px; padding:14px 16px; margin-bottom:10px;">
        <div style="font-family:'Oswald',sans-serif; font-size:14px; color:var(--flame); margin-bottom:6px;">Bulk — 8 to 16 weeks</div>
        <div style="font-size:12px; color:var(--slate); line-height:1.6;">Shorter bulks (8–10wk) keep fat gain minimal but leave less time for strength adaptation. Longer bulks (12–16wk) drive more muscle growth at the cost of more fat gained. Most lifters do well around 12 weeks.</div>
      </div>
      <div style="background:var(--panel); border-radius:14px; padding:14px 16px;">
        <div style="font-family:'Oswald',sans-serif; font-size:14px; color:var(--good); margin-bottom:6px;">Cut — 6 to 12 weeks</div>
        <div style="font-size:12px; color:var(--slate); line-height:1.6;">Faster cuts (6wk) hold onto strength better but are harder to sustain mentally. Slower cuts (10–12wk) protect muscle mass best. Cuts longer than 12 weeks risk diminishing returns and burnout — consider a maintenance break instead.</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeInfo').onclick = () => overlay.remove();
}

async function openEditPhaseForm(existing){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  // Determine if today falls inside an already-set phase - if so, that
  // phase's start date must be preserved when switching into Auto mode,
  // since Week-X-of-Y and the weight-change stat both depend on it.
  const active = existing ? determineActivePhase(existing) : null;
  const lockedKind = (active === 'bulk' && existing && existing.bulk_start && existing.bulk_end) ? 'bulk'
    : (active === 'cut' && existing && existing.cut_start && existing.cut_end) ? 'cut' : null;
  const otherKind = lockedKind === 'bulk' ? 'cut' : 'bulk';

  let mode = (existing && existing.schedule_mode) || 'manual';
  // Latest weigh-in, used to seed the projection math - fetched once up front.
  const weightEntries = await loadBodyWeight();
  const latestWeight = weightEntries[0] || null;

  // ----- Auto-mode working state -----
  let autoRepeat = existing ? !!existing.auto_repeat : false;
  let startWith = lockedKind || (existing && existing.bulk_start && existing.cut_start && existing.cut_start < existing.bulk_start ? 'cut' : 'bulk');
  let beginOn = todayStr();
  if (lockedKind){
    beginOn = lockedKind === 'bulk' ? existing.bulk_start : existing.cut_start;
  } else if (existing && existing[`${startWith}_start`]){
    beginOn = existing[`${startWith}_start`];
  }
  let durations = {
    bulk: (existing && existing.bulk_weeks) || (lockedKind === 'bulk' && existing && weeksBetween(existing.bulk_start, existing.bulk_end) ? weeksBetween(existing.bulk_start, existing.bulk_end).totalWeeks : 12),
    cut: (existing && existing.cut_weeks) || (lockedKind === 'cut' && existing && weeksBetween(existing.cut_start, existing.cut_end) ? weeksBetween(existing.cut_start, existing.cut_end).totalWeeks : 8)
  };

  const durationCardHtml = (kind, isLocked) => {
    const preset = PHASE_DURATION_PRESETS[kind];
    return `<div class="duration-card ${kind}" data-kind="${kind}">
      <div class="head-row">
        <div class="phase-name"><span class="dot"></span> ${isLocked ? 'Current: ' : (lockedKind ? 'Next: ' : '')}${kind === 'bulk' ? 'Bulk' : 'Cut'}</div>
        ${isLocked ? `<div class="lock-tag">🔒 Start Locked</div>` : `<button class="dur-info-btn" aria-label="Duration guidance">?</button>`}
      </div>
      <div class="stepper-row">
        <button class="stepper-btn" data-act="dec" data-kind="${kind}">–</button>
        <div class="stepper-value" id="durVal-${kind}">${durations[kind]}<span class="unit">wks</span></div>
        <button class="stepper-btn" data-act="inc" data-kind="${kind}">+</button>
      </div>
      <div class="chip-row" id="chipRow-${kind}">
        ${preset.map(p => `<div class="dur-chip ${p.weeks===durations[kind]?'active':''}" data-kind="${kind}" data-weeks="${p.weeks}">${p.label} · ${p.weeks}wk</div>`).join('')}
      </div>
      <div class="rate-projection ${kind}" id="proj-${kind}"></div>
      <div class="dates-preview" id="datesPreview-${kind}"></div>
    </div>`;
  };

  overlay.innerHTML = `
    <div class="form-header"><button id="closeP">✕</button><h1>Edit Phase Dates</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="mode-toggle">
        <button class="${mode==='auto'?'active':''}" data-mode="auto">Auto Schedule</button>
        <button class="${mode==='manual'?'active':''}" data-mode="manual">Manual Dates</button>
      </div>
      <div class="mode-sub" id="modeSub"></div>

      <div id="autoSection" style="display:${mode==='auto'?'block':'none'};">
        ${lockedKind ? `<div class="locked-callout" id="lockedCallout"></div>` : `
          <div class="field-label">Start With</div>
          <div style="display:flex; gap:8px; margin:0 18px 14px;">
            <button class="start-with-btn ${startWith==='bulk'?'active':''}" data-w="bulk" style="flex:1; border-radius:12px; padding:12px; text-align:center; font-family:'Oswald',sans-serif; font-weight:600; font-size:14px; border:1px solid var(--line);">Bulk First</button>
            <button class="start-with-btn ${startWith==='cut'?'active':''}" data-w="cut" style="flex:1; border-radius:12px; padding:12px; text-align:center; font-family:'Oswald',sans-serif; font-weight:600; font-size:14px; border:1px solid var(--line);">Cut First</button>
          </div>
          <div class="field-label">Begin On</div>
          <div class="field-card"><input class="field-input" id="beginOnInput" type="date" style="font-size:15px;" value="${beginOn}"></div>
        `}
        <div id="durationCards"></div>
        <div class="repeat-row">
          <div class="left">
            <div class="icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></div>
            <div><div class="title">Repeat Cycle Automatically</div><div class="sub">Keeps chaining these two phases forever</div></div>
          </div>
          <button class="switch ${autoRepeat?'':'off'}" id="repeatSwitch"></button>
        </div>
      </div>

      <div id="manualSection" style="display:${mode==='manual'?'block':'none'};">
        <div class="form-sub" style="margin-top:0;">Which phase is active is worked out automatically from today's date against these ranges - no need to set it manually.</div>
        <div class="field-label">Bulk Start</div>
        <div class="field-card"><input class="field-input" id="bulkStart" type="date" style="font-size:14px;" value="${existing && existing.bulk_start ? existing.bulk_start : ''}"></div>
        <div class="field-label">Bulk End</div>
        <div class="field-card"><input class="field-input" id="bulkEnd" type="date" style="font-size:14px;" value="${existing && existing.bulk_end ? existing.bulk_end : ''}"></div>
        <div class="field-label">Cut Start</div>
        <div class="field-card"><input class="field-input" id="cutStart" type="date" style="font-size:14px;" value="${existing && existing.cut_start ? existing.cut_start : ''}"></div>
        <div class="field-label">Cut End</div>
        <div class="field-card"><input class="field-input" id="cutEnd" type="date" style="font-size:14px;" value="${existing && existing.cut_end ? existing.cut_end : ''}"></div>
      </div>

      <button class="save-btn" id="savePBtn">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeP').onclick = () => overlay.remove();

  // ----- Live recompute of duration cards, previews, and projections -----
  function recomputeAuto(){
    const order = lockedKind ? [lockedKind, otherKind] : (startWith === 'bulk' ? ['bulk','cut'] : ['cut','bulk']);
    const anchor = lockedKind ? (lockedKind === 'bulk' ? existing.bulk_start : existing.cut_start)
      : (document.getElementById('beginOnInput') ? document.getElementById('beginOnInput').value : beginOn);
    const dates = computeChainedDates(anchor || todayStr(), order, durations.bulk, durations.cut);

    // Weight projection chains across phases: first phase starts from the
    // latest real weigh-in, second phase starts from the first phase's
    // projected finish weight, so the numbers stay internally consistent.
    let runningWeight = latestWeight ? latestWeight.weight : null;
    let runningUnit = latestWeight ? latestWeight.unit : 'kg';
    order.forEach(kind => {
      const card = overlay.querySelector(`.duration-card[data-kind="${kind}"]`);
      if (!card) return;
      const proj = runningWeight ? projectPhaseWeightChange(runningWeight, durations[kind], kind) : null;
      const projEl = document.getElementById(`proj-${kind}`);
      if (projEl){
        projEl.innerHTML = proj
          ? `At a typical <b>${proj.ratePct}%/week</b> ${kind === 'bulk' ? 'bulk' : 'cut'} rate from ${runningWeight === (latestWeight&&latestWeight.weight) ? 'your last weigh-in of' : 'a projected'} ${runningWeight}${runningUnit}, ${durations[kind]} weeks ≈ <b>${proj.changeAmount >= 0 ? '+' : ''}${proj.changeAmount}${runningUnit}</b> → finishing around <b>${proj.finishWeight}${runningUnit}</b>.`
          : `Log a weigh-in to see a projected weight change for this phase.`;
      }
      const previewEl = document.getElementById(`datesPreview-${kind}`);
      if (previewEl) previewEl.textContent = `${formatLoggedDate(dates[`${kind}_start`])} → ${formatLoggedDate(dates[`${kind}_end`])}`;
      if (proj) runningWeight = proj.finishWeight;
    });

    return { order, dates };
  }

  // Build duration cards in the right order (locked/current first if applicable)
  const durationCardsEl = overlay.querySelector('#durationCards');
  if (durationCardsEl){
    const order = lockedKind ? [lockedKind, otherKind] : (startWith === 'bulk' ? ['bulk','cut'] : ['cut','bulk']);
    durationCardsEl.innerHTML = order.map(k => durationCardHtml(k, k === lockedKind)).join('');
  }

  if (lockedKind){
    const w = weeksBetween(existing[`${lockedKind}_start`], existing[`${lockedKind}_end`]);
    const startedLabel = formatLoggedDate(existing[`${lockedKind}_start`]);
    document.getElementById('lockedCallout').innerHTML = `
      <div class="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
      <div>
        <div class="title">You're in Week ${w ? w.elapsedWeeks : 1} of your ${lockedKind === 'bulk' ? 'Bulk' : 'Cut'}</div>
        <div class="sub">Started ${startedLabel} — that start date is locked so your weight-change stats stay accurate. Only the end date (and anything after it) will move.</div>
      </div>`;
  }

  document.getElementById('modeSub').textContent = mode === 'auto'
    ? 'Set a duration for each phase and MonoLift schedules the exact dates — chaining Bulk straight into Cut and back again if you want.'
    : 'Enter exact start and end dates yourself for full manual control.';

  overlay.querySelectorAll('.mode-toggle button').forEach(b => {
    b.onclick = () => {
      mode = b.dataset.mode;
      overlay.querySelectorAll('.mode-toggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      overlay.querySelector('#autoSection').style.display = mode === 'auto' ? 'block' : 'none';
      overlay.querySelector('#manualSection').style.display = mode === 'manual' ? 'block' : 'none';
      document.getElementById('modeSub').textContent = mode === 'auto'
        ? 'Set a duration for each phase and MonoLift schedules the exact dates — chaining Bulk straight into Cut and back again if you want.'
        : 'Enter exact start and end dates yourself for full manual control.';
    };
  });

  overlay.querySelectorAll('.start-with-btn').forEach(b => {
    b.onclick = () => {
      startWith = b.dataset.w;
      overlay.querySelectorAll('.start-with-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const order = startWith === 'bulk' ? ['bulk','cut'] : ['cut','bulk'];
      durationCardsEl.innerHTML = order.map(k => durationCardHtml(k, false)).join('');
      wireDurationCardHandlers();
      recomputeAuto();
    };
  });

  const beginOnInput = document.getElementById('beginOnInput');
  if (beginOnInput) beginOnInput.addEventListener('change', () => { beginOn = beginOnInput.value; recomputeAuto(); });

  function wireDurationCardHandlers(){
    overlay.querySelectorAll('.stepper-btn').forEach(b => {
      b.onclick = () => {
        const kind = b.dataset.kind;
        const delta = b.dataset.act === 'inc' ? 1 : -1;
        durations[kind] = Math.max(1, Math.min(52, durations[kind] + delta));
        document.getElementById(`durVal-${kind}`).innerHTML = `${durations[kind]}<span class="unit">wks</span>`;
        overlay.querySelectorAll(`.dur-chip[data-kind="${kind}"]`).forEach(c => c.classList.toggle('active', parseInt(c.dataset.weeks,10) === durations[kind]));
        recomputeAuto();
      };
    });
    overlay.querySelectorAll('.dur-chip').forEach(c => {
      c.onclick = () => {
        const kind = c.dataset.kind;
        durations[kind] = parseInt(c.dataset.weeks, 10);
        document.getElementById(`durVal-${kind}`).innerHTML = `${durations[kind]}<span class="unit">wks</span>`;
        overlay.querySelectorAll(`.dur-chip[data-kind="${kind}"]`).forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        recomputeAuto();
      };
    });
    overlay.querySelectorAll('.dur-info-btn').forEach(b => { b.onclick = () => openPhaseDurationInfoSheet(); });
  }
  wireDurationCardHandlers();
  recomputeAuto();

  const repeatSwitch = document.getElementById('repeatSwitch');
  if (repeatSwitch) repeatSwitch.onclick = () => {
    autoRepeat = !autoRepeat;
    repeatSwitch.classList.toggle('off', !autoRepeat);
  };

  overlay.querySelector('#savePBtn').onclick = async () => { await withButtonLoading(overlay.querySelector('#savePBtn'), 'Saving…', async () => {
    const userData = { user: await getCurrentUser() };
    let payload;
    if (mode === 'auto'){
      const { order, dates } = recomputeAuto();
      payload = {
        user_id: userData.user.id,
        schedule_mode: 'auto',
        bulk_weeks: durations.bulk,
        cut_weeks: durations.cut,
        auto_repeat: autoRepeat,
        bulk_start: dates.bulk_start, bulk_end: dates.bulk_end,
        cut_start: dates.cut_start, cut_end: dates.cut_end
      };
    } else {
      payload = {
        user_id: userData.user.id,
        schedule_mode: 'manual',
        bulk_start: document.getElementById('bulkStart').value || null,
        bulk_end: document.getElementById('bulkEnd').value || null,
        cut_start: document.getElementById('cutStart').value || null,
        cut_end: document.getElementById('cutEnd').value || null
      };
    }
    warmInvalidate('phase');
    const { error } = await supabaseClient.from('phase_settings').upsert(payload, { onConflict: 'user_id' });
    if (error){ alert(error.message); return; }
    overlay.remove();
    renderScale();
  }); };
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

async function fetchExtendedWorkoutData(weeksBack){
  weeksBack = weeksBack || 8;
  const userData = { user: await getCurrentUser() };
  const useMaster = getUseExerciseMasterFlag();
  const since = new Date(Date.now() - weeksBack*7*86400000).toISOString().slice(0,10);
  const [exercises, setResult, db] = await Promise.all([
    fetchAllExercisesCompat(userData.user.id),
    withTimeout(supabaseClient.from('sets').select('exercise_id, exercise_master_id, weight, weight_unit, weight_type, reps, num_sets, logged_at, location_id').gte('logged_at', since), 15000),
    loadExerciseDB()
  ]);
  const sets = setResult.__timeout || setResult.error ? [] : (setResult.data || []);
  const exById = {};
  exercises.forEach(ex => { exById[ex.masterId || ex.id] = ex; });
  // Attach resolved exercise name + primary muscle to each set once, up front,
  // so every downstream consumer just reads it instead of re-matching.
  sets.forEach(s => {
    const ex = exById[useMaster ? s.exercise_master_id : s.exercise_id];
    s._name = ex ? ex.name : null;
    if (s._name){
      const m = matchExercise(s._name, db);
      s._muscle = m && m.primaryMuscles && m.primaryMuscles[0];
    }
  });
  return { sets, exercises, db };
}

// Buckets sets into calendar weeks (Monday-start), most recent week last, so
// charts read left-to-right as "then -> now."
function bucketSetsByWeek(sets, weeksBack){
  const weeks = [];
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - dayOfWeek); thisMonday.setHours(0,0,0,0);
  for (let i = weeksBack - 1; i >= 0; i--){
    const start = new Date(thisMonday); start.setDate(thisMonday.getDate() - i*7);
    const end = new Date(start); end.setDate(start.getDate() + 7);
    weeks.push({ start, end, label: `${start.getMonth()+1}/${start.getDate()}`, sets: [] });
  }
  sets.forEach(s => {
    const d = new Date(s.logged_at + 'T00:00:00');
    const bucket = weeks.find(w => d >= w.start && d < w.end);
    if (bucket) bucket.sets.push(s);
  });
  return weeks;
}

function computeLifetimeStats(sets){
  const totalSets = sets.reduce((sum, s) => sum + (s.num_sets || 1), 0);
  const trainingDays = new Set(sets.map(s => s.logged_at)).size;
  let tonnageKg = 0;
  sets.forEach(s => {
    if (typeof s.weight !== 'number' || !s.reps) return;
    if (s.weight_unit !== 'kg' && s.weight_unit !== 'lb') return;
    const kgWeight = s.weight_unit === 'lb' ? convertWeight(s.weight, 'lb', 'kg') : s.weight;
    const perSideMultiplier = s.weight_type === 'per' ? 2 : 1;
    tonnageKg += kgWeight * perSideMultiplier * s.reps * (s.num_sets || 1);
  });
  return { totalSets, trainingDays, tonnageKg: Math.round(tonnageKg) };
}

// Flags an exercise as a recent PR if its all-time heaviest logged weight (in
// a comparable unit) was actually hit within the last 14 days, not just that
// a heavy set exists somewhere in history. Bodyweight/time/pin/level-based
// exercises are skipped since a "heaviest ever" comparison isn't meaningful
// the same way across those unit types.
function computeRecentPRs(sets){
  const byName = {};
  sets.forEach(s => {
    if (!s._name) return;
    if (s.weight_unit !== 'kg' && s.weight_unit !== 'lb') return;
    if (typeof s.weight !== 'number') return;
    const kgWeight = s.weight_unit === 'lb' ? convertWeight(s.weight, 'lb', 'kg') : s.weight;
    (byName[s._name] = byName[s._name] || []).push({ kgWeight, logged_at: s.logged_at, origWeight: s.weight, origUnit: s.weight_unit, perSide: s.weight_type === 'per' });
  });
  const recentCutoff = new Date(Date.now() - 14*86400000).toISOString().slice(0,10);
  const prs = [];
  Object.entries(byName).forEach(([name, entries]) => {
    const maxEntry = entries.reduce((best, e) => e.kgWeight > best.kgWeight ? e : best, entries[0]);
    if (maxEntry.logged_at >= recentCutoff){
      // Was this genuinely an improvement, or just the only weight ever logged?
      const priorMax = entries.filter(e => e.logged_at < maxEntry.logged_at).reduce((best, e) => Math.max(best, e.kgWeight), 0);
      if (priorMax > 0 && priorMax < maxEntry.kgWeight){
        prs.push({ name, weight: maxEntry.origWeight, unit: maxEntry.origUnit, perSide: maxEntry.perSide, date: maxEntry.logged_at, priorKg: priorMax, newKg: maxEntry.kgWeight });
      }
    }
  });
  return prs.sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5);
}

function computeRepRangeBreakdown(sets){
  const buckets = { strength: 0, hypertrophy: 0, endurance: 0 };
  sets.forEach(s => {
    if (!s.reps) return;
    const count = s.num_sets || 1;
    if (s.reps <= 5) buckets.strength += count;
    else if (s.reps <= 12) buckets.hypertrophy += count;
    else buckets.endurance += count;
  });
  return buckets;
}

// Generic gym-culture wisdom, deliberately NOT attributed to any real named
// person - fitness YouTube has a very recognizable in-joke voice (the
// deadpan "just add weight," the aggressively literal cues, the "bro
// science" callouts) without needing to put fabricated words in a real
// creator's mouth. One rotates in per visit, seeded by the day so it's
// stable across a single session instead of jumping around on every render.
const GYM_WISDOM = [
  { text: "The number one rule of progressive overload: the weight goes up, or you find a way to make it go up.", tag: "Every lifting channel, every video" },
  { text: "Your workout doesn't start when you pick up the weight. It starts when you stop scrolling between sets.", tag: "Gym culture, probably" },
  { text: "\u201cIt's not about the weight, it's about the tension\u201d - said right before someone loads four more plates on.", tag: "Gym bro paradox" },
  { text: "Consistency beats a perfect program you quit after two weeks.", tag: "Every coach, eventually" },
  { text: "If the last rep looked exactly like the first rep, you left reps on the table.", tag: "Form-check comment section" },
  { text: "Nobody has ever regretted a warm-up set. Several people have regretted skipping one.", tag: "Gym wisdom" },
  { text: "\u201cJust one more set\u201d has ended more workouts productively than it has ruined them. Usually.", tag: "Anecdotal, but confidently stated" },
  { text: "Progressive overload doesn't care about your feelings. Log the number, beat the number.", tag: "Spreadsheet enjoyers" },
  { text: "The best rep range is the one you'll actually do consistently for the next six months.", tag: "Long-game lifters" },
  { text: "Your legs will forgive a missed arm day. They will not forgive a missed leg day.", tag: "Universal gym law" },
  { text: "A PR you can't replicate next week wasn't really a PR - it was a stunt.", tag: "Strength coaches, unanimously" },
  { text: "Sleep is a supplement. It's just the one nobody wants to buy because it's free.", tag: "Recovery science, paraphrased" }
];
function todaysGymWisdom(){
  const dayIndex = Math.floor(Date.now() / 86400000) % GYM_WISDOM.length;
  return GYM_WISDOM[dayIndex];
}

// Current streak = consecutive days up to and including today or yesterday
// (a rest day today doesn't break a streak still "in progress"). Longest
// streak scans the whole window for the best run.
function computeConsistencyStreak(sets){
  const daysWithSets = new Set(sets.map(s => s.logged_at));
  let current = 0;
  const todayD = new Date(); todayD.setHours(0,0,0,0);
  let cursor = new Date(todayD);
  // If today has nothing logged yet, start counting from yesterday instead -
  // still "today" in streak terms until the day actually ends.
  if (!daysWithSets.has(cursor.toISOString().slice(0,10))) cursor.setDate(cursor.getDate()-1);
  while (daysWithSets.has(cursor.toISOString().slice(0,10))){
    current++;
    cursor.setDate(cursor.getDate()-1);
  }
  const sortedDays = [...daysWithSets].sort();
  let longest = 0, run = 0, prevDate = null;
  sortedDays.forEach(dateStr => {
    const d = new Date(dateStr + 'T00:00:00');
    if (prevDate && (d - prevDate) === 86400000) run++;
    else run = 1;
    longest = Math.max(longest, run);
    prevDate = d;
  });
  return { current, longest };
}

// GitHub-style activity grid: one cell per day over the window, intensity by
// set count that day. Returned Monday-first, oldest to newest.
function computeActivityHeatmap(sets, weeksBack){
  const byDay = {};
  sets.forEach(s => { byDay[s.logged_at] = (byDay[s.logged_at] || 0) + (s.num_sets || 1); });
  const days = [];
  const now = new Date(); now.setHours(0,0,0,0);
  const dayOfWeek = (now.getDay() + 6) % 7;
  const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - dayOfWeek);
  const totalDays = weeksBack * 7;
  for (let i = totalDays - 1; i >= 0; i--){
    const d = new Date(thisMonday); d.setDate(thisMonday.getDate() + dayOfWeek - i);
    const key = d.toISOString().slice(0,10);
    days.push({ date: key, count: byDay[key] || 0 });
  }
  return days;
}

// Epley formula (weight * (1 + reps/30)) applied to each exercise's single
// heaviest logged set, for the handful of exercises logged most often - the
// classic "gym bro math" estimate, framed as an estimate because it is one.
function computeEstimated1RMs(sets){
  const byName = {};
  sets.forEach(s => {
    if (!s._name || typeof s.weight !== 'number' || !s.reps) return;
    if (s.weight_unit !== 'kg' && s.weight_unit !== 'lb') return;
    (byName[s._name] = byName[s._name] || []).push(s);
  });
  const results = Object.entries(byName).map(([name, entries]) => {
    let best = null, bestEst = 0;
    entries.forEach(s => {
      const est = s.weight * (1 + s.reps/30);
      if (est > bestEst){ bestEst = est; best = s; }
    });
    return { name, count: entries.length, oneRm: Math.round(bestEst), unit: best.weight_unit };
  });
  return results.sort((a,b) => b.count - a.count).slice(0, 3);
}

// Compares each exercise's earliest vs most recent logged weight within the
// window - the single biggest mover, framed honestly as "over N weeks" since
// two data points isn't really a trend line.
function computeBiggestGainer(sets){
  const byName = {};
  sets.forEach(s => {
    if (!s._name || typeof s.weight !== 'number') return;
    if (s.weight_unit !== 'kg' && s.weight_unit !== 'lb') return;
    const kgWeight = s.weight_unit === 'lb' ? convertWeight(s.weight, 'lb', 'kg') : s.weight;
    (byName[s._name] = byName[s._name] || []).push({ kgWeight, logged_at: s.logged_at, origWeight: s.weight, origUnit: s.weight_unit });
  });
  let winner = null, bestGainPct = 0;
  Object.entries(byName).forEach(([name, entries]) => {
    if (entries.length < 2) return;
    const sorted = entries.slice().sort((a,b) => a.logged_at.localeCompare(b.logged_at));
    const first = sorted[0], last = sorted[sorted.length-1];
    if (last.kgWeight <= first.kgWeight) return;
    const gainPct = (last.kgWeight - first.kgWeight) / first.kgWeight;
    if (gainPct > bestGainPct){
      bestGainPct = gainPct;
      winner = { name, from: first.origWeight, fromUnit: first.origUnit, to: last.origWeight, toUnit: last.origUnit, pct: Math.round(gainPct*100), fromDate: first.logged_at, toDate: last.logged_at };
    }
  });
  return winner;
}

function computeMuscleLeaderboard(tally){
  const sorted = BALANCE_MUSCLES.filter(m => tally[m] > 0).sort((a,b) => tally[b] - tally[a]);
  return { top: sorted.slice(0, 3), bottom: BALANCE_MUSCLES.filter(m => tally[m] === 0).length ? [] : sorted.slice(-3).reverse() };
}

function computeMostLoggedExercise(sets){
  const counts = {};
  sets.forEach(s => { if (s._name) counts[s._name] = (counts[s._name]||0) + (s.num_sets||1); });
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  const [name, count] = entries.sort((a,b) => b[1]-a[1])[0];
  return { name, count };
}

function computeAvgSetsPerSession(sets){
  const trainingDays = new Set(sets.map(s => s.logged_at)).size;
  if (!trainingDays) return null;
  const totalSets = sets.reduce((sum, s) => sum + (s.num_sets || 1), 0);
  return Math.round((totalSets / trainingDays) * 10) / 10;
}

// Heaviest single logged set this week, normalized to kg for comparison
// across mixed units but displayed in its original unit.
function computeHeaviestSet(weekSets){
  let best = null, bestKg = 0;
  weekSets.forEach(s => {
    if (typeof s.weight !== 'number' || (s.weight_unit !== 'kg' && s.weight_unit !== 'lb')) return;
    const kg = s.weight_unit === 'lb' ? convertWeight(s.weight, 'lb', 'kg') : s.weight;
    const perSideKg = s.weight_type === 'per' ? kg * 2 : kg;
    if (perSideKg > bestKg){ bestKg = perSideKg; best = s; }
  });
  if (!best) return null;
  return { name: best._name, weight: best.weight, unit: best.weight_unit, perSide: best.weight_type === 'per', reps: best.reps };
}

async function computeVolumeByLocation(weekSets){
  const withLocation = weekSets.filter(s => s.location_id);
  if (!withLocation.length) return null;
  const locations = await loadLocations();
  const nameById = {};
  locations.forEach(l => { nameById[l.id] = l.name; });
  const counts = {};
  withLocation.forEach(s => {
    const name = nameById[s.location_id] || 'Unknown';
    counts[name] = (counts[name] || 0) + (s.num_sets || 1);
  });
  const entries = Object.entries(counts).sort((a,b) => b[1]-a[1]);
  return entries.length > 1 ? entries : null; // only interesting if more than one location was actually used
}

// General, widely-taught training frequency guidance - not personalized, just
// the kind of reference info you'd find in any intro hypertrophy resource.
// Larger muscle groups recover slower and get more total sets since they're
// really several distinct heads; smaller/stabilizer muscles get hit
// indirectly by compounds too, so they need less direct volume.
const TRAINING_FREQUENCY_GUIDE = [
  { group: 'Chest, Back, Quads, Hamstrings', freq: '2-3x / week', sets: '10-20 sets/week', note: 'Large muscle groups - split volume across multiple sessions rather than one long day if you can.' },
  { group: 'Shoulders (all heads), Glutes', freq: '2-3x / week', sets: '10-16 sets/week', note: 'Side and rear delts especially respond well to more frequent, lighter exposure.' },
  { group: 'Biceps, Triceps', freq: '2x / week', sets: '10-14 sets/week', note: 'Already getting indirect work from pressing and pulling compounds - direct sets are the top-up, not the whole job.' },
  { group: 'Calves, Forearms, Abs', freq: '2-4x / week', sets: '8-16 sets/week', note: 'Small, fast-recovering muscles - more frequency tends to beat more sets in one sitting.' },
  { group: 'Traps, Lower Back', freq: '1-2x / week direct', sets: '6-10 sets/week', note: 'Usually taking a lot of indirect load from deadlifts, rows, and shrugs already baked into a session.' }
];

const DID_YOU_KNOW_FACTS = [
  { text: "The triceps make up roughly two-thirds of your upper arm's mass - the biceps get the glory, but the back of the arm is doing more of the volume." },
  { text: "Muscle doesn't get \"toned\" by high reps - what you're seeing is a combination of muscle size and lower body fat covering it. There's no separate \"toning\" mechanism." },
  { text: "The soleus (a calf muscle) is almost entirely slow-twitch fiber, which is part of why calves are notoriously stubborn to grow with typical rep ranges." },
  { text: "Delayed onset muscle soreness (DOMS) peaks 24-72 hours after training, not the same day - soreness the next morning is often just getting started." },
  { text: "Your grip gives out on rows and pulldowns before your back does more often than people realize - straps aren't cheating, they're removing the weakest link." },
  { text: "\"Muscle confusion\" isn't a real training principle - muscles adapt to progressive overload and consistent stimulus, not novelty for its own sake." },
  { text: "The rotator cuff is four small muscles, not one - which is exactly why it's so easy to neglect and so common to injure under heavy pressing volume." },
  { text: "Strength gains in your first few months of training come mostly from your nervous system getting better at recruiting muscle, not the muscle itself growing yet." },
  { text: "The glutes are the single largest muscle group in the human body by cross-sectional area - bigger than the quads." },
  { text: "Lifting explosively on the concentric (lifting) portion of a rep and controlling the eccentric (lowering) portion both matter - the eccentric is actually where a lot of the muscle-damage stimulus comes from." },
  { text: "A pump is mostly fluid shifting into the muscle, not new muscle tissue - it feels great and may support growth, but it isn't the growth itself." },
  { text: "The hamstrings cross two joints (hip and knee), which is why they need both hip-hinge moves (like RDLs) and knee-flexion moves (like leg curls) to be trained completely." }
];
function todaysDidYouKnow(){
  // Offset from the wisdom index so the two cards don't rotate in lockstep.
  const dayIndex = (Math.floor(Date.now() / 86400000) + 3) % DID_YOU_KNOW_FACTS.length;
  return DID_YOU_KNOW_FACTS[dayIndex];
}

// Days since each muscle was last given any direct work - genuinely
// actionable in a way pure volume counts aren't, since a muscle can be "in
// target" for the week but not have been touched in 6 days.
// Ideal max gap between sessions for each muscle, derived directly from
// TRAINING_FREQUENCY_GUIDE's frequency ranges (7 days / target times-per-week).
// This is what turns "days since trained" into something actually meaningful -
// a raw day count means nothing without a reference point for what's normal.
const MUSCLE_IDEAL_GAP_DAYS = {
  chest: 2.8, lats: 2.8, quadriceps: 2.8, hamstrings: 2.8,
  shoulders: 2.8, glutes: 2.8,
  biceps: 3.5, triceps: 3.5,
  calves: 2.3, forearms: 2.3, abdominals: 2.3,
  traps: 4.7, 'lower back': 4.7
};

function computeRecoveryClock(sets){
  const lastTrained = {};
  sets.forEach(s => {
    if (!s._muscle) return;
    if (!lastTrained[s._muscle] || s.logged_at > lastTrained[s._muscle]) lastTrained[s._muscle] = s.logged_at;
  });
  const today = new Date(); today.setHours(0,0,0,0);
  return BALANCE_MUSCLES.map(m => {
    const idealGap = MUSCLE_IDEAL_GAP_DAYS[m] || 3;
    if (!lastTrained[m]) return { muscle: m, days: null, dueInDays: null, idealGap };
    const last = new Date(lastTrained[m] + 'T00:00:00');
    const days = Math.round((today - last) / 86400000);
    const dueInDays = Math.round(idealGap - days);
    return { muscle: m, days, dueInDays, idealGap };
  }).sort((a,b) => {
    // Most overdue first, untrained muscles last (they're a coverage gap,
    // not a recovery-timing question - the recommendations section already
    // covers "never trained").
    if (a.dueInDays === null) return 1;
    if (b.dueInDays === null) return -1;
    return a.dueInDays - b.dueInDays;
  });
}

function computeComebackAlert(recoveryClock){
  const candidate = recoveryClock.find(r => r.dueInDays !== null && r.dueInDays <= -2);
  return candidate || null;
}

// A single composite 0-100 score blending coverage, target-zone adherence,
// and consistency - not a scientific metric, just a fun single number to
// watch trend upward, the way a game might show an overall rating.
function computeConsistencyScore(tally, streak){
  const trained = BALANCE_MUSCLES.filter(m => tally[m] > 0).length;
  const inTarget = BALANCE_MUSCLES.filter(m => tally[m] >= BALANCE_TARGET_MIN && tally[m] <= BALANCE_TARGET_MAX).length;
  const coverageScore = (trained / BALANCE_MUSCLES.length) * 40;
  const targetScore = (inTarget / BALANCE_MUSCLES.length) * 40;
  const streakScore = Math.min(1, streak.current / 5) * 20;
  return Math.round(coverageScore + targetScore + streakScore);
}

function computeExerciseVariety(sets){
  const names = new Set(sets.filter(s => s._name).map(s => s._name));
  return names.size;
}

function computeBusiestDay(sets){
  const byDow = [0,0,0,0,0,0,0]; // Sun..Sat to match native getDay()
  sets.forEach(s => {
    const d = new Date(s.logged_at + 'T00:00:00');
    byDow[d.getDay()] += (s.num_sets || 1);
  });
  const dowNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  let bestIdx = 0;
  byDow.forEach((v, i) => { if (v > byDow[bestIdx]) bestIdx = i; });
  if (byDow[bestIdx] === 0) return null;
  return { day: dowNames[bestIdx], sets: byDow[bestIdx] };
}

function consistencyScoreRingSvg(score){
  const size = 84, cx = size/2, cy = size/2, r = 34;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score/100);
  const color = score >= 70 ? '#8FBF7A' : score >= 40 ? '#E8A33D' : '#E8492A';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2A2C31" stroke-width="7"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
      transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy+2}" font-size="20" font-family="'Bebas Neue',sans-serif" fill="var(--chalk)" text-anchor="middle" dominant-baseline="middle">${score}</text>
  </svg>`;
}

// A small, honest badge set - each one only appears if it's actually earned
// by the real numbers, not decorative filler.
function computeAchievementBadges(tally, streak, lifetimeStats, recentPRs, repRanges){
  const badges = [];
  if (streak.current >= 3) badges.push({ icon: '🔥', label: `${streak.current}-Day Streak` });
  if (streak.longest >= 14) badges.push({ icon: '🗓️', label: `${streak.longest}-Day Best Streak` });
  const inTarget = BALANCE_MUSCLES.filter(m => tally[m] >= BALANCE_TARGET_MIN && tally[m] <= BALANCE_TARGET_MAX).length;
  if (inTarget >= 10) badges.push({ icon: '🎯', label: 'Dialed In' });
  if (recentPRs.length >= 2) badges.push({ icon: '📈', label: 'Gains Train' });
  if (lifetimeStats && lifetimeStats.tonnageKg >= 10000) badges.push({ icon: '🏋️', label: `${(lifetimeStats.tonnageKg/1000).toFixed(0)}t Club` });
  if (BALANCE_MUSCLES.every(m => tally[m] > 0)) badges.push({ icon: '🌐', label: 'Full Coverage' });
  if (repRanges && repRanges.strength > 0 && repRanges.hypertrophy > 0 && repRanges.endurance > 0) badges.push({ icon: '🎛️', label: 'Rep Range Variety' });
  return badges;
}

function activityHeatmapHtml(days){
  const maxCount = Math.max(1, ...days.map(d => d.count));
  const colorFor = (count) => {
    if (count === 0) return '#1D1F23';
    const intensity = Math.min(1, count / maxCount);
    if (intensity < 0.25) return 'rgba(232,73,42,0.25)';
    if (intensity < 0.5) return 'rgba(232,73,42,0.45)';
    if (intensity < 0.75) return 'rgba(232,73,42,0.7)';
    return 'var(--flame)';
  };
  // Columns are weeks, rows are Mon-Sun, matching the familiar contribution-graph layout.
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i+7));
  const cells = weeks.map(week => `
    <div style="display:flex; flex-direction:column; gap:3px;">
      ${week.map(d => `<div title="${d.date}: ${d.count} sets" style="width:11px; height:11px; border-radius:2.5px; background:${colorFor(d.count)};"></div>`).join('')}
    </div>`).join('');
  return `<div style="display:flex; gap:3px; overflow-x:auto; padding:2px;">${cells}</div>`;
}

function weeklyVolumeTrendSvg(weeks){
  const totals = weeks.map(w => w.sets.reduce((sum, s) => sum + (s.num_sets || 1), 0));
  const maxVal = Math.max(1, ...totals);
  const W = 320, H = 100, padL = 4, padR = 4, padT = 10, padB = 18;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const n = weeks.length;
  const barW = chartW / n * 0.55;
  const slotW = chartW / n;
  const bars = totals.map((v, i) => {
    const x = padL + i*slotW + (slotW - barW)/2;
    const h = maxVal > 0 ? (v / maxVal) * chartH : 0;
    const y = padT + chartH - h;
    const isLast = i === n - 1;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${isLast ? 'var(--flame)' : '#3A3D42'}"/>`;
  }).join('');
  const points = totals.map((v, i) => {
    const x = padL + i*slotW + slotW/2;
    const y = padT + chartH - (maxVal > 0 ? (v/maxVal)*chartH : 0);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const labels = weeks.map((w, i) => {
    if (n > 6 && i % 2 !== (n-1) % 2) return '';
    const x = padL + i*slotW + slotW/2;
    return `<text x="${x.toFixed(1)}" y="${H-4}" font-size="8" fill="var(--slate)" text-anchor="middle">${w.label}</text>`;
  }).join('');
  return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;">
    ${bars}
    <polyline points="${points}" fill="none" stroke="#E8A33D" stroke-width="1.5" stroke-linejoin="round" opacity="0.85"/>
    ${labels}
  </svg>`;
}

function perMuscleSparklineSvg(weeks, muscle){
  const totals = weeks.map(w => w.sets.filter(s => s._muscle === muscle).reduce((sum, s) => sum + (s.num_sets || 1), 0));
  const maxVal = Math.max(1, ...totals);
  const W = 60, H = 20, pad = 2;
  const n = totals.length;
  const stepX = (W - pad*2) / Math.max(1, n - 1);
  const points = totals.map((v, i) => {
    const x = pad + i*stepX;
    const y = H - pad - (maxVal > 0 ? (v/maxVal)*(H-pad*2) : 0);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastUp = totals.length >= 2 && totals[totals.length-1] > totals[totals.length-2];
  const color = lastUp ? '#8FBF7A' : '#7BA6C9';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block; flex-shrink:0;"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// A 13-axis radar chart of every muscle at once - the overall shape instantly
// shows lopsidedness (e.g. a big spike on one side, a collapsed wedge on the
// other) in a way a column of linear bars can't communicate as immediately.
function balanceRadarSvg(tally, mode){
  const order = BALANCE_MUSCLES;
  const n = order.length;
  const size = 280, cx = size/2, cy = size/2, maxR = 100;
  const refMax = mode === 'logged' ? BALANCE_TARGET_MAX : Math.max(1, ...order.map(m => tally[m]));
  const angleFor = (i) => (Math.PI * 2 * i / n) - Math.PI/2;
  const pointFor = (i, val) => {
    const r = Math.min(1, val / refMax) * maxR;
    const a = angleFor(i);
    return [cx + r*Math.cos(a), cy + r*Math.sin(a)];
  };
  const dataPoints = order.map((m, i) => pointFor(i, tally[m]));
  const dataPath = dataPoints.map(p => p.map(v=>v.toFixed(1)).join(',')).join(' ');
  // Reference rings at 33%/66%/100% of the target/max, for scale
  const rings = [0.33, 0.66, 1].map(frac => {
    const ringPts = order.map((m, i) => { const a = angleFor(i); return `${(cx + maxR*frac*Math.cos(a)).toFixed(1)},${(cy + maxR*frac*Math.sin(a)).toFixed(1)}`; }).join(' ');
    return `<polygon points="${ringPts}" fill="none" stroke="#2A2C31" stroke-width="1"/>`;
  }).join('');
  const spokes = order.map((m, i) => { const a = angleFor(i); return `<line x1="${cx}" y1="${cy}" x2="${(cx+maxR*Math.cos(a)).toFixed(1)}" y2="${(cy+maxR*Math.sin(a)).toFixed(1)}" stroke="#2A2C31" stroke-width="1"/>`; }).join('');
  const labels = order.map((m, i) => {
    const a = angleFor(i);
    const lx = cx + (maxR+18)*Math.cos(a), ly = cy + (maxR+18)*Math.sin(a);
    const short = BALANCE_LABELS[m].split(' ')[0].split('/')[0];
    return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="8.5" fill="var(--slate)" text-anchor="middle" dominant-baseline="middle">${short}</text>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${rings}${spokes}
    <polygon points="${dataPath}" fill="rgba(232,73,42,0.22)" stroke="var(--flame)" stroke-width="1.5"/>
    ${dataPoints.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.2" fill="var(--flame)"/>`).join('')}
    ${labels}
  </svg>`;
}

// Finds the 1-2 most neglected muscles by tally, then surfaces real database
// exercises targeting them that aren't already somewhere in the user's library -
// a concrete, actionable next step rather than just pointing out the gap.
async function computeMuscleRecommendations(tally, existingLibraryNames){
  const worst = BALANCE_MUSCLES.slice().sort((a,b) => tally[a] - tally[b]).slice(0, 2).filter(m => tally[m] < BALANCE_TARGET_MIN);
  if (!worst.length) return [];
  const db = await loadExerciseDB();
  if (!db) return [];
  const recs = [];
  worst.forEach(muscle => {
    const candidates = db.filter(e => (e.primaryMuscles || [])[0] === muscle
      && !existingLibraryNames.some(name => namesAreSimilar(name, e.name)));
    const starred = candidates.filter(e => POPULAR_EXERCISES.has(e.name));
    const pick = (starred.length ? starred : candidates).sort(() => Math.random() - 0.5).slice(0, 2);
    pick.forEach(e => recs.push({ muscle, name: e.name, equipment: e.equipment }));
  });
  return recs;
}

// Fetches the plan's exercises deduplicated by slot (alt-group siblings count
// once), the same unit tallyFullPlan uses - shared so every plan-mode
// analytic below is counting the same "real" set of planned exercises.
async function fetchDedupedPlanExercises(){
  const userData = { user: await getCurrentUser() };
  const allExercises = await fetchAllExercisesCompat(userData.user.id);
  const placed = allExercises.filter(ex => ex.weekday !== null && ex.weekday !== undefined);
  const seenSlots = new Set();
  const deduped = [];
  placed.forEach(ex => {
    // Always dedupe PER DAY: alt-group siblings on the same day count as one slot,
    // but the same exercise on multiple days must count on each of them - otherwise
    // exercises-per-day and every downstream analytic silently under-counts the
    // days after the exercise's first appearance.
    const slotKey = ex.alt_group_id
      ? `alt|${ex.alt_group_id}|${ex.weekday}`
      : `ex|${ex.masterId || ex.id}|${ex.weekday}`;
    if (seenSlots.has(slotKey)) return;
    seenSlots.add(slotKey);
    deduped.push(ex);
  });
  return deduped;
}

async function computeCompoundIsolationSplit(planExercises){
  const db = await loadExerciseDB();
  const counts = { compound: 0, isolation: 0, unclassified: 0 };
  planExercises.forEach(ex => {
    const match = matchExercise(ex.name, db);
    const mech = classifyMechanic(match);
    if (!mech) counts.unclassified++;
    else if (mech.value === 'compound') counts.compound++;
    else counts.isolation++;
  });
  return counts;
}

async function computeEquipmentBreakdown(planExercises){
  const db = await loadExerciseDB();
  const counts = {};
  planExercises.forEach(ex => {
    const match = matchExercise(ex.name, db);
    const equip = match && match.equipment ? EQUIPMENT_TO_CATEGORY[match.equipment] || cap(match.equipment) : 'Other';
    counts[equip] = (counts[equip] || 0) + 1;
  });
  return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 5);
}

function computeExercisesPerDay(planExercises){
  const perDay = [0,0,0,0,0,0,0];
  planExercises.forEach(ex => { if (ex.weekday >= 0 && ex.weekday <= 6) perDay[ex.weekday]++; });
  return perDay;
}

function computeRestDaySummary(exercisesPerDay){
  const restDays = exercisesPerDay.filter(c => c === 0).length;
  const trainingDays = 7 - restDays;
  return { restDays, trainingDays };
}

function computeAltGroupCoverage(planExercises){
  const withAlt = planExercises.filter(ex => ex.alt_group_id).length;
  return { withAlt, total: planExercises.length, pct: planExercises.length ? Math.round((withAlt/planExercises.length)*100) : 0 };
}

function computeTagCoverage(planExercises){
  const tagged = planExercises.filter(ex => ex.push_pull || ex.upper_lower).length;
  return { tagged, total: planExercises.length, pct: planExercises.length ? Math.round((tagged/planExercises.length)*100) : 0 };
}

function computeBiggestSmallestDay(exercisesPerDay){
  const trainingDayIndices = exercisesPerDay.map((c,i) => ({c,i})).filter(d => d.c > 0);
  if (!trainingDayIndices.length) return null;
  const biggest = trainingDayIndices.reduce((best, d) => d.c > best.c ? d : best);
  const smallest = trainingDayIndices.reduce((best, d) => d.c < best.c ? d : best);
  return { biggest: { day: DAY_NAMES[biggest.i], count: biggest.c }, smallest: { day: DAY_NAMES[smallest.i], count: smallest.c } };
}


async function tallyLoggedInRange(sinceDate, untilDate){
  const useMaster = getUseExerciseMasterFlag();
  const [exercises, setResult, db] = await Promise.all([
    fetchAllExercisesCompat((await getCurrentUser()).id),
    withTimeout(
      (untilDate
        ? supabaseClient.from('sets').select('exercise_id, exercise_master_id, num_sets, logged_at').gte('logged_at', sinceDate).lt('logged_at', untilDate)
        : supabaseClient.from('sets').select('exercise_id, exercise_master_id, num_sets, logged_at').gte('logged_at', sinceDate)),
      15000
    ),
    loadExerciseDB()
  ]);
  const sets = setResult.__timeout || setResult.error ? [] : (setResult.data || []);
  const exById = {};
  exercises.forEach(ex => { exById[ex.masterId || ex.id] = ex.name; });

  const tally = {};
  BALANCE_MUSCLES.forEach(m => tally[m] = 0);
  sets.forEach(s => {
    const name = exById[useMaster ? s.exercise_master_id : s.exercise_id];
    if (!name) return;
    const m = matchExercise(name, db);
    const muscle = m && m.primaryMuscles && m.primaryMuscles[0];
    if (muscle && tally.hasOwnProperty(muscle)) tally[muscle] += (s.num_sets || 1);
  });
  return tally;
}
async function tallyLoggedThisWeek(){
  const since = new Date(Date.now() - 6*86400000).toISOString().slice(0,10);
  return tallyLoggedInRange(since, null);
}
async function tallyLoggedPreviousWeek(){
  const since = new Date(Date.now() - 13*86400000).toISOString().slice(0,10);
  const until = new Date(Date.now() - 6*86400000).toISOString().slice(0,10);
  return tallyLoggedInRange(since, until);
}

async function tallyFullPlan(){
  const userData = { user: await getCurrentUser() };
  const [allExercises, db] = await Promise.all([
    fetchAllExercisesCompat(userData.user.id),
    loadExerciseDB()
  ]);
  const exercises = allExercises.filter(ex => ex.weekday !== null && ex.weekday !== undefined);

  const tally = {};
  BALANCE_MUSCLES.forEach(m => tally[m] = 0);
  // Alt-group siblings are interchangeable options for one slot, not separate
  // planned volume - counting all of them would make a muscle look far more
  // covered than it really is just because it has more variety, not more work.
  // Grouping key includes weekday since the same alt group can legitimately
  // appear as a separate slot on a different day.
  const seenSlots = new Set();
  exercises.forEach(ex => {
    const slotKey = ex.alt_group_id ? `${ex.alt_group_id}|${ex.weekday}` : (ex.masterId || ex.id);
    if (seenSlots.has(slotKey)) return;
    seenSlots.add(slotKey);
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

function balanceBarsHtml(tally, mode, prevTally, weeks){
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
    let trendHtml = '';
    if (prevTally){
      const delta = count - prevTally[muscle];
      if (delta !== 0){
        const trendColor = delta > 0 ? '#8FBF7A' : '#7BA6C9';
        trendHtml = `<span style="font-size:10px; color:${trendColor}; margin-left:6px;">${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}</span>`;
      }
    }
    const sparklineHtml = (mode === 'logged' && weeks) ? `<div style="margin-left:8px;">${perMuscleSparklineSvg(weeks, muscle)}</div>` : '';
    return `<div class="bal-row" data-muscle="${cap(muscle)}" style="cursor:pointer;">
      <div class="bal-toprow"><div class="bal-name">${BALANCE_LABELS[muscle]}</div><div style="display:flex; align-items:center;">${sparklineHtml}<div class="bal-status" style="background:${status.color}26; color:${status.color}; margin-left:8px;">${status.label}</div>${trendHtml}</div></div>
      <div class="bal-bar-track">
        ${targetZoneHtml}
        <div class="bal-bar-fill" style="width:${widthPct}%; background:${status.color};"><span class="bal-count">${count}${suffix}</span></div>
      </div>
    </div>`;
  }).join('');
}

function computeBalanceInsights(tally, prevTally, mode){
  const insights = [];
  const trained = BALANCE_MUSCLES.filter(m => tally[m] > 0);
  const grand = BALANCE_MUSCLES.reduce((sum, m) => sum + tally[m], 0);

  if (mode === 'logged'){
    if (grand === 0){
      insights.push({ icon: '👋', tone: 'neutral', text: `Nothing logged yet this week. Log a set and this fills in with real insight.` });
      return insights;
    }

    const sorted = BALANCE_MUSCLES.slice().sort((a,b) => tally[b] - tally[a]);
    const top = sorted[0];
    if (tally[top] > 0){
      insights.push({ icon: '🔥', tone: 'good', text: `${BALANCE_LABELS[top]} led the week with ${tally[top]} sets.` });
    }
    const untouched = BALANCE_MUSCLES.filter(m => tally[m] === 0);
    if (untouched.length && untouched.length <= 4){
      insights.push({ icon: '💤', tone: 'warn', text: `${untouched.map(m => BALANCE_LABELS[m]).join(', ')} ${untouched.length===1?'hasn\u2019t':'haven\u2019t'} been trained this week.` });
    } else if (untouched.length > 4){
      insights.push({ icon: '💤', tone: 'warn', text: `${untouched.length} muscle groups are sitting at zero this week - a lot of ground still uncovered.` });
    }

    const inTarget = BALANCE_MUSCLES.filter(m => tally[m] >= BALANCE_TARGET_MIN && tally[m] <= BALANCE_TARGET_MAX);
    const over = BALANCE_MUSCLES.filter(m => tally[m] > BALANCE_TARGET_MAX);
    insights.push({ icon: '🎯', tone: inTarget.length >= 7 ? 'good' : 'neutral', text: `${inTarget.length} of ${BALANCE_MUSCLES.length} muscle groups are sitting in the ${BALANCE_TARGET_MIN}-${BALANCE_TARGET_MAX} set target zone.` });
    if (over.length){
      const worst = over.sort((a,b) => tally[b]-tally[a])[0];
      insights.push({ icon: '📈', tone: 'warn', text: `${BALANCE_LABELS[worst]} is running hot at ${tally[worst]} sets, above the usual target range.` });
    }

    if (prevTally){
      const prevGrand = BALANCE_MUSCLES.reduce((sum, m) => sum + prevTally[m], 0);
      if (prevGrand > 0){
        const pct = Math.round(((grand - prevGrand) / prevGrand) * 100);
        if (Math.abs(pct) >= 10){
          insights.push({ icon: pct > 0 ? '⬆️' : '⬇️', tone: pct > 0 ? 'good' : 'neutral', text: `Total volume is ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% vs last week (${grand} vs ${prevGrand} sets).` });
        }
      }
      let biggestMover = null, biggestDelta = 0;
      BALANCE_MUSCLES.forEach(m => {
        const delta = tally[m] - prevTally[m];
        if (Math.abs(delta) > Math.abs(biggestDelta) && (tally[m] >= 3 || prevTally[m] >= 3)){
          biggestDelta = delta; biggestMover = m;
        }
      });
      if (biggestMover && Math.abs(biggestDelta) >= 4){
        insights.push({ icon: biggestDelta > 0 ? '📊' : '📉', tone: 'neutral', text: `${BALANCE_LABELS[biggestMover]} ${biggestDelta > 0 ? 'jumped up' : 'dropped'} by ${Math.abs(biggestDelta)} sets compared to last week.` });
      }
    }

    const pplTally = pplTallyFrom(tally);
    const pplGrand = pplTally.push + pplTally.pull + pplTally.legs;
    if (pplGrand > 0){
      const shares = { push: pplTally.push/pplGrand, pull: pplTally.pull/pplGrand, legs: pplTally.legs/pplGrand };
      const dominant = Object.entries(shares).sort((a,b) => b[1]-a[1])[0];
      if (dominant[1] > 0.55){
        insights.push({ icon: '⚖️', tone: 'warn', text: `${PPL_LABELS[dominant[0]]} is taking up more than half your volume this week (${Math.round(dominant[1]*100)}%) - the other two are getting comparatively little.` });
      }
    }
  } else {
    if (grand === 0){
      insights.push({ icon: '👋', tone: 'neutral', text: `No exercises planned yet across the week.` });
      return insights;
    }
    const gaps = BALANCE_MUSCLES.filter(m => tally[m] === 0);
    if (gaps.length){
      insights.push({ icon: '🕳️', tone: 'warn', text: `${gaps.map(m => BALANCE_LABELS[m]).join(', ')} ${gaps.length===1?'has':'have'} no planned exercises anywhere in the week.` });
    }
    const sorted = BALANCE_MUSCLES.slice().sort((a,b) => tally[b] - tally[a]);
    if (tally[sorted[0]] > 0){
      insights.push({ icon: '🏗️', tone: 'neutral', text: `${BALANCE_LABELS[sorted[0]]} has the most planned coverage, with ${tally[sorted[0]]} exercise${tally[sorted[0]]===1?'':'s'} across the week.` });
    }
    insights.push({ icon: '✅', tone: gaps.length === 0 ? 'good' : 'neutral', text: `${trained.length} of ${BALANCE_MUSCLES.length} muscle groups have at least one planned exercise somewhere in the week.` });
  }

  return insights;
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

function balanceHeroHtml(tally, prevTally, mode){
  const grand = BALANCE_MUSCLES.reduce((sum, m) => sum + tally[m], 0);
  const trained = BALANCE_MUSCLES.filter(m => tally[m] > 0).length;
  const inTarget = BALANCE_MUSCLES.filter(m => tally[m] >= BALANCE_TARGET_MIN && tally[m] <= BALANCE_TARGET_MAX).length;
  const headline = mode === 'logged' ? grand : grand;
  const headlineLabel = mode === 'logged' ? 'TOTAL SETS THIS WEEK' : 'EXERCISE SLOTS PLANNED';
  let trendHtml = '';
  if (mode === 'logged' && prevTally){
    const prevGrand = BALANCE_MUSCLES.reduce((sum, m) => sum + prevTally[m], 0);
    if (prevGrand > 0){
      const pct = Math.round(((grand - prevGrand) / prevGrand) * 100);
      const color = pct > 0 ? '#8FBF7A' : pct < 0 ? '#7BA6C9' : 'var(--slate)';
      const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '—';
      trendHtml = `<div style="font-size:12px; color:${color}; margin-top:2px;">${arrow} ${Math.abs(pct)}% vs last week</div>`;
    } else if (grand > 0) {
      trendHtml = `<div style="font-size:12px; color:#8FBF7A; margin-top:2px;">First week logging - nothing to compare yet</div>`;
    }
  }
  const secondLine = mode === 'logged'
    ? `${trained}/${BALANCE_MUSCLES.length} muscles trained · ${inTarget}/${BALANCE_MUSCLES.length} in target zone`
    : `${trained}/${BALANCE_MUSCLES.length} muscles covered somewhere in the week`;
  return `
    <div style="margin:0 18px 14px 18px; background:linear-gradient(135deg, rgba(232,73,42,0.12), rgba(232,73,42,0.02)); border:1px solid rgba(232,73,42,0.25); border-radius:16px; padding:20px;">
      <div style="display:flex; align-items:baseline; gap:10px;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:44px; line-height:1; color:var(--flame);">${headline}</div>
        <div style="font-size:11px; letter-spacing:0.5px; color:var(--slate); text-transform:uppercase;">${headlineLabel}</div>
      </div>
      ${trendHtml}
      <div style="font-size:12.5px; color:var(--chalk); margin-top:10px; opacity:0.85;">${secondLine}</div>
    </div>`;
}

function balanceInsightsHtml(insights){
  if (!insights.length) return '';
  const toneColor = { good: '#8FBF7A', warn: '#E8A33D', neutral: '#7BA6C9' };
  return `
    <div class="section-label">Insights</div>
    <div style="padding:0 18px 6px 18px; display:flex; flex-direction:column; gap:8px;">
      ${insights.map(ins => `
        <div style="display:flex; gap:10px; align-items:flex-start; background:var(--panel); border:1px solid var(--line); border-left:3px solid ${toneColor[ins.tone] || toneColor.neutral}; border-radius:10px; padding:11px 13px;">
          <div style="font-size:16px; line-height:1.3;">${ins.icon}</div>
          <div style="font-size:13px; color:var(--chalk); line-height:1.4; flex:1;">${ins.text}</div>
        </div>
      `).join('')}
    </div>`;
}


async function renderBalance(mode, view){
  mode = mode || state.balanceMode || 'logged';
  view = view || state.balanceView || 'muscle';
  state.balanceMode = mode;
  state.balanceView = view;
  // Balance is the heaviest screen to compute, so re-crunching it on every
  // visit was the most noticeable stall. Cached per mode, since the two
  // modes read different data entirely.
  const balanceKey = 'balance_' + mode;
  const wBal = warmGet(balanceKey, () => Promise.all([
    mode === 'logged' ? tallyLoggedThisWeek() : tallyFullPlan(),
    mode === 'logged' ? tallyLoggedPreviousWeek() : Promise.resolve(null),
    mode === 'logged' ? fetchExtendedWorkoutData(8) : Promise.resolve(null)
  ]));
  if (wBal.value === undefined){
    app.innerHTML = `<div class="app-shell"><div class="login-wrap"><div class="login-sub">Crunching your balance…</div></div></div>`;
  }
  const [tally, prevTally, extended] = wBal.value !== undefined ? wBal.value : await wBal.refresh;
  if (wBal.refresh){
    const before = JSON.stringify(tally);
    wBal.refresh.then((fresh) => {
      if (state.currentTab !== 'balance' || !fresh) return;
      if (JSON.stringify(fresh[0]) !== before) renderBalance(mode, view);
    }).catch(() => {});
  }
  const insights = computeBalanceInsights(tally, prevTally, mode);

  let weeks = null, lifetimeStats = null, recentPRs = [], repRanges = null;
  let streak = null, heatmapDays = null, oneRms = [], biggestGainer = null, leaderboard = null, badges = [], mostLogged = null;
  let recoveryClock = null, comebackAlert = null, consistencyScore = null, exerciseVariety = null, busiestDay = null;
  let avgSetsPerSession = null, heaviestSet = null, volumeByLocation = null;
  let planExercises = null, compoundSplit = null, equipmentBreakdown = null, exercisesPerDay = null, restSummary = null, altCoverage = null, tagCoverage = null, biggestSmallestDay = null;
  if (extended){
    weeks = bucketSetsByWeek(extended.sets, 8);
    lifetimeStats = computeLifetimeStats(extended.sets);
    recentPRs = computeRecentPRs(extended.sets);
    repRanges = computeRepRangeBreakdown(weeks[weeks.length-1].sets);
    streak = computeConsistencyStreak(extended.sets);
    heatmapDays = computeActivityHeatmap(extended.sets, 8);
    oneRms = computeEstimated1RMs(extended.sets);
    biggestGainer = computeBiggestGainer(extended.sets);
    mostLogged = computeMostLoggedExercise(extended.sets);
    badges = computeAchievementBadges(tally, streak, lifetimeStats, recentPRs, repRanges);
    recoveryClock = computeRecoveryClock(extended.sets);
    comebackAlert = computeComebackAlert(recoveryClock);
    consistencyScore = computeConsistencyScore(tally, streak);
    exerciseVariety = computeExerciseVariety(extended.sets);
    busiestDay = computeBusiestDay(extended.sets);
    avgSetsPerSession = computeAvgSetsPerSession(weeks[weeks.length-1].sets);
    heaviestSet = computeHeaviestSet(weeks[weeks.length-1].sets);
    volumeByLocation = await computeVolumeByLocation(weeks[weeks.length-1].sets);
  }
  if (mode === 'plan'){
    planExercises = await fetchDedupedPlanExercises();
    compoundSplit = await computeCompoundIsolationSplit(planExercises);
    equipmentBreakdown = await computeEquipmentBreakdown(planExercises);
    exercisesPerDay = computeExercisesPerDay(planExercises);
    restSummary = computeRestDaySummary(exercisesPerDay);
    altCoverage = computeAltGroupCoverage(planExercises);
    tagCoverage = computeTagCoverage(planExercises);
    biggestSmallestDay = computeBiggestSmallestDay(exercisesPerDay);
  }
  leaderboard = computeMuscleLeaderboard(tally);
  const wisdom = todaysGymWisdom();
  const didYouKnow = todaysDidYouKnow();
  const existingLibraryNames = mode === 'logged' && extended ? extended.exercises.map(e => e.name) : [];
  const recommendations = await computeMuscleRecommendations(tally, existingLibraryNames);

  const didYouKnowHtml = `
    <div style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px;">
      <div style="font-size:10px; letter-spacing:0.5px; color:#7BA6C9; text-transform:uppercase; margin-bottom:6px;">🧠 Did You Know</div>
      <div style="font-size:13px; color:var(--chalk); line-height:1.45;">${didYouKnow.text}</div>
    </div>`;

  const scoreAndVarietyHtml = (consistencyScore !== null) ? `
    <div style="display:flex; gap:10px; margin:0 18px 14px 18px; align-items:stretch;">
      <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px; display:flex; align-items:center; gap:12px; flex:1;">
        ${consistencyScoreRingSvg(consistencyScore)}
        <div>
          <div style="font-size:11px; color:var(--slate); text-transform:uppercase; letter-spacing:0.3px;">Consistency Score</div>
          <div style="font-size:11px; color:var(--slate); margin-top:2px;">Coverage + target zone + streak</div>
        </div>
      </div>
    </div>
    <div style="display:flex; gap:8px; margin:0 18px 14px 18px;">
      <div style="flex:1; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 10px; text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:20px; color:var(--chalk);">${exerciseVariety}</div>
        <div style="font-size:9.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.3px; margin-top:2px;">Exercises Used</div>
      </div>
      ${busiestDay ? `<div style="flex:1; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 10px; text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:20px; color:var(--chalk);">${busiestDay.day.slice(0,3)}</div>
        <div style="font-size:9.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.3px; margin-top:2px;">Busiest Day</div>
      </div>` : ''}
    </div>` : '';

  const comebackHtml = comebackAlert ? `
    <div style="margin:0 18px 14px 18px; background:linear-gradient(135deg, rgba(232,163,61,0.14), rgba(232,163,61,0.02)); border:1px solid rgba(232,163,61,0.35); border-radius:12px; padding:14px 16px; cursor:pointer;" class="bal-row" data-muscle="${comebackAlert.muscle.charAt(0).toUpperCase()+comebackAlert.muscle.slice(1)}">
      <div style="font-size:10px; letter-spacing:0.5px; color:#E8A33D; text-transform:uppercase; margin-bottom:4px;">⏰ Comeback Alert</div>
      <div style="font-size:13px; color:var(--chalk); line-height:1.4;">${BALANCE_LABELS[comebackAlert.muscle]} is overdue by ${Math.abs(comebackAlert.dueInDays)} day${Math.abs(comebackAlert.dueInDays)===1?'':'s'} against its usual training rhythm (last hit ${comebackAlert.days} days ago).</div>
    </div>` : '';

  const recoveryClockHtml = recoveryClock ? `
    <div class="section-label">Recovery Clock</div>
    <div class="small" style="padding:0 18px 8px 18px; color:var(--slate);">When each muscle is next due, based on its usual training rhythm - not just days since last worked.</div>
    <div style="padding:0 18px 14px 18px; display:flex; flex-direction:column; gap:6px;">
      ${recoveryClock.filter(r => r.days !== null).slice(0, 6).map(r => {
        let statusText, statusColor;
        if (r.dueInDays <= -1){ statusText = `Overdue ${Math.abs(r.dueInDays)}d`; statusColor = '#E8492A'; }
        else if (r.dueInDays === 0){ statusText = 'Due today'; statusColor = '#E8A33D'; }
        else { statusText = `Due in ${r.dueInDays}d`; statusColor = 'var(--good)'; }
        return `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px; padding:4px 0;">
          <div style="color:var(--chalk);">${BALANCE_LABELS[r.muscle]}</div>
          <div style="text-align:right;">
            <div style="color:${statusColor}; font-weight:600;">${statusText}</div>
            <div style="color:var(--slate); font-size:10px;">last: ${r.days === 0 ? 'today' : r.days === 1 ? 'yesterday' : `${r.days}d ago`}</div>
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  const freqGuideHtml = `
    <div class="section-label">How Often Should You Train Each Muscle?</div>
    <div style="padding:0 18px 14px 18px; display:flex; flex-direction:column; gap:8px;">
      ${TRAINING_FREQUENCY_GUIDE.map(g => `
        <div style="background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:11px 13px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <div style="font-size:12.5px; color:var(--chalk); font-weight:600;">${g.group}</div>
            <div style="font-size:11px; color:var(--flame); white-space:nowrap; margin-left:8px;">${g.freq}</div>
          </div>
          <div style="font-size:10.5px; color:var(--slate); margin-top:2px;">${g.sets}</div>
          <div style="font-size:11px; color:var(--slate); margin-top:4px; line-height:1.35;">${g.note}</div>
        </div>
      `).join('')}
      <div class="small" style="color:var(--slate); margin-top:2px;">General guidance for most lifters, not personalized advice - your ideal frequency depends on total volume, recovery, and experience level too.</div>
    </div>`;

  // --- 3 new logged-mode sections ---
  const sessionStatsHtml = (avgSetsPerSession !== null || heaviestSet) ? `
    <div style="display:flex; gap:8px; margin:0 18px 14px 18px;">
      ${avgSetsPerSession !== null ? `<div style="flex:1; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 10px; text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:20px; color:var(--chalk);">${avgSetsPerSession}</div>
        <div style="font-size:9.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.3px; margin-top:2px;">Avg Sets/Session</div>
      </div>` : ''}
      ${heaviestSet ? `<div style="flex:1.4; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 10px;">
        <div style="font-size:9.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.3px;">Heaviest Set This Week</div>
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:3px;">
          <div style="font-size:11.5px; color:var(--chalk); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px;">${heaviestSet.name}</div>
          <div style="font-family:'Bebas Neue',sans-serif; font-size:17px; color:var(--flame);">${heaviestSet.weight}${heaviestSet.unit}${heaviestSet.perSide?'/side':''}</div>
        </div>
      </div>` : ''}
    </div>` : '';

  const volumeByLocationHtml = volumeByLocation ? `
    <div class="section-label">This Week, By Location</div>
    <div style="padding:0 18px 14px 18px; display:flex; flex-direction:column; gap:6px;">
      ${volumeByLocation.map(([name, count]) => `<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:4px 0;"><div style="color:var(--chalk);">${name}</div><div style="color:var(--slate);">${count} sets</div></div>`).join('')}
    </div>` : '';

  // --- 7 new plan-mode sections ---
  const compoundSplitHtml = compoundSplit ? (() => {
    const total = compoundSplit.compound + compoundSplit.isolation + compoundSplit.unclassified || 1;
    const pct = (n) => Math.round((n/total)*100);
    return `
    <div class="section-label">Compound vs Isolation</div>
    <div style="margin:0 18px 14px 18px;">
      <div style="display:flex; height:22px; border-radius:6px; overflow:hidden;">
        <div style="width:${pct(compoundSplit.compound)}%; background:#E8492A;"></div>
        <div style="width:${pct(compoundSplit.isolation)}%; background:#3A6EA5;"></div>
        <div style="width:${pct(compoundSplit.unclassified)}%; background:#3A3D42;"></div>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:10.5px; color:var(--slate);">
        <div><span style="color:#E8492A;">●</span> Compound ${pct(compoundSplit.compound)}%</div>
        <div><span style="color:#3A6EA5;">●</span> Isolation ${pct(compoundSplit.isolation)}%</div>
      </div>
    </div>`;
  })() : '';

  const equipmentHtml = (equipmentBreakdown && equipmentBreakdown.length) ? `
    <div class="section-label">Equipment Breakdown</div>
    <div style="padding:0 18px 14px 18px; display:flex; flex-direction:column; gap:6px;">
      ${equipmentBreakdown.map(([name, count]) => `<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:4px 0;"><div style="color:var(--chalk);">${name}</div><div style="color:var(--slate);">${count} exercise${count===1?'':'s'}</div></div>`).join('')}
    </div>` : '';

  const perDayChartHtml = exercisesPerDay ? (() => {
    const maxC = Math.max(1, ...exercisesPerDay);
    return `
    <div class="section-label">Exercises Per Day</div>
    <div style="margin:0 18px 14px 18px; display:flex; align-items:flex-end; gap:6px; height:70px;">
      ${exercisesPerDay.map((c, i) => `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%;">
          <div style="font-size:9.5px; color:var(--slate); margin-bottom:2px;">${c||''}</div>
          <div style="width:100%; height:${Math.max(3, (c/maxC)*44)}px; background:${c>0?'var(--flame)':'#2A2C31'}; border-radius:3px 3px 0 0;"></div>
          <div style="font-size:9px; color:var(--slate); margin-top:4px;">${DAY_NAMES[i]}</div>
        </div>
      `).join('')}
    </div>`;
  })() : '';

  const restSummaryHtml = restSummary ? `
    <div style="display:flex; gap:8px; margin:0 18px 14px 18px;">
      <div style="flex:1; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 10px; text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:20px; color:var(--chalk);">${restSummary.trainingDays}</div>
        <div style="font-size:9.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.3px; margin-top:2px;">Training Days</div>
      </div>
      <div style="flex:1; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 10px; text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:20px; color:var(--chalk);">${restSummary.restDays}</div>
        <div style="font-size:9.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.3px; margin-top:2px;">Rest Days</div>
      </div>
    </div>` : '';

  const coverageStatsHtml = (altCoverage && tagCoverage) ? `
    <div style="padding:0 18px 14px 18px; display:flex; flex-direction:column; gap:8px;">
      <div>
        <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:3px;"><div style="color:var(--chalk);">Alt-Group Coverage</div><div style="color:var(--slate);">${altCoverage.withAlt}/${altCoverage.total}</div></div>
        <div style="height:8px; background:#2A2C31; border-radius:4px; overflow:hidden;"><div style="width:${altCoverage.pct}%; height:100%; background:#7BA6C9;"></div></div>
      </div>
      <div>
        <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:3px;"><div style="color:var(--chalk);">Push/Pull/Upper/Lower Tagged</div><div style="color:var(--slate);">${tagCoverage.tagged}/${tagCoverage.total}</div></div>
        <div style="height:8px; background:#2A2C31; border-radius:4px; overflow:hidden;"><div style="width:${tagCoverage.pct}%; height:100%; background:#8FBF7A;"></div></div>
      </div>
    </div>` : '';

  const biggestSmallestHtml = biggestSmallestDay ? `
    <div style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 16px; display:flex; justify-content:space-between;">
      <div><div style="font-size:9.5px; color:var(--slate); text-transform:uppercase;">Biggest Day</div><div style="font-size:13px; color:var(--chalk); margin-top:2px;">${biggestSmallestDay.biggest.day} · ${biggestSmallestDay.biggest.count} exercises</div></div>
      <div style="text-align:right;"><div style="font-size:9.5px; color:var(--slate); text-transform:uppercase;">Lightest Day</div><div style="font-size:13px; color:var(--chalk); margin-top:2px;">${biggestSmallestDay.smallest.day} · ${biggestSmallestDay.smallest.count} exercises</div></div>
    </div>` : '';

  const wisdomHtml = `
    <div style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px;">
      <div style="font-size:10px; letter-spacing:0.5px; color:var(--flame); text-transform:uppercase; margin-bottom:6px;">💬 Gym Wisdom of the Day</div>
      <div style="font-size:13px; color:var(--chalk); line-height:1.45; font-style:italic;">"${wisdom.text}"</div>
      <div style="font-size:10.5px; color:var(--slate); margin-top:6px;">— ${wisdom.tag}</div>
    </div>`;

  const badgesHtml = badges.length ? `
    <div style="display:flex; gap:7px; flex-wrap:wrap; padding:0 18px 14px 18px;">
      ${badges.map(b => `<div style="background:var(--panel); border:1px solid rgba(232,73,42,0.3); border-radius:20px; padding:6px 12px; font-size:11.5px; color:var(--chalk); display:flex; align-items:center; gap:5px;"><span>${b.icon}</span>${b.label}</div>`).join('')}
    </div>` : '';

  const heatmapSectionHtml = heatmapDays ? `
    <div class="section-label">${streak.current >= 2 ? `🔥 ${streak.current}-Day Streak` : 'Activity, Last 8 Weeks'}</div>
    <div style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px;">
      ${activityHeatmapHtml(heatmapDays)}
      <div style="font-size:10.5px; color:var(--slate); margin-top:8px;">Longest streak this window: ${streak.longest} day${streak.longest===1?'':'s'}</div>
    </div>` : '';

  const oneRmHtml = oneRms.length ? `
    <div class="section-label">Estimated 1-Rep Max</div>
    <div style="display:flex; gap:8px; padding:0 18px 14px 18px; overflow-x:auto;">
      ${oneRms.map(r => `
        <div style="flex-shrink:0; min-width:110px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px;">
          <div style="font-size:11px; color:var(--slate); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px;">${r.name}</div>
          <div style="font-family:'Bebas Neue',sans-serif; font-size:20px; color:var(--flame);">${r.oneRm}${r.unit}</div>
          <div style="font-size:9.5px; color:var(--slate); margin-top:1px;">estimated</div>
        </div>
      `).join('')}
    </div>` : '';

  const gainerHtml = biggestGainer ? `
    <div class="section-label">Biggest Gainer, 8 Weeks 🚀</div>
    <div style="margin:0 18px 14px 18px; background:linear-gradient(135deg, rgba(143,191,122,0.12), rgba(143,191,122,0.02)); border:1px solid rgba(143,191,122,0.3); border-radius:12px; padding:14px 16px;">
      <div style="font-size:14px; color:var(--chalk); font-weight:600;">${biggestGainer.name}</div>
      <div style="display:flex; align-items:baseline; gap:8px; margin-top:4px;">
        <div style="font-size:13px; color:var(--slate);">${biggestGainer.from}${biggestGainer.fromUnit} → </div>
        <div style="font-family:'Bebas Neue',sans-serif; font-size:22px; color:var(--good);">${biggestGainer.to}${biggestGainer.toUnit}</div>
        <div style="font-size:12px; color:var(--good);">(+${biggestGainer.pct}%)</div>
      </div>
    </div>` : '';

  const leaderboardHtml = leaderboard.top.length ? `
    <div class="section-label">Muscle Leaderboard</div>
    <div style="padding:0 18px 14px 18px; display:flex; flex-direction:column; gap:6px;">
      ${leaderboard.top.map((m, i) => `<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:4px 0;"><div style="color:var(--chalk);">${['🥇','🥈','🥉'][i]} ${BALANCE_LABELS[m]}</div><div style="color:var(--slate);">${tally[m]}${mode==='logged'?' sets':' ex'}</div></div>`).join('')}
    </div>` : '';

  const mostLoggedHtml = mostLogged ? `
    <div style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
      <div><div style="font-size:10px; color:var(--slate); text-transform:uppercase; letter-spacing:0.3px;">Your Go-To Lift</div><div style="font-size:13.5px; color:var(--chalk); margin-top:2px;">${mostLogged.name}</div></div>
      <div style="font-family:'Bebas Neue',sans-serif; font-size:20px; color:var(--flame);">${mostLogged.count}×</div>
    </div>` : '';

  // Lifetime stats tiles - only meaningful in logged mode, where there's real history.
  const lifetimeHtml = lifetimeStats ? `
    <div style="display:flex; gap:8px; margin:0 18px 14px 18px;">
      <div style="flex:1; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 10px; text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:22px; color:var(--chalk);">${lifetimeStats.totalSets}</div>
        <div style="font-size:9.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.3px; margin-top:2px;">Sets (8wk)</div>
      </div>
      <div style="flex:1; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 10px; text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:22px; color:var(--chalk);">${lifetimeStats.trainingDays}</div>
        <div style="font-size:9.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.3px; margin-top:2px;">Days Trained</div>
      </div>
      <div style="flex:1; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 10px; text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:22px; color:var(--chalk);">${lifetimeStats.tonnageKg >= 1000 ? (lifetimeStats.tonnageKg/1000).toFixed(1)+'t' : lifetimeStats.tonnageKg+'kg'}</div>
        <div style="font-size:9.5px; color:var(--slate); text-transform:uppercase; letter-spacing:0.3px; margin-top:2px;">Tonnage Moved</div>
      </div>
    </div>` : '';

  const trendChartHtml = weeks ? `
    <div class="section-label">8-Week Volume Trend</div>
    <div style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 10px 6px 10px;">
      ${weeklyVolumeTrendSvg(weeks)}
    </div>` : '';

  const prsHtml = recentPRs.length ? `
    <div class="section-label">Recent PRs 🏆</div>
    <div style="padding:0 18px 6px 18px; display:flex; flex-direction:column; gap:8px;">
      ${recentPRs.map(pr => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--panel); border:1px solid rgba(240,197,66,0.3); border-radius:10px; padding:11px 13px;">
          <div>
            <div style="font-size:13px; color:var(--chalk); font-weight:600;">${pr.name}</div>
            <div style="font-size:11px; color:var(--slate); margin-top:1px;">${pr.date}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'Bebas Neue',sans-serif; font-size:17px; color:#F0C542;">${pr.weight}${pr.unit}${pr.perSide?' per':''}</div>
            <div style="font-size:10px; color:var(--good);">up from ${pr.unit==='lb' ? Math.round(convertWeight(pr.priorKg,'kg','lb')) : Math.round(pr.priorKg)}${pr.unit}</div>
          </div>
        </div>
      `).join('')}
    </div>` : '';

  const repRangeHtml = repRanges && (repRanges.strength + repRanges.hypertrophy + repRanges.endurance > 0) ? (() => {
    const total = repRanges.strength + repRanges.hypertrophy + repRanges.endurance;
    const pct = (n) => Math.round((n/total)*100);
    return `
    <div class="section-label">This Week's Rep Ranges</div>
    <div style="margin:0 18px 14px 18px;">
      <div style="display:flex; height:22px; border-radius:6px; overflow:hidden;">
        <div style="width:${pct(repRanges.strength)}%; background:#E8492A;"></div>
        <div style="width:${pct(repRanges.hypertrophy)}%; background:#8FBF7A;"></div>
        <div style="width:${pct(repRanges.endurance)}%; background:#3A6EA5;"></div>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:10.5px; color:var(--slate);">
        <div><span style="color:#E8492A;">●</span> Strength (1-5) ${pct(repRanges.strength)}%</div>
        <div><span style="color:#8FBF7A;">●</span> Hypertrophy (6-12) ${pct(repRanges.hypertrophy)}%</div>
        <div><span style="color:#3A6EA5;">●</span> Endurance (13+) ${pct(repRanges.endurance)}%</div>
      </div>
    </div>`;
  })() : '';

  const recsHtml = recommendations.length ? `
    <div class="section-label">Worth Adding 💡</div>
    <div style="padding:0 18px 6px 18px; display:flex; flex-direction:column; gap:8px;">
      ${recommendations.map(r => `
        <div class="rec-add-row" data-name="${r.name}" data-muscle="${r.muscle}" data-equip="${r.equipment||''}" style="display:flex; justify-content:space-between; align-items:center; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:11px 13px; cursor:pointer;">
          <div>
            <div style="font-size:13px; color:var(--chalk);">${r.name}</div>
            <div style="font-size:11px; color:var(--slate); margin-top:1px;">Targets ${BALANCE_LABELS[r.muscle]} - your lowest-covered muscle</div>
          </div>
          <div class="chev" style="color:var(--flame); font-size:20px;">+</div>
        </div>
      `).join('')}
    </div>` : '';

  const radarHtml = view === 'muscle' ? `
    <div class="section-label" style="text-align:center;">Shape of Your Week</div>
    <div style="display:flex; justify-content:center; padding:4px 0 18px 0;">${balanceRadarSvg(tally, mode)}</div>
  ` : '';

  let bodyContentHtml;
  if (view === 'ppl'){
    const pplTally = pplTallyFrom(tally);
    bodyContentHtml = `
      <div class="section-label">${mode === 'logged' ? 'Sets Logged, By Split' : 'Plan Coverage, By Split'}</div>
      ${pplBarsHtml(pplTally)}
      <div class="small" style="padding:8px 18px 0 18px; color:var(--slate);">Abdominals is folded into Legs for this split - push/pull/legs doesn't have a clean third home for core work.</div>
    `;
  } else {
    const barsHtml = balanceBarsHtml(tally, mode, prevTally, weeks);
    const frontSvg = balanceBodySvg(tally, mode, 'front');
    const backSvg = balanceBodySvg(tally, mode, 'back');
    bodyContentHtml = `
      ${radarHtml}
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
        ${renderBrandbar()}
        <div class="header"><div class="eyebrow">${mode === 'logged' ? 'LAST 7 DAYS' : 'WHOLE WEEKLY PLAN'}</div><h1>Balance</h1></div>
        <div class="seg" style="margin:10px 18px; display:flex; border:1px solid var(--line);">
          <div class="bal-seg-chip ${mode==='logged'?'active':''}" data-mode="logged" style="flex:1; text-align:center; padding:7px 0; font-family:'Bebas Neue',sans-serif; font-size:11.5px; letter-spacing:0.5px; color:${mode==='logged'?'var(--ink)':'var(--slate)'}; background:${mode==='logged'?'var(--flame)':'transparent'};">LOGGED THIS WEEK</div>
          <div class="bal-seg-chip ${mode==='plan'?'active':''}" data-mode="plan" style="flex:1; text-align:center; padding:7px 0; font-family:'Bebas Neue',sans-serif; font-size:11.5px; letter-spacing:0.5px; color:${mode==='plan'?'var(--ink)':'var(--slate)'}; background:${mode==='plan'?'var(--flame)':'transparent'};">FULL PLAN</div>
        </div>
        ${balanceHeroHtml(tally, prevTally, mode)}
        ${badgesHtml}
        ${scoreAndVarietyHtml}
        ${comebackHtml}
        ${heatmapSectionHtml}
        ${restSummaryHtml}
        ${perDayChartHtml}
        ${lifetimeHtml}
        ${sessionStatsHtml}
        ${wisdomHtml}
        ${didYouKnowHtml}
        ${trendChartHtml}
        ${balanceInsightsHtml(insights)}
        ${prsHtml}
        ${gainerHtml}
        ${oneRmHtml}
        ${mostLoggedHtml}
        ${volumeByLocationHtml}
        ${leaderboardHtml}
        ${recoveryClockHtml}
        ${repRangeHtml}
        ${compoundSplitHtml}
        ${equipmentHtml}
        ${coverageStatsHtml}
        ${biggestSmallestHtml}
        ${recsHtml}
        ${freqGuideHtml}
        <div class="seg" style="margin:14px 18px 10px 18px; display:flex; border:1px solid var(--line);">
          <div class="bal-view-chip ${view==='muscle'?'active':''}" data-view="muscle" style="flex:1; text-align:center; padding:6px 0; font-family:'Bebas Neue',sans-serif; font-size:11px; letter-spacing:0.5px; color:${view==='muscle'?'var(--ink)':'var(--slate)'}; background:${view==='muscle'?'var(--flame)':'transparent'};">MUSCLE GROUPS</div>
          <div class="bal-view-chip ${view==='ppl'?'active':''}" data-view="ppl" style="flex:1; text-align:center; padding:6px 0; font-family:'Bebas Neue',sans-serif; font-size:11px; letter-spacing:0.5px; color:${view==='ppl'?'var(--ink)':'var(--slate)'}; background:${view==='ppl'?'var(--flame)':'transparent'};">PUSH / PULL / LEGS</div>
        </div>
        ${mode === 'plan' ? `<div class="small" style="padding:0 18px 8px 18px; color:var(--slate);">Counts exercise slots across every day (alt-group siblings count once, as one slot), regardless of what's been logged.</div>` : `<div class="small" style="padding:0 18px 8px 18px; color:var(--slate);">Target zone is a general guideline (~${BALANCE_TARGET_MIN}-${BALANCE_TARGET_MAX} weekly sets), not personalized advice.</div>`}
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
  document.querySelectorAll('.rec-add-row').forEach(row => {
    row.onclick = () => openSuggestionPreview(row.dataset.name, EQUIPMENT_TO_CATEGORY[row.dataset.equip] || 'Other');
  });
}


// ---------- ME ----------
async function getDayStats(weekday){
  const userData = { user: await getCurrentUser() };
  if (!userData || !userData.user) return { weekday, label: DAY_NAMES[weekday], exerciseCount: 0, setCount: 0 };
  const useMaster = getUseExerciseMasterFlag();
  const allExercises = await fetchAllExercisesCompat(userData.user.id);
  const exercises = allExercises.filter(ex => ex.weekday === weekday);
  let setCount = 0;
  if (exercises.length > 0){
    const ids = exercises.map(e => useMaster ? e.masterId : e.id);
    const idField = useMaster ? 'exercise_master_id' : 'exercise_id';
    const setResult = await withTimeout(
      supabaseClient.from('sets').select('id', { count: 'exact', head: true }).in(idField, ids),
      15000
    );
    setCount = setResult.__timeout || setResult.error ? 0 : (setResult.count || 0);
  }
  const rawLabel = await loadDayType(weekday);
  const label = (typeof rawLabel === 'string' && rawLabel)
    ? rawLabel
    : (rawLabel && rawLabel.__unavailable ? '—' : DAY_NAMES[weekday]);
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
      try {
        await performDaySwap(dayA, dayB);
        overlay.remove();
        state.selectedDay = dayB;
        state.currentTab = 'track';
        renderTrack();
      } catch(e){
        alert(e.message);
        btn.disabled = false; btn.textContent = 'Swap These Days';
      }
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
  const userData = { user: await getCurrentUser() };
  const uid = userData.user.id;
  const useMaster = getUseExerciseMasterFlag();
  const failures = [];

  if (useMaster){
    // Fetch every exercise_days row for both days, keyed by exercise_master_id
    // so an exercise that happens to exist on both days already can be
    // detected and handled instead of colliding with itself mid-swap.
    const [resA, resB] = await Promise.all([
      supabaseClient.from('exercise_days').select('id, exercise_master_id').eq('user_id', uid).eq('weekday', dayA),
      supabaseClient.from('exercise_days').select('id, exercise_master_id').eq('user_id', uid).eq('weekday', dayB)
    ]);
    const rowsA = resA.data || [];
    const rowsB = resB.data || [];
    const masterIdsOnB = new Set(rowsB.map(r => r.exercise_master_id));
    const masterIdsOnA = new Set(rowsA.map(r => r.exercise_master_id));

    for (const row of rowsA){
      if (masterIdsOnB.has(row.exercise_master_id)){
        // Already exists on both days - swapping A and B is a no-op for this
        // exercise (it stays on both either way), so leave both links exactly
        // as they are. Deleting either one would remove it from the week
        // entirely, which is what was happening here before.
        continue;
      }
      const { data, error } = await supabaseClient.from('exercise_days').update({ weekday: dayB }).eq('id', row.id).select();
      if (error || !data || !data.length) failures.push(`an exercise moving from ${DAY_NAMES[dayA]} to ${DAY_NAMES[dayB]}: ${error ? error.message : 'update matched zero rows'}`);
    }
    for (const row of rowsB){
      if (masterIdsOnA.has(row.exercise_master_id)){
        continue;
      }
      const { data, error } = await supabaseClient.from('exercise_days').update({ weekday: dayA }).eq('id', row.id).select();
      if (error || !data || !data.length) failures.push(`an exercise moving from ${DAY_NAMES[dayB]} to ${DAY_NAMES[dayA]}: ${error ? error.message : 'update matched zero rows'}`);
    }
  } else {
    // Old structure: rows are day-specific copies, so there's no shared-identity
    // collision risk the way there is under exercise_master - a plain bulk
    // update is safe, but still verified.
    const [resA, resB] = await Promise.all([
      supabaseClient.from('exercises').select('id').eq('user_id', uid).eq('weekday', dayA),
      supabaseClient.from('exercises').select('id').eq('user_id', uid).eq('weekday', dayB)
    ]);
    const idsA = (resA.data || []).map(r => r.id);
    const idsB = (resB.data || []).map(r => r.id);
    if (idsA.length > 0){
      const { data, error } = await supabaseClient.from('exercises').update({ weekday: dayB }).in('id', idsA).select();
      if (error || !data || data.length !== idsA.length) failures.push(`exercises moving from ${DAY_NAMES[dayA]} to ${DAY_NAMES[dayB]}: ${error ? error.message : 'not all rows updated'}`);
    }
    if (idsB.length > 0){
      const { data, error } = await supabaseClient.from('exercises').update({ weekday: dayA }).in('id', idsB).select();
      if (error || !data || data.length !== idsB.length) failures.push(`exercises moving from ${DAY_NAMES[dayB]} to ${DAY_NAMES[dayA]}: ${error ? error.message : 'not all rows updated'}`);
    }
  }

  // Check for failures BEFORE touching the day labels - if any exercise
  // failed to actually move, the labels must not swap either, or the day
  // ends up showing a label that no longer matches what's actually on it
  // (exactly the "Lower day full of Shoulder Press" report). Better to leave
  // both the labels and the exercises in their original, at-least-consistent
  // state and surface the failure clearly than to half-apply a swap.
  if (failures.length){
    throw new Error(`Exercises did not all move, so nothing was swapped:\n${failures.join('\n')}`);
  }

  const [dtA, dtB] = await Promise.all([
    supabaseClient.from('day_types').select('label').eq('user_id', uid).eq('weekday', dayA).maybeSingle(),
    supabaseClient.from('day_types').select('label').eq('user_id', uid).eq('weekday', dayB).maybeSingle()
  ]);
  // Only use REAL labels the user actually set. Previously this silently
  // fell back to DAY_TYPES[dayA] (a hardcoded default like "Chest & Triceps"
  // that the user might have never chosen) and wrote it INTO the database
  // as if it were a real label - so a swap involving a day with no
  // day_types row could permanently bake a fake default into the plan.
  const labelA = dtA.data ? dtA.data.label : null;
  const labelB = dtB.data ? dtB.data.label : null;
  // Only write each side when there's a real label to write. Missing rows
  // stay missing after the swap (nothing to swap in), which is faithful to
  // "the user never set this" and won't pollute the database.
  if (labelB !== null){
    await supabaseClient.from('day_types').upsert({ user_id: uid, weekday: dayA, label: labelB }, { onConflict: 'user_id,weekday' });
  } else if (dtA.data){
    // Day A had a label, Day B did not - after the swap, Day A should end
    // up empty, matching what Day B was.
    await supabaseClient.from('day_types').delete().eq('user_id', uid).eq('weekday', dayA);
  }
  if (labelA !== null){
    await supabaseClient.from('day_types').upsert({ user_id: uid, weekday: dayB, label: labelA }, { onConflict: 'user_id,weekday' });
  } else if (dtB.data){
    await supabaseClient.from('day_types').delete().eq('user_id', uid).eq('weekday', dayB);
  }
}

async function renderMe(){
  const userData = { user: await getCurrentUser() };
  const email = userData && userData.user ? userData.user.email : '';
  const initial = email ? email[0].toUpperCase() : '?';
  const isOwner = !!(userData && userData.user && userData.user.id === APP_OWNER_USER_ID);
  app.innerHTML = `
    <div class="app-shell">
      <div class="scroll-area">
        ${renderBrandbar()}
        <div class="header"><div class="eyebrow">ACCOUNT</div><h1>Me</h1></div>
        <div class="account-card">
          <div class="avatar">${initial}</div>
          <div><div class="account-email">${email}</div><div class="account-tag">● Signed in</div></div>
        </div>
        <div class="me-item" id="replayTourBtn"><div>How MonoLift Works</div><div class="chev">›</div></div>
        <div class="me-item" id="backupPlanBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
          <div><div>Backup Plan</div><div class="small" style="color:var(--slate); margin-top:2px;">Save a snapshot before you shake things up</div></div>
          <div class="chev" style="margin-top:2px;">›</div>
        </div>
        <div class="section-label">Data</div>
        <div class="me-item" id="locationSubPageBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
          <div><div>Locations</div><div class="small" style="color:var(--slate); margin-top:2px;">Your gyms — what each one has, and which is your default</div></div>
          <div class="chev" style="margin-top:2px;">›</div>
        </div>
        <div class="me-item" id="equipmentSubPageBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
          <div><div>Equipment</div><div class="small" style="color:var(--slate); margin-top:2px;">Kit you own and take with you — bands, and more later</div></div>
          <div class="chev" style="margin-top:2px;">›</div>
        </div>
        <div class="me-item" id="publishMonoLiftBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
          <div><div>MonoLift Database</div><div class="small" style="color:var(--slate); margin-top:2px;">Contribute exercises you use that aren't in the public database</div></div>
          <div class="chev" style="margin-top:2px;">›</div>
        </div>
        ${isOwner ? `<div class="me-item" id="approveContributorsBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
          <div><div>Approve Contributors</div><div class="small" style="color:var(--slate); margin-top:2px;">Approve who can add to the MonoLift database</div></div>
          <div class="chev" style="margin-top:2px;">›</div>
        </div>` : ''}
        <div class="me-item" id="planSubPageBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
          <div><div>Plan</div><div class="small" style="color:var(--slate); margin-top:2px;">Reorganize, swap days, redo setup, tag workouts</div></div>
          <div class="chev" style="margin-top:2px;">›</div>
        </div>
        <div class="section-label">App</div>
        <div class="me-item" id="shareAppBtn"><div>Share MonoLift</div><div class="chev">›</div></div>
        <div class="me-item" id="refreshAppBtn"><div>Refresh App</div><div class="chev">›</div></div>
        <div class="me-item" id="updateAppBtn"><div>Check for Updates</div><div class="chev">›</div></div>
        <div class="me-item" id="signOutBtn"><div>Sign Out</div><div class="chev">›</div></div>
        <div style="text-align:center; padding:18px 0; color:var(--slate); font-family:'JetBrains Mono',monospace; font-size:10.5px;">MonoLift · ${APP_VERSION}</div>
      </div>
      ${renderTabbar()}
    </div>`;
  attachShellHandlers();
  document.getElementById('replayTourBtn').onclick = () => showOnboarding('teach');
  document.getElementById('backupPlanBtn').onclick = openBackupPlanScreen;
  document.getElementById('locationSubPageBtn').onclick = () => openLocationSubPage();
  document.getElementById('equipmentSubPageBtn').onclick = () => openEquipmentSubPage();
  document.getElementById('publishMonoLiftBtn').onclick = () => openPublishToMonoLiftScreen();
  if (isOwner) document.getElementById('approveContributorsBtn').onclick = () => openApproveContributorsScreen();
  document.getElementById('planSubPageBtn').onclick = () => openPlanSubPage();
  document.getElementById('shareAppBtn').onclick = async () => {
    const shareUrl = `${location.origin}${location.pathname}`.replace(/\/index\.html$/, '/');
    const shareData = { title: 'MonoLift', text: 'Check out MonoLift - a gym tracking app I use.', url: shareUrl };
    if (navigator.share){
      try { await navigator.share(shareData); } catch(e) { /* user cancelled the native share sheet - nothing to do */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Link copied to clipboard - paste it anywhere to share.');
    } catch(e){
      prompt('Copy this link to share:', shareUrl);
    }
  };
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
    invalidateTrackSnapshots(); // never leave one account's plan cached for the next
    await supabaseClient.auth.signOut();
  };
}

// ---------- INIT / AUTH STATE ----------
supabaseClient.auth.onAuthStateChange((_event, session) => {
  const hadSession = !!state.session;
  const hasSession = !!session;
  state.session = session;
  // Identity may have changed - drop the memoised user so nothing reads a
  // stale id against a different session.
  clearCachedUser();
  if (hadSession === hasSession) return;
  if (session) { state.currentTab = 'track'; renderTrack(); }
  else renderLogin();
});

// When the app comes back to the foreground on a new calendar day, state.selectedDay
// still points at whatever weekday was current when the app was last opened - so
// Track would show yesterday's plan until the user manually taps another day or
// fully reloads. This snapping only happens if the user was actively viewing what
// was "today" at the time - if they were intentionally browsing a different day
// (e.g. planning ahead), we respect that choice and don't hijack their view.
let __lastKnownWeekday = todayWeekday();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const newToday = todayWeekday();
  if (newToday === __lastKnownWeekday) {
    // Same calendar day - just refresh Track for freshness (headers, streaks) if we're on it
    if (state.currentTab === 'track' && state.session) renderTrack();
    return;
  }
  // Genuine day rollover - was the user on "today"'s tab when they left?
  const wasViewingToday = state.selectedDay === __lastKnownWeekday;
  __lastKnownWeekday = newToday;
  if (wasViewingToday) {
    state.selectedDay = newToday;
  }
  if (state.currentTab === 'track' && state.session) renderTrack();
});

supabaseClient.auth.getSession().then(({ data: { session } }) => {
  state.session = session;
  if (session) {
    renderTrack().then(maybeShowOnboarding);
    // Kick off the master flag heal and hold the promise so any write
    // operation can await it, closing the race where a save between boot
    // and heal completion would go to the wrong schema.
    __masterFlagHealPromise = healMasterFlagFromDb().finally(() => { __masterFlagHealPromise = null; });
  } else renderLogin();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js'));
  // The service worker now serves the HTML from cache for an instant open and
  // revalidates in the background. That trade only holds if the user still
  // finds out about new versions, so the worker messages us when the freshly
  // fetched HTML differs from what it served, and we offer a reload rather
  // than forcing one mid-workout.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'APP_UPDATE_AVAILABLE') return;
    if (document.getElementById('updateToast')) return;
    const toast = document.createElement('div');
    toast.id = 'updateToast';
    toast.innerHTML = `<span>Update available</span><button id="updateReloadBtn">Reload</button>`;
    document.body.appendChild(toast);
    document.getElementById('updateReloadBtn').onclick = () => location.reload();
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 12000);
  });
}
