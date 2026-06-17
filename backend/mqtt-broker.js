const { Aedes } = require('aedes');
const http = require('http');
const net = require('net');
const { WebSocketServer, createWebSocketStream } = require('ws');
const config = require('./config');
const {
  constantTimeEqualText,
  verifyAccessToken
} = require('./auth');
const store = require('./data-store');
const {
  sanitizeMetricInput,
  sanitizeVehicleStatusInput,
  validateVehicleId
} = require('./validation');

const MQTT_PORT = config.mqtt.port;
const MQTT_HOST = config.mqtt.host;
const WS_PORT = config.mqtt.wsPort;
const WS_HOST = config.mqtt.wsHost;
const MAX_PAYLOAD_BYTES = config.mqtt.maxPayloadBytes;

const TOPICS = {
  VEHICLE_STATUS: 'yuchi/vehicle/+/status',
  VEHICLE_CONTROL: 'yuchi/vehicle/+/control',
  V2X_BSM: 'yuchi/v2x/bsm',
  V2X_SPAT: 'yuchi/v2x/spat',
  NETWORK_METRICS: 'yuchi/network/metrics',
  YOLO_DETECTION: 'yuchi/perception/yolo',
  OPENMV_LANE: 'yuchi/perception/lane',
  DIGITAL_TWIN: 'yuchi/twin/state'
};

const APP_SUBSCRIPTIONS = new Set([
  TOPICS.VEHICLE_STATUS,
  TOPICS.VEHICLE_CONTROL,
  TOPICS.NETWORK_METRICS,
  TOPICS.YOLO_DETECTION,
  TOPICS.DIGITAL_TWIN
]);

const DEVICE_PUBLISH_PATTERNS = [
  /^yuchi\/vehicle\/[a-zA-Z0-9_-]{1,64}\/status$/,
  /^yuchi\/network\/metrics$/,
  /^yuchi\/perception\/yolo$/,
  /^yuchi\/perception\/lane$/,
  /^yuchi\/v2x\/bsm$/,
  /^yuchi\/v2x\/spat$/,
  /^yuchi\/twin\/state$/
];

const DEVICE_SUBSCRIBE_PATTERNS = [
  /^yuchi\/vehicle\/\+\/control$/,
  /^yuchi\/vehicle\/[a-zA-Z0-9_-]{1,64}\/control$/
];

let broker = null;
let startPromise = null;
let tcpServer = null;
let httpServer = null;
let wsServer = null;

const emitRealtime = (message) => {
  if (typeof global.wsBroadcast === 'function') {
    global.wsBroadcast(message);
  }
};

const parsePayload = (payload) => {
  if (!payload || payload.length === 0) {
    return {};
  }

  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new Error('MQTT payload too large');
  }

  const text = payload.toString();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('MQTT payload must be valid JSON');
  }
};

const matchesAnyPattern = (value, patterns) => patterns.some((pattern) => pattern.test(value));

const createAuthError = (message) => {
  const error = new Error(message);
  error.returnCode = 5;
  return error;
};

const authenticateWithJwt = (username, password) => {
  try {
    const payload = verifyAccessToken(password);
    if (!constantTimeEqualText(payload.username, username)) {
      return null;
    }

    return {
      type: 'app',
      username: payload.username,
      userId: payload.userId,
      role: payload.role
    };
  } catch (error) {
    return null;
  }
};

const authenticateWithDeviceSecret = (username, password) => {
  if (
    constantTimeEqualText(username, config.mqtt.deviceUsername) &&
    constantTimeEqualText(password, config.mqtt.devicePassword)
  ) {
    return {
      type: 'device',
      username
    };
  }

  return null;
};

const buildBrokerOptions = () => ({
  authenticate(client, username, password, callback) {
    if (config.mqtt.allowAnonymous) {
      client.authContext = { type: 'anonymous', username: 'anonymous' };
      callback(null, true);
      return;
    }

    const usernameText = Buffer.isBuffer(username) ? username.toString('utf8') : String(username || '');
    const passwordText = Buffer.isBuffer(password) ? password.toString('utf8') : String(password || '');

    const authContext = authenticateWithJwt(usernameText, passwordText)
      || authenticateWithDeviceSecret(usernameText, passwordText);

    if (!authContext) {
      callback(createAuthError('MQTT unauthorized'), false);
      return;
    }

    client.authContext = authContext;
    callback(null, true);
  },

  authorizePublish(client, packet, callback) {
    if (!packet || !packet.topic) {
      callback(createAuthError('Missing topic'));
      return;
    }

    if (packet.topic.startsWith('$SYS')) {
      callback(createAuthError('System topics are not writable'));
      return;
    }

    if (!client || !client.authContext) {
      callback(null);
      return;
    }

    if ((packet.payload?.length || 0) > MAX_PAYLOAD_BYTES) {
      callback(createAuthError('MQTT payload too large'));
      return;
    }

    if (packet.retain) {
      callback(createAuthError('Retained MQTT messages are not allowed'));
      return;
    }

    if (client.authContext.type === 'app') {
      callback(createAuthError('Application clients cannot publish MQTT messages'));
      return;
    }

    if (client.authContext.type === 'device' && matchesAnyPattern(packet.topic, DEVICE_PUBLISH_PATTERNS)) {
      packet.qos = 0;
      callback(null);
      return;
    }

    callback(createAuthError('Topic is not allowed for publish'));
  },

  authorizeSubscribe(client, subscription, callback) {
    if (!client || !client.authContext) {
      callback(createAuthError('Unauthorized subscribe'));
      return;
    }

    const topic = subscription?.topic || '';
    if (!topic || topic.startsWith('$SYS')) {
      callback(createAuthError('Topic is not allowed'));
      return;
    }

    if (client.authContext.type === 'app' && APP_SUBSCRIPTIONS.has(topic)) {
      callback(null, subscription);
      return;
    }

    if (client.authContext.type === 'device' && matchesAnyPattern(topic, DEVICE_SUBSCRIBE_PATTERNS)) {
      callback(null, subscription);
      return;
    }

    callback(createAuthError('Topic is not allowed for subscribe'));
  }
});

