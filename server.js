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
const { getPrisma, encrypt, decrypt } = require("./lib/db-server");

const app = express();

// ─── Auto-wrap async route handlers (catches promise rejections) ─
const _wrapAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
for (const method of ["get", "post", "put", "delete", "patch"]) {
  const original = app[method].bind(app);
  app[method] = (...args) => {
    const handler = args[args.length - 1];
    if (typeof handler === "function" && handler.constructor.name === "AsyncFunction") {
      args[args.length - 1] = _wrapAsync(handler);
    }
    return original(...args);
  };
}

// ─── Security Middleware ────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : ["http://localhost:3458", "http://localhost:3000"], credentials: true }));
app.use(express.json({ limit: "2mb" }));

// ─── Input Validation Helpers ───────────────────────────────────
function isValidHost(host) {
  return typeof host === "string" && host.length > 0 && host.length <= 255 && /^[\w.\-:]+$/.test(host);
}
function isValidPort(port) {
  const p = Number(port);
  return Number.isInteger(p) && p >= 1 && p <= 65535;
}

// ─── Rate Limiters ──────────────────────────────────────────────
const testRouterLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: "Too many connection tests" } });
const waLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: "Too many WhatsApp requests" } });
const backupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: "Too many restore attempts" } });

// ─── Rate Limiting ─────────────────────────────────────────────
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { error: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." } });
const apiLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 200, message: { error: "Terlalu banyak request. Coba lagi nanti." } });
app.use("/api/auth/login", loginLimiter);
app.use("/api/", apiLimiter);

// ─── Auth Config ────────────────────────────────────────────────
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error("[FATAL] AUTH_SECRET not set in .env"); process.exit(1); }
const BCRYPT_ROUNDS = 12;
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
    JSON.stringify({ sub: user.username, role: user.role, name: user.displayName, tenantId: user.tenantId, iss: "mikromon", iat: Date.now(), exp: Date.now() + AUTH_TOKEN_EXPIRY })
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
    if (data.iss && data.iss !== "mikromon") return null;
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
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    // superadmin always has access
    if (req.user.role === "superadmin") return next();
    if (!roles.includes(req.user.role)) {
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

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(401).json({ error: "Username atau password salah" });

  // Check if user is active
  if (user.isActive === false) return res.status(403).json({ error: "Akun telah dinonaktifkan" });

  // Check if tenant is active
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
  if (!tenant || tenant.isActive === false) return res.status(403).json({ error: "Tenant telah dinonaktifkan" });

  // Support both bcrypt and legacy sha256 hashes
  let passwordValid = false;
  if (user.passwordHash.startsWith("$2b$")) {
    passwordValid = await bcrypt.compare(password, user.passwordHash);
  } else {
    const shaHash = crypto.createHash("sha256").update(password).digest("hex");
    passwordValid = crypto.timingSafeEqual(
      Buffer.from(shaHash.padEnd(64, '0'), 'utf8'),
      Buffer.from(user.passwordHash.padEnd(64, '0'), 'utf8')
    );
    if (passwordValid) {
      await prisma.user.update({
        where: { username },
        data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
      });
    }
  }
  if (!passwordValid) return res.status(401).json({ error: "Username atau password salah" });

  const token = createAuthToken(user);

  res.json({
    token,
    user: { username: user.username, role: user.role, name: user.displayName, tenantId: user.tenantId },
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

  res.json({ valid: true, user: { username: user.sub, role: user.role, name: user.name, tenantId: user.tenantId } });
});

// ─── API: Auth Logout (client-side, but we can log it) ──────────
app.post(["/api/auth/logout", "/monitoring/api/auth/logout"], (req, res) => {
  res.json({ success: true });
});

// ─── User Management (Database) ────────────────────────────────

// GET all users (admin only, tenant-scoped)
app.get(["/api/users", "/monitoring/api/users"], authMiddleware, requireRole("admin"), async (req, res) => {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { tenantId: req.user.tenantId },
    select: { id: true, username: true, role: true, displayName: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(users);
});

// POST create user (admin only, same tenant)
app.post(["/api/users", "/monitoring/api/users"], authMiddleware, requireRole("admin"), async (req, res) => {
  const { username, password, role, displayName } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: "Username, password, dan role wajib diisi" });
  }
  if (!["admin", "staff"].includes(role)) {
    return res.status(400).json({ error: "Role tidak valid. Gunakan: admin, staff" });
  }
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(400).json({ error: "Username sudah digunakan" });

  const user = await prisma.user.create({
    data: {
      tenantId: req.user.tenantId,
      username,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role,
      displayName: displayName || username,
    },
  });
  res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, displayName: user.displayName } });
});

// PUT update user (admin only, same tenant)
app.put(["/api/users/:username", "/monitoring/api/users/:username"], authMiddleware, requireRole("admin"), async (req, res) => {
  const { username } = req.params;
  const { password, role, displayName } = req.body;
  const prisma = getPrisma();

  const user = await prisma.user.findFirst({
    where: { username, tenantId: req.user.tenantId },
  });
  if (!user) return res.status(404).json({ error: "User tidak ditemukan" });

  if (role && !["admin", "staff"].includes(role)) {
    return res.status(400).json({ error: "Role tidak valid. Gunakan: admin, staff" });
  }

  const updateData = {};
  if (password) updateData.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  if (role) updateData.role = role;
  if (displayName) updateData.displayName = displayName;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });
  res.json({ success: true, user: { username: updated.username, role: updated.role, displayName: updated.displayName } });
});

// DELETE user (admin only, same tenant)
app.delete(["/api/users/:username", "/monitoring/api/users/:username"], authMiddleware, requireRole("admin"), async (req, res) => {
  const { username } = req.params;
  if (username === "amanna") return res.status(400).json({ error: "Tidak bisa menghapus akun utama" });

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: { username, tenantId: req.user.tenantId },
  });
  if (!user) return res.status(404).json({ error: "User tidak ditemukan" });

  await prisma.user.delete({ where: { id: user.id } });
  res.json({ success: true });
});

