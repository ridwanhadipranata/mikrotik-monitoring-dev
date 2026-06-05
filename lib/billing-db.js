/**
 * Billing Database Module
 * Replaces JSON file-based billing with Prisma database
 * All queries are tenant-scoped + router-scoped for data isolation
 */

const { getPrisma } = require("./db-server");

// ── Packages CRUD ─────────────────────────────────────────────

async function getPackages(tenantId, routerId) {
  const prisma = getPrisma();
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (routerId) where.routerId = routerId;
  return prisma.package.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
}

async function createPackage(tenantId, data) {
  const prisma = getPrisma();
  return prisma.package.create({
    data: {
      tenantId,
      routerId: data.routerId || null,
      name: data.name,
      speedUp: data.speedUp || null,
      speedDown: data.speedDown || null,
      price: Number(data.price) || 0,
      description: data.description || null,
    },
  });
}

async function updatePackage(id, tenantId, data) {
  const prisma = getPrisma();
  const where = { id };
  if (tenantId) where.tenantId = tenantId;
  const pkg = await prisma.package.findFirst({ where });
  if (!pkg) throw new Error("Package not found");

  const updateData = {};
  if (data.name != null) updateData.name = data.name;
  if (data.speedUp != null) updateData.speedUp = data.speedUp;
  if (data.speedDown != null) updateData.speedDown = data.speedDown;
  if (data.price != null) updateData.price = Number(data.price);
  if (data.description != null) updateData.description = data.description;

  return prisma.package.update({ where: { id }, data: updateData });
}

async function deletePackage(id, tenantId) {
  const prisma = getPrisma();
  const where = { id };
  if (tenantId) where.tenantId = tenantId;
  const pkg = await prisma.package.findFirst({ where });
  if (!pkg) throw new Error("Package not found");

  const customerCount = await prisma.customer.count({ where: { packageId: id } });
  if (customerCount > 0) throw new Error("Cannot delete package — masih digunakan oleh customer");

  return prisma.package.delete({ where: { id } });
}

// ── Customers CRUD ────────────────────────────────────────────

