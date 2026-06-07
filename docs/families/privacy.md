# Privacy and trust

Putting cameras in a parent's home is a serious thing to ask of a family. Cognitive Companion is built so that, by default, what happens in the home stays in the home. This page is plain about where data lives, the few cases where something leaves the network, and who can see any of it.

## The home is the default

The thinking that makes the system work, recognizing people, reading a scene, and deciding whether something is worth an alert, runs on a computer in the home. Camera images are kept in storage on your own local network. Nothing is streamed to an outside company for processing, and there is no cloud account holding a feed of your relative's day.

The cameras and the wall display talk to that home computer directly over your own network, with no relay in between. If your internet goes down, the core of the system keeps running.

## What does leave the home, and only if you turn it on

A few features reach outside the network on purpose, and each is something you choose to enable:

| Feature | What leaves | Why |
| --- | --- | --- |
| Telegram alerts | The alert text, and an image if you include one | So a caregiver gets notified on their phone |
| Voice companion | The senior's spoken audio, while a conversation is active | The natural-conversation voice uses Google's Gemini Live service |
| Outbound webhooks | Whatever you configure to send | To connect the system to other tools you run |

If none of these are set up, the home stays self-contained. Turning the voice companion on is the one case where audio goes to an outside service during a conversation, and it is worth deciding on deliberately. The cameras, the scene understanding, and the routine-change detection do not depend on it.

## A person is always in the loop

The system is designed to surface things and wait for a person to decide. Sensitive steps stay with a human. A caregiver sets up the people the system knows, curates the facts the companion can talk about, and chooses which alerts go to whom. The senior keeps their own routines, because the system reminds and leaves the choice to them.

## Who can see what

Access runs on keys with specific permissions, so a caregiver, an admin, and a connected device each see only what their role allows. There is no public dashboard and no shared cloud login: someone has to be granted access on your own system to see anything.

## Honest about the limits

A few things are worth saying plainly:

- This is software that supports a family. It does not diagnose any condition and is not a medical device.
- It will not call emergency services on its own. It can notify the people you choose, and it can hand off to other systems you connect, but dispatching help is a decision for a person.
- Cameras do not cover every room, and they should not. Gaps in coverage are normal and expected.

## Next steps

- See what actually reaches a caregiver in [what caregivers see](/families/what-you-see).
- Check the practical requirements in [is this right for us?](/families/is-this-right-for-us).
