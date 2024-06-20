// import 'rangy/lib/rangy-selectionsaverestore';
// import 'rangy/lib/rangy-serializer';
export function getUniqueUUID() {
  var id = 'id' + Math.random().toString(16).slice(2);
  return id; // TODO small chance of collision, 
}
