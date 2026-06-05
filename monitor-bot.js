/**
 * Monitor Bot v11 — Lightweight fping-based Monitoring
 * 
 * - fping bulk ICMP with latency (~2s for 700 IPs)
 * - MikroTik API only for queue list (not ping!)
 * - Parallel router processing
 * - Single source of truth: data/client-status.json
 */

const { RouterOSAPI } = require("routeros-api");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

const DB_URL = `file:${path.join(__dirname, "dev.db")}`;
const adapter = new PrismaBetterSqlite3({ url: DB_URL });
const prisma = new PrismaClient({ adapter });

const CHECK_INTERVAL = 30000;
const DATA_DIR = path.join(__dirname, "data");
const STATUS_FILE = path.join(DATA_DIR, "client-status.json");
const LOG_FILE = path.join(DATA_DIR, "status-log.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Helpers ─────────────────────────────────────────────────────
function atomicWrite(file, data) {
  try {
    fs.writeFileSync(file + ".tmp", JSON.stringify(data));
    fs.renameSync(file + ".tmp", file);
  } catch (e) {
    console.error("[Bot] Write:", e.message);
  }
}

function loadJSON(f) {
  try {
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf-8"));
  } catch (e) {
    console.error(`[Bot] Load ${f}:`, e.message);
  }
  return {};
}

// ── Decrypt ─────────────────────────────────────────────────────
const crypto = require("crypto");
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  console.error("[FATAL] AUTH_SECRET not set in .env");
  process.exit(1);
}
const ENC_KEY = crypto.createHash("sha256").update(AUTH_SECRET).digest();

function decrypt(encrypted) {
  if (!encrypted) return "";
  try {
    if (encrypted.includes(":")) {
      const [ivHex, data] = encrypted.split(":");
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv("aes-256-cbc", ENC_KEY, iv);
      return decipher.update(data, "hex", "utf8") + decipher.final("utf8");
    }
    return encrypted;
  } catch {
    return encrypted;
  }
}

// ── Connection Pool ─────────────────────────────────────────────
const connections = new Map();

async function getConnection(device) {
  const existing = connections.get(device.id);
  if (existing && existing.connected) return existing.api;

  const api = new RouterOSAPI({
    host: device.host,
    port: device.port,
    user: device.user,
    password: device.password,
    timeout: 25,
    keepalive: true,
  });
  await api.connect();
  connections.set(device.id, { api, connected: true });
  return api;
}

function closeConn(id) {
  const c = connections.get(id);
  if (c) {
    c.connected = false;
    try { c.api.close(); } catch {}
  }
}

