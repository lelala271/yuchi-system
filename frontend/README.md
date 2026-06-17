# 驭驰前端（React + Vite）

## 功能
- 登录鉴权（JWT）
- 数字孪生 3D 场景（Three.js）
- 网络指标实时图（ECharts）
- REST + WebSocket + MQTT 实时联动
- 车辆控制台与事件流

## 启动
```powershell
cd D:\yuchi-system\backend
npm start
```

```powershell
cd D:\yuchi-system\frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

访问：`http://127.0.0.1:5173`

## 初始管理员账号
首次启动后，请查看：

- 后端启动日志
- `D:\yuchi-system\backend\data\runtime-secrets.json`

其中会包含自动生成或配置好的管理员初始密码。

## 环境变量（可选）
前端（`.env`）
- `VITE_API_BASE_URL` 默认 `http://<host>:3000/api`
- `VITE_WS_URL` 默认 `ws://<host>:3000`
- `VITE_MQTT_WS_URL` 默认 `ws://<host>:8888`

后端（`.env`）
- `PORT` 默认 `3000`
- `MQTT_PORT` 默认 `1883`
- `MQTT_WS_PORT` 默认 `8888`
- `AUTH_TOKEN_SECRET` JWT 签名密钥
- `AUTH_TOKEN_TTL_SECONDS` token 过期秒数（默认 28800）
- `ALLOW_REGISTRATION` 是否允许注册（默认 `false`）
- `DEFAULT_ADMIN_USERNAME` 默认管理员用户名
- `DEFAULT_ADMIN_PASSWORD` 默认管理员密码
- `MQTT_DEVICE_USERNAME` MQTT 设备用户名
- `MQTT_DEVICE_PASSWORD` MQTT 设备密码
- `ENABLE_SIMULATOR` 是否启用模拟器
- `SQLITE_PATH` SQLite 数据库路径（默认 `backend/data/yuchi.db`）
