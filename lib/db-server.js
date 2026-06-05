/**
 * Database module for server.js (CommonJS)
 * Uses Prisma with better-sqlite3 adapter
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const crypto = require("crypto");

let prismaInstance = null;

function getPrisma() {
  if (!prismaInstance) {
    const adapter = new PrismaBetterSqlite3({
      url: "file:./dev.db",
    });
    prismaInstance = new PrismaClient({ adapter });
  }
  return prismaInstance;
}

// AES-256 encryption for router passwords
const ENC_KEY = process.env.AUTH_SECRET
  ? crypto.createHash("sha256").update(process.env.AUTH_SECRET).digest()
  : crypto.randomBytes(32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENC_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(":")) return encryptedText;
  const [ivHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENC_KEY, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Get tenant ID for a user
async function getTenantForUser(username) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { username },
    select: { tenantId: true },
  });
  return user?.tenantId || null;
}

// Get tenant by slug
async function getTenantBySlug(slug) {
  const prisma = getPrisma();
  return prisma.tenant.findUnique({ where: { slug } });
}

module.exports = {
  getPrisma,
  encrypt,
  decrypt,
  getTenantForUser,
  getTenantBySlug,
};
