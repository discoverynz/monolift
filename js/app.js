// Zealift — app.js (Pass 2: Track + Scale + Phase + Me, alt groups, fixed tab bar)

const DAY_NAMES = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
const DAY_LABELS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_TYPES = ["Chest & Triceps","Back & Biceps","Chest & Back","Shoulders & Arms","Legs & Abs","Hybrid Circuit","Rest / Walk"];
const APP_VERSION = 'Beta 5.79';
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
  const existingResult = await withTimeout(
    supabaseClient.from('exercises').select('id').eq('user_id', userData.user.id).eq('weekday', weekday).ilike('name', name).eq('active', true).maybeSingle(),
    15000
  );
  if (!existingResult.__timeout && !existingResult.error && existingResult.data){ renderTrack(); return; }
  const { error } = await insertExerciseSafely({ user_id: userData.user.id, name, category, weekday, alt_group_id: null });
  if (error){ alert(error.message); return; }
  renderTrack();
}

function getGroupByPref(){ return localStorage.getItem('zealift_group_by') || 'equipment'; }
function getSplitModePref(){ return localStorage.getItem('zealift_split_mode') || 'ppl'; }
function setSplitModePref(v){ localStorage.setItem('zealift_split_mode', v); }
function getSplitSubGroupPref(){ return localStorage.getItem('zealift_split_subgroup') || 'equipment'; }
// Rebuild Stage 4c feature flag - defaults OFF. When on, both the read path
// (loadExercises) and the write path (saveEntry, PR detection) consistently
// use exercise_master identity instead of the old per-day exercises table.
// Turning this off again requires no code push - it's just a local setting.
function getUseExerciseMasterFlag(){ return localStorage.getItem('zealift_use_exercise_master') === 'true'; }
function setUseExerciseMasterFlag(v){ localStorage.setItem('zealift_use_exercise_master', v ? 'true' : 'false'); }
function setSplitSubGroupPref(v){ localStorage.setItem('zealift_split_subgroup', v); }
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

// Muscle grouping is normally auto-detected by fuzzy-matching the exercise
// name against the exercise database - this lets a person pin a specific
// exercise to a muscle group manually, overriding the auto-detection when
// it's wrong or just not how they think about that exercise. The override
// stores the final label directly (e.g. "Rear Delts"), not a broad muscle
// that still needs further processing.
function getEffectiveMuscleLabel(ex, db){
  if (ex && ex.muscle_override) return ex.muscle_override;
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
    if (ex.upper_lower === 'lower') return 'legs';
    return ex.push_pull || null;
  }
  if (splitType === 'upperlower') return ex.upper_lower || null;
  if (splitType === 'muscle') return m || null;
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
function selectBalancedSlots(slots, targetSize){
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
      if (am === bm) return 0;
      if (am === 'compound') return -1;
      if (bm === 'compound') return 1;
      return 0;
    });
  });
  const regionKeys = Object.keys(byRegion);
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
  if (category === 'push') return ex.push_pull === 'push' && ex.upper_lower !== 'lower';
  if (category === 'pull') return ex.push_pull === 'pull' && ex.upper_lower !== 'lower';
  if (category === 'legs') return ex.upper_lower === 'lower';
  if (category === 'upper') return ex.upper_lower === 'upper';
  if (category === 'lower') return ex.upper_lower === 'lower';
  if (category === 'chestback') return ['chest','lats','traps','middle back','lower back'].includes(m);
  if (category === 'shouldersarms') return ['shoulders','biceps','triceps','forearms'].includes(m);
  if (category === 'fullbody') return !!m;
  return m === category; // bro-split style: category IS the muscle name directly
}

function movementPatternOf(name){
  const n = name.toLowerCase();
  return MOVEMENT_PATTERNS.find(p => n.includes(p)) || null;
}

