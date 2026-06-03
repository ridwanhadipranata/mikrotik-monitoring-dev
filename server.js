const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { RouterOSAPI } = require("routeros-api");
require("dotenv").config();

const waGateway = require("./wa-gateway");
const { generateInvoiceText, generateAllUnpaidText } = require("./invoice-text-server");

const app = express();

// ─── Security Middleware ────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : ["http://localhost:3458", "http://localhost:3000"], credentials: true }));
app.use(express.json({ limit: "2mb" }));

// ─── Rate Limiting ─────────────────────────────────────────────
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { error: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." } });
const apiLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 200, message: { error: "Terlalu banyak request. Coba lagi nanti." } });
app.use("/api/auth/login", loginLimiter);
app.use("/api/", apiLimiter);

// ─── Auth Config ────────────────────────────────────────────────
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error("[FATAL] AUTH_SECRET not set in .env"); process.exit(1); }
const BCRYPT_ROUNDS = 12;
function getAuthUsers() { return loadUsers(); }
const AUTH_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Atomic file write helper
function atomicWrite(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function createAuthToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: user.username, role: user.role, name: user.displayName, iat: Date.now(), exp: Date.now() + AUTH_TOKEN_EXPIRY })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function verifyAuthToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expectedSig = crypto.createHmac("sha256", AUTH_SECRET).update(`${header}.${payload}`).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.slice(7);
  const user = verifyAuthToken(token);
  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.user = user;
  next();
}

// Role-based access middleware
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    }
    next();
  };
}

// ─── API: Auth Login ────────────────────────────────────────────
app.post(["/api/auth/login", "/monitoring/api/auth/login"], loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const user = getAuthUsers().find((u) => u.username === username);
  if (!user) return res.status(401).json({ error: "Username atau password salah" });

  // Support both bcrypt and legacy sha256 hashes
  let passwordValid = false;
  if (user.passwordHash.startsWith("$2b$")) {
    passwordValid = await bcrypt.compare(password, user.passwordHash);
  } else {
    // Legacy sha256 — verify then migrate to bcrypt
    const shaHash = crypto.createHash("sha256").update(password).digest("hex");
    passwordValid = shaHash === user.passwordHash;
    if (passwordValid) {
      // Auto-migrate to bcrypt
      const users = loadUsers();
      const idx = users.findIndex(u => u.username === username);
      if (idx !== -1) {
        users[idx].passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        saveUsers(users);
      }
    }
  }
  if (!passwordValid) return res.status(401).json({ error: "Username atau password salah" });

  const token = createAuthToken(user);

  res.json({
    token,
    user: { username: user.username, role: user.role, name: user.displayName },
    expiresIn: AUTH_TOKEN_EXPIRY,
  });
});

// ─── API: Auth Verify ───────────────────────────────────────────
app.get(["/api/auth/verify", "/monitoring/api/auth/verify"], (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.slice(7);
  const user = verifyAuthToken(token);

  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  res.json({ valid: true, user: { username: user.sub, role: user.role, name: user.name } });
});

// ─── API: Auth Logout (client-side, but we can log it) ──────────
app.post(["/api/auth/logout", "/monitoring/api/auth/logout"], (req, res) => {
  res.json({ success: true });
});

// ─── User Management ───────────────────────────────────────────
const USERS_FILE = path.join(__dirname, "data", "users.json");

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch {}
  return [];
}

function saveUsers(users) {
  atomicWrite(USERS_FILE, users);
}

// Initialize users file with defaults if not exists
if (!fs.existsSync(USERS_FILE)) {
  const defaultUsers = [
    { username: "amanna", password: "adminisp", role: "admin", displayName: "Amanna (Admin)" },
    { username: "teknisi", password: "teknisi123", role: "teknisi", displayName: "Teknisi" },
    { username: "pembayaran", password: "bayar123", role: "admin_pembayaran", displayName: "Admin Pembayaran" },
  ];
  const hashed = defaultUsers.map(u => ({
    username: u.username,
    passwordHash: bcrypt.hashSync(u.password, BCRYPT_ROUNDS),
    role: u.role,
    displayName: u.displayName,
    createdAt: new Date().toISOString(),
  }));
  saveUsers(hashed);
  console.log("[Auth] Created default users (CHANGE PASSWORDS IMMEDIATELY)");
}

// GET all users (admin only)
app.get(["/api/users", "/monitoring/api/users"], authMiddleware, requireRole("admin"), (req, res) => {
  const users = loadUsers().map(u => ({
    username: u.username,
    role: u.role,
    displayName: u.displayName,
    createdAt: u.createdAt,
  }));
  res.json(users);
});

// POST create user (admin only)
app.post(["/api/users", "/monitoring/api/users"], authMiddleware, requireRole("admin"), async (req, res) => {
  const { username, password, role, displayName } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: "Username, password, dan role wajib diisi" });
  }
  if (!["admin", "teknisi", "admin_pembayaran"].includes(role)) {
    return res.status(400).json({ error: "Role tidak valid" });
  }
  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: "Username sudah digunakan" });
  }
  users.push({
    username,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role,
    displayName: displayName || username,
    createdAt: new Date().toISOString(),
  });
  saveUsers(users);
  res.json({ success: true, user: { username, role, displayName: displayName || username } });
});

// PUT update user (admin only)
app.put(["/api/users/:username", "/monitoring/api/users/:username"], authMiddleware, requireRole("admin"), async (req, res) => {
  const { username } = req.params;
  const { password, role, displayName } = req.body;
  const users = loadUsers();
  const idx = users.findIndex(u => u.username === username);
  if (idx === -1) return res.status(404).json({ error: "User tidak ditemukan" });
  if (role && !["admin", "teknisi", "admin_pembayaran"].includes(role)) {
    return res.status(400).json({ error: "Role tidak valid" });
  }
  if (password) users[idx].passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  if (role) users[idx].role = role;
  if (displayName) users[idx].displayName = displayName;
  users[idx].updatedAt = new Date().toISOString();
  saveUsers(users);
  res.json({ success: true, user: { username: users[idx].username, role: users[idx].role, displayName: users[idx].displayName } });
});

// DELETE user (admin only)
app.delete(["/api/users/:username", "/monitoring/api/users/:username"], authMiddleware, requireRole("admin"), (req, res) => {
  const { username } = req.params;
  if (username === "amanna") return res.status(400).json({ error: "Tidak bisa menghapus akun utama" });
  let users = loadUsers();
  const idx = users.findIndex(u => u.username === username);
  if (idx === -1) return res.status(404).json({ error: "User tidak ditemukan" });
  users.splice(idx, 1);
  saveUsers(users);
  res.json({ success: true });
});

