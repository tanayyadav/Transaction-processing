CREATE TABLE IF NOT EXISTS transactions (
    id               SERIAL PRIMARY KEY,
    transaction_id   VARCHAR(64) UNIQUE NOT NULL,
    amount           NUMERIC(12,2) NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    validation_note  TEXT,
    processed_note   TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT now(),
    updated_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);