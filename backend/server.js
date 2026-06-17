const express = require('express');
const http = require('http');

const config = require('./config');
const { requireAuth } = require('./auth');
const authRoutes = require('./api/auth');
const metricsRoutes = require('./api/metrics');
const vehicleRoutes = require('./api/vehicle');
const { applySecurityHeaders, createCorsMiddleware } = require('./http-utils');
const { startMqttBroker } = require('./mqtt-broker');
const { createRateLimiter } = require('./rate-limit');
const { startDataSimulator } = require('./services/digital-twin');
const { ensureDefaultAdminUser } = require('./user-store');
const { setupWebSocket } = require('./websocket-server');

const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');
app.set('trust proxy', config.http.trustProxy);

app.use(applySecurityHeaders);
app.use(createCorsMiddleware());
app.use(express.json({ limit: config.http.bodyLimit }));
app.use(express.urlencoded({ extended: false, limit: config.http.bodyLimit }));

app.use('/api', createRateLimiter({
  windowMs: config.http.apiRateLimit.windowMs,
  max: config.http.apiRateLimit.max,
  keyPrefix: 'api',
  message: '请求过于频繁，请稍后再试'
}));

const authRateLimiter = createRateLimiter({
  windowMs: config.http.authRateLimit.windowMs,
  max: config.http.authRateLimit.max,
  keyPrefix: 'auth',
  message: '登录尝试过多，请稍后再试'
});

app.post('/api/auth/login', authRateLimiter);
app.post('/api/auth/register', authRateLimiter);

app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/vehicles', requireAuth, vehicleRoutes);
app.use('/api/metrics', requireAuth, metricsRoutes);

app.get('/api/system/config', requireAuth, (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const wsProtocol = protocol === 'https' ? 'wss' : 'ws';

  res.json({
    success: true,
    data: {
      httpPort: config.http.port,
      mqttPort: config.mqtt.port,
      mqttWsPort: config.mqtt.wsPort,
      websocketUrl: `${wsProtocol}://${host}`,
      mqttWebsocketUrl: `${wsProtocol}://${host.replace(/:\d+$/, '')}:${config.mqtt.wsPort}`,
      mqttAuthMode: 'jwt',
      mqttUsername: req.auth.username,
      simulatorEnabled: config.simulator.enabled
    }
  });
});

setupWebSocket(server);
server.requestTimeout = config.http.requestTimeoutMs;
server.headersTimeout = Math.max(config.http.requestTimeoutMs + 1000, 31000);

const bootstrap = async () => {
  await startMqttBroker();

  server.listen(config.http.port, config.http.host, () => {
    ensureDefaultAdminUser();
    console.log(`HTTP服务器运行在 http://${config.http.host}:${config.http.port}`);
    console.log(`WebSocket服务器运行在 ws://${config.http.host}:${config.http.port}`);
    console.log(`MQTT Broker运行在 mqtt://${config.mqtt.host}:${config.mqtt.port}`);

    for (const notice of config.startupNotices) {
      console.log(`[安全提示] ${notice}`);
    }

    if (config.simulator.enabled) {
      startDataSimulator();
    } else {
      console.log('数字孪生数据模拟器已禁用');
    }
  });
};

bootstrap().catch((error) => {
  console.error('服务器启动失败:', error);
  process.exit(1);
});

module.exports = { app, server };
