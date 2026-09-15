// Workspace state: one reducer, plain objects. Async work lives in actions.js.
import { WELL_TYPES, WELL_DEFS, makeWell } from '../core/wells.js';
import { diffTexts, shiftRanges, findExact, findEnclosing } from '../core/inlets.js';
import { uid } from '../core/tokens.js';
import { resolveConstraints } from '../core/constraints.js';

export const TEXT_KEY = 'phraselette.text.v1';

export function initialState() {
  let text = '';
  try { text = localStorage.getItem(TEXT_KEY) ?? ''; } catch { /* ignore */ }
  const wells = WELL_TYPES.map(makeWell);
  return {
    text,
    tokens: [],           // word/space tokens of the whole document
    probTokens: null,     // [{start,end,logProb}] sub-token probabilities of the document
    probPending: false,
    wells,
    highlightWellId: null,   // which view well colors the editor; null = plain text
    inlets: [],           // [{id,start,end}]
    selection: { start: 0, end: 0 },
    constraints: [],      // see core/constraints.js
    insights: {},         // wellId -> inletId -> { sequences, histogram, text, error, results }
    searching: {},        // inletId -> [wellId]
    results: {},          // inletId -> { accepted, rejected, all }
    tooltip: null,
    notice: null,
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'text': {
      const change = diffTexts(state.text, action.text);
      if (!change) return state;
      const inlets = shiftRanges(state.inlets, change);
      const keep = new Set(inlets.map((i) => i.id));
      const constraints = state.constraints.filter((c) => keep.has(c.inletId));
      return { ...state, text: action.text, inlets, constraints };
    }
    case 'tokens':
      return { ...state, tokens: action.tokens };
    case 'probTokens':
      return { ...state, probTokens: action.probTokens, probPending: false };
    case 'probPending':
      return { ...state, probPending: action.value };
    case 'selection':
      return { ...state, selection: action.selection };
    case 'addWell': {
      // Role wells (thesaurus, reader, dictionary) can be opened several times,
      // each with its own role; view wells exist once.
      const duplicatable = !!WELL_DEFS[action.wellType]?.roles;
      const existing = duplicatable ? null : state.wells.find((w) => w.type === action.wellType && !w.active);
      let wells;
      if (existing) {
        wells = state.wells.map((w) => (w.id === existing.id ? { ...w, active: true, collapsed: false } : w));
      } else {
        const fresh = { ...makeWell(action.wellType), active: true };
        if (action.role) fresh.role = action.role;
        wells = [...state.wells, fresh];
      }
      return { ...state, wells };
    }
    case 'moveWell': {
      const wells = state.wells.filter((w) => w.id !== action.id);
      const moving = state.wells.find((w) => w.id === action.id);
      if (!moving) return state;
      let idx = wells.findIndex((w) => w.id === action.targetId);
      if (idx === -1) return state;
      if (action.after) idx += 1;
      wells.splice(idx, 0, moving);
      return { ...state, wells };
    }
    case 'addWellObject':
      return { ...state, wells: [...state.wells.filter((w) => w.id !== action.well.id), action.well] };
    case 'removeWell': {
      const wells = state.wells.map((w) => (w.id === action.id ? { ...w, active: false } : w));
      const highlightWellId = state.highlightWellId === action.id ? null : state.highlightWellId;
      return { ...state, wells, highlightWellId };
    }
    case 'patchWell':
      return { ...state, wells: state.wells.map((w) => (w.id === action.id ? { ...w, ...action.patch } : w)) };
    case 'highlight': // toggle: the same well again switches coloring off
      return { ...state, highlightWellId: state.highlightWellId === action.id ? null : action.id };
    case 'createInlet': {
      const inlet = action.inlet;
      if (findExact(state.inlets, inlet.start, inlet.end)) return state;
      return { ...state, inlets: [...state.inlets, inlet], selection: { start: inlet.start, end: inlet.end } };
    }
    case 'deleteInlet': {
      const inlets = state.inlets.filter((i) => i.id !== action.id);
      const constraints = state.constraints.filter((c) => c.inletId !== action.id);
      const results = { ...state.results }; delete results[action.id];
      return { ...state, inlets, constraints, results };
    }
    case 'addConstraint':
      return recompute({ ...state, constraints: [...state.constraints, action.constraint] }, action.constraint.inletId);
    case 'removeConstraint': {
      const c = state.constraints.find((x) => x.id === action.id);
      return recompute({ ...state, constraints: state.constraints.filter((x) => x.id !== action.id) }, c?.inletId);
    }
    case 'patchConstraint': {
      const c = state.constraints.find((x) => x.id === action.id);
      return recompute({ ...state, constraints: state.constraints.map((x) => (x.id === action.id ? { ...x, ...action.patch } : x)) }, c?.inletId);
    }
    case 'searching': {
      const cur = new Set(state.searching[action.inletId] ?? []);
      if (action.on) cur.add(action.wellId); else cur.delete(action.wellId);
      return { ...state, searching: { ...state.searching, [action.inletId]: [...cur] } };
    }
    case 'insight': {
      const forWell = { ...(state.insights[action.wellId] ?? {}) };
      forWell[action.inletId] = { ...(forWell[action.inletId] ?? {}), ...action.insight };
      const next = { ...state, insights: { ...state.insights, [action.wellId]: forWell } };
      return 'sequences' in action.insight ? recompute(next, action.inletId) : next;
    }
    case 'results':
      return { ...state, results: { ...state.results, [action.inletId]: action.results } };
    case 'tooltip':
      return { ...state, tooltip: action.tooltip };
    case 'notice':
      return { ...state, notice: action.notice };
    default:
      return state;
  }
}

/** Re-score every well's sequences for an inlet against its constraints; per-well and aggregate results. */
function recompute(state, inletId) {
  if (!inletId) return state;
  const cons = state.constraints.filter((c) => c.inletId === inletId);
  const insights = { ...state.insights };
  const all = [];
  for (const w of state.wells) {
    if (!w.active) continue;
    const ins = insights[w.id]?.[inletId];
    if (!ins?.sequences) continue;
    const results = resolveConstraints(ins.sequences, cons, w.type === 'context' ? 'logProbMean' : 'total');
    insights[w.id] = { ...insights[w.id], [inletId]: { ...ins, results } };
    all.push(...ins.sequences);
  }
  return { ...state, insights, results: { ...state.results, [inletId]: resolveConstraints(all, cons, 'total') } };
}

// ---- selectors --------------------------------------------------------------

export function currentInlet(state) {
  const { start, end } = state.selection;
  if (start === end) return findEnclosing(state.inlets, start);
  return findExact(state.inlets, start, end) ?? state.inlets.find((i) => i.start <= start && end <= i.end) ?? null;
}

export function activeWells(state) {
  return state.wells.filter((w) => w.active);
}

export function inletConstraints(state, inletId) {
  return state.constraints.filter((c) => c.inletId === inletId);
}

/** The word token under (or just before) a caret position, or null. */
export function wordAt(tokens, index) {
  const word = (t) => !t.isSpace && t.pos !== 'PUNCT';
  return tokens.find((t) => word(t) && t.start <= index && index < t.end)
    ?? tokens.find((t) => word(t) && t.end === index)
    ?? null;
}

export function tokensIn(tokens, start, end) {
  return tokens.filter((t) => t.start < end && t.end > start);
}
