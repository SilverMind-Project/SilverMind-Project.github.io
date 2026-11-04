# Where Cognitive Companion is headed

Cognitive Companion began as a way to help an older relative stay at home without ignoring the risks or watching them all day. It is now a working system of several services. The next step is making it something more families and care organizations can deploy.

This page is for care partners, health plans, and anyone deciding whether to build on the project or support it.

## Why aging at home needs this

More people want to grow old at home, and the family members and paid caregivers who look after them are stretched thin. Institutional care is expensive and often comes sooner than a family wants. Staying at home longer needs some way of knowing when something has changed.

Most technology for this either sends a family's private life to a cloud service or automates so much that the person loses the routines that keep them independent. Cognitive Companion keeps the processing in the home and uses it to tell a caregiver what changed.

## Why local-first

Recognition, scene understanding, and reasoning run on hardware in the home. That has two consequences.

**Trust.** Families are more willing to put cameras in a parent's home when the images stay on a computer they own. The privacy comes from where the computation runs, which a policy document cannot promise.

**Cost.** There is no per-frame cloud bill for each home and camera. For a care organization running many homes, the cost of continuous monitoring is the hardware in each home.

## A care agent with clear limits

Cognitive Companion is an agent built for one domain. It perceives the home through cameras and sensors, reasons with local vision and language models, and acts through workflows that caregivers approve.

Putting an agent in the home of a vulnerable adult needs controls, and they are part of the architecture:

- Every autonomous run records an immutable graph snapshot and timeline, so a caregiver or operator can see what the agent saw, decided, and did.
- In the guided companion, the voice agent proposes and deterministic code decides. Advancing a step, escalating, and safety checks never depend on the model.
- Caregivers confirm or dismiss each behavioral signal, and the answer stays with the record. Over time this shows which alerts were worth the interruption.
- The MCP tools are authenticated, permissioned, and shared with the internal voice agent, so every integration reaches household state through the same path.

## What works today

As of v0.7.2 the system runs end to end across several services:

- Multi-camera tracking with a floor-plane world tracker and Bayesian identity resolution. Cross-camera handoff keeps a person's identity through turns and camera gaps.
- <!-- count:wire_signal_kinds -->Ten behavioral signals, each measured against the person's own history: nine for dementia care (pacing, sundowning, long bathroom visits, nighttime movement, prolonged stillness, unexplained absence, suspected falls, gait slowing, and elevated restlessness) and a same-clothes hygiene signal. Fall detection, restlessness, and same-clothes are opt-in per deployment.
- A rules pipeline with <!-- count:step_types -->28 step types and <!-- count:channel_types -->7 notification channels, used for caregiver alerts and reminders to the senior.
- A personal knowledge repository with caregiver-curated info cards, memory quizzes, and a voice companion the senior can talk to.
- An MCP server with <!-- count:mcp_tools -->62 tools, used by external AI agents and the built-in voice agent through one authenticated interface.
- A caregiver workspace and live views of the running pipeline.

Each capability shipped with tests, and the tracking work with frame-replay proofs. The [roadmap](/roadmap) lists when each landed.

## What comes next

Near-term work makes a new deployment useful sooner: pipeline templates, so setup does not start from a blank canvas, and an activity timeline that shows caregivers the day at a glance. Longer term, the goal is a system a non-specialist can have installed and rely on.

See the [roadmap](/roadmap) for what has shipped and what is proposed.

## Open source and a supported product

Cognitive Companion is released under the AGPL-3.0 license and will stay open.

To fund the work, the project follows the usual models for open-source infrastructure: managed, supported deployments for families and care organizations that do not want to run it themselves, and commercial licenses for organizations that want to build on it.

## Get involved

The project is on GitHub under the [SilverMind Project](https://github.com/SilverMind-Project) organization.

- Developers: start with the [developer guide](/guide/introduction) and the [contribution guide](/development/contributing).
- Families and care partners: start with [Cognitive Companion for families](/families/overview).
- Care organizations interested in a deployment or collaboration: open a discussion on the project's GitHub organization.
