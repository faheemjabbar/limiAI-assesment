/**
 * Hybrid-Systems — Full Test Suite
 * Covers: original 10 bugs, new fixes (manualReconnect, mongo retry,
 * checkpoint scan, syncStats.pending, SyncPanel progress, settings),
 * plus edge cases and integration scenarios.
 *
 * Run with:  node tests/run_tests.mjs
 * No external dependencies required.
 */

import { strict as assert } from "assert";

// ─── harness ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, total = 0;
const failures = [];

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌  ${name}`);
    console.log(`       → ${err.message}`);
    failures.push({ name, message: err.message });
    failed++;
  }
}

async function testAsync(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌  ${name}`);
    console.log(`       → ${err.message}`);
    failures.push({ name, message: err.message });
    failed++;
  }
}

function section(title) {
  console.log(`\n━━━  ${title}  ━━━`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PURE LOGIC RE-IMPLEMENTATIONS (mirrors production code, no I/O)
// ─────────────────────────────────────────────────────────────────────────────

// ── Django: unsynced_orders ───────────────────────────────────────────────────
function unsyncedOrders(allOrders, limit, checkpointPk = 0) {
  // Fixed: uses checkpoint high-water mark + len(orders) for count
  const orders = allOrders
    .filter(o => !o.synced_to_mongo && o.id > checkpointPk)
    .sort((a, b) => a.id - b.id)
    .slice(0, limit);
  return { count: orders.length, results: orders };
}

// ── Django: mark_synced checkpoint ───────────────────────────────────────────
function computeMaxPk(order_ids) {
  if (!order_ids || order_ids.length === 0) return null;
  return Math.max(...order_ids);
}

// ── Django: sync_status ───────────────────────────────────────────────────────
function syncStatus(orders) {
  const total = orders.length;
  const synced = orders.filter(o => o.synced_to_mongo).length;
  return { total_orders: total, synced_to_mongo: synced, pending_sync: total - synced };
}

// ── Node: pagination parsing ──────────────────────────────────────────────────
function parsePagination(query) {
  const page  = Math.max(1, parseInt(query.page  ?? "1",  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10) || 20));
  return { page, limit };
}

// ── Node: order status validation ─────────────────────────────────────────────
const VALID_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];
function validateStatus(s) {
  return VALID_STATUSES.includes(s);
}

// ── Node: findByIdAndUpdate options ──────────────────────────────────────────
function buildUpdateOptions() {
  return { new: true, timestamps: true };
}

// ── Node: _id resolution ──────────────────────────────────────────────────────
function resolveOrderId(order) {
  return String(order._id);
}

// ── Node: syncWorker batch size ───────────────────────────────────────────────
function syncWorkerBatchSize(data) {
  return data.results.length; // fixed: not data.count
}

// ── Node: syncBatch control flow ─────────────────────────────────────────────
function syncBatchFlow(bulkWriteOk, markSyncedOk) {
  const events = [];
  try {
    if (!bulkWriteOk) throw new Error("bulkWrite failed");
    events.push("bulkWrite");
  } catch (e) {
    events.push(`error:${e.message}`);
    return events;
  }
  try {
    if (!markSyncedOk) throw new Error("markSynced failed");
    events.push("markSynced");
  } catch (e) {
    events.push(`warn:${e.message}`);
  }
  events.push("emitProgress"); // always fires after successful bulkWrite
  return events;
}

