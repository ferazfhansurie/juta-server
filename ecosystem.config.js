module.exports = {
  apps: [{
    name: "server",
    script: "server.js",
    instances: "max",
    exec_mode: "cluster",
    watch: true,
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000,
    env: {
      NODE_ENV: "production",
    }
  }]
}