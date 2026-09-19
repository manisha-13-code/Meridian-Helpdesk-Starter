import { query } from '../db/pool.js';
import { config } from '../config.js';

const PAGE_SIZE = 20;

// Allowlist for ORDER BY — never interpolate req.query values directly into SQL.
const SORTABLE_COLUMNS = new Set(['created_at', 'updated_at', 'priority', 'status', 'subject']);
const SORT_ORDERS = new Set(['asc', 'desc']);

// Builds a SQL CASE expression mapping priority -> its SLA target in seconds.
// config.slaTargets is a fixed server-side constant (P1/P2/P3), never user input,
// so it's safe to interpolate directly rather than parameterize.
function slaTargetSecondsCase(column) {
  const cases = Object.entries(config.slaTargets)
    .map(([priority, hours]) => `WHEN '${priority}' THEN ${hours * 3600}`)
    .join(' ');
  return `CASE ${column} ${cases} END`;
}

// Shared fragment: for each ticket, find the timestamp of its first
// non-internal comment from a staff user (agent/admin) — that's what
// "responded" means (see DECISIONS.md #1) — then decide breach status
// (see DECISIONS.md #3): if a qualifying response exists, breach is
// frozen at whether that response came within the SLA target; if not,
// breach is live against the current time.
const BREACH_SQL = `
  LEFT JOIN (
    SELECT c.ticket_id, MIN(c.created_at) AS first_response_at
      FROM comments c
      JOIN users cu ON cu.id = c.author_id
     WHERE c.is_internal = 0 AND cu.role IN ('agent', 'admin')
     GROUP BY c.ticket_id
  ) fr ON fr.ticket_id = t.id`;

const BREACH_SELECT = `
    fr.first_response_at,
    CASE
      WHEN fr.first_response_at IS NOT NULL
        THEN TIMESTAMPDIFF(SECOND, t.created_at, fr.first_response_at) > ${slaTargetSecondsCase('t.priority')}
      ELSE TIMESTAMPDIFF(SECOND, t.created_at, NOW()) > ${slaTargetSecondsCase('t.priority')}
    END AS breached`;

/**
 * Paginated ticket list for the current organisation.
 *
 * Supports free-text search on subject, filtering by status and priority,
 * and sorting by any column the UI exposes in its dropdown.
 */
export async function listTickets({ orgId, page = 1, search = '', status, priority, sortBy = 'created_at', order = 'desc', breached }) {
  const where = ['t.org_id = ?'];
  const params = [orgId];

  if (search) {
    where.push('t.subject LIKE ?');
    params.push(`%${search}%`);
  }
  if (status) {
    where.push('t.status = ?');
    params.push(status);
  }
  if (priority) {
    where.push('t.priority = ?');
    params.push(priority);
  }

  const whereSql = where.join(' AND ');
  const offset = page * PAGE_SIZE;

  // sortBy/order come from req.query — only ever interpolate values from the allowlist.
  const safeSortBy = SORTABLE_COLUMNS.has(sortBy) ? sortBy : 'created_at';
  const safeOrder = SORT_ORDERS.has(String(order).toLowerCase()) ? order : 'desc';

  // breach status depends on a join, so it's computed in a CTE and filtered
  // in the outer query — this keeps the breached-only filter, pagination,
  // and the total count all consistent with each other (DECISIONS.md #5).
  const breachedFilterSql = breached ? 'WHERE computed.breached = 1' : '';

  const rows = await query(
    `WITH computed AS (
       SELECT t.id, t.subject, t.status, t.priority, t.created_at, t.updated_at,
              t.assignee_id, u.name AS assignee_name, r.name AS requester_name,${BREACH_SELECT}
         FROM tickets t
         LEFT JOIN users u ON u.id = t.assignee_id
         JOIN users r ON r.id = t.requester_id${BREACH_SQL}
        WHERE ${whereSql}
     )
     SELECT * FROM computed
     ${breachedFilterSql}
     ORDER BY ${safeSortBy} ${safeOrder}
     LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, offset]
  );

  // Attach the comment count each row needs for the list badge.
  for (const row of rows) {
    const [{ c }] = await query('SELECT COUNT(*) AS c FROM comments WHERE ticket_id = ?', [row.id]);
    row.comment_count = c;
    row.breached = !!row.breached;
  }

  const [{ total }] = await query(
    `WITH computed AS (
       SELECT t.id,${BREACH_SELECT}
         FROM tickets t${BREACH_SQL}
        WHERE ${whereSql}
     )
     SELECT COUNT(*) AS total FROM computed
     ${breachedFilterSql}`,
    params
  );

  return { rows, total, page, pageSize: PAGE_SIZE };
}

// orgId is required so a ticket can never be looked up across tenants.
// Every caller (routes/tickets.js) must pass the requesting user's orgId.
export async function getTicketById(id, orgId) {
  const rows = await query(
    `SELECT t.*, u.name AS assignee_name, r.name AS requester_name, r.email AS requester_email,${BREACH_SELECT}
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assignee_id
       JOIN users r ON r.id = t.requester_id${BREACH_SQL}
      WHERE t.id = ? AND t.org_id = ?`,
    [id, orgId]
  );
  const ticket = rows[0];
  if (!ticket) return null;
  ticket.breached = !!ticket.breached;
  return ticket;
}

// Internal notes are staff-only. requesterRole is the role of the user asking,
// not the comment author — a 'requester' never sees is_internal comments,
// regardless of what the UI does with the flag.
export async function listComments(ticketId, requesterRole) {
  const rows = await query(
    `SELECT c.id, c.body, c.is_internal, c.created_at, u.name AS author_name, u.role AS author_role
       FROM comments c
       JOIN users u ON u.id = c.author_id
      WHERE c.ticket_id = ?
      ORDER BY c.created_at ASC`,
    [ticketId]
  );

  if (requesterRole === 'requester') {
    return rows.filter((c) => !c.is_internal);
  }
  return rows;
}

export async function createTicket({ orgId, subject, body, priority, requesterId }) {
  const result = await query(
    `INSERT INTO tickets (org_id, subject, body, priority, requester_id)
     VALUES (?, ?, ?, ?, ?)`,
    [orgId, subject, body, priority, requesterId]
  );
  return getTicketById(result.insertId, orgId);
}

export async function assignTicket(ticketId, assigneeId, orgId) {
  const ticket = await getTicketById(ticketId, orgId);
  if (!ticket) return null;

  if (ticket.assignee_id) {
    return { conflict: true, ticket };
  }

  // Look up the agent so the response carries a display name for the toast.
  const [agent] = await query('SELECT id, name FROM users WHERE id = ?', [assigneeId]);

  await query('UPDATE tickets SET assignee_id = ?, status = ? WHERE id = ? AND org_id = ?', [assigneeId, 'pending', ticketId, orgId]);
  return { conflict: false, assignedTo: agent, ticket: await getTicketById(ticketId, orgId) };
}

export async function deleteTicket(id, orgId) {
  await query('DELETE FROM tickets WHERE id = ? AND org_id = ?', [id, orgId]);
}