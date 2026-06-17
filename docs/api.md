# 接口与主题说明

本文档解决的问题是：前端、后端和设备之间到底有哪些 HTTP 接口、WebSocket 事件和 MQTT 主题，应该怎么分工使用。

一句话结论：`yuchi-system` 的接口分成三类，浏览器初始化和操作走 HTTP，浏览器增量更新走 WebSocket，设备和平台状态总线走 MQTT。

## 1. HTTP API 总表

| 类别 | 方法 | 路径 | 作用 | 是否需要登录 |
| --- | --- | --- | --- | --- |
| 健康检查 | `GET` | `/api/health` | 查看服务是否存活 | 否 |
| 登录 | `POST` | `/api/auth/login` | 登录获取 token | 否 |
| 注册 | `POST` | `/api/auth/register` | 创建用户 | 否，但默认可能被后端禁用 |
| 当前用户 | `GET` | `/api/auth/me` | 获取当前登录用户 | 是 |
| 修改密码 | `POST` | `/api/auth/change-password` | 修改当前账号密码 | 是 |
| 车辆列表 | `GET` | `/api/vehicles` | 获取所有车辆 | 是 |
| 单车信息 | `GET` | `/api/vehicles/:vehicleId` | 获取单辆车状态 | 是 |
| 更新车辆状态 | `POST` | `/api/vehicles/:vehicleId/status` | 写入车辆状态 | 是 |
| 下发控制命令 | `POST` | `/api/vehicles/:vehicleId/control` | 向车辆发送控制 | 是 |
| 轨迹历史 | `GET` | `/api/vehicles/:vehicleId/trajectory` | 获取车辆轨迹 | 是 |
| 最新指标 | `GET` | `/api/metrics/latest` | 获取最新网络指标 | 是 |
| 历史指标 | `GET` | `/api/metrics/history` | 获取历史网络指标 | 是 |
| 指标摘要 | `GET` | `/api/metrics/summary` | 获取统计摘要 | 是 |
| 上报指标 | `POST` | `/api/metrics/report` | 提交网络指标 | 是 |
| 系统配置 | `GET` | `/api/system/config` | 返回前端可用实时地址和模式信息 | 是 |

## 2. 认证接口

### 2.1 登录

```http
POST /api/auth/login
Content-Type: application/json
```

请求体：

```json
{
  "username": "admin",
  "password": "YourStrongPassword!123"
}
```

返回重点：

- `user`
- `token`

### 2.2 修改密码

```http
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json
```

请求体：

```json
{
  "currentPassword": "OldPassword!123",
  "newPassword": "NewPassword!123"
}
```

## 3. 车辆接口

### 3.1 更新车辆状态

```http
POST /api/vehicles/:vehicleId/status
Authorization: Bearer <token>
Content-Type: application/json
```

可用字段示例：

```json
{
  "name": "头车",
  "positionX": 1.5,
  "positionY": 2.0,
  "positionZ": 0,
  "rotation": 15,
  "speed": 0.4,
  "battery": 96,
  "status": "running",
  "mode": "auto"
}
```

### 3.2 下发控制命令

```http
POST /api/vehicles/:vehicleId/control
Authorization: Bearer <token>
Content-Type: application/json
```

请求体示例：

```json
{
  "command": "start",
  "speed": 0.5,
  "steering": 0,
  "mode": "auto"
}
```

支持的 `command`：

- `hold`
- `start`
- `stop`
- `emergency_stop`
- `lane_change`

## 4. 指标接口

### 4.1 上报网络指标

```http
POST /api/metrics/report
Authorization: Bearer <token>
Content-Type: application/json
```

请求体示例：

```json
{
  "vehicleId": "vehicle_001",
  "latency": 18.2,
  "packetLoss": 0.2,
  "rsrp": -79,
  "sinr": 18,
  "throughput": 96
}
```

## 5. WebSocket 用法

连接地址默认是：

- `ws://<host>:3000`
- 如果启用 HTTPS，对应 `wss://`

建议用子协议：

- 业务协议：`yuchi.v1`
- 鉴权协议：`auth.<token>`

示例：

```javascript
const ws = new WebSocket("ws://127.0.0.1:3000", ["yuchi.v1", `auth.${token}`]);
```

## 6. WebSocket 事件分类

| 事件类型 | 说明 |
| --- | --- |
| `connection` | 连接建立成功 |
| `vehicle_update` | 车辆状态更新 |
| `network_metrics` | 网络指标更新 |
| `yolo_detection` | 感知检测结果 |
| `control_command` | 控制命令事件 |
| `mqtt_message` | MQTT 消息转发观察事件 |
| `twin_snapshot` | 数字孪生快照 |

## 7. MQTT 主题分类

| 主题 | 用途 | 典型发布方 |
| --- | --- | --- |
| `yuchi/vehicle/{vehicleId}/status` | 车辆状态上报 | 设备或模拟器 |
| `yuchi/vehicle/{vehicleId}/control` | 控制命令下发 | 后端 |
| `yuchi/network/metrics` | 网络指标上报 | 设备、模拟器或 API |
| `yuchi/perception/yolo` | 目标检测结果 | 设备或模拟器 |
| `yuchi/perception/lane` | 车道感知结果 | 设备 |
| `yuchi/v2x/bsm` | 车路协同基础安全消息 | 设备 |
| `yuchi/v2x/spat` | 信号相位与配时消息 | 设备 |
| `yuchi/twin/state` | 数字孪生状态快照 | 模拟器 |

## 8. 页面 MQTT 连接方式

页面使用：

- `username = 当前登录用户名`
- `password = JWT token`

页面可订阅主题包括：

- `yuchi/vehicle/+/status`
- `yuchi/vehicle/+/control`
- `yuchi/network/metrics`
- `yuchi/perception/yolo`
- `yuchi/twin/state`

页面不能发布 MQTT 消息。

## 9. 设备 MQTT 连接方式

设备使用：

- `username = MQTT_DEVICE_USERNAME`
- `password = MQTT_DEVICE_PASSWORD`

设备可发布受白名单约束的状态和感知主题，可订阅控制主题。

## 10. 参数校验规则摘要

| 字段 | 规则 |
| --- | --- |
| `vehicleId` | `1-64` 位，只允许字母、数字、下划线、中划线 |
| 用户名 | `3-32` 位，允许字母、数字、`_.-` |
| 密码 | `12-128` 位，必须包含大小写、数字、特殊字符 |
| `speed` | `0-100` |
| `steering` | `-90` 到 `90` |
| `battery` | `0-100` |
| `status` | `idle`、`running`、`charging`、`fault`、`offline` |
| `mode` | `manual`、`auto`、`platoon` |

## 11. 最终记忆表

| 你要做的事 | 应该用什么 |
| --- | --- |
| 登录、查列表、改密码 | HTTP |
| 页面实时更新 | WebSocket |
| 设备上报状态 | MQTT |
| 页面订阅设备消息 | MQTT over WebSocket |
| 给设备发控制 | HTTP 触发，后端转 MQTT |
