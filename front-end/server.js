const express = require("express");
const webpack = require("webpack");
const webpackDevMiddleware = require("webpack-dev-middleware");
const webpackHotMiddleware = require("webpack-hot-middleware");
const config = require("./webpack.config.js");
const path = require("path");
const http = require("http");
const ws = require("ws");
const axios = require("axios");
const { makeID } = require("./src/server/utils.js");

const { handleThesaurus, queryReader } = require("./src/server/queries.js");

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
  const clientID = makeID("user");

  console.log("server: connect", clientID);

  clientSocket.on("message", async (data) => {
    const message = JSON.parse(data.toString());
    console.log("server: on-msg:", message);

    const handlers = {
      thesaurus: (message) => handleThesaurus(message, clientSocket),
      reader:    (message) => queryReader(message, clientSocket),
      stream:    (message) => handleStream(message, clientSocket),
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
    console.log("server: ws: close", clientID);
    // broadcast({type: "leave", clientID: clientID});
  });
});

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
    for await (const chunk of makeRequest(message)) {
      clientSocket.send(JSON.stringify({ 
        id: message.id, 
        type: 'stream',
        subtype: message.subtype,
        data: chunk
      }));
    }
    clientSocket.send(JSON.stringify({
      id: message.id, 
      type: 'stream_end',
      subtype: message.subtype,
    }));
  }
}

async function* makeRequest(message) {
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
