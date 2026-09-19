import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { sub: user.id, orgId: user.org_id, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, orgId: user.org_id },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Sets a new password for the CALLING user only.
 *
 * NOTE (see REVIEW.md #3): the original version of this endpoint took a raw
 * userId + password with no auth check at all and stored the password
 * unhashed — anyone could take over any account. There is no invite-token
 * column in the schema (users table has none), so a real single-use
 * signed-invite flow needs a migration, which is out of scope for a
 * minimal top-5 fix. The defensible minimal fix applied here: require the
 * caller to already hold a valid token for the account being changed
 * (requireAuth + req.user.id match), and hash the password with bcrypt
 * before storing it. This closes the account-takeover hole and the
 * plaintext-password bug; a true "brand new joiner with no account yet"
 * invite flow is documented as follow-up work, not shipped here.
 */
router.post('/invite/accept', requireAuth, async (req, res, next) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) {
      return res.status(400).json({ error: 'userId and password are required' });
    }
    if (Number(userId) !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;