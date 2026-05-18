# Quick Start

This guide walks you through getting Cognitive Companion running on your local network.

## Prerequisites

| Component | Purpose | Notes |
| --- | --- | --- |
| **NVIDIA GPU** (10 GB+ VRAM) | Person-ID service + vLLM + llama.cpp + Triton | RTX 3060 or better |
| **Docker** + NVIDIA Container Toolkit | Container runtime | For all services |
| **Home Assistant** | Sensor integration, audio playback, actions | REST API + long-lived token |
| **MinIO** (or S3-compatible) | Media object storage | Pre-signed URL support required |
| **vLLM** | Vision model serving | Cosmos-Reason2 via OpenAI-compatible API |
| **llama.cpp** `llama-server` | General reasoning model | Gemma 4 via OpenAI-compatible API |
| **Triton Inference Server** | Embedding model for RAG | embeddinggemma-300m for knowledge repository |
| **Python 3.12** | Backend runtime | |
| **[uv](https://docs.astral.sh/uv/)** | Python package manager | For local development |
| **Node.js 20+** | Frontend build | For admin console, WebSocket audio interface |

### Optional Components

| Component | Purpose |
| --- | --- |
| Telegram Bot | Caregiver alert notifications |
| Google Gemini API | Real-time voice conversations |
| TTS service | Text-to-speech announcements |

## Step 1: Configure Environment

```bash
git clone https://github.com/SilverMind-Project/cognitive-companion.git
cd cognitive-companion
cp .env.example .env
```

Edit `.env` with your service URLs and API keys:

```bash
# LLM Providers
VISION_MODEL_URL=http://localhost:8001/v1       # vLLM (Cosmos Reason2)
GEMMA_MODEL_URL=http://localhost:8080/v1        # llama.cpp (Gemma 4)

# Home Assistant
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=your_long_lived_access_token

# Object Storage
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Person Identification
PERSON_ID_SERVICE_URL=http://localhost:8200

# Authentication
CC_ADMIN_API_KEY=your_admin_key
CC_CAREGIVER_API_KEY=your_caregiver_key
CC_MCP_API_KEY=your_mcp_key
```

Review `config/settings.yaml` for application behavior: event aggregation windows, LLM model names, polling intervals, and more. See [Configuration](/guide/configuration) for a full reference.

## Step 2: Start All Services

### Option A: Docker Compose

```bash
# 1. Start the shared PostgreSQL instance first (hosts all 3 project databases)
docker compose -f docker-compose.db.yml -p nanai up -d

# 2. Start each subproject (pulls in shared DB via include)
cd cognitive-companion && docker compose up -d
cd ../continuous-tracking && docker compose --profile app up -d
cd ../semantic-memory-service && docker compose up -d

# 3. Initialize the cognitive-companion database
cd ../cognitive-companion && make init-db

# 4. Verify
curl http://localhost:8000/api/v1/health   # Backend
curl http://localhost:8400/health           # Semantic Memory
```

Docker Compose handles inter-service networking automatically. The shared `timescale/timescaledb-ha:pg18` container hosts `cognitive_companion`, `continuous_tracking`, and `semantic_memory` databases. Each service connects with its own database user.

::: tip
The person-ID service requires GPU access. Ensure the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) is installed.
:::

See [Deployment](/guide/deployment) for the full Docker Compose and Kubernetes reference.

### Option B: Run Services Individually

**Start the Person Identification Service** (GPU-accelerated face recognition):

```bash
cd ../person-identification-service
docker build -t person-id-service .
docker run --gpus all -p 8200:8200 -v ./data:/app/data person-id-service
```

See the [Person Identification Service README](https://github.com/SilverMind-Project/person-identification-service) for enrollment instructions and API documentation.

**Start the Backend:**

```bash
# With Docker
docker build -t cognitive-companion .
docker run -p 8000:8000 \
  -v ./data:/app/data \
  -v ./config:/app/config \
  --env-file .env \
  cognitive-companion

# Or for local development (requires uv: https://docs.astral.sh/uv/)
cd backend && uv sync --extra gemini && cd ..
uv run --directory backend uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

The `gemini` extra installs the `google-genai` package for voice companion support. Omit it if you don't need real-time voice.

**Start the Frontend:**

```bash
cd frontend
npm install
npm run dev          # Development server at http://localhost:5173
```

For production, the frontend is containerized with nginx:

```bash
cd frontend
docker build -t cognitive-companion-ui .
docker run -p 80:80 cognitive-companion-ui
```

## Step 5: Initial Setup

1. Open the admin console at `http://localhost:5173/admin`
2. Set your admin API key in the settings
3. **Create rooms.** Define the physical spaces in your home (kitchen, bedroom, etc.)
4. **Register sensors.** Add cameras and presence sensors, assigning each to a room
5. **Enroll household members.** Go to **Members & Enrollment**, register each person, then click the face-recognition icon to upload 5-10 reference photos per person
6. **Create rules.** Use the visual pipeline builder to assemble step sequences

### Your First Rule

A basic camera monitoring rule might look like:

```text
person_identification → llm_call (vision) → llm_call (reasoning) → notification
```

1. Go to **Rules** → **New Rule**, enter a name, and click **Create**  -  you'll land on the rule detail page
2. On the **Settings** tab, set the trigger type to `sensor_event` and bind it to a camera sensor
3. Switch to the **Pipeline** tab and add steps from the palette in order:
   - **Person Identification**: identify who is in the frame
   - **LLM Call** (vision, e.g. Cosmos Reason2): describe what is happening
   - **LLM Call** (reasoning, e.g. Gemma 4): decide if a notification is warranted
   - **Notification**: send the alert to configured channels
4. Configure each step's settings in its config dialog
5. Enable the rule and save

The rule will now execute whenever the bound camera sends an event. You can monitor execution in the **Workflows** view and inspect pipeline data in the **Events** log.

