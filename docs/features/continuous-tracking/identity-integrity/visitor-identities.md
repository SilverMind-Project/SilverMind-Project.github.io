# Visitor identities

A nurse who comes by twice a week. A handyman who has fixed the sink three times this month. The
cameras see them, but until now they were nobody: just another unlabeled face in a log. This page
explains what the system does about that, and what you can do about it.

## What gets remembered about a stranger

When someone the system does not recognize walks past a camera, it keeps a close-up of their face
and a mathematical summary of what that face looks like (not a name, not a video, just a number
that can be compared to other numbers). It does this the same way it recognizes household members,
just without a name attached yet.

Only faces clear enough for a person to judge are kept this way: a sharp, near-frontal face (a
face quality score of at least 0.7 and a head turned no more than 30 degrees). Blurred, distant, or
sideways faces are ignored, because nobody could say who they are. Each candidate sighting is also
checked against every enrolled resident's gallery (using the same centroid or pose-binned prototype
representation and margin policy as live identification) so a resident's face is not split into a
visitor cluster when another angle already matches them.

If the same face shows up on three different days within a month, the system notices the pattern
and puts it in front of a caregiver for review. A single one-off visit, a delivery driver who never
comes back, is never kept around long enough to matter: anything that has not been named is deleted
automatically after 60 days of not being seen again.

## It is often someone you already know

Many of the "visitors" you see are not visitors at all. A household member seen from far away, at
an angle, or in poor light may not look enough like their enrollment photos to be recognized, and
then shows up here, often split across many groups. In a home with one resident, nearly every group
can be that resident.

For those, choose **Someone enrolled** and pick the person. The groups are marked as their faces
and stop appearing for review. Nothing is added to that person's enrollment, so how the system
recognizes them does not change: adding blurry, angled faces to someone's enrollment would make the
system more likely to mistake other people for them. Look-alike faces seen later join the same
groups quietly instead of starting new ones.

Use **Select several** to mark or dismiss many groups at once. Each choice says what it will change
before you confirm it.

## Naming someone

When a caregiver recognizes a recurring face of someone new ("that's Nurse Priya"), they can name
it from the Visitors screen with **Someone new**. If the name matches someone already in the
household, the screen says so and offers to mark the faces as theirs instead, because naming would
create a second identity for the same person. Naming does two things at once:

- it turns the pattern into a real household member, the same kind of entry a spouse or adult
  child has, and builds their pose-binned face prototypes in the same step;
- it lets the system recognize that person on future visits and track their presence like anyone
  else in the house.

Nobody is named automatically. A recurring visitor stays anonymous, sitting in the review list,
until a caregiver makes that call by hand.

## Dismissing someone

If a pattern is not worth naming, a caregiver can dismiss it. Dismissing does not delete the
history right away: it just takes the entry out of the review list so it stops asking for a
decision. If that same face keeps showing up, it will not resurface for review a second time, so
the same person is not asked about over and over. A dismissed or marked group remembers what it was
reviewed as and does not widen to take in faces nobody reviewed, and its individual sightings are
still deleted after 60 days.

## Turning it off

Recognizing recurring visitors is on by default, but it can be turned off entirely by an
administrator. Turning it off does not erase anyone already reviewed; it only stops the system from
noticing new patterns going forward.

## What this is not

This feature never runs on its own initiative. It does not name anyone, alert anyone, or change how
the household is tracked until a caregiver reviews a pattern and makes a decision. A face that is
never named never becomes part of anyone's history.
