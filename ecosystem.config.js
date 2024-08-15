module.exports = {
  apps: [{
    name: "server",
    script: "server.js",
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000,
    env: {
      PORT: 8443,
      NODE_ENV: "production",
    }
  }]
}