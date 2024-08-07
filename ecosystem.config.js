module.exports = {
    apps: [
      {
        name: 'app-blue',
        script: 'server.js',
        env: {
          PORT: 8443,
          NODE_ENV: 'production',
        },
      },
      {
        name: 'app-green',
        script: 'server.js',
        env: {
          PORT: 8444,
          NODE_ENV: 'production',
        },
        disable_startup: true, // This will prevent it from starting automatically
      },
      {
        name: 'router',
        script: 'router.js',
        env: {
          NODE_ENV: 'production',
        },
      },
    ],
  };