// ── fping: bulk ICMP with latency (~2s for 700 IPs) ────────────
function fpingBulk(ips) {
  if (ips.length === 0) return { alive: new Map(), dead: new Set() };

  // Use unique temp file per call to avoid race condition (parallel routers)
  const tmp = path.join(DATA_DIR, `.fping-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  try {
    fs.writeFileSync(tmp, ips.join("\n"));
    // -t 500: timeout 500ms per host
    // -c 1: send 1 ping per host
    // -f: read from file
    let out = "";
    try {
      out = execSync(`fping -t 500 -c 1 -f ${tmp} 2>/dev/null`, {
        encoding: "utf8",
        timeout: 30000,
      });
    } catch (e) {
      // fping returns exit code 1 when some hosts are unreachable
      // But it still outputs results to stdout
      out = e.stdout || "";
      if (!out) {
        console.error(`[Bot] fping failed for ${ips.length} IPs:`, e.message);
        try { fs.unlinkSync(tmp); } catch {}
        return null;
      }
    }

    // Cleanup temp file
    try { fs.unlinkSync(tmp); } catch {}

    const alive = new Map(); // ip → latency_ms
    out.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Format 1: "10.0.0.1 : [0], 64 bytes, 0.4 ms (0.4 avg, 0% loss)"
      // Format 2: "10.0.0.1 : xmt/rcv/%loss = 1/1/0%, min/avg/max = 0.4/0.4/0.4"
      // Alive if has latency (not "timed out")

      const match1 = trimmed.match(/^(\S+)\s+:.*?,\s*([\d.]+)\s*ms\s*\(/);
      const match2 = trimmed.match(/^(\S+)\s+:.*min\/avg\/max\s*=\s*[\d.]+\/([\d.]+)\//);

      if (match1) {
        // Format 1: has latency
        alive.set(match1[1], parseFloat(match1[2]));
      } else if (match2) {
        // Format 2: has latency
        alive.set(match2[1], parseFloat(match2[2]));
      } else if (trimmed.includes("timed out")) {
        // Dead host — skip
      } else {
        // Try to extract just IP
        const ip = trimmed.split(/\s+/)[0];
        if (ip && ip.match(/^\d+\.\d+\.\d+\.\d+$/)) {
          alive.set(ip, null);
        }
      }
    });

    return { alive, dead: new Set() };
  } catch (e) {
    // fping not installed or other error
    return null;
  }
}

// ── MikroTik ping: fallback (batch, concurrent) ────────────────
async function mikrotikPing(api, ips, concurrency = 50) {
  const alive = new Map(); // ip → latency_ms
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < ips.length; i += concurrency) {
    const batch = ips.slice(i, i + concurrency);
    const promises = batch.map(async (ip) => {
      try {
        const res = await api.write("/ping", [
          "=address=" + ip,
          "=count=1",
        ]);
        const r = res[0];
        const isAlive = !r.status && r.time && r["packet-loss"] === "0";
        let latency = null;
        if (isAlive && r.time) {
          const msMatch = r.time.match(/(\d+)ms/);
          const usMatch = r.time.match(/(\d+)us/);
          latency = msMatch ? parseFloat(msMatch[1]) : 0;
          if (usMatch) latency += parseFloat(usMatch[1]) / 1000;
        }
        if (isAlive) alive.set(ip, latency);
      } catch {
        // ignore ping errors
      }
    });
    await Promise.all(promises);
    // Small delay between batches to reduce router CPU spike
    if (i + concurrency < ips.length) await delay(100);
  }
  return alive;
}

// ── State ───────────────────────────────────────────────────────
let currentStatus = loadJSON(STATUS_FILE);
let statusLog = loadJSON(LOG_FILE);

// ── Router Connection State Tracking ───────────────────────────
const NOTIF_FILE = path.join(DATA_DIR, "router-notifications.json");
const routerConnState = {}; // deviceId → { status, lastNotif, failCount }

function writeNotifications(notifs) {
  try {
    fs.writeFileSync(NOTIF_FILE + ".tmp", JSON.stringify(notifs, null, 2));
    fs.renameSync(NOTIF_FILE + ".tmp", NOTIF_FILE);
  } catch {}
}

function loadNotifications() {
  try {
    if (fs.existsSync(NOTIF_FILE)) return JSON.parse(fs.readFileSync(NOTIF_FILE, "utf-8"));
  } catch {}
  return { pending: [], history: [] };
}

function addRouterNotif(device, type, message) {
  const now = Date.now();
  const state = routerConnState[device.id] || { status: "unknown", lastNotif: 0, failCount: 0 };

  // Debounce: don't send same type of notification within 5 minutes
  if (now - state.lastNotif < 5 * 60 * 1000) return;

  state.lastNotif = now;
  routerConnState[device.id] = state;

  const notifs = loadNotifications();
  notifs.pending.push({
    id: `${device.id}-${type}-${now}`,
    deviceId: device.id,
    deviceName: device.name,
    host: device.host,
    type,
    message,
    timestamp: now,
  });
  // Keep max 50 pending, 200 history
  if (notifs.pending.length > 50) notifs.pending = notifs.pending.slice(-50);
  notifs.history.push({ type, deviceName: device.name, message, timestamp: now });
  if (notifs.history.length > 200) notifs.history = notifs.history.slice(-200);
  writeNotifications(notifs);
  console.log(`[Bot] ⚠️ NOTIF [${type}] ${device.name}: ${message}`);
}

function save() {
  atomicWrite(STATUS_FILE, currentStatus);
  atomicWrite(LOG_FILE, statusLog);
}

function recordChange(key, newStatus, latency, device) {
  const prev = currentStatus[key];
  const entry = {
    status: newStatus,
    latency: latency,
    changedAt: Date.now(),
    deviceId: device.id,
    deviceName: device.name,
  };

  if (prev && prev.status === newStatus) {
    // Update latency even if status unchanged
    currentStatus[key] = { ...prev, latency, lastSeen: Date.now() };
    return false;
  }

  currentStatus[key] = entry;
  if (!statusLog[key]) statusLog[key] = [];
  statusLog[key].push(entry);
  if (statusLog[key].length > 50) statusLog[key] = statusLog[key].slice(-50);
  return true;
}

// ── Process one router ──────────────────────────────────────────
async function processRouter(device) {
  const api = await getConnection(device);
  const queues = await api.write("/queue/simple/print");

  const clientMap = [];
  const allIPs = [];

  for (const q of queues || []) {
    const name = q.name || q.comment || "unknown";
    const key = `${device.id}:${name}`;
    if (q.disabled === "true") {
      recordChange(key, "disabled", null, device);
      continue;
    }

    const ips = [];
    for (const t of (q.target || "").split(",")) {
      const ip = t.trim().split("/")[0].trim();
      if (ip && !ip.endsWith(".0")) {
        ips.push(ip);
        allIPs.push(ip);
      }
    }
    if (ips.length > 0) clientMap.push({ name, key, ips });
  }

  // Ping all IPs using fping (fast, no router CPU load)
  let aliveIPs = fpingBulk(allIPs);
  let usedMikrotik = false;

  if (aliveIPs === null) {
    // fping not available, fall back to MikroTik ping
    console.log(`[Bot] fping not available, using MikroTik ping for ${device.name}`);
    const mikrotikAlive = await mikrotikPing(api, allIPs);
    aliveIPs = { alive: mikrotikAlive, dead: new Set() };
    usedMikrotik = true;
  } else if (aliveIPs.alive.size < allIPs.length * 0.5 && allIPs.length > 0) {
    // fping found less than 50% alive — likely private IPs behind NAT
    // Fall back to MikroTik ping (router can ping its own clients)
    const fpingAlive = aliveIPs.alive.size;
    console.log(`[Bot] fping found only ${fpingAlive}/${allIPs.length} alive, trying MikroTik ping for ${device.name}`);
    const mikrotikAlive = await mikrotikPing(api, allIPs);
    if (mikrotikAlive.size > fpingAlive) {
      // Merge: MikroTik found more — use MikroTik results (includes fping results)
      aliveIPs = { alive: mikrotikAlive, dead: new Set() };
      usedMikrotik = true;
    }
  }

  let changes = 0;
  for (const client of clientMap) {
    // Find latency from any alive IP
    let latency = null;
    let alive = false;
    for (const ip of client.ips) {
      if (aliveIPs.alive.has(ip)) {
        alive = true;
        latency = aliveIPs.alive.get(ip) ?? latency;
        break;
      }
    }
    if (recordChange(client.key, alive ? "up" : "down", latency, device)) {
      changes++;
    }
  }

  // Prune stale entries
  const currentKeys = new Set(clientMap.map((c) => c.key));
  for (const key of Object.keys(currentStatus)) {
    if (key.startsWith(device.id + ":") && !currentKeys.has(key)) {
      delete currentStatus[key];
    }
  }

  return {
    name: device.name,
    total: clientMap.length,
    alive: aliveIPs.alive.size,
    changes,
  };
}

// ── Main cycle (parallel) ───────────────────────────────────────
let running = false;

async function monitorCycle() {
  if (running) return;
  running = true;
  const t = Date.now();

  try {
    const routers = await prisma.router.findMany({
      where: { isActive: true },
    });
    const devices = routers.map((r) => ({
      id: r.id,
      name: r.name,
      host: r.host,
      port: r.port,
      user: r.user,
      password: decrypt(r.password),
      timeout: r.timeout || 20,
    }));

    // Process all routers in parallel
    const results = await Promise.allSettled(
      devices.map((d) =>
        processRouter(d)
          .then((result) => {
            // Connection succeeded — check if was previously failing
            const state = routerConnState[d.id];
            if (state && state.status === "error") {
              state.status = "connected";
              state.failCount = 0;
              addRouterNotif(d, "recovered", `Router ${d.name} berhasil terhubung kembali`);
            } else {
              routerConnState[d.id] = { status: "connected", lastNotif: state?.lastNotif || 0, failCount: 0 };
            }
            return result;
          })
          .catch((err) => {
            console.error(`[Bot] ${d.name}:`, err.message);
            closeConn(d.id);

            // Track failure and notify
            const state = routerConnState[d.id] || { status: "unknown", lastNotif: 0, failCount: 0 };
            state.failCount = (state.failCount || 0) + 1;
            routerConnState[d.id] = state;

            // Notify on first failure or after 10 consecutive failures
            if (state.status !== "error") {
              state.status = "error";
              addRouterNotif(d, "connection_failed", `Gagal terhubung ke router ${d.name} (${d.host}:${d.port}). Error: ${err.message}`);
            } else if (state.failCount % 10 === 0) {
              addRouterNotif(d, "still_failing", `Router ${d.name} masih gagal terhubung (${state.failCount} percobaan berturut-turut)`);
            }
            return null;
          })
      )
    );

    save();

    const elapsed = ((Date.now() - t) / 1000).toFixed(1);
    const summary = results
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter(Boolean)
      .map((r) => `${r.alive}/${r.total}`)
      .join(", ");

    const totalChanges = results
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter(Boolean)
      .reduce((s, r) => s + r.changes, 0);

    if (totalChanges > 0) {
      console.log(`[${elapsed}s] ${totalChanges} changes — ${summary}`);
    } else {
      // Log even if no changes (for monitoring)
      if (Math.random() < 0.1) {
        // ~10% of cycles
        console.log(`[${elapsed}s] no changes — ${summary}`);
      }
    }
  } catch (err) {
    console.error("[Bot] Cycle:", err.message);
  }

  running = false;
}

// ── Start ───────────────────────────────────────────────────────
console.log("[Bot] Monitor v11 starting (fping + MikroTik fallback)");
console.log(`[Bot] Interval: ${CHECK_INTERVAL / 1000}s`);

// Check fping availability
try {
  execSync("fping -v", { encoding: "utf8", timeout: 5000 });
  console.log("[Bot] fping: AVAILABLE ✓");
} catch {
  console.log("[Bot] fping: NOT AVAILABLE (will use MikroTik ping)");
}

// ─── Transient error detection ─────────────────────────────────
const TRANSIENT_ERRORS = [
  "SOCKTMOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "RosException",
  "Timed out",
  "Connection reset",
  "Connection closed",
  "socket hang up",
];

function isTransientError(err) {
  const msg = err?.message || String(err);
  const code = err?.code || err?.errno || "";
  return TRANSIENT_ERRORS.some(
    (e) => msg.includes(e) || code === e
  );
}

process.on("uncaughtException", (err) => {
  if (isTransientError(err)) {
    console.error("[Bot] Transient (continuing):", err.message);
    return;
  }
  console.error("[Bot] Fatal uncaught:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  const error = err instanceof Error ? err : new Error(String(err));
  if (isTransientError(error)) {
    console.error("[Bot] Transient rejection (continuing):", error.message);
    return;
  }
  console.error("[Bot] Fatal rejection:", error);
  process.exit(1);
});

setTimeout(monitorCycle, 2000);
setInterval(monitorCycle, CHECK_INTERVAL);

process.on("SIGINT", async () => {
  console.log("[Bot] Shutting down...");
  for (const [, c] of connections) {
    try { c.api.close(); } catch {}
  }
  await prisma.$disconnect();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  for (const [, c] of connections) {
    try { c.api.close(); } catch {}
  }
  await prisma.$disconnect();
  process.exit(0);
});