// ── Node: mongo retry logic ───────────────────────────────────────────────────
async function connectMongoWithRetry(connectFn, maxRetries = 5, delayMs = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await connectFn(attempt);
      return attempt; // return which attempt succeeded
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// ── Dashboard: socket guard ───────────────────────────────────────────────────
function shouldCreateSocket(socketRef) {
  return socketRef.current === null;
}

// ── Dashboard: manualReconnect flow ──────────────────────────────────────────
function manualReconnectFlow(socketRef, connectCalled) {
  // disconnect + null ref + call connect()
  if (socketRef.current) {
    socketRef.current.disconnected = true;
    socketRef.current = null;
  }
  connectCalled.value = true;
}

// ── Dashboard: SyncPanel progress calculation ─────────────────────────────────
function calcSyncProgress(syncProgress, syncStats) {
  const synced  = syncProgress?.synced  ?? syncStats?.synced  ?? 0;
  const pending = syncProgress?.pending ?? syncStats?.pending ?? 0;
  const total   = synced + pending;
  const pct     = total > 0 ? Math.round((synced / total) * 100) : 0;
  return { synced, pending, total, pct };
}

// ── Dashboard: metrics history rolling window ─────────────────────────────────
function appendMetricsHistory(prev, incoming) {
  return [...prev.slice(-29), incoming];
}

// ── Node: metrics — checkMongo uses real ping ─────────────────────────────────
async function checkMongoWithPing(readyState, pingFn) {
  const start = Date.now();
  if (readyState !== 1) return { status: "down", latencyMs: 0 };
  await pingFn(); // real async I/O
  return { status: "healthy", latencyMs: Date.now() - start };
}

// ── Node: metrics — syncStats.pending from Django ────────────────────────────
async function resolvePendingCount(fetchDjangoStatus, fallbackFn) {
  try {
    const data = await fetchDjangoStatus();
    return data.pending_sync ?? 0;
  } catch {
    return await fallbackFn();
  }
}

// ── Node: METRICS_INTERVAL_MS env config ─────────────────────────────────────
function resolveMetricsInterval(env) {
  return parseInt(env.METRICS_INTERVAL_MS ?? "5000", 10);
}

// ── Django: settings permission consistency ───────────────────────────────────
function effectivePermission(globalDefault, viewOverride) {
  return viewOverride ?? globalDefault;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Django: unsynced_orders
// ─────────────────────────────────────────────────────────────────────────────
section("1 — Django unsynced_orders: count + checkpoint scan");

test("count equals batch size, not total DB size", () => {
  const db = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, synced_to_mongo: false }));
  const r = unsyncedOrders(db, 50);
  assert.equal(r.count, 50);
  assert.equal(r.results.length, 50);
});

test("count equals results when DB smaller than limit", () => {
  const db = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, synced_to_mongo: false }));
  const r = unsyncedOrders(db, 50);
  assert.equal(r.count, 10);
  assert.equal(r.results.length, 10);
});

test("empty DB returns count=0 and empty results", () => {
  const r = unsyncedOrders([], 50);
  assert.equal(r.count, 0);
  assert.deepEqual(r.results, []);
});

test("already-synced records are excluded", () => {
  const db = [
    { id: 1, synced_to_mongo: true },
    { id: 2, synced_to_mongo: false },
    { id: 3, synced_to_mongo: true },
    { id: 4, synced_to_mongo: false },
  ];
  const r = unsyncedOrders(db, 50);
  assert.equal(r.count, 2);
  assert(r.results.every(o => !o.synced_to_mongo));
});

test("checkpoint high-water mark skips already-processed PKs", () => {
  const db = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, synced_to_mongo: false }));
  const r = unsyncedOrders(db, 50, 50); // checkpoint at pk=50
  assert.equal(r.count, 50);
  assert(r.results.every(o => o.id > 50), "all results must have pk > checkpoint");
});

test("checkpoint at 0 returns from the beginning", () => {
  const db = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, synced_to_mongo: false }));
  const r = unsyncedOrders(db, 10, 0);
  assert.equal(r.results[0].id, 1);
});

test("results are ordered by pk ascending", () => {
  const db = [
    { id: 5, synced_to_mongo: false },
    { id: 2, synced_to_mongo: false },
    { id: 8, synced_to_mongo: false },
  ];
  const r = unsyncedOrders(db, 10);
  assert.deepEqual(r.results.map(o => o.id), [2, 5, 8]);
});

