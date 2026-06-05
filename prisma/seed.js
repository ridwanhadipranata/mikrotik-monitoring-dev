/**
 * Seed script: migrasi data JSON existing → SQLite via Prisma
 * Jalankan: node prisma/seed.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const adapter = new PrismaBetterSqlite3({
  url: "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const BILLING_DIR = path.join(__dirname, "..", "billing-data");
const USERS_FILE = path.join(__dirname, "..", "data", "users.json");
const BCRYPT_ROUNDS = 12;

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

function decrypt(text) {
  const [ivHex, encrypted] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENC_KEY, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function loadJSON(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {}
  return [];
}

async function main() {
  console.log("🌱 Seeding database...\n");

  // ── 1. Create default tenant ────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "amanna" },
    update: {},
    create: {
      name: "Amanna Jatiroyo",
      slug: "amanna",
      description: "ISP utama — Amanna Jatiroyo",
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // ── 2. Migrate users ────────────────────────────────────────
  const users = loadJSON(USERS_FILE);
  let userCount = 0;
  for (const u of users) {
    // Map old roles to new
    let role = "staff";
    if (u.role === "admin") role = "admin";
    else if (u.role === "admin_pembayaran") role = "admin";

    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        tenantId: tenant.id,
        passwordHash: u.passwordHash,
        role,
        displayName: u.displayName || u.username,
      },
      create: {
        tenantId: tenant.id,
        username: u.username,
        passwordHash: u.passwordHash,
        role,
        displayName: u.displayName || u.username,
      },
    });
    userCount++;
  }
  console.log(`✅ Users migrated: ${userCount}`);

  // ── 3. Create routers from env config ───────────────────────
  const devices = [
    {
      name: process.env.MIKROTIK_1_NAME || "Router 1",
      host: process.env.MIKROTIK_1_HOST || "127.0.0.1",
      port: parseInt(process.env.MIKROTIK_1_PORT || "8728"),
      user: process.env.MIKROTIK_1_USER || "admin",
      password: process.env.MIKROTIK_1_PASS || "",
      wanInterface: process.env.MIKROTIK_1_WAN || "",
    },
    {
      name: process.env.MIKROTIK_2_NAME || "Router 2",
      host: process.env.MIKROTIK_2_HOST || "127.0.0.1",
      port: parseInt(process.env.MIKROTIK_2_PORT || "8728"),
      user: process.env.MIKROTIK_2_USER || "admin",
      password: process.env.MIKROTIK_2_PASS || "",
      wanInterface: process.env.MIKROTIK_2_WAN || "",
    },
    {
      name: process.env.MIKROTIK_3_NAME || "Router 3",
      host: process.env.MIKROTIK_3_HOST || "127.0.0.1",
      port: parseInt(process.env.MIKROTIK_3_PORT || "8728"),
      user: process.env.MIKROTIK_3_USER || "admin",
      password: process.env.MIKROTIK_3_PASS || "",
      wanInterface: process.env.MIKROTIK_3_WAN || "",
    },
  ];

  const routerMap = {}; // old id → new router id
  for (let i = 0; i < devices.length; i++) {
    const d = devices[i];
    const oldId = String(i + 1);
    if (!d.host || d.host === "127.0.0.1") continue;

    const router = await prisma.router.create({
      data: {
        tenantId: tenant.id,
        name: d.name,
        host: d.host,
        port: d.port,
        user: d.user,
        password: encrypt(d.password),
        wanInterface: d.wanInterface || null,
      },
    });
    routerMap[oldId] = router.id;
    console.log(`✅ Router: ${d.name} → ${router.id}`);
  }

  // ── 4. Migrate packages ─────────────────────────────────────
  const packages = loadJSON(path.join(BILLING_DIR, "packages.json"));
  const packageMap = {}; // old id → new id
  let pkgCount = 0;
  for (const p of packages) {
    const routerNewId = routerMap[p.deviceId] || Object.values(routerMap)[0];
    if (!routerNewId) continue;

    const pkg = await prisma.package.create({
      data: {
        tenantId: tenant.id,
        name: p.name,
        speedUp: p.speedUp || null,
        speedDown: p.speedDown || null,
        price: p.price || 0,
        description: p.description || null,
      },
    });
    packageMap[p.id] = pkg.id;
    pkgCount++;
  }
  console.log(`✅ Packages migrated: ${pkgCount}`);

  // ── 5. Migrate customers ────────────────────────────────────
  const customers = loadJSON(path.join(BILLING_DIR, "customers.json"));
  const customerMap = {};
  let custCount = 0;
  for (const c of customers) {
    const routerNewId = routerMap[c.deviceId] || Object.values(routerMap)[0];
    const packageNewId = packageMap[c.packageId] || Object.values(packageMap)[0];
    if (!routerNewId || !packageNewId) continue;

    try {
      const cust = await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          routerId: routerNewId,
          packageId: packageNewId,
          name: c.name,
          address: c.address || null,
          phone: c.phone || null,
          simpleQueue: c.simpleQueue || "",
          billingDay: c.billingDay || 1,
          status: c.status || "active",
          installDate: c.installDate || null,
          lat: c.lat != null ? Number(c.lat) : null,
          lng: c.lng != null ? Number(c.lng) : null,
        },
      });
      customerMap[c.id] = cust.id;
      custCount++;
    } catch (err) {
      console.log(`⚠️  Skip customer ${c.name}: ${err.message}`);
    }
  }
  console.log(`✅ Customers migrated: ${custCount}`);

  // ── 6. Migrate invoices ─────────────────────────────────────
  const invoices = loadJSON(path.join(BILLING_DIR, "invoices.json"));
  let invCount = 0;
  for (const inv of invoices) {
    const routerNewId = routerMap[inv.deviceId] || Object.values(routerMap)[0];
    const customerNewId = customerMap[inv.customerId];
    if (!routerNewId || !customerNewId) continue;

    try {
      await prisma.invoice.create({
        data: {
          tenantId: tenant.id,
          routerId: routerNewId,
          customerId: customerNewId,
          month: inv.month,
          year: inv.year,
          amount: inv.amount || 0,
          ppn: inv.ppn || 0,
          discount: inv.discount || 0,
          totalAmount: inv.totalAmount || inv.amount || 0,
          status: inv.status || "unpaid",
          dueDate: inv.dueDate || null,
          paidDate: inv.paidDate || null,
          notes: inv.notes || null,
        },
      });
      invCount++;
    } catch (err) {
      console.log(`⚠️  Skip invoice ${inv.id}: ${err.message}`);
    }
  }
  console.log(`✅ Invoices migrated: ${invCount}`);

  console.log("\n🎉 Seeding complete!");
  console.log(`   Tenant: ${tenant.name}`);
  console.log(`   Users: ${userCount}`);
  console.log(`   Routers: ${Object.keys(routerMap).length}`);
  console.log(`   Packages: ${pkgCount}`);
  console.log(`   Customers: ${custCount}`);
  console.log(`   Invoices: ${invCount}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