// ─── Mikrotik Config (Multi-Device) ────────────────────────────
const DEVICES = [
  {
    id: "1",
    name: process.env.MIKROTIK_1_NAME || "Router 1",
    host: process.env.MIKROTIK_1_HOST || "127.0.0.1",
    port: parseInt(process.env.MIKROTIK_1_PORT || "8728"),
    user: process.env.MIKROTIK_1_USER || "admin",
    password: process.env.MIKROTIK_1_PASS || "",
    timeout: 10,
    wanInterface: process.env.MIKROTIK_1_WAN || "",
  },
  {
    id: "2",
    name: process.env.MIKROTIK_2_NAME || "Router 2",
    host: process.env.MIKROTIK_2_HOST || "127.0.0.1",
    port: parseInt(process.env.MIKROTIK_2_PORT || "8728"),
    user: process.env.MIKROTIK_2_USER || "admin",
    password: process.env.MIKROTIK_2_PASS || "",
    timeout: 15,
    wanInterface: process.env.MIKROTIK_2_WAN || "",
  },
  {
    id: "3",
    name: process.env.MIKROTIK_3_NAME || "Router 3",
    host: process.env.MIKROTIK_3_HOST || "127.0.0.1",
    port: parseInt(process.env.MIKROTIK_3_PORT || "8728"),
    user: process.env.MIKROTIK_3_USER || "admin",
    password: process.env.MIKROTIK_3_PASS || "",
    timeout: 15,
    wanInterface: process.env.MIKROTIK_3_WAN || "",
  },
];

// ─── MRTG Data Collector ────────────────────────────────────────
const MRTG_DIR = path.join(__dirname, "mrtg-data");
if (!fs.existsSync(MRTG_DIR)) fs.mkdirSync(MRTG_DIR, { recursive: true });

// In-memory store for real-time (5-second samples, last 5 min = 60 points)
const mrtgRealtime = {};
// Persistent intervals: 1min (1440 pts = 24h), 10min (1008 pts = 7d), 1h (8760 pts = 1y), 1d (730 pts = 2y)
const mrtgIntervals = { "1min": [], "10min": [], "1h": [], "1d": [] };

function mrtgFilePath(deviceId, interval) {
  return path.join(MRTG_DIR, `device-${deviceId}-${interval}.json`);
}

function loadMrtgData(deviceId, interval) {
  try {
    const file = mrtgFilePath(deviceId, interval);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {}
  return [];
}

function saveMrtgData(deviceId, interval, data) {
  try {
    atomicWrite(mrtgFilePath(deviceId, interval), data);
  } catch (err) {
    console.error("[MRTG] Save error:", err.message);
  }
}

// Load persisted data on startup
for (const d of DEVICES) {
  mrtgRealtime[d.id] = [];
  for (const interval of Object.keys(mrtgIntervals)) {
    mrtgIntervals[interval][d.id] = loadMrtgData(d.id, interval);
  }
}

function addMrtgPoint(deviceId, rx, tx) {
  const now = Date.now();
  const point = { ts: now, rx, tx };

  // Realtime: keep last 60 points (5 min at 5s interval)
  if (!mrtgRealtime[deviceId]) mrtgRealtime[deviceId] = [];
  mrtgRealtime[deviceId].push(point);
  if (mrtgRealtime[deviceId].length > 60) mrtgRealtime[deviceId].shift();

  // Aggregate into intervals
  const intervals = [
    { key: "1min", maxPoints: 1440, aggregateMs: 60000 },
    { key: "10min", maxPoints: 1008, aggregateMs: 600000 },
    { key: "1h", maxPoints: 8760, aggregateMs: 3600000 },
    { key: "1d", maxPoints: 730, aggregateMs: 86400000 },
  ];

  for (const iv of intervals) {
    if (!mrtgIntervals[iv.key][deviceId]) mrtgIntervals[iv.key][deviceId] = [];
    const arr = mrtgIntervals[iv.key][deviceId];
    const last = arr.length > 0 ? arr[arr.length - 1] : null;

    if (last && now - last.ts < iv.aggregateMs) {
      // Update current bucket (average)
      last.rx = Math.round((last.rx + rx) / 2);
      last.tx = Math.round((last.tx + tx) / 2);
      last.ts = now;
    } else {
      arr.push({ ...point });
      if (arr.length > iv.maxPoints) arr.shift();
      // Persist to disk
      saveMrtgData(deviceId, iv.key, arr);
    }
  }
}

// Collect WAN traffic every 5 seconds
async function collectMrtgData() {
  for (const device of DEVICES) {
    if (!device.wanInterface) continue;
    try {
      await withMikrotik(device.id, async (api) => {
        const monitor = await api.write("/interface/monitor-traffic", [
          "=interface=" + device.wanInterface,
          "=once",
        ]);
        if (monitor && monitor.length > 0) {
          const rx = parseInt(monitor[0]["rx-bits-per-second"] || "0");
          const tx = parseInt(monitor[0]["tx-bits-per-second"] || "0");
          addMrtgPoint(device.id, rx, tx);
        }
      });
    } catch (err) {
      console.error(`[MRTG] Error collecting ${device.name}:`, err.message);
    }
  }
}

// Start collector (5s interval)
setInterval(collectMrtgData, 5000);
// Initial collection after 2s
setTimeout(collectMrtgData, 2000);

function getDevice(deviceId) {
  if (!deviceId) return DEVICES[0];
  return DEVICES.find((d) => d.id === deviceId) || DEVICES[0];
}

// ─── Connection State (per device) ──────────────────────────────
const connectionStates = {};
for (const d of DEVICES) {
  connectionStates[d.id] = {
    status: "disconnected",
    latency: 0,
    lastError: null,
    reconnects: 0,
    lastConnected: null,
  };
}

// ─── Fresh Connection Helper ────────────────────────────────────
async function withMikrotik(deviceId, fn) {
  const device = getDevice(deviceId);
  const state = connectionStates[device.id];

  const api = new RouterOSAPI({
    host: device.host,
    port: device.port,
    user: device.user,
    password: device.password,
    timeout: device.timeout,
  });

  try {
    await api.connect();
    state.status = "connected";
    state.reconnects++;
    state.lastConnected = new Date().toISOString();
    state.lastError = null;

    const result = await fn(api);
    api.close();
    return result;
  } catch (err) {
    state.status = "error";
    state.lastError = err.message;
    try { api.close(); } catch {}
    throw err;
  }
}

// Helper to extract device ID from query param
function deviceId(req) {
  const did = req.query.device || req.query.deviceId || DEVICES[0].id;
  // Validate against known device IDs
  const validIds = new Set(DEVICES.map(d => d.id));
  return validIds.has(String(did)) ? String(did) : DEVICES[0].id;
}

// ─── API: Device List ──────────────────────────────────────────
app.get(["/api/devices", "/monitoring/api/devices"], (req, res) => {
  const devices = DEVICES.map((d) => {
    const state = connectionStates[d.id];
    return {
      id: d.id,
      name: d.name,
      host: d.host,
      port: d.port,
      status: state.status === "connected" ? "online" : state.status === "error" ? "offline" : "connecting",
      lastSeen: state.lastConnected ? new Date(state.lastConnected) : null,
    };
  });
  res.json(devices);
});

// ─── API: Health Check ──────────────────────────────────────────
app.get(["/api/ping", "/monitoring/api/ping"], async (req, res) => {
  try {
    const did = deviceId(req);
    const start = Date.now();
    await withMikrotik(did, async (api) => {
      await api.write("/system/identity/print");
    });
    const latency = Date.now() - start;
    connectionStates[did].latency = latency;
    res.json({ status: "ok", device: did, latency, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: "error" });
  }
});

// ─── API: Connection State ──────────────────────────────────────
app.get(["/api/connection", "/monitoring/api/connection"], (req, res) => {
  const did = deviceId(req);
  res.json({ device: did, ...connectionStates[did] });
});

// ─── API: System Resource ───────────────────────────────────────
app.get(["/api/resource", "/monitoring/api/resource"], async (req, res) => {
  try {
    const did = deviceId(req);
    const data = await withMikrotik(did, async (api) => {
      const resource = await api.write("/system/resource/print");
      if (!resource || resource.length === 0) throw new Error("Empty response");
      const r = resource[0];

      let identityName = "Mikrotik";
      try {
        const identity = await api.write("/system/identity/print");
        if (identity && identity.length > 0) identityName = identity[0].name || "Mikrotik";
      } catch {}

      const totalMemory = parseInt(r["total-memory"] || "0");
      const freeMemory = parseInt(r["free-memory"] || "0");
      const usedMemory = totalMemory - freeMemory;

      // Disk info
      let totalDisk = 0, usedDisk = 0, freeDisk = 0, diskPercent = 0;
      try {
        const diskRes = await api.write("/disk/print");
        if (diskRes && diskRes.length > 0) {
          for (const disk of diskRes) {
            const total = parseInt(disk["total-space"] || "0");
            const free = parseInt(disk["free-space"] || "0");
            totalDisk += total;
            freeDisk += free;
          }
          usedDisk = totalDisk - freeDisk;
          diskPercent = totalDisk > 0 ? Math.round((usedDisk / totalDisk) * 100 * 10) / 10 : 0;
        }
      } catch {}

      // Health (temperature, voltage)
      let temperature = null, voltage = null;
      try {
        const health = await api.write("/system/health/print");
        if (health && health.length > 0) {
          temperature = health[0].temperature ? parseFloat(health[0].temperature) : null;
          voltage = health[0].voltage ? parseFloat(health[0].voltage) : null;
        }
      } catch {}

      return {
        cpuLoad: parseInt(r["cpu-load"] || "0"),
        cpuCount: parseInt(r["cpu-count"] || "1"),
        cpuFrequency: parseInt(r["cpu-frequency"] || "0"),
        totalMemory: Math.round(totalMemory / (1024 * 1024)),
        freeMemory: Math.round(freeMemory / (1024 * 1024)),
        usedMemory: Math.round(usedMemory / (1024 * 1024)),
        memoryPercent: totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100 * 10) / 10 : 0,
        totalDisk: Math.round(totalDisk / (1024 * 1024)),
        usedDisk: Math.round(usedDisk / (1024 * 1024)),
        freeDisk: Math.round(freeDisk / (1024 * 1024)),
        diskPercent,
        uptime: r.uptime || "0s",
        boardName: r["board-name"] || identityName,
        version: r.version || "Unknown",
        architecture: r["architecture-name"] || "Unknown",
        temperature,
        voltage,
        name: identityName,
      };
    });

    res.json(data);
  } catch (err) {
    console.error("[API] Resource error:", err.message);
    res.status(500).json({ error: "Failed to fetch resource" });
  }
});

