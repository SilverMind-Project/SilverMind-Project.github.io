# Quick Start

This guide walks you through getting Cognitive Companion running on your local network.

## Prerequisites

| Component | Purpose | Notes |
| --- | --- | --- |
| **NVIDIA GPU** (32 GB minimum, 48 GB recommended) | Hosts the general LLM, the vision-language model, and the Triton vision models | RTX 5090 (32 GB) at minimum; A6000 or L40S (48 GB) for headroom; or split across GPUs. See [GPU memory budget](#gpu-memory-budget). |
| **Docker** + NVIDIA Container Toolkit | Container runtime | For all services |
| **Home Assistant** | Sensor integration, audio playback, actions | REST API + long-lived token |
| **MinIO** (or S3-compatible) | Media object storage | Pre-signed URL support required |
| **vLLM** | Serves the vision-language model | Cosmos-Reason2-8B at FP8, OpenAI-compatible API |
| **llama.cpp** `llama-server` | Serves the general reasoning model | Gemma 4 26B-A4B (MoE) at FP4, OpenAI-compatible API |
| **Triton Inference Server** | Vision, face, and embedding models | Detection, ReID, pose, face, CLIP, Florence-2, embeddinggemma-300m |
| **Python 3.14** | Backend runtime | |
| **[uv](https://docs.astral.sh/uv/)** | Python package manager | For local development |
| **Node.js 24.16.x** | Frontend build | For admin console, WebSocket audio interface |

### Optional Components

| Component | Purpose |
| --- | --- |
| Telegram Bot | Caregiver alert notifications |
| Google Gemini API | Real-time voice conversations |
| TTS service | Text-to-speech announcements |

## GPU memory budget

The system runs several models on the GPU at once. The two language models dominate the budget; the perception models are individually small but add up. The table below breaks the requirement down by component, at the precision each model is served at today.

| Component | What runs | Precision | Approx. VRAM |
| --- | --- | --- | --- |
| General reasoning LLM | Gemma 4 26B-A4B (MoE, all experts resident) | FP4 (llama.cpp) | ~13 GB |
| Vision-language model | Cosmos-Reason2-8B (vLLM) | FP8 | ~8 GB |
| Knowledge embeddings | embeddinggemma-300m (Triton) | FP32 ONNX | ~1.2 GB |
| Scene analysis | CLIP ViT-L/14 + Florence-2-large (Triton) | ONNX / INT8 | ~2 GB |
| Multi-camera tracking | YOLO26L + Swin ReID + RTMPose (Triton) | FP32 ONNX | ~0.3 GB |
| Face recognition | Buffalo_L: SCRFD + ArcFace R50 + landmarks (Triton) | FP32 ONNX | ~0.35 GB |
| | | **Weights subtotal** | **~25 GB** |

A few things this table does not include, which you still need to budget for:

- **vLLM KV cache.** Cosmos-Reason2 is served with `--max-model-len=16384` and `--max-num-seqs=4`, and the deployment uses `--quantization=fp8` with `--kv-cache-dtype=fp8` at `--gpu-memory-utilization=0.25`. KV cache grows with context length and the number of concurrent sequences.
- **Per-process CUDA context** of roughly 0.5 to 1 GB for each model server and for Triton.
- **The general LLM precision is the biggest variable.** The ~13 GB figure assumes FP4 (4-bit) quantization on llama.cpp, which is the current setup. FP8 roughly doubles it and BF16 roughly quadruples it. Because it is a mixture-of-experts model, all experts stay resident in VRAM even though only about 4B parameters activate per token, so memory tracks the 26B total, not the 4B active. The `qwen-3.6-35b` alternative in `config/settings.yaml` is larger, roughly 18 GB at FP4.

Two practical consequences:

- **A 32 GB GPU can host the full stack**, with a 48 GB card giving comfortable headroom for KV cache and concurrency. You can also split the models across GPUs. The perception models have INT8 and Jetson-quantized variants (`continuous-tracking/triton-models-jetson/`) that bring them to under 1 GB combined, but the LLM and the vision-language model are still what set the floor.
- **The model servers talk over OpenAI-compatible URLs and Triton gRPC**, so the LLM and VLM can run on a separate host or GPU from the perception stack. Point `VISION_MODEL_URL`, `GEMMA_MODEL_URL`, and `EMBEDDING_TRITON_URL` at wherever they run.

### Reference hardware: offload perception to a Jetson

A reference split runs the two language models on a main GPU and moves the latency-sensitive vision and face models to a Jetson Orin Nano Super (8 GB unified memory) acting as an inference appliance:

- **Main GPU host:** general LLM, vision-language model, knowledge embeddings, and scene analysis (CLIP + Florence-2).
- **Jetson Orin Nano Super:** detector (YOLO26L), pose (RTMPose-m), body ReID (SOLIDER), and face detection and recognition (SCRFD + ArcFace from `buffalo_l`), all served as selective INT8 TensorRT plans.

These perception models are small in VRAM, about 0.65 GB on the main GPU, so the point of the split is not to reclaim much memory. It is to keep per-frame inference and face embeddings on a low-power box on the local network, off the GPU that serves the LLM. Qualify six cameras first; eight is conditional on the detector p95 staying under 140 ms with stable memory headroom.

See [Run CTS inference on Jetson Orin Nano Super](/hardware/jetson-cts) for the model-by-model quantization recipe, qualification gates, and production metrics.

## Step 1: Configure Environment

```bash
git clone https://github.com/SilverMind-Project/cognitive-companion.git
cd cognitive-companion
cp .env.example .env
```

Edit `.env` with your service URLs and API keys:

```bash
# LLM Providers
VISION_MODEL_URL=http://localhost:8001       # vLLM (Cosmos-Reason2-8B, FP8)
GEMMA_MODEL_URL=http://localhost:8100        # llama.cpp (Gemma 4 26B-A4B, FP4)

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

## Step 3: Initial Setup

1. Open the admin console at `http://localhost:5173/admin`
2. Set your admin API key in the settings
3. **Create rooms.** Define the physical spaces in your home (kitchen, bedroom, etc.)
4. **Register sensors.** Add cameras and presence sensors, assigning each to a room
5. **Enroll household members.** Go to **Members & Enrollment**, register each person, then click the face-recognition icon to upload 5-10 reference photos per person
6. **Create rules.** Use the visual pipeline builder to assemble step graphs

### Your First Rule

A basic camera monitoring rule might look like:

```text
person_identification → llm_call (vision) → llm_call (reasoning) → notification
```

1. Go to **Rules** → **New Rule**, enter a name, and click **Create**  -  you'll land on the rule detail page
2. On the **Settings** tab, set the trigger type to `sensor_event` and bind it to a camera sensor
3. Switch to the **Pipeline** tab, add nodes from the palette, and connect them with edges:
   - **Person Identification**: identify who is in the frame
   - **LLM Call** (vision, e.g. Cosmos Reason2): describe what is happening
   - **LLM Call** (reasoning, e.g. Gemma 4): decide if a notification is warranted
   - **Notification**: send the alert to configured channels
4. Configure each step's settings in its config dialog
5. Enable the rule and save

The rule will now execute whenever the bound camera sends an event. You can monitor live and historical runs in the **Executions** view and inspect pipeline data in the **Events** log.
