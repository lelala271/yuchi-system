import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mqtt from 'mqtt';
import api from '../services/api';
import { EVENT_LOG_SIZE, METRICS_WINDOW_SIZE, MQTT_WS_URL, WS_URL } from '../config';

const MAX_METRIC_KEYS = 600;

const safeJsonParse = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
};

const getTopicVehicleId = (topic) => {
  const match = topic.match(/^yuchi\/vehicle\/([^/]+)\//);
  return match ? match[1] : null;
};

export const useRealtimeData = ({ token, user }) => {
  const authReady = Boolean(token && user?.username);
  const [vehiclesById, setVehiclesById] = useState({});
  const [metrics, setMetrics] = useState([]);
  const [events, setEvents] = useState([]);
  const [detections, setDetections] = useState([]);
  const [connections, setConnections] = useState({ ws: 'disconnected', mqtt: 'disconnected' });
  const [loading, setLoading] = useState(authReady);
  const [error, setError] = useState('');

  const metricKeyQueueRef = useRef([]);
  const metricKeySetRef = useRef(new Set());
  const wsRef = useRef(null);
  const mqttRef = useRef(null);

  const resetRealtimeState = useCallback(() => {
    setVehiclesById({});
    setMetrics([]);
    setEvents([]);
    setDetections([]);
    setConnections({ ws: 'disconnected', mqtt: 'disconnected' });
    setError('');
    setLoading(false);
    metricKeyQueueRef.current = [];
    metricKeySetRef.current = new Set();
  }, []);

  const pushEvent = useCallback((kind, message, payload = null) => {
    const nextEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind,
      message,
      payload,
      timestamp: new Date().toISOString()
    };

    setEvents((prev) => [nextEvent, ...prev].slice(0, EVENT_LOG_SIZE));
  }, []);

  const upsertVehicle = useCallback((rawVehicle, fallbackVehicleId) => {
    const vehicle = rawVehicle?.data && rawVehicle.data.vehicleId ? rawVehicle.data : rawVehicle;
    const vehicleId = vehicle?.vehicleId || rawVehicle?.vehicleId || fallbackVehicleId;

    if (!vehicleId) {
      return;
    }

    setVehiclesById((prev) => {
      const current = prev[vehicleId] || { vehicleId };
      return {
        ...prev,
        [vehicleId]: {
          ...current,
          ...vehicle,
          vehicleId
        }
      };
    });
  }, []);

  const pushMetric = useCallback((rawMetric) => {
    if (!rawMetric) {
      return;
    }

    const metric = rawMetric.data && rawMetric.data.vehicleId ? rawMetric.data : rawMetric;
    if (!metric.vehicleId) {
      return;
    }

    const timestamp = metric.timestamp || new Date().toISOString();
    const metricKey = `${metric.vehicleId}|${timestamp}|${Number(metric.latency || 0).toFixed(2)}|${Number(metric.throughput || 0).toFixed(2)}`;

    if (metricKeySetRef.current.has(metricKey)) {
      return;
    }

    metricKeySetRef.current.add(metricKey);
    metricKeyQueueRef.current.push(metricKey);

    if (metricKeyQueueRef.current.length > MAX_METRIC_KEYS) {
      const expired = metricKeyQueueRef.current.shift();
      if (expired) {
        metricKeySetRef.current.delete(expired);
      }
    }

    const normalized = {
      vehicleId: metric.vehicleId,
      latency: Number(metric.latency) || 0,
      packetLoss: Number(metric.packetLoss) || 0,
      throughput: Number(metric.throughput) || 0,
      rsrp: Number(metric.rsrp) || -85,
      sinr: Number(metric.sinr) || 20,
      timestamp
    };

    setMetrics((prev) => [...prev, normalized].slice(-METRICS_WINDOW_SIZE));
  }, []);

  const pushDetection = useCallback((payload, fallbackVehicleId) => {
    const data = payload?.data || payload;
    const vehicleId = data?.vehicleId || payload?.vehicleId || fallbackVehicleId || 'unknown';
    const items = data?.detections || payload?.detections || [];

    const detectionItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      vehicleId,
      detections: items,
      timestamp: payload?.timestamp || new Date().toISOString()
    };

    setDetections((prev) => [detectionItem, ...prev].slice(0, 24));
  }, []);

  const handleWsMessage = useCallback((message) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    switch (message.type) {
      case 'connection':
        pushEvent('ws', 'WebSocket connected');
        break;
      case 'vehicle_update':
        upsertVehicle(message.data || message, message.vehicleId);
        break;
      case 'network_metrics':
        pushMetric(message.data || message);
        break;
      case 'yolo_detection':
        pushDetection(message, message.vehicleId);
        pushEvent('perception', `YOLO detection from ${message.vehicleId || 'unknown'}`);
        break;
      case 'control_command':
        pushEvent('control', `Control command for ${message.vehicleId || 'unknown'}`, message.data || message);
        break;
      default:
        break;
    }
  }, [pushDetection, pushEvent, pushMetric, upsertVehicle]);

  const handleMqttMessage = useCallback((topic, messageText) => {
    const payload = safeJsonParse(messageText);
    const vehicleId = getTopicVehicleId(topic);

    if (topic.startsWith('yuchi/vehicle/') && topic.endsWith('/status')) {
      upsertVehicle(payload, vehicleId);
      return;
    }

    if (topic === 'yuchi/network/metrics') {
      pushMetric(payload);
      return;
    }

    if (topic === 'yuchi/perception/yolo') {
      pushDetection(payload, vehicleId);
      pushEvent('perception', `MQTT detection from ${vehicleId || 'unknown'}`);
      return;
    }

    if (topic.startsWith('yuchi/vehicle/') && topic.endsWith('/control')) {
      pushEvent('control', `MQTT control for ${vehicleId || 'unknown'}`, payload);
      return;
    }

    if (topic === 'yuchi/twin/state' && Array.isArray(payload.vehicles)) {
      payload.vehicles.forEach((vehicle) => upsertVehicle(vehicle));
    }
  }, [pushDetection, pushEvent, pushMetric, upsertVehicle]);

  const refreshInitialData = useCallback(async () => {
    if (!authReady) {
      resetRealtimeState();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [vehicles, latestMetrics] = await Promise.all([
        api.getVehicles(),
        api.getLatestMetrics()
      ]);

      setVehiclesById({});
      setMetrics([]);
      metricKeyQueueRef.current = [];
      metricKeySetRef.current = new Set();

      if (Array.isArray(vehicles)) {
        vehicles.forEach((vehicle) => upsertVehicle(vehicle));
      }

      if (Array.isArray(latestMetrics)) {
        latestMetrics.forEach((metric) => pushMetric(metric));
      }
    } catch (requestError) {
      const message = requestError?.response?.data?.error || requestError?.message || 'Failed to fetch initial data.';
      setError(message);
      pushEvent('error', `Initial request failed: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [authReady, pushEvent, pushMetric, resetRealtimeState, upsertVehicle]);

  useEffect(() => {
    refreshInitialData();
  }, [refreshInitialData]);

  useEffect(() => {
    if (!authReady) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnections((prev) => ({ ...prev, ws: 'disconnected' }));
      return undefined;
    }

    let isActive = true;
    const socket = new WebSocket(WS_URL, ['yuchi.v1', `auth.${token}`]);
    wsRef.current = socket;

    socket.onopen = () => {
      if (!isActive) {
        return;
      }
      setConnections((prev) => ({ ...prev, ws: 'connected' }));
    };

    socket.onclose = () => {
      if (!isActive) {
        return;
      }
      setConnections((prev) => ({ ...prev, ws: 'disconnected' }));
    };

    socket.onerror = () => {
      if (!isActive) {
        return;
      }
      setConnections((prev) => ({ ...prev, ws: 'error' }));
      pushEvent('error', 'WebSocket connection error');
    };

    socket.onmessage = (event) => {
      const message = safeJsonParse(event.data);
      handleWsMessage(message);
    };

    return () => {
      isActive = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [authReady, handleWsMessage, pushEvent, token]);

  useEffect(() => {
    if (!authReady) {
      if (mqttRef.current) {
        mqttRef.current.end(true);
        mqttRef.current = null;
      }
      setConnections((prev) => ({ ...prev, mqtt: 'disconnected' }));
      return undefined;
    }

    const client = mqtt.connect(MQTT_WS_URL, {
      connectTimeout: 8000,
      reconnectPeriod: 3000,
      clean: true,
      username: user?.username || '',
      password: token
    });

    mqttRef.current = client;

    client.on('connect', () => {
      setConnections((prev) => ({ ...prev, mqtt: 'connected' }));
      client.subscribe([
        'yuchi/vehicle/+/status',
        'yuchi/vehicle/+/control',
        'yuchi/network/metrics',
        'yuchi/perception/yolo',
        'yuchi/twin/state'
      ]);
      pushEvent('mqtt', 'MQTT connected');
    });

    client.on('reconnect', () => {
      setConnections((prev) => ({ ...prev, mqtt: 'reconnecting' }));
    });

    client.on('close', () => {
      setConnections((prev) => ({ ...prev, mqtt: 'disconnected' }));
    });

    client.on('error', (mqttError) => {
      setConnections((prev) => ({ ...prev, mqtt: 'error' }));
      pushEvent('error', `MQTT error: ${mqttError?.message || 'unknown error'}`);
    });

    client.on('message', (topic, payload) => {
      handleMqttMessage(topic, payload.toString());
    });

    return () => {
      if (mqttRef.current) {
        mqttRef.current.end(true);
        mqttRef.current = null;
      }
    };
  }, [authReady, handleMqttMessage, pushEvent, token, user?.username]);

  useEffect(() => {
    if (!authReady) {
      resetRealtimeState();
    }
  }, [authReady, resetRealtimeState]);

  const vehicles = useMemo(() => {
    return Object.values(vehiclesById).sort((a, b) => a.vehicleId.localeCompare(b.vehicleId));
  }, [vehiclesById]);

  const metricsSummary = useMemo(() => {
    if (metrics.length === 0) {
      return {
        averageLatency: 0,
        averagePacketLoss: 0,
        averageThroughput: 0,
        averageRsrp: 0,
        averageSinr: 0
      };
    }

    const totals = metrics.reduce((acc, item) => {
      acc.latency += item.latency;
      acc.packetLoss += item.packetLoss;
      acc.throughput += item.throughput;
      acc.rsrp += item.rsrp;
      acc.sinr += item.sinr;
      return acc;
    }, {
      latency: 0,
      packetLoss: 0,
      throughput: 0,
      rsrp: 0,
      sinr: 0
    });

    const count = metrics.length;
    return {
      averageLatency: Number((totals.latency / count).toFixed(2)),
      averagePacketLoss: Number((totals.packetLoss / count).toFixed(3)),
      averageThroughput: Number((totals.throughput / count).toFixed(2)),
      averageRsrp: Number((totals.rsrp / count).toFixed(2)),
      averageSinr: Number((totals.sinr / count).toFixed(2))
    };
  }, [metrics]);

  return {
    vehicles,
    metrics,
    events,
    detections,
    connections,
    loading,
    error,
    metricsSummary,
    refreshInitialData,
    pushEvent
  };
};

export default useRealtimeData;
