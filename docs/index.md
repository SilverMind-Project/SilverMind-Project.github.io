---
layout: home

hero:
  name: Cognitive Companion
  text: On-Premise AI for Senior Care
  tagline: Safety monitoring and cognitive care, working together. Keep family members safe with computer vision, keep their memories alive with a personal knowledge repository, and stay connected through a natural voice interface — all running on your hardware.
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
    details: 20 step types assembled in any order per rule. Combine knowledge delivery, LLM reasoning, scene analysis, interactive prompts, conditional branching, and wait/resume workflows. Each rule defines its own pipeline — no code required.
    link: /features/pipeline

  - icon: 🛰️
    title: Continuous Tracking
    details: Multi-camera person tracking with BoT-SORT and Bayesian identity resolution. Detects dementia-relevant behavioural patterns — pacing, sundowning, bathroom anomalies, prolonged stillness — and surfaces them through configurable rules and alerts.
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
    details: 27 tools exposed via the Model Context Protocol for AI agent integration. Includes knowledge base queries, quiz answer submission, rule triggering, person location, semantic memory search, activity history, and real-time sensor data.
    link: /features/mcp-integration

  - icon: 🔒
    title: Fully On-Premise
    details: All models run on your hardware. Vision, reasoning, recognition, and embedding inference execute locally via vLLM, llama.cpp, and Triton. Camera frames never leave your network. No cloud dependency for any core capability.
    link: /guide/architecture


---

## See It In Action

<div style="display: flex; justify-content: center; margin: 2rem 0;">
  <iframe width="100%" style="max-width: 800px; aspect-ratio: 16 / 9;" src="https://www.youtube.com/embed/Xur5_7VcWJg" title="Cognitive Companion Demo" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

## Why Cognitive Companion?

Caring for a family member with cognitive decline presents two distinct challenges. The first is safety: knowing where they are, whether they have fallen, whether patterns are changing. The second is connection: keeping their memories accessible, maintaining cognitive engagement, and preserving the stories that define who they are.

Most systems address only the first. Cognitive Companion addresses both.

**Safety monitoring.** Computer vision and sensor fusion track presence, activity, and behaviour across the home. Configurable rules evaluate context — who is where, what has happened, what has changed — and deliver alerts only when warranted. Dementia-relevant signals are detected, scored, and surfaced for clinical review. No false alarms. No unnecessary automation.

**Cognitive care.** A personal knowledge repository stores facts about the senior's life, curated by the people who know them best. The system converts these facts into narrated info cards, interactive quizzes, and a natural voice Q&A interface. The senior can ask "what medication do I take in the morning?" or "tell me about my grandchildren" and receive accurate, personal answers — not generic web results.

**Voice-first interaction.** Every feature is accessible through natural conversation. The senior speaks; the system responds. Info cards are read aloud. Quizzes are conducted by voice. Questions are answered from the knowledge repository. Behind the scenes, Gemini Live orchestrates tool calls, retrieves data, and synthesizes responses in real time.

**Privacy by design.** Every model — vision, language, embedding, recognition — runs on your hardware. Camera frames, personal facts, conversation transcripts, and activity logs never leave your network. The system is engineered from the ground up to operate entirely within your home.

**Built for real families.** Designed for multigenerational households where a senior lives with family members who share caregiving responsibilities. The system adapts to your home, your routines, and your language. English, Tamil, and Tanglish are supported out of the box.

**Built to be extended.** Each pipeline step, notification channel, and context filter is a self-contained plugin. Drop a Python file in the right directory and the system discovers it at startup. The MCP server exposes 27 tools for integration with external AI agents, home automation systems, and custom workflows.

---

<div style="text-align: center; padding: 2rem 0;">

[Get Started](/guide/introduction) | [View Features](/features/pipeline) | [API Reference](/api/reference)

</div>
