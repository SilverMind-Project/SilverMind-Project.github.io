# Quick Start

This guide walks you through getting Cognitive Companion running on your local network.

## Prerequisites

| Component | Purpose | Notes |
|-----------|---------|-------|
| **NVIDIA GPU** (10 GB+ VRAM) | Person-ID service + vLLM serving | RTX 3060 or better |
| **Docker** + NVIDIA Container Toolkit | Container runtime | For person-ID service |
| **Home Assistant** | Sensor integration, audio playback, actions | REST API + long-lived token |
| **MinIO** (or S3-compatible) | Media object storage | Pre-signed URL support required |
| **vLLM** | Vision + translation model serving | Cosmos-Reason2-8B, TranslateGemma-12b |
| **Ollama** | Logic reasoning model | gemma3:4b |
| **Python 3.11+** | Backend runtime | 3.12 recommended |
| **Node.js 18+** | Frontend build | For admin console |

### Optional Components

| Component | Purpose |
|-----------|---------|
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
VLLM_COSMOS_URL=http://localhost:8001/v1
VLLM_TRANSLATE_URL=http://localhost:8002/v1
OLLAMA_API_URL=http://localhost:11434

# Home Assistant
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=your_long_lived_access_token

# Object Storage
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Person Identification
PERSON_ID_SERVICE_URL=http://localhost:8100

# Authentication
CC_ADMIN_API_KEY=your_admin_key
CC_CAREGIVER_API_KEY=your_caregiver_key
CC_MCP_API_KEY=your_mcp_key
```

Review `config/settings.yaml` for application behavior: event aggregation windows, LLM model names, polling intervals, and more. See [Configuration](/guide/configuration) for a full reference.

## Step 2: Start All Services

### Option A: Docker Compose (recommended)

The fastest way to run the full stack. From the parent directory containing both repositories:

```bash
# Start backend, frontend, person-ID (GPU), and MinIO
docker compose up -d

# Verify
curl http://localhost:8000/api/v1/health   # Backend
curl http://localhost:8100/health           # Person-ID service
```

Docker Compose handles inter-service networking automatically. The backend connects to `person-id:8100` and `minio:9000` internally.

::: tip
The person-ID service requires GPU access. Ensure the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) is installed.
:::

See [Deployment](/guide/deployment) for the full Docker Compose and Kubernetes reference.

### Option B: Run Services Individually

**Start the Person Identification Service** (GPU-accelerated face recognition):

```bash
cd ../person-identification-service
docker build -t person-id-service .
docker run --gpus all -p 8100:8100 -v ./data:/app/data person-id-service
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

# Or for local development
pip install -e ".[gemini]"
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

The `[gemini]` extra installs the `google-genai` package for voice companion support. Omit it if you don't need real-time voice.

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
5. **Enroll household members.** Upload reference photos to the person-ID service (5-10 per person), then register them in the admin console under **Persons**
6. **Create rules.** Use the visual pipeline builder to assemble step sequences

### Your First Rule

A basic camera monitoring rule might look like:

```text
person_identification → vision_analysis → logic_reasoning → translation → notification
```

1. Go to **Rules** → **Create Rule**
2. Set the trigger type to `sensor_event` and bind it to a camera sensor
3. In the pipeline builder, add steps from the palette in order:
   - **Person Identification**: identify who is in the frame
   - **Vision Analysis**: describe what is happening
   - **Logic Reasoning**: decide if a notification is warranted
   - **Translation**: translate the message to Tamil (or your target language)
   - **Notification**: send the alert to configured channels
4. Configure each step's settings in its config dialog
5. Enable the rule and save

The rule will now execute whenever the bound camera sends an event. You can monitor execution in the **Workflows** view and inspect pipeline data in the **Events** log.

## What's Next

- [Configuration Reference](/guide/configuration): All settings explained
- [Architecture Deep Dive](/guide/architecture): How the system is designed
- [Pipeline Step Types](/features/pipeline): All 10 step types explained
- [Hardware Setup](/hardware/): Setting up cameras and displays
