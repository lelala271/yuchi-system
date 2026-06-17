const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const dataDirectory = path.join(__dirname, 'data');
if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true });
}

const runtimeSecretsPath = process.env.RUNTIME_SECRETS_PATH
  ? path.resolve(process.env.RUNTIME_SECRETS_PATH)
  : path.join(dataDirectory, 'runtime-secrets.json');

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
};

const parseInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseCsv = (value) => {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const generateSecret = (size = 48) => crypto.randomBytes(size).toString('base64url');

const generatePassword = (size = 22) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  let password = '';
  while (password.length < size) {
    const index = crypto.randomInt(0, alphabet.length);
    password += alphabet[index];
  }
  return password;
};

const loadRuntimeSecrets = () => {
  if (!fs.existsSync(runtimeSecretsPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(runtimeSecretsPath, 'utf8'));
  } catch (error) {
    throw new Error(`无法读取运行时密钥文件: ${runtimeSecretsPath}`);
  }
};

const saveRuntimeSecrets = (secrets) => {
  fs.writeFileSync(runtimeSecretsPath, `${JSON.stringify(secrets, null, 2)}\n`, 'utf8');
};

const runtimeSecrets = loadRuntimeSecrets();
const startupNotices = [];

const ensureRuntimeValue = (key, envKey, generator) => {
  if (process.env[envKey]) {
    return process.env[envKey];
  }

  if (runtimeSecrets[key]) {
    return runtimeSecrets[key];
  }

  const value = generator();
  runtimeSecrets[key] = value;
  startupNotices.push(`${envKey} 未配置，已生成并持久化到 ${runtimeSecretsPath}`);
  return value;
};

const authTokenSecret = ensureRuntimeValue('authTokenSecret', 'AUTH_TOKEN_SECRET', () => generateSecret(48));
const bootstrapAdminUsername = process.env.DEFAULT_ADMIN_USERNAME || runtimeSecrets.bootstrapAdminUsername || 'admin';
const bootstrapAdminPassword = ensureRuntimeValue(
  'bootstrapAdminPassword',
  'DEFAULT_ADMIN_PASSWORD',
  () => generatePassword(24)
);
const mqttDeviceUsername = process.env.MQTT_DEVICE_USERNAME || runtimeSecrets.mqttDeviceUsername || 'device';
const mqttDevicePassword = ensureRuntimeValue(
  'mqttDevicePassword',
  'MQTT_DEVICE_PASSWORD',
  () => generatePassword(24)
);

runtimeSecrets.bootstrapAdminUsername = bootstrapAdminUsername;
runtimeSecrets.mqttDeviceUsername = mqttDeviceUsername;
saveRuntimeSecrets(runtimeSecrets);

const isProduction = process.env.NODE_ENV === 'production';
const defaultDevOrigins = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173'
];
const configuredCorsOrigins = parseCsv(process.env.CORS_ORIGINS);
const corsOrigins = configuredCorsOrigins.length > 0
  ? configuredCorsOrigins
  : (isProduction ? [] : defaultDevOrigins);

if (authTokenSecret.length < 32) {
  throw new Error('AUTH_TOKEN_SECRET 长度至少需要 32 个字符');
}

if (bootstrapAdminPassword.length < 12) {
  throw new Error('DEFAULT_ADMIN_PASSWORD 长度至少需要 12 个字符');
}

const config = {
  isProduction,
  dataDirectory,
  runtimeSecretsPath,
  startupNotices,
  http: {
    host: process.env.HTTP_HOST || '0.0.0.0',
    port: parseInteger(process.env.PORT, 3000),
    corsOrigins,
    bodyLimit: process.env.HTTP_BODY_LIMIT || '16kb',
    requestTimeoutMs: parseInteger(process.env.HTTP_REQUEST_TIMEOUT_MS, 30000),
    trustProxy: parseInteger(process.env.TRUST_PROXY, 0),
    apiRateLimit: {
      windowMs: parseInteger(process.env.API_RATE_WINDOW_MS, 60 * 1000),
      max: parseInteger(process.env.API_RATE_LIMIT, 180)
    },
    authRateLimit: {
      windowMs: parseInteger(process.env.AUTH_RATE_WINDOW_MS, 15 * 60 * 1000),
      max: parseInteger(process.env.AUTH_RATE_LIMIT, 10)
    }
  },
  auth: {
    tokenSecret: authTokenSecret,
    tokenTtlSeconds: parseInteger(process.env.AUTH_TOKEN_TTL_SECONDS, 8 * 60 * 60),
    allowRegistration: parseBoolean(process.env.ALLOW_REGISTRATION, false),
    bootstrapAdmin: {
      username: bootstrapAdminUsername,
      password: bootstrapAdminPassword
    }
  },
  mqtt: {
    host: process.env.MQTT_HOST || '0.0.0.0',
    port: parseInteger(process.env.MQTT_PORT, 1883),
    wsHost: process.env.MQTT_WS_HOST || '0.0.0.0',
    wsPort: parseInteger(process.env.MQTT_WS_PORT, 8888),
    allowAnonymous: parseBoolean(process.env.MQTT_ALLOW_ANONYMOUS, false),
    deviceUsername: mqttDeviceUsername,
    devicePassword: mqttDevicePassword,
    maxPayloadBytes: parseInteger(process.env.MQTT_MAX_PAYLOAD_BYTES, 8 * 1024)
  },
  websocket: {
    maxPayloadBytes: parseInteger(process.env.WS_MAX_PAYLOAD_BYTES, 8 * 1024),
    maxClients: parseInteger(process.env.WS_MAX_CLIENTS, 200)
  },
  simulator: {
    enabled: parseBoolean(process.env.ENABLE_SIMULATOR, !isProduction)
  }
};

if (isProduction && config.auth.allowRegistration) {
  startupNotices.push('生产环境中启用了开放注册，请确认这是预期行为');
}

if (isProduction && config.http.corsOrigins.length === 0) {
  startupNotices.push('生产环境未设置 CORS_ORIGINS，默认仅允许同源前端通过反向代理访问');
}

module.exports = config;
