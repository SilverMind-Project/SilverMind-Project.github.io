# Privacy and trust

By default, what happens in the home stays in the home. This page covers where data lives, the few features that send something out, and who can see it.

## The home is the default

Recognizing people, reading a scene, and deciding whether something deserves an alert all run on a computer in the home. Camera images are stored on your local network. Nothing is streamed to an outside company, and no cloud account holds a feed of your relative's day.

The cameras and the wall display talk to that home computer directly over your own network, with no relay in between. If your internet goes down, the core of the system keeps running.

When you calibrate face recognition for your cameras, the system keeps a sample of face crops from the home's cameras for an admin to label. They are stored on the home computer like every other image, never sent anywhere, and any that are not labeled are deleted after 30 days. Calibration is off unless you turn it on.

## What does leave the home, and only if you turn it on

Three features send data out, and each is off until you turn it on:

| Feature | What leaves | Why |
| --- | --- | --- |
| Telegram alerts | The alert text, and an image if you include one | So a caregiver gets notified on their phone |
| Voice companion | The senior's spoken audio, while a conversation is active | The natural-conversation voice uses Google's Gemini Live service |
| Outbound webhooks | Whatever you configure to send | To connect the system to other tools you run |

Without them, nothing leaves the home. The voice companion is the one feature that sends audio to an outside service, during a conversation only. Cameras, scene understanding, and routine-change detection work without it.

## A person is always in the loop

The system points things out and waits for a person to decide. A caregiver sets up the people it knows, chooses the facts the companion can talk about, and decides which alerts go to whom. The senior keeps their own routines: the system reminds and leaves the choice to them.

## Who can see what

Access runs on keys with specific permissions, so a caregiver, an admin, and a connected device each see only what their role allows. There is no public dashboard and no shared cloud login: someone has to be granted access on your own system to see anything.

## Limits


- This is software that supports a family. It does not diagnose any condition and is not a medical device.
- It will not call emergency services on its own. It can notify the people you choose, and it can hand off to other systems you connect, but dispatching help is a decision for a person.
- Cameras do not cover every room, and bedrooms and bathrooms should stay uncovered.

## Next steps

- See what reaches a caregiver in [what caregivers see](/families/what-you-see).
- Check the practical requirements in [is this right for us?](/families/is-this-right-for-us).
