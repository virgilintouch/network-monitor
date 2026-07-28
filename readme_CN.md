# 网络监控

[English README](README.md)

这是一个面向小米路由器的家庭网络监控栈。导出器调用路由器 API，Prometheus 存储采集到的指标，Grafana 用于展示仪表盘。

```text
小米路由器 -> mi-router-exporter -> Prometheus -> Grafana
```

## 第一部分：使用者指南

### 前置条件

- 已安装 Docker Engine 和 Docker Compose v2
- 运行本项目的主机与小米路由器处于同一局域网，并且能够访问路由器管理 API

### 配置

1. 创建本地环境变量文件。该文件已被 Git 忽略，不能提交其中的密码。

   ```bash
   cp .env.example .env
   ```

2. 在 `.env` 中填写路由器地址、路由器管理员密码，以及高强度 Grafana 密码：

   ```dotenv
   ROUTER_URL=192.168.31.1
   ROUTER_PASSWORD=your_router_password
   GRAFANA_ADMIN_USER=admin
   GRAFANA_ADMIN_PASSWORD=use_a_strong_unique_password
   ```

3. 可选配置：

   | 变量 | 默认值 | 用途 |
   | --- | --- | --- |
   | `LOGLEVEL` | `warn` | 导出器应用日志级别。 |
   | `GRAFANA_ANONYMOUS_ENABLED` | `false` | 是否允许未登录用户以 Viewer 身份访问 Grafana。除非明确需要公开访问，否则保持 `false`。 |
   | `ENABLE_DEBUG` | `false` | 仅在排障时启用导出器的 `/debug` 接口。 |
   | `CSV_LOG_DIR` | 导出器的 `logs` 目录 | 覆盖导出器事件日志目录。 |
   | `CSV_LOG_MAX_BYTES` | `5242880` | 事件日志达到该字节数时触发轮转。 |

### 启动与停止

构建导出器镜像并启动完整监控栈：

```bash
docker compose up -d --build
```

需要时查看服务状态和日志：

```bash
docker compose ps
docker compose logs -f mi-router-exporter
```

停止服务，但保留 Prometheus 和 Grafana 数据卷：

```bash
docker compose down
```

### 访问地址与安全

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| Grafana | <http://localhost:3344> | 默认需要登录，使用 `GRAFANA_ADMIN_USER` 和 `GRAFANA_ADMIN_PASSWORD`。 |
| Prometheus | <http://localhost:9090> | 用于查询表达式和查看抓取目标状态。 |
| 导出器指标 | <http://localhost:3030/metrics> | Prometheus 格式的指标接口。 |
| 导出器健康检查 | <http://localhost:3030/health> | 导出器进程运行时返回 HTTP 200。 |

所有公开端口默认绑定到 `127.0.0.1`，因此局域网中的其他设备无法直接访问。变更端口绑定或启用匿名 Grafana 访问前，应先评估相应的安全风险。

### 监控内容

导出器采集以下信息：

- 路由器 CPU、内存、温度、运行时间和已连接设备数量
- WAN 上下行速度、峰值速度与累计流量计数器
- 单设备的流量、速度、在线状态、MAC 地址、名称，以及路由器返回时的 IP 地址
- `mi_router_exporter_*` 前缀的导出器自身指标，包括登录成功/失败、路由器 API 错误、抓取错误、最近一次抓取耗时和最近成功抓取时间

`/debug` 默认不可访问，只有设置 `ENABLE_DEBUG=true` 后才会开放；排障完成后请重新关闭。

### 故障排查

- Grafana 没有数据时，打开 <http://localhost:9090/targets>，确认 `mi-router` 目标状态为 up。
- 导出器返回 HTTP 500 时，请检查 `ROUTER_URL` 和 `ROUTER_PASSWORD`，再查看 `docker compose logs mi-router-exporter`。
- 导出器最多重试三次路由器登录，并在令牌过期后刷新令牌。反复登录失败通常表示路由器不可达或凭据错误。
- 导出器事件日志保存在主机的 `./logs` 目录中，并在达到配置的最大大小时轮转。

## 第二部分：维护者指南

### 项目结构

- `docker-compose.yml` — Prometheus、Grafana 和导出器服务；包含固定镜像版本、健康检查、依赖顺序及仅本机端口绑定
- `.env.example` — 安全的配置模板；不得在其中保存真实密钥
- `mi-router-exporter/` — Node.js 导出器实现
  - `MiRouter.js` — 小米路由器认证、令牌生命周期、重试和 API 调用
  - `metrics.js` — Prometheus 文本指标渲染和标签转义
  - `selfmetrics.js` — 进程内的导出器计数器和抓取状态
  - `csvlogger.js` — 异步、尽力而为并按大小轮转的事件日志
  - `deviceId.js` — 本地持久化的稳定导出器设备标识
  - `test/` — 使用 Node 内置测试运行器的测试
- `prometheus/prometheus.yml` — Prometheus 抓取配置
- `grafana/` — 预置的数据源与仪表盘
- `docs/ops.md` — 运维说明；历史资料位于 `docs/archive/`

### 本地开发与验证

导出器需要受支持的 Node.js 运行时（容器镜像使用 Node.js 20）。在导出器目录中执行：

```bash
npm install
npm test
npm run lint
```

修改导出器代码或依赖后，重新构建并启动服务：

```bash
docker compose up -d --build
```

随后检查健康接口并查看生成的指标：

```bash
curl -fsS http://localhost:3030/health
curl -fsS http://localhost:3030/metrics | grep '^mi_router'
```

### 实现注意事项

- Docker 镜像只安装生产依赖，并以非特权 `exporter` 用户运行。
- 路由器令牌缓存 24 小时；状态请求失败时会清除令牌、重新认证，并重试完整的状态/设备列表流程。
- 在渲染 Prometheus 输出前会转义设备标签。新增标签或指标时必须保留此行为。
- `mi_router_wan_download` 和 `mi_router_wan_upload` 是 counter 类型；修改采集逻辑时必须保持其指标类型。
- 稳定设备 ID 和导出器日志存储在挂载的 `./logs` 目录中，因此容器重建后仍可保留。
- 日志必须保持尽力而为，绝不能导致指标请求失败；不要在请求路径中添加同步文件 I/O。
- `/debug` 必须继续由 `ENABLE_DEBUG=true` 控制，因为它可能暴露来源于路由器的设备详情。

### 运维类变更

修改服务暴露方式、认证默认值或健康检查时，应同步更新本文件、`README.md`，以及配置有变动时的 `.env.example`。除非项目明确采用不同的安全模型，否则应保持默认仅本机绑定，并禁用匿名访问。

## 许可证

ISC

## 设备自定义名称

打开本地管理页 <http://localhost:3030/aliases>，按 MAC 地址为设备设置自定义显示名。

- 别名保存在主机上的 `./data/device-aliases.json`（已挂载进 exporter 容器）。
- 只要保留 `./data` 挂载，执行 `docker compose up -d --build` 后自定义名仍会保留。
- Grafana 有别名时显示 `自定义名 (路由器原名)`；没有别名时显示路由器原名。
- 修改设备名会形成新的 Prometheus 时间序列，历史曲线在改名附近可能看起来不连续。

