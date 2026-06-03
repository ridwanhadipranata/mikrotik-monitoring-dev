/**
 * Monitor Bot v7 — Pure Ping Based
 *
 * Simple and reliable:
 * 1. Get all client IPs from queues
 * 2. Ping all IPs via Mikrotik router
 * 3. Responds to ping = UP, no response = DOWN
 * 4. Disabled queue = DISABLED
 */

const { RouterOSAPI } = require("routeros-api");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const CHECK_INTERVAL = 30000;  // 30s
const PING_CONCURRENCY = 30;
const DATA_DIR = path.join(__dirname, "data");
const LOG_FILE = path.join(DATA_DIR, "status-log.json");
const STATUS_FILE = path.join(DATA_DIR, "client-status.json");

const DEVICES = [
  { id: "1", name: process.env.MIKROTIK_1_NAME || "Router 1", host: process.env.MIKROTIK_1_HOST || "127.0.0.1", port: parseInt(process.env.MIKROTIK_1_PORT || "8728"), user: process.env.MIKROTIK_1_USER || "admin", password: process.env.MIKROTIK_1_PASS || "", timeout: 10 },
  { id: "2", name: process.env.MIKROTIK_2_NAME || "Router 2", host: process.env.MIKROTIK_2_HOST || "127.0.0.1", port: parseInt(process.env.MIKROTIK_2_PORT || "8728"), user: process.env.MIKROTIK_2_USER || "admin", password: process.env.MIKROTIK_2_PASS || "", timeout: 15 },
  { id: "3", name: process.env.MIKROTIK_3_NAME || "Router 3", host: process.env.MIKROTIK_3_HOST || "127.0.0.1", port: parseInt(process.env.MIKROTIK_3_PORT || "8728"), user: process.env.MIKROTIK_3_USER || "admin", password: process.env.MIKROTIK_3_PASS || "", timeout: 15 },
];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function atomicWrite(file, data) {
  const tmp = file + ".tmp";
  try { fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, file); }
  catch (e) { console.error("[Bot] Write:", e.message); }
}

function loadJSON(f) {
  try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf-8")); }
  catch (e) { console.error(`[Bot] Load ${f}:`, e.message); }
  return {};
}

async function withMikrotik(device, fn) {
  const api = new RouterOSAPI({ host: device.host, port: device.port, user: device.user, password: device.password, timeout: device.timeout });
  try { await api.connect(); const r = await fn(api); api.close(); return r; }
  catch (e) { try { api.close(); } catch {} throw e; }
}

// Ping IPs via Mikrotik router
async function pingIPs(api, ips, concurrency = PING_CONCURRENCY) {
  const alive = new Set();
  for (let i = 0; i < ips.length; i += concurrency) {
    const batch = ips.slice(i, i + concurrency);
    await Promise.all(batch.map(async (ip) => {
      try {
        const res = await api.write("/ping", ["=address=" + ip, "=count=1"]);
        const r = res[0];
        if (!r.status && r.time && r["packet-loss"] === "0") alive.add(ip);
      } catch {}
    }));
    if (i + concurrency < ips.length) await new Promise(r => setTimeout(r, 50));
  }
  return alive;
}

let currentStatus = loadJSON(STATUS_FILE);
let statusLog = loadJSON(LOG_FILE);

function saveAll() {
  atomicWrite(STATUS_FILE, currentStatus);
  atomicWrite(LOG_FILE, statusLog);
}

function recordChange(key, newStatus, device) {
  const prev = currentStatus[key];
  if (prev && prev.status === newStatus) return false;
  const entry = { status: newStatus, changedAt: Date.now(), deviceId: device.id, deviceName: device.name };
  currentStatus[key] = entry;
  if (!statusLog[key]) statusLog[key] = [];
  statusLog[key].push(entry);
  if (statusLog[key].length > 50) statusLog[key] = statusLog[key].slice(-50);
  return true;
}

let running = false;

async function monitorCycle() {
  if (running) return;
  running = true;
  const timeStr = new Date().toISOString().slice(11, 19);

  try {
    for (const device of DEVICES) {
      try {
        await withMikrotik(device, async (api) => {
          const queues = await api.write("/queue/simple/print");

          // Collect all IPs to ping (non-disabled only)
          const clientMap = []; // { name, key, ips }
          const allIPs = [];

          for (const q of (queues || [])) {
            const name = q.name || q.comment || "unknown";
            const key = `${device.id}:${name}`;
            const disabled = q.disabled === "true";

            if (disabled) {
              recordChange(key, "disabled", device);
              continue;
            }

            const ips = [];
            for (const t of (q.target || "").split(",")) {
              const ip = t.trim().split("/")[0].trim();
              if (ip && !ip.endsWith(".0")) { ips.push(ip); allIPs.push(ip); }
            }
            if (ips.length > 0) clientMap.push({ name, key, ips });
          }

          // Ping all IPs at once
          const aliveIPs = await pingIPs(api, allIPs);

          // Update status based on ping results
          let changes = 0;
          for (const client of clientMap) {
            const alive = client.ips.some(ip => aliveIPs.has(ip));
            if (recordChange(client.key, alive ? "up" : "down", device)) changes++;
          }

          // Prune stale keys
          const activeKeys = new Set(clientMap.map(c => c.key));
          for (const key of Object.keys(currentStatus)) {
            if (key.startsWith(`${device.id}:`) && !activeKeys.has(key)) delete currentStatus[key];
          }

          if (changes > 0) {
            saveAll();
            console.log(`[${timeStr}] ${changes} changes on ${device.name} (${aliveIPs.size}/${allIPs.length} alive)`);
          }
        });
      } catch (err) {
        console.error(`[${timeStr}] Error ${device.name}:`, err.message);
      }
    }
  } finally {
    running = false;
  }
}

console.log("[Bot] ═══════════════════════════════════════════════");
console.log("[Bot]  Amanna Monitor Bot v7 — Pure Ping");
console.log("[Bot]  Interval: " + (CHECK_INTERVAL / 1000) + "s");
console.log("[Bot]  Method: Ping via Mikrotik router");
console.log("[Bot] ═══════════════════════════════════════════════");

monitorCycle();
function schedule() { monitorCycle().finally(() => setTimeout(schedule, CHECK_INTERVAL)); }
setTimeout(schedule, CHECK_INTERVAL);

process.on("unhandledRejection", (r) => console.error("[Bot] Unhandled:", r));
process.on("uncaughtException", (e) => { console.error("[Bot] Uncaught:", e); saveAll(); process.exit(1); });
const saveAndExit = () => { console.log("[Bot] Shutdown"); saveAll(); process.exit(0); };
process.on("SIGINT", saveAndExit);
process.on("SIGTERM", saveAndExit);
