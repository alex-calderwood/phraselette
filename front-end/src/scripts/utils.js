export function getUniqueID() {
  var id = 'id-' + Math.random().toString(16).slice(2);
  return id; // TODO small chance of collision, 
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