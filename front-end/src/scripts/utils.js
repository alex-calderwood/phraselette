export function getUniqueUUID() {
  var id = 'id' + Math.random().toString(16).slice(2);
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
