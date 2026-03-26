/**
 * middleware/errorHandler.js
 *
 * Central error handler. Mount LAST in Express after all routes.
 * Maps known error codes to HTTP status and a clean JSON envelope.
 *
 * All route handlers should call next(err) with errors that have:
 *   err.status  - HTTP status code (optional, defaults to 500)
 *   err.code    - machine-readable string for frontend (optional)
 *   err.message - human-readable description
 */

const HTTP_CODES = {
  SLOT_NOT_FOUND:              404,
  SLOT_UNAVAILABLE:            409,
  DUPLICATE_BOOKING:           409,
  CANCELLATION_WINDOW_PASSED:  400,
  TOO_LATE:                    400,
  ALREADY_DECIDED:             409,
  INVALID_OUTCOME:             400,
  INVALID_STATE:               400,
  NOT_FOUND:                   404,
  FORBIDDEN:                   403,
  FORCE_PASSWORD_CHANGE:       403,
  VALIDATION_ERROR:            422,
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status  = err.status || HTTP_CODES[err.code] || 500;
  const code    = err.code   || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  // Don't leak stack traces in production
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[${code}] ${req.method} ${req.path}:`, err.message);
    if (status === 500) console.error(err.stack);
  }

  res.status(status).json({ error: message, code });
}

/**
 * Lightweight request validator.
 * Usage: validate({ body: ['email', 'password'] })(req, res, next)
 *
 * @param {Object} rules  - { body: [], query: [], params: [] }
 */
function validate(rules) {
  return (req, res, next) => {
    const missing = [];

    for (const [source, fields] of Object.entries(rules)) {
      for (const field of fields) {
        const val = req[source]?.[field];
        if (val === undefined || val === null || val === '') {
          missing.push(`${source}.${field}`);
        }
      }
    }

    if (missing.length) {
      const err = new Error(`Missing required fields: ${missing.join(', ')}`);
      err.code  = 'VALIDATION_ERROR';
      return next(err);
    }

    next();
  };
}

module.exports = { errorHandler, validate };
