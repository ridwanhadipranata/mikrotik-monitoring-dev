export interface BillingPackage {
  id: string;
  deviceId: string;
  name: string;
  speedUp: string;
  speedDown: string;
  price: number;
  description: string;
  createdAt: string;
}

export interface BillingCustomer {
  id: string;
  deviceId: string;
  name: string;
  address: string;
  phone: string;
  packageId: string;
  simpleQueue: string;
  billingDay: number;
  status: "active" | "suspended" | "terminated";
  installDate: string;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

export interface BillingInvoice {
  id: string;
  deviceId: string;
  customerId: string;
  month: number;
  year: number;
  amount: number;
  ppn: number;
  discount: number;
  totalAmount: number;
  status: "unpaid" | "paid" | "overdue";
  dueDate: string;
  paidDate: string | null;
  notes: string;
  createdAt: string;
}

export interface BillingQueue {
  name: string;
  target: string;
  maxUpload: string;
  maxDownload: string;
  rateUpload: number;
  rateDownload: number;
  disabled: boolean;
  comment: string;
  usedBy: string | null;
}

export interface BillingDeviceInfo {
  id: string;
  name: string;
  tenant?: { id: string; name: string; slug: string };
  customerCount: number;
  activeCount: number;
  invoiceCount: number;
  unpaidCount: number;
}

// Discount policy:
// - Current month invoice: discount = PPN if today is 1-10
// - Past month invoice: no discount (forfeited)
// - Future month invoice: discount = PPN if today is 1-10
export function getEffectiveDiscount(invoice: BillingInvoice): number {
  if (invoice.status === "paid") return invoice.discount || 0;

  const now = new Date();
  const today = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Past month or past year → no discount
  if (invoice.year < currentYear || (invoice.year === currentYear && invoice.month < currentMonth)) {
    return 0;
  }

  // Current or future month → discount if 1-10
  return today <= 10 ? (invoice.ppn || Math.round(invoice.amount * 0.11)) : 0;
}

// Get effective total for an invoice
export function getEffectiveTotal(invoice: BillingInvoice): number {
  const base = invoice.amount;
  const ppn = invoice.ppn || Math.round(base * 0.11);
  const discount = getEffectiveDiscount(invoice);
  return base + ppn - discount;
}

export interface BillingSummary {
  totalCustomers: number;
  activeCustomers: number;
  totalPackages: number;
  totalInvoices: number;
  totalPaid: number;
  totalUnpaid: number;
  totalRevenue: number;
  thisMonthPaid: number;
  thisMonthUnpaid: number;
  thisMonthTotal: number;
  unpaidCount: number;
  paidCount: number;
}
