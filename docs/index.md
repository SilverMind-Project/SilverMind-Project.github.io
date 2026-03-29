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
    details: 10 pipeline step types assembled in any order per rule, including vision analysis, logic reasoning, conditional branching, wait/resume, and more. No fixed chains.
    link: /features/pipeline
    linkText: Learn more

  - icon: 👤
    title: Person Identification
    details: GPU-accelerated face recognition via ArcFace embeddings with whole-house location tracking, motion direction detection, and Home Assistant integration.
    link: /features/person-tracking
    linkText: Learn more

  - icon: 🗣️
    title: Voice Companion
    details: Real-time conversational AI powered by Google Gemini Live with WebSocket audio streaming and Tamil language support.
    link: /features/voice-companion
    linkText: Learn more

  - icon: 🖼️
    title: E-Ink Display Pipeline
    details: Per-device notification images for color e-ink displays with a visual template editor, bounding box regions, and automatic expiry.
    link: /features/eink-display
    linkText: Learn more

  - icon: 📡
    title: Multi-Channel Notifications
    details: Route alerts by severity across WebSocket, Telegram, e-ink displays, TTS, realtime voice, Home Assistant, and outbound webhooks. Supports escalation and repeat policies.
    link: /features/notifications
    linkText: Learn more

  - icon: 🤖
    title: MCP Tool Server
    details: Expose system state to AI agents via the Model Context Protocol. 16 read-only tools plus rule triggering, with no public endpoint required.
    link: /features/mcp-integration
    linkText: Learn more

  - icon: 🏠
    title: Home Assistant Native
    details: Deep HA integration. Poll sensors, call services, sync rooms and areas, announce via media players, and push person locations to HA helpers.
    link: /guide/configuration#home-assistant

  - icon: 🔒
    title: Fully On-Premise
    details: All vision and language models run locally via vLLM and Ollama. No cloud dependency for core functionality. Your data never leaves your network.
    link: /guide/architecture

  - icon: 🌐
    title: Natural Language Rules
    details: Define rules with context filters for room, time of day, day of week, person presence, and recent activities. Evaluated by LLMs that understand context, not rigid conditions.
    link: /features/pipeline#condition-expressions
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: linear-gradient(135deg, #5b8def 0%, #8b5cf6 100%);
}
</style>

## Why Cognitive Companion?

Cognitive decline doesn't have to mean loss of independence. Most monitoring systems either do too little (basic motion alerts) or too much (full automation that strips away agency). Cognitive Companion sits in the middle: it understands *context* through vision and language models, then delivers gentle reminders only when they're actually needed.

**Built for real families.** Designed for multigenerational households where a senior lives with family members who want to help but can't watch 24/7. The system tracks who is where, what activities have happened, and applies rules written in natural language to decide when intervention is appropriate.

**Built for privacy.** Every model runs on your hardware. Camera frames are processed locally, never uploaded. The system is designed to run entirely within your home network.

---

<div style="text-align: center; padding: 2rem 0;">

[Get Started](/guide/introduction) | [View Features](/features/pipeline) | [API Reference](/api/reference)

</div>
