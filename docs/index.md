---
layout: home

hero:
  name: Cognitive Companion
  text: Privacy-First AI for Senior Care
  tagline: An on-premise system that watches for moments where a gentle reminder might help, without automating away the daily routines that give seniors agency.
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
  - icon: 🧩
    title: Composable Pipelines
    details: 14 registered step types assembled in any order per rule, including unified LLM calls, scene analysis, interactive prompts, conditional branching, and wait/resume workflows. Each rule defines its own pipeline.
    link: /features/pipeline

  - icon: 👁️
    title: Scene Analysis
    details: Integrated scene-analysis-service runs YOLO11x object detection, Florence-2-large structured descriptions, and CLIP ViT-L/14 image embeddings entirely on your hardware. YAML-configured hazard rules fire alerts automatically.
    link: /features/pipeline#scene-analysis

  - icon: 👤
    title: Person Identification
    details: GPU-accelerated face recognition via ArcFace embeddings with whole-house location tracking, camera topology for semantic room transitions, and Home Assistant integration.
    link: /features/person-tracking

  - icon: 🗣️
    title: Voice Companion
    details: Real-time conversational AI powered by Google Gemini Live with WebSocket audio streaming, voice tool calling via the MCP registry, and Tamil language support.
    link: /features/voice-companion

  - icon: 🖼️
    title: E-Ink Display Pipeline
    details: Per-device notification images for color e-ink displays with a visual template editor, configurable text regions, and automatic expiry management.
    link: /features/eink-display

  - icon: 📡
    title: Multi-Channel Notifications
    details: Route alerts by severity across WebSocket, Telegram, e-ink displays, TTS, realtime voice, Home Assistant, and outbound webhooks. Per-channel templates and escalation policies.
    link: /features/notifications

  - icon: 🤖
    title: MCP Tool Server
    details: Expose system state to AI agents via the Model Context Protocol. 23 tools including rule triggering, interactive response recording, person locations, activity history, and real-time sensor data.
    link: /features/mcp-integration

  - icon: 🏠
    title: Home Assistant Native
    details: Deep HA integration. Poll sensors, call services, sync rooms and areas, announce via media players, and push person locations to HA input helpers.
    link: /guide/configuration#home-assistant

  - icon: 🔒
    title: Fully On-Premise
    details: All vision, reasoning, and recognition models run locally via vLLM, llama.cpp, and the scene-analysis-service. No cloud dependency for core functionality. Your data stays on your network.
    link: /guide/architecture


---

## See It In Action

<div style="display: flex; justify-content: center; margin: 2rem 0;">
  <iframe width="100%" style="max-width: 800px; aspect-ratio: 16 / 9;" src="https://www.youtube.com/embed/Xur5_7VcWJg" title="Cognitive Companion Demo" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

## Why Cognitive Companion?

Cognitive decline doesn't have to mean loss of independence. Most monitoring systems either do too little (basic motion alerts) or too much (full automation that removes the daily routines giving seniors agency). Cognitive Companion occupies a different position: it understands context through vision and language models, then delivers gentle reminders only when they're actually warranted.

**Built for real families.** Designed for multigenerational households where a senior lives with family members who want to help but can't watch 24/7. The system tracks who is where, what activities have happened, and applies rules written in natural language to decide when a nudge is appropriate.

**Built for privacy.** Every model runs on your hardware. Camera frames are processed locally and never leave your network. The system is designed from the ground up to operate entirely within your home.

**Built to be extended.** Each pipeline step, notification channel, and context filter is a self-contained plugin. Drop a Python file in the right directory and the system discovers it at startup. No fork required.

---

<div style="text-align: center; padding: 2rem 0;">

[Get Started](/guide/introduction) | [View Features](/features/pipeline) | [API Reference](/api/reference)

</div>
