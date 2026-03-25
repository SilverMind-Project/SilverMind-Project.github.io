# Deployment

Cognitive Companion can be deployed via Docker Compose for single-machine setups or Kubernetes for cluster environments. Both options run the full stack on-premise with no cloud dependencies.

## Docker Compose

Each repository ships its own `docker-compose.yml`, so services are independently deployable. External dependencies (vLLM, Ollama, MinIO, Home Assistant, TTS) are expected to be running separately.

### Quick Start

```bash
# Clone both repositories
git clone https://github.com/SilverMind-Project/cognitive-companion.git
git clone https://github.com/SilverMind-Project/person-identification-service.git

# 1. Start the person identification service (GPU required)
cd person-identification-service
cp .env.example .env
docker compose up -d

# 2. Start Cognitive Companion (backend + frontend)
cd ../cognitive-companion
cp .env.example .env
# Edit .env with your API keys and service URLs
docker compose up -d

# 3. Verify
curl http://localhost:8000/api/v1/health
curl http://localhost:8100/health
```

### Cognitive Companion (`cognitive-companion/docker-compose.yml`)

| Service    | Container     | Port | Notes               |
|------------|---------------|------|---------------------|
| `backend`  | `cc-backend`  | 8000 | FastAPI backend     |
| `frontend` | `cc-frontend` | 80   | Vue 3 SPA via nginx |

The backend Dockerfile lives at `backend/Dockerfile` and uses the repository root as its build context (it needs `backend/`, `config/`, and `pyproject.toml`). The frontend Dockerfile lives at `frontend/Dockerfile`.

### Person Identification Service (`person-identification-service/docker-compose.yml`)

| Service     | Container   | Port | Notes                |
|-------------|-------------|------|----------------------|
| `person-id` | `person-id` | 8100 | GPU face recognition |

Requires the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) for GPU access.

### Environment Variables

Each repository has its own `.env.example`. The Cognitive Companion `.env` configures all external service URLs:

```bash
# LLM Endpoints
VISION_MODEL_URL=http://localhost:8001/v1
TRANSLATE_MODEL_URL=http://localhost:8002/v1
LOGIC_MODEL_URL=http://localhost:11434

# Google Gemini (optional, for realtime voice)
GEMINI_API_KEY=

# TTS
TTS_API_URL=http://localhost:6060/v1

# Home Assistant
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=

# MinIO
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Person Identification Service
PERSON_ID_SERVICE_URL=http://localhost:8100

# Telegram notifications
TELEGRAM_BOT_TOKEN=
TELEGRAM_CAREGIVER_CHAT_ID=

# API keys
CC_ADMIN_API_KEY=change-me-admin-key
CC_CAREGIVER_API_KEY=change-me-caregiver-key
CC_MCP_API_KEY=change-me-mcp-key
```

::: tip
When running inside Docker, use `host.docker.internal` instead of `localhost` to reach services on the host machine. If external services are on different machines, use their LAN IP addresses.
:::

### External Services

The following services run **outside** Docker Compose and must be accessible from the backend container:

| Service                       | Purpose                             | Default URL                       |
|-------------------------------|-------------------------------------|-----------------------------------|
| **Person ID Service**         | Face recognition + motion detection | `http://localhost:8100`           |
| **vLLM** (Cosmos-Reason2-8B)  | Vision analysis                     | `http://localhost:8001/v1`        |
| **vLLM** (TranslateGemma-12b) | Translation                         | `http://localhost:8002/v1`        |
| **Ollama** (gemma3:4b)        | Logic reasoning                     | `http://localhost:11434`          |
| **MinIO**                     | S3-compatible object storage        | `http://localhost:9000`           |
| **Home Assistant**            | Sensor integration                  | `http://homeassistant.local:8123` |
| **TTS service**               | Text-to-speech                      | `http://localhost:6060/v1`        |

### Persistent Volumes

| Volume           | Compose File                  | Container Path | Contents                                     |
|------------------|-------------------------------|----------------|----------------------------------------------|
| `backend-data`   | cognitive-companion           | `/app/data`    | SQLite database, media cache                 |
| `person-id-data` | person-identification-service | `/app/data`    | Face embeddings, enrollment DB, guest images |

### Frontend Image

The frontend uses a multi-stage Docker build:

1. **Build stage.** Node 20 builds the Vue 3 SPA with Vite.
2. **Serve stage.** nginx 1.27-alpine serves the static files and proxies `/api/` and `/ws` to the backend.

The nginx config automatically routes API calls to the backend container (`cc-backend:8000`), so the frontend works without any additional proxy configuration.

---

## Kubernetes

For cluster deployments, Kubernetes manifests are provided in each repository's `kubernetes/` directory.

### Architecture

```text
Internet / LAN
       │
       ▼
┌──────────────────────────────────────────────┐
│  nginx ingress (single LoadBalancer IP)      │
│  ├─ nanai.khoofia.com     → cc-ui-svc:80    │
│  ├─ api.nanai.khoofia.com → cc-backend:8000 │
│  ├─ :8000-8002 (TCP)      → vllm-svc        │
│  └─ :5432 (TCP)           → pgedge-n1-rw    │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│  default namespace                           │
│  ├─ ai-api-gateway (backend, port 8000)      │
│  ├─ cognitive-companion-ui (frontend, :80)   │
│  ├─ person-id (GPU, port 8100)               │
│  ├─ vllm-svc (GPU, ports 8000-8002)         │
│  └─ pgedge-n1-rw (postgres, port 5432)      │
├──────────────────────────────────────────────┤
│  minio-operator namespace                    │
│  └─ minio (S3, port 80)                     │
└──────────────────────────────────────────────┘
```

