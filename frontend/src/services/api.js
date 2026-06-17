import axios from 'axios';
import { API_BASE_URL } from '../config';

export const AUTH_TOKEN_KEY = 'yuchi_auth_token';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000
});

const unwrap = (response) => response.data?.data ?? response.data;

export const getAuthToken = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const sessionToken = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (sessionToken) {
    return sessionToken;
  }

  const legacyToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (legacyToken) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.sessionStorage.setItem(AUTH_TOKEN_KEY, legacyToken);
    return legacyToken;
  }

  return null;
};

export const setAuthToken = (token) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } else {
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
};

client.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const api = {
  async register(username, password) {
    return unwrap(await client.post('/auth/register', { username, password }));
  },

  async login(username, password) {
    return unwrap(await client.post('/auth/login', { username, password }));
  },

  async getCurrentUser() {
    return unwrap(await client.get('/auth/me'));
  },

  async changePassword(currentPassword, newPassword) {
    return unwrap(await client.post('/auth/change-password', {
      currentPassword,
      newPassword
    }));
  },

  async getVehicles() {
    return unwrap(await client.get('/vehicles'));
  },

  async getLatestMetrics(vehicleId) {
    const params = vehicleId ? { vehicleId } : undefined;
    return unwrap(await client.get('/metrics/latest', { params }));
  },

  async getMetricsHistory(vehicleId, limit = 100) {
    const params = { limit };
    if (vehicleId) {
      params.vehicleId = vehicleId;
    }
    return unwrap(await client.get('/metrics/history', { params }));
  },

  async getMetricsSummary() {
    return unwrap(await client.get('/metrics/summary'));
  },

  async sendVehicleControl(vehicleId, payload) {
    return unwrap(await client.post(`/vehicles/${vehicleId}/control`, payload));
  },

  async updateVehicleStatus(vehicleId, payload) {
    return unwrap(await client.post(`/vehicles/${vehicleId}/status`, payload));
  },

  async getSystemConfig() {
    return unwrap(await client.get('/system/config'));
  }
};

export default api;
