const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

let activePort = 8443;

const proxy = createProxyMiddleware({
  target: `http://localhost:${activePort}`,
  changeOrigin: true,
  router: () => `http://localhost:${activePort}`,
});

app.use('/', proxy);

app.post('/switch', (req, res) => {
  activePort = activePort ===  8443 ? 8444 : 8445;
  console.log(`Switched to port ${activePort}`);
  res.send(`Switched to port ${activePort}`);
});

const routerPort = 8445;
app.listen(routerPort, () => {
  console.log(`Router is running on port ${routerPort}`);
});