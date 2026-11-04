---
layout: home
title: Cognitive Companion
titleTemplate: Agentic AI for aging in place
---

<div class="hx">

<section class="hx-hero">
  <div class="hx-wrap">
    <p class="hx-name">Cognitive Companion</p>
    <h1>Agentic AI for aging in place</h1>
    <p class="hx-lead">AI agents that notice changes in a daily routine and act through workflows caregivers approve, on hardware the family owns.</p>
    <div class="hx-actions">
      <a class="hx-btn hx-btn--brand" href="#demo">Watch demo</a>
      <a class="hx-btn" href="/vision.html">Vision</a>
      <a class="hx-btn" href="https://github.com/SilverMind-Project/cognitive-companion">GitHub</a>
    </div>
  </div>
  <picture class="hx-photo">
  <source srcset="/photos/companion-kitchen-tall.webp" media="(max-width: 719px)" />
  <img src="/photos/companion-kitchen-wide.webp" width="2000" height="1116" loading="lazy" alt="A woman in her kitchen talks to a small tablet on the counter while she makes tea" />
</picture>
</section>

<section id="demo" class="hx-section">
  <div class="hx-wrap hx-split">
    <div>
      <h2>Care from a distance.</h2>
      <p class="hx-sub">Cognitive Companion turns cameras and sensors in the home into short answers a caregiver can use: where someone is, what changed, and when help may be needed.</p>
    </div>
    <HomeVideo />
  </div>
</section>

<section class="hx-section hx-section--flush">
  <div class="hx-wrap hx-head">
    <h2>Fewer check-in calls, earlier warnings.</h2>
  </div>
  <picture class="hx-photo">
  <source srcset="/photos/family-table-tall.webp" media="(max-width: 719px)" />
  <img src="/photos/family-table-wide.webp" width="2000" height="1116" loading="lazy" alt="A grandmother and her granddaughter laugh together over a tablet and a photo album" />
</picture>
  <div class="hx-wrap hx-points">
    <div>
      <h3>Notice meaningful changes</h3>
      <p>A missed routine, a long stillness, pacing, or an unusual move between rooms, measured against the person's own history.</p>
    </div>
    <div>
      <h3>Keep identity close</h3>
      <p>Family facts, medication notes, and preferences live in one place. The voice companion answers from them.</p>
    </div>
    <div>
      <h3>Give caregivers context</h3>
      <p>Alerts and daily summaries over Telegram or a webhook: what happened and where, without video to watch.</p>
    </div>
  </div>
</section>

<div class="hx-wrap">
  <HomeDayTimeline />
</div>

<section class="hx-ink">
  <div class="hx-wrap">
    <div class="hx-head">
      <h2>Agents that perceive, reason, and act.</h2>
    </div>
    <div class="hx-bento">
      <article class="hx-tile hx-tile--wide">
        <div>
          <h3>Autonomous care workflows</h3>
          <p>Rules run as pipelines of <!-- count:step_types -->28 step types that reason with local vision and language models, branch on conditions, and act through <!-- count:channel_types -->7 notification channels.</p>
        </div>
        <img class="hx-shot" src="/screens/pipeline.webp" width="1600" height="974" loading="lazy" alt="A rule pipeline: a camera step, scene analysis, and a condition that branches to a reminder or a log" />
      </article>
      <article class="hx-tile">
        <div>
          <h3>Guided routines with bounded autonomy</h3>
          <p>A voice agent walks a resident through a routine one step at a time. Plain code decides what happens next.</p>
        </div>
        <img class="hx-shot" src="/screens/guided-session.webp" width="1600" height="904" loading="lazy" alt="A live guided session: the current step, the transcript, and the event log" />
      </article>
      <article class="hx-tile">
        <div>
          <h3>Open to the agent ecosystem</h3>
          <p>A built-in Model Context Protocol server exposes <!-- count:mcp_tools -->61 tools. Claude, custom agents, and the voice companion use the same authenticated interface.</p>
        </div>
        <img class="hx-shot" src="/screens/companion.webp" width="1600" height="1112" loading="lazy" alt="The resident tablet with a spoken conversation about a family visit and medication" />
      </article>
      <article class="hx-tile hx-tile--wide">
        <div>
          <h3>Grounded in physical-world perception</h3>
          <p>Multi-camera tracking and identity resolution tell agents who is in which room. Caregivers confirm or dismiss each behavioral signal, and their answer stays with the record.</p>
        </div>
        <img class="hx-shot" src="/screens/signals.webp" width="1600" height="997" loading="lazy" alt="Behavioral signals by kind and room, with a table where caregivers mark each one accurate or not" />
      </article>
    </div>
  </div>
