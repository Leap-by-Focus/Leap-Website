/**
 * PM2 Ecosystem Configuration
 * 
 * Manages the LEAP AI Server with auto-restart on crash.
 * 
 * Commands:
 *   npm run start:prod   - Start with PM2
 *   npm run stop:prod    - Stop PM2 process
 *   npm run logs         - View logs
 *   npm run status       - View process status
 * 
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */
module.exports = {
  apps: [
    {
      name: 'leap-ai-server',
      script: 'server.js',
      cwd: __dirname,
      
      // Auto-restart settings
      watch: false,                    // Don't restart on file changes (use nodemon for dev)
      autorestart: true,               // Restart on crash
      max_restarts: 10,                // Max restarts within min_uptime
      min_uptime: '10s',               // Consider started after 10s
      restart_delay: 1000,             // Wait 1s before restart
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 8081
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8081
      },
      
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      combine_logs: true,
      
      // Performance
      instances: 1,                    // Single instance (not clustered)
      exec_mode: 'fork',               // Fork mode for ES Modules
      
      // Graceful shutdown
      kill_timeout: 5000,              // 5s to shutdown gracefully
      wait_ready: false,
      listen_timeout: 10000            // Wait 10s for app to listen
    }
  ]
};
