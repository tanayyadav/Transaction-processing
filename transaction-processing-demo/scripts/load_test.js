const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const COUNT = parseInt(process.argv[2] || '300', 10);
const CONCURRENCY = parseInt(process.argv[3] || '25', 10);

async function submitOne(i) {
  const transactionId = `LOAD-${Date.now()}-${i}`;
  const amount = Math.round(Math.random() * 5000 * 100) / 100;
  const start = Date.now();
  const res = await fetch(`${BASE_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId, amount }),
  });
  const body = await res.json();
  return { ok: res.status === 201, status: body.status, ms: Date.now() - start };
}

async function runBatch(indices) {
  return Promise.all(indices.map(submitOne));
}

async function main() {
  console.log(`Submitting ${COUNT} transactions, ${CONCURRENCY} at a time...`);
  const results = [];
  const overallStart = Date.now();

  for (let i = 0; i < COUNT; i += CONCURRENCY) {
    const batchIndices = [];
    for (let j = i; j < Math.min(i + CONCURRENCY, COUNT); j++) batchIndices.push(j);
    const batchResults = await runBatch(batchIndices);
    results.push(...batchResults);
  }

  const totalMs = Date.now() - overallStart;
  const succeeded = results.filter(r => r.ok && r.status === 'processed').length;
  const failed = results.length - succeeded;
  const avgLatency = Math.round(results.reduce((sum, r) => sum + r.ms, 0) / results.length);
  const throughput = (results.length / (totalMs / 1000)).toFixed(1);

  console.log('');
  console.log(`Total time:        ${totalMs} ms`);
  console.log(`Transactions:      ${results.length}`);
  console.log(`Processed:         ${succeeded}`);
  console.log(`Failed/rejected:   ${failed}`);
  console.log(`Avg latency:       ${avgLatency} ms per transaction`);
  console.log(`Throughput:        ${throughput} transactions/sec`);
}

main().catch(err => {
  console.error('Load test failed:', err);
  process.exit(1);
});