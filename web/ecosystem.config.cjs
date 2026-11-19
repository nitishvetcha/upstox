// PM2 ecosystem config — Upstox Options Analyzer web dashboard only.
//
// IMPORTANT SAFETY RULES:
//   - The paper-trading runner and supervisor are NOT configured here.
//     Start them manually only when required and only after verifying
//     that Upstox authentication is valid.
//   - The LaunchAgent (com.upstox.paper-supervisor) remains DISABLED.
//     Do NOT re-enable it without explicit authorization.
//   - Live broker execution is NOT configured and remains unauthorized.
//
// Usage:
//   pm2 start ecosystem.config.cjs          # start dashboard
//   pm2 stop upstox-dashboard               # stop dashboard
//   pm2 restart upstox-dashboard            # restart dashboard
//   pm2 logs upstox-dashboard               # stream logs
//   pm2 monit                               # resource monitor
//   pm2 save                                # save process list for pm2 resurrect
//
// First-time setup:
//   npm run build                           # build production Next.js bundle
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup                            # follow the printed command to auto-start on boot

module.exports = {
  apps: [
    {
      name: "upstox-dashboard",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: __dirname,

      // Port must match UPSTOX_REDIRECT_URI and all internal references
      env: {
        NODE_ENV: "production",
        PORT: "3123",
        TZ: "Asia/Kolkata",

        // Feature flags — both MUST remain false
        OPTION_QUOTE_LTT_ENABLED: "false",
        OPTION_QUOTE_CANARY_ENABLED: "false",
      },

      // Log configuration
      out_file: ".data/logs/pm2-dashboard-out.log",
      error_file: ".data/logs/pm2-dashboard-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      // Restart policy
      restart_delay: 5000,           // wait 5 s before restarting on crash
      max_restarts: 10,              // give up after 10 consecutive crashes
      min_uptime: "30s",             // a start counts as stable after 30 s
      autorestart: true,

      // Watch — disabled in production; use pm2 restart after deploys
      watch: false,

      // Cluster mode is not used here; single instance is sufficient for
      // the dashboard's current traffic profile. Enable if needed:
      // instances: "max",
      // exec_mode: "cluster",
      instances: 1,
      exec_mode: "fork",

      // Environment variables loaded from .env.local at Next.js build time.
      // Runtime secrets (UPSTOX_CLIENT_ID, UPSTOX_CLIENT_SECRET) should be
      // set in .env.local, not here, to avoid exposing them in `pm2 show`.
    },
  ],
};
