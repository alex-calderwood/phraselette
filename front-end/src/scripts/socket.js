// mostly ported from infinite-canvas
import { getUniqueID } from "./utils";
// import { userData f}

// This will hold our websocket connection to the server;
// it's null to begin with but initialized after connect
let socket = null;
let globalHandlers = {};

function sendMessage(message) {
  if(checkAndRefreshSocket()){return}
  const requestId = getUniqueID();
  message.requestId = requestId;
  console.log("req:" + message.type, message);
  socket.send(JSON.stringify(message));
  return requestId;
}

export async function* streamFromWebSocket(streamType, data) {
  const requestId = getUniqueID();
  const request = { 
    id: requestId, 
    type: 'stream',
    subtype: streamType,
    data
  };

  while (true) {
    if (checkAndRefreshSocket()) {
      console.log("ws: refresh, waiting 1s");
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    const messageQueue = [];
    let resolveNext;
    let streamEnded = false;

    const messageHandler = (event) => {
      const message = JSON.parse(event.data);
      if (message.id === requestId) {
        if (message.type === 'stream') {
          // console.log(`Received stream data for ${streamType}`);
          messageQueue.push(message.data);
          if (resolveNext) {
            resolveNext();
            resolveNext = null;
          }
        } else if (message.type === 'stream_end') {
          // console.log(`Stream ended for ${streamType}`);
          streamEnded = true;
          socket.removeEventListener('message', messageHandler);
          if (resolveNext) {
            resolveNext();
            resolveNext = null;
          }
        }
      }
    };

    socket.addEventListener('message', messageHandler);
    socket.send(JSON.stringify(request));

    try {
      while (!streamEnded) {
        if (messageQueue.length > 0) {
          yield messageQueue.shift();
        } else {
          await new Promise(resolve => { resolveNext = resolve; });
        }
      }
    } finally {
      socket.removeEventListener('message', messageHandler);
    }

    break; // Exit the outer loop once the stream has ended
  }
}

function assignSocket(socketProtocol, host){
  socket = new WebSocket(`${socketProtocol}://${host}`);
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if(msg.type != "stream" && msg.type != "stream_end") { console.log("ws:got", msg); }
    const handlers = {
      "stream": () => {},
      "stream_end": () => {},
      "event_response": () => {},
      "error": (msg) => {console.error("ws: server error:", event.data)},
      ...globalHandlers
    };

    const handler = handlers[msg.type];
    if (!handler) {
      console.error("ws: nohandler event.data", event.data, 'handlers', handlers, 'type', msg.type);
      return;
    }
    handler(msg);
  });
}

function checkAndRefreshSocket() {
  // check the socket state, and if it is not open, reassign the socket
  if(socket.readyState===3){
    console.log('socket closed. reassigning');
    const loc = window.location;
    const socketProtocol = {"http:": "ws", "https:": "wss"}[loc.protocol];
    assignSocket(socketProtocol, loc.host+'/'+loc.hash.replace('#', '?'));
    return true;
  }else if(socket.readyState===0 || socket.readyState===2){
    console.log('socket connecting or closing');
    return true;
  }
  return false;
}

function registerHandlers(handlers) {
  globalHandlers = Object.assign(globalHandlers, handlers);
}

export function sendEventstoServer(event, userData, appState) {
  try {
    const id = sendMessage({
      type: "event",
      userData,
      event: event,
      // story: userData.narrative,
      appState
    });
    
    console.log('server says:', id);

  } catch (error) {
    console.error('Error saving state to server:', error);
  }

};



export {socket, sendMessage, assignSocket, checkAndRefreshSocket, registerHandlers};