// Word tokenisation + part-of-speech tagging in the browser, replacing spaCy.
// Default engine: wink-nlp (pure JS, Universal POS tags, ~ms per paragraph).
// Every character of the source text ends up in exactly one token: word tokens
// and whitespace tokens (pos '_SP'), with [start, end) offsets.
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import { makeToken } from '../core/tokens.js';
import { phonesReady, soundOut } from './phones.js';

let nlp = null;
function getNlp() {
  if (!nlp) nlp = winkNLP(model, ['pos']);
  return nlp;
}

/** Tag `text` with wink and return tokens covering the whole string. */
export function tagWithWink(text) {
  if (!text) return [];
  const engine = getNlp();
  const its = engine.its;
  const doc = engine.readDoc(text);
  const values = doc.tokens().out(its.value);
  const tags = doc.tokens().out(its.pos);
  const types = doc.tokens().out(its.type);

  const tokens = [];
  let cursor = 0;
  const pushSpace = (from, to) => {
    if (to > from) tokens.push(makeToken({ text: text.slice(from, to), start: from, end: to, pos: '_SP', isSpace: true }));
  };
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    let at = text.indexOf(v, cursor);
    if (at === -1) {
      // wink normalised something (rare); fall back to a case-insensitive search, then give up on this token
      at = text.toLowerCase().indexOf(v.toLowerCase(), cursor);
      if (at === -1) continue;
    }
    pushSpace(cursor, at);
    let pos = tags[i] || 'X';
    if (types[i] === 'punctuation' || types[i] === 'symbol' && pos === 'X') pos = types[i] === 'symbol' ? 'SYM' : 'PUNCT';
    tokens.push(makeToken({ text: text.slice(at, at + v.length), start: at, end: at + v.length, pos, isSpace: false }));
    cursor = at + v.length;
  }
  pushSpace(cursor, text.length);
  return tokens;
}

/** Attach CMUdict pronunciation data to word tokens (no-op until the dictionary is loaded). */
export function attachPhones(tokens) {
  if (!phonesReady()) return tokens;
  for (const t of tokens) {
    if (t.isSpace || t.pos === 'PUNCT') continue;
    const s = soundOut(t.text);
    t.phonemes = s.phonemes;
    t.rhymingPart = s.rhymingPart;
    t.syllables = s.syllables;
    t.stresses = s.stresses;
  }
  return tokens;
}

/** Word tokens of a suffix: tag prefix+suffix together (context helps the tagger) and keep the suffix part. */
export function tagSuffix(prefix, suffix, tagFn = tagWithWink) {
  const all = tagFn(prefix + suffix);
  const cut = prefix.length;
  const out = [];
  for (const t of all) {
    if (t.end <= cut) continue;
    if (t.start < cut) {
      // token straddles the boundary (e.g. the suggestion glued onto a word): keep the suffix part
      out.push({ ...t, text: t.text.slice(cut - t.start), start: cut });
    } else {
      out.push(t);
    }
  }
  return out;
}