// ─── API: Interfaces ────────────────────────────────────────────
app.get(["/api/interfaces", "/monitoring/api/interfaces"], async (req, res) => {
  try {
    const did = deviceId(req);
    const data = await withMikrotik(did, async (api) => {
      const interfaces = await api.write("/interface/print");

      const mainInterfaces = interfaces.filter(
        (i) => i.disabled !== "true" && ["ether", "bridge", "vlan", "loopback", "wlan"].includes(i.type)
      );

      const pppoeInterfaces = interfaces.filter(
        (i) => i.disabled !== "true" && i.type === "pppoe-in"
      );

      const result = [];
      for (const iface of mainInterfaces.slice(0, 20)) {
        let rxRate = 0, txRate = 0;
        try {
          const monitor = await api.write("/interface/monitor-traffic", [
            "=interface=" + iface.name, "=once",
          ]);
          if (monitor && monitor.length > 0) {
            rxRate = parseInt(monitor[0]["rx-bits-per-second"] || "0");
            txRate = parseInt(monitor[0]["tx-bits-per-second"] || "0");
          }
        } catch {}

        result.push({
          name: iface.name,
          type: iface.type || "unknown",
          status: iface.running === "true" ? "up" : "down",
          macAddress: iface["mac-address"] || "",
          speed: iface.speed || "auto",
          rxRate, txRate,
          rxBytes: parseInt(iface["rx-byte"] || "0"),
          txBytes: parseInt(iface["tx-byte"] || "0"),
          rxPackets: parseInt(iface["rx-packet"] || "0"),
          txPackets: parseInt(iface["tx-packet"] || "0"),
        });
      }

      const pppoeUp = pppoeInterfaces.filter((i) => i.running === "true").length;
      result.push({
        name: `PPPoE Tunnels (${pppoeUp}/${pppoeInterfaces.length})`,
        type: "pppoe-summary",
        status: pppoeUp > 0 ? "up" : "down",
        macAddress: "", speed: "", rxRate: 0, txRate: 0,
        rxBytes: pppoeInterfaces.reduce((s, i) => s + parseInt(i["rx-byte"] || "0"), 0),
        txBytes: pppoeInterfaces.reduce((s, i) => s + parseInt(i["tx-byte"] || "0"), 0),
        rxPackets: 0, txPackets: 0,
      });

      return { interfaces: result, pppoeCount: pppoeInterfaces.length, pppoeUp };
    });

    res.json(data);
  } catch (err) {
    console.error("[API] Interfaces error:", err.message);
    res.status(500).json({ error: "Failed to fetch interfaces" });
  }
});

// ─── API: Firewall ──────────────────────────────────────────────
app.get(["/api/firewall", "/monitoring/api/firewall"], async (req, res) => {
  try {
    const did = deviceId(req);
    const data = await withMikrotik(did, async (api) => {
      const rules = await api.write("/ip/firewall/filter/print");
      const natRules = await api.write("/ip/firewall/nat/print");
      return {
        filterCount: rules ? rules.length : 0,
        natCount: natRules ? natRules.length : 0,
        filterRules: (rules || []).slice(0, 50).map((r) => ({
          chain: r.chain || "",
          action: r.action || "",
          protocol: r.protocol || "",
          srcAddress: r["src-address"] || "",
          dstAddress: r["dst-address"] || "",
          dstPort: r["dst-port"] || "",
          comment: r.comment || "",
          disabled: r.disabled === "true",
        })),
      };
    });
    res.json(data);
  } catch (err) {
    console.error("[API] Firewall error:", err.message);
    res.status(500).json({ error: "Failed to fetch firewall" });
  }
});

