module.exports = {
  apps: [
    {
      name: 'ink-and-code',
      script: 'node_modules/.bin/next',
      args: 'start -p 80',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      // 等待应用准备就绪
      wait_ready: true,
      listen_timeout: 10000,
      // 优雅关闭
      kill_timeout: 5000,
    },
  ],
};