### Design Principles

- **ClusterIP services**: all services use ClusterIP, routed through a single nginx ingress. No unnecessary LoadBalancer IPs.
- **Secrets separated from ConfigMaps**: sensitive values (API keys, tokens) in Kubernetes Secrets; service URLs and non-sensitive config in ConfigMaps.
- **Health probes**: readiness and liveness probes on all pods for automatic restart and traffic routing.
- **Base + overlay**: environment-agnostic manifests in `base/`, cluster-specific values in `local/` (or your own overlay directory).

### Manifest Structure

**cognitive-companion/kubernetes/**

```text
kubernetes/
├── base/
│   ├── deployment.yaml          # Backend deployment
│   ├── service.yaml             # Backend ClusterIP (port 8000)
│   ├── pvc.yaml                 # 10Gi volume for SQLite/data
│   ├── configmap.yaml           # Non-sensitive env vars
│   ├── configmap-files.yaml     # settings.yaml, auth.yaml, notifications.yaml
│   ├── secret.yaml              # Sensitive env vars (fill before use)
│   ├── frontend-deployment.yaml # Frontend deployment
│   └── frontend-service.yaml    # Frontend ClusterIP (port 80)
├── local/
│   ├── deployment.yaml          # Backend with localhost:32000 image
│   ├── frontend-deployment.yaml # Frontend with localhost:32000 image
│   ├── configmap.yaml           # Cluster-internal service URLs
│   ├── secret.yaml              # Local secrets (fill with base64)
│   ├── ingress.yaml             # TLS ingress rules
│   └── build-and-deploy.sh      # Build + apply helper script
└── README.md
```

**person-identification-service/kubernetes/**

```text
kubernetes/
├── base/
│   ├── deployment.yaml    # GPU deployment (nvidia.com/gpu: 1)
│   ├── service.yaml       # ClusterIP on port 8100
│   └── pvc.yaml           # 5Gi volume for embeddings/guests
└── local/
    └── deployment.yaml    # localhost:32000 registry image
```

### Services

| Service | Name | Port | Type |
|---------|------|------|------|
| Backend API | `ai-api-gateway-svc` | 8000 | ClusterIP |
| Frontend | `cognitive-companion-ui-svc` | 80 | ClusterIP |
| Person ID | `person-id-svc` | 8100 | ClusterIP |

### Deploying to a Local Cluster

```bash
# 1. Fill in secrets (base64-encoded values)
#    echo -n "your-value" | base64
vi cognitive-companion/kubernetes/local/secret.yaml

# 2. Build images and deploy everything
cd cognitive-companion/kubernetes/local
./build-and-deploy.sh all

# 3. Check status
microk8s kubectl get pods
microk8s kubectl get svc
microk8s kubectl get ingress
```

The `build-and-deploy.sh` script supports deploying individual components:

```bash
./build-and-deploy.sh backend    # Backend only
./build-and-deploy.sh frontend   # Frontend only
./build-and-deploy.sh person-id  # Person-ID service only
./build-and-deploy.sh ingress    # Ingress rules only
```

### Ingress Configuration

The local overlay includes TLS ingress rules for two hostnames:

| Host | Backend |
|------|---------|
| `api.nanai.khoofia.com` | `ai-api-gateway-svc:8000` |
| `nanai.khoofia.com` | `cognitive-companion-ui-svc:80` |

TLS certificates are provisioned automatically by cert-manager with the `letsencrypt-prod` ClusterIssuer.

### GPU Scheduling

The person-ID deployment requests a GPU via the NVIDIA device plugin:

```yaml
resources:
  requests:
    nvidia.com/gpu: "1"
  limits:
    nvidia.com/gpu: "1"
```

This requires the [NVIDIA GPU Operator](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/getting-started.html) or the microk8s `gpu` addon enabled on the cluster.

### Persistent Volumes

| PVC | Size | Contents |
|-----|------|----------|
| `cc-backend-data` | 10Gi | SQLite database, media cache |
| `person-id-data` | 5Gi | Face embeddings, enrollment DB, guest images |

Both use the `microk8s-hostpath` storage class. Adjust the `storageClassName` in the PVC manifests for other environments.

### Migrating from v1

If you're replacing the original `cognitive-companion` (v1) deployment:

| Change | v1 | v2 |
|--------|----|----|
| Backend port | 8100 | 8000 |
| Service type | LoadBalancer | ClusterIP (behind ingress) |
| Person-ID | External | In-cluster GPU pod |
| Config | Inline env vars in deployment | ConfigMap + Secret |
| Health probes | None | Readiness + liveness |

The v2 deployment uses the same service names (`ai-api-gateway-svc`, `cognitive-companion-ui-svc`), so applying the v2 manifests replaces v1 in-place. Verify the new pods are healthy before removing any v1-specific resources.

---

## What's Next

- [Configuration Reference](/guide/configuration): all settings explained
- [Architecture](/guide/architecture): how the system is designed
- [Development Setup](/development/setup): local development environment
