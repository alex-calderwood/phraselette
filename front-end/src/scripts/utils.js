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
  // Helper function to normalize input to {start, end} format
  const normalize = (span) => {
    if (Array.isArray(span)) {
      return { start: span[0], end: span[1] };
    }
    return span;
  };

  // Normalize both inputs
  const s1 = normalize(span1);
  const s2 = normalize(span2);

  // Check for overlap
  return (s1.start >= s2.start && s1.start <= s2.end) 
    || (s1.end >= s2.start && s1.end <= s2.end)
    || (s1.start <= s2.start && s1.end >= s2.end);
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

export function clone(obj) {
  const clone = JSON.parse(JSON.stringify(obj));
  return clone;
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

// Deduplication function
export function deduplicateByKey(arr, key) {
  const seen = new Set();
  return arr.filter(item => {
    const keyValue = item[key];
    if (seen.has(keyValue)) {
      return false;
    }
    seen.add(keyValue);
    return true;
  });
}