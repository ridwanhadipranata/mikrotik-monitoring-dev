/**
 * WhatsApp Gateway — Per-Tenant Manager
 * 
 * Each tenant gets its own WA connection, QR code, auth state, and broadcast queue.
 * Auth stored in wa-auth/{tenantId}/
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode");
const path = require("path");
const fs = require("fs");

const QR_MAX_RETRIES = 5;
const QR_COOLDOWN_MS = 60000;

// ── Per-Tenant Instance ─────────────────────────────────────────
class WaInstance {
  constructor(tenantId) {
    this.tenantId = tenantId;
    this.authDir = path.join(__dirname, "wa-auth", tenantId);
    this.sock = null;
    this.qrImage = null;
    this.status = "disconnected"; // disconnected, connecting, connected
    this.number = null;
    this.lastError = null;
    this.qrRetryCount = 0;
    this.reconnectTimer = null;
    this.broadcastQueue = [];
    this.broadcastRunning = false;
    this.broadcastStats = { sent: 0, failed: 0, total: 0, current: null };

    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  async connect() {
    if (this.sock) return;

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ["MikroMon", "Chrome", "1.0.0"],
      generateHighQualityLinkPreview: false,
    });

    this.sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrRetryCount++;
        console.log(`[WA:${this.tenantId}] QR attempt ${this.qrRetryCount}/${QR_MAX_RETRIES}`);

        if (this.qrRetryCount > QR_MAX_RETRIES) {
          console.log(`[WA:${this.tenantId}] QR max retries. Cooldown ${QR_COOLDOWN_MS / 1000}s...`);
          this.status = "disconnected";
          this.qrImage = null;
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            this.qrRetryCount = 0;
            this.sock = null;
            this.connect();
          }, QR_COOLDOWN_MS);
          return;
        }

        this.qrImage = await qrcode.toDataURL(qr);
        this.status = "connecting";
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

        if (reason === DisconnectReason.loggedOut) {
          console.log(`[WA:${this.tenantId}] Logged out, clearing auth...`);
          this._clearAuth();
        } else {
          console.log(`[WA:${this.tenantId}] Closed (${reason}), reconnecting...`);
          this.status = "connecting";
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            this.sock = null;
            this.connect();
          }, 5000);
        }
      }

      if (connection === "open") {
        this.status = "connected";
        this.number = this.sock.user?.id?.split(":")[0] || "unknown";
        this.qrImage = null;
        this.qrRetryCount = 0;
        console.log(`[WA:${this.tenantId}] Connected as ${this.number}`);
      }
    });

    this.sock.ev.on("creds.update", saveCreds);
    this.sock.ev.on("messages.upsert", () => {});
  }

  async disconnect() {
    if (this.sock) {
      try { await this.sock.logout(); } catch {}
      this.sock = null;
    }
    this._clearAuth();
    this._clearReconnect();
  }

  _clearAuth() {
    this.sock = null;
    this.status = "disconnected";
    this.number = null;
    this.qrImage = null;
    this.qrRetryCount = 0;
    this.broadcastRunning = false;
    try { fs.rmSync(this.authDir, { recursive: true, force: true }); } catch {}
  }

  _clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  getStatus() {
    return {
      status: this.status,
      number: this.number,
      qr: this.qrImage,
      error: this.lastError,
      queue: this.broadcastQueue.length,
      broadcast: this.broadcastStats,
    };
  }

  async sendMessage(phone, text) {
    if (!this.sock || this.status !== "connected") {
      throw new Error("WhatsApp not connected");
    }
    const jid = formatPhone(phone);
    await this.sock.sendMessage(jid, { text });
    return { success: true, jid };
  }

  async broadcastMessages(messages, delayMs = 15000) {
    if (this.broadcastRunning) throw new Error("Broadcast already running");

    this.broadcastRunning = true;
    this.broadcastQueue = [...messages];
    this.broadcastStats = { sent: 0, failed: 0, total: messages.length, current: null };

    console.log(`[WA:${this.tenantId}] Broadcast: ${messages.length} msgs, delay ${delayMs}ms`);

    for (let i = 0; i < messages.length; i++) {
      if (!this.broadcastRunning) break;

      const msg = messages[i];
      this.broadcastStats.current = msg.phone;

      try {
        await this.sendMessage(msg.phone, msg.text);
        this.broadcastStats.sent++;
        console.log(`[WA:${this.tenantId}] Sent ${i + 1}/${messages.length}: ${msg.phone}`);
      } catch (err) {
        this.broadcastStats.failed++;
        console.error(`[WA:${this.tenantId}] Failed ${i + 1}/${messages.length}: ${msg.phone} - ${err.message}`);
      }

      if (i < messages.length - 1) {
        const jitter = delayMs + Math.random() * (delayMs * 0.5);
        await new Promise((r) => setTimeout(r, jitter));
      }
    }

    this.broadcastRunning = false;
    this.broadcastStats.current = null;
    console.log(`[WA:${this.tenantId}] Broadcast done: ${this.broadcastStats.sent} sent, ${this.broadcastStats.failed} failed`);
    return this.broadcastStats;
  }

  stopBroadcast() {
    this.broadcastRunning = false;
    this.broadcastQueue = [];
  }
}

// ── Manager (singleton) ─────────────────────────────────────────
class WaGatewayManager {
  constructor() {
    this.instances = new Map(); // tenantId → WaInstance
  }

  get(tenantId) {
    if (!this.instances.has(tenantId)) {
      this.instances.set(tenantId, new WaInstance(tenantId));
    }
    return this.instances.get(tenantId);
  }

  async connect(tenantId) {
    return this.get(tenantId).connect();
  }

  async disconnect(tenantId) {
    const inst = this.get(tenantId);
    await inst.disconnect();
    this.instances.delete(tenantId);
  }

  getStatus(tenantId) {
    return this.get(tenantId).getStatus();
  }

  async sendMessage(tenantId, phone, text) {
    return this.get(tenantId).sendMessage(phone, text);
  }

  async broadcastMessages(tenantId, messages, delayMs) {
    return this.get(tenantId).broadcastMessages(messages, delayMs);
  }

  stopBroadcast(tenantId) {
    return this.get(tenantId).stopBroadcast();
  }

  /** Get status for ALL tenants (superadmin view) */
  getAllStatus() {
    const result = {};
    for (const [tid, inst] of this.instances) {
      result[tid] = inst.getStatus();
    }
    return result;
  }

  /** Connect all tenants that have auth data on startup */
  async connectAll() {
    const authRoot = path.join(__dirname, "wa-auth");
    if (!fs.existsSync(authRoot)) return;

    const dirs = fs.readdirSync(authRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const tenantId of dirs) {
      try {
        await this.connect(tenantId);
        console.log(`[WA] Auto-connect tenant: ${tenantId}`);
      } catch (err) {
        console.error(`[WA] Auto-connect failed for ${tenantId}:`, err.message);
      }
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────
function formatPhone(phone) {
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("0")) cleaned = "62" + cleaned.slice(1);
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith("62")) cleaned = "62" + cleaned;
  if (!/^\d{10,15}$/.test(cleaned)) throw new Error(`Invalid phone: ${phone}`);
  return cleaned + "@s.whatsapp.net";
}

// Export singleton
module.exports = new WaGatewayManager();
