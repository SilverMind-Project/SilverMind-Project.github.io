# Privacy and trust

By default, what happens in the home stays in the home. This page covers where data lives, the few features that send something out, and who can see it.

## The home is the default

Recognizing people, reading a scene, and deciding whether something deserves an alert all run on a computer in the home. Camera images are stored on your local network. Nothing is streamed to an outside company, and no cloud account holds a feed of your relative's day.

The cameras and the wall display talk to that home computer directly over your own network, with no relay in between. If your internet goes down, the core of the system keeps running.

When you calibrate face recognition for your cameras, the system keeps a sample of face crops from the home's cameras for an admin to label. They are stored on the home computer like every other image, never sent anywhere, and any that are not labeled are deleted after 30 days. Calibration is off unless you turn it on.

Body-appearance samples kept for camera tracking stay on the home computer too. Automatically verified body samples expire after 14 days, unreviewed body samples after 30 days, and caregiver-verified samples after 90 days, deleting their images and vectors while keeping only a non-image audit record.

## What does leave the home, and only if you turn it on

Three features send data out, and each is off until you turn it on:

| Feature | What leaves | Why |
| --- | --- | --- |
| Telegram alerts | The alert text, and an image if you include one | So a caregiver gets notified on their phone |
| Voice companion | The senior's spoken audio, while a conversation is active | The natural-conversation voice uses Google's Gemini Live service |
| Outbound webhooks | Whatever you configure to send | To connect the system to other tools you run |

Cameras, scene understanding, and routine-change detection work without it.

## A person is always in the loop

The system points things out and waits for a person to decide. A caregiver sets up the people it knows, chooses the facts the companion can talk about, and decides which alerts go to whom. The senior keeps their own routines: the system reminds and leaves the choice to them.

## Optional wearables

Wearable tags (such as a BLE wristband, clip, or smartwatch) are completely optional. The home system works without them, and when a family chooses to use one it follows strict local-privacy rules:

- **What is recorded:** the home server records the tag's local radio ID, which room receiver heard it (or its floor coordinates if UWB anchors are installed), an accuracy estimate, and optional battery or worn/unworn status. The radio broadcast itself carries only a static local tag ID, never a person's name.
- **Explicit consent and instant unbind:** binding a tag to a household member requires explicit consent confirmation and records who confirmed it. A caregiver can unbind or deactivate a tag in one click from the Wearables page; unbinding stops future attribution immediately while keeping past history accurate.
- **Unworn tags are ignored:** if a tag is sitting on a nightstand or reports that it is off-wrist or parked, the system does not treat it as moving with the person.
- **Retention:** raw radio fixes are kept only briefly on the local server (at most 72 hours) for troubleshooting and calibration. Derived identity decisions follow the same retention schedule as camera tracking.
- **Stays on the home network:** room receivers, the local broker, and the tag registry run on your home network with no vendor cloud account required.
- **Never drives emergency alerts alone:** a wearable tag supports camera identity recognition; it is never used by itself to trigger an emergency alert.
- **Teaching the cameras is opt-in, reviewed, and revocable:** when a caregiver turns it on, the system can learn what a tag wearer looks like from the cameras while the tag is worn. Body-appearance samples learned this way are marked as wearable-taught and can be reviewed, demoted, or rejected in the review queue. Face crops learned this way are stored only after the tag confirms who it was, stay on the home server, are deleted after 30 days unless a caregiver audits them as correct, and never change face recognition unless a caregiver adds one by hand. If a tag is worn by the wrong person, a caregiver-admin can undo what that period taught in one confirmed click (and the system automatically pauses teaching and undoes recent periods when a swap is detected).

## Who can see what

Access runs on keys with specific permissions, so a caregiver, an admin, and a connected device each see only what their role allows. There is no public dashboard and no shared cloud login: someone has to be granted access on your own system to see anything.

## Limits

- This is software that supports a family. It does not diagnose any condition and is not a medical device.
- It will not call emergency services on its own. It can notify the people you choose, and it can hand off to other systems you connect, but dispatching help is a decision for a person.
- Cameras do not cover every room, and bedrooms and bathrooms should stay uncovered.
- Optional eye-level identification-point cameras are placed only in shared spaces such as hallways or kitchen entrances, never in bedrooms or bathrooms, and obey the same system-side privacy zones (blur, mask, or drop) enforced before any face or body model sees the frame.

## Next steps

- See what reaches a caregiver in [what caregivers see](/families/what-you-see).
- Check the practical requirements in [is this right for us?](/families/is-this-right-for-us).
