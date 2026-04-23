# 局域网设备带宽监控项目 (Xiaomi Router MESH)

这是一份关于在 `/Users/virgil/Desktop/Test project/network-monitor` 目录下从零搭建基于 Grafana 的小米路由器设备网络监控系统的实施计划。

## 目标与架构说明

您的网络拓扑是 3 台小米 AX3000 组成的 Mesh 网络。在小米的 Mesh 网络中，主节点（网关，通常是 192.168.31.1）会汇总并管理整个局域网下的所有终端设备数据，包括它们的上下行速率、在线状态等。

因此，我们不需要在每台电脑上安装抓包软件，也不需要复杂的 ARP 欺骗，只需要通过一个特殊的**“数据拉取程序”**，定时登录并访问主路由器的管理后台 API 接口，把数据拽出来喂给监控系统即可。

**技术栈架构：**
1. **Mi-Router-Exporter (数据采集器)**：
   我们使用专门适配小米路由器的开源 Exporter。它会模拟您登录路由器后台的动作，抓取 `/api/misystem/devicelist` 接口的数据，将“每个设备的 MAC地址、当前上下行速度 (Bandwidth)、在线/离线状态”转换为标准的监控格式。
2. **Prometheus (时序数据库)**：
   负责每 10 秒向采集器拿一次数据，并将这些数据长期储存下来。
3. **Grafana (可视化看板)**：
   连接 Prometheus 读取数据，展示漂亮的折线图和统计表（如仪表盘、设备总数、各设备实时网速排行等）。

我们将在本地电脑上使用 **Docker Compose** 来一键拉起以上所有服务。如果您电脑上还没有安装 Docker Desktop，需要提前下载安装：[Docker 官网](https://www.docker.com/products/docker-desktop/)。

---

## 需用户确认的问题 (User Review Required)

> [!IMPORTANT]
> 1. 您在此电脑上是否已经安装了 **Docker**？（可以在终端执行 `docker -v` 查看）。如果没有，请先安装 Docker。
> 2. 我需要您的**主路由器后台管理员密码**。不用发给我，但我会在配置时预留一个 `<YOUR_ROUTER_PASSWORD>` 的占位符，执行完代码后，需要您自己去 `.env` 文件或配置文件里把它替换成真实密码。可以吗？
> 3. 您当前的 `192.168.31.1` 就是主路由器的管理地址对吧？

---

## 具体实施步骤与拟办事项

### 1. 创建项目结构
新建文件夹 `/Users/virgil/Desktop/Test project/network-monitor`（如果刚才没创建成功的话），并在内部搭建如下结构：
```text
network-monitor/
├── docker-compose.yml       # 一键启动三大组件的编排文件
├── prometheus/
│   └── prometheus.yml       # 配置 Prometheus 此处抓取 Exporter 数据
└── grafana/
    └── provisioning/        # 配置 Grafana 自动挂载 Prometheus 数据源的数据
```

### 2. 配置文件内容规划

#### [NEW] `docker-compose.yml`
定义三个容器：
- `prometheus`: 运行于 `9090` 端口
- `grafana`: 运行于 `3000` 端口
- `mi-router-exporter`: 使用开源镜像 `serge1peshcoff/mi-router-exporter` 运行于 `3030` 端口，通过传入环境变量配置路由器 IP `192.168.31.1` 和密码。

#### [NEW] `prometheus/prometheus.yml`
配置抓取任务 `job_name: 'mi-router'`，设定间隔 `scrape_interval: 10s`，并将目标指向 `exporter:3030`。

### 3. 一键启动服务
在终端执行：
```bash
cd "/Users/virgil/Documents/Test project/network-monitor"
docker-compose up -d
```
启动系统。

### 4. 导入/配置 Grafana 面板
1. 当服务启动后，指引您打开浏览器访问 `http://localhost:3000`。
2. 我们会在 Grafana 中新建一个 Dashboard，写入 PromQL 类似：
   - 设备总数监控图表: `count(mi_router_device_online{status="1"})`
   - 设备下行带宽: `mi_router_device_download_speed_bytes_per_second` (按设备名称通过 MAC 映射分组)
   - 设备上行带宽: `mi_router_device_upload_speed_bytes_per_second`
3. 最后帮您调整 UI，利用深色模式和动态渐变配色，并支持悬停交互，实现极佳的视觉效果！

---

## 验证测试计划

1. 使用 `docker ps` 确保三个容器正常运行且退出状态非报错。
2. 在浏览器打开 `http://localhost:3030/metrics`，确认采集器是否正常拿到了路由器的设备指标（确认身份验证没有问题）。
3. 如果拿到了指标，我们就进入 Grafana 开始配置酷炫的数据图表。
