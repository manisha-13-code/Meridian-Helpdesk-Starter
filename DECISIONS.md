# Part 2 Decisions — SLA Breach Tracking

The draft spec left several things unstated. Here's what I decided and why, for each.

## 1. What counts as "responded"?
There's no `first_response_at` column anywhere in the schema, so "responded" has to be derived from `comments`. I treat a ticket as responded to once it has a comment from a staff role (`agent` or `admin`) that is **not** marked `is_internal`. A requester's own comment isn't a response to themselves, and an internal-only note is invisible to the customer, so neither should stop the SLA clock.

## 2. Wall-clock hours, not business hours
`slaTargets` in `config.js` are given as flat hours (P1=4, P2=24, P3=72) with no mention of business hours, weekends, or a support calendar anywhere in the data model. I compute breach as raw elapsed wall-clock time against the target. Building a business-hours calendar isn't supported by anything that exists in this codebase, and the brief says not to introduce new architecture for this feature.

## 3. Breach status is a frozen historical fact, not a live toggle
If a ticket is answered late, it stays marked breached forever — even after it's resolved. If it's answered on time, it's never marked breached, no matter what happens to the ticket afterward. Only a ticket that still has **no** qualifying staff response is live-computed against the current time on every read (since there's no first-response event yet to freeze against). This matches how a real support team would want to see it: a late response is a fact about that ticket's history, not something that should quietly disappear once someone finally replies.

## 4. Resolved/closed tickets keep their breach badge
The spec doesn't say to exclude any status, so I kept the badge visible regardless of ticket status. If closing a ticket also hid its breach flag, support could bury an SLA miss just by resolving the ticket — the badge is meant to reflect what actually happened, not the ticket's current state.

## 5. The breached filter composes with existing filters
`breached=true` is implemented as one more condition in the same `WHERE` clause the list endpoint already builds for search/status/priority, using a correlated subquery against `comments` rather than a separate endpoint or in-memory filter. This keeps pagination totals and every other existing filter correct when combined with it.

## Edge case handled explicitly
A ticket with zero comments at all has no first-staff-response, so it falls into the "still unanswered" branch of decision #3 — its breach status is computed live against the current time. A P1 ticket sitting untouched for 5 hours is correctly shown as breached the moment it crosses the 4-hour mark, with no crash and no special-casing needed.