// ─── API: DHCP Leases ───────────────────────────────────────────
app.get(["/api/dhcp", "/monitoring/api/dhcp"], async (req, res) => {
  try {
    const did = deviceId(req);
    const data = await withMikrotik(did, async (api) => {
      const leases = await api.write("/ip/dhcp-server/lease/print");
      return {
        count: leases ? leases.length : 0,
        leases: (leases || []).map((l) => ({
          address: l.address || "",
          macAddress: l["mac-address"] || "",
          hostname: l.host || l["host-name"] || "",
          status: l.status || "",
          server: l.server || "",
          comment: l.comment || "",
        })),
      };
    });
    res.json(data);
  } catch (err) {
    console.error("[API] DHCP error:", err.message);
    res.status(500).json({ error: "Failed to fetch DHCP leases" });
  }
});

// ─── API: Active Connections ────────────────────────────────────
app.get(["/api/connections", "/monitoring/api/connections"], async (req, res) => {
  try {
    const did = deviceId(req);
    const data = await withMikrotik(did, async (api) => {
      const connections = await api.write("/ip/firewall/connection/print");
      return { count: connections ? connections.length : 0 };
    });
    res.json(data);
  } catch {
    res.json({ count: 0 });
  }
});

// ─── Ping via Mikrotik Router ──────────────────────────────────
async function mikrotikPing(api, ips, concurrency = 20) {
  const results = {};
  for (let i = 0; i < ips.length; i += concurrency) {
    const batch = ips.slice(i, i + concurrency);
    const promises = batch.map(async (ip) => {
      try {
        const res = await api.write("/ping", ["=address=" + ip, "=count=1"]);
        const r = res[0];
        const alive = !r.status && r.time && r["packet-loss"] === "0";
        let latency = null;
        if (alive && r.time) {
          const msMatch = r.time.match(/(\d+)ms/);
          const usMatch = r.time.match(/(\d+)us/);
          latency = msMatch ? parseFloat(msMatch[1]) : 0;
          if (usMatch) latency += parseFloat(usMatch[1]) / 1000;
        }
        results[ip] = { ip, alive: !!alive, latency };
      } catch {
        results[ip] = { ip, alive: false, latency: null };
      }
    });
    await Promise.all(promises);
    // Small delay between batches to avoid overwhelming the router API
    if (i + concurrency < ips.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  return results;
}

// ─── Ping Cache (heavy - pings 700+ IPs via router) ────────────
const pingCache = {};
const PING_CACHE_TTL = 55000; // 55 seconds

// ─── API: Client Queue Data (lightweight, no ping) ──────────────
app.get(["/api/clients", "/monitoring/api/clients"], async (req, res) => {
  try {
    const did = deviceId(req);
    const data = await withMikrotik(did, async (api) => {
      const queues = await api.write("/queue/simple/print");
      const clients = (queues || []).map((q) => {
        const targets = (q.target || "").split(",").map(t => t.trim());
        const ips = [];
        for (const t of targets) {
          const ip = t.split("/")[0].trim();
          if (ip && !ip.endsWith(".0")) ips.push(ip);
        }
        const rateParts = (q.rate || "0/0").split("/");
        const bytesParts = (q.bytes || "0/0").split("/");
        return {
          name: q.name || "",
          target: q.target || "",
          ips,
          maxUpload: q["max-limit"] ? q["max-limit"].split("/")[0] : "0",
          maxDownload: q["max-limit"] ? q["max-limit"].split("/")[1] : "0",
          rateUpload: parseInt(rateParts[0]) || 0,
          rateDownload: parseInt(rateParts[1]) || 0,
          totalUpload: parseInt(bytesParts[0]) || 0,
          totalDownload: parseInt(bytesParts[1]) || 0,
          disabled: q.disabled === "true",
          comment: q.comment || "",
        };
      });

      // Merge with cached ping data if available
      const cachedPing = pingCache[did];
      const pingResults = cachedPing ? cachedPing.data : {};

      const merged = clients.map(c => {
        const clientPings = c.ips.map(ip => pingResults[ip] || { ip, alive: false, latency: null });
        const alive = clientPings.some(p => p.alive);
        const latency = clientPings.find(p => p.alive)?.latency ?? null;
        return { ...c, alive, latency, pings: clientPings };
      });

      const up = merged.filter(c => c.alive && !c.disabled);
      const down = merged.filter(c => !c.alive && !c.disabled);
      const disabled = merged.filter(c => c.disabled);

      return {
        total: merged.length,
        up: up.length,
        down: down.length,
        disabled: disabled.length,
        clients: [...down, ...up, ...disabled],
        groups: { down, up, disabled },
      };
    });

    res.json(data);
  } catch (err) {
    console.error("[API] Clients error:", err.message);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

// ─── API: Client Ping (heavy - router pings all IPs) ────────────
app.get(["/api/clients/ping", "/monitoring/api/clients/ping"], async (req, res) => {
  try {
    const did = deviceId(req);

    // Check cache
    const cached = pingCache[did];
    if (cached && Date.now() - cached.time < PING_CACHE_TTL) {
      return res.json({ cached: true, results: cached.data, cachedAt: cached.time });
    }

    const results = await withMikrotik(did, async (api) => {
      const queues = await api.write("/queue/simple/print");
      const allIps = [...new Set((queues || []).flatMap(q => {
        return (q.target || "").split(",").map(t => t.trim().split("/")[0].trim()).filter(ip => ip && !ip.endsWith(".0"));
      }))];

      return await mikrotikPing(api, allIps, 20);
    });

    // Store in cache
    pingCache[did] = { data: results, time: Date.now() };

    res.json({ cached: false, results, cachedAt: Date.now() });
  } catch (err) {
    console.error("[API] Clients ping error:", err.message);
    res.status(500).json({ error: "Failed to ping clients" });
  }
});

// ─── API: Client Status Log (from monitor-bot) ────────────────────
app.get(["/api/status-log", "/monitoring/api/status-log"], (req, res) => {
  try {
    const statusFile = path.join(__dirname, "data", "client-status.json");
    const logFile = path.join(__dirname, "data", "status-log.json");
    const current = fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, "utf-8")) : {};
    const logs = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf-8")) : {};
    res.json({ current, logs, lastUpdate: Math.max(...Object.values(current).map(c => c.changedAt || 0), 0) });
  } catch (err) {
    res.json({ current: {}, logs: {}, lastUpdate: 0 });
  }
});

// ─── API: MRTG Traffic Data ─────────────────────────────────────
app.get(["/api/mrtg", "/monitoring/api/mrtg"], (req, res) => {
  const did = deviceId(req);
  const range = req.query.range || "realtime";

  const device = getDevice(did);

  if (range === "realtime") {
    return res.json({
      device: did,
      interface: device.wanInterface,
      range: "realtime",
      interval: "5s",
      points: mrtgRealtime[did] || [],
    });
  }

  const validRanges = { "1min": "1min", "10min": "10min", "1h": "1h", "1d": "1d" };
  const key = validRanges[range];
  if (!key) {
    return res.status(400).json({ error: "Invalid range. Use: realtime, 1min, 10min, 1h, 1d" });
  }

  const data = (mrtgIntervals[key] && mrtgIntervals[key][did]) || [];
  res.json({
    device: did,
    interface: device.wanInterface,
    range: key,
    points: data,
  });
});

// ─── API: WAN Interface Traffic (realtime for dashboard) ─────────
app.get(["/api/wan-traffic", "/monitoring/api/wan-traffic"], async (req, res) => {
  try {
    const did = deviceId(req);
    const device = getDevice(did);
    if (!device.wanInterface) {
      return res.json({ interface: null, rx: 0, tx: 0 });
    }

    const data = await withMikrotik(did, async (api) => {
      const monitor = await api.write("/interface/monitor-traffic", [
        "=interface=" + device.wanInterface,
        "=once",
      ]);
      if (monitor && monitor.length > 0) {
        return {
          interface: device.wanInterface,
          rx: parseInt(monitor[0]["rx-bits-per-second"] || "0"),
          tx: parseInt(monitor[0]["tx-bits-per-second"] || "0"),
          rxBytes: parseInt(monitor[0]["rx-byte"] || "0"),
          txBytes: parseInt(monitor[0]["tx-byte"] || "0"),
          rxPackets: parseInt(monitor[0]["rx-packet"] || "0"),
          txPackets: parseInt(monitor[0]["tx-packet"] || "0"),
        };
      }
      return { interface: device.wanInterface, rx: 0, tx: 0 };
    });

    res.json(data);
  } catch (err) {
    console.error("[API] WAN traffic error:", err.message);
    res.status(500).json({ error: "Failed to fetch WAN traffic" });
  }
});

// ═══════════════════════════════════════════════════════════════
// BILLING SYSTEM
// ═══════════════════════════════════════════════════════════════
const BILLING_DIR = path.join(__dirname, "billing-data");
if (!fs.existsSync(BILLING_DIR)) fs.mkdirSync(BILLING_DIR, { recursive: true });

function billingFile(name) {
  return path.join(BILLING_DIR, `${name}.json`);
}

function loadBillingData(name) {
  try {
    const file = billingFile(name);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {}
  return [];
}

function saveBillingData(name, data) {
  atomicWrite(billingFile(name), data);
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Helper: get device filter
function billingDeviceId(req) {
  return req.query.deviceId || req.query.device || req.body?.deviceId || DEVICES[0].id;
}

function filterByDevice(data, did) {
  return data.filter(d => d.deviceId === did);
}

// ── Packages CRUD ─────────────────────────────────────────────
app.get(["/api/billing/packages", "/monitoring/api/billing/packages"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const did = billingDeviceId(req);
  const all = loadBillingData("packages");
  res.json(filterByDevice(all, did));
});

app.post(["/api/billing/packages", "/monitoring/api/billing/packages"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const { name, speedUp, speedDown, price, description, deviceId: did } = req.body;
  if (!name || price == null) return res.status(400).json({ error: "Name and price are required" });
  const packages = loadBillingData("packages");
  const pkg = { id: genId(), deviceId: did || DEVICES[0].id, name, speedUp: speedUp || "", speedDown: speedDown || "", price: Number(price), description: description || "", createdAt: new Date().toISOString() };
  packages.push(pkg);
  saveBillingData("packages", packages);
  res.json(pkg);
});

app.put(["/api/billing/packages/:id", "/monitoring/api/billing/packages/:id"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const packages = loadBillingData("packages");
  const idx = packages.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Package not found" });
  const { name, speedUp, speedDown, price, description } = req.body;
  packages[idx] = { ...packages[idx], ...(name != null && { name }), ...(speedUp != null && { speedUp }), ...(speedDown != null && { speedDown }), ...(price != null && { price: Number(price) }), ...(description != null && { description }) };
  saveBillingData("packages", packages);
  res.json(packages[idx]);
});

app.delete(["/api/billing/packages/:id", "/monitoring/api/billing/packages/:id"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  let packages = loadBillingData("packages");
  packages = packages.filter(p => p.id !== req.params.id);
  saveBillingData("packages", packages);
  res.json({ success: true });
});

// ── Simple Queues (from Mikrotik) ─────────────────────────────
app.get(["/api/billing/queues", "/monitoring/api/billing/queues"], authMiddleware, async (req, res) => {
  try {
    const did = billingDeviceId(req);
    const customers = filterByDevice(loadBillingData("customers"), did);
    const usedQueues = new Set(customers.map(c => c.simpleQueue));

    const queues = await withMikrotik(did, async (api) => {
      const raw = await api.write("/queue/simple/print");
      return (raw || []).map(q => {
        const rateParts = (q.rate || "0/0").split("/");
        return {
          name: q.name || "",
          target: q.target || "",
          maxUpload: q["max-limit"] ? q["max-limit"].split("/")[0] : "0",
          maxDownload: q["max-limit"] ? q["max-limit"].split("/")[1] : "0",
          rateUpload: parseInt(rateParts[0]) || 0,
          rateDownload: parseInt(rateParts[1]) || 0,
          disabled: q.disabled === "true",
          comment: q.comment || "",
          usedBy: customers.find(c => c.simpleQueue === q.name)?.name || null,
        };
      });
    });

    res.json(queues);
  } catch (err) {
    console.error("[API] Queues error:", err.message);
    res.status(500).json({ error: "Failed to fetch queues" });
  }
});

// ── Customers CRUD ────────────────────────────────────────────
app.get(["/api/billing/customers", "/monitoring/api/billing/customers"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const did = billingDeviceId(req);
  const all = loadBillingData("customers");
  res.json(filterByDevice(all, did));
});

app.post(["/api/billing/customers", "/monitoring/api/billing/customers"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const { name, address, phone, packageId, simpleQueue, billingDay, status, installDate, lat, lng, deviceId: did } = req.body;
  if (!name || !packageId || !simpleQueue) return res.status(400).json({ error: "Name, package, and simple queue are required" });
  const customers = loadBillingData("customers");
  const deviceCustomers = customers.filter(c => c.deviceId === (did || DEVICES[0].id));
  if (deviceCustomers.find(c => c.simpleQueue === simpleQueue)) return res.status(400).json({ error: `Simple queue "${simpleQueue}" already used on this router` });
  const cust = { id: genId(), deviceId: did || DEVICES[0].id, name, address: address || "", phone: phone || "", packageId, simpleQueue, billingDay: billingDay || 1, status: status || "active", installDate: installDate || new Date().toISOString().slice(0, 10), lat: lat != null ? Number(lat) : null, lng: lng != null ? Number(lng) : null, createdAt: new Date().toISOString() };
  customers.push(cust);
  saveBillingData("customers", customers);
  res.json(cust);
});

app.put(["/api/billing/customers/:id", "/monitoring/api/billing/customers/:id"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const customers = loadBillingData("customers");
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Customer not found" });
  const { name, address, phone, packageId, simpleQueue, billingDay, status, installDate, lat, lng } = req.body;
  if (simpleQueue && simpleQueue !== customers[idx].simpleQueue) {
    const deviceCustomers = customers.filter(c => c.deviceId === customers[idx].deviceId && c.id !== req.params.id);
    if (deviceCustomers.find(c => c.simpleQueue === simpleQueue)) return res.status(400).json({ error: `Simple queue "${simpleQueue}" already used on this router` });
  }
  customers[idx] = { ...customers[idx], ...(name != null && { name }), ...(address != null && { address }), ...(phone != null && { phone }), ...(packageId != null && { packageId }), ...(simpleQueue != null && { simpleQueue }), ...(billingDay != null && { billingDay }), ...(status != null && { status }), ...(installDate != null && { installDate }), ...(lat != null && { lat: Number(lat) }), ...(lng != null && { lng: Number(lng) }) };
  saveBillingData("customers", customers);
  res.json(customers[idx]);
});

app.delete(["/api/billing/customers/:id", "/monitoring/api/billing/customers/:id"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  let customers = loadBillingData("customers");
  customers = customers.filter(c => c.id !== req.params.id);
  saveBillingData("customers", customers);
  res.json({ success: true });
});

// ── Invoices CRUD ─────────────────────────────────────────────
app.get(["/api/billing/invoices", "/monitoring/api/billing/invoices"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const did = billingDeviceId(req);
  const all = loadBillingData("invoices");
  res.json(filterByDevice(all, did));
});

app.post(["/api/billing/invoices", "/monitoring/api/billing/invoices"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const { customerId, month, year, amount, dueDate, notes, deviceId: did } = req.body;
  if (!customerId || !month || !year) return res.status(400).json({ error: "Customer, month, and year are required" });
  const invoices = loadBillingData("invoices");
  const deviceInvoices = invoices.filter(i => i.deviceId === (did || DEVICES[0].id));
  if (deviceInvoices.find(i => i.customerId === customerId && i.month === month && i.year === year)) return res.status(400).json({ error: "Invoice already exists for this customer/month" });
  const baseAmount = Number(amount || 0);
  const ppnAmount = Math.round(baseAmount * 0.11);
  const now = new Date();
  const discountAmount = now.getDate() <= 10 ? ppnAmount : 0;
  const inv = { id: genId(), deviceId: did || DEVICES[0].id, customerId, month: Number(month), year: Number(year), amount: baseAmount, ppn: ppnAmount, discount: discountAmount, totalAmount: baseAmount + ppnAmount - discountAmount, status: "unpaid", dueDate: dueDate || "", paidDate: null, notes: notes || "", createdAt: now.toISOString() };
  invoices.push(inv);
  saveBillingData("invoices", invoices);
  res.json(inv);
});

app.put(["/api/billing/invoices/:id", "/monitoring/api/billing/invoices/:id"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const invoices = loadBillingData("invoices");
  const idx = invoices.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Invoice not found" });
  const { status, paidDate, amount, dueDate, notes, discount } = req.body;
  const updated = { ...invoices[idx], ...(status != null && { status }), ...(paidDate != null && { paidDate }), ...(amount != null && { amount: Number(amount) }), ...(dueDate != null && { dueDate }), ...(notes != null && { notes }), ...(discount != null && { discount: Number(discount) }) };
  // Recalculate PPN and total if amount or discount changed
  if (amount != null || discount != null) {
    updated.ppn = Math.round(updated.amount * 0.11);
    updated.totalAmount = updated.amount + updated.ppn - (updated.discount || 0);
  }
  invoices[idx] = updated;
  saveBillingData("invoices", invoices);
  res.json(invoices[idx]);
});

app.delete(["/api/billing/invoices/:id", "/monitoring/api/billing/invoices/:id"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  let invoices = loadBillingData("invoices");
  invoices = invoices.filter(i => i.id !== req.params.id);
  saveBillingData("invoices", invoices);
  res.json({ success: true });
});

// ── Billing Summary ───────────────────────────────────────────
app.get(["/api/billing/summary", "/monitoring/api/billing/summary"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const did = billingDeviceId(req);
  const customers = filterByDevice(loadBillingData("customers"), did);
  const invoices = filterByDevice(loadBillingData("invoices"), did);
  const packages = filterByDevice(loadBillingData("packages"), did);

  const activeCustomers = customers.filter(c => c.status === "active").length;
  const totalCustomers = customers.length;
  const unpaidInvoices = invoices.filter(i => i.status === "unpaid");
  const paidInvoices = invoices.filter(i => i.status === "paid");

  const now = new Date();
  const today = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Effective total: base + ppn - discount (discount applies for current/future month if 1-10)
  const effectiveTotal = (inv) => {
    const base = inv.amount;
    const ppn = inv.ppn || Math.round(base * 0.11);
    if (inv.status === "paid") return base + ppn - (inv.discount || 0);
    // unpaid: check if current/future month
    const isPast = inv.year < currentYear || (inv.year === currentYear && inv.month < currentMonth);
    const discount = isPast ? 0 : (today <= 10 ? ppn : 0);
    return base + ppn - discount;
  };

  const totalUnpaid = unpaidInvoices.reduce((s, i) => s + effectiveTotal(i), 0);
  const totalPaid = paidInvoices.reduce((s, i) => s + effectiveTotal(i), 0);

  const thisMonthInvoices = invoices.filter(i => i.month === currentMonth && i.year === currentYear);
  const thisMonthPaid = thisMonthInvoices.filter(i => i.status === "paid").reduce((s, i) => s + effectiveTotal(i), 0);
  const thisMonthUnpaid = thisMonthInvoices.filter(i => i.status === "unpaid").reduce((s, i) => s + effectiveTotal(i), 0);

  res.json({
    totalCustomers,
    activeCustomers,
    totalPackages: packages.length,
    totalInvoices: invoices.length,
    totalPaid,
    totalUnpaid,
    totalRevenue: totalPaid + totalUnpaid,
    thisMonthPaid,
    thisMonthUnpaid,
    thisMonthTotal: thisMonthPaid + thisMonthUnpaid,
    unpaidCount: unpaidInvoices.length,
    paidCount: paidInvoices.length,
  });
});

// ── Auto-generate invoices ─────────────────────────────────────
app.post(["/api/billing/generate-invoices", "/monitoring/api/billing/generate-invoices"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const { month, year, deviceId: did } = req.body;
  if (!month || !year) return res.status(400).json({ error: "Month and year are required" });
  const deviceDid = did || DEVICES[0].id;
  const customers = filterByDevice(loadBillingData("customers"), deviceDid).filter(c => c.status === "active");
  const packages = loadBillingData("packages");
  const invoices = loadBillingData("invoices");
  let created = 0;
  for (const cust of customers) {
    if (invoices.find(i => i.customerId === cust.id && i.month === Number(month) && i.year === Number(year))) continue;
    const pkg = packages.find(p => p.id === cust.packageId);
    const basePrice = pkg ? pkg.price : 0;
    const ppnPrice = Math.round(basePrice * 0.11);
    const now = new Date();
    const discountPrice = now.getDate() <= 10 ? ppnPrice : 0;
    invoices.push({ id: genId(), deviceId: deviceDid, customerId: cust.id, month: Number(month), year: Number(year), amount: basePrice, ppn: ppnPrice, discount: discountPrice, totalAmount: basePrice + ppnPrice - discountPrice, status: "unpaid", dueDate: "", paidDate: null, notes: "", createdAt: now.toISOString() });
    created++;
  }
  saveBillingData("invoices", invoices);
  res.json({ created, total: customers.length });
});

// ── Billing: list devices with counts ─────────────────────────
app.get(["/api/billing/devices", "/monitoring/api/billing/devices"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const customers = loadBillingData("customers");
  const invoices = loadBillingData("invoices");
  const result = DEVICES.map(d => {
    const dc = customers.filter(c => c.deviceId === d.id);
    const di = invoices.filter(i => i.deviceId === d.id);
    return {
      id: d.id,
      name: d.name,
      customerCount: dc.length,
      activeCount: dc.filter(c => c.status === "active").length,
      invoiceCount: di.length,
      unpaidCount: di.filter(i => i.status === "unpaid").length,
    };
  });
  res.json(result);
});

// ── Backup & Restore ──────────────────────────────────────────
app.get(["/api/backup", "/monitoring/api/backup"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  try {
    const did = billingDeviceId(req);
    const allPkgs = loadBillingData("packages");
    const allCust = loadBillingData("customers");
    const allInv = loadBillingData("invoices");

    const packages = filterByDevice(allPkgs, did);
    const customers = filterByDevice(allCust, did);
    const invoices = filterByDevice(allInv, did);

    const device = DEVICES.find(d => d.id === did);

    const backup = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      deviceId: did,
      deviceName: device?.name || did,
      data: { packages, customers, invoices },
      meta: { packages: packages.length, customers: customers.length, invoices: invoices.length },
    };

    res.setHeader("Content-Type", "application/json");
    const safeName = (device?.name || did).replace(/[^a-zA-Z0-9]/g, "-").slice(0, 30);
    res.setHeader("Content-Disposition", `attachment; filename="mikromon-${safeName}-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/api/backup/restore", "/monitoring/api/backup/restore"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  try {
    const { data, mode, targetDevice } = req.body;

    if (!data || !data.packages || !data.customers || !data.invoices) {
      return res.status(400).json({ error: "Invalid backup file format" });
    }

    // Override deviceId if targetDevice is specified
    const did = targetDevice || data.deviceId || DEVICES[0].id;

    // Assign deviceId to all restored data
    const pkgWithDevice = data.packages.map(p => ({ ...p, deviceId: did }));
    const custWithDevice = data.customers.map(c => ({ ...c, deviceId: did }));
    const invWithDevice = data.invoices.map(i => ({ ...i, deviceId: did }));

    if (mode === "replace") {
      // Remove existing data for this device, then add restored data
      const existingPkgs = loadBillingData("packages").filter(p => p.deviceId !== did);
      const existingCust = loadBillingData("customers").filter(c => c.deviceId !== did);
      const existingInv = loadBillingData("invoices").filter(i => i.deviceId !== did);

      saveBillingData("packages", [...existingPkgs, ...pkgWithDevice]);
      saveBillingData("customers", [...existingCust, ...custWithDevice]);
      saveBillingData("invoices", [...existingInv, ...invWithDevice]);
    } else {
      // Merge: add missing items, skip existing IDs
      const existingPkgs = loadBillingData("packages");
      const existingCust = loadBillingData("customers");
      const existingInv = loadBillingData("invoices");

      const existingPkgIds = new Set(existingPkgs.map(p => p.id));
      const existingCustIds = new Set(existingCust.map(c => c.id));
      const existingInvIds = new Set(existingInv.map(i => i.id));

      const newPkgs = pkgWithDevice.filter(p => !existingPkgIds.has(p.id));
      const newCust = custWithDevice.filter(c => !existingCustIds.has(c.id));
      const newInv = invWithDevice.filter(i => !existingInvIds.has(i.id));

      saveBillingData("packages", [...existingPkgs, ...newPkgs]);
      saveBillingData("customers", [...existingCust, ...newCust]);
      saveBillingData("invoices", [...existingInv, ...newInv]);
    }

    res.json({
      success: true,
      message: mode === "replace" ? `Data router ${did} berhasil di-restore` : `Data router ${did} berhasil di-merge`,
      deviceId: did,
      restored: { packages: pkgWithDevice.length, customers: custWithDevice.length, invoices: invWithDevice.length },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(["/api/backup/info", "/monitoring/api/backup/info"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const did = billingDeviceId(req);
  const allPkgs = loadBillingData("packages");
  const allCust = loadBillingData("customers");
  const allInv = loadBillingData("invoices");

  const packages = filterByDevice(allPkgs, did);
  const customers = filterByDevice(allCust, did);
  const invoices = filterByDevice(allInv, did);

  const paidInvoices = invoices.filter(i => i.status === "paid");
  const unpaidInvoices = invoices.filter(i => i.status === "unpaid");

  res.json({
    deviceId: did,
    packages: packages.length,
    customers: customers.length,
    customersActive: customers.filter(c => c.status === "active").length,
    invoices: invoices.length,
    invoicesPaid: paidInvoices.length,
    invoicesUnpaid: unpaidInvoices.length,
    totalRevenue: invoices.reduce((s, i) => s + (i.totalAmount || i.amount), 0),
    diskUsage: {
      packages: fs.statSync(billingFile("packages")).size,
      customers: fs.statSync(billingFile("customers")).size,
      invoices: fs.statSync(billingFile("invoices")).size,
    },
  });
});

app.get(["/api/backup/info-all", "/monitoring/api/backup/info-all"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const allPkgs = loadBillingData("packages");
  const allCust = loadBillingData("customers");
  const allInv = loadBillingData("invoices");

  const devices = DEVICES.map(d => {
    const pkgs = filterByDevice(allPkgs, d.id);
    const cust = filterByDevice(allCust, d.id);
    const inv = filterByDevice(allInv, d.id);
    return {
      id: d.id,
      name: d.name,
      packages: pkgs.length,
      customers: cust.length,
      customersActive: cust.filter(c => c.status === "active").length,
      invoices: inv.length,
      invoicesPaid: inv.filter(i => i.status === "paid").length,
      invoicesUnpaid: inv.filter(i => i.status === "unpaid").length,
      totalRevenue: inv.reduce((s, i) => s + (i.totalAmount || i.amount), 0),
    };
  });

  res.json({
    all: {
      packages: allPkgs.length,
      customers: allCust.length,
      invoices: allInv.length,
      totalRevenue: allInv.reduce((s, i) => s + (i.totalAmount || i.amount), 0),
    },
    devices,
    diskUsage: {
      packages: fs.statSync(billingFile("packages")).size,
      customers: fs.statSync(billingFile("customers")).size,
      invoices: fs.statSync(billingFile("invoices")).size,
      total: fs.statSync(billingFile("packages")).size + fs.statSync(billingFile("customers")).size + fs.statSync(billingFile("invoices")).size,
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// WHATSAPP GATEWAY
// ═══════════════════════════════════════════════════════════════

// Initialize WhatsApp on startup
waGateway.connectWhatsApp().catch(err => console.error("[WA] Init error:", err.message));

// ── WA Status ─────────────────────────────────────────────────
app.get(["/api/wa/status", "/monitoring/api/wa/status"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  res.json(waGateway.getStatus());
});

// ── WA Connect (start QR flow) ─────────────────────────────────
app.post(["/api/wa/connect", "/monitoring/api/wa/connect"], authMiddleware, async (req, res) => {
  try {
    await waGateway.connectWhatsApp();
    res.json({ success: true, message: "Connecting... check QR" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WA Disconnect ──────────────────────────────────────────────
app.post(["/api/wa/disconnect", "/monitoring/api/wa/disconnect"], authMiddleware, async (req, res) => {
  try {
    await waGateway.disconnectWhatsApp();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WA Send Single Message ─────────────────────────────────────
app.post(["/api/wa/send", "/monitoring/api/wa/send"], authMiddleware, async (req, res) => {
  const { phone, text } = req.body;
  if (!phone || !text) return res.status(400).json({ error: "Phone and text are required" });
  try {
    const result = await waGateway.sendMessage(phone, text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WA Send Invoice to Customer ────────────────────────────────
app.post(["/api/wa/send-invoice", "/monitoring/api/wa/send-invoice"], authMiddleware, async (req, res) => {
  const { invoiceId, deviceId } = req.body;
  if (!invoiceId) return res.status(400).json({ error: "Invoice ID is required" });

  try {
    const invoices = loadBillingData("invoices");
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const customers = filterByDevice(loadBillingData("customers"), invoice.deviceId);
    const customer = customers.find(c => c.id === invoice.customerId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!customer.phone) return res.status(400).json({ error: "Customer has no phone number" });

    const packages = loadBillingData("packages");
    const pkg = packages.find(p => p.id === customer.packageId);

    const text = generateInvoiceText({
      invoice,
      customer,
      packageName: pkg ? pkg.name : "-",
    });

    const result = await waGateway.sendMessage(customer.phone, text);
    res.json({ ...result, customer: customer.name, phone: customer.phone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WA Broadcast to All Unpaid ─────────────────────────────────
app.post(["/api/wa/broadcast", "/monitoring/api/wa/broadcast"], authMiddleware, async (req, res) => {
  const { deviceId, delay } = req.body;
  const did = deviceId || DEVICES[0].id;
  const delayMs = (delay || 15) * 1000; // default 15 seconds

  try {
    const customers = filterByDevice(loadBillingData("customers"), did);
    const invoices = filterByDevice(loadBillingData("invoices"), did);
    const packages = loadBillingData("packages");

    // Group ALL unpaid invoices by customer
    const unpaidByCustomer = {};
    for (const inv of invoices.filter(i => i.status === "unpaid")) {
      if (!unpaidByCustomer[inv.customerId]) unpaidByCustomer[inv.customerId] = [];
      unpaidByCustomer[inv.customerId].push(inv);
    }

    // Build messages per customer
    const messages = [];
    for (const [customerId, customerInvoices] of Object.entries(unpaidByCustomer)) {
      const customer = customers.find(c => c.id === customerId);
      if (!customer || !customer.phone) continue;

      const pkg = packages.find(p => p.id === customer.packageId);
      const text = generateAllUnpaidText({
        invoices: customerInvoices,
        customer,
        packageName: pkg ? pkg.name : "-",
      });

      messages.push({ phone: customer.phone, text, customerName: customer.name });
    }

    if (messages.length === 0) {
      return res.json({ success: true, message: "Tidak ada tagihan belum bayar", total: 0 });
    }

    // Start broadcast in background
    waGateway.broadcastMessages(messages, delayMs).catch(err => {
      console.error("[WA] Broadcast error:", err.message);
    });

    res.json({
      success: true,
      message: `Broadcast dimulai: ${messages.length} pelanggan, delay ${delayMs / 1000}dtk`,
      total: messages.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WA Broadcast Status ────────────────────────────────────────
app.get(["/api/wa/broadcast-status", "/monitoring/api/wa/broadcast-status"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  res.json(waGateway.getStatus().broadcast);
});

// ── WA Stop Broadcast ──────────────────────────────────────────
app.post(["/api/wa/broadcast-stop", "/monitoring/api/wa/broadcast-stop"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  waGateway.stopBroadcast();
  res.json({ success: true });
});

// ─── Static Files & Routing ─────────────────────────────────────
const staticPath = path.resolve(__dirname, "out");
const pageFiles = ["traffic", "devices", "alerts", "settings", "settings/users", "login", "clients", "mrtg", "billing", "billing/packages", "billing/customers", "billing/invoices", "billing/history", "billing/map", "billing/monthly", "billing/whatsapp", "billing/backup"];

// Serve static assets (_next/*, etc.)
app.use("/monitoring", express.static(staticPath, {
  index: false,
  redirect: false,
  maxAge: "1d",
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  },
}));

// Page routes
pageFiles.forEach((page) => {
  const handler = (req, res) => {
    const pageFile = `${page}.html`;
    if (fs.existsSync(path.join(staticPath, pageFile))) {
      return res.sendFile(pageFile, { root: staticPath });
    }
    res.sendFile("index.html", { root: staticPath });
  };
  app.get(`/monitoring/${page}`, handler);
  app.get(`/monitoring/${page}/`, handler);
});

// Dashboard root
app.get("/monitoring", (req, res) => {
  res.sendFile("index.html", { root: staticPath });
});

// Root redirect
app.get("/", (req, res) => {
  res.redirect(301, "/monitoring");
});

// ─── Error Handler ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Server] Error:", err.message);
  res.status(err.status || 500).json({ error: err.message });
});

// ─── Start Server ───────────────────────────────────────────────
const PORT = process.env.PORT || 3458;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Server] MikroMon DEV running on http://0.0.0.0:${PORT}/monitoring`);
  console.log(`[Server] Static path: ${staticPath}`);
  console.log(`[Server] ⚠️  This is the DEV/STAGING instance (port ${PORT})`);
});

// ─── Graceful Shutdown ──────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[Server] ${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => console.error("[Server] Uncaught:", err.message));
process.on("unhandledRejection", (err) => console.error("[Server] Unhandled:", err.message || err));