const applyExternalTopicToState = (topic, data, timestamp) => {
  const statusMatch = topic.match(/^yuchi\/vehicle\/([^/]+)\/status$/);
  if (statusMatch) {
    const vehicleId = validateVehicleId(statusMatch[1]);
    const vehicle = store.updateVehicle(vehicleId, sanitizeVehicleStatusInput(data));
    emitRealtime({
      type: 'vehicle_update',
      vehicleId,
      data: vehicle,
      timestamp
    });
    return;
  }

  if (topic === TOPICS.NETWORK_METRICS) {
    const safeMetric = sanitizeMetricInput(data);
    const metric = store.addNetworkMetric({
      vehicleId: safeMetric.vehicleId,
      latency: safeMetric.latency ?? 0,
      packetLoss: safeMetric.packetLoss ?? 0,
      rsrp: safeMetric.rsrp ?? -85,
      sinr: safeMetric.sinr ?? 20,
      throughput: safeMetric.throughput ?? 0
    });

    emitRealtime({
      type: 'network_metrics',
      data: metric,
      timestamp
    });
    return;
  }

  if (topic === TOPICS.YOLO_DETECTION || topic === TOPICS.OPENMV_LANE) {
    emitRealtime({
      type: 'yolo_detection',
      data,
      timestamp
    });
    return;
  }

  if (topic === TOPICS.DIGITAL_TWIN) {
    emitRealtime({
      type: 'twin_snapshot',
      data,
      timestamp
    });
  }
};

const attachBrokerEvents = (instance) => {
  instance.on('client', (client) => {
    console.log(`MQTT客户端连接: ${client.id}`);
  });

  instance.on('clientDisconnect', (client) => {
    console.log(`MQTT客户端断开: ${client.id}`);
  });

  instance.on('connectionError', (client, error) => {
    console.warn(`MQTT连接错误: ${error.message}`);
  });

  instance.on('clientError', (client, error) => {
    console.warn(`MQTT客户端错误 ${client?.id || 'unknown'}: ${error.message}`);
  });

  instance.on('publish', (packet, client) => {
    if (!packet || !packet.topic || packet.topic.startsWith('$SYS')) {
      return;
    }

    const timestamp = new Date().toISOString();
    let data;
    try {
      data = parsePayload(packet.payload);
    } catch (error) {
      console.warn(`忽略无效 MQTT 消息 [${packet.topic}]: ${error.message}`);
      return;
    }

    if (client) {
      try {
        applyExternalTopicToState(packet.topic, data, timestamp);
      } catch (error) {
        console.warn(`MQTT 数据处理失败 [${packet.topic}]: ${error.message}`);
        return;
      }
    }

    emitRealtime({
      type: 'mqtt_message',
      topic: packet.topic,
      data,
      timestamp
    });
  });
};

const listen = (server, port, host) => {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
};

const publishTopic = (topic, payload, options = {}) => {
  if (!broker) {
    return;
  }

  const body = typeof payload === 'string'
    ? payload
    : JSON.stringify(payload);

  broker.publish({
    topic,
    payload: Buffer.from(body),
    qos: options.qos || 0,
    retain: false
  }, () => {});
};

const startMqttBroker = async () => {
  if (startPromise) {
    return startPromise;
  }

  startPromise = (async () => {
    broker = await Aedes.createBroker(buildBrokerOptions());
    attachBrokerEvents(broker);

    tcpServer = net.createServer(broker.handle);
    httpServer = http.createServer();
    wsServer = new WebSocketServer({
      server: httpServer,
      perMessageDeflate: false,
      maxPayload: MAX_PAYLOAD_BYTES,
      handleProtocols(protocols) {
        if (protocols.has('mqtt')) {
          return 'mqtt';
        }

        if (protocols.has('mqttv3.1')) {
          return 'mqttv3.1';
        }

        return false;
      }
    });

    wsServer.on('connection', (socket, req) => {
      const stream = createWebSocketStream(socket);
      broker.handle(stream, req);
    });

    await Promise.all([
      listen(tcpServer, MQTT_PORT, MQTT_HOST),
      listen(httpServer, WS_PORT, WS_HOST)
    ]);

    console.log(`MQTT TCP服务器运行在 mqtt://${MQTT_HOST}:${MQTT_PORT}`);
    console.log(`MQTT WebSocket服务器运行在 ws://${WS_HOST}:${WS_PORT}`);

    return {
      tcpServer,
      httpServer,
      publishTopic
    };
  })();

  return startPromise;
};

module.exports = { startMqttBroker, TOPICS, publishTopic };
