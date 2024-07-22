const express = require('express');
const webpack = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');
const config = require('./webpack.config.js');
const axios = require('axios');
const path = require('path');
// const http = require('http');
// const WebSocket = require('ws');
const {sendClaudeReq, claudeReplyText} = require('./textgen.js');

const app = express();
// const server = http.createServer(app);
// const wss = new WebSocket.Server({ server });
const compiler = webpack(config);

// Serve webpack bundle
app.use(webpackDevMiddleware(compiler, {
  publicPath: config.output.publicPath
}));

// WebSocket connection handling
// wss.on('connection', (ws) => {
//     console.log('New WebSocket connection');
  
//     ws.on('message', (message) => {
//       console.log('Received:', message);
  
//       // Handle the message here
//       // For example, you could make an external API call:
//       axios.get('https://api.example.com/data')
//         .then(response => {
//           ws.send(JSON.stringify(response.data));
//         })
//         .catch(error => {
//           ws.send(JSON.stringify({ error: 'Error fetching data' }));
//         });
//     });
  
//     ws.on('close', () => {
//       console.log('WebSocket connection closed');
//     });
//   });

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

const port = process.env.PORT || 5001;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});