async function getCustomers(tenantId, routerId) {
  const prisma = getPrisma();
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (routerId) where.routerId = routerId;
  return prisma.customer.findMany({
    where,
    include: { package: true, router: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

async function createCustomer(tenantId, data) {
  const prisma = getPrisma();

  const router = await prisma.router.findFirst({ where: { id: data.routerId, isActive: true, ...(tenantId && { tenantId }) } });
  if (!router) throw new Error("Router tidak ditemukan");

  // Use router's tenantId if not provided (superadmin case)
  const effectiveTenantId = tenantId || router.tenantId;

  const pkg = await prisma.package.findFirst({ where: { id: data.packageId, tenantId: effectiveTenantId } });
  if (!pkg) throw new Error("Package tidak ditemukan");

  const existingQueue = await prisma.customer.findFirst({
    where: { routerId: data.routerId, simpleQueue: data.simpleQueue },
  });
  if (existingQueue) throw new Error(`Simple queue "${data.simpleQueue}" sudah digunakan di router ini`);

  return prisma.customer.create({
    data: {
      tenantId: effectiveTenantId,
      routerId: data.routerId,
      packageId: data.packageId,
      name: data.name,
      address: data.address || null,
      phone: data.phone || null,
      simpleQueue: data.simpleQueue,
      billingDay: data.billingDay || 1,
      status: data.status || "active",
      installDate: data.installDate || null,
      lat: data.lat != null ? Number(data.lat) : null,
      lng: data.lng != null ? Number(data.lng) : null,
    },
    include: { package: true },
  });
}

async function updateCustomer(id, tenantId, data) {
  const prisma = getPrisma();
  const where = { id };
  if (tenantId) where.tenantId = tenantId;
  const customer = await prisma.customer.findFirst({ where });
  if (!customer) throw new Error("Customer not found");

  if (data.simpleQueue && data.simpleQueue !== customer.simpleQueue) {
    const existingQueue = await prisma.customer.findFirst({
      where: { routerId: customer.routerId, simpleQueue: data.simpleQueue, NOT: { id } },
    });
    if (existingQueue) throw new Error(`Simple queue "${data.simpleQueue}" sudah digunakan di router ini`);
  }

  const updateData = {};
  if (data.name != null) updateData.name = data.name;
  if (data.address != null) updateData.address = data.address;
  if (data.phone != null) updateData.phone = data.phone;
  if (data.packageId != null) updateData.packageId = data.packageId;
  if (data.simpleQueue != null) updateData.simpleQueue = data.simpleQueue;
  if (data.billingDay != null) updateData.billingDay = data.billingDay;
  if (data.status != null) updateData.status = data.status;
  if (data.installDate != null) updateData.installDate = data.installDate;
  if (data.lat != null) updateData.lat = Number(data.lat);
  if (data.lng != null) updateData.lng = Number(data.lng);

  return prisma.customer.update({
    where: { id },
    data: updateData,
    include: { package: true },
  });
}

async function deleteCustomer(id, tenantId) {
  const prisma = getPrisma();
  const where = { id };
  if (tenantId) where.tenantId = tenantId;
  const customer = await prisma.customer.findFirst({ where });
  if (!customer) throw new Error("Customer not found");

  // Let Prisma cascade handle invoice deletion
  return prisma.customer.delete({ where: { id } });
}

// ── Invoices CRUD ─────────────────────────────────────────────

async function getInvoices(tenantId, routerId, filters = {}) {
  const prisma = getPrisma();
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (routerId) where.routerId = routerId;
  if (filters.status) where.status = filters.status;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.month && filters.year) {
    where.month = Number(filters.month);
    where.year = Number(filters.year);
  }

  return prisma.invoice.findMany({
    where,
    include: { customer: { select: { id: true, name: true, phone: true, simpleQueue: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
}

async function createInvoice(tenantId, data) {
  const prisma = getPrisma();

  const customer = await prisma.customer.findFirst({
    where: { id: data.customerId, ...(tenantId && { tenantId }) },
    include: { package: true },
  });
  if (!customer) throw new Error("Customer tidak ditemukan");

  const existing = await prisma.invoice.findFirst({
    where: { customerId: data.customerId, month: Number(data.month), year: Number(data.year) },
  });
  if (existing) throw new Error("Invoice sudah ada untuk customer/bulan ini");

  const baseAmount = Number(data.amount || customer.package.price || 0);
  const ppnAmount = Math.round(baseAmount * 0.11);
  const now = new Date();
  const discountAmount = now.getDate() <= 10 ? ppnAmount : 0;

  return prisma.invoice.create({
    data: {
      tenantId: tenantId || customer.tenantId,
      routerId: customer.routerId,
      customerId: data.customerId,
      month: Number(data.month),
      year: Number(data.year),
      amount: baseAmount,
      ppn: ppnAmount,
      discount: discountAmount,
      totalAmount: baseAmount + ppnAmount - discountAmount,
      status: "unpaid",
      dueDate: data.dueDate || null,
      notes: data.notes || null,
    },
    include: { customer: { select: { id: true, name: true, phone: true } } },
  });
}

async function updateInvoice(id, tenantId, data) {
  const prisma = getPrisma();
  const where = { id };
  if (tenantId) where.tenantId = tenantId;
  const invoice = await prisma.invoice.findFirst({ where });
  if (!invoice) throw new Error("Invoice not found");

  const updateData = {};
  if (data.status != null) updateData.status = data.status;
  if (data.paidDate != null) updateData.paidDate = data.paidDate;
  if (data.amount != null) updateData.amount = Number(data.amount);
  if (data.dueDate != null) updateData.dueDate = data.dueDate;
  if (data.notes != null) updateData.notes = data.notes;
  if (data.discount != null) updateData.discount = Number(data.discount);

  if (data.amount != null || data.discount != null) {
    const amount = updateData.amount ?? invoice.amount;
    const discount = updateData.discount ?? invoice.discount;
    updateData.ppn = Math.round(amount * 0.11);
    updateData.totalAmount = amount + updateData.ppn - discount;
  }

  return prisma.invoice.update({
    where: { id },
    data: updateData,
    include: { customer: { select: { id: true, name: true, phone: true } } },
  });
}

async function deleteInvoice(id, tenantId) {
  const prisma = getPrisma();
  const where = { id };
  if (tenantId) where.tenantId = tenantId;
  const invoice = await prisma.invoice.findFirst({ where });
  if (!invoice) throw new Error("Invoice not found");
  return prisma.invoice.delete({ where: { id } });
}

// ── Billing Summary ───────────────────────────────────────────

async function getBillingSummary(tenantId, routerId) {
  const prisma = getPrisma();

  const custWhere = {};
  if (tenantId) custWhere.tenantId = tenantId;
  if (routerId) custWhere.routerId = routerId;
  const invWhere = {};
  if (tenantId) invWhere.tenantId = tenantId;
  if (routerId) invWhere.routerId = routerId;
  const pkgWhere = {};
  if (tenantId) pkgWhere.tenantId = tenantId;
  if (routerId) pkgWhere.routerId = routerId;

  const [customers, invoices, packages] = await Promise.all([
    prisma.customer.findMany({ where: custWhere }),
    prisma.invoice.findMany({ where: invWhere }),
    prisma.package.findMany({ where: pkgWhere }),
  ]);

  const activeCustomers = customers.filter(c => c.status === "active").length;
  const unpaidInvoices = invoices.filter(i => i.status === "unpaid");
  const paidInvoices = invoices.filter(i => i.status === "paid");

  const now = new Date();
  const today = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const effectiveTotal = (inv) => {
    const base = inv.amount;
    const ppn = inv.ppn || Math.round(base * 0.11);
    if (inv.status === "paid") return base + ppn - (inv.discount || 0);
    const isPast = inv.year < currentYear || (inv.year === currentYear && inv.month < currentMonth);
    const discount = isPast ? 0 : (today <= 10 ? ppn : 0);
    return base + ppn - discount;
  };

  const totalUnpaid = unpaidInvoices.reduce((s, i) => s + effectiveTotal(i), 0);
  const totalPaid = paidInvoices.reduce((s, i) => s + effectiveTotal(i), 0);

  const thisMonthInvoices = invoices.filter(i => i.month === currentMonth && i.year === currentYear);
  const thisMonthPaid = thisMonthInvoices.filter(i => i.status === "paid").reduce((s, i) => s + effectiveTotal(i), 0);
  const thisMonthUnpaid = thisMonthInvoices.filter(i => i.status === "unpaid").reduce((s, i) => s + effectiveTotal(i), 0);

  return {
    totalCustomers: customers.length,
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
  };
}

// ── Generate Invoices ─────────────────────────────────────────

async function generateInvoices(tenantId, month, year, routerId) {
  const prisma = getPrisma();

  const custWhere = { status: "active" };
  if (tenantId) custWhere.tenantId = tenantId;
  if (routerId) custWhere.routerId = routerId;
  const customers = await prisma.customer.findMany({
    where: custWhere,
    include: { package: true },
  });

  // Batch check existing invoices
  const existingInvoices = await prisma.invoice.findMany({
    where: {
      month: Number(month),
      year: Number(year),
      ...(tenantId && { tenantId }),
      ...(routerId && { routerId }),
    },
    select: { customerId: true },
  });
  const existingSet = new Set(existingInvoices.map(i => i.customerId));

  const now = new Date();
  const discountDate = now.getDate() <= 10;

  const invoicesToCreate = [];
  for (const cust of customers) {
    if (existingSet.has(cust.id)) continue;

    const basePrice = cust.package ? cust.package.price : 0;
    const ppnPrice = Math.round(basePrice * 0.11);
    const discountPrice = discountDate ? ppnPrice : 0;

    invoicesToCreate.push({
      tenantId: cust.tenantId,
      routerId: cust.routerId,
      customerId: cust.id,
      month: Number(month),
      year: Number(year),
      amount: basePrice,
      ppn: ppnPrice,
      discount: discountPrice,
      totalAmount: basePrice + ppnPrice - discountPrice,
      status: "unpaid",
    });
  }

  if (invoicesToCreate.length > 0) {
    await prisma.invoice.createMany({ data: invoicesToCreate });
  }

  return { created: invoicesToCreate.length, total: customers.length };
}

// ── Backup & Restore ──────────────────────────────────────────

async function getBackupData(tenantId, routerId) {
  const prisma = getPrisma();

  const custWhere = {};
  if (tenantId) custWhere.tenantId = tenantId;
  if (routerId) custWhere.routerId = routerId;
  const invWhere = {};
  if (tenantId) invWhere.tenantId = tenantId;
  if (routerId) invWhere.routerId = routerId;
  const pkgWhere = {};
  if (tenantId) pkgWhere.tenantId = tenantId;
  if (routerId) pkgWhere.routerId = routerId;

  const [packages, customers, invoices] = await Promise.all([
    prisma.package.findMany({ where: pkgWhere }),
    prisma.customer.findMany({
      where: custWhere,
      include: { package: true },
    }),
    prisma.invoice.findMany({
      where: invWhere,
    }),
  ]);

  return { packages, customers, invoices };
}

async function restoreBackup(tenantId, data, mode) {
  const prisma = getPrisma();

  if (mode === "replace") {
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.package.deleteMany({ where: { tenantId } });
  }

  const packageMap = {};
  for (const p of data.packages) {
    const pkg = await prisma.package.create({
      data: {
        tenantId,
        routerId: data.routerId || null,
        name: p.name,
        speedUp: p.speedUp || null,
        speedDown: p.speedDown || null,
        price: p.price || 0,
        description: p.description || null,
      },
    });
    packageMap[p.id] = pkg.id;
  }

  const customerMap = {};
  for (const c of data.customers) {
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        routerId: data.routerId || c.routerId,
        packageId: packageMap[c.packageId] || Object.values(packageMap)[0],
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
    customerMap[c.id] = customer.id;
  }

  for (const inv of data.invoices) {
    await prisma.invoice.create({
      data: {
        tenantId,
        routerId: data.routerId || inv.routerId,
        customerId: customerMap[inv.customerId] || Object.values(customerMap)[0],
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
  }

  return {
    packages: data.packages.length,
    customers: data.customers.length,
    invoices: data.invoices.length,
  };
}

// ── Billing Devices (routers with counts) ─────────────────────

async function getBillingDevices(tenantId) {
  const prisma = getPrisma();

  const routers = await prisma.router.findMany({
    where: { isActive: true, ...(tenantId && { tenantId }) },
    include: {
      customers: { select: { id: true, status: true } },
      invoices: { select: { id: true, status: true } },
      tenant: { select: { id: true, name: true, slug: true } },
    },
  });

  return routers.map(r => ({
    id: r.id,
    name: r.name,
    tenant: r.tenant,
    customerCount: r.customers.length,
    activeCount: r.customers.filter(c => c.status === "active").length,
    invoiceCount: r.invoices.length,
    unpaidCount: r.invoices.filter(i => i.status === "unpaid").length,
  }));
}

// ── Backup Info ───────────────────────────────────────────────

async function getBackupInfo(tenantId, routerId) {
  const prisma = getPrisma();

  const custWhere = {};
  if (tenantId) custWhere.tenantId = tenantId;
  if (routerId) custWhere.routerId = routerId;
  const invWhere = {};
  if (tenantId) invWhere.tenantId = tenantId;
  if (routerId) invWhere.routerId = routerId;
  const pkgWhere = {};
  if (tenantId) pkgWhere.tenantId = tenantId;
  if (routerId) pkgWhere.routerId = routerId;

  const [packages, customers, invoices] = await Promise.all([
    prisma.package.findMany({ where: pkgWhere }),
    prisma.customer.findMany({ where: custWhere }),
    prisma.invoice.findMany({ where: invWhere }),
  ]);

  return {
    packages: packages.length,
    customers: customers.length,
    customersActive: customers.filter(c => c.status === "active").length,
    invoices: invoices.length,
    invoicesPaid: invoices.filter(i => i.status === "paid").length,
    invoicesUnpaid: invoices.filter(i => i.status === "unpaid").length,
    totalRevenue: invoices.reduce((s, i) => s + (i.totalAmount || i.amount), 0),
  };
}

module.exports = {
  getPackages,
  createPackage,
  updatePackage,
  deletePackage,
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getBillingSummary,
  generateInvoices,
  getBackupData,
  restoreBackup,
  getBillingDevices,
  getBackupInfo,
};
