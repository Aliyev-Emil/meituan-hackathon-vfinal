import { DeliveryAddonKind } from "../types";

export interface DeliveryCatalogItem {
  kind: DeliveryAddonKind;
  vendorName: string;
  label: string;
  price: number;
  etaMinutes: number;
}

export const DELIVERY_CATALOG: Record<DeliveryAddonKind, DeliveryCatalogItem> = {
  cake: {
    kind: "cake",
    vendorName: "Sweet Moments Bakery",
    label: "Celebration cake",
    price: 168,
    etaMinutes: 45,
  },
  flowers: {
    kind: "flowers",
    vendorName: "Blossom & Co",
    label: "Fresh flower bouquet",
    price: 128,
    etaMinutes: 40,
  },
  champagne: {
    kind: "champagne",
    vendorName: "Vine & Dine Cellars",
    label: "Champagne bottle",
    price: 298,
    etaMinutes: 35,
  },
  gift: {
    kind: "gift",
    vendorName: "GiftBox Shenzhen",
    label: "Curated gift box",
    price: 188,
    etaMinutes: 50,
  },
  balloons: {
    kind: "balloons",
    vendorName: "Party Pop Studio",
    label: "Balloon bouquet",
    price: 88,
    etaMinutes: 30,
  },
};
