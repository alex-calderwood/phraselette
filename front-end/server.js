const express = require('express');
const webpack = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');
const config = require('./webpack.config.js');
const axios = require('axios');
const path = require('path');
const http = require('http');
const ws = require("ws");

// config
const myHostname = "localhost";
const myPort = 5001;

// import text generation scrap handlers
const {handleQueryLLM, sendClaudeReq, claudeReplyText} = require("./src/server/textgen.js");

const app = express();
const server = http.createServer(app);
const wss = new ws.Server({ server });
console.log(`prism-server-wss listening at ${myHostname}:${myPort}...`);


const compiler = webpack(config);

// Serve webpack bundle
app.use(webpackDevMiddleware(compiler, {
  publicPath: config.output.publicPath
}));


// Enable hot-reloading
app.use(webpackHotMiddleware(compiler, {
  log: console.log,
  path: '/__webpack_hmr',
  heartbeat: 10 * 1000
}));

// API routes
app.get('/api/external', async (req, res) => {
  try {
    // const response = await axios.get('https://api.example.com/data');
    console.log("external")

    // const response = await sendClaudeReq({prompt: "this is a test"})
    // console.log(response);

    res.json({});
  } catch (error) {
    res.status(500).json({ error: 'Error fetching data' });
  }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Always return the main index.html, so react-router render the route in the client
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
});

server.listen(myPort, () => {
  console.log(`Server running on port ${myPort}`);
});

// WebSocket connection handling
wss.on('connection', (clientSocket, req) => {
    console.log('New WebSocket connection');

    async function testClaude(message) {
      console.log("handleQuery", message);
      const claudeJSON = await sendClaudeReq({
        prompt: "tell me a joke about driving from San Francisco to Santa Cruz that will actually make me laugh."
      });
      console.log("completion", claudeJSON);
      let reply = claudeReplyText(claudeJSON);
      clientSocket.send(JSON.stringify({
        type: "test",
        text: reply,
      }))
    }
  
    clientSocket.on('message', (data) => {
      // infinite-canvas has a whole client nickname thing going on that we could port
      const message = JSON.parse(data.toString());
      console.log("msg", message);
      const handlers = {
        query: testClaude
      };
      const handler = handlers[message.type];
      if (!handler) {
        console.error("nohandler",  message);
        return;
      }
      try {
        handler(message);
      }
      catch (err) {
        console.error("Handler error:", err);
        return;
      }
    });
  
    clientSocket.on('close', () => {
      console.log('WebSocket connection closed');
    });
  });



