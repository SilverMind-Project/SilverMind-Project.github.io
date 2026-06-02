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
        Detect prolonged stillness, unusual room transitions, pacing, sundowning,
        and routine anomalies without sending camera frames to the cloud.
      </p>
    </article>
    <article class="outcome-card">
      <span class="card-number">02</span>
      <h3>Keep identity close</h3>
      <p>
        Store family facts, biography, medication notes, preferences, and routines
        in a personal knowledge repository that can be spoken back naturally.
      </p>
    </article>
    <article class="outcome-card">
      <span class="card-number">03</span>
      <h3>Give caregivers context</h3>
      <p>
        Route calm alerts, daily summaries, and reviewable care signals through
        voice, displays, Telegram, Home Assistant, and webhooks.
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
        Cognitive Companion is for households where care is shared by family members.
        It helps you understand routines, preserve personal history, support natural
        conversation, and stay aware when something deserves attention.
      </p>
      <a href="/guide/introduction.html">Read the family overview</a>
    </article>
    <article id="care-partners" class="audience-panel">
      <div class="audience-label">For care partners</div>
      <h2>A home intelligence layer for value-based care.</h2>
      <p>
        For health plans, senior-care providers, and care organizations, Cognitive Companion
        points toward privacy-preserving aging-in-place infrastructure: earlier risk
        signals, lower caregiver burden, richer longitudinal context, and care that
        can stay closer to the home.
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
      <p>Vision, recognition, language, embeddings, and reasoning can run on your hardware.</p>
    </div>
    <div>
      <h3>Caregiver review</h3>
      <p>Rules and pipelines are configurable so sensitive actions can stay human-in-the-loop.</p>
    </div>
    <div>
      <h3>Open architecture</h3>
      <p>Pipelines, notification channels, context filters, and MCP tools can be extended.</p>
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
      Computer vision, identity resolution, scene understanding, voice interaction,
      configurable graph pipelines, execution inspection, and MCP tools remain fully documented for teams who
      want to deploy, inspect, or extend the system.
    </p>
  </div>
  <div class="builder-actions">
    <a class="home-link-button" href="/features/pipeline.html">View Features</a>
    <a class="home-link-button" href="/api/reference.html">API Reference</a>
    <a class="home-link-button" href="https://github.com/SilverMind-Project/cognitive-companion">GitHub</a>
  </div>
</section>
