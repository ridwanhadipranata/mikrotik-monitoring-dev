const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeInMemoryStore } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode");
const path = require("path");
const fs = require("fs");

const AUTH_DIR = path.join(__dirname, "wa-auth");
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

let sock = null;
let qrCode = null;
let qrImage = null;
let connectionStatus = "disconnected"; // disconnected, connecting, connected
let connectedNumber = null;
let lastError = null;

// Broadcast queue
let broadcastQueue = [];
let broadcastRunning = false;
let broadcastStats = { sent: 0, failed: 0, total: 0, current: null };

async function connectWhatsApp() {
  if (sock) return;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["MikroMon", "Chrome", "1.0.0"],
    generateHighQualityLinkPreview: false,
  });

  // QR Code event
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCode = qr;
      qrImage = await qrcode.toDataURL(qr);
      connectionStatus = "connecting";
      console.log("[WA] QR Code generated, scan from WhatsApp");
    }

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

      if (reason === DisconnectReason.loggedOut) {
        console.log("[WA] Logged out, clearing auth...");
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        sock = null;
        connectionStatus = "disconnected";
        qrCode = null;
        qrImage = null;
        connectedNumber = null;
      } else {
        console.log(`[WA] Connection closed, reason: ${reason}, reconnecting...`);
        connectionStatus = "connecting";
        setTimeout(() => {
          sock = null;
          connectWhatsApp();
        }, 3000);
      }
    }

    if (connection === "open") {
      connectionStatus = "connected";
      connectedNumber = sock.user?.id?.split(":")[0] || "unknown";
      qrCode = null;
      qrImage = null;
      console.log(`[WA] Connected as ${connectedNumber}`);
    }
  });

  // Save credentials on update
  sock.ev.on("creds.update", saveCreds);

  // Message events (optional: for auto-reply or logging)
  sock.ev.on("messages.upsert", (m) => {
    // Can add auto-reply logic here if needed
  });
}

function getStatus() {
  return {
    status: connectionStatus,
    number: connectedNumber,
    qr: qrImage,
    error: lastError,
    queue: broadcastQueue.length,
    broadcast: broadcastStats,
  };
}

async function disconnectWhatsApp() {
  if (sock) {
    try {
      await sock.logout();
    } catch {}
    sock = null;
  }
  connectionStatus = "disconnected";
  connectedNumber = null;
  qrCode = null;
  qrImage = null;
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
}

function formatPhone(phone) {
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("0")) cleaned = "62" + cleaned.slice(1);
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith("62")) cleaned = "62" + cleaned;
  return cleaned + "@s.whatsapp.net";
}

async function sendMessage(phone, text) {
  if (!sock || connectionStatus !== "connected") {
    throw new Error("WhatsApp not connected");
  }

  const jid = formatPhone(phone);
  await sock.sendMessage(jid, { text });
  return { success: true, jid };
}

// Broadcast with delay
async function broadcastMessages(messages, delayMs = 15000) {
  if (broadcastRunning) {
    throw new Error("Broadcast already running");
  }

  broadcastRunning = true;
  broadcastQueue = [...messages];
  broadcastStats = { sent: 0, failed: 0, total: messages.length, current: null };

  console.log(`[WA] Starting broadcast: ${messages.length} messages, delay ${delayMs}ms`);

  for (let i = 0; i < messages.length; i++) {
    if (!broadcastRunning) break;

    const msg = messages[i];
    broadcastStats.current = msg.phone;

    try {
      await sendMessage(msg.phone, msg.text);
      broadcastStats.sent++;
      console.log(`[WA] Sent ${i + 1}/${messages.length}: ${msg.phone}`);
    } catch (err) {
      broadcastStats.failed++;
      console.error(`[WA] Failed ${i + 1}/${messages.length}: ${msg.phone} - ${err.message}`);
    }

    // Delay between messages (except last one)
    if (i < messages.length - 1) {
      // Random delay between delayMs and delayMs * 1.5
      const jitter = delayMs + Math.random() * (delayMs * 0.5);
      await new Promise((r) => setTimeout(r, jitter));
    }
  }

  broadcastRunning = false;
  broadcastStats.current = null;
  console.log(`[WA] Broadcast done: ${broadcastStats.sent} sent, ${broadcastStats.failed} failed`);
  return broadcastStats;
}

function stopBroadcast() {
  broadcastRunning = false;
  broadcastQueue = [];
}

module.exports = {
  connectWhatsApp,
  disconnectWhatsApp,
  getStatus,
  sendMessage,
  broadcastMessages,
  stopBroadcast,
};
