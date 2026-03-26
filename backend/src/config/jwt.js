const jwt = require('jsonwebtoken');

const SECRET  = process.env.JWT_SECRET;
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

if (!SECRET && process.env.NODE_ENV !== 'test') {
  throw new Error('JWT_SECRET is not set. Check your .env file.');
}

/**
 * Sign a JWT for a user.
 * Payload is intentionally minimal — only what middleware needs per-request.
 *
 * @param {Object} user  - { id, email, role }
 * @returns {string}
 */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    SECRET,
    { expiresIn: EXPIRES }
  );
}

/**
 * Verify a JWT and return the decoded payload.
 * Throws JsonWebTokenError / TokenExpiredError on failure.
 *
 * @param {string} token
 * @returns {Object}  decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
