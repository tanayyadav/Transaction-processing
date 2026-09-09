const express = require('express');
const { Pool } = require('pg');

const PORT = process.env.PORT || 8080;
const JAVA_VALIDATOR_URL = process.env.JAVA_VALIDATOR_URL || 'http://localhost:8081/validate';

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'txdemo',
});

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.send('ok'));

app.post('/transactions', async (req, res) => {
  const { transactionId, amount } = req.body || {};

  if (!transactionId || amount === undefined) {
    return res.status(400).json({ error: 'transactionId and amount are required' });
  }

  try {
    // Authoritative duplicate check: happens at the database level,
    // before the pipeline runs at all.
    const insertResult = await pool.query(
      `INSERT INTO transactions (transaction_id, amount, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (transaction_id) DO NOTHING
       RETURNING transaction_id`,
      [transactionId, amount]
    );

    if (insertResult.rowCount === 0) {
      const existing = await pool.query(
        `SELECT transaction_id, amount, status, validation_note, processed_note, created_at, updated_at
         FROM transactions WHERE transaction_id = $1`,
        [transactionId]
      );
      return res.status(409).json({ error: 'duplicate transaction id', existing: existing.rows[0] });
    }

    const validation = await callJavaValidator(transactionId, amount);

    let status;
    if (!validation.valid) {
      status = 'rejected';
    } else if (validation.processed) {
      status = 'processed';
    } else {
      status = 'processing_failed';
    }

    const updated = await pool.query(
      `UPDATE transactions
       SET status = $1, validation_note = $2, processed_note = $3, updated_at = now()
       WHERE transaction_id = $4
       RETURNING transaction_id, amount, status, validation_note, processed_note, created_at, updated_at`,
      [status, validation.reason || null, validation.note || null, transactionId]
    );

    res.status(201).json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'pipeline failure', detail: err.message });
  }
});

app.get('/transactions/:transactionId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT transaction_id, amount, status, validation_note, processed_note, created_at, updated_at
       FROM transactions WHERE transaction_id = $1`,
      [req.params.transactionId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'transaction not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

app.get('/reports/summary', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total_amount
       FROM transactions GROUP BY status ORDER BY status`
    );
    res.json({ breakdown: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

async function callJavaValidator(transactionId, amount) {
  const response = await fetch(JAVA_VALIDATOR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId, amount }),
  });
  if (!response.ok) {
    throw new Error(`validator responded with ${response.status}`);
  }
  return response.json();
}

app.listen(PORT, () => {
  console.log(`node-api listening on :${PORT}`);
});