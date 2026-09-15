// Inlets are highlighted ranges of the document the writer wants alternatives
// for. They must survive typing elsewhere in the text, so each edit is reduced
// to one replace operation and the ranges are shifted/expanded/trimmed.

/** Reduce an old→new text transition to a single {start, removed, inserted}. */
export function diffTexts(oldText, newText) {
  if (oldText === newText) return null;
  let start = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (start < minLen && oldText[start] === newText[start]) start++;
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return { start, removed: oldEnd - start, inserted: newEnd - start };
}

/**
 * Apply a change to a list of ranges ({start,end} exclusive end).
 * Returns a new list; ranges that collapse to nothing are dropped.
 */
export function shiftRanges(ranges, change) {
  if (!change) return ranges;
  const { start, removed, inserted } = change;
  const delta = inserted - removed;
  const changeEnd = start + removed;
  const out = [];
  for (const r of ranges) {
    let { start: s, end: e } = r;
    if (changeEnd <= s) {
      // change entirely before the range: shift
      s += delta; e += delta;
    } else if (start >= e) {
      // change entirely after: untouched (a pure insertion exactly at the end extends it)
      if (start === e && removed === 0) e += inserted;
    } else {
      // overlap
      if (start <= s && changeEnd >= e) {
        // range fully covered by the removal: keep it only if text was inserted in its place
        if (inserted > 0) { s = start; e = start + inserted; } else { continue; }
      } else if (start <= s) {
        // removal clips the beginning
        s = start + inserted;
        e += delta;
      } else if (changeEnd >= e) {
        // removal clips the end
        e = start + inserted;
      } else {
        // change strictly inside the range
        e += delta;
      }
    }
    if (e > s) out.push({ ...r, start: s, end: e });
  }
  return out;
}

export function findExact(ranges, start, end) {
  return ranges.find((r) => r.start === start && r.end === end) ?? null;
}

export function findEnclosing(ranges, index) {
  return ranges.find((r) => r.start <= index && index <= r.end) ?? null;
}

export function overlapping(ranges, start, end) {
  return ranges.filter((r) => r.start < end && r.end > start);
}
