const { db } = require('./database');

const MAX_TRAJECTORY_PER_VEHICLE = 300;
const MAX_METRICS_TOTAL = 1000;
const MAX_QUERY_LIMIT = 500;

const toFiniteNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoundedLimit = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(Number(parsed), MAX_QUERY_LIMIT));
};

const toIsoIfValid = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const mapVehicleRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    vehicleId: row.vehicle_id,
    name: row.name,
    positionX: toFiniteNumber(row.position_x, 0),
    positionY: toFiniteNumber(row.position_y, 0),
    positionZ: toFiniteNumber(row.position_z, 0),
    rotation: toFiniteNumber(row.rotation, 0),
    speed: toFiniteNumber(row.speed, 0),
    battery: toFiniteNumber(row.battery, 100),
    status: row.status,
    mode: row.mode,
    lastUpdate: row.last_update
  };
};

const mapMetricRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    vehicleId: row.vehicle_id,
    timestamp: row.timestamp,
    latency: toFiniteNumber(row.latency, 0),
    packetLoss: toFiniteNumber(row.packet_loss, 0),
    rsrp: toFiniteNumber(row.rsrp, -85),
    sinr: toFiniteNumber(row.sinr, 20),
    throughput: toFiniteNumber(row.throughput, 0)
  };
};

const mapTrajectoryRow = (row) => ({
  time: row.time,
  x: toFiniteNumber(row.x, 0),
  y: toFiniteNumber(row.y, 0),
  z: toFiniteNumber(row.z, 0),
  speed: toFiniteNumber(row.speed, 0),
  rotation: toFiniteNumber(row.rotation, 0)
});

const getVehicleStmt = db.prepare(`
  SELECT vehicle_id, name, position_x, position_y, position_z, rotation, speed, battery, status, mode, last_update
  FROM vehicles
  WHERE vehicle_id = ?
`);

const getAllVehiclesStmt = db.prepare(`
  SELECT vehicle_id, name, position_x, position_y, position_z, rotation, speed, battery, status, mode, last_update
  FROM vehicles
  ORDER BY vehicle_id
`);

const upsertVehicleStmt = db.prepare(`
  INSERT INTO vehicles (
    vehicle_id,
    name,
    position_x,
    position_y,
    position_z,
    rotation,
    speed,
    battery,
    status,
    mode,
    last_update
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(vehicle_id) DO UPDATE SET
    name = excluded.name,
    position_x = excluded.position_x,
    position_y = excluded.position_y,
    position_z = excluded.position_z,
    rotation = excluded.rotation,
    speed = excluded.speed,
    battery = excluded.battery,
    status = excluded.status,
    mode = excluded.mode,
    last_update = excluded.last_update
`);

