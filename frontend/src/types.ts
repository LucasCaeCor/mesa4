export type ProductOption = { id: string; name: string; priceCents: number; active: boolean };
export type ProductOptionGroup = { id: string; name: string; required: boolean; minSelection: number; maxSelection: number; options: ProductOption[] };
export type Product = { id: string; name: string; description?: string; priceCents: number; imageUrl?: string; featured: boolean; suggestAtCheckout: boolean; soldOut: boolean; optionGroups: ProductOptionGroup[] };
export type Category = { id: string; name: string; slug: string; products: Product[] };
export type DeliveryZone = { id: string; name: string; feeCents: number; minimumOrderCents: number; estimatedMinutes?: number };
export type StoreSettings = {
  storeName: string;
  description?: string;
  whatsappNumber: string;
  instagramUrl?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  pickupAddress?: string;
  minimumOrderCents: number;
  deliveryFeeCents?: number | null;
  dynamicDeliveryEnabled?: boolean | null;
  deliveryBaseFeeCents?: number | null;
  deliveryIncludedKm?: number | null;
  deliveryPricePerKmCents?: number | null;
  deliveryMaxDistanceKm?: number | null;
  defaultPrepMinutes: number;
  acceptingOrders: boolean;
  pixEnabled: boolean;
  pixPaymentMode?:
    | "MERCADO_PAGO"
    | "MANUAL"
    | null;
  manualPixKeyType?:
    | "CPF"
    | "CNPJ"
    | "EMAIL"
    | "PHONE"
    | "RANDOM"
    | null;
  manualPixKey?: string | null;
  manualPixReceiverName?: string | null;
  manualPixReceiverCity?: string | null;
  whatsappConfirmation: boolean;
  whatsappNotificationsEnabled?:
    | boolean
    | null;
};
export type StoreAvailability = {
  isOpen: boolean;
  reason:
    | "OPEN"
    | "MANUALLY_CLOSED"
    | "OUTSIDE_BUSINESS_HOURS"
    | "SETTINGS_NOT_FOUND";
  timezone: string;
  currentWeekday: number;
  currentTime: string;
};

export type StoreResponse = { settings: StoreSettings; availability: StoreAvailability; hours: Array<{ weekday: number; enabled: boolean; opensAt: string; closesAt: string }>; deliveryZones: DeliveryZone[] };
export type MenuResponse = { categories: Category[] };
export type CartSelection = { optionId: string; optionName: string; groupName: string; priceCents: number; quantity: number };
export type CartItem = { key: string; productId: string; productName: string; imageUrl?: string; basePriceCents: number; quantity: number; notes?: string; options: CartSelection[] };
export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "CONFIRMED" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELED";
