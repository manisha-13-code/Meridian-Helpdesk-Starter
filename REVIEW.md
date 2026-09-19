# Code Review — Meridian Helpdesk

## Ranking (most to least important)

1. Cross-tenant broken access control on ticket routes (view / claim / delete)
2. Stored XSS via comment body rendering
3. Unauthenticated account takeover via `/auth/invite/accept`
4. SQL injection via list-sort parameters
5. Internal (staff-only) comments exposed to requesters
6. Pagination off-by-one — first page skips the first 20 tickets
7. List filters/search/sort silently do nothing until the page changes
8. Minor: N+1 comment-count query, assign race condition, open CORS

**Fixed (top 5):** #1, #2, #3, #4, #5
**Documented but not fixed:** #6, #7, #8

---

## 1. Cross-tenant broken access control (IDOR)

**Where:** `server/src/services/ticketService.js:57-67` (`getTicketById`), used by `server/src/routes/tickets.js:31-41` (GET), `:62-73` (PATCH assign), `:75-84` (DELETE)

**What is wrong:** `getTicketById` looks up a ticket by `id` alone with no `org_id` check, and `DELETE /:id` has no `requireRole('admin')` guard.

**Why it matters here:** The app serves two real customers, Northwind and Cobalt. Any logged-in user — even a `requester` — can view, claim, or permanently delete another company's ticket just by changing the id in the URL or an API call. Confirmed reproducible by requesting another org's ticket id directly while logged in as the other org.

**How I would fix it:** Pass `req.user.orgId` into the lookup (e.g. `getTicketByIdForOrg(id, orgId)`) and return 404 on mismatch, the same way `comments.js:16` already does. Add `requireRole('admin')` to the delete route.

**Severity:** Critical

---

## 2. Stored XSS via comment rendering

**Where:** `client/src/features/tickets/TicketDetail.jsx:65`

**What is wrong:** Comment bodies are rendered with `dangerouslySetInnerHTML={{ __html: c.body }}`, and the server never sanitizes or escapes comment text on input or output.

**Why it matters here:** Any user who can post a comment — including an external requester — can inject a script payload that runs in the browser of every agent/admin who opens that ticket. Since the auth token lives in `localStorage`, this is a direct path to session theft.

**How I would fix it:** Render `{c.body}` as plain text (React escapes by default) instead of injecting HTML, unless rich text is a genuine requirement — in which case sanitize server-side with an allowlist library before storage.

**Severity:** Critical

---

## 3. Unauthenticated account takeover via `/auth/invite/accept`

**Where:** `server/src/routes/auth.js:42-54`

**What is wrong:** The endpoint accepts a raw `userId` and `password` in the body with no auth check and no invite-token verification, and stores the password as-is instead of hashing it with bcrypt.

**Why it matters here:** Anyone who knows or guesses a sequential user id can set that account's password and log in as them, including as an admin. The unhashed write would also break that user's future logins, since login compares against a bcrypt hash.

**How I would fix it:** Ideally, require a signed, single-use invite token issued at invite time and verify it server-side. There is no invite-token column anywhere in the schema, so building that properly means a migration — out of scope for a minimal top-5 fix. The fix actually applied: require `requireAuth` and check `req.user.id` matches the target `userId` (so only someone who already holds a valid token for that account can change its password), and hash the new password with `bcrypt.hash` before storing. This closes the account-takeover and plaintext-password holes; a true zero-account invite flow is documented here as follow-up work rather than shipped.

**Severity:** Critical

---

## 4. SQL injection via list-sort parameters

**Where:** `server/src/services/ticketService.js:38`

**What is wrong:** `ORDER BY t.${sortBy} ${order}` interpolates `req.query.sortBy` / `req.query.order` directly into the SQL string with no allowlist.

**Why it matters here:** The UI dropdown only ever sends 4 safe values, so this never surfaces from clicking around the app — it's only reachable by calling the API directly, which likely makes it the "not observable from the UI" issue called out in the brief. Anyone calling the endpoint directly can inject arbitrary SQL.

**How I would fix it:** Allowlist `sortBy` against a fixed set of column names and `order` against `ASC`/`DESC`; reject anything else with a 400.

**Severity:** High

---

## 5. Internal comments visible to requesters

**Where:** `server/src/services/ticketService.js:69-78` (`listComments`), `client/src/features/tickets/TicketDetail.jsx:62`

**What is wrong:** `listComments` returns `is_internal` comments to every caller regardless of role; the client only adds a CSS class to them instead of filtering them out.

**Why it matters here:** Internal notes are meant for staff only. A `requester` viewing their own ticket can currently read agent-only commentary about themselves or their company.

**How I would fix it:** Filter out `is_internal` comments server-side based on `req.user.role` before the list is returned, rather than relying on client-side styling.

**Severity:** High

---

## 6. Pagination off-by-one (documented, not fixed)

**Where:** `server/src/services/ticketService.js:29`

**What is wrong:** `offset = page * PAGE_SIZE` should be `(page - 1) * PAGE_SIZE`; with `page` starting at 1, "page 1" currently skips the first 20 tickets.

**Why it matters here:** Any org with more than 20 tickets never sees its oldest tickets on the default first page — a visible correctness bug, not a security one.

**How I would fix it:** Change the offset calculation to `(page - 1) * PAGE_SIZE`.

**Severity:** Medium

---

## 7. Filters/search/sort don't trigger a refetch (documented, not fixed)

**Where:** `client/src/features/tickets/TicketList.jsx:21-31`

**What is wrong:** The `useEffect` dependency array is `[page]` only, so changing search, status, priority, or sort updates local state but never re-fetches the list.

**Why it matters here:** From a user's perspective the filters appear completely broken until they happen to change pages.

**How I would fix it:** Add `search`, `status`, `priority`, `sortBy` to the effect's dependency array, and reset `page` to 1 whenever they change.

**Severity:** Medium

---

## 8. Minor findings (documented, not fixed)

**Where:** `ticketService.js:44-47` (comment count), `ticketService.js:89-102` (`assignTicket`), `server/src/index.js:9` (CORS)

**What is wrong:** (a) comment counts are fetched with a separate query per row in a loop instead of one aggregated query; (b) `assignTicket` reads then writes with no transaction, so two agents could both pass the "unassigned" check under concurrent load; (c) `cors()` is enabled with no origin restriction.

**Why it matters here:** (a) is a performance cost that grows with ticket count, not a correctness bug. (b) is a narrow race window, unlikely but possible under real concurrent use. (c) is low risk here since auth uses a Bearer header rather than cookies, but is worth tightening before production.

**How I would fix it:** (a) aggregate comment counts in the main query with a `GROUP BY`/subquery; (b) wrap the check-and-update in a transaction or a single atomic `UPDATE ... WHERE assignee_id IS NULL`; (c) restrict `cors()` to the known client origin.

**Severity:** Low