# 部署说明

本文档解决的问题是：怎样把 `yuchi-system` 从本地可跑状态，整理成可交付、可复现、可上线的部署流程。

一句话结论：部署顺序必须是“先后端、再密钥、再前端、再反向代理、最后联调实时链路”，顺序错了会让问题看起来像到处都坏了。

## 1. 部署前准备

| 项目 | 要求 |
| --- | --- |
| Node.js | 建议使用支持 `node:sqlite` 的较新版本 |
| npm | 可正常安装前后端依赖 |
| 网络 | 前端能访问后端 HTTP、WebSocket 和 MQTT WebSocket |
| 端口 | 默认 `3000`、`1883`、`8888` |
| 敏感文件保护 | `backend/data/runtime-secrets.json` 不可公开 |

## 2. 本地联调顺序

1. 安装后端依赖。
2. 启动后端并等待生成运行时密钥文件。
3. 记录初始管理员账号和密码。
4. 安装前端依赖。
5. 启动前端。
6. 登录并检查 HTTP、WebSocket、MQTT 三条链路是否全部连通。
7. 确认模拟器是否按预期开启。
8. 验证车辆列表、图表和事件流是否更新。
9. 发送一条控制命令，确认控制闭环。

## 3. 安装命令

### 3.1 后端

```powershell
cd backend
npm install
```

### 3.2 前端

```powershell
cd frontend
npm install
```

## 4. 启动命令

### 4.1 启动后端

```powershell
cd backend
npm start
```

### 4.2 启动前端开发模式

```powershell
cd frontend
npm run dev
```

默认本地地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:3000`
- MQTT TCP：`1883`
- MQTT WebSocket：`8888`

## 5. 首次启动会生成什么

首次启动后端后，会自动生成：

- `backend/data/runtime-secrets.json`
- `backend/data/yuchi.db`

`runtime-secrets.json` 里通常会包含：

- `bootstrapAdminUsername`
- `bootstrapAdminPassword`
- `authTokenSecret`
- `mqttDeviceUsername`
- `mqttDevicePassword`

这份文件必须当作敏感信息管理。

## 6. 生产环境配置

### 6.1 后端 `.env`

建议以 `backend/.env.example` 为模板：

```env
NODE_ENV=production
HTTP_HOST=0.0.0.0
PORT=3000
TRUST_PROXY=1
CORS_ORIGINS=https://your-frontend.example.com

AUTH_TOKEN_SECRET=replace-with-a-32-plus-char-random-secret
AUTH_TOKEN_TTL_SECONDS=28800
ALLOW_REGISTRATION=false
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=ReplaceWithAStrongPassword!123

MQTT_HOST=0.0.0.0
MQTT_PORT=1883
MQTT_WS_HOST=0.0.0.0
MQTT_WS_PORT=8888
MQTT_DEVICE_USERNAME=device
MQTT_DEVICE_PASSWORD=ReplaceWithAStrongPassword!123

ENABLE_SIMULATOR=false
```

### 6.2 前端 `.env`

当前后端与前端不是同源部署时：

```env
VITE_API_BASE_URL=https://your-api.example.com/api
VITE_WS_URL=wss://your-api.example.com
VITE_MQTT_WS_URL=wss://your-api.example.com:8888
```

## 7. 关键配置项解释

| 配置项 | 作用 | 建议 |
| --- | --- | --- |
| `NODE_ENV` | 切换开发和生产行为 | 生产必须设为 `production` |
| `CORS_ORIGINS` | 允许跨域的前端域名 | 跨域部署时必须显式配置 |
| `AUTH_TOKEN_SECRET` | JWT 签名密钥 | 生产环境手工设置 |
| `ALLOW_REGISTRATION` | 是否允许公开注册 | 内部系统建议关闭 |
| `MQTT_DEVICE_USERNAME` | 设备身份用户名 | 不要和页面账号混用 |
| `MQTT_DEVICE_PASSWORD` | 设备身份密码 | 使用强口令 |
| `ENABLE_SIMULATOR` | 是否启用模拟器 | 生产环境一般关闭 |
| `TRUST_PROXY` | 代理后真实来源识别 | 反向代理场景开启 |

## 8. 前端生产构建

```powershell
cd frontend
npm run build
```

构建产物目录：

- `frontend/dist`

## 9. 反向代理部署要点

如果使用 Nginx 或其他网关，请确保：

1. 前端静态资源能正常返回。
2. `/api` 能转发到后端 HTTP 服务。
3. WebSocket 升级头能正确转发。
4. MQTT WebSocket 端口能被浏览器访问。
5. `X-Forwarded-Proto` 和 `X-Forwarded-Host` 能正确传给后端。

## 10. 上线检查流程

1. 检查 `.env` 是否为生产值。
2. 检查 `runtime-secrets.json` 权限是否收紧。
3. 检查 `ENABLE_SIMULATOR=false`。
4. 检查管理员初始密码是否已更换。
5. 检查浏览器能否成功调用 `/api/health`。
6. 检查登录后 WebSocket 是否已连接。
7. 检查 MQTT WebSocket 是否已连接。
8. 检查设备是否能订阅控制主题。
9. 检查跨域策略是否符合预期。

## 11. 验收标准

| 验收项 | 通过标准 |
| --- | --- |
| 后端启动 | 无异常退出，健康检查正常 |
| 前端访问 | 页面可打开并成功登录 |
| WebSocket | 登录后可稳定接收实时事件 |
| MQTT 页面连接 | 页面能订阅状态和指标主题 |
| 设备接入 | 设备可用专用身份连接并收发主题 |
| 控制闭环 | 页面下发命令后设备和页面都能看到结果 |
| 安全配置 | 无默认弱口令、无开放匿名接入 |

## 12. 最后记忆表

| 问题 | 结论 |
| --- | --- |
| 先启动谁 | 先后端，后前端 |
| 首次最重要看什么 | `runtime-secrets.json` |
| 生产最容易漏什么 | `CORS_ORIGINS`、`AUTH_TOKEN_SECRET`、关闭模拟器 |
| 反代最容易错什么 | WebSocket 升级和真实 Host/Proto 转发 |
