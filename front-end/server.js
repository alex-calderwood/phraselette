const express = require('express');
const webpack = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');
const config = require('./webpack.config.js');
const axios = require('axios');
const path = require('path');
const http = require('http');
const ws = require("ws");

const {handleDictionary, queryCritic} = require('./src/server/queries.js');

// config
const myHostname = "localhost";
const myPort = 5001;

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
  
    clientSocket.on('message', (data) => {
      // infinite-canvas has a whole client nickname thing going on that we could port
      const message = JSON.parse(data.toString());
      console.log("msg", message);
      const handlers = {
        dictionary: (message) => handleDictionary(message, clientSocket),
        critic: (message) => queryCritic(message, clientSocket),
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



