// mostly ported from infinite-canvas

// This will hold our websocket connection to the server;
// it's null to begin with but initialized after connect
let socket = null;

function sendMessage(message) {
  if(checkAndRefreshSocket()){return}
  console.log("req:" + message.type, message);
  socket.send(JSON.stringify(message));
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
      "test": msg => console.log("test", msg),
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

// export {socket, sendMessage, assignSocket, recordTravel, hashChange, checkAndRefreshSocket};
export {socket, sendMessage, assignSocket, checkAndRefreshSocket};