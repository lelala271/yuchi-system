const express = require('express');
const router = express.Router();
const store = require('../data-store');
const { publishTopic } = require('../mqtt-broker');
const { sendUnexpectedError } = require('../http-utils');
const {
  ValidationError,
  sanitizeMetricInput,
  validateIsoTimestamp,
  validateLimit,
  validateVehicleId
} = require('../validation');

// 获取最新网络指标
router.get('/latest', (req, res) => {
  try {
    const vehicleId = req.query.vehicleId ? validateVehicleId(req.query.vehicleId) : undefined;
    const metrics = store.getLatestMetrics(vehicleId, vehicleId ? 1 : 10);
    res.json({ success: true, data: metrics });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return sendUnexpectedError(res, error, '读取最新指标失败');
  }
});

// 获取历史网络指标
router.get('/history', (req, res) => {
  try {
    const vehicleId = req.query.vehicleId ? validateVehicleId(req.query.vehicleId) : undefined;
    const startTime = validateIsoTimestamp(req.query.startTime, 'startTime');
    const endTime = validateIsoTimestamp(req.query.endTime, 'endTime');
    const limit = validateLimit(req.query.limit, 100, 500);
    const metrics = store.getMetricsHistory(vehicleId, startTime, endTime, limit);
    res.json({ success: true, data: metrics });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return sendUnexpectedError(res, error, '读取历史指标失败');
  }
});

// 获取指标摘要
router.get('/summary', (req, res) => {
  try {
    const allMetrics = store.getLatestMetrics(undefined, 500);
    const recent = allMetrics.slice(-100);

    if (recent.length === 0) {
      return res.json({
        success: true,
        data: {
          samples: 0,
          averageLatency: 0,
          averagePacketLoss: 0,
          averageThroughput: 0,
          averageRsrp: 0,
          averageSinr: 0
        }
      });
    }

    const totals = recent.reduce((acc, item) => {
      acc.latency += Number(item.latency) || 0;
      acc.packetLoss += Number(item.packetLoss) || 0;
      acc.throughput += Number(item.throughput) || 0;
      acc.rsrp += Number(item.rsrp) || 0;
      acc.sinr += Number(item.sinr) || 0;
      return acc;
    }, {
      latency: 0,
      packetLoss: 0,
      throughput: 0,
      rsrp: 0,
      sinr: 0
    });

    const count = recent.length;
    res.json({
      success: true,
      data: {
        samples: count,
        averageLatency: Number((totals.latency / count).toFixed(2)),
        averagePacketLoss: Number((totals.packetLoss / count).toFixed(3)),
        averageThroughput: Number((totals.throughput / count).toFixed(2)),
        averageRsrp: Number((totals.rsrp / count).toFixed(2)),
        averageSinr: Number((totals.sinr / count).toFixed(2))
      }
    });
  } catch (error) {
    return sendUnexpectedError(res, error, '读取指标摘要失败');
  }
});

// 上报网络指标
router.post('/report', (req, res) => {
  try {
    const payload = sanitizeMetricInput(req.body);
    const metric = store.addNetworkMetric({
      vehicleId: payload.vehicleId,
      latency: payload.latency ?? 0,
      packetLoss: payload.packetLoss ?? 0,
      rsrp: payload.rsrp ?? -85,
      sinr: payload.sinr ?? 20,
      throughput: payload.throughput ?? 0
    });

    const timestamp = new Date().toISOString();

    // 广播指标更新
    if (global.wsBroadcast) {
      global.wsBroadcast({
        type: 'network_metrics',
        data: metric,
        timestamp
      });
    }

    publishTopic('yuchi/network/metrics', {
      ...metric,
      source: 'api',
      timestamp
    });

    res.json({ success: true, data: metric });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return sendUnexpectedError(res, error, '上报网络指标失败');
  }
});

module.exports = router;
