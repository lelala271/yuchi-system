const WebSocket = require('ws');
const config = require('./config');
const { verifyAccessToken } = require('./auth');
const { isAllowedOrigin } = require('./http-utils');

const clients = new Map();

const extractTokenFromProtocols = (req) => {
  const header = req.headers['sec-websocket-protocol'];
  if (!header) {
    return null;
  }

  const protocols = String(header)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const authProtocol = protocols.find((item) => item.startsWith('auth.'));
  return authProtocol ? authProtocol.slice('auth.'.length) : null;
};

const getTokenFromRequest = (req) => {
  const tokenFromProtocols = extractTokenFromProtocols(req);
  if (tokenFromProtocols) {
    return tokenFromProtocols;
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    return url.searchParams.get('token');
  } catch (error) {
    return null;
  }
};

const setupWebSocket = (server) => {
  const wss = new WebSocket.Server({
    server,
    maxPayload: config.websocket.maxPayloadBytes,
    perMessageDeflate: false,
    handleProtocols(protocols) {
      if (protocols.has('yuchi.v1')) {
        return 'yuchi.v1';
      }

      return false;
    }
  });

  const heartbeatTimer = setInterval(() => {
    for (const [clientId, entry] of clients.entries()) {
      if (!entry.isAlive) {
        entry.ws.terminate();
        clients.delete(clientId);
        continue;
      }

      entry.isAlive = false;
      entry.ws.ping();
    }
  }, 30000);
  heartbeatTimer.unref();

  wss.on('connection', (ws, req) => {
    if (!isAllowedOrigin(req.headers.origin, req)) {
      ws.close(1008, 'origin not allowed');
      return;
    }

    if (clients.size >= config.websocket.maxClients) {
      ws.close(1013, 'server busy');
      return;
    }

    const token = getTokenFromRequest(req);
    let identity = null;

    try {
      identity = verifyAccessToken(token);
    } catch (error) {
      ws.close(1008, 'unauthorized');
      return;
    }

    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    clients.set(clientId, { ws, identity, isAlive: true });

    console.log(
      `WebSocket客户端连接: ${clientId} (${identity.username}) (总连接数: ${clients.size})`
    );

    ws.send(JSON.stringify({
      type: 'connection',
      clientId,
      message: '已连接到驭驰数字孪生服务器',
      user: {
        userId: identity.userId,
        username: identity.username,
        role: identity.role
      },
      timestamp: new Date().toISOString()
    }));

    ws.on('pong', () => {
      const entry = clients.get(clientId);
      if (entry) {
        entry.isAlive = true;
      }
    });

    ws.on('message', (message) => {
      if (message.length > config.websocket.maxPayloadBytes) {
        ws.close(1009, 'message too large');
        return;
      }

      try {
        const data = JSON.parse(message.toString());
        console.log(`收到客户端 ${clientId} 消息:`, data.type);
      } catch (error) {
        console.warn(`忽略无效 WebSocket 消息: ${error.message}`);
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
      console.log(`WebSocket客户端断开: ${clientId} (剩余连接: ${clients.size})`);
    });

    ws.on('error', (error) => {
      console.error(`客户端 ${clientId} 错误:`, error);
    });
  });

  const broadcast = (message) => {
    const messageStr = JSON.stringify(message);
    for (const entry of clients.values()) {
      if (entry.ws.readyState === WebSocket.OPEN) {
        entry.ws.send(messageStr);
      }
    }
  };

  global.wsBroadcast = broadcast;

  return wss;
};

module.exports = { setupWebSocket };
