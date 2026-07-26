# Daily Living

Cognitive Companion also watches for the rhythm of an ordinary day: has she eaten, how long
was the TV on, does today's outfit look like yesterday's, does it look like she's about to make
tea. These signals feed two things: a countable record a caregiver can ask about later, and a
small number of gentle, evidence-backed alerts. None of it replaces a caregiver's judgment; it
gives them something to act on with confidence instead of a guess.

## Ask the companion about the day

Once activity detection rules are configured for a household, a caregiver can ask the voice
companion questions like:

- "Has she had her medication today?"
- "How many times did she eat today?"
- "How long did she watch TV this afternoon?"

These answers come from a structured daily activity record, the same kind of record a
caregiver would keep on paper: an entry opens when the activity starts and closes when it
ends, with a room, a time, and a note on how confident the system is. The companion never
guesses a count by skimming its memory of what it saw; it always reads from this record, so
"three times" means three recorded meals, not three vague impressions.

Every record also carries where it came from. A meal or TV session detected from cameras and
sensors is phrased differently from a medication dose confirmed step by step during a guided
routine with the resident: the companion says "she completed the medication routine with me
at 9:05" only when that is what actually happened, and something more hedged, like "she was
near the medicine cabinet, but I can't confirm she took them," when the evidence is weaker. A
false "yes, she took her medication" is a real risk for a dementia resident's care team, so the
companion is built to be honest about how sure it is, not just confident-sounding.

## Hygiene: same clothes, and a missed wash-up

Two things feed into a single hygiene signal for the caregiver:

1. **Appearance comparison.** Each day, the system builds a summary of what she was seen
   wearing, drawn from her clearest camera sightings that day, and compares it to yesterday's
   summary. A day-over-day match that is unusually close is a candidate for "may be wearing the
   same clothes as yesterday."
2. **A wash-up check.** Separately, the system checks whether she spent a plausible amount of
   time in the bathroom in the last day or so, the kind of dwell that suggests a shower or
   wash-up happened.

When both point the same way, an image comparison model looks at her best photo from each of
the two days side by side and confirms whether they genuinely look like the same outfit before
anything reaches the caregiver. Only when the clothes plausibly match *and* there was no
plausible wash-up does the caregiver get a "possible missed hygiene routine" alert, with the
two comparison photos attached as evidence.

**Privacy note.** Attaching the comparison photos to the alert is the default, since seeing the
evidence is part of what makes the alert trustworthy and actionable. A household can turn this
off to send a text-only alert instead, keeping the underlying detection the same.

**Where this stands today.** The day-to-day appearance comparison has been tested against
weeks of historical data to calibrate how close a match needs to be before it is worth a look;
live alerts stay off until that calibration is judged solid enough with real production data.
Until then, this is a built and tested capability, not yet a live one.

## Noticing tea-making, gently

The caregiver mentioned that the resident won't ask for help and that her tea time is
unpredictable, so a fixed reminder schedule does not fit. Instead, the companion watches for
the pattern of getting ready to make tea: lingering in the kitchen, near the kettle. When it
looks likely, the caregiver gets a notification with a snapshot, nothing more.

The companion does not yet start the guided tea routine on its own from this signal. Before
that happens, the caregiver reviews each of these notifications and marks whether it was
actually right (she was making tea) or not, building up a track record. Only once that track
record consistently shows the detector is accurate does the household turn on the next step,
where the companion offers to walk her through the tea routine step by step when it notices the
same pattern. That is a deliberate settings change, not something that turns on by itself, and
it is additionally held back until the guided companion's own safety and escalation systems are
fully in place: a wrong, unprompted conversation with a vulnerable person is a real cost, so
this one earns its way to full autonomy with evidence, not a code change.

## How this stays affordable

All of this analysis runs on the household's own hardware, shared with everything else the
companion does. To keep it responsive, every one of these checks is designed to reuse
information already computed wherever possible (where she is, how long she's been there) before
reaching for a more expensive look, and a heavier "describe what the camera sees" or "ask an AI
model about this image" step only runs when a cheaper check has already made it worth doing.
Camera analysis is also skipped automatically when a scene plainly has not changed since the
last look. The heaviest checks are also capped so only one runs at a time on the shared
hardware, so a burst of activity around the house is handled in order instead of overwhelming
the system.
