---
layout: home

hero:
  name: Cognitive Companion
  text: Agentic AI for aging in place, private by design
  tagline: Cognitive Companion puts AI agents to work inside the home. They perceive daily routines, reason about what changed, and act through caregiver-approved workflows, on hardware the family owns.
  image:
    src: /cognitive-companion-care-4x3.png
    alt: An elderly woman relaxing at home with a tablet-based AI companion, connected to a care network
  actions:
    - theme: brand
      text: Watch demo
      link: "#demo"
    - theme: alt
      text: For families
      link: "#families"
    - theme: alt
      text: For care partners
      link: "#care-partners"
---

<section id="demo" class="home-section home-demo">
  <div class="section-kicker">See it in action</div>
  <div class="home-demo-grid">
    <div class="home-section-copy">
      <h2>A quieter way to care from home.</h2>
      <p>
        Aging at home should not require constant surveillance or persistent worry.
        Cognitive Companion turns local home signals into useful care context:
        where someone is, what changed, when help may be needed, and which memories
        or routines can support the next moment.
      </p>
    </div>
    <div class="video-shell">
      <iframe
        src="https://www.youtube.com/embed/Xur5_7VcWJg"
        title="Cognitive Companion Demo"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
  </div>
</section>

<section class="home-section">
  <div class="section-kicker">What it helps families do</div>
  <h2>Know more, interrupt less, respond sooner.</h2>
  <div class="outcome-grid">
    <article class="outcome-card">
      <span class="card-number">01</span>
      <h3>Notice meaningful changes</h3>
      <p>
        Reliably detect routine anomalies, prolonged stillness, pacing, and unusual room transitions. The system uses stable presence tracking to provide calm, reliable awareness.
      </p>
    </article>
    <article class="outcome-card">
      <span class="card-number">02</span>
      <h3>Keep identity close</h3>
      <p>
        Store family facts, medication notes, and preferences in a personal knowledge repository. This powers grounded voice responses, family-approved info cards, and interactive memory quizzes delivered to the senior via the companion web app, e-ink displays, and Home Assistant speakers.
      </p>
    </article>
    <article class="outcome-card">
      <span class="card-number">03</span>
      <h3>Give caregivers context</h3>
      <p>
        Route behavioral signals, daily summaries, and reviewable alerts directly to caregivers. The system integrates with Telegram and custom webhooks to keep families informed with actionable context, rather than a constant stream of raw camera footage.
      </p>
    </article>
  </div>
</section>

<HomeDayTimeline />

<section class="home-section">
  <div class="section-kicker">An agentic platform for the home</div>
  <h2>Agents that perceive, reason, and act. People stay in charge.</h2>
  <div class="outcome-grid">
    <article class="outcome-card">
      <span class="card-number">01</span>
      <h3>Autonomous care workflows</h3>
      <p>
        Rules run as pipelines of 24 step types that watch cameras and sensors, reason with local vision and language models, branch on conditions, and act through 7 notification channels. Every run is recorded with a full graph snapshot, so caregivers can review exactly what an agent did and why.
      </p>
    </article>
    <article class="outcome-card">
      <span class="card-number">02</span>
      <h3>Guided routines with bounded autonomy</h3>
      <p>
        A realtime voice agent walks a resident through routines such as making tea, one step at a time, in her own language. The agent proposes each advance; deterministic code decides, escalates to a caregiver when she is stuck, and writes an auditable event timeline.
      </p>
    </article>
    <article class="outcome-card">
      <span class="card-number">03</span>
      <h3>Open to the agent ecosystem</h3>
      <p>
        A built-in Model Context Protocol server exposes 59 tools, so Claude, custom agents, and the voice companion all operate the household through one governed, authenticated interface. The home becomes something an agent can safely act on.
      </p>
    </article>
    <article class="outcome-card">
      <span class="card-number">04</span>
      <h3>Grounded in physical-world perception</h3>
      <p>
        Multi-camera tracking, Bayesian identity resolution, and behavioral signals measured against each person's own history give agents a persistent model of the physical home. Caregivers can confirm or dismiss each behavioral signal, and that feedback stays with the record.
      </p>
    </article>
  </div>
</section>

<section class="home-section audience-section">
  <div class="section-kicker">For everyone in the circle of care</div>
  <div class="audience-grid">
    <article id="families" class="audience-panel">
      <div class="audience-label">For families</div>
      <h2>Support independence without losing touch.</h2>
      <p>
        Cognitive Companion is for households where care is shared. It helps you understand daily rhythms, preserve personal history, support natural conversation, and stay aware when a routine shifts unexpectedly.
      </p>
      <a href="/families/overview.html">Read the family overview</a>
    </article>
    <article id="care-partners" class="audience-panel">
      <div class="audience-label">For care partners</div>
      <h2>Care infrastructure for the home.</h2>
      <p>
        For health plans, senior-care providers, and care organizations, Cognitive Companion is a vertical AI agent for aging in place: always-on monitoring, earlier risk signals, and lower caregiver burden in one deployable system. Local inference means no per-frame cloud cost scaling with each home, which changes the unit economics of continuous care.
      </p>
      <a href="/guide/architecture.html">Explore the architecture</a>
    </article>
  </div>
