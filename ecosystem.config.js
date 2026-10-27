// PM2 process config for an isolated deployment.
// Web runs on PORT 3100 (change if that port is taken on your server).
// Names are prefixed "etsyship-" so they never collide with your other PM2 apps.
module.exports = {
  apps: [
    {
      name: "etsyship-web",
      script: "npm",
      args: "start",
      cwd: __dirname,
      env: { NODE_ENV: "production", PORT: 3100 },
      max_restarts: 10,
    },
    {
      name: "etsyship-worker",
      script: "npm",
      args: "run worker",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
      max_restarts: 10,
    },
  ],
};
