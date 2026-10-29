import { z } from "zod";

export const currencyEnum = z.enum(["USD", "GBP", "EUR"]);
export const platformEnum = z.enum(["ETSY", "EBAY", "SHOPIFY", "OTHER"]);
export const listingStatusEnum = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export const orderStatusEnum = z.enum([
  "NEW",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
]);
export const trackingKindEnum = z.enum(["SUPPLIER", "CUSTOMER"]);

const money = z.coerce.number().min(0).max(1_000_000);
const optMoney = money.optional().nullable();

// ---- Auth & Users ----
export const registerSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().max(120).optional(),
  password: z.string().min(8, "At least 8 characters").max(200),
});

export const createUserSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().max(120).optional().nullable(),
  password: z.string().min(8, "At least 8 characters").max(200),
});

export const updateUserSchema = z.object({
  email: z.string().email().max(200).optional(),
  name: z.string().max(120).optional().nullable(),
  password: z.string().min(8, "At least 8 characters").max(200).optional().or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ---- Store ----
export const storeSchema = z.object({
  name: z.string().min(1).max(120),
  platform: platformEnum.default("ETSY"),
  currency: currencyEnum.default("USD"),
  feePercent: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().max(2000).optional().nullable(),
});

// ---- Supplier account (vault) ----
export const supplierAccountSchema = z.object({
  storeId: z.string().min(1),
  label: z.string().min(1).max(120),
  email: z.string().email().max(200),
  provider: z.string().max(60).default("aliexpress"),
});

// ---- Listing ----
const imageUrlSchema = z
  .string()
  .max(1000)
  .refine(
    (v) => /^\/uploads\/[a-zA-Z0-9._-]+$/.test(v) || /^https?:\/\/.+/i.test(v),
    "Invalid image URL",
  );

export const listingVariantSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(200),
  sku: z.string().max(120).optional().nullable(),
  imageUrl: imageUrlSchema.optional().nullable().or(z.literal("")),
  supplierPrice: optMoney,
  listedPrice: optMoney,
});

// A listing sourcing option (where/for-how-much to buy). A listing can have several.
export const listingSupplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  url: z.string().url().max(1000).optional().nullable().or(z.literal("")),
  unitPrice: optMoney,
  currency: currencyEnum.default("USD"),
  shipDaysUS: z.coerce.number().int().min(0).max(365).optional().nullable(),
  shipDaysUK: z.coerce.number().int().min(0).max(365).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const listingSchema = z.object({
  storeId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional().nullable(),
  supplierUrl: z.string().url().max(1000).optional().nullable().or(z.literal("")),
  supplierName: z.string().max(120).optional().nullable(),
  supplierPrice: optMoney,
  supplierCurrency: currencyEnum.default("USD"),
  listedPrice: optMoney,
  status: listingStatusEnum.default("ACTIVE"),
  images: z.array(imageUrlSchema).max(20).default([]),
  variants: z.array(listingVariantSchema).max(100).default([]),
  suppliers: z.array(listingSupplierSchema).max(30).default([]),
});

export const fetchListingSchema = z.object({
  storeId: z.string().min(1),
  url: z.string().url().max(1000).optional().or(z.literal("")),
  rawHtml: z.string().max(5_000_000).optional().nullable(),
});

// ---- Order ----
export const orderItemSchema = z.object({
  listingId: z.string().optional().nullable(),
  variantId: z.string().optional().nullable(),
  title: z.string().min(1).max(300),
  variantName: z.string().max(200).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(1000).default(1),
  sellingPrice: money,
});

export const orderSchema = z.object({
  storeId: z.string().min(1),
  orderNumber: z.string().max(60).optional(), // auto-generated if blank
  currency: currencyEnum.optional(), // defaults from store
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email().optional().or(z.literal("")).nullable(),
  customerPhone: z.string().max(60).optional().nullable(),
  shippingAddress: z.string().max(500).optional().nullable(),
  shippingCity: z.string().max(120).optional().nullable(),
  shippingState: z.string().max(120).optional().nullable(),
  shippingZip: z.string().max(40).optional().nullable(),
  shippingCountry: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(orderItemSchema).min(1, "Add at least one product"),
});

export const orderStatusUpdateSchema = z.object({
  status: orderStatusEnum,
});

// ---- Supplier purchase (when ordering from supplier) ----
export const supplierPurchaseSchema = z.object({
  supplierAccountId: z.string().optional().nullable(),
  listingSupplierId: z.string().optional().nullable(),
  supplierOrderNo: z.string().max(120).optional().nullable(),
  buyingPrice: money,
  buyingCurrency: currencyEnum.default("USD"),
  cainiaoTrackingNo: z.string().max(120).optional().nullable(),
  // Convenience: also set the order to PROCESSING
  markProcessing: z.boolean().default(true),
});

// ---- Shipment / tracking ----
export const shipmentSchema = z.object({
  orderId: z.string().min(1),
  kind: trackingKindEnum,
  trackingNumber: z.string().min(3).max(120),
  carrierCode: z.string().max(40).optional().nullable(),
});

export const shipmentStatusEnum = z.enum([
  "PENDING",
  "INFO_RECEIVED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "EXCEPTION",
  "EXPIRED",
  "UNKNOWN",
]);

// Manually set a shipment's status (used when no live tracking provider is configured).
export const shipmentStatusUpdateSchema = z.object({
  status: shipmentStatusEnum,
  note: z.string().max(200).optional().nullable(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type StoreInput = z.infer<typeof storeSchema>;
export type ListingInput = z.infer<typeof listingSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type SupplierPurchaseInput = z.infer<typeof supplierPurchaseSchema>;
export type ShipmentInput = z.infer<typeof shipmentSchema>;
