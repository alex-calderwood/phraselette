// import 'rangy/lib/rangy-selectionsaverestore';
// import 'rangy/lib/rangy-serializer';
export function getUniqueUUID() {
  var id = 'id' + Math.random().toString(16).slice(2);
  return id; // TODO small chance of collision, 
}

// for some reason javascript doesn't have this built in
export function insertAfter(newNode, referenceNode) { 
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}