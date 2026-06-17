const express = require('express');
const router = express.Router();
const store = require('../data-store');
const { publishTopic } = require('../mqtt-broker');
const { sendUnexpectedError } = require('../http-utils');
const {
  ValidationError,
  sanitizeVehicleControlInput,
  sanitizeVehicleStatusInput,
  validateLimit,
  validateVehicleId
} = require('../validation');

// 获取所有车辆
router.get('/', (req, res) => {
  try {
    const vehicles = store.getAllVehicles();
    res.json({ success: true, data: vehicles });
  } catch (error) {
    return sendUnexpectedError(res, error, '读取车辆列表失败');
  }
});

// 获取单个车辆
router.get('/:vehicleId', (req, res) => {
  try {
    const vehicleId = validateVehicleId(req.params.vehicleId);
    const vehicle = store.getVehicle(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: '车辆不存在' });
    }
    res.json({ success: true, data: vehicle });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return sendUnexpectedError(res, error, '读取车辆失败');
  }
});

// 更新车辆状态
router.post('/:vehicleId/status', (req, res) => {
  try {
    const vehicleId = validateVehicleId(req.params.vehicleId);
    const updatePatch = sanitizeVehicleStatusInput(req.body);
    const vehicle = store.updateVehicle(vehicleId, updatePatch);

    const timestamp = new Date().toISOString();
    const statusPayload = {
      ...vehicle,
      source: 'api',
      timestamp
    };
    
    // 广播状态更新
    if (global.wsBroadcast) {
      global.wsBroadcast({
        type: 'vehicle_update',
        vehicleId,
        data: vehicle,
        timestamp
      });
    }

    publishTopic(`yuchi/vehicle/${vehicleId}/status`, statusPayload);

    res.json({ success: true, data: vehicle });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return sendUnexpectedError(res, error, '更新车辆状态失败');
  }
});

// 发送控制指令
router.post('/:vehicleId/control', (req, res) => {
  try {
    const vehicleId = validateVehicleId(req.params.vehicleId);
    const control = sanitizeVehicleControlInput(req.body);
    const speedValue = control.speed;
    const steeringValue = control.steering;
    const timestamp = new Date().toISOString();

    const controlPayload = {
      vehicleId,
      command: control.command,
      speed: speedValue,
      steering: steeringValue,
      mode: control.mode,
      timestamp,
      source: 'api'
    };

    const updatePatch = {};
    if (speedValue !== undefined) {
      updatePatch.speed = speedValue;
    }
    if (control.mode) {
      updatePatch.mode = control.mode;
    }
    if (control.command === 'stop' || control.command === 'emergency_stop') {
      updatePatch.speed = 0;
      updatePatch.status = 'idle';
    } else if (control.command === 'start') {
      updatePatch.status = 'running';
    }

    let updatedVehicle = null;
    if (Object.keys(updatePatch).length > 0) {
      updatedVehicle = store.updateVehicle(vehicleId, updatePatch);
    }

    publishTopic(`yuchi/vehicle/${vehicleId}/control`, controlPayload);

    if (global.wsBroadcast) {
      global.wsBroadcast({
        type: 'control_command',
        vehicleId,
        data: controlPayload,
        timestamp
      });

      if (updatedVehicle) {
        global.wsBroadcast({
          type: 'vehicle_update',
          vehicleId,
          data: updatedVehicle,
          timestamp
        });
      }
    }
    
    res.json({
      success: true,
      message: '控制指令已发送',
      command: controlPayload
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return sendUnexpectedError(res, error, '发送控制命令失败');
  }
});

// 获取车辆历史轨迹
router.get('/:vehicleId/trajectory', (req, res) => {
  try {
    const vehicleId = validateVehicleId(req.params.vehicleId);
    const limit = validateLimit(req.query.limit, 120, 500);
    const points = store.getVehicleTrajectory(vehicleId, limit);
    res.json({ success: true, data: points });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return sendUnexpectedError(res, error, '读取轨迹失败');
  }
});

module.exports = router;