</section>

<section id="runs-in-the-home" class="hx-section">
  <div class="hx-wrap">
    <div class="hx-head">
      <h2>Runs in the home.</h2>
      <p class="hx-sub">Vision, language, embeddings, and reasoning run on a computer in the home. Camera images stay there unless you attach one to an alert. Telegram alerts and the voice companion use outside services.</p>
    </div>
    <div class="hx-pair">
      <picture class="hx-photo hx-photo--card">
  <source srcset="/photos/home-computer-tall.webp" media="(max-width: 719px)" />
  <img src="/photos/home-computer-wide.webp" width="2000" height="1116" loading="lazy" alt="A small black computer on a hallway shelf beside a picture frame and a plant" />
</picture>
      <img class="hx-shot" src="/screens/dashboard.webp" width="1600" height="742" loading="lazy" alt="The system dashboard: every local service and model reporting healthy" />
    </div>
    <div class="hx-points hx-points--four">
      <div>
        <h3>Caregiver review</h3>
        <p>Caregivers decide which actions need their approval.</p>
      </div>
      <div>
        <h3>Open architecture</h3>
        <p>Add your own pipeline steps, notification channels, context filters, and agent tools.</p>
      </div>
      <div>
        <h3>Clinical humility</h3>
        <p>The system supports families and care teams. It does not replace professional judgment.</p>
      </div>
      <div>
        <h3>Screens that suit the senior</h3>
        <p>Voice, a tablet, or an e-ink display on the wall.</p>
      </div>
    </div>
  </div>
</section>

<section class="hx-section hx-section--sunk">
  <div class="hx-wrap hx-split hx-split--routes">
    <picture class="hx-photo hx-photo--card">
  <source srcset="/photos/care-visit-tall.webp" media="(max-width: 719px)" />
  <img src="/photos/care-visit-wide.webp" width="2000" height="1116" loading="lazy" alt="A home care nurse and an older man look at a tablet together in his living room" />
</picture>
    <div class="hx-routes">
      <article id="investors">
        <h3>Local inference, no per-frame bill.</h3>
        <p>For investors. The cost of monitoring a home is the hardware in it.</p>
        <a href="/vision.html">Read the vision</a>
      </article>
      <article id="care-partners">
        <h3>Care infrastructure for the home.</h3>
        <p>For health plans, senior-care providers, and care organizations.</p>
        <a href="/guide/architecture.html">Explore the architecture</a>
      </article>
      <article id="families">
        <h3>Support independence without losing touch.</h3>
        <p>For households that share care.</p>
        <a href="/families/overview.html">Read the family overview</a>
      </article>
    </div>
  </div>
</section>

<section class="hx-wrap">
  <div class="home-section builder-section">
    <div class="builder-copy">
      <h2>Read the code.</h2>
      <p>Realtime sensor fusion, Bayesian identity resolution, local inference, vision reasoning inside agent workflows, a <!-- count:mcp_tools -->61-tool MCP server, and a voice agent with function calling.</p>
    </div>
    <div class="builder-actions">
      <a class="home-link-button" href="/features/pipeline.html">View features</a>
      <a class="home-link-button" href="/api/reference.html">API reference</a>
      <a class="home-link-button" href="https://github.com/SilverMind-Project/cognitive-companion">GitHub</a>
    </div>
  </div>
</section>

</div>
