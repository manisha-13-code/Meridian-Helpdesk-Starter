import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { getTicketById } from '../services/ticketService.js';

const router = express.Router();

router.post('/:ticketId/comments', requireAuth, async (req, res, next) => {
  try {
    const ticketId = Number(req.params.ticketId);
    const { body, isInternal } = req.body;
    if (!body) return res.status(400).json({ error: 'body is required' });

    const ticket = await getTicketById(ticketId, req.user.orgId);
    if (!ticket) return res.status(404).json({ error: 'Not found' });

    // Stamp the row explicitly so the API response and the DB agree.
    const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const result = await query(
      `INSERT INTO comments (ticket_id, author_id, body, is_internal, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [ticketId, req.user.id, body, isInternal ? 1 : 0, createdAt]
    );

    await query('UPDATE tickets SET updated_at = NOW() WHERE id = ?', [ticketId]);

    res.status(201).json({ id: result.insertId, body, created_at: createdAt });
  } catch (err) {
    next(err);
  }
});

export default router;