</section>

<section class="home-section trust-section">
  <div class="section-kicker">Trust by design</div>
  <h2>Private enough for the home. Extensible enough for builders.</h2>
  <div class="trust-grid">
    <div class="trust-card">
      <svg class="trust-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12,3L2,12H5V20H19V12H22L12,3M12,9A3,3 0 0,1 15,12V13H16V17H8V13H9V12A3,3 0 0,1 12,9M12,11A1,1 0 0,0 11,12V13H13V12C13,11.5 12.6,11 12,11Z" /></svg>
      <div>
        <h3>Local-first intelligence</h3>
        <p>Privacy is an architectural requirement. Vision, language, embeddings, and reasoning process entirely on local hardware to build lasting trust.</p>
      </div>
    </div>
    <div class="trust-card">
      <svg class="trust-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.1,12.5L22.5,13.91L15.97,20.5L12.5,17L13.9,15.59L15.97,17.67L21.1,12.5M11,4A4,4 0 0,1 15,8A4,4 0 0,1 11,12A4,4 0 0,1 7,8A4,4 0 0,1 11,4M11,6A2,2 0 0,0 9,8A2,2 0 0,0 11,10A2,2 0 0,0 13,8A2,2 0 0,0 11,6M11,13C11.68,13 12.5,13.09 13.41,13.26L11.74,14.93L11,14.9C8.03,14.9 4.9,16.36 4.9,17V18.1H11.1L13,20H3V17C3,14.34 8.33,13 11,13Z" /></svg>
      <div>
        <h3>Caregiver review</h3>
        <p>Rules and pipelines are configurable so sensitive actions stay human-in-the-loop.</p>
      </div>
    </div>
    <div class="trust-card">
      <svg class="trust-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M22,13.5C22,15.26 20.7,16.72 19,16.96V20A2,2 0 0,1 17,22H13.2V21.7A2.7,2.7 0 0,0 10.5,19C9,19 7.8,20.21 7.8,21.7V22H4A2,2 0 0,1 2,20V16.2H2.3C3.79,16.2 5,15 5,13.5C5,12 3.79,10.8 2.3,10.8H2V7A2,2 0 0,1 4,5H7.04C7.28,3.3 8.74,2 10.5,2C12.26,2 13.72,3.3 13.96,5H17A2,2 0 0,1 19,7V10.04C20.7,10.28 22,11.74 22,13.5M17,15H18.5A1.5,1.5 0 0,0 20,13.5A1.5,1.5 0 0,0 18.5,12H17V7H12V5.5A1.5,1.5 0 0,0 10.5,4A1.5,1.5 0 0,0 9,5.5V7H4V9.12C5.76,9.8 7,11.5 7,13.5C7,15.5 5.75,17.2 4,17.88V20H6.12C6.8,18.25 8.5,17 10.5,17C12.5,17 14.2,18.25 14.88,20H17V15Z" /></svg>
      <div>
        <h3>Open architecture</h3>
        <p>The system is built to adapt. Pipelines, notification channels, context filters, and agent tools can be extended.</p>
      </div>
    </div>
    <div class="trust-card">
      <svg class="trust-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M19,8C19.56,8 20,8.43 20,9A1,1 0 0,1 19,10C18.43,10 18,9.55 18,9C18,8.43 18.43,8 19,8M2,2V11C2,13.96 4.19,16.5 7.14,16.91C7.76,19.92 10.42,22 13.5,22A6.5,6.5 0 0,0 20,15.5V11.81C21.16,11.39 22,10.29 22,9A3,3 0 0,0 19,6A3,3 0 0,0 16,9C16,10.29 16.84,11.4 18,11.81V15.41C18,17.91 16,19.91 13.5,19.91C11.5,19.91 9.82,18.7 9.22,16.9C12,16.3 14,13.8 14,11V2H10V5H12V11A4,4 0 0,1 8,15A4,4 0 0,1 4,11V5H6V2H2Z" /></svg>
      <div>
        <h3>Clinical humility</h3>
        <p>The system supports families and care teams. It does not replace professional judgment.</p>
      </div>
    </div>
  </div>
</section>

<section class="home-section builder-section">
  <div class="builder-copy">
    <div class="section-kicker">For builders</div>
    <h2>Beneath the calm surface is a serious agent stack.</h2>
    <p>
      Cognitive Companion combines distributed systems, applied machine learning, and agent orchestration. The stack includes realtime sensor fusion, Bayesian identity resolution, edge-native local inference, vision reasoning inside composable agent workflows, a 59-tool MCP server, and a realtime voice agent with function calling. Every layer is documented for teams who want to deploy, inspect, or extend the system.
    </p>
  </div>
  <div class="builder-actions">
    <a class="home-link-button" href="/features/pipeline.html">View features</a>
    <a class="home-link-button" href="/api/reference.html">API reference</a>
    <a class="home-link-button" href="https://github.com/SilverMind-Project/cognitive-companion">GitHub</a>
  </div>
</section>