// ─── Tenant Management ──────────────────────────────────────────

// GET current tenant info
app.get(["/api/tenant", "/monitoring/api/tenant"], authMiddleware, async (req, res) => {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.user.tenantId },
    include: { _count: { select: { users: true, routers: true, customers: true, invoices: true } } },
  });
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  res.json(tenant);
});

// GET all tenants (superadmin only)
app.get(["/api/tenants", "/monitoring/api/tenants"], authMiddleware, requireRole("superadmin"), async (req, res) => {
  const prisma = getPrisma();
  const tenants = await prisma.tenant.findMany({
    include: {
      _count: {
        select: {
          users: true,
          routers: { where: { isActive: true } },
          customers: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json(tenants);
});

// POST create tenant (superadmin only)
app.post(["/api/tenants", "/monitoring/api/tenants"], authMiddleware, requireRole("superadmin"), async (req, res) => {
  const { name, slug, description, adminUsername, adminPassword, adminDisplayName } = req.body;
  if (!name || !slug) return res.status(400).json({ error: "Name and slug are required" });
  if (!adminUsername || !adminPassword) return res.status(400).json({ error: "Admin username and password are required" });

  const prisma = getPrisma();

  // Check slug unique
  const existingSlug = await prisma.tenant.findUnique({ where: { slug } });
  if (existingSlug) return res.status(400).json({ error: "Slug sudah digunakan" });

  // Check username unique
  const existingUser = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (existingUser) return res.status(400).json({ error: "Username sudah digunakan" });

  // Create tenant + admin user in transaction
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name, slug, description },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        username: adminUsername,
        passwordHash: await bcrypt.hash(adminPassword, BCRYPT_ROUNDS),
        role: "admin",
        displayName: adminDisplayName || adminUsername,
      },
    });

    return { tenant, user };
  });

  res.json({
    success: true,
    tenant: result.tenant,
    adminUser: { username: result.user.username, role: result.user.role, displayName: result.user.displayName },
  });
});

// PUT update tenant (superadmin only)
app.put(["/api/tenants/:id", "/monitoring/api/tenants/:id"], authMiddleware, requireRole("superadmin"), async (req, res) => {
  const { id } = req.params;
  const { name, description, waNumber } = req.body;
  const prisma = getPrisma();

  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });

  const updateData = {};
  if (name != null) updateData.name = name;
  if (description != null) updateData.description = description;
  if (waNumber !== undefined) updateData.waNumber = waNumber || null;

  const updated = await prisma.tenant.update({ where: { id }, data: updateData });
  res.json({ success: true, tenant: updated });
});

// DELETE tenant (superadmin only)
app.delete(["/api/tenants/:id", "/monitoring/api/tenants/:id"], authMiddleware, requireRole("superadmin"), async (req, res) => {
  const { id } = req.params;
  const prisma = getPrisma();

  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });

  // Check if tenant has active routers
  const routerCount = await prisma.router.count({ where: { tenantId: id, isActive: true } });
  if (routerCount > 0) return res.status(400).json({ error: `Tenant masih memiliki ${routerCount} router aktif. Hapus router terlebih dahulu.` });

  // Soft delete: deactivate tenant and its users
  await prisma.tenant.update({ where: { id }, data: { isActive: false } });
  await prisma.user.updateMany({ where: { tenantId: id }, data: { isActive: false } });

  console.log(`[DB] Tenant deactivated: ${tenant.name}`);
  res.json({ success: true });
});

// GET users for a specific tenant (superadmin only)
app.get(["/api/tenants/:id/users", "/monitoring/api/tenants/:id/users"], authMiddleware, requireRole("superadmin"), async (req, res) => {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { tenantId: req.params.id },
    select: { id: true, username: true, role: true, displayName: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(users);
});

// POST create user for a specific tenant (superadmin only)
app.post(["/api/tenants/:id/users", "/monitoring/api/tenants/:id/users"], authMiddleware, requireRole("superadmin"), async (req, res) => {
  const { username, password, role, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password are required" });

  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(400).json({ error: "Username sudah digunakan" });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: role || "staff",
      displayName: displayName || username,
    },
  });
  res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, displayName: user.displayName } });
});

// PUT update user for a specific tenant (superadmin only)
app.put(["/api/tenants/:tenantId/users/:userId", "/monitoring/api/tenants/:tenantId/users/:userId"], authMiddleware, requireRole("superadmin"), async (req, res) => {
  const { tenantId, userId } = req.params;
  const { password, role, displayName } = req.body;
  const prisma = getPrisma();

  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) return res.status(404).json({ error: "User tidak ditemukan" });

  const updateData = {};
  if (password) updateData.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  if (role) updateData.role = role;
  if (displayName) updateData.displayName = displayName;

  const updated = await prisma.user.update({ where: { id: userId }, data: updateData });
  res.json({ success: true, user: { username: updated.username, role: updated.role, displayName: updated.displayName } });
});

// DELETE user for a specific tenant (superadmin only)
app.delete(["/api/tenants/:tenantId/users/:userId", "/monitoring/api/tenants/:tenantId/users/:userId"], authMiddleware, requireRole("superadmin"), async (req, res) => {
  const { tenantId, userId } = req.params;
  const prisma = getPrisma();

  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) return res.status(404).json({ error: "User tidak ditemukan" });

  await prisma.user.delete({ where: { id: userId } });
  res.json({ success: true });
});

// ─── Router Management (Database) ────────────────────────────────

// In-memory router connections (keyed by router DB id)
const routerConnections = new Map();

