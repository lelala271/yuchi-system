const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const dataDirectory = config.dataDirectory || path.join(__dirname, 'data');
if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true });
}

const dbFilePath = process.env.SQLITE_PATH || path.join(dataDirectory, 'yuchi.db');
const db = new DatabaseSync(dbFilePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    position_x REAL NOT NULL DEFAULT 0,
    position_y REAL NOT NULL DEFAULT 0,
    position_z REAL NOT NULL DEFAULT 0,
    rotation REAL NOT NULL DEFAULT 0,
    speed REAL NOT NULL DEFAULT 0,
    battery REAL NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'idle',
    mode TEXT NOT NULL DEFAULT 'manual',
    last_update TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vehicle_trajectory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id TEXT NOT NULL,
    time TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    z REAL NOT NULL,
    speed REAL NOT NULL,
    rotation REAL NOT NULL,
    FOREIGN KEY(vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_trajectory_vehicle_time
    ON vehicle_trajectory(vehicle_id, time);

  CREATE TABLE IF NOT EXISTS network_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    latency REAL NOT NULL DEFAULT 0,
    packet_loss REAL NOT NULL DEFAULT 0,
    rsrp REAL NOT NULL DEFAULT -85,
    sinr REAL NOT NULL DEFAULT 20,
    throughput REAL NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_vehicle_time
    ON network_metrics(vehicle_id, timestamp);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

module.exports = { db, dbFilePath };
