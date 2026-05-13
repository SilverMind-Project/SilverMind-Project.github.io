---
layout: home

hero:
  name: Cognitive Companion
  text: AI for Senior Care
  tagline: On-premise AI for safety monitoring and cognitive care. Computer vision tracks presence and behavior across the home. A personal knowledge repository keeps memories accessible. A voice companion provides natural conversation.
  image:
    src: /logo.svg
    alt: Cognitive Companion
  actions:
    - theme: brand
      text: Get Started
      link: /guide/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/SilverMind-Project/cognitive-companion
    - theme: alt
      text: Report an Issue
      link: https://github.com/SilverMind-Project/cognitive-companion/issues

features:
  - icon: 📚
    title: Knowledge Repository
    details: Build a personal knowledge base for the senior. Caregivers upload facts about family, biography, medications, and routines. The system converts them into voice-narrated info cards, review-gated quizzes, and a voice Q&A interface that answers questions like "how many grandchildren do I have?" using on-device RAG.
    link: /features/knowledge-repository

  - icon: 🗣️
    title: Voice Companion
    details: Natural conversation powered by Google Gemini Live. Real-time WebSocket audio streaming, MCP tool calling for live system queries, bilingual Tamil and English support, and per-delivery voice instructions that adapt the assistant's behaviour to each interaction.
    link: /features/voice-companion

  - icon: 🧩
    title: Composable Pipelines
    details: 20 step types assembled in any order per rule. Combine knowledge delivery, LLM reasoning, scene analysis, quiz delivery, info cards, interactive prompts, conditional branching, and wait/resume workflows. Each rule defines its own pipeline. No code required.
    link: /features/pipeline

  - icon: 🛰️
    title: Continuous Tracking
    details: "Multi-camera person tracking with BoT-SORT and Bayesian identity resolution. Detects dementia-relevant behavioural patterns: pacing, sundowning, bathroom anomalies, and prolonged stillness. Surfaces them through configurable rules and alerts."
    link: /features/continuous-tracking

  - icon: 👤
    title: Person Identification
    details: GPU-accelerated face recognition via ArcFace embeddings. Whole-house location tracking with camera topology for semantic room transitions. Home Assistant integration pushes locations to input helpers for cross-system awareness.
    link: /features/person-tracking

  - icon: 👁️
    title: Scene Understanding
    details: On-device scene analysis with YOLO11x object detection, Florence-2-large structured descriptions, and CLIP ViT-L/14 image embeddings. Hazard rules trigger automatic alerts. Semantic memory enables natural-language queries about past observations.
    link: /features/pipeline#scene-analysis

  - icon: 📡
    title: Multi-Channel Delivery
    details: Route information across WebSocket popups, Telegram, e-ink displays, TTS announcements, realtime voice, Home Assistant media players, and outbound webhooks. Seven channels with per-channel templates, escalation policies, and repeat schedules.
    link: /features/notifications

  - icon: 🖼️
    title: E-Ink Displays
    details: Color e-ink display support with a visual template editor, configurable text regions, automatic expiry management, and per-device image state tracking. Info cards render directly to e-ink with dithered image variants.
    link: /features/eink-display

  - icon: 🤖
    title: MCP Tool Server
    details: Over 30 tools exposed via the Model Context Protocol for AI agent integration. Includes knowledge base queries, quiz answer submission, rule triggering, person location, semantic memory search, activity history, and real-time sensor data.
    link: /features/mcp-integration

  - icon: 🔒
    title: On-Premise Storage and Inference
    details: All models run on your hardware. Vision, reasoning, recognition, and embedding inference execute locally via vLLM, llama.cpp, and Triton. Camera frames never leave your network. No cloud dependency for any core capability.
    link: /guide/architecture


---

## See It In Action

<div style="display: flex; justify-content: center; margin: 2rem 0;">
  <iframe width="100%" style="max-width: 800px; aspect-ratio: 16 / 9;" src="https://www.youtube.com/embed/Xur5_7VcWJg" title="Cognitive Companion Demo" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

## Why Cognitive Companion?

Caring for a family member with cognitive decline involves two distinct challenges. The first is safety: knowing where they are, whether patterns are changing, whether something is wrong. The second is connection: keeping memories accessible, maintaining cognitive engagement, and preserving a sense of identity.

Most care systems address only the first. Cognitive Companion addresses both.

**Safety monitoring.** Computer vision and sensor fusion track presence, activity, and behavior across the home. Configurable rules evaluate context (who is where, what has happened, what has changed) and deliver alerts only when warranted. Dementia-relevant signals are detected, scored, and surfaced for caregiver review. No false alarms. No unnecessary automation.

**Cognitive care.** A personal knowledge repository stores facts about the senior's life, curated by the caregivers who know them. The system converts those facts into narrated info cards, interactive quizzes, and a voice Q&A interface. The senior can ask "what medication do I take in the morning?" or "tell me about my grandchildren" and receive accurate answers from the repository, not generic web results.

**Voice-first interaction.** Every feature is accessible through natural conversation. The senior speaks and the system responds. Info cards are read aloud. Quizzes are conducted by voice. Questions are answered from the knowledge repository. Gemini Live orchestrates tool calls, retrieves data, and synthesizes responses in real time.

**Privacy by design.** Every model runs on your hardware: vision, language, embedding, and recognition. Camera frames, personal facts, conversation transcripts, and activity logs never leave your network. There are no cloud dependencies for any core capability.

**Multigenerational by default.** Cognitive Companion is built for households where a senior lives with family members who share caregiving responsibilities. The system adapts to your home layout, your routines, and your language. English, Tamil, and Tanglish are supported out of the box.

**Extensible by design.** Each pipeline step, notification channel, and context filter is a self-contained plugin. Drop a Python file in the right directory and the system discovers it at startup. The MCP server exposes over 30 tools for integration with external AI agents, home automation systems, and custom workflows.

---

<div style="text-align: center; padding: 2rem 0;">

[Get Started](/guide/introduction) | [View Features](/features/pipeline) | [API Reference](/api/reference)

</div>
