const host = window.location.hostname || '127.0.0.1';
const isSecure = window.location.protocol === 'https:';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || `${isSecure ? 'https' : 'http'}://${host}:3000/api`;

export const WS_URL =
  import.meta.env.VITE_WS_URL || `${isSecure ? 'wss' : 'ws'}://${host}:3000`;

export const MQTT_WS_URL =
  import.meta.env.VITE_MQTT_WS_URL || `${isSecure ? 'wss' : 'ws'}://${host}:8888`;

export const METRICS_WINDOW_SIZE = 120;
export const EVENT_LOG_SIZE = 80;