const insertTrajectoryStmt = db.prepare(`
  INSERT INTO vehicle_trajectory (vehicle_id, time, x, y, z, speed, rotation)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const pruneTrajectoryStmt = db.prepare(`
  DELETE FROM vehicle_trajectory
  WHERE id IN (
    SELECT id
    FROM vehicle_trajectory
    WHERE vehicle_id = ?
    ORDER BY id DESC
    LIMIT -1 OFFSET ?
  )
`);

const getTrajectoryStmt = db.prepare(`
  SELECT time, x, y, z, speed, rotation
  FROM vehicle_trajectory
  WHERE vehicle_id = ?
  ORDER BY id DESC
  LIMIT ?
`);

const insertMetricStmt = db.prepare(`
  INSERT INTO network_metrics (
    vehicle_id,
    timestamp,
    latency,
    packet_loss,
    rsrp,
    sinr,
    throughput
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const getMetricByIdStmt = db.prepare(`
  SELECT id, vehicle_id, timestamp, latency, packet_loss, rsrp, sinr, throughput
  FROM network_metrics
  WHERE id = ?
`);

const pruneMetricsStmt = db.prepare(`
  DELETE FROM network_metrics
  WHERE id IN (
    SELECT id
    FROM network_metrics
    ORDER BY id DESC
    LIMIT -1 OFFSET ?
  )
`);

class DataStore {
  findOrCreateVehicle(vehicleId, defaultData = {}) {
    const existing = this.getVehicle(vehicleId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const seed = {
      vehicleId,
      name: `车辆-${vehicleId}`,
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      rotation: 0,
      speed: 0,
      battery: 100,
      status: 'idle',
      mode: 'manual',
      lastUpdate: now,
      ...defaultData
    };

    this.#saveVehicle(seed, false);
    return this.getVehicle(vehicleId);
  }

  updateVehicle(vehicleId, data) {
    const current = this.findOrCreateVehicle(vehicleId);
    const now = new Date().toISOString();
    const patch = Object.fromEntries(
      Object.entries(data || {}).filter(([, value]) => value !== undefined)
    );
    const next = {
      ...current,
      ...patch,
      vehicleId,
      lastUpdate: now
    };

    this.#saveVehicle(next, true);
    return this.getVehicle(vehicleId);
  }

  getAllVehicles() {
    return getAllVehiclesStmt.all().map(mapVehicleRow);
  }

  getVehicle(vehicleId) {
    return mapVehicleRow(getVehicleStmt.get(vehicleId));
  }

  getVehicleTrajectory(vehicleId, limit = 120) {
    const count = toBoundedLimit(limit, 120);
    const rows = getTrajectoryStmt.all(vehicleId, count);
    return rows.reverse().map(mapTrajectoryRow);
  }

  addNetworkMetric(metric) {
    const timestamp = metric.timestamp || new Date().toISOString();
    const inserted = insertMetricStmt.run(
      metric.vehicleId || 'unknown',
      timestamp,
      toFiniteNumber(metric.latency, 0),
      toFiniteNumber(metric.packetLoss, 0),
      toFiniteNumber(metric.rsrp, -85),
      toFiniteNumber(metric.sinr, 20),
      toFiniteNumber(metric.throughput, 0)
    );

    pruneMetricsStmt.run(MAX_METRICS_TOTAL);
    return mapMetricRow(getMetricByIdStmt.get(Number(inserted.lastInsertRowid)));
  }

  getLatestMetrics(vehicleId, limit = 10) {
    const count = toBoundedLimit(limit, 10);

    let rows;
    if (vehicleId) {
      rows = db.prepare(`
        SELECT id, vehicle_id, timestamp, latency, packet_loss, rsrp, sinr, throughput
        FROM network_metrics
        WHERE vehicle_id = ?
        ORDER BY id DESC
        LIMIT ?
      `).all(vehicleId, count);
    } else {
      rows = db.prepare(`
        SELECT id, vehicle_id, timestamp, latency, packet_loss, rsrp, sinr, throughput
        FROM network_metrics
        ORDER BY id DESC
        LIMIT ?
      `).all(count);
    }

    return rows.reverse().map(mapMetricRow);
  }

  getMetricsHistory(vehicleId, startTime, endTime, limit = 100) {
    const count = toBoundedLimit(limit, 100);

    const whereParts = [];
    const values = [];

    if (vehicleId) {
      whereParts.push('vehicle_id = ?');
      values.push(vehicleId);
    }

    if (startTime) {
      const startIso = toIsoIfValid(startTime);
      if (startIso) {
        whereParts.push('timestamp >= ?');
        values.push(startIso);
      }
    }

    if (endTime) {
      const endIso = toIsoIfValid(endTime);
      if (endIso) {
        whereParts.push('timestamp <= ?');
        values.push(endIso);
      }
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const stmt = db.prepare(`
      SELECT id, vehicle_id, timestamp, latency, packet_loss, rsrp, sinr, throughput
      FROM network_metrics
      ${whereSql}
      ORDER BY id DESC
      LIMIT ?
    `);

    const rows = stmt.all(...values, count);
    return rows.reverse().map(mapMetricRow);
  }

  #saveVehicle(vehicle, appendTrajectory = true) {
    const safeVehicle = {
      vehicleId: vehicle.vehicleId,
      name: vehicle.name || `车辆-${vehicle.vehicleId}`,
      positionX: toFiniteNumber(vehicle.positionX, 0),
      positionY: toFiniteNumber(vehicle.positionY, 0),
      positionZ: toFiniteNumber(vehicle.positionZ, 0),
      rotation: toFiniteNumber(vehicle.rotation, 0),
      speed: toFiniteNumber(vehicle.speed, 0),
      battery: toFiniteNumber(vehicle.battery, 100),
      status: vehicle.status || 'idle',
      mode: vehicle.mode || 'manual',
      lastUpdate: vehicle.lastUpdate || new Date().toISOString()
    };

    upsertVehicleStmt.run(
      safeVehicle.vehicleId,
      safeVehicle.name,
      safeVehicle.positionX,
      safeVehicle.positionY,
      safeVehicle.positionZ,
      safeVehicle.rotation,
      safeVehicle.speed,
      safeVehicle.battery,
      safeVehicle.status,
      safeVehicle.mode,
      safeVehicle.lastUpdate
    );

    if (appendTrajectory) {
      insertTrajectoryStmt.run(
        safeVehicle.vehicleId,
        safeVehicle.lastUpdate,
        safeVehicle.positionX,
        safeVehicle.positionY,
        safeVehicle.positionZ,
        safeVehicle.speed,
        safeVehicle.rotation
      );
      pruneTrajectoryStmt.run(safeVehicle.vehicleId, MAX_TRAJECTORY_PER_VEHICLE);
    }
  }
}

module.exports = new DataStore();
