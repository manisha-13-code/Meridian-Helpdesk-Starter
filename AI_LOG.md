# AI Usage Log

## Tools used
Claude (Anthropic), used conversationally throughout both parts of the exercise, plus for reading and editing code directly in a sandboxed environment.

## Roughly what I asked
- To help me understand the assignment brief and plan my time given the 48-hour window.
- To review the codebase (`server/` and `client/`) and help me find and rank security/correctness issues for Part 1.
- To implement fixes for the top 5 ranked findings.
- To help me verify each fix actually worked, by walking through manual API tests (PowerShell/curl) and browser tests against the running app.
- To help map the ambiguities in the Part 2 SLA spec and propose decisions for each.
- To implement the SLA breach-tracking feature (server-side computation + filter, client-side badge + toggle) based on those decisions.

## Where the AI was wrong or misleading, and how I caught it
The clearest example: when implementing the Part 1 fix for the cross-tenant access bug (`getTicketById`), the AI changed the function's signature from `getTicketById(id)` to `getTicketById(id, orgId)` and updated the callers in `routes/tickets.js` — but missed a caller in `routes/comments.js` that also used `getTicketById`. That file kept calling it with only one argument, so `orgId` came through as `undefined`, the SQL's `org_id = ?` clause never matched, and posting a comment to any ticket started returning `404 Not Found` — a real regression that broke a previously-working feature.

I caught this by actually testing the app in the browser after applying the fix (trying to post a comment, as instructed in the verification steps), rather than assuming the fix was complete because the code "looked right." Once I reported the 404 with the browser console error, the AI searched the codebase for every remaining call site of the changed function, found the missed one, and fixed it — I re-tested afterward to confirm comments could be posted again before moving on.

This is a direct instance of exactly the risk the brief calls out under "we check the fixes for collateral damage" — a fix for one bug silently introducing another. I did not blindly trust that a fix was correct just because it compiled or the code read cleanly; I re-ran the actual application after every change before considering that part of the task complete.

## Where the AI was NOT used
I did not ask the AI to write the final ranking/severity judgment calls or the Part 2 spec-gap decisions without my review — I read each proposed finding and decision and confirmed or could have pushed back on it before it was implemented, since those are the parts I'll need to personally defend if shortlisted.