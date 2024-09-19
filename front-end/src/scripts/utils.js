export function getUniqueID(typeIdentifier='id') {
  var id = `${typeIdentifier}-` + Math.random().toString(16).slice(2);
  return id; // small chance of collision
}

// for some reason javascript doesn't have this built in
export function insertAfter(newNode, referenceNode) { 
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

/* 
* Does span1 overlap with span2?
*/
export function overlaps(span1, span2) {
  // return span1.start <= span2.end && span1.end >= span2.start;
  return (span1.start >= span2.start && span1.start <= span2.end) 
  || (span1.end >= span2.start && span1.end <= span2.end)
  || (span1.start <= span2.start && span1.end >= span2.end);
}

export function scientific(num) {
  if (num !== 0 && (num < 1e-3 || num >= 1e+7)) return num.toExponential(3);
  if (num?.toPrecision) return num.toPrecision(3);
  return num;
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function humanLog(logProb) {
  if (logProb === 0) return "0";

  const absLogProb = Math.abs(logProb);
  
  if (absLogProb >= 100) {
    // For very large absolute values
    return logProb.toFixed(0);
  } else if (absLogProb >= 10) {
    // For moderately large absolute values
    return logProb.toFixed(0);
  } else if (absLogProb >= 1) {
    // For absolute values between 1 and 10
    return logProb.toFixed(0);
  } else {
    // For small absolute values (< 1)
    return logProb.toFixed(1);
  }
}

/**
 * Represents a range with a start, end, and associated value.
 */
class Range {
  constructor(start, end, value, id=getUniqueID('range')) {
    this.start = start;
    this.end = end;
    this.value = value;
    this.id = id;
  }

  /**
   * @returns {Range} a copy (with the identical ID so be careful)
   **/
  copy() {
    let range = new Range(this.start, this.end, this.value, this.id);
    return range;
  }
}

/**
 * A data structure for managing ranges and their associated values.
 * Supports operations like setting, getting, updating, and querying ranges.
 */
export class RangeMap {
  constructor() {
    this.ranges = [];

    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) return target[prop];
        const [start, end] = prop.split(',').map(Number);
        return target.findRange(start, end);
      },
      set(target, prop, value) {
        const [start, end] = prop.split(',').map(Number);
        const existingRange = target.findRange(start, end);
        if (existingRange) {
          existingRange.value = value;
        } else {
          target.set(start, end, value);
        }
        return true;
      }
    });
  }

  set(start, end, value) {
    if (isNaN(start) || isNaN(end)) {
      console.warn('Attempted to set a range with NaN value. This entry will be ignored.');
      return null; // or you could throw an error if you prefer
    }

    const newRange = new Range(start, end, value);
    this.ranges.push(newRange);
    return newRange.id;
  }

  get(start, end) {
    const range = this.ranges.find(r => r.start === start && r.end === end);
    return range ? range.value : undefined;
  }

  findRange(start, end) {
    return this.ranges.find(r => r.start === start && r.end === end);
  }

  findEnclosingRange(index) {
    return this.ranges.find(r => r.start <= index && r.end >= index);
  }

  findRangeById(id) {
    return this.ranges.find(r => r.id === id);
  }

  updateRange(start, end, newStart, newEnd) {
    const range = this.findRange(start, end);
    if (range) {
      range.start = newStart;
      range.end = newEnd;
      return true;
    }
    return false;
  }

  updateRangeById(id, newStart, newEnd) {
    const range = this.findRangeById(id);
    if (range) {
      range.start = newStart;
      range.end = newEnd;
      return true;
    }
    return false;
  }

  copy() {
    const newRangeMap = new RangeMap();
    this.ranges.forEach(range => {
      newRangeMap.set(range.start, range.end, range.value);
    });
    // console.log("openings: copy", this, newRangeMap);
    return newRangeMap;
  }

  getAllRanges() {
    return this.ranges;
  }

  keys() {
    return this.ranges.map(r => [r.start, r.end]);
  }
}