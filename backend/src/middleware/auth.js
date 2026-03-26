/**
 * middleware/auth.js
 *
 * Two exports:
 *   authenticate       — verify JWT, attach req.user
 *   requireRole(...roles) — gate a route to specific roles
 *
 * Usage:
 *   router.get('/admin/things', authenticate, requireRole('admin'), handler)
 *   router.post('/slots',       authenticate, requireRole('interviewer', 'admin'), handler)
 */

const { verifyToken } = require('../config/jwt');
const { query }       = require('../config/db');

/**
 * Verify the Bearer token and load the user from DB.
 * Attaches req.user = { id, email, role, is_active, force_pw_change }
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice(7);

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: message });
  }

  // Re-fetch from DB on every request so deactivated accounts are blocked immediately.
  // For high-traffic production you'd cache this; for this scale it's fine.
  try {
    const { rows } = await query(
      `SELECT id, email, role, is_active, force_pw_change
       FROM   users
       WHERE  id = $1`,
      [payload.sub]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: 'Account not found or deactivated' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Gate a route to one or more roles.
 * Must be used AFTER authenticate (needs req.user).
 *
 * @param  {...string} roles  e.g. 'admin', 'interviewer', 'user'
 * @returns Express middleware
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden. Required role: ${roles.join(' or ')}`,
      });
    }
    next();
  };
}

/**
 * Block interviewers who haven't changed their auto-generated password yet.
 * Place after authenticate on any route that should be gated until pw is changed.
 */
function requirePasswordChanged(req, res, next) {
  if (req.user?.force_pw_change) {
    return res.status(403).json({
      error: 'Password change required before accessing this resource',
      code:  'FORCE_PASSWORD_CHANGE',
    });
  }
  next();
}

module.exports = { authenticate, requireRole, requirePasswordChanged };
