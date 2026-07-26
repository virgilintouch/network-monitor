# Network Monitor

Home network monitoring stack for Xiaomi routers, using Prometheus + Grafana.

## Architecture

```
Xiaomi Router -> mi-router-exporter -> Prometheus -> Grafana
```

## Components

- **mi-router-exporter**: Custom exporter that queries Xiaomi router API and exposes Prometheus metrics
- **Prometheus**: Time-series database for storing metrics
- **Grafana**: Visualization dashboard for metrics

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Access to Xiaomi router API (same LAN network)

### Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your router credentials:
   ```bash
   ROUTER_URL=192.168.31.1
   ROUTER_PASSWORD=your_password_here
   ```

3. (Optional) Configure Grafana admin credentials and access defaults:
   ```bash
   GRAFANA_ADMIN_USER=admin
   GRAFANA_ADMIN_PASSWORD=your_strong_password
   GRAFANA_ANONYMOUS_ENABLED=false
   ENABLE_DEBUG=false
   ```

### Running

```bash
docker compose up -d --build
```

### Access Points

- **Grafana**: http://localhost:3344 (login required by default; anonymous access is off)
- **Prometheus**: http://localhost:9090
- **Exporter**: http://localhost:3030/metrics
- **Health**: http://localhost:3030/health

Grafana and exporter ports are bound to `127.0.0.1` by default.

## Metrics

The exporter exposes:

- Router system metrics (CPU, memory, temperature, uptime)
- WAN connection metrics (speed and cumulative counters)
- Device-level metrics (per-device bandwidth and online status)
- Device inventory info
- Exporter self-metrics under `mi_router_exporter_*` (login success/failure, API errors, scrape duration)

Set `ENABLE_DEBUG=true` only when troubleshooting. The `/debug` endpoint stays closed otherwise.

## License

ISC
