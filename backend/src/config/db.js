const { Pool, types } = require('pg');
require('dotenv').config();

// ── Return DATE columns as plain 'YYYY-MM-DD' strings, not JS Date objects.
// Without this, node-postgres converts DATE to a JS Date using local timezone,
// which shifts the date by UTC offset (e.g. IST +5:30 turns 2026-03-26 into
// 2026-03-25T18:30:00.000Z). OID 1082 = DATE type.
types.setTypeParser(1082, (val) => val);   // keep as 'YYYY-MM-DD' string
types.setTypeParser(1114, (val) => val);   // TIMESTAMP without tz → string
types.setTypeParser(1184, (val) => val);   // TIMESTAMPTZ → string (let frontend handle)

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'wingmann_ims',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err);
  process.exit(-1);
});

const query     = (text, params) => pool.query(text, params);
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
