# Ops Notes

Current operational notes live here. Historical planning docs are archived under `docs/archive/`.

- Prefer `docker compose up -d --build` after exporter changes
- Grafana anonymous access defaults to off (`GRAFANA_ANONYMOUS_ENABLED=false`)
- Ports are bound to `127.0.0.1` by default
- Exporter `/debug` stays closed unless `ENABLE_DEBUG=true`
- Device aliases UI: http://localhost:3030/aliases (persisted in ./data/device-aliases.json)
