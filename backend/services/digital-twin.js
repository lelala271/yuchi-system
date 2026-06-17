const store = require('../data-store');
const { publishTopic } = require('../mqtt-broker');

const createYoloDetections = () => ([
  { class: 'car', confidence: 0.95, bbox: [100, 200, 150, 180] },
  { class: 'traffic_light', confidence: 0.88, bbox: [300, 100, 80, 150] },
  { class: 'person', confidence: 0.76, bbox: [50, 300, 60, 180] }
]);

// 模拟车辆数据
const simulateVehicleData = () => {
  const vehicles = ['vehicle_001', 'vehicle_002'];
  const timestamp = new Date().toISOString();
  const snapshot = [];

  for (const vehicleId of vehicles) {
    // 获取或创建车辆
    let vehicle = store.getVehicle(vehicleId);

    // 模拟运动（编队行驶）
    const time = Date.now() / 1000;

    if (vehicleId === 'vehicle_001') {
      // 头车沿路径移动
      vehicle = store.updateVehicle(vehicleId, {
        positionX: 1.5 + Math.sin(time * 0.5) * 0.5,
        positionY: 2.0 + Math.cos(time * 0.3) * 0.3,
        speed: 0.3 + Math.sin(time) * 0.1,
        rotation: (Math.sin(time * 0.5) * 30) % 360,
        name: '头车',
        status: 'running',
        mode: 'auto'
      });
    } else {
      // 跟随车跟随头车（保持距离）
      const headVehicle = store.getVehicle('vehicle_001');
      if (headVehicle) {
        vehicle = store.updateVehicle(vehicleId, {
          positionX: headVehicle.positionX - 0.7,
          positionY: headVehicle.positionY - 0.5,
          speed: headVehicle.speed + 0.02,
          rotation: headVehicle.rotation,
          name: '跟随车',
          status: 'running',
          mode: 'platoon'
        });
      }
    }

    const metric = store.addNetworkMetric({
      vehicleId,
      latency: 10 + Math.random() * 15,
      packetLoss: Math.random() * 0.5,
      rsrp: -75 + Math.random() * 15,
      sinr: 15 + Math.random() * 10,
      throughput: 80 + Math.random() * 40
    });

    publishTopic(`yuchi/vehicle/${vehicleId}/status`, {
      ...vehicle,
      source: 'simulator',
      timestamp
    });

    publishTopic('yuchi/network/metrics', {
      ...metric,
      source: 'simulator',
      timestamp
    });

    if (global.wsBroadcast) {
      global.wsBroadcast({
        type: 'vehicle_update',
        vehicleId,
        data: vehicle,
        timestamp
      });

      global.wsBroadcast({
        type: 'network_metrics',
        data: metric,
        timestamp
      });
    }

    if (Math.random() > 0.7) {
      const detections = createYoloDetections();

      if (global.wsBroadcast) {
        global.wsBroadcast({
          type: 'yolo_detection',
          vehicleId,
          detections,
          timestamp
        });
      }

      publishTopic('yuchi/perception/yolo', {
        vehicleId,
        detections,
        source: 'simulator',
        timestamp
      });
    }

    snapshot.push(vehicle);
  }

  publishTopic('yuchi/twin/state', {
    vehicles: snapshot,
    source: 'simulator',
    timestamp
  });
};

// 启动数据模拟器
const startDataSimulator = () => {
  // 初始化车辆
  store.findOrCreateVehicle('vehicle_001', { name: '头车', positionX: 1.5, positionY: 2.0 });
  store.findOrCreateVehicle('vehicle_002', { name: '跟随车', positionX: 0.8, positionY: 1.5 });

  // 每200ms更新一次
  setInterval(simulateVehicleData, 200);
  console.log('数字孪生数据模拟器已启动');
};

module.exports = { startDataSimulator };
