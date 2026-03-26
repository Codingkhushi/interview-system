const { pool } = require('../config/db');

// Global setup before tests
beforeAll(async () => {
  // Optional: Run migrations or seed test data if needed
  // For now, we assume the dev database is available or we could use a test DB
});

// Global teardown after all tests
afterAll(async () => {
  await pool.end();
});
