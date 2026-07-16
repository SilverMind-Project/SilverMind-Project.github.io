# Where Cognitive Companion is headed

Cognitive Companion started as an answer to a personal problem: how to help an older relative stay in their own home without either ignoring the risks or putting them under constant surveillance. It has grown into a working system that several services run on, and the direction from here is to make that system something more families and care organizations can actually deploy.

This page is for people thinking about that bigger picture: care partners, health plans, and anyone weighing whether to build on the project or back it.

## The shift the system is built for

More people are growing old, and more of them want to do it at home. At the same time, the people who would care for them, family members and paid caregivers alike, are stretched thin. Institutional care is expensive and often comes sooner than a family wants. The pressure on all sides is toward keeping people independent at home for longer, with enough awareness to make that safe.

Most of the technology aimed at this problem sends a family's private life to a cloud service, or it automates so much that it erodes the very independence it was meant to protect. Cognitive Companion takes a different stance: keep the intelligence in the home, and use it to inform a caregiver rather than to take over.

## Why local-first is the right foundation

Running the recognition, scene understanding, and reasoning on hardware in the home is a design choice with two payoffs.

The first is trust. Families are far more willing to put cameras in a parent's home when the footage stays on a computer they own. Privacy here is structural, built into where the computation happens, which makes it credible in a way that a privacy policy is not.

The second is economics. Local inference means there is no per-frame cloud bill scaling with every home and every camera. For a care organization deploying at scale, that changes the unit economics of always-on monitoring and makes earlier, finer-grained risk signals affordable.

## A vertical AI agent for the home

The systems creating real value with AI agents today go deep on one domain: they own the workflow end to end, act autonomously within clear limits, and prove their worth in outcomes the buyer already measures. Cognitive Companion applies that pattern to senior care. It is a domain agent that perceives the home through cameras and sensors, reasons with local vision and language models, and acts through caregiver-approved workflows, rather than a general assistant with a care skin.

The harder half of deploying agents is governance. Cognitive Companion builds it into the architecture:

- Every autonomous run records an immutable graph snapshot and timeline, so a caregiver or operator can inspect exactly what the agent saw, decided, and did.
- The guided companion follows a strict division of authority: the voice agent proposes, deterministic code decides. Advancement, escalation, and safety are never delegated to the model.
- Caregivers can confirm or dismiss each behavioral signal, and the feedback stays with the record, giving the system ground truth about which alerts earn their interruption.
- The MCP tool surface is authenticated, permissioned, and shared with the internal voice agent, so there is one governed path into household state instead of a side door per integration.

The same properties that make an agent safe around a vulnerable adult, auditability, bounded autonomy, and human review, are what let a care organization put it in a member's home and stand behind it.

## What already works

This is not a concept. As of v0.7.2 the system runs an end-to-end stack across several services, with each major capability shipped and tested:

- Multi-camera tracking with a floor-plane world tracker and Bayesian identity resolution, including cross-camera handoff that holds a person's identity through turns and camera gaps.
- Nine behavioral signals for dementia care: pacing, sundowning, long bathroom visits, nighttime movement, prolonged stillness, unexplained absence, suspected falls, gait slowing, and elevated restlessness, each measured against a person's own history. Fall detection and restlessness are opt-in per deployment.
- A composable rules pipeline with 24 step types and 7 notification channels, driving both caregiver alerts and proactive reminders to the senior.
- A personal knowledge repository with caregiver-curated info cards, memory quizzes, and a voice companion the senior can talk to.
- An MCP server exposing 59 tools, so external AI agents and the built-in voice agent operate the household through one authenticated interface.
- A unified caregiver workspace and live process views over the running pipeline.

Each of these landed behind tests and, for the tracking work, frame-replay proofs. The roadmap records the milestones as they shipped.

## What comes next

The near-term work lowers the barrier to getting value out of the system: pipeline templates so a new deployment does not start from a blank canvas, and an activity timeline that gives caregivers the day's story at a glance. The longer arc is to turn a capable open-source project into something a non-specialist can have deployed and rely on.

See the [roadmap](/roadmap) for the current list, shipped and proposed.

## Open source and a path to a product

Cognitive Companion is released under the AGPL-3.0 license, and it is meant to stay open. The work people can build on stays in the open.

A sustainable project still needs a way to fund the work. The natural shapes for that are the ones open-source infrastructure companies already use: managed and supported deployments for families and care organizations who do not want to run it themselves, and licensing arrangements for organizations that want to build on it commercially. The open core and the supported offering reinforce each other.

## Getting involved

The project lives on GitHub under the [SilverMind Project](https://github.com/SilverMind-Project) organization.

- Developers: start with the [developer guide](/guide/introduction) and the [contribution guide](/development/contributing).
- Families and care partners: start with [Cognitive Companion for families](/families/overview).
- Care organizations and partners interested in deployment or collaboration: open a discussion on the project's GitHub organization to start a conversation.
