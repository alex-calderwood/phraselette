const express = require("express");
const webpack = require("webpack");
const webpackDevMiddleware = require("webpack-dev-middleware");
const webpackHotMiddleware = require("webpack-hot-middleware");
const config = require("./webpack.config.js");
const path = require("path");
const http = require("http");
const ws = require("ws");
const fs = require("fs").promises
const axios = require("axios");
const { makeID } = require("./src/server/utils.js");
const { queryThesaurus, queryReader, queryDictionary } = require("./src/server/queries.js");

const writeQueues = new Map();


// Something unlikely to be seen, must match the tokenization in the python (server.py)
const breakToken = "&&VE*A=]";

// config
const myHostname = "localhost";
const myPort = 5026;
const flaskHost = "http://localhost";
const flaskPort = 5025;

const app = express();
const server = http.createServer(app);
const wss = new ws.Server({ server });
console.log(`prism-server-wss listening at ${myHostname}:${myPort}...`);
console.log(`communicating with python server at ${flaskHost}:${flaskPort}...`);

const compiler = webpack(config);

// Serve webpack bundle
app.use(
  webpackDevMiddleware(compiler, {
    publicPath: config.output.publicPath,
  })
);

// Enable hot-reloading
app.use(
  webpackHotMiddleware(compiler, {
    log: console.log,
    path: "/__webpack_hmr",
    heartbeat: 10 * 1000,
  })
);

app.get('/test', (req, res) => {
  res.send('Node.js server is working!');
});

// API routes
app.get("/api/external", async (req, res) => {
  try {
    // const response = await axios.get('https://api.example.com/data');
    console.log("external");
    res.json({});
  } catch (error) {
    res.status(500).json({ error: "Error fetching data" });
  }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Always return the main index.html, so react-router render the route in the client
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "dist", "index.html"));
});

// WebSocket connection handling
wss.on("connection", (clientSocket, req) => {
  const sessionId = makeID("session");
  const connectTime = Date.now();
  
  // Attach to socket so we can access in message handlers
  clientSocket.sessionData = {
    sessionId,
    connectTime
  };

  console.log("server: connect", sessionId);

  clientSocket.on("message", async (data) => {
    const message = JSON.parse(data.toString());
    console.log("server: on-msg:", message);

    const handlers = {
      thesaurus: (message) => queryThesaurus(message, clientSocket),
      reader:    (message) => queryReader(message, clientSocket),
      stream:    (message) => handleStream(message, clientSocket),
      dictionary: (message) => queryDictionary(message, clientSocket),
      event:      (message) => storeEvents(message, clientSocket),
    };

    const handler = handlers[message.type];
    if (!handler) {
      console.error("server: No handler for message type:", message.type);
      return;
    }

    try {
      await handler(message);
    } catch (err) {
      console.error("server: Handler error:", err);
      clientSocket.send(JSON.stringify({ type: "error", error: err.message }));
    }
  });

  clientSocket.on("close", () => {
    console.log("server: ws: close", sessionId);
    // broadcast({type: "leave", clientID: clientID});
  });
});

// function storeEvents(message, clientSocket){
//   console.log("event: storing", message, 'event', message.event);

//   const event = message.event;
//   const userId = event.eventDetails.userId;
//   const timestamp = event.timestamp;

//   // const filePath = `events/${userId}_cart_${storyType}.json`;
//   const filePath = `events/${userId}_event_${timestamp}.json`;

//   try {
//     const jsonData = JSON.stringify(message, null, 2);
//     fs.writeFileSync(filePath, jsonData);
//     console.log(`Events stored successfully in ${filePath}`);
//   } catch (error) {
//       console.error('Error storing events:', error);
//   }

//   clientSocket.send(JSON.stringify({
//     id: message.id, 
//     type: 'event_response',
//   }));
// }

async function storeEvents(message, clientSocket) {
  const userId = message.userData.userId;
  const event = message.event;
  // const timestamp = event.timestamp;
  const sessionID = event.sessionID;

  const filePath = `../../study_events/${userId}_events_${sessionID}.json`;
  
  // Create events directory if it doesn't exist
  await fs.mkdir('events', { recursive: true }).catch(() => {});

  // Get or create queue for this user
  if (!writeQueues.has(userId)) {
    writeQueues.set(userId, Promise.resolve());
  }

  // Chain this write onto the queue
  writeQueues.set(userId, writeQueues.get(userId).then(async () => {
    try {
      let events = [];
      try {
        const content = await fs.readFile(filePath);
        events = JSON.parse(content);
      } catch (err) {
        if (err.code !== 'ENOENT') console.error('Read error:', err);
      }
      
      events.push(message);
      await fs.writeFile(filePath, JSON.stringify(events, null, 2));
      clientSocket.send(JSON.stringify({ 
        id: message.id, 
        type: 'event_response' 
      }));
    } catch (err) {
      console.error('Write error:', err);
      throw err;
    }
  }));
}

async function handleStream(message, clientSocket) {
  let streamEndpoints = [
    "probs",
    "search",
    "spacy",
    "phones",
  ];

  if (!streamEndpoints.includes(message.subtype) || message.type !== 'stream') {
    throw new Error("Invalid stream request " + JSON.stringify(message));
  }

  if (message.type === 'stream') {
    let count = 0;
    for await (const chunk of makePythonRequest(message)) {
      clientSocket.send(JSON.stringify({ 
        id: message.id, 
        type: 'stream',
        subtype: message.subtype,
        data: chunk
      }));
      count ++;
    }
    clientSocket.send(JSON.stringify({
      id: message.id, 
      type: 'stream_end',
      subtype: message.subtype,
    }));

    console.log(`sent stream_end to client after ${count} chunks for message ${message.id}`);
  }
}

async function* makePythonRequest(message) {
  const { subtype, data } = message;
  const endpoint = `${flaskHost}:${flaskPort}/${subtype}`;

  try {
    const response = await axios({
      method: 'post',
      url: endpoint,
      data: data,
      headers: {
        'Content-Type': 'application/json'
      },
      responseType: 'stream'
    });

    let buffer = '';
    for await (const chunk of response.data) {
      buffer += chunk.toString();
      const lines = buffer.split(breakToken);
      buffer = lines.pop();

      for (const line of lines) {
        if (line.trim()) {
          const token = JSON.parse(line);
          yield token;
        }
      }
    }
  } catch (error) {
    console.error(`There has been a problem with your ${subtype} request:`, error);
    throw error; // Re-throw the error to be caught by the caller
  }
}

server.listen(myPort, () => {
  console.log(`Server running on at ${myHostname} on port ${myPort}`);
});
