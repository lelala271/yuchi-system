class ValidationError extends Error {}

const VEHICLE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;
const VEHICLE_STATUSES = new Set(['idle', 'running', 'charging', 'fault', 'offline']);
const VEHICLE_MODES = new Set(['manual', 'auto', 'platoon']);
const CONTROL_COMMANDS = new Set(['hold', 'start', 'stop', 'emergency_stop', 'lane_change']);

const ensureTrimmedString = (value, field) => {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} 必须是字符串`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new ValidationError(`${field} 不能为空`);
  }

  return normalized;
};

const validateVehicleId = (value, field = 'vehicleId') => {
  const vehicleId = ensureTrimmedString(value, field);
  if (!VEHICLE_ID_PATTERN.test(vehicleId)) {
    throw new ValidationError(`${field} 格式不合法`);
  }
  return vehicleId;
};

const validateUsername = (value) => {
  const username = ensureTrimmedString(value, '用户名');
  if (!USERNAME_PATTERN.test(username)) {
    throw new ValidationError('用户名格式不正确（3-32位，支持字母数字_.-）');
  }
  return username;
};

const validatePassword = (value, field = '密码') => {
  const password = ensureTrimmedString(value, field);
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  if (password.length < 12 || password.length > 128) {
    throw new ValidationError(`${field} 长度需要在 12-128 位之间`);
  }

  if (!hasLower || !hasUpper || !hasDigit || !hasSymbol) {
    throw new ValidationError(`${field} 需同时包含大小写字母、数字和特殊字符`);
  }

  return password;
};

const validateOptionalName = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const name = ensureTrimmedString(String(value), 'name');
  if (name.length > 64) {
    throw new ValidationError('name 长度不能超过 64 个字符');
  }
  return name;
};

const validateOptionalEnum = (value, allowedValues, field) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalized = String(value).trim();
  if (!allowedValues.has(normalized)) {
    throw new ValidationError(`${field} 取值不合法`);
  }
  return normalized;
};

const validateFiniteNumber = (value, {
  field,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  optional = false
}) => {
  if (value === undefined || value === null || value === '') {
    if (optional) {
      return undefined;
    }

    throw new ValidationError(`${field} 不能为空`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${field} 必须是有效数字`);
  }

  if (parsed < min || parsed > max) {
    throw new ValidationError(`${field} 超出允许范围`);
  }

  return parsed;
};

const validateLimit = (value, defaultValue, maxValue = 500) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new ValidationError('limit 必须是正整数');
  }

  return Math.min(parsed, maxValue);
};

const validateIsoTimestamp = (value, field) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${field} 不是合法时间`);
  }

  return date.toISOString();
};

const sanitizeVehicleStatusInput = (payload = {}) => {
  return {
    name: validateOptionalName(payload.name),
    positionX: validateFiniteNumber(payload.positionX, { field: 'positionX', min: -100000, max: 100000, optional: true }),
    positionY: validateFiniteNumber(payload.positionY, { field: 'positionY', min: -100000, max: 100000, optional: true }),
    positionZ: validateFiniteNumber(payload.positionZ, { field: 'positionZ', min: -100000, max: 100000, optional: true }),
    rotation: validateFiniteNumber(payload.rotation, { field: 'rotation', min: -3600, max: 3600, optional: true }),
    speed: validateFiniteNumber(payload.speed, { field: 'speed', min: 0, max: 100, optional: true }),
    battery: validateFiniteNumber(payload.battery, { field: 'battery', min: 0, max: 100, optional: true }),
    status: validateOptionalEnum(payload.status, VEHICLE_STATUSES, 'status'),
    mode: validateOptionalEnum(payload.mode, VEHICLE_MODES, 'mode')
  };
};

const sanitizeVehicleControlInput = (payload = {}) => {
  return {
    command: validateOptionalEnum(payload.command, CONTROL_COMMANDS, 'command') || 'hold',
    speed: validateFiniteNumber(payload.speed, { field: 'speed', min: 0, max: 100, optional: true }),
    steering: validateFiniteNumber(payload.steering, { field: 'steering', min: -90, max: 90, optional: true }),
    mode: validateOptionalEnum(payload.mode, VEHICLE_MODES, 'mode') || 'manual'
  };
};

const sanitizeMetricInput = (payload = {}) => {
  return {
    vehicleId: validateVehicleId(payload.vehicleId),
    latency: validateFiniteNumber(payload.latency, { field: 'latency', min: 0, max: 600000, optional: true }),
    packetLoss: validateFiniteNumber(payload.packetLoss, { field: 'packetLoss', min: 0, max: 100, optional: true }),
    rsrp: validateFiniteNumber(payload.rsrp, { field: 'rsrp', min: -200, max: 0, optional: true }),
    sinr: validateFiniteNumber(payload.sinr, { field: 'sinr', min: -50, max: 100, optional: true }),
    throughput: validateFiniteNumber(payload.throughput, { field: 'throughput', min: 0, max: 100000, optional: true })
  };
};

module.exports = {
  CONTROL_COMMANDS,
  ValidationError,
  VEHICLE_MODES,
  VEHICLE_STATUSES,
  sanitizeMetricInput,
  sanitizeVehicleControlInput,
  sanitizeVehicleStatusInput,
  validateFiniteNumber,
  validateIsoTimestamp,
  validateLimit,
  validateOptionalEnum,
  validatePassword,
  validateUsername,
  validateVehicleId
};