// GET all routers for current tenant (or all routers for superadmin)
app.get(["/api/routers", "/monitoring/api/routers"], authMiddleware, async (req, res) => {
  const prisma = getPrisma();
  const where = req.user.role === "superadmin" ? { isActive: true } : { tenantId: req.user.tenantId, isActive: true };

  const routers = await prisma.router.findMany({
    where,
    include: { tenant: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  // Add connection state (use connectionStates which is updated by withMikrotik)
  const result = routers.map(r => {
    const state = connectionStates[r.id] || { status: "disconnected", latency: 0, lastConnected: null };
    return { ...r, status: state.status, latency: state.latency, lastConnected: state.lastConnected };
  });
  res.json(result);
});

// POST create router
app.post(["/api/routers", "/monitoring/api/routers"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { name, host, port, user, password, wanInterface, timeout } = req.body;
    if (!name || !host) return res.status(400).json({ error: "Name and host are required" });
    if (!isValidHost(host)) return res.status(400).json({ error: "Invalid host format" });
    if (port && !isValidPort(port)) return res.status(400).json({ error: "Invalid port" });
    if (name.length > 100) return res.status(400).json({ error: "Name too long" });
    const prisma = getPrisma();

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
    if (!tenant) return res.status(400).json({ error: "Sesi expired. Silakan logout dan login ulang." });

    const router = await prisma.router.create({
      data: {
        tenantId: req.user.tenantId,
        name,
        host,
        port: port || 8728,
        user: user || "admin",
        password: encrypt(password || ""),
        wanInterface: wanInterface || null,
        timeout: timeout || 20,
      },
    });

    // Tambahkan ke DEVICES array dan langsung koneksi
    DEVICES.push({
      id: router.id,
      name: router.name,
      host: router.host,
      port: router.port,
      user: router.user,
      password: password || "",
      timeout: router.timeout,
      wanInterface: router.wanInterface || "",
    });
    ensureConnectionState(router.id);
    console.log(`[DB] Router added: ${router.name} (${router.host})`);

    res.json({ success: true, router: { id: router.id, name: router.name, host: router.host } });
  } catch (err) {
    console.error("[API] Router create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST test router connection (before saving)
app.post(["/api/routers/test", "/monitoring/api/routers/test"], testRouterLimiter, authMiddleware, requireRole("admin", "superadmin"), async (req, res) => {
  const { host, port, user, password, timeout } = req.body;
  if (!host) return res.status(400).json({ error: "Host is required" });
  if (!isValidHost(host)) return res.status(400).json({ error: "Invalid host format" });
  if (port && !isValidPort(port)) return res.status(400).json({ error: "Invalid port" });

  const routerPort = port || 8728;
  const testTimeout = 5000; // 5 detik max

  const testApi = new RouterOSAPI({
    host,
    port: routerPort,
    user: user || "admin",
    password: password || "",
    timeout: testTimeout,
  });

  try {
    await testApi.connect();

    let identity = "Mikrotik";
    try {
      const idRes = await testApi.write("/system/identity/print");
      if (idRes && idRes.length > 0) identity = idRes[0].name || "Mikrotik";
    } catch {}

    let version = "Unknown";
    try {
      const verRes = await testApi.write("/system/resource/print");
      if (verRes && verRes.length > 0) version = verRes[0].version || "Unknown";
    } catch {}

    testApi.close();

    // Get interfaces
    let interfaces = [];
    try {
      const ifApi = new RouterOSAPI({ host, port: routerPort, user: user || "admin", password: password || "", timeout: testTimeout });
      await ifApi.connect();
      const ifRes = await ifApi.write("/interface/print");
      interfaces = (ifRes || []).filter(i => i.disabled !== "true").map(i => ({
        name: i.name || "",
        type: i.type || "unknown",
        running: i.running === "true",
      }));
      ifApi.close();
    } catch {}

    res.json({
      success: true,
      message: `Koneksi berhasil ke ${identity}`,
      info: { identity, version, host, port: routerPort },
      interfaces,
    });
  } catch (err) {
    const errMsg = err.message || String(err);
    let errorMsg = "";

    if (errMsg.includes("ECONNREFUSED")) {
      errorMsg = `Port API ${routerPort} tidak aktif di ${host}. Pastikan API enabled: /ip service set api address=0.0.0.0/0`;
    } else if (errMsg.includes("ENOTFOUND") || errMsg.includes("getaddrinfo")) {
      errorMsg = `IP/Host ${host} tidak ditemukan. Periksa alamat IP router.`;
    } else if (errMsg.includes("ENETUNREACH") || errMsg.includes("EHOSTUNREACH")) {
      errorMsg = `Jaringan tidak terjangkau ke ${host}. Periksa koneksi jaringan.`;
    } else if (errMsg.includes("ETIMEDOUT") || errMsg.includes("timeout") || errMsg.includes("Timeout")) {
      errorMsg = `Koneksi timeout ke ${host}:${routerPort}. Router tidak merespon dalam 5 detik.`;
    } else if (errMsg.includes("ECONNRESET")) {
      errorMsg = `Koneksi ditolak oleh ${host}. Firewall memblokir port ${routerPort}.`;
    } else if (errMsg.includes("login") || errMsg.includes("password") || errMsg.includes("auth")) {
      errorMsg = `Username atau password salah. Periksa kredensial API Mikrotik.`;
    } else if (errMsg.includes("socket hang up") || errMsg.includes("closed")) {
      errorMsg = `Koneksi ditutup oleh ${host}. Port ${routerPort} benar? API service aktif?`;
    } else if (errMsg.includes("RosException") || errMsg.includes("Error")) {
      errorMsg = `Gagal terhubung ke ${host}:${routerPort}. Periksa IP, port, dan kredensial.`;
    } else {
      errorMsg = `Gagal terhubung ke ${host}:${routerPort} — ${errMsg}`;
    }

    res.status(400).json({ success: false, error: errorMsg });
  }
});

// PUT update router
app.put(["/api/routers/:id", "/monitoring/api/routers/:id"], authMiddleware, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { name, host, port, user, password, wanInterface, timeout, isActive } = req.body;
  const prisma = getPrisma();

  const router = await prisma.router.findFirst({ where: { id, tenantId: req.user.tenantId } });
  if (!router) return res.status(404).json({ error: "Router tidak ditemukan" });

  const updateData = {};
  if (name != null) updateData.name = name;
  if (host != null) updateData.host = host;
  if (port != null) updateData.port = port;
  if (user != null) updateData.user = user;
  if (password != null) updateData.password = encrypt(password);
  if (wanInterface != null) updateData.wanInterface = wanInterface;
  if (timeout != null) updateData.timeout = timeout;
  if (isActive != null) updateData.isActive = isActive;

  // Close existing connection if host/port changed
  if (host || port || password) {
    const conn = routerConnections.get(id);
    if (conn) { try { conn.api.close(); } catch {} routerConnections.delete(id); }
  }

  const updated = await prisma.router.update({ where: { id }, data: updateData });
  res.json({ success: true, router: { id: updated.id, name: updated.name, host: updated.host } });
});

// DELETE router
app.delete(["/api/routers/:id", "/monitoring/api/routers/:id"], authMiddleware, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const prisma = getPrisma();
  const where = req.user.role === "superadmin" ? { id } : { id, tenantId: req.user.tenantId };
  const router = await prisma.router.findFirst({ where });
  if (!router) return res.status(404).json({ error: "Router tidak ditemukan" });

  // Close connection
  const conn = routerConnections.get(id);
  if (conn) { try { conn.api.close(); } catch {} routerConnections.delete(id); }
  apiConnections.delete(id);

  // Hapus dari DEVICES array
  const idx = DEVICES.findIndex(d => d.id === id);
  if (idx !== -1) DEVICES.splice(idx, 1);

  // Cleanup in-memory state
  delete connectionStates[id];
  delete pingCache[id];
  delete mrtgRealtime[id];
  for (const interval of Object.keys(mrtgIntervals)) {
    delete mrtgIntervals[interval][id];
  }

  await prisma.router.update({ where: { id }, data: { isActive: false } });
  console.log(`[DB] Router removed: ${router.name} (${router.host})`);
  res.json({ success: true });
});

// ─── Dynamic Device Resolution ────────────────────────────────
// Legacy DEVICES array (fallback for env-based routers)
const LEGACY_DEVICES = [
  { id: "1", name: process.env.MIKROTIK_1_NAME || "Router 1", host: process.env.MIKROTIK_1_HOST || "127.0.0.1", port: parseInt(process.env.MIKROTIK_1_PORT || "8728"), user: process.env.MIKROTIK_1_USER || "admin", password: process.env.MIKROTIK_1_PASS || "", timeout: 20, wanInterface: process.env.MIKROTIK_1_WAN || "" },
  { id: "2", name: process.env.MIKROTIK_2_NAME || "Router 2", host: process.env.MIKROTIK_2_HOST || "127.0.0.1", port: parseInt(process.env.MIKROTIK_2_PORT || "8728"), user: process.env.MIKROTIK_2_USER || "admin", password: process.env.MIKROTIK_2_PASS || "", timeout: 15, wanInterface: process.env.MIKROTIK_2_WAN || "" },
  { id: "3", name: process.env.MIKROTIK_3_NAME || "Router 3", host: process.env.MIKROTIK_3_HOST || "127.0.0.1", port: parseInt(process.env.MIKROTIK_3_PORT || "8728"), user: process.env.MIKROTIK_3_USER || "admin", password: process.env.MIKROTIK_3_PASS || "", timeout: 15, wanInterface: process.env.MIKROTIK_3_WAN || "" },
];

const DEVICES = LEGACY_DEVICES;

// ─── Sync DB routers to DEVICES array ───────────────────────────
async function syncRoutersFromDB() {
  try {
    const prisma = getPrisma();
    const dbRouters = await prisma.router.findMany({ where: { isActive: true } });
    if (dbRouters.length === 0) return; // keep legacy devices

    // Replace DEVICES with DB routers
    DEVICES.length = 0;
    for (const r of dbRouters) {
      DEVICES.push({
        id: r.id,
        name: r.name,
        host: r.host,
        port: r.port,
        user: r.user,
        password: decrypt(r.password),
        timeout: r.timeout,
        wanInterface: r.wanInterface || "",
      });
      ensureConnectionState(r.id);
    }
    console.log(`[DB] Synced ${DEVICES.length} routers from database`);
  } catch (err) {
    console.error("[DB] Router sync error:", err.message);
  }
}

// Sync on startup
syncRoutersFromDB().catch(e => console.error("[DB] Init sync error:", e.message));

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
function ensureConnectionState(deviceId) {
  if (!connectionStates[deviceId]) {
    connectionStates[deviceId] = {
      status: "disconnected",
      latency: 0,
      lastError: null,
      reconnects: 0,
      lastConnected: null,
    };
  }
  return connectionStates[deviceId];
}
for (const d of DEVICES) {
  ensureConnectionState(d.id);
}

// ─── Fresh Connection Helper ────────────────────────────────────
// ── Persistent Connection Pool ──────────────────────────────────
const apiConnections = new Map(); // deviceId → { api, connected }

async function withMikrotik(deviceId, fn) {
  const device = getDevice(deviceId);
  const state = ensureConnectionState(device.id);

  // Reuse existing connection
  const existing = apiConnections.get(device.id);
  if (existing && existing.connected) {
    try {
      const result = await fn(existing.api);
      state.status = "connected";
      state.lastConnected = new Date().toISOString();
      return result;
    } catch (err) {
      // Connection might be stale, reconnect
      console.log(`[API] Connection stale for ${device.name}, reconnecting...`);
      existing.connected = false;
      try { existing.api.close(); } catch {}
    }
  }

  // Create new connection
  console.log(`[API] New connection to ${device.name}`);
  const api = new RouterOSAPI({
    host: device.host,
    port: device.port,
    user: device.user,
    password: device.password,
    timeout: device.timeout,
    keepalive: true,
  });

  try {
    await api.connect();
    apiConnections.set(device.id, { api, connected: true });
    state.status = "connected";
    state.reconnects++;
    state.lastConnected = new Date().toISOString();
    state.lastError = null;

    const result = await fn(api);
    return result;
  } catch (err) {
    state.status = "error";
    state.lastError = err.message;
    apiConnections.delete(device.id);
    try { api.close(); } catch {}
    throw err;
  }
}

// ─── Connection Health Check (every 60s) ───────────────────────
async function checkConnections() {
  for (const device of DEVICES) {
    const conn = apiConnections.get(device.id);
    if (!conn || !conn.connected) continue;
    try {
      await conn.api.write("/system/identity/print");
    } catch (err) {
      console.log(`[API] Health check failed for ${device.name}: ${err.message}`);
      conn.connected = false;
      try { conn.api.close(); } catch {}
      apiConnections.delete(device.id);
      const state = connectionStates[device.id];
      if (state) {
        state.status = "disconnected";
        state.lastError = "Health check failed: " + err.message;
      }
    }
  }
}
setInterval(checkConnections, 60000);

// Helper to extract device ID from query param
function deviceId(req) {
  const did = req.query.device || req.query.deviceId || DEVICES[0].id;
  const validIds = new Set(DEVICES.map(d => d.id));
  return validIds.has(String(did)) ? String(did) : DEVICES[0].id;
}

// Check if device belongs to tenant
async function assertDeviceAccess(req, res, did) {
  if (req.user.role === "superadmin") return true;
  const prisma = getPrisma();
  const router = await prisma.router.findFirst({ where: { id: did, tenantId: req.user.tenantId, isActive: true } });
  if (!router) {
    res.status(403).json({ error: "Access denied. Router not in your tenant." });
    return false;
  }
  return true;
}

// ─── API: Device List ──────────────────────────────────────────
app.get(["/api/devices", "/monitoring/api/devices"], authMiddleware, async (req, res) => {
  const prisma = getPrisma();
  const where = req.user.role === "superadmin" ? { isActive: true } : { tenantId: req.user.tenantId, isActive: true };

  const dbRouters = await prisma.router.findMany({
    where,
    include: { tenant: { select: { id: true, name: true, slug: true } } },
  });

  const devices = dbRouters.map((r) => {
    const state = connectionStates[r.id] || { status: "disconnected", latency: 0, lastConnected: null };
    return {
      id: r.id,
      name: r.name,
      host: r.host,
      port: r.port,
      wanInterface: r.wanInterface || null,
      status: state.status === "connected" ? "online" : state.status === "error" ? "offline" : "connecting",
      lastSeen: state.lastConnected ? new Date(state.lastConnected) : null,
      tenant: r.tenant,
    };
  });
  res.json(devices);
});

// ─── API: Health Check ──────────────────────────────────────────
app.get(["/api/ping", "/monitoring/api/ping"], authMiddleware, async (req, res) => {
  try {
    const did = deviceId(req);
    if (!(await assertDeviceAccess(req, res, did))) return;
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
app.get(["/api/connection", "/monitoring/api/connection"], authMiddleware, async (req, res) => {
  const did = deviceId(req);
  if (!(await assertDeviceAccess(req, res, did))) return;
  res.json({ device: did, ...connectionStates[did] });
});

// ─── API: System Resource ───────────────────────────────────────
app.get(["/api/resource", "/monitoring/api/resource"], authMiddleware, async (req, res) => {
  try {
    const did = deviceId(req);
    if (!(await assertDeviceAccess(req, res, did))) return;
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
app.get(["/api/interfaces", "/monitoring/api/interfaces"], authMiddleware, async (req, res) => {
  try {
    const did = deviceId(req);
    if (!(await assertDeviceAccess(req, res, did))) return;
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
app.get(["/api/firewall", "/monitoring/api/firewall"], authMiddleware, async (req, res) => {
  try {
    const did = deviceId(req);
    if (!(await assertDeviceAccess(req, res, did))) return;
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
app.get(["/api/dhcp", "/monitoring/api/dhcp"], authMiddleware, async (req, res) => {
  try {
    const did = deviceId(req);
    if (!(await assertDeviceAccess(req, res, did))) return;
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
app.get(["/api/connections", "/monitoring/api/connections"], authMiddleware, async (req, res) => {
  try {
    const did = deviceId(req);
    if (!(await assertDeviceAccess(req, res, did))) return;
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
async function mikrotikPing(api, ips, concurrency = 100) {
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
    // No delay - fast ping
  }
  return results;
}

// ─── Ping Cache (heavy - pings 700+ IPs via router) ────────────
// ─── Bot Status Cache (read from monitor-bot data) ────────────
const BOT_STATUS_FILE = path.join(__dirname, "data", "client-status.json");
function getBotStatus() {
  try {
    if (fs.existsSync(BOT_STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(BOT_STATUS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

// ─── API: Client Queue Data (lightweight, no ping) ──────────────
app.get(["/api/clients", "/monitoring/api/clients"], authMiddleware, async (req, res) => {
  try {
    const did = deviceId(req);
    if (!(await assertDeviceAccess(req, res, did))) return;
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

      // Merge with bot status data (single source of truth)
      const botStatus = getBotStatus();

      const merged = clients.map(c => {
        const key = `${did}:${c.name}`;
        const entry = botStatus[key];
        const alive = entry ? entry.status === "up" : false;
        const latency = entry?.latency ?? null;
        return { ...c, alive, latency };
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

// ─── API: Client Ping (reads from bot data — lightweight) ─────
app.get(["/api/clients/ping", "/monitoring/api/clients/ping"], authMiddleware, async (req, res) => {
  try {
    const did = deviceId(req);
    if (!(await assertDeviceAccess(req, res, did))) return;

    // Read from bot status (single source of truth)
    const botStatus = getBotStatus();
    const results = {};

    for (const [key, entry] of Object.entries(botStatus)) {
      if (key.startsWith(did + ":")) {
        // Extract client name from key
        const name = key.slice(did.length + 1);
        // Find IPs from queue data (we need to map name → IPs)
        // For now, return status by name
        results[name] = {
          status: entry.status,
          latency: entry.latency,
          changedAt: entry.changedAt,
        };
      }
    }

    res.json({ results, source: "bot", cachedAt: Date.now() });
  } catch (err) {
    console.error("[API] Clients ping error:", err.message);
    res.status(500).json({ error: "Failed to get ping data" });
  }
});

// ─── API: Client Status Log (from monitor-bot) ────────────────────
app.get(["/api/status-log", "/monitoring/api/status-log"], authMiddleware, async (req, res) => {
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
app.get(["/api/mrtg", "/monitoring/api/mrtg"], authMiddleware, async (req, res) => {
  const did = deviceId(req);
  if (!(await assertDeviceAccess(req, res, did))) return;
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
app.get(["/api/wan-traffic", "/monitoring/api/wan-traffic"], authMiddleware, async (req, res) => {
  try {
    const did = deviceId(req);
    if (!(await assertDeviceAccess(req, res, did))) return;
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
// BILLING SYSTEM (Database-backed)
// ═══════════════════════════════════════════════════════════════
const billingDb = require("./lib/billing-db");

// Helper: superadmin sees all tenants, others scoped to their tenant
function billingTenantId(req) {
  return req.user.role === "superadmin" ? null : req.user.tenantId;
}

// ── Packages CRUD ─────────────────────────────────────────────
app.get(["/api/billing/packages", "/monitoring/api/billing/packages"], authMiddleware, requireRole("admin", "staff"), async (req, res) => {
  try {
    const did = req.query.deviceId || req.query.device || null;
    const packages = await billingDb.getPackages(billingTenantId(req), did);
    res.json(packages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/api/billing/packages", "/monitoring/api/billing/packages"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { name, speedUp, speedDown, price, description, tenantId: targetTenantId, deviceId: did } = req.body;
    if (!name || price == null) return res.status(400).json({ error: "Name and price are required" });
    // For superadmin, allow specifying tenantId; otherwise use own tenant
    let tenantId = req.user.tenantId;
    if (req.user.role === "superadmin" && targetTenantId) {
      tenantId = targetTenantId;
    }
    const pkg = await billingDb.createPackage(tenantId, { name, speedUp, speedDown, price, description, routerId: did });
    res.json(pkg);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put(["/api/billing/packages/:id", "/monitoring/api/billing/packages/:id"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { name, speedUp, speedDown, price, description } = req.body;
    const pkg = await billingDb.updatePackage(req.params.id, billingTenantId(req), { name, speedUp, speedDown, price, description });
    res.json(pkg);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete(["/api/billing/packages/:id", "/monitoring/api/billing/packages/:id"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    await billingDb.deletePackage(req.params.id, billingTenantId(req));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Simple Queues (from Mikrotik) ─────────────────────────────
app.get(["/api/billing/queues", "/monitoring/api/billing/queues"], authMiddleware, async (req, res) => {
  try {
    const did = deviceId(req);
    if (!(await assertDeviceAccess(req, res, did))) return;
    const customers = await billingDb.getCustomers(billingTenantId(req), did);
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
app.get(["/api/billing/customers", "/monitoring/api/billing/customers"], authMiddleware, requireRole("admin", "staff"), async (req, res) => {
  try {
    const did = req.query.deviceId || req.query.device || null;
    const customers = await billingDb.getCustomers(billingTenantId(req), did);
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/api/billing/customers", "/monitoring/api/billing/customers"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { name, address, phone, packageId, simpleQueue, billingDay, status, installDate, lat, lng, routerId: rid, deviceId: did } = req.body;
    const routerId = rid || did;
    if (!name || !packageId || !simpleQueue || !routerId) return res.status(400).json({ error: "Name, package, router, and simple queue are required" });
    // For superadmin, use the router's tenantId
    let tenantId = req.user.tenantId;
    if (req.user.role === "superadmin") {
      const prisma = getPrisma();
      const router = await prisma.router.findUnique({ where: { id: routerId }, select: { tenantId: true } });
      if (!router) return res.status(400).json({ error: "Router tidak ditemukan" });
      tenantId = router.tenantId;
    }
    const cust = await billingDb.createCustomer(tenantId, { name, address, phone, packageId, simpleQueue, billingDay, status, installDate, lat, lng, routerId });
    res.json(cust);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put(["/api/billing/customers/:id", "/monitoring/api/billing/customers/:id"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { name, address, phone, packageId, simpleQueue, billingDay, status, installDate, lat, lng } = req.body;
    const cust = await billingDb.updateCustomer(req.params.id, billingTenantId(req), { name, address, phone, packageId, simpleQueue, billingDay, status, installDate, lat, lng });
    res.json(cust);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete(["/api/billing/customers/:id", "/monitoring/api/billing/customers/:id"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    await billingDb.deleteCustomer(req.params.id, billingTenantId(req));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Invoices CRUD ─────────────────────────────────────────────
app.get(["/api/billing/invoices", "/monitoring/api/billing/invoices"], authMiddleware, requireRole("admin", "staff"), async (req, res) => {
  try {
    const did = req.query.deviceId || req.query.device || null;
    const filters = { status: req.query.status, customerId: req.query.customerId, month: req.query.month, year: req.query.year };
    const invoices = await billingDb.getInvoices(billingTenantId(req), did, filters);
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/api/billing/invoices", "/monitoring/api/billing/invoices"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { customerId, month, year, amount, dueDate, notes } = req.body;
    if (!customerId || !month || !year) return res.status(400).json({ error: "Customer, month, and year are required" });
    // For superadmin, use the customer's tenantId
    let tenantId = req.user.tenantId;
    if (req.user.role === "superadmin") {
      const prisma = getPrisma();
      const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { tenantId: true } });
      if (!customer) return res.status(400).json({ error: "Customer tidak ditemukan" });
      tenantId = customer.tenantId;
    }
    const inv = await billingDb.createInvoice(tenantId, { customerId, month, year, amount, dueDate, notes });
    res.json(inv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put(["/api/billing/invoices/:id", "/monitoring/api/billing/invoices/:id"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { status, paidDate, amount, dueDate, notes, discount } = req.body;
    const inv = await billingDb.updateInvoice(req.params.id, billingTenantId(req), { status, paidDate, amount, dueDate, notes, discount });
    res.json(inv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete(["/api/billing/invoices/:id", "/monitoring/api/billing/invoices/:id"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    await billingDb.deleteInvoice(req.params.id, billingTenantId(req));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Billing Summary ───────────────────────────────────────────
app.get(["/api/billing/summary", "/monitoring/api/billing/summary"], authMiddleware, requireRole("admin", "staff"), async (req, res) => {
  try {
    const did = req.query.deviceId || req.query.device || null;
    const summary = await billingDb.getBillingSummary(billingTenantId(req), did);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Auto-generate invoices ─────────────────────────────────────
app.post(["/api/billing/generate-invoices", "/monitoring/api/billing/generate-invoices"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { month, year, deviceId: did } = req.body;
    if (!month || !year) return res.status(400).json({ error: "Month and year are required" });
    const result = await billingDb.generateInvoices(billingTenantId(req), month, year, did);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Billing: list devices with counts ─────────────────────────
app.get(["/api/billing/devices", "/monitoring/api/billing/devices"], authMiddleware, requireRole("admin", "staff"), async (req, res) => {
  try {
    const devices = await billingDb.getBillingDevices(billingTenantId(req));
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Backup & Restore ──────────────────────────────────────────
app.get(["/api/backup", "/monitoring/api/backup"], authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const did = req.query.deviceId || req.query.device || null;
    const data = await billingDb.getBackupData(billingTenantId(req), did);

    const device = did ? DEVICES.find(d => d.id === did) : DEVICES[0];

    const backup = {
      version: "2.0",
      timestamp: new Date().toISOString(),
      deviceId: did,
      deviceName: device?.name || did,
      data,
      meta: { packages: data.packages.length, customers: data.customers.length, invoices: data.invoices.length },
    };

    res.setHeader("Content-Type", "application/json");
    const safeName = (device?.name || did || "all").replace(/[^a-zA-Z0-9]/g, "-").slice(0, 30);
    res.setHeader("Content-Disposition", `attachment; filename="mikromon-${safeName}-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/api/backup/restore", "/monitoring/api/backup/restore"], backupLimiter, authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { data, mode } = req.body;

    if (!data || !Array.isArray(data.packages) || !Array.isArray(data.customers) || !Array.isArray(data.invoices)) {
      return res.status(400).json({ error: "Invalid backup file format" });
    }
    if (data.packages.length > 1000 || data.customers.length > 10000 || data.invoices.length > 100000) {
      return res.status(400).json({ error: "Backup data too large" });
    }

    const restored = await billingDb.restoreBackup(req.user.tenantId, data, mode);

    res.json({
      success: true,
      message: mode === "replace" ? "Data berhasil di-restore" : "Data berhasil di-merge",
      restored,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(["/api/backup/info", "/monitoring/api/backup/info"], authMiddleware, requireRole("admin", "staff"), async (req, res) => {
  try {
    const did = req.query.deviceId || req.query.device || null;
    const info = await billingDb.getBackupInfo(billingTenantId(req), did);
    res.json({ deviceId: did, ...info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(["/api/backup/info-all", "/monitoring/api/backup/info-all"], authMiddleware, requireRole("admin", "staff"), async (req, res) => {
  try {
    const prisma = getPrisma();
    const routers = await prisma.router.findMany({ where: { tenantId: req.user.tenantId, isActive: true } });

    const devices = [];
    for (const r of routers) {
      const info = await billingDb.getBackupInfo(billingTenantId(req), r.id);
      devices.push({ id: r.id, name: r.name, ...info });
    }

    const allInfo = await billingDb.getBackupInfo(billingTenantId(req));

    res.json({ all: allInfo, devices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// WHATSAPP GATEWAY
// ═══════════════════════════════════════════════════════════════
// Router Connection Failure Notifications (UI only)
// ═══════════════════════════════════════════════════════════════
const NOTIF_FILE = path.join(__dirname, "data", "router-notifications.json");

function loadNotifFile() {
  try {
    if (fs.existsSync(NOTIF_FILE)) return JSON.parse(fs.readFileSync(NOTIF_FILE, "utf-8"));
  } catch {}
  return { pending: [], history: [] };
}

function saveNotifFile(data) {
  try {
    fs.writeFileSync(NOTIF_FILE + ".tmp", JSON.stringify(data, null, 2));
    fs.renameSync(NOTIF_FILE + ".tmp", NOTIF_FILE);
  } catch {}
}
// Initialize WhatsApp on startup (auto-connect tenants with existing auth)
waGateway.connectAll().catch(err => console.error("[WA] Init error:", err.message));

// ── WA Status (per-tenant) ─────────────────────────────────────
app.get(["/api/wa/status", "/monitoring/api/wa/status"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  const tenantId = req.user.tenantId;
  res.json(waGateway.getStatus(tenantId));
});

// ── WA Status All Tenants (superadmin) ─────────────────────────
app.get(["/api/wa/status-all", "/monitoring/api/wa/status-all"], authMiddleware, requireRole("superadmin"), (req, res) => {
  res.json(waGateway.getAllStatus());
});

// ── WA Status for specific tenant (superadmin) ─────────────────
app.get(["/api/wa/status/:tenantId", "/monitoring/api/wa/status/:tenantId"], authMiddleware, requireRole("superadmin"), (req, res) => {
  res.json(waGateway.getStatus(req.params.tenantId));
});

// ── WA Connect for specific tenant (superadmin) ────────────────
app.post(["/api/wa/connect/:tenantId", "/monitoring/api/wa/connect/:tenantId"], waLimiter, authMiddleware, requireRole("superadmin"), async (req, res) => {
  try {
    await waGateway.connect(req.params.tenantId);
    res.json({ success: true, message: "Connecting... check QR" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WA Disconnect for specific tenant (superadmin) ─────────────
app.post(["/api/wa/disconnect/:tenantId", "/monitoring/api/wa/disconnect/:tenantId"], waLimiter, authMiddleware, requireRole("superadmin"), async (req, res) => {
  try {
    await waGateway.disconnect(req.params.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WA Connect (per-tenant, start QR flow) ─────────────────────
app.post(["/api/wa/connect", "/monitoring/api/wa/connect"], waLimiter, authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    await waGateway.connect(tenantId);
    res.json({ success: true, message: "Connecting... check QR" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WA Disconnect (per-tenant) ──────────────────────────────────
app.post(["/api/wa/disconnect", "/monitoring/api/wa/disconnect"], waLimiter, authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    await waGateway.disconnect(tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WA Send Single Message (per-tenant) ────────────────────────
app.post(["/api/wa/send", "/monitoring/api/wa/send"], waLimiter, authMiddleware, requireRole("admin"), async (req, res) => {
  const { phone, text } = req.body;
  if (!phone || !text) return res.status(400).json({ error: "Phone and text are required" });
  try {
    const tenantId = req.user.tenantId;
    const result = await waGateway.sendMessage(tenantId, phone, text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WA Send Invoice to Customer ────────────────────────────────
app.post(["/api/wa/send-invoice", "/monitoring/api/wa/send-invoice"], waLimiter, authMiddleware, requireRole("admin"), async (req, res) => {
  const { invoiceId } = req.body;
  if (!invoiceId) return res.status(400).json({ error: "Invoice ID is required" });

  try {
    const prisma = getPrisma();
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: req.user.tenantId },
      include: { customer: { include: { package: true } } },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const customer = invoice.customer;
    if (!customer.phone) return res.status(400).json({ error: "Customer has no phone number" });

    const text = generateInvoiceText({
      invoice,
      customer,
      packageName: customer.package ? customer.package.name : "-",
    });

    const result = await waGateway.sendMessage(req.user.tenantId, customer.phone, text);
    res.json({ ...result, customer: customer.name, phone: customer.phone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WA Broadcast to All Unpaid ─────────────────────────────────
app.post(["/api/wa/broadcast", "/monitoring/api/wa/broadcast"], waLimiter, authMiddleware, requireRole("admin"), async (req, res) => {
  const { deviceId, delay } = req.body;
  const did = deviceId || null;
  const delayMs = (delay || 15) * 1000; // default 15 seconds

  try {
    const prisma = getPrisma();
    const where = { tenantId: req.user.tenantId, status: "unpaid" };
    if (did) where.routerId = did;

    const invoices = await prisma.invoice.findMany({
      where,
      include: { customer: { include: { package: true } } },
    });

    // Group by customer
    const unpaidByCustomer = {};
    for (const inv of invoices) {
      if (!unpaidByCustomer[inv.customerId]) unpaidByCustomer[inv.customerId] = [];
      unpaidByCustomer[inv.customerId].push(inv);
    }

    const messages = [];
    for (const [customerId, customerInvoices] of Object.entries(unpaidByCustomer)) {
      const customer = customerInvoices[0].customer;
      if (!customer.phone) continue;

      const text = generateAllUnpaidText({
        invoices: customerInvoices,
        customer,
        packageName: customer.package ? customer.package.name : "-",
      });

      messages.push({ phone: customer.phone, text, customerName: customer.name });
    }

    if (messages.length === 0) {
      return res.json({ success: true, message: "Tidak ada tagihan belum bayar", total: 0 });
    }

    waGateway.broadcastMessages(req.user.tenantId, messages, delayMs).catch(err => {
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
  res.json(waGateway.getStatus(req.user.tenantId).broadcast);
});

// ── WA Stop Broadcast ──────────────────────────────────────────
app.post(["/api/wa/broadcast-stop", "/monitoring/api/wa/broadcast-stop"], authMiddleware, requireRole("admin", "admin_pembayaran"), (req, res) => {
  waGateway.stopBroadcast(req.user.tenantId);
  res.json({ success: true });
});

// ─── Static Files & Routing ─────────────────────────────────────
const staticPath = path.resolve(__dirname, "out");
const pageFiles = ["traffic", "devices", "routers", "tenants", "alerts", "settings", "settings/users", "login", "clients", "mrtg", "billing", "billing/packages", "billing/customers", "billing/invoices", "billing/history", "billing/map", "billing/monthly", "billing/whatsapp", "billing/backup"];

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

// ─── Async Wrapper (prevents uncaught exceptions in routes) ────
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ─── Error Handler ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  const msg = err?.message || String(err);
  // Transient MikroTik errors → 503, not 500
  if (msg.includes("Timed out") || msg.includes("SOCKTMOUT") || msg.includes("Connection reset") || msg.includes("ECONNRESET")) {
    console.error("[Server] MikroTik error:", msg);
    return res.status(503).json({ error: "Router unavailable. Try again." });
  }
  console.error("[Server] Error:", msg);
  res.status(err.status || 500).json({ error: msg });
});

// ─── API: Router Notifications ─────────────────────────────────
app.get(["/api/notifications", "/monitoring/api/notifications"], authMiddleware, (req, res) => {
  const notifs = loadNotifFile();
  res.json(notifs);
});

app.post(["/api/notifications/clear", "/monitoring/api/notifications/clear"], authMiddleware, requireRole("superadmin"), (req, res) => {
  const notifs = loadNotifFile();
  notifs.pending = [];
  saveNotifFile(notifs);
  res.json({ success: true });
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
  // Close all persistent API connections
  for (const [id, conn] of apiConnections) {
    try { conn.api.close(); } catch {}
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
// ─── Transient errors that should NOT crash the process ────────
const TRANSIENT_ERRORS = [
  "SOCKTMOUT", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT",
  "EPIPE", "ENETUNREACH", "EHOSTUNREACH",
  "RosException", "Timed out", "Connection reset",
  "Connection closed", "socket hang up",
];

function isTransientError(err) {
  const msg = err?.message || String(err);
  const code = err?.code || err?.errno || "";
  return TRANSIENT_ERRORS.some(e => msg.includes(e) || code === e);
}

process.on("uncaughtException", (err) => {
  if (isTransientError(err)) {
    console.error("[Server] Transient error (continuing):", err.message);
    return; // Don't exit — just log and keep running
  }
  console.error("[Server] Fatal uncaught:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  const error = err instanceof Error ? err : new Error(String(err));
  if (isTransientError(error)) {
    console.error("[Server] Transient rejection (continuing):", error.message);
    return;
  }
  console.error("[Server] Fatal rejection:", error);
  process.exit(1);
});
