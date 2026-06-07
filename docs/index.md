---
layout: home

hero:
  name: Cognitive Companion
  text: Privacy-first AI for aging in place
  tagline: Cognitive Companion helps families keep seniors safer at home by noticing meaningful routine changes, preserving personal memories, and giving caregivers calm, timely awareness.
  image:
    src: /logo.svg
    alt: Cognitive Companion
  actions:
    - theme: brand
      text: Watch Demo
      link: "#demo"
    - theme: alt
      text: For Families
      link: "#families"
    - theme: alt
      text: For Care Partners
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
        For health plans, senior-care providers, and care organizations, Cognitive Companion is privacy-preserving aging-in-place infrastructure. Local-by-default inference improves unit economics, while consistent reliability drives long-term retention and earlier risk signals.
      </p>
      <a href="/guide/architecture.html">Explore the architecture</a>
    </article>
  </div>
</section>

<section class="home-section trust-section">
  <div class="section-kicker">Trust by design</div>
  <h2>Private enough for the home. Extensible enough for builders.</h2>
  <div class="trust-grid">
    <div>
      <h3>Local-first intelligence</h3>
      <p>Privacy is an architectural requirement. Vision, language, embeddings, and reasoning process entirely on local hardware to build lasting trust.</p>
    </div>
    <div>
      <h3>Caregiver review</h3>
      <p>Rules and pipelines are configurable so sensitive actions stay human-in-the-loop.</p>
    </div>
    <div>
      <h3>Open architecture</h3>
      <p>The system is built to adapt. Pipelines, notification channels, context filters, and agent tools can be extended.</p>
    </div>
    <div>
      <h3>Clinical humility</h3>
      <p>The system supports families and care teams. It does not replace professional judgment.</p>
    </div>
  </div>
</section>

<section class="home-section builder-section">
  <div class="builder-copy">
    <div class="section-kicker">For builders</div>
    <h2>Beneath the calm surface is a serious local AI stack.</h2>
    <p>
      Cognitive Companion combines distributed systems and applied machine learning. The stack includes realtime sensor fusion, Bayesian identity resolution, edge-native architecture, vision reasoning for complex rule pathways, and MCP tool support. These components are fully documented for teams who want to deploy, inspect, or extend the system.
    </p>
  </div>
  <div class="builder-actions">
    <a class="home-link-button" href="/features/pipeline.html">View Features</a>
    <a class="home-link-button" href="/api/reference.html">API Reference</a>
    <a class="home-link-button" href="https://github.com/SilverMind-Project/cognitive-companion">GitHub</a>
  </div>
</section>
