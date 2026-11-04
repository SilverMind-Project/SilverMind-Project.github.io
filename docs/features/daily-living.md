# Daily living

Cognitive Companion also watches for the rhythm of an ordinary day: has she eaten, how long
was the TV on, does today's outfit look like yesterday's, does it look like she's about to make
tea. These signals feed two things: a countable record a caregiver can ask about later, and a
small number of gentle, evidence-backed alerts. None of it replaces a caregiver's judgment.

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
companion says how sure it is.

## Medication schedules

Caregivers set each person's schedule on the **Medication** tab of their profile: a name, a time, and the days it applies. Times are wall-clock times in `app.timezone`, so 8:00 stays 8:00 across daylight saving.

The daily report compares logged doses with that schedule. Each scheduled dose reads one of these:

| Status | Meaning |
| --- | --- |
| Taken | Confirmed in a guided routine |
| Likely taken | A camera saw it. It counts toward adherence and stays labelled |
| Missed | Nothing was logged by `medication.dose_grace_minutes` after its time (default 60) |
| Upcoming | Not due yet |

A logged dose fills the nearest scheduled dose within `medication.dose_match_window_minutes` (default 240), and fills it once. A routine and a camera logging the same dose cannot hide a missed one.

With no schedule, the report shows no adherence, raises no alert, and leaves medication out of the wellness score.

### Extra doses

Someone with dementia can forget a dose and take it again, so a dose beyond the schedule alerts caregivers within a minute. This check is built in and runs for anyone with a schedule.

| Case | Alert |
| --- | --- |
| A second dose near a scheduled time that was already taken | Extra dose |
| A dose with nothing scheduled near it | Unscheduled dose |
| A camera sighting within `medication.dose_duplicate_window_minutes` of a counted dose (default 30) | None: it is the same dose |

A dose confirmed in a guided routine is an `emergency`. A camera-only sighting is a `warning`. Alerts go to `medication.alert_channels` (Telegram by default) and never to in-home speakers or screens, so they cannot distress the person they are about. They appear in the Alert Center and the daily report, and repeat until acknowledged.

A dose counts as soon as it is seen, so an alert does not wait for the session to close. A dose logged just after midnight is matched to the night before, and a dose from before the schedule was set up never alerts.

Each dose alerts once. Re-checking never repeats it, and a second extra dose raises its own alert, however soon it follows. If no channel delivers, the next check retries, so an outage or a restart cannot lose an alert. An unacknowledged alert repeats 3 times: every 5 minutes for an `emergency`, every 10 for a `warning`. Acknowledge it in the Alert Center to stop it.

| Setting | Default | Purpose |
| --- | --- | --- |
| `medication.dose_grace_minutes` | 60 | How long after its time a dose can arrive before it counts as missed |
| `medication.dose_match_window_minutes` | 240 | How far from a scheduled time a logged dose can be and still fill it |
| `medication.dose_duplicate_window_minutes` | 30 | How close a camera sighting must be to a counted dose to be the same dose |
| `medication.alert_channels` | `telegram` | Where excess-dose alerts go |

**Limits.** The system does not know which medicine a dose was, so an as-needed dose also alerts. Mark it inaccurate to dismiss it. With no schedule there is nothing to compare against, so nothing alerts. Two doses scheduled within the duplicate window of each other can read as one, which reports a missed dose instead of hiding one.

These alerts are `medication_excess` signals, which a person's alert profile cannot switch off: setting a schedule is the opt-in.

A schedule change applies from the dose's next occurrence, and past reports keep the schedule of their day.

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
this one reaches full autonomy only after the evidence supports it.

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