// Groups a day's ungrouped exercises into proposed alt-group clusters (2+
// members sharing the same primary muscle and movement pattern). Returns
// proposals only - nothing is created or assigned until the user confirms
// each one individually in the review screen.
// Auto-Alt 2.0: clusters by fine muscle region (Upper/Mid/Lower Chest, Front/
// Side/Rear Delts, Lats vs Upper Back - not just the broad muscle) AND
// movement pattern AND compound/isolation consistency. A true substitute
// should train the same muscle region the same way for the same purpose -
// pairing a flat bench press with an incline press just because both are
// "chest" is looser than what real programming calls interchangeable.
async function proposeAltGroups(dayExercises){
  const db = await loadExerciseDB();
  const ungrouped = dayExercises.filter(ex => !ex.alt_group_id);
  const buckets = {};
  ungrouped.forEach(ex => {
    const pattern = movementPatternOf(ex.name);
    if (!pattern) return;
    const match = matchExercise(ex.name, db);
    const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
    if (!muscle) return;
    const fineMuscle = fineMuscleCategory(muscle, ex.name);
    const mech = classifyMechanic(match);
    const mechKey = mech ? mech.value : 'unknown';
    const key = fineMuscle + '|' + pattern + '|' + mechKey;
    (buckets[key] = buckets[key] || []).push(ex);
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
function todayStr(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
  if (getUseExerciseMasterFlag()) return loadExercisesFromMaster();
  let result = await withTimeout(
    supabaseClient.from('exercises')
      .select('id, name, category, alt_group_id, alt_groups(name, color), location_ids, muscle_override')
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
        .eq('weekday', state.selectedDay)
        .eq('active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true }),
      15000
    );
  }
  if (result.__timeout){ state.exercises = []; return; }
  const { data: exercises, error } = result;
  if (error){ console.error(error); state.exercises = []; return; }

  const exerciseIds = (exercises || []).map(ex => ex.id);
  let lastSetByExercise = {};
  let maxSetByExercise = {};
  if (exerciseIds.length){
    const { data: userData } = await supabaseClient.auth.getUser();
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
      supabaseClient.from('sets').select('exercise_id, weight, weight_unit, weight_type, reps, num_sets, logged_at, location_id')
        .in('exercise_id', [...prQueryIds]).order('logged_at', { ascending: false }),
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
          .in('exercise_id', [...prQueryIds]).order('logged_at', { ascending: false }),
        15000
      );
    }
    let allSets = setsResult.__timeout || setsResult.error ? [] : (setsResult.data || []);
    // Track's preview reflects only the currently active location, since the
    // same exercise can be loaded very differently machine to machine. The
    // full unfiltered history still shows everything once you open the
    // exercise itself - this only narrows what the row preview shows.
    const activeLocationId = getCurrentLocationId();
    if (activeLocationId && locationDataAvailable) allSets = allSets.filter(s => s.location_id === activeLocationId);
    const idToLowerName = {};
    allUserExercises.forEach(ex => { idToLowerName[ex.id] = (ex.name || '').toLowerCase(); });
    // Results are ordered newest-first, so the first time we see an exercise_id is its most recent set.
    allSets.forEach(s => { if (!lastSetByExercise[s.exercise_id]) lastSetByExercise[s.exercise_id] = s; });
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
    const loggedToday = lastSet && lastSet.logged_at === todayStr();
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

  state.exercises = withLogs;
}

// The exercise_master version of loadExercises - one row per real exercise,
// so all the old sibling-hunting-by-name logic (needed because the same
// exercise used to live as separate isolated records per day) simply isn't
// needed anymore. Produces the exact same output shape as loadExercises so
// everything downstream (renderTrack, exerciseRow, etc.) works unmodified.
async function loadExercisesFromMaster(){
  const { data: userData } = await supabaseClient.auth.getUser();
  const uid = userData.user.id;

  const result = await withTimeout(
    supabaseClient.from('exercise_days')
      .select('exercise_master_id, exercise_master(id, name, category, alt_group_id, alt_groups(name, color), location_ids, muscle_override)')
      .eq('user_id', uid)
      .eq('weekday', state.selectedDay),
    15000
  );
  if (result.__timeout || result.error){ console.error('exercise_days query failed', result.error); state.exercises = []; return; }

  const exercises = (result.data || [])
    .map(row => row.exercise_master)
    .filter(Boolean)
    .sort((a,b) => (a.category||'').localeCompare(b.category||'') || a.name.localeCompare(b.name));

  const masterIds = exercises.map(ex => ex.id);
  let lastSetByExercise = {};
  let maxSetByExercise = {};
  if (masterIds.length){
    let setsResult = await withTimeout(
      supabaseClient.from('sets').select('exercise_master_id, weight, weight_unit, weight_type, reps, num_sets, logged_at, location_id')
        .in('exercise_master_id', masterIds).order('logged_at', { ascending: false }),
      15000
    );
    let locationDataAvailable = true;
    if (!setsResult.__timeout && setsResult.error){
      console.error('Sets query failed, retrying without location_id:', setsResult.error);
      locationDataAvailable = false;
      setsResult = await withTimeout(
        supabaseClient.from('sets').select('exercise_master_id, weight, weight_unit, weight_type, reps, num_sets, logged_at')
          .in('exercise_master_id', masterIds).order('logged_at', { ascending: false }),
        15000
      );
    }
    let allSets = setsResult.__timeout || setsResult.error ? [] : (setsResult.data || []);
    const activeLocationId = getCurrentLocationId();
    if (activeLocationId && locationDataAvailable) allSets = allSets.filter(s => s.location_id === activeLocationId);
    allSets.forEach(s => { if (!lastSetByExercise[s.exercise_master_id]) lastSetByExercise[s.exercise_master_id] = s; });
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
  }

  const withLogs = exercises.map(ex => {
    const lastSet = lastSetByExercise[ex.id] || null;
    const loggedToday = lastSet && lastSet.logged_at === todayStr();
    const maxSet = maxSetByExercise[ex.id] || null;
    const showPr = maxSet && lastSet && maxSet.logged_at !== lastSet.logged_at;
    return { ...ex, lastSet, loggedToday, maxSet, showPr };
  });

  const doneGroupMember = {};
  withLogs.forEach(ex => { if (ex.alt_group_id && ex.loggedToday) doneGroupMember[ex.alt_group_id] = ex.name; });
  withLogs.forEach(ex => {
    if (ex.alt_group_id && !ex.loggedToday && doneGroupMember[ex.alt_group_id]) {
      ex.completeVia = doneGroupMember[ex.alt_group_id];
    }
  });

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
function getDefaultLocationId(){ return localStorage.getItem('zealift_default_location') || null; }
function setDefaultLocationId(id){ if (id) localStorage.setItem('zealift_default_location', id); else localStorage.removeItem('zealift_default_location'); }
function getHideCompletedPref(){ return localStorage.getItem('zealift_hide_completed') === '1'; }
function setHideCompletedPref(v){ localStorage.setItem('zealift_hide_completed', v ? '1' : '0'); }
function setCurrentLocationId(id){ if (id) localStorage.setItem('zealift_current_location', JSON.stringify({ id, date: todayStr() })); else localStorage.removeItem('zealift_current_location'); }

// An exercise with no locations set is available everywhere (untagged = universal,
// so introducing locations doesn't break exercises nobody's gotten around to
// tagging yet). Otherwise it's available only where explicitly tagged.
function isAvailableAtLocation(ex, locationId){
  if (!locationId) return true;
  if (!ex.location_ids || ex.location_ids.length === 0) return true;
  return ex.location_ids.includes(locationId);
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

  let subtitle, showCheck, isDone = false;
  if (ex.loggedToday){
    subtitle = `<div class="ex-last done">✓ Logged today — ${formatSetValue(ex.lastSet)}</div>`;
    showCheck = true; isDone = true;
  } else if (ex.completeVia){
    subtitle = `<div class="ex-last via">↳ Complete via ${ex.completeVia}</div>`;
    showCheck = true; isDone = true;
  } else {
    // Shows the best set ever recorded (any day), not just the most recent one -
    // one line, whichever number is actually the most useful to see.
    const best = ex.maxSet || ex.lastSet;
    subtitle = `<div class="ex-last">${best ? formatSetValue(best) + ' · ' + formatLoggedDate(best.logged_at) : 'Not logged yet'}</div>`;
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

  return `<div class="exercise" style="${borderStyle}" data-id="${ex.id}" data-name="${ex.name}">
    ${cornerTag}
    <div style="flex:1; min-width:0; ${topPad}">
      <div class="ex-name">${ex.name}${mechTag}</div>
      ${subtitle}
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

function openLocationSubPage(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeLocSubPage">✕</button><h1>Location</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="me-item" id="subDefaultLocationBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Default Location</div><div class="small" style="color:var(--slate); margin-top:2px;">Used when logging a set if Track isn't set to a specific location</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subBulkLocationBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Assign Location</div><div class="small" style="color:var(--slate); margin-top:2px;">Tell the app what's where, gym by gym</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subManageLocationsBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Manage Locations</div><div class="small" style="color:var(--slate); margin-top:2px;">Rename or delete a location</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subRetagBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Retag Location From Notes</div><div class="small" style="color:var(--slate); margin-top:2px;">Bulk-fix past sets: Functional Fitness unless notes mention Smales</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeLocSubPage').onclick = () => overlay.remove();
  overlay.querySelector('#subDefaultLocationBtn').onclick = () => openDefaultLocationPicker();
  overlay.querySelector('#subBulkLocationBtn').onclick = () => openBulkLocationAssign();
  overlay.querySelector('#subManageLocationsBtn').onclick = () => openManageLocationsScreen();
  overlay.querySelector('#subRetagBtn').onclick = () => openRetagLocationFromNotesScreen();
}

function openPlanSubPage(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closePlanSubPage">✕</button><h1>Plan</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll">
      <div class="me-item" id="subReorganizeBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Reorganize</div><div class="small" style="color:var(--slate); margin-top:2px;">Whole week or just one day - Zealift rebuilds it for you</div></div>
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
      <div class="me-item" id="subDupeCleanBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Clean Up Duplicates</div><div class="small" style="color:var(--slate); margin-top:2px;">Find and merge the same exercise showing up more than once on a day</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subFixAltsBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Fix Alt Groups</div><div class="small" style="color:var(--slate); margin-top:2px;">Clean up groups scattered across days or named after one</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subRefreshMuscleBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div>Refresh Muscle Categories</div><div class="small" style="color:var(--slate); margin-top:2px;">Let newer, more specific auto-detection replace old broad-only overrides</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subMigrateMasterBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div style="color:#E8A33D;">Migrate to Exercise Master (Rebuild - Stage 2)</div><div class="small" style="color:var(--slate); margin-top:2px;">Safe, additive-only - writes to new tables, never touches your current data</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subExportBackupBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div style="color:#E8A33D;">Export Full Backup (Rebuild - Stage 3)</div><div class="small" style="color:var(--slate); margin-top:2px;">A real downloadable file with everything - before Stage 4 touches anything live</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subVerifyBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div style="color:#E8A33D;">Verify New Data Matches Old (Rebuild - Stage 4a)</div><div class="small" style="color:var(--slate); margin-top:2px;">Day-by-day comparison before anything live gets switched over</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div class="me-item" id="subLinkSetsBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
        <div><div style="color:#E8A33D;">Link Sets to Exercise Master (Rebuild - Stage 4b)</div><div class="small" style="color:var(--slate); margin-top:2px;">Additive-only - links every set to the new structure without touching its original link</div></div>
        <div class="chev" style="margin-top:2px;">›</div>
      </div>
      <div style="margin:0 18px 12px 18px; background:var(--panel); border:1px solid #4a2f16; border-radius:10px; padding:14px;">
        <div class="ex-name" style="font-size:13px; color:#E8A33D;">Use New Exercise Structure (Rebuild - Stage 4c)</div>
        <div class="small" style="color:var(--slate); margin-top:4px; line-height:1.5;">Switches Track and History over to read and write through exercise_master. Turning this off again takes effect immediately - no app update needed.</div>
        <div id="masterFlagToggle" style="margin-top:10px;"></div>
      </div>
      ${localStorage.getItem('zealift_reorg_snapshot') ? `<div class="me-item" id="subRevertReorgBtn"><div style="color:#E8A33D;">Revert Last Reorganization</div><div class="chev">›</div></div>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closePlanSubPage').onclick = () => overlay.remove();
  overlay.querySelector('#subReorganizeBtn').onclick = openReorganizeChoice;
  overlay.querySelector('#subSwapDaysBtn').onclick = openSwapDaysForm;
  overlay.querySelector('#subRedoWeekBtn').onclick = () => showOnboarding('setup');
  overlay.querySelector('#subScanSplitTagsBtn').onclick = openSplitTagReview;
  overlay.querySelector('#subDupeCleanBtn').onclick = openDuplicateCleanupScreen;
  overlay.querySelector('#subFixAltsBtn').onclick = openFixAltGroupsScreen;
  overlay.querySelector('#subRefreshMuscleBtn').onclick = openRefreshMuscleCategoriesScreen;
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
    toggleArea.querySelector('#masterFlagOff').onclick = () => { setUseExerciseMasterFlag(false); renderMasterFlagToggle(); if (state.currentTab === 'track') renderTrack(); };
    toggleArea.querySelector('#masterFlagOn').onclick = () => { setUseExerciseMasterFlag(true); renderMasterFlagToggle(); if (state.currentTab === 'track') renderTrack(); };
  }
  renderMasterFlagToggle();
  const subRevertBtn = overlay.querySelector('#subRevertReorgBtn');
  if (subRevertBtn) subRevertBtn.onclick = revertLastReorganization;
}

async function openLinkSetsToMasterScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeLinkSets">✕</button><h1>Link Sets to Exercise Master</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="linkSetsBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Reading everything…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeLinkSets').onclick = () => overlay.remove();

  const { data: userData } = await supabaseClient.auth.getUser();
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

  const { data: userData } = await supabaseClient.auth.getUser();
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
    const { data: userData } = await supabaseClient.auth.getUser();
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

  const { data: userData } = await supabaseClient.auth.getUser();

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
    <div class="small" style="padding:12px 18px; color:var(--slate); line-height:1.6;">This is a safe, read-only-first step. It only writes to the new exercise_master and exercise_days tables - your existing exercises table is never modified or deleted. The app keeps working exactly as it does now until a later stage switches it over. Inactive exercises get a master record too (so any real history logged against them still has somewhere to link), but no day-links, since they're not currently placed anywhere.</div>
    <div class="proposal-card" style="margin:0 18px 14px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px;">
      <div class="ex-name" style="font-size:14px; margin-bottom:6px;">${groups.length} distinct exercises found</div>
      <div class="small" style="color:var(--slate);">from ${all.length} current day-by-day records, spanning ${groups.reduce((s,g)=>s+g.weekdays.length,0)} day-links total</div>
    </div>
    <button class="save-btn" id="confirmMigrateBtn" style="margin:0 18px 20px 18px;">Write to New Tables</button>
  `;

  body.querySelector('#confirmMigrateBtn').onclick = async () => {
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
        if (dayError) errors.push(`${t.name} (${DAY_NAMES[weekday]}): ${dayError.message}`);
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

async function openRefreshMuscleCategoriesScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeRefreshMuscle">✕</button><h1>Refresh Muscle Categories</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="refreshMuscleBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Scanning…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeRefreshMuscle').onclick = () => overlay.remove();

  const { data: userData } = await supabaseClient.auth.getUser();
  const [exResult, db] = await Promise.all([
    withTimeout(supabaseClient.from('exercises').select('id, name, muscle_override').eq('user_id', userData.user.id).eq('active', true), 15000),
    loadExerciseDB()
  ]);
  const all = exResult.__timeout || exResult.error ? [] : (exResult.data || []);
  // These are exactly the broad-only categories that existed before this
  // session added subdivision for Triceps, Biceps, Calves, Forearms, and
  // Traps. An override that matches one of these exactly almost certainly
  // predates the more specific options ever existing, rather than being a
  // deliberate choice to avoid them - so it's worth offering to refresh.
  const broadOnlyLabels = new Set(['Chest','Shoulders','Lats','Upper Back','Middle back','Lower back','Traps','Biceps','Triceps','Forearms','Quadriceps','Hamstrings','Glutes','Calves','Adductors','Abductors','Abdominals','Neck']);
  const byName = {};
  all.forEach(ex => { if (!byName[ex.name.toLowerCase()]) byName[ex.name.toLowerCase()] = ex; });
  const candidates = [];
  Object.values(byName).forEach(ex => {
    if (!ex.muscle_override || !broadOnlyLabels.has(ex.muscle_override)) return;
    const match = matchExercise(ex.name, db);
    const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
    if (!muscle) return;
    // Only a candidate if the override is exactly the exercise's own natural
    // broad category with no customization at all - a deliberately different
    // override (like a curl manually set to Shoulders) is real personalization
    // and must never be touched, regardless of what auto-detection would say.
    if (cap(muscle) !== ex.muscle_override) return;
    const wouldBe = fineMuscleCategory(muscle, ex.name);
    if (wouldBe && wouldBe !== ex.muscle_override) candidates.push({ ex, from: ex.muscle_override, to: wouldBe });
  });

  const body = overlay.querySelector('#refreshMuscleBody');
  if (!candidates.length){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">Nothing to refresh - either everything's already auto-detected, or your overrides are genuinely custom choices, not just old broad categories.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="small" style="padding:12px 18px; color:var(--slate); line-height:1.6;">${candidates.length} exercise${candidates.length===1?' has':'s have'} a manually-set muscle category that predates more specific options existing. Clearing these lets the newer, more specific auto-detection take over - anything left unchecked stays exactly as it is.</div>
    ${candidates.map((c, i) => `
      <div class="pick-row" data-i="${i}" style="align-items:flex-start; padding-top:10px; padding-bottom:10px;">
        <div><div class="ex-name" style="font-size:13px;">${c.ex.name}</div><div class="small" style="color:var(--slate); margin-top:2px;">${c.from} → ${c.to}</div></div>
        <div class="check-circle refresh-check active">${ICON_CHECK}</div>
      </div>
    `).join('')}
    <button class="save-btn" id="confirmRefreshMuscleBtn" style="margin:20px 18px 20px 18px;">Refresh Selected</button>
  `;
  const included = new Set(candidates.map((c,i) => i));
  body.querySelectorAll('.pick-row[data-i]').forEach(row => {
    row.onclick = () => {
      const i = parseInt(row.dataset.i, 10);
      const check = row.querySelector('.refresh-check');
      if (included.has(i)){ included.delete(i); check.classList.remove('active'); check.style.opacity = '0.25'; }
      else { included.add(i); check.classList.add('active'); check.style.opacity = '1'; }
    };
  });

  body.querySelector('#confirmRefreshMuscleBtn').onclick = async () => {
    const btn = body.querySelector('#confirmRefreshMuscleBtn');
    btn.textContent = 'Refreshing…';
    for (const i of included){
      const c = candidates[i];
      await supabaseClient.from('exercises').update({ muscle_override: null }).ilike('name', c.ex.name).eq('user_id', userData.user.id);
    }
    overlay.remove();
    alert(`Refreshed ${included.size} exercise${included.size===1?'':'s'}.`);
    if (state.currentTab === 'track') renderTrack();
  };
}

async function openFixAltGroupsScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeFixAlts">✕</button><h1>Fix Alt Groups</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="fixAltsBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Scanning…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeFixAlts').onclick = () => overlay.remove();

  const { data: userData } = await supabaseClient.auth.getUser();
  const [groupsResult, exResult] = await Promise.all([
    withTimeout(supabaseClient.from('alt_groups').select('id, name').eq('user_id', userData.user.id), 15000),
    withTimeout(supabaseClient.from('exercises').select('id, name, weekday, alt_group_id').eq('user_id', userData.user.id).eq('active', true), 15000)
  ]);
  const allGroups = groupsResult.__timeout || groupsResult.error ? [] : (groupsResult.data || []);
  const allExercises = exResult.__timeout || exResult.error ? [] : (exResult.data || []);
  const membersByGroup = {};
  allExercises.forEach(ex => { if (ex.alt_group_id) (membersByGroup[ex.alt_group_id] = membersByGroup[ex.alt_group_id] || []).push(ex); });

  // A well-formed alt group is a real swap option: same day, no day baked
  // into the name (since the group can legitimately live on any day - naming
  // it after one specific day is what made "Back (Weds)" show up confusingly
  // on Monday).
  const dayNameRegex = /\b(mon(day)?|tue(s|sday)?|wed(s|nesday)?|thu(r|rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b/i;
  const fixes = [];
  allGroups.forEach(g => {
    const members = membersByGroup[g.id] || [];
    if (members.length < 2 && !dayNameRegex.test(g.name)) return;
    const dayCounts = {};
    members.forEach(m => { dayCounts[m.weekday] = (dayCounts[m.weekday] || 0) + 1; });
    const days = Object.keys(dayCounts).map(Number);
    const majorityDay = days.length ? days.reduce((best, d) => dayCounts[d] > dayCounts[best] ? d : best, days[0]) : null;
    const outliers = days.length > 1 ? members.filter(m => m.weekday !== majorityDay) : [];
    const cleanedName = g.name.replace(/\s*[\(\[]?\s*\b(mon(day)?|tue(s|sday)?|wed(s|nesday)?|thu(r|rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b\s*[\)\]]?\s*/gi, ' ').replace(/\s+/g,' ').trim() || 'Alt';
    const nameNeedsFix = cleanedName !== g.name;
    if (outliers.length || nameNeedsFix){
      fixes.push({ group: g, outliers, majorityDay, cleanedName: nameNeedsFix ? cleanedName : null });
    }
  });

  const body = overlay.querySelector('#fixAltsBody');
  if (!fixes.length){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">No alt group issues found - everything's clean.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="small" style="padding:12px 18px; color:var(--slate); line-height:1.6;">${fixes.length} alt group${fixes.length===1?' has':'s have'} an issue. A swap only makes sense between exercises on the same day, and a group's name shouldn't reference one specific day when it can live on any day.</div>
    ${fixes.map((f, i) => `
      <div class="proposal-card" style="margin:0 18px 10px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px;">
        <div class="ex-name" style="font-size:13px; margin-bottom:6px;">${f.group.name}</div>
        ${f.cleanedName ? `<div class="small" style="color:var(--flame);">Rename to "${f.cleanedName}"</div>` : ''}
        ${f.outliers.length ? `<div class="small" style="color:#E8492A;">${f.outliers.length} exercise${f.outliers.length===1?'':'s'} on a different day will be removed from this group: ${f.outliers.map(o=>o.name + ' (' + DAY_NAMES[o.weekday] + ')').join(', ')}</div>` : ''}
      </div>
    `).join('')}
    <button class="save-btn" id="confirmFixAltsBtn" style="margin:0 18px 20px 18px;">Fix ${fixes.length} Group${fixes.length===1?'':'s'}</button>
  `;

  body.querySelector('#confirmFixAltsBtn').onclick = async () => {
    const btn = body.querySelector('#confirmFixAltsBtn');
    btn.textContent = 'Fixing…';
    for (const f of fixes){
      if (f.cleanedName) await supabaseClient.from('alt_groups').update({ name: f.cleanedName }).eq('id', f.group.id);
      for (const outlier of f.outliers){
        await supabaseClient.from('exercises').update({ alt_group_id: null }).eq('id', outlier.id);
      }
    }
    overlay.remove();
    alert(`Fixed ${fixes.length} alt group${fixes.length===1?'':'s'}.`);
    if (state.currentTab === 'track') renderTrack();
  };
}

async function openDuplicateCleanupScreen(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeDupeClean">✕</button><h1>Clean Up Duplicates</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="dupeCleanBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Scanning…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeDupeClean').onclick = () => overlay.remove();

  const { data: userData } = await supabaseClient.auth.getUser();
  const exResult = await withTimeout(
    supabaseClient.from('exercises').select('id, name, weekday, alt_group_id, category, created_at').eq('user_id', userData.user.id).eq('active', true),
    15000
  );
  const all = exResult.__timeout || exResult.error ? [] : (exResult.data || []);
  const byKey = {};
  all.forEach(ex => {
    const key = ex.weekday + '|' + ex.name.toLowerCase();
    (byKey[key] = byKey[key] || []).push(ex);
  });
  // A duplicate group is the same exercise name on the same day, more than
  // once - prioritizes whichever record already has an alt group set as the
  // keeper, since that's real, valuable data worth not losing.
  const groups = Object.values(byKey).filter(g => g.length > 1).map(members => {
    const sorted = [...members].sort((a, b) => {
      if (!!a.alt_group_id !== !!b.alt_group_id) return a.alt_group_id ? -1 : 1;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });
    return { keeper: sorted[0], duplicates: sorted.slice(1), name: sorted[0].name, weekday: sorted[0].weekday };
  });

  const body = overlay.querySelector('#dupeCleanBody');
  if (!groups.length){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">No duplicates found - everything's clean.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="small" style="padding:12px 18px; color:var(--slate); line-height:1.6;">${groups.length} exercise${groups.length===1?'':'s'} appear more than once on the same day. For each, the version with an alt group (or the oldest, if none have one) is kept - the rest are deactivated, but any logged history on them is moved to the one being kept first, so nothing is lost.</div>
    ${groups.map((g, i) => `
      <div class="proposal-card" style="margin:0 18px 10px 18px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px;">
        <div class="ex-name" style="font-size:13px; margin-bottom:4px;">${g.name} <span class="small" style="color:var(--slate);">· ${DAY_NAMES[g.weekday]}</span></div>
        <div class="small" style="color:var(--good);">✓ Keeping ${g.keeper.alt_group_id ? '(has alt group)' : '(oldest)'}</div>
        <div class="small" style="color:#E8492A;">${g.duplicates.length} duplicate${g.duplicates.length===1?'':'s'} will be deactivated</div>
      </div>
    `).join('')}
    <button class="save-btn" id="confirmDupeCleanBtn" style="margin:0 18px 20px 18px;">Clean Up ${groups.length} Group${groups.length===1?'':'s'}</button>
  `;

  body.querySelector('#confirmDupeCleanBtn').onclick = async () => {
    const btn = body.querySelector('#confirmDupeCleanBtn');
    btn.textContent = 'Cleaning…';
    let movedSets = 0, deactivated = 0;
    for (const g of groups){
      for (const dupe of g.duplicates){
        const setsResult = await withTimeout(
          supabaseClient.from('sets').select('id').eq('exercise_id', dupe.id),
          15000
        );
        const dupeSets = setsResult.__timeout || setsResult.error ? [] : (setsResult.data || []);
        for (const s of dupeSets){
          await supabaseClient.from('sets').update({ exercise_id: g.keeper.id }).eq('id', s.id);
          movedSets++;
        }
        await supabaseClient.from('exercises').update({ active: false }).eq('id', dupe.id);
        deactivated++;
      }
    }
    overlay.remove();
    alert(`Cleaned up ${deactivated} duplicate${deactivated===1?'':'s'}${movedSets ? `, moved ${movedSets} logged set${movedSets===1?'':'s'} to the kept record` : ''}.`);
    if (state.currentTab === 'track') renderTrack();
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

  const { data: userData } = await supabaseClient.auth.getUser();
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
      btn.onclick = async () => {
        if (!confirm(`Delete "${btn.dataset.name}"? Exercises tagged to it will just lose that tag - nothing else is affected.`)) return;
        // Clear this location from every exercise's location_ids first, so
        // nothing points at a deleted row.
        const { data: userData } = await supabaseClient.auth.getUser();
        const exResult = await withTimeout(supabaseClient.from('exercises').select('id, location_ids').eq('user_id', userData.user.id), 15000);
        const affected = (exResult.data || []).filter(ex => (ex.location_ids || []).includes(btn.dataset.id));
        for (const ex of affected){
          await supabaseClient.from('exercises').update({ location_ids: ex.location_ids.filter(id => id !== btn.dataset.id) }).eq('id', ex.id);
        }
        await supabaseClient.from('locations').delete().eq('id', btn.dataset.id);
        render();
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
    // This was the actual source of same-day duplicates: tapping "+ Add" more
    // than once on the same suggestion (e.g. navigating back to it, or
    // re-adding after it resurfaces) inserted a brand new record every time
    // with no check for one already existing today. Now checks first, same
    // as the other add-exercise flow already does correctly.
    const existingResult = await withTimeout(
      supabaseClient.from('exercises').select('id').eq('user_id', userData.user.id).eq('weekday', state.selectedDay).ilike('name', name).eq('active', true).maybeSingle(),
      15000
    );
    if (!existingResult.__timeout && !existingResult.error && existingResult.data){
      overlay.remove();
      state.currentTab = 'track';
      openLogForm(existingResult.data.id, name);
      return;
    }
    const { error } = await insertExerciseSafely({ user_id: userData.user.id, name, category, weekday: state.selectedDay, alt_group_id: null });
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
  const [exdb, allLocations] = await Promise.all([
    loadExerciseDB(),
    loadLocations()
  ]);
  state.exercises.forEach(ex => { ex.mechanicInfo = classifyMechanic(matchExercise(ex.name, exdb)); });
  const currentLocationId = getCurrentLocationId() || getDefaultLocationId();
  state.exercises.forEach(ex => { ex.locationAvailable = isAvailableAtLocation(ex, currentLocationId); });
  const currentLocationName = allLocations.find(l => l.id === currentLocationId)?.name || null;
  const hideCompleted = getHideCompletedPref();
  // Strict location filter: only what's actually available here, full stop -
  // not exercises that aren't here even if an alt-group swap exists elsewhere.
  // A separate list from state.exercises so progress stats above still
  // reflect the whole day's plan, not just what's visible right now.
  const visibleExercises = state.exercises.filter(ex =>
    ex.locationAvailable && (!hideCompleted || !(ex.loggedToday || ex.completeVia))
  );
  const { grouped, orderedKeys } = await groupExercisesByChoice(visibleExercises, groupBy);

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
        <div class="brandbar"><img src="icons/icon-inapp-32.png" alt=""><div class="name">ZEALIFT</div>
          ${allLocations.length > 0 ? `<div id="locSwitcher" style="margin-left:auto; display:flex; align-items:center; gap:5px; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:5px 10px 5px 8px; cursor:pointer;">
            <span style="font-size:10px;">📍</span>
            <span style="font-family:'Bebas Neue',sans-serif; font-size:10px; color:var(--flame); letter-spacing:0.5px;">${currentLocationName ? currentLocationName.toUpperCase() : 'ANYWHERE'}</span>
          </div>` : ''}
        </div>
        <div class="day-strip">${dayChips}</div>
        <div class="header">
          <div class="eyebrow">${DAY_LABELS[state.selectedDay].toUpperCase()}</div>
          <h1 id="dayTypeHeader" style="cursor:pointer;">${dayTypeLabel}</h1>
          <div class="quote">"${q.t}" — ${q.a}</div>
        </div>
        <div style="padding:8px 18px 0 18px; display:flex; gap:8px; flex-wrap:wrap;">
          <button id="toolbarTimerBtn" style="display:flex; align-items:center; gap:6px; height:38px; padding:0 14px; border-radius:10px; background:var(--panel); border:1px solid var(--line); color:var(--slate);">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M9 2h6"/></svg>
            <span style="font-family:'Bebas Neue',sans-serif; font-size:12px; letter-spacing:0.5px;">TIMER</span>
          </button>
          ${state.exercises.some(ex => !ex.alt_group_id) ? `<button id="toolbarAutoGroupBtn" style="display:flex; align-items:center; gap:6px; height:38px; padding:0 14px; border-radius:10px; background:var(--panel); border:1px solid var(--flame); color:var(--flame);">
            <span style="font-size:14px;">✨</span>
            <span style="font-family:'Bebas Neue',sans-serif; font-size:12px; letter-spacing:0.5px;">ALTS</span>
          </button>` : ''}
          ${state.exercises.some(ex => ex.loggedToday || ex.completeVia) ? `<button id="toolbarHideCompletedBtn" style="display:flex; align-items:center; gap:6px; height:38px; padding:0 14px; border-radius:10px; background:${hideCompleted?'rgba(255,107,26,0.12)':'var(--panel)'}; border:1px solid ${hideCompleted?'var(--flame)':'var(--line)'}; color:${hideCompleted?'var(--flame)':'var(--slate)'};">
            <span style="font-size:14px;">${hideCompleted?'☑':'☐'}</span>
            <span style="font-family:'Bebas Neue',sans-serif; font-size:12px; letter-spacing:0.5px;">HIDE</span>
          </button>` : ''}
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
  const locSwitcher = document.getElementById('locSwitcher');
  if (locSwitcher) locSwitcher.onclick = () => openLocationPicker(allLocations, currentLocationId);
  const timerBtn = document.getElementById('toolbarTimerBtn');
  if (timerBtn) timerBtn.onclick = () => openTimer();
  const autoGroupBtn = document.getElementById('toolbarAutoGroupBtn');
  if (autoGroupBtn) autoGroupBtn.onclick = () => showPreCheckPopover(autoGroupBtn,
    'Scan for Alt Groups?',
    'Looks at today\'s exercises and suggests groupings. Nothing is created until you review and confirm on the next screen.',
    () => openAutoAltReview()
  );
  const hideCompletedBtn = document.getElementById('toolbarHideCompletedBtn');
  if (hideCompletedBtn) hideCompletedBtn.onclick = () => showPreCheckPopover(hideCompletedBtn,
    hideCompleted ? 'Show completed exercises again?' : 'Hide completed exercises?',
    null,
    () => { setHideCompletedPref(!hideCompleted); renderTrack(); }
  );
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
      <div class="me-item" id="menuEditCategory" style="border-bottom:1px solid var(--line); cursor:pointer;"><div>Edit Category</div><div class="chev">›</div></div>
      <div class="me-item" id="menuEditMuscle" style="border-bottom:1px solid var(--line); cursor:pointer;"><div>Edit Muscle Group</div><div class="chev">›</div></div>
      <div class="me-item" id="menuEditLoc" style="border-bottom:1px solid var(--line); cursor:pointer;"><div>Edit Push/Pull/Upper/Lower/Location</div><div class="chev">›</div></div>
      <div class="me-item" id="menuRemove" style="border-bottom:none; cursor:pointer;"><div style="color:var(--flame);">Remove from ${DAY_LABELS[state.selectedDay]}</div><div class="chev">›</div></div>
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
    const { data: userData } = await supabaseClient.auth.getUser();
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
      withTimeout(supabaseClient.from('exercises').select('category').eq('id', exerciseId).maybeSingle(), 15000)
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
    const { data: userData } = await supabaseClient.auth.getUser();
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
      withTimeout(supabaseClient.from('exercises').select('push_pull, upper_lower, location_ids').eq('id', exerciseId).maybeSingle(), 15000),
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

  overlay.querySelector('#saveTagsBtn').onclick = async () => {
    await supabaseClient.from('exercises').update({ push_pull: pushPull, upper_lower: upperLower, location_ids: locationIds }).eq('id', exerciseId);
    overlay.remove();
    if (state.currentTab === 'track') renderTrack();
  };
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
      withTimeout(supabaseClient.from('exercises').select('location_ids').eq('id', exerciseId).maybeSingle(), 15000)
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

  overlay.querySelector('#saveLocBtn').onclick = async () => {
    await supabaseClient.from('exercises').update({ location_ids: selectedIds }).eq('id', exerciseId);
    overlay.remove();
    if (state.currentTab === 'track') renderTrack();
  };
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
  if (m === 'calves'){
    // Knee position determines which calf muscle actually does the work -
    // gastrocnemius crosses the knee so it's loaded with the leg straight
    // (standing raises), soleus doesn't cross the knee so it takes over when
    // the knee is bent (seated raises). This is standard, reliable convention.
    if (n.includes('seated')) return 'Calves (Soleus)';
    if (n.includes('standing') || n.includes('donkey') || n.includes('leg press calf')) return 'Calves (Gastrocnemius)';
    return 'Calves';
  }
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
  'Calves':'Legs', 'Calves (Gastrocnemius)':'Legs', 'Calves (Soleus)':'Legs',
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
  'Calves (Gastrocnemius)', 'Calves (Soleus)', 'Calves'
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
    supabaseClient.from('exercises').select('id, name, category, weekday, alt_group_id, push_pull, upper_lower').eq('active', true),
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
      const splitMode = getSplitModePref();
      const splitSubGroup = getSplitSubGroupPref();
      const [{ grouped, orderedKeys }, db] = await Promise.all([
        groupExercisesByChoice(deduped, groupBy, splitMode),
        loadExerciseDB()
      ]);
      const todayNames = new Set(all.filter(ex => ex.weekday === state.selectedDay).map(ex => ex.name.toLowerCase()));

      function renderExerciseRow(ex){
        const match = matchExercise(ex.name, db);
        const muscles = match ? muscleSubtitle(match.primaryMuscles, match.secondaryMuscles) : '';
        const mech = classifyMechanic(match);
        const mechTag = mech ? `<span style="font-size:9px; padding:2px 5px; border-radius:4px; margin-left:5px; background:${mech.value==='compound'?'rgba(255,107,26,0.15)':'rgba(122,150,220,0.15)'}; color:${mech.value==='compound'?'#FF6B1A':'#7BA6C9'}; opacity:${mech.guessed?0.75:1};">${mech.guessed?'~':''}${mech.value==='compound'?'Compound':'Isolation'}</span>` : '';
        const alreadyToday = todayNames.has(ex.name.toLowerCase())
          ? `<span style="font-size:9px; padding:2px 6px; border-radius:4px; margin-left:5px; background:rgba(143,191,122,0.15); color:var(--good);">✓ On ${DAY_NAMES[state.selectedDay]}</span>` : '';
        return `<div class="pick-row" data-id="${ex.id}" data-name="${ex.name}"><div><div class="ex-name">${ex.name}${mechTag}${alreadyToday}</div>${muscles ? `<div class="small" style="color:var(--slate);">${muscles}</div>` : ''}</div><div class="chev">›</div></div>`;
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
        chip.onclick = () => { setGroupByPref(chip.dataset.groupby); renderList(body.querySelector('#pickerSearch').value); };
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
          const { data: inserted, error } = await insertExerciseSafely({
            user_id: userData.user.id, name: picked.name, category: picked.category,
            weekday: state.selectedDay, alt_group_id: null
          });
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
      const splitMode = getSplitModePref();
      const splitSubGroup = getSplitSubGroupPref();
      const { grouped, orderedKeys } = groupDatabaseExercises(filtered, groupBy, splitMode);
      let html = '';
      const presentKeys = orderedKeys.filter(k => (grouped[k]||[]).length);
      const flatOrder = []; // display order across every visible category, for swipe nav
      const todayNames = new Set(all.filter(ex => ex.weekday === state.selectedDay).map(ex => ex.name.toLowerCase()));

      function renderDbRow(e){
        flatOrder.push({ name: e.name, equipment: e.equipment });
        const star = POPULAR_EXERCISES.has(e.name)
          ? `<span title="Popular staple" style="color:#F0C542; margin-left:5px;">★</span>` : '';
        const alreadyToday = todayNames.has(e.name.toLowerCase())
          ? `<span style="font-size:9px; padding:2px 6px; border-radius:4px; margin-left:5px; background:rgba(143,191,122,0.15); color:var(--good);">✓ On ${DAY_NAMES[state.selectedDay]}</span>` : '';
        const muscles = muscleSubtitle(e.primaryMuscles, e.secondaryMuscles);
        const mech = classifyMechanic(e);
        const mechTag = mech ? `<span style="font-size:9px; padding:2px 5px; border-radius:4px; margin-left:5px; background:${mech.value==='compound'?'rgba(255,107,26,0.15)':'rgba(122,150,220,0.15)'}; color:${mech.value==='compound'?'#FF6B1A':'#7BA6C9'}; opacity:${mech.guessed?0.75:1};">${mech.guessed?'~':''}${mech.value==='compound'?'Compound':'Isolation'}</span>` : '';
        const equipLine = [cap(e.equipment), cap(e.level)].filter(Boolean).join(' · ');
        return `<div class="pick-row db-pick" data-name="${e.name}" data-equip="${e.equipment||''}"><div><div class="ex-name">${e.name}${star}${mechTag}${alreadyToday}</div>${muscles ? `<div class="small" style="color:var(--slate);">${muscles}</div>` : ''}${equipLine ? `<div class="small" style="color:var(--slate); opacity:0.7; font-size:10.5px;">${equipLine}</div>` : ''}</div><div class="chev">›</div></div>`;
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
        chip.onclick = () => { setGroupByPref(chip.dataset.groupby); renderDbList(body.querySelector('#dbSearch').value); };
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

// ---------- AUTO ALT GROUP REVIEW ----------
async function openAutoAltReview(){
  const overlay = document.createElement('div');
  overlay.className = 'overlay-screen';
  overlay.innerHTML = `
    <div class="form-header"><button id="closeAutoAlt">✕</button><h1>Auto-Group Alts</h1><div style="width:18px;"></div></div>
    <div class="overlay-scroll" id="autoAltBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Scanning today's exercises…</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeAutoAlt').onclick = () => overlay.remove();

  const proposals = await proposeAltGroups(state.exercises);
  const body = overlay.querySelector('#autoAltBody');
  if (!proposals.length){
    body.innerHTML = `<div class="empty-state" style="padding:30px 18px;">No obvious groupings found among today's ungrouped exercises. This works best when a few exercises share both a muscle and a movement pattern (e.g. two different presses for chest).</div>`;
    return;
  }

  proposals.forEach((p, i) => { p.included = true; p.id = 'proposal-' + i; });

  function render(){
    body.innerHTML = `
      <div class="small" style="padding:12px 18px; color:var(--slate);">Review each group before confirming - nothing is applied yet. Rename, remove members, or skip a group entirely.</div>
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
      <button class="save-btn" id="confirmAutoAltBtn" style="margin:0 18px 20px 18px;">Apply Groups</button>
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
    body.querySelector('#confirmAutoAltBtn').onclick = async () => {
      const toApply = proposals.filter(p => p.included && p.members.length >= 2);
      if (!toApply.length){ overlay.remove(); return; }
      const { data: userData } = await supabaseClient.auth.getUser();
      for (const p of toApply){
        const insertResult = await withTimeout(
          supabaseClient.from('alt_groups').insert({ user_id: userData.user.id, name: p.suggestedName, color: p.color }).select(),
          15000
        );
        const groupId = insertResult.__timeout || !insertResult.data ? null : insertResult.data[0].id;
        if (!groupId) continue;
        for (const m of p.members){
          await supabaseClient.from('exercises').update({ alt_group_id: groupId }).eq('id', m.id);
        }
      }
      overlay.remove();
      renderTrack();
    };
  }
  render();
}


// ---------- SPLIT TAG SCANNER ----------
async function proposeSplitTags(){
  const { data: userData } = await supabaseClient.auth.getUser();
  const [exResult, db] = await Promise.all([
    withTimeout(supabaseClient.from('exercises').select('id, name, push_pull, upper_lower').eq('user_id', userData.user.id), 15000),
    loadExerciseDB()
  ]);
  const all = exResult.__timeout || exResult.error ? [] : (exResult.data || []);
  // Work on distinct names - a name missing a tag on ANY of its records counts
  // as needing review, and the fix applies to every record sharing that name.
  const byName = {};
  all.forEach(ex => {
    const key = ex.name.toLowerCase();
    if (!byName[key]) byName[key] = { name: ex.name, ids: [], hasPP: false, hasUL: false };
    byName[key].ids.push(ex.id);
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
      let successCount = 0;
      const errors = [];
      for (const p of toApply){
        for (const id of p.ids){
          const { error } = await supabaseClient.from('exercises').update({ push_pull: p.pushPull, upper_lower: p.upperLower }).eq('id', id);
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

    const { data: userData } = await supabaseClient.auth.getUser();
    const exResult = await withTimeout(
      supabaseClient.from('exercises').select('id, name, category, location_ids').eq('user_id', userData.user.id),
      15000
    );
    const all = exResult.__timeout || exResult.error ? [] : (exResult.data || []);
    const byName = {};
    all.forEach(ex => {
      if (!byName[ex.name]) byName[ex.name] = { ids: [], category: ex.category || 'Other', alreadyHere: (ex.location_ids||[]).includes(locId) };
      byName[ex.name].ids.push(ex.id);
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
          for (const id of item.ids){
            const exRow = all.find(e => e.id === id);
            const existing = (exRow && exRow.location_ids) || [];
            // Only ever touches this one location's membership - every other
            // location already tagged on this exercise is left exactly as-is.
            const updated = isChecked
              ? [...new Set([...existing, locId])]
              : existing.filter(id2 => id2 !== locId);
            const { error } = await supabaseClient.from('exercises').update({ location_ids: updated }).eq('id', id);
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
  const { data: userData } = await supabaseClient.auth.getUser();
  let exResult;
  try {
    exResult = await withTimeout(
      supabaseClient.from('exercises').select('id, name, category, weekday, alt_group_id, push_pull, upper_lower, location_ids').eq('user_id', userData.user.id).eq('active', true),
      15000
    );
  } catch(e) {
    return { backup: null, errorMessage: 'Could not read your exercises: ' + e.message };
  }
  if (exResult.__timeout) return { backup: null, errorMessage: 'Timed out reading your exercises.' };
  if (exResult.error) return { backup: null, errorMessage: 'Could not read your exercises: ' + exResult.error.message };
  const exercises = exResult.data || [];

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
  const { data: userData } = await supabaseClient.auth.getUser();
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
  const { data: userData } = await supabaseClient.auth.getUser();
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
    if (alsoBackup){
      const { backup: safetyBackup, errorMessage } = await createPlanBackup(`Before restoring "${backup.name}" — ${todayStr()}`);
      if (!safetyBackup && !confirm(`Could not save the safety backup (${errorMessage}). Restore anyway with no way back?`)) return;
    }
    const { restored, skipped } = await restorePlanBackup(backup);
    overlay.remove();
    if (listOverlay) listOverlay.remove();
    alert(`Restored ${restored} exercises.${skipped ? ' ' + skipped + ' from this backup no longer exist and were skipped.' : ''}`);
    if (onDone) onDone();
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
      btn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this saved plan? This cannot be undone.')) return;
        await supabaseClient.from('plan_backups').delete().eq('id', btn.dataset.id);
        renderList();
      };
    });
  }
  renderList();
}

// ---------- PLAN REORGANIZER ----------
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

    const { data: userData } = await supabaseClient.auth.getUser();
    const [exResult, db] = await Promise.all([
      withTimeout(supabaseClient.from('exercises').select('name').eq('user_id', userData.user.id), 15000),
      loadExerciseDB()
    ]);
    const names = [...new Set((exResult.data||[]).map(e=>e.name))];
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

    const { data: userData } = await supabaseClient.auth.getUser();
    const [exResult, db] = await Promise.all([
      withTimeout(supabaseClient.from('exercises').select('id, name, weekday, alt_group_id, push_pull, upper_lower, category').eq('user_id', userData.user.id).eq('active', true), 15000),
      loadExerciseDB()
    ]);
    const allExercises = exResult.__timeout || exResult.error ? [] : (exResult.data || []);
    const byName = {};
    allExercises.forEach(ex => {
      if (!byName[ex.name]) byName[ex.name] = { name: ex.name, ids: [], weekday: ex.weekday, altGroupId: ex.alt_group_id, push_pull: ex.push_pull, upper_lower: ex.upper_lower };
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
      body.querySelector('#confirmChangeDayBtn').onclick = async () => {
        const snapshot = allExercises.map(ex => ({ id: ex.id, weekday: ex.weekday }));
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
          for (const id of n.ids){
            const payload = { weekday: targetDay };
            if (clearAlt) payload.alt_group_id = null;
            await supabaseClient.from('exercises').update(payload).eq('id', id);
          }
        }
        for (const n of leaving){
          if (included.has(n.name)) continue; // kept anyway, don't deactivate
          for (const id of n.ids){
            await supabaseClient.from('exercises').update({ active: false }).eq('id', id);
          }
        }
        overlay.remove();
        state.selectedDay = targetDay;
        state.currentTab = 'track';
        renderTrack();
      };
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
      const { data: userData } = await supabaseClient.auth.getUser();
      const [exResult, db] = await Promise.all([
        withTimeout(supabaseClient.from('exercises').select('name').eq('user_id', userData.user.id), 15000),
        loadExerciseDB()
      ]);
      const names = [...new Set((exResult.data||[]).map(e=>e.name))];
      const muscles = new Set();
      names.forEach(n => { const m = matchExercise(n, db); if (m && m.primaryMuscles && m.primaryMuscles[0]) muscles.add(m.primaryMuscles[0]); });
      cats = splitType === 'muscle'
        ? [...muscles, 'rest']
        // Custom mixes every category from every other split together, so any
        // day can be Push, or Legs, or a specific muscle, or Chest & Back, or
        // Full Body, or fully manual - genuine mix and match, not locked to
        // one split's category set.
        : ['push','pull','legs','upper','lower','chestback','shouldersarms','fullbody', ...muscles, 'rest'];
    }

    const body = overlay.querySelector('.overlay-scroll');
    body.innerHTML = `
      <div class="small" style="padding:8px 18px 16px 18px; color:var(--slate);">What should each day focus on? Pick "Rest" for days that shouldn't get anything assigned.</div>
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
          row.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
          chip.classList.add('active');
          dayAssignments[row.dataset.day] = chip.dataset.cat;
        };
      });
    });
    body.querySelector('#toPreviewBtn').onclick = () => renderStep3();
  }

  async function renderStep3(){
    overlay.innerHTML = `<div class="form-header"><button id="closeReorg">✕</button><h1>Preview</h1><div style="width:18px;"></div></div>
      <div class="overlay-scroll" id="reorgPreviewBody"><div class="small" style="padding:20px 18px; color:var(--slate);">Building preview…</div></div>`;
    overlay.querySelector('#closeReorg').onclick = () => overlay.remove();

    const { data: userData } = await supabaseClient.auth.getUser();
    const [exResult, db] = await Promise.all([
      withTimeout(supabaseClient.from('exercises').select('id, name, category, weekday, alt_group_id, push_pull, upper_lower, location_ids').eq('user_id', userData.user.id).eq('active', true), 15000),
      loadExerciseDB()
    ]);
    const allExercises = exResult.__timeout || exResult.error ? [] : (exResult.data || []);

    // Group all exercises by distinct name, deriving each name's category once.
    const byName = {};
    allExercises.forEach(ex => {
      const key = ex.name.toLowerCase();
      if (!byName[key]) byName[key] = { name: ex.name, ids: [] };
      byName[key].ids.push(ex.id);
    });
    const namedList = Object.values(byName).map(item => {
      const sample = allExercises.find(e => e.name === item.name);
      const match = matchExercise(item.name, db);
      const muscle = match && match.primaryMuscles && match.primaryMuscles[0];
      const category = deriveSplitCategory(sample, splitType, muscle);
      const mech = classifyMechanic(match);
      return { ...item, category, muscle, mechanic: mech ? mech.value : null, altGroupId: sample.alt_group_id, push_pull: sample.push_pull, upper_lower: sample.upper_lower };
    });

    const body = overlay.querySelector('#reorgPreviewBody');
    const dayPlans = DAY_NAMES.map((d, i) => {
      const assignedCat = dayAssignments[i];
      const isCustom = assignedCat === 'custom';
      let items = [];
      if (assignedCat && assignedCat !== 'rest' && !isCustom){
        items = splitType === 'custom'
          ? namedList.filter(n => exerciseMatchesCategory(n, n.muscle, assignedCat))
          : namedList.filter(n => n.category === assignedCat);
      }
      const label = isCustom ? 'Custom' : (assignedCat ? (SPLIT_CATEGORY_LABELS[assignedCat] || cap(assignedCat)) : 'Not Assigned');
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
    const SESSION_TARGET = 8;
    const swapChoices = {}; // "dayIdx|slotIndex" -> chosen name, if swapped from the default representative
    dayPlans.forEach(dp => {
      if (dp.isCustom) return;
      const itemsForCollapse = dp.items.map(it =>
        (it.altGroupId && altGroupsToClear.has(it.altGroupId)) ? { ...it, altGroupId: null } : it
      );
      const allSlots = collapseAltGroups(itemsForCollapse);
      const { included, excluded } = selectBalancedSlots(allSlots, SESSION_TARGET);
      dp.slots = included;
      dp.excludedSlots = excluded;
    });

    body.innerHTML = `
      <div class="banner" style="margin:8px 18px 16px 18px; background:#251a12; border:1px solid #4a2f16; border-radius:10px; padding:12px 14px; font-size:11.5px; color:#E8A33D; line-height:1.5;">⚠ Nothing changes until you confirm below. Your current layout is saved automatically and can be restored with one tap from Me → Data if this isn't right.${altGroupsToClear.size ? ` ${altGroupsToClear.size} alt group${altGroupsToClear.size===1?'':'s'} would be scattered by this split, so ${altGroupsToClear.size===1?'it':'they'} will be cleared rather than forced together — use Auto-Group Alts afterward to rebuild ones that make sense here.` : ''}</div>
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
                  <span>${slot.representative.name}</span>
                  <span class="reorg-add" style="color:var(--flame); font-size:11px;">+ add</span>
                </div>`).join('')}
              </div>
            ` : ''}
          `}
        </div>
      `).join('')}
      <button class="save-btn" id="confirmReorgBtn" style="margin:0 18px 20px 18px;">Confirm & Apply</button>
    `;

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

    body.querySelector('#confirmReorgBtn').onclick = async () => {
      // Snapshot current weekday assignments before touching anything, so this
      // can be reverted in one tap from Me -> Data.
      const snapshot = allExercises.map(ex => ({ id: ex.id, weekday: ex.weekday }));
      localStorage.setItem('zealift_reorg_snapshot', JSON.stringify({ snapshot, at: new Date().toISOString() }));

      // Full Body is fundamentally different from the other splits: every
      // exercise belongs on every full-body day, not partitioned one-per-day.
      // A single exercise record can only have one weekday, so the first
      // full-body day moves the originals there, and every subsequent
      // full-body day gets real duplicate records instead of silently
      // stealing the same exercise away from the day before it.
      let fullBodyDaysSeen = 0;

      for (const dp of dayPlans){
        if (dp.isCustom){
          for (const name of customSelections[dp.dayIdx]){
            const match = namedList.find(n => n.name === name);
            if (!match) continue;
            const clearAlt = match.altGroupId && altGroupsToClear.has(match.altGroupId);
            for (const id of match.ids){
              const payload = { weekday: dp.dayIdx };
              if (clearAlt) payload.alt_group_id = null;
              await supabaseClient.from('exercises').update(payload).eq('id', id);
            }
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
          const clearAlt = it.altGroupId && altGroupsToClear.has(it.altGroupId);
          if (isFullBodyRepeat){
            const sample = allExercises.find(e => e.name === it.name);
            if (!sample) continue;
            await insertExerciseSafely({
              user_id: userData.user.id, name: sample.name, category: sample.category,
              weekday: dp.dayIdx, alt_group_id: clearAlt ? null : sample.alt_group_id,
              push_pull: sample.push_pull, upper_lower: sample.upper_lower, location_ids: sample.location_ids
            });
          } else {
            for (const id of it.ids){
              const payload = { weekday: dp.dayIdx };
              if (clearAlt) payload.alt_group_id = null;
              await supabaseClient.from('exercises').update(payload).eq('id', id);
            }
          }
        }
      }

      // Sync the day's header label to match its new category - otherwise
      // Track keeps showing the old label (e.g. "Chest & Triceps") even
      // though the actual exercises underneath have genuinely changed.
      // Custom days are skipped since those are hand-picked, not derived.
      for (const dp of dayPlans){
        if (dp.isCustom) continue;
        await supabaseClient.from('day_types').upsert(
          { user_id: userData.user.id, weekday: dp.dayIdx, label: dp.catLabel },
          { onConflict: 'user_id,weekday' }
        );
      }

      overlay.remove();
      state.selectedDay = todayWeekday();
      state.currentTab = 'track';
      renderTrack();
    };
  }

  renderStep1();
}

async function revertLastReorganization(){
  const raw = localStorage.getItem('zealift_reorg_snapshot');
  if (!raw){ alert('No reorganization to revert.'); return; }
  const { snapshot } = JSON.parse(raw);
  if (!confirm(`Restore ${snapshot.length} exercises to their previous days?`)) return;
  for (const item of snapshot){
    await supabaseClient.from('exercises').update({ weekday: item.weekday }).eq('id', item.id);
  }
  localStorage.removeItem('zealift_reorg_snapshot');
  if (state.currentTab === 'track') renderTrack();
  alert('Reverted.');
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
      btn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${btn.dataset.name}"? Exercises in this group will keep their names but lose the alt-group link.`)) return;
        const { data: userData } = await supabaseClient.auth.getUser();
        // Clear the reference on every exercise pointing at this group first, so
        // nothing is left referencing a group that no longer exists.
        await supabaseClient.from('exercises').update({ alt_group_id: null }).eq('user_id', userData.user.id).eq('alt_group_id', btn.dataset.id);
        const { error } = await supabaseClient.from('alt_groups').delete().eq('id', btn.dataset.id);
        if (error){ alert(error.message); return; }
        const idx = groups.findIndex(g => g.id === btn.dataset.id);
        if (idx !== -1) groups.splice(idx, 1);
        renderAlt(container.querySelector('#altSearch').value);
      };
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

// ---------- LOCATIONS ----------
async function loadLocations(){
  const { data: userData } = await supabaseClient.auth.getUser();
  const result = await withTimeout(
    supabaseClient.from('locations').select('id, name').eq('user_id', userData.user.id).order('name'),
    15000
  );
  return result.__timeout || result.error ? [] : (result.data || []);
}
async function createLocation(name){
  const { data: userData } = await supabaseClient.auth.getUser();
  const result = await withTimeout(
    supabaseClient.from('locations').insert({ user_id: userData.user.id, name }).select(),
    15000
  );
  return result.__timeout || result.error || !result.data ? null : result.data[0];
}

// ---------- NEW EXERCISE FORM ----------
async function openNewExerciseForm(){
  let selectedCategory = CATEGORIES[0];
  let selectedDay = state.selectedDay;
  let pickedAltGroup = null;
  let selectedPushPull = null;
  let selectedUpperLower = null;
  let selectedLocationIds = [];
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
      <div class="small" style="padding:0 18px 8px 18px; color:var(--slate);">Leave blank if it's available everywhere (dumbbells, cables, bodyweight). Pick specific locations for gym-specific machines - select more than one if it exists at both.</div>
      <div class="field-label">Alt Group <span class="opt">(optional)</span></div>
      <div id="altGroupArea" class="field-card" style="display:block;"><div class="ex-name" style="color:var(--slate); font-size:13px;" id="altGroupPickBtn">Tap to choose or create…</div></div>
      <button class="save-btn" id="saveExerciseBtn">Add Exercise</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeForm').onclick = () => overlay.remove();

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
    const { data: userData } = await supabaseClient.auth.getUser();
    const existingResult = await withTimeout(
      supabaseClient.from('exercises').select('id').eq('user_id', userData.user.id).eq('weekday', selectedDay).ilike('name', name).eq('active', true).maybeSingle(),
      15000
    );
    if (!existingResult.__timeout && !existingResult.error && existingResult.data){
      alert(`"${name}" already exists on ${DAY_NAMES[selectedDay]} - opening it instead of creating a duplicate.`);
      overlay.remove();
      state.selectedDay = selectedDay;
      state.currentTab = 'track';
      openLogForm(existingResult.data.id, name);
      return;
    }
    const { error } = await insertExerciseSafely({
      user_id: userData.user.id, name, category: selectedCategory, weekday: selectedDay,
      alt_group_id: pickedAltGroup ? pickedAltGroup.id : null,
      push_pull: selectedPushPull, upper_lower: selectedUpperLower, location_ids: selectedLocationIds
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
function openLogForm(exerciseId, exerciseName){
  removeSideIndex();
  let unit = 'kg';
  let weightType = 'total';
  let lastEntry = null;
  // Defaults to whatever location is currently active on Track, falling back
  // to the designated default location if Track is in Anywhere mode. Only
  // starts genuinely unassigned if neither is set.
  let selectedLocationId = getCurrentLocationId() || getDefaultLocationId();

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

  overlay.querySelectorAll('.unit-toggle button').forEach(b => {
    b.onclick = () => { overlay.querySelectorAll('.unit-toggle button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); unit = b.dataset.u; };
  });
  overlay.querySelectorAll('.chip[data-wt]').forEach(b => {
    b.onclick = () => { overlay.querySelectorAll('.chip[data-wt]').forEach(x=>x.classList.remove('active')); b.classList.add('active'); weightType = b.dataset.wt; };
  });


  async function saveEntry(weight, unit, weightType, reps, numSets, notes){
    const { data: userData } = await supabaseClient.auth.getUser();
    const useMaster = getUseExerciseMasterFlag();
    const idField = useMaster ? 'exercise_master_id' : 'exercise_id';
    // Capture prior best BEFORE inserting, for PR detection (weight-based only).
    let priorBest = null;
    if (weight !== null && (unit === 'kg' || unit === 'lb')){
      const prevSets = await supabaseClient.from('sets')
        .select('weight, weight_unit')
        .eq(idField, exerciseId)
        .in('weight_unit', ['kg','lb']);
      if (prevSets.data && prevSets.data.length){
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
    insertPayload[idField] = exerciseId;
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
    const { data: userData } = await supabaseClient.auth.getUser();
    const useMaster = getUseExerciseMasterFlag();
    const idField = useMaster ? 'exercise_master_id' : 'exercise_id';
    let idsToQuery = [exerciseId];
    if (!useMaster){
      // The same exercise name can exist as multiple separate records (one per day
      // it's been added to), each with its own isolated set history. Look up every
      // record sharing this name for this user, and merge all of their sets together
      // - otherwise history only ever reflects whichever single day's record you
      // happened to open, silently missing everything logged against the others.
      // Not needed at all under the master structure - there's only one record.
      const sameNameResult = await withTimeout(
        supabaseClient.from('exercises').select('id').eq('user_id', userData.user.id).ilike('name', exerciseName),
        15000
      );
      const allIds = (sameNameResult.__timeout || sameNameResult.error)
        ? [exerciseId]
        : (sameNameResult.data || []).map(r => r.id);
      idsToQuery = allIds.length ? allIds : [exerciseId];
    }

    let result = await withTimeout(
      supabaseClient.from('sets').select('id, weight, weight_unit, weight_type, reps, num_sets, notes, logged_at, location_id')
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
        supabaseClient.from('exercises').select('category, push_pull, upper_lower, location_ids').eq('id', exerciseId).maybeSingle(),
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
    if (!weightRaw && !setsVal && !repsVal){ alert('Enter at least one value — weight, time, sets, or reps.'); return; }
    const weight = weightRaw ? parseFloat(weightRaw) : null;
    const insertedId = await saveEntry(weight, unit, weightType, repsVal ? parseInt(repsVal,10) : null, setsVal ? parseInt(setsVal,10) : null, notesVal);
    if (insertedId){
      overlay.remove();
      if (state.currentTab === 'track') renderTrack();
    }
  }
  overlay.querySelector('#saveSetBtn').onclick = handleSaveClick;
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
    <div style="display:flex; justify-content:space-between; width:100%;"><div class="log-date">${formatLoggedDate(e.logged_at)}</div><div class="log-weight">${e.weight}${e.unit}</div></div>
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
        <div class="me-item" id="replayTourBtn"><div>How Zealift Works</div><div class="chev">›</div></div>
        <div class="me-item" id="backupPlanBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
          <div><div>Backup Plan</div><div class="small" style="color:var(--slate); margin-top:2px;">Save a snapshot before you shake things up</div></div>
          <div class="chev" style="margin-top:2px;">›</div>
        </div>
        <div class="section-label">Data</div>
        <div class="me-item" id="locationSubPageBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
          <div><div>Location</div><div class="small" style="color:var(--slate); margin-top:2px;">Default location, assign gyms, manage the list</div></div>
          <div class="chev" style="margin-top:2px;">›</div>
        </div>
        <div class="me-item" id="planSubPageBtn" style="align-items:flex-start; padding-top:12px; padding-bottom:12px;">
          <div><div>Plan</div><div class="small" style="color:var(--slate); margin-top:2px;">Reorganize, swap days, redo setup, tag workouts</div></div>
          <div class="chev" style="margin-top:2px;">›</div>
        </div>
        <div class="section-label">App</div>
        <div class="me-item" id="refreshAppBtn"><div>Refresh App</div><div class="chev">›</div></div>
        <div class="me-item" id="updateAppBtn"><div>Check for Updates</div><div class="chev">›</div></div>
        <div class="me-item" id="signOutBtn"><div>Sign Out</div><div class="chev">›</div></div>
        <div style="text-align:center; padding:18px 0; color:var(--slate); font-family:'JetBrains Mono',monospace; font-size:10.5px;">Zealift · ${APP_VERSION}</div>
      </div>
      ${renderTabbar()}
    </div>`;
  attachShellHandlers();
  document.getElementById('replayTourBtn').onclick = () => showOnboarding('teach');
  document.getElementById('backupPlanBtn').onclick = openBackupPlanScreen;
  document.getElementById('locationSubPageBtn').onclick = () => openLocationSubPage();
  document.getElementById('planSubPageBtn').onclick = () => openPlanSubPage();
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
