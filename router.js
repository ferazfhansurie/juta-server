const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

let activePort = 8444;

const proxy = createProxyMiddleware({
  target: `http://localhost:${activePort}`,
  changeOrigin: true,
  router: () => `http://localhost:${activePort}`,
});

app.use('/', proxy);

app.post('/switch', (req, res) => {
  activePort = activePort ===  8444 ? 8445 : 8446;
  console.log(`Switched to port ${activePort}`);
  res.send(`Switched to port ${activePort}`);
});

const routerPort = 8446;
app.listen(routerPort, () => {
  console.log(`Router is running on port ${routerPort}`);
});