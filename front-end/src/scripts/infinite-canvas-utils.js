// utility functions stolen from infinite-canvas
/// *** import necessary functions ***
// const crypto = require("crypto");
// const fs = require("fs");
// const apiCreds = JSON.parse(fs.readFileSync("./credentials.json").toString());
import apiCreds from "../credentials.json";

/// *** non-handler functions ***

/// general utility functions
// make a unique ID string with a specific prefix, or none if left unspecified
export function makeID(prefix) {
  const baseID = crypto.randomUUID();
  return prefix ? `${prefix}-${baseID}` : baseID;
}

// group the list of `xs` by the return value of `f(x)` on each `x`
export function groupBy(xs, f) {
  const groups = {};
  for (const x of xs) {
    const groupName = f(x);
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(x);
  }
  return groups;
}

// return a flat list obtained by concatenating together
// the list return values of `f(x)` on each `x` in `xs`
export function mapcat(xs, f) {
  const ys = [];
  for (const x of xs) {
    const immediateYs =  f(x);
    for (const y of immediateYs) {
      ys.push(y);
    }
  }
  return ys;
}

// return a random item from a list
export function randNth(items) {
  return items[Math.floor(Math.random()*items.length)];
}

// return a reversed copy of the list
// should be superseded by Array.toReversed but old node doesn't have that
export function reverse(xs) {
  const reversed = [];
  for (let i = xs.length - 1; i >= 0; i--) {
    reversed.push(xs[i]);
  }
  return reversed;
}

// return the sum of a list of numbers
export function sum(xs) {
  return xs.reduce((a, b) => a + b, 0);
}

// return the average of a list of numbers
export function average(xs) {
  return sum(xs) / xs.length;
}

// capitalize the first letter in a string
export function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/// communication utility export functions
// broadcast `msg` to all connected clients
export function broadcast(msg, world) {
  if (msg.type !== "mousemove") {
    console.log("sv->cl*:" + msg.type, msg);
  }
  const msgStr = JSON.stringify(msg);
  for (const client of Object.values(world.clients)) {
    client.socket.send(msgStr);
  }
}

// broadcast `msg` to all clients except the specified client
export function broadcastExcept(msg, client, world) {
  if (msg.type !== "mousemove") {
    console.log("sv->cls:" + msg.type, client.nick, msg);
  }
  const msgStr = JSON.stringify(msg);
  for (const otherClient of Object.values(world.clients)) {
    if (otherClient.id === client.id) continue;
    otherClient.socket.send(msgStr);
  }
}

// send `msg` to the specified `client` only
export function sendMessage(msg, client, world) {
  console.log("sv->cl:" + msg.type, client.nick, msg);
  world.clients[client.id].socket.send(JSON.stringify(msg));
}

/// HTTP I/O utility export functions

// Make an HTTPS request to a JSON API with given `opts` and `payloadString`,
// then return the parsed JSON body of the API's response.
// Throw an error if the HTTPS request fails, if the response status code
// is outside the 2xx (successful) range, or if the response body can't be
// parsed as JSON.
export async function fetchJSONResponse(opts, payloadString) {
  const url = "https://" + opts.hostname + opts.path;
  const fetchOpts = {method: opts.method, headers: opts.headers};
  if (payloadString) fetchOpts.body = payloadString;
  const res = await fetch(url, fetchOpts);
  if (!res.ok) {
    throw {
      errorType: "badHttpStatusCode",
      statusCode: res.status,
      statusMessage: res.statusText
    };
  }
  return res.json();
}

// TODO - not used for now... 
// Fetch an image at the given `url` and return the image itself as a data URL.
export async function fetchImage(url) {
  const res = await fetch(url);
  let dataURL = "data:" + res.headers.get("content-type") + ";base64,";
  dataURL += Buffer.from(await res.arrayBuffer()).toString("base64");
  return dataURL;
}

/// *** exporting non-handler functions used in files ***
// exports.makeID = makeID;
// exports.groupBy = groupBy;
// exports.mapcat = mapcat;
// exports.randNth = randNth;
// exports.reverse = reverse;
// exports.sum = sum;
// exports.average = average;
// exports.capitalizeFirst = capitalizeFirst;

// exports.broadcast = broadcast;
// exports.broadcastExcept = broadcastExcept;
// exports.sendMessage = sendMessage;

// exports.apiCreds = apiCreds;
// exports.fetchJSONResponse = fetchJSONResponse;
// exports.fetchImage = fetchImage;