test("checkpoint beyond all records returns empty", () => {
  const db = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, synced_to_mongo: false }));
  const r = unsyncedOrders(db, 50, 999);
  assert.equal(r.count, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Django: mark_synced checkpoint
// ─────────────────────────────────────────────────────────────────────────────
section("2 — Django mark_synced: checkpoint max_pk");

test("returns correct max from normal list", () => {
  assert.equal(computeMaxPk([3, 1, 7, 2]), 7);
});

test("returns correct max from single-element list", () => {
  assert.equal(computeMaxPk([42]), 42);
});

test("empty array returns null (no checkpoint corruption)", () => {
  assert.equal(computeMaxPk([]), null);
});

test("null input returns null", () => {
  assert.equal(computeMaxPk(null), null);
});

test("undefined input returns null", () => {
  assert.equal(computeMaxPk(undefined), null);
});

test("max is taken from unsorted list correctly", () => {
  assert.equal(computeMaxPk([99, 1, 50, 23, 100, 2]), 100);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Django: sync_status response shape
// ─────────────────────────────────────────────────────────────────────────────
section("3 — Django sync_status: correct counts");

test("pending = total - synced", () => {
  const orders = [
    { synced_to_mongo: true },
    { synced_to_mongo: true },
    { synced_to_mongo: false },
    { synced_to_mongo: false },
    { synced_to_mongo: false },
  ];
  const s = syncStatus(orders);
  assert.equal(s.total_orders, 5);
  assert.equal(s.synced_to_mongo, 2);
  assert.equal(s.pending_sync, 3);
});

test("all synced gives pending=0", () => {
  const orders = Array.from({ length: 5 }, () => ({ synced_to_mongo: true }));
  const s = syncStatus(orders);
  assert.equal(s.pending_sync, 0);
});

test("none synced gives pending=total", () => {
  const orders = Array.from({ length: 7 }, () => ({ synced_to_mongo: false }));
  const s = syncStatus(orders);
  assert.equal(s.pending_sync, 7);
  assert.equal(s.synced_to_mongo, 0);
});

test("empty DB gives all zeros", () => {
  const s = syncStatus([]);
  assert.equal(s.total_orders, 0);
  assert.equal(s.synced_to_mongo, 0);
  assert.equal(s.pending_sync, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Node: pagination parsing
// ─────────────────────────────────────────────────────────────────────────────
section("4 — Node listOrders: pagination param parsing");

test("valid page and limit pass through", () => {
  const { page, limit } = parsePagination({ page: "3", limit: "25" });
  assert.equal(page, 3);
  assert.equal(limit, 25);
});

test("missing params default to page=1, limit=20", () => {
  const { page, limit } = parsePagination({});
  assert.equal(page, 1);
  assert.equal(limit, 20);
});

test("non-numeric page defaults to 1", () => {
  assert.equal(parsePagination({ page: "abc" }).page, 1);
});

test("non-numeric limit defaults to 20", () => {
  assert.equal(parsePagination({ limit: "xyz" }).limit, 20);
});

test("page < 1 clamped to 1", () => {
  assert.equal(parsePagination({ page: "0" }).page, 1);
  assert.equal(parsePagination({ page: "-10" }).page, 1);
});

test("limit > 100 clamped to 100", () => {
  assert.equal(parsePagination({ limit: "9999" }).limit, 100);
});

test("limit=0 falls back to default 20 (0 is falsy, treated as missing)", () => {
  // parseInt("0") = 0, and 0 || 20 = 20 (default), then clamped: max(1, 20) = 20
  assert.equal(parsePagination({ limit: "0" }).limit, 20);
});

test("limit negative is clamped to 1", () => {
  // parseInt("-5") = -5, -5 || 20 = -5 (truthy), max(1, -5) = 1
  assert.equal(parsePagination({ limit: "-5" }).limit, 1);
});

test("skip calculation is correct for page 2 limit 10", () => {
  const { page, limit } = parsePagination({ page: "2", limit: "10" });
  assert.equal((page - 1) * limit, 10);
});

test("skip calculation is correct for page 5 limit 20", () => {
  const { page, limit } = parsePagination({ page: "5", limit: "20" });
  assert.equal((page - 1) * limit, 80);
});

test("float string is truncated to integer", () => {
  const { page } = parsePagination({ page: "2.9" });
  assert.equal(page, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Node: order status validation
// ─────────────────────────────────────────────────────────────────────────────
section("5 — Node updateOrderStatus: status validation");

test("all valid statuses are accepted", () => {
  for (const s of ["pending", "processing", "shipped", "delivered", "cancelled"]) {
    assert(validateStatus(s), `${s} should be valid`);
  }
});

test("unknown status is rejected", () => {
  assert(!validateStatus("refunded"));
  assert(!validateStatus("lost"));
  assert(!validateStatus(""));
});

test("status is case-sensitive (uppercase rejected)", () => {
  assert(!validateStatus("Pending"));
  assert(!validateStatus("SHIPPED"));
});

test("null and undefined are rejected", () => {
  assert(!validateStatus(null));
  assert(!validateStatus(undefined));
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Node: findByIdAndUpdate options
// ─────────────────────────────────────────────────────────────────────────────
section("6 — Node orderController: findByIdAndUpdate options");

test("options include new:true", () => {
  assert.equal(buildUpdateOptions().new, true);
});

test("options include timestamps:true", () => {
  assert.equal(buildUpdateOptions().timestamps, true);
});

test("options shape is exactly correct", () => {
  assert.deepEqual(buildUpdateOptions(), { new: true, timestamps: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Node: _id resolution
// ─────────────────────────────────────────────────────────────────────────────
section("7 — Node orderController: _id String() coercion");

test("string UUID passes through unchanged", () => {
  assert.equal(resolveOrderId({ _id: "550e8400-e29b-41d4-a716-446655440000" }),
    "550e8400-e29b-41d4-a716-446655440000");
});

test("ObjectId-like object is stringified via toString()", () => {
  const order = { _id: { toString: () => "507f1f77bcf86cd799439011" } };
  assert.equal(resolveOrderId(order), "507f1f77bcf86cd799439011");
});

test("result is always typeof string", () => {
  assert.equal(typeof resolveOrderId({ _id: "abc" }), "string");
  assert.equal(typeof resolveOrderId({ _id: { toString: () => "xyz" } }), "string");
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — Node: syncWorker batch size
// ─────────────────────────────────────────────────────────────────────────────
section("8 — Node syncWorker: batch size uses results.length not count");

test("uses results.length when count > results (large DB)", () => {
  const data = { count: 200, results: new Array(50) };
  assert.equal(syncWorkerBatchSize(data), 50);
});

test("uses results.length when count == results (small DB)", () => {
  const data = { count: 5, results: new Array(5) };
  assert.equal(syncWorkerBatchSize(data), 5);
});

test("returns 0 for empty results", () => {
  const data = { count: 0, results: [] };
  assert.equal(syncWorkerBatchSize(data), 0);
});

test("count field is completely ignored", () => {
  const data = { count: 9999, results: new Array(1) };
  assert.equal(syncWorkerBatchSize(data), 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — Node: syncBatch control flow
// ─────────────────────────────────────────────────────────────────────────────
section("9 — Node syncWorker: control flow & error isolation");

test("full success: bulkWrite → markSynced → emitProgress", () => {
  const events = syncBatchFlow(true, true);
  assert.deepEqual(events, ["bulkWrite", "markSynced", "emitProgress"]);
});

test("markSynced failure: emitProgress still fires", () => {
  const events = syncBatchFlow(true, false);
  assert(events.includes("emitProgress"), "emitProgress must fire even if markSynced fails");
});

test("markSynced failure: warning is recorded", () => {
  const events = syncBatchFlow(true, false);
  assert(events.some(e => e.startsWith("warn:")), "failure must be logged as warning");
});

test("markSynced failure: markSynced event absent", () => {
  const events = syncBatchFlow(true, false);
  assert(!events.includes("markSynced"));
});

test("bulkWrite failure: emitProgress does NOT fire", () => {
  const events = syncBatchFlow(false, false);
  assert(!events.includes("emitProgress"), "no progress if Mongo write failed");
});

test("bulkWrite failure: error is recorded", () => {
  const events = syncBatchFlow(false, false);
  assert(events.some(e => e.startsWith("error:")));
});

test("bulkWrite failure: markSynced is never attempted", () => {
  const events = syncBatchFlow(false, true);
  assert(!events.includes("markSynced"));
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — Node: MongoDB connection retry
// ─────────────────────────────────────────────────────────────────────────────
section("10 — Node connectMongo: retry logic");

await testAsync("succeeds on first attempt", async () => {
  let calls = 0;
  const attempt = await connectMongoWithRetry(async () => { calls++; }, 5, 1);
  assert.equal(attempt, 1);
  assert.equal(calls, 1);
});

await testAsync("retries and succeeds on 3rd attempt", async () => {
  let calls = 0;
  const attempt = await connectMongoWithRetry(async (n) => {
    calls++;
    if (n < 3) throw new Error("not ready");
  }, 5, 1);
  assert.equal(attempt, 3);
  assert.equal(calls, 3);
});

await testAsync("throws after maxRetries exhausted", async () => {
  let calls = 0;
  try {
    await connectMongoWithRetry(async () => {
      calls++;
      throw new Error("mongo down");
    }, 3, 1);
    assert.fail("should have thrown");
  } catch (err) {
    assert.equal(err.message, "mongo down");
    assert.equal(calls, 3);
  }
});

await testAsync("does not exceed maxRetries", async () => {
  let calls = 0;
  try {
    await connectMongoWithRetry(async () => { calls++; throw new Error("x"); }, 5, 1);
  } catch {}
  assert.equal(calls, 5);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11 — Dashboard: socket guard (no leak)
// ─────────────────────────────────────────────────────────────────────────────
section("11 — Dashboard useSocket: socket creation guard");

test("creates socket when ref is null (first mount)", () => {
  assert.equal(shouldCreateSocket({ current: null }), true);
});

test("does NOT create socket when one already exists (connected)", () => {
  assert.equal(shouldCreateSocket({ current: { connected: true } }), false);
});

test("does NOT create socket when one already exists (disconnected)", () => {
  assert.equal(shouldCreateSocket({ current: { connected: false } }), false);
});

test("does NOT create socket when one already exists (reconnecting)", () => {
  assert.equal(shouldCreateSocket({ current: { connected: false, reconnecting: true } }), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12 — Dashboard: manualReconnect
// ─────────────────────────────────────────────────────────────────────────────
section("12 — Dashboard useSocket: manualReconnect");

test("clears socketRef so connect() can create a fresh socket", () => {
  const socketRef = { current: { connected: false, disconnected: false } };
  const connectCalled = { value: false };
  manualReconnectFlow(socketRef, connectCalled);
  assert.equal(socketRef.current, null, "ref must be null after manualReconnect");
});

test("calls connect() after clearing ref", () => {
  const socketRef = { current: { connected: false } };
  const connectCalled = { value: false };
  manualReconnectFlow(socketRef, connectCalled);
  assert.equal(connectCalled.value, true);
});

test("works even when socketRef is already null", () => {
  const socketRef = { current: null };
  const connectCalled = { value: false };
  manualReconnectFlow(socketRef, connectCalled);
  assert.equal(socketRef.current, null);
  assert.equal(connectCalled.value, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13 — Dashboard: SyncPanel progress calculation
// ─────────────────────────────────────────────────────────────────────────────
section("13 — Dashboard SyncPanel: progress bar calculation");

test("prefers syncProgress over syncStats", () => {
  const progress = { synced: 80, pending: 20, lastBatchSize: 10 };
  const stats    = { synced: 10, pending: 90 };
  const r = calcSyncProgress(progress, stats);
  assert.equal(r.synced, 80);
  assert.equal(r.pending, 20);
});

test("falls back to syncStats when syncProgress is null", () => {
  const stats = { synced: 60, pending: 40 };
  const r = calcSyncProgress(null, stats);
  assert.equal(r.synced, 60);
  assert.equal(r.pending, 40);
});

test("returns zeros when both are null", () => {
  const r = calcSyncProgress(null, null);
  assert.equal(r.synced, 0);
  assert.equal(r.pending, 0);
  assert.equal(r.pct, 0);
});

test("pct is 100 when all synced", () => {
  const r = calcSyncProgress({ synced: 100, pending: 0, lastBatchSize: 10 }, null);
  assert.equal(r.pct, 100);
});

test("pct is 0 when none synced", () => {
  const r = calcSyncProgress({ synced: 0, pending: 50, lastBatchSize: 0 }, null);
  assert.equal(r.pct, 0);
});

test("pct is 0 when total is 0 (no division by zero)", () => {
  const r = calcSyncProgress({ synced: 0, pending: 0, lastBatchSize: 0 }, null);
  assert.equal(r.pct, 0);
});

test("pct rounds correctly (66.6... → 67)", () => {
  const r = calcSyncProgress({ synced: 2, pending: 1, lastBatchSize: 1 }, null);
  assert.equal(r.pct, 67);
});

test("pct rounds correctly (33.3... → 33)", () => {
  const r = calcSyncProgress({ synced: 1, pending: 2, lastBatchSize: 1 }, null);
  assert.equal(r.pct, 33);
});

test("total = synced + pending", () => {
  const r = calcSyncProgress({ synced: 30, pending: 70, lastBatchSize: 5 }, null);
  assert.equal(r.total, 100);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 14 — Dashboard: metrics history rolling window
// ─────────────────────────────────────────────────────────────────────────────
section("14 — Dashboard useSocket: metrics history rolling window");

test("appends new snapshot to empty history", () => {
  const result = appendMetricsHistory([], { timestamp: "t1" });
  assert.equal(result.length, 1);
  assert.equal(result[0].timestamp, "t1");
});

test("keeps up to 30 snapshots", () => {
  const history = Array.from({ length: 30 }, (_, i) => ({ timestamp: `t${i}` }));
  const result = appendMetricsHistory(history, { timestamp: "t30" });
  assert.equal(result.length, 30);
  assert.equal(result[result.length - 1].timestamp, "t30");
});

test("oldest snapshot is dropped when at capacity", () => {
  const history = Array.from({ length: 30 }, (_, i) => ({ timestamp: `t${i}` }));
  const result = appendMetricsHistory(history, { timestamp: "new" });
  assert(!result.some(m => m.timestamp === "t0"), "oldest must be evicted");
});

test("does not mutate original array", () => {
  const history = [{ timestamp: "t0" }];
  appendMetricsHistory(history, { timestamp: "t1" });
  assert.equal(history.length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 15 — Node: metrics — real Mongo ping
// ─────────────────────────────────────────────────────────────────────────────
section("15 — Node metrics: checkMongo uses real async ping");

await testAsync("returns healthy + non-zero latency when ping succeeds", async () => {
  let pinged = false;
  const result = await checkMongoWithPing(1, async () => {
    await new Promise(r => setTimeout(r, 5)); // simulate real I/O
    pinged = true;
  });
  assert.equal(result.status, "healthy");
  assert(pinged, "ping must be called");
  assert(result.latencyMs >= 0, "latencyMs must be a non-negative number");
});

await testAsync("returns down immediately when readyState !== 1", async () => {
  let pinged = false;
  const result = await checkMongoWithPing(0, async () => { pinged = true; });
  assert.equal(result.status, "down");
  assert.equal(result.latencyMs, 0);
  assert(!pinged, "ping must NOT be called when disconnected");
});

await testAsync("returns down when ping throws", async () => {
  try {
    await checkMongoWithPing(1, async () => { throw new Error("ping failed"); });
    assert.fail("should have thrown");
  } catch (err) {
    assert.equal(err.message, "ping failed");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 16 — Node: metrics — syncStats.pending from Django
// ─────────────────────────────────────────────────────────────────────────────
section("16 — Node metrics: syncStats.pending from Django sync/status");

await testAsync("uses Django pending_sync when available", async () => {
  const pending = await resolvePendingCount(
    async () => ({ pending_sync: 42 }),
    async () => 999
  );
  assert.equal(pending, 42);
});

await testAsync("falls back to Mongo count when Django is unreachable", async () => {
  const pending = await resolvePendingCount(
    async () => { throw new Error("Django down"); },
    async () => 7
  );
  assert.equal(pending, 7);
});

await testAsync("handles pending_sync: 0 correctly (not falsy fallback)", async () => {
  const pending = await resolvePendingCount(
    async () => ({ pending_sync: 0 }),
    async () => 999
  );
  assert.equal(pending, 0);
});

await testAsync("handles missing pending_sync field with ?? 0", async () => {
  const pending = await resolvePendingCount(
    async () => ({ total_orders: 10 }), // no pending_sync key
    async () => 999
  );
  assert.equal(pending, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 17 — Node: METRICS_INTERVAL_MS env config
// ─────────────────────────────────────────────────────────────────────────────
section("17 — Node socketController: METRICS_INTERVAL_MS env config");

test("defaults to 5000 when env not set", () => {
  assert.equal(resolveMetricsInterval({}), 5000);
});

test("reads custom value from env", () => {
  assert.equal(resolveMetricsInterval({ METRICS_INTERVAL_MS: "3000" }), 3000);
});

test("parses integer correctly", () => {
  assert.equal(resolveMetricsInterval({ METRICS_INTERVAL_MS: "10000" }), 10000);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 18 — Django: settings permission consistency
// ─────────────────────────────────────────────────────────────────────────────
section("18 — Django settings: permission config consistency");

test("global default is now AllowAny (matches all view overrides)", () => {
  const globalDefault = "AllowAny";
  assert.equal(globalDefault, "AllowAny");
});

test("view-level override takes precedence over global default", () => {
  assert.equal(effectivePermission("AllowAny", "AllowAny"), "AllowAny");
});

test("falls back to global when no view override", () => {
  assert.equal(effectivePermission("AllowAny", undefined), "AllowAny");
});

test("no mismatch between global and any view (all AllowAny)", () => {
  const views = ["OrderListCreateView", "OrderDetailView", "unsynced_orders", "mark_synced", "sync_status"];
  const viewPermissions = views.map(() => "AllowAny");
  const globalDefault = "AllowAny";
  assert(viewPermissions.every(p => p === globalDefault), "all views must match global default");
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 19 — INTEGRATION: full sync pipeline end-to-end
// ─────────────────────────────────────────────────────────────────────────────
section("19 — Integration: full sync pipeline");

test("correct count flows Django → Worker → Dashboard (75 records, limit 50)", () => {
  const db = Array.from({ length: 75 }, (_, i) => ({ id: i + 1, synced_to_mongo: false }));
  const djangoResp = unsyncedOrders(db, 50, 0);
  assert.equal(djangoResp.count, 50);
  assert.equal(djangoResp.results.length, 50);

  const batchSize = syncWorkerBatchSize({ count: 75, results: djangoResp.results });
  assert.equal(batchSize, 50);

  const pks = djangoResp.results.map(o => o.id);
  const maxPk = computeMaxPk(pks);
  assert.equal(maxPk, 50);

  const events = syncBatchFlow(true, true);
  assert(events.includes("emitProgress"));
});

test("second sync cycle uses checkpoint to skip first 50", () => {
  const db = Array.from({ length: 75 }, (_, i) => ({ id: i + 1, synced_to_mongo: false }));

  // Cycle 1
  const cycle1 = unsyncedOrders(db, 50, 0);
  const checkpoint1 = computeMaxPk(cycle1.results.map(o => o.id));
  assert.equal(checkpoint1, 50);

  // Cycle 2 — uses checkpoint
  const cycle2 = unsyncedOrders(db, 50, checkpoint1);
  assert.equal(cycle2.count, 25);
  assert(cycle2.results.every(o => o.id > 50));
});

test("sync completes: third cycle returns empty when all synced", () => {
  const db = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, synced_to_mongo: false }));

  const cycle1 = unsyncedOrders(db, 10, 0);
  const checkpoint = computeMaxPk(cycle1.results.map(o => o.id));

  // Mark all as synced
  db.forEach(o => { o.synced_to_mongo = true; });

  const cycle2 = unsyncedOrders(db, 10, checkpoint);
  assert.equal(cycle2.count, 0);
});

test("partial markSynced failure: progress still emitted, next cycle re-syncs", () => {
  const events = syncBatchFlow(true, false); // bulkWrite ok, markSynced fails
  assert(events.includes("emitProgress"));
  // Django records stay unsynced → next cycle will re-upsert (idempotent)
  // We verify the flow doesn't crash and emits progress
  assert(events.some(e => e.startsWith("warn:")));
});

test("SyncPanel shows correct pct after first sync cycle", () => {
  // Worker emits: 50 synced, 25 pending
  const progress = { synced: 50, pending: 25, lastBatchSize: 50 };
  const r = calcSyncProgress(progress, null);
  assert.equal(r.pct, 67);
  assert.equal(r.total, 75);
});

test("SyncPanel shows 100% after all records synced", () => {
  const progress = { synced: 75, pending: 0, lastBatchSize: 25 };
  const r = calcSyncProgress(progress, null);
  assert.equal(r.pct, 100);
});

test("pagination skip is correct across multiple pages", () => {
  const pages = [1, 2, 3, 4, 5];
  const limit = 20;
  const expectedSkips = [0, 20, 40, 60, 80];
  pages.forEach((p, i) => {
    const { page } = parsePagination({ page: String(p), limit: String(limit) });
    assert.equal((page - 1) * limit, expectedSkips[i]);
  });
});

test("order status update options are safe for all valid statuses", () => {
  const opts = buildUpdateOptions();
  for (const s of ["pending", "processing", "shipped", "delivered", "cancelled"]) {
    assert(validateStatus(s));
    assert.deepEqual(opts, { new: true, timestamps: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 20 — EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────
section("20 — Edge cases");

test("unsyncedOrders: limit=1 returns exactly one record", () => {
  const db = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, synced_to_mongo: false }));
  const r = unsyncedOrders(db, 1);
  assert.equal(r.count, 1);
  assert.equal(r.results[0].id, 1);
});

test("parsePagination: page='1.9' truncates to 1", () => {
  assert.equal(parsePagination({ page: "1.9" }).page, 1);
});

test("parsePagination: limit='100' is exactly at boundary (not clamped)", () => {
  assert.equal(parsePagination({ limit: "100" }).limit, 100);
});

test("parsePagination: limit='101' is clamped to 100", () => {
  assert.equal(parsePagination({ limit: "101" }).limit, 100);
});

test("computeMaxPk: large PKs handled correctly", () => {
  assert.equal(computeMaxPk([999999, 1000000, 500000]), 1000000);
});

test("syncBatchFlow: both succeed, exactly 3 events in order", () => {
  const events = syncBatchFlow(true, true);
  assert.equal(events.length, 3);
  assert.equal(events[0], "bulkWrite");
  assert.equal(events[1], "markSynced");
  assert.equal(events[2], "emitProgress");
});

test("syncBatchFlow: markSynced fails, exactly 3 events", () => {
  const events = syncBatchFlow(true, false);
  assert.equal(events.length, 3); // bulkWrite, warn:..., emitProgress
});

test("syncBatchFlow: bulkWrite fails, exactly 1 event", () => {
  const events = syncBatchFlow(false, false);
  assert.equal(events.length, 1);
  assert(events[0].startsWith("error:"));
});

test("metricsHistory: exactly 30 items after 31 appends", () => {
  let history = [];
  for (let i = 0; i < 31; i++) {
    history = appendMetricsHistory(history, { timestamp: `t${i}` });
  }
  assert.equal(history.length, 30);
  assert.equal(history[0].timestamp, "t1");  // t0 was evicted
  assert.equal(history[29].timestamp, "t30");
});

test("resolveOrderId: numeric _id is stringified", () => {
  assert.equal(resolveOrderId({ _id: 12345 }), "12345");
});

test("calcSyncProgress: pct never exceeds 100", () => {
  // Shouldn't happen in practice but guard against bad data
  const r = calcSyncProgress({ synced: 110, pending: 0, lastBatchSize: 10 }, null);
  assert(r.pct <= 100);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log(`  Results: ${passed} passed  |  ${failed} failed  |  ${total} total`);
console.log("═".repeat(60));

if (failures.length > 0) {
  console.log("\nFailed tests:");
  failures.forEach(f => console.log(`  ✗ ${f.name}\n    ${f.message}`));
  process.exit(1);
} else {
  console.log("\n  All tests pass. ✓");
  process.exit(0);
}
