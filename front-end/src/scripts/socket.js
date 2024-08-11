// mostly ported from infinite-canvas
import { getUniqueUUID } from "./utils";

// This will hold our websocket connection to the server;
// it's null to begin with but initialized after connect
let socket = null;

function sendMessage(message) {
  if(checkAndRefreshSocket()){return}
  const requestId = getUniqueUUID();
  message.requestId = requestId;
  console.log("req:" + message.type, message);
  socket.send(JSON.stringify(message));
  return requestId;
}

export async function* streamFromWebSocket(streamType, data) {
  console.log(`Starting stream: ${streamType}`);
  const requestId = getUniqueUUID();
  const request = { 
    id: requestId, 
    type: 'stream',
    subtype: streamType,
    data
  };

  while (true) {
    if (checkAndRefreshSocket()) {
      console.log("Socket refreshed, waiting before trying again");
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
          console.log(`Received stream data for ${streamType}`);
          messageQueue.push(message.data);
          if (resolveNext) {
            resolveNext();
            resolveNext = null;
          }
        } else if (message.type === 'stream_end') {
          console.log(`Stream ended for ${streamType}`);
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
    console.log(`Request sent for ${streamType}`);

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

function assignSocket(socketProtocol, host, extraHandlers){
  socket = new WebSocket(`${socketProtocol}://${host}`);
  socket.addEventListener("open", (event) => {
    // sendMessage({type: "chat", text: "meowdy server"});
  });
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    console.log("ws:got", msg);
    const handlers = {
      // "stream": msg => streamFromWebSocket(msg.subtype, msg.data),
      "stream": () => {},
      "stream_end": () => {},
      ...extraHandlers
    };

    const handler = handlers[msg.type];
    if (!handler) {
      console.error("ws:nohandler", event.data);
      return;
    }
    handler(msg);
  });
}

function checkAndRefreshSocket(){
  // check the socket state, and if it is not open, reassign the socket
  if(socket.readyState===3){
    console.log('socket closed. reassigning');
    const loc = window.location;
    const socketProtocol = {"http:": "ws", "https:": "wss"}[loc.protocol];
    assignSocket(socketProtocol, loc.host+'/'+loc.hash.replace('#', '?'));
    return true
  }else if(socket.readyState===0 || socket.readyState===2){
    console.log('socket connecting or closing');
    return true
  }
  return false
}

export {socket, sendMessage, assignSocket, checkAndRefreshSocket};