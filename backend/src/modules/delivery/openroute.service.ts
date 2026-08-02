import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";

export type DeliveryAddress = {
  postalCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string;
};

type DeliverySettings = {
  pickupAddress: string | null;
  deliveryFeeCents: number | null;
  dynamicDeliveryEnabled: boolean | null;
  deliveryBaseFeeCents: number | null;
  deliveryIncludedKm: number | null;
  deliveryPricePerKmCents: number | null;
  deliveryMaxDistanceKm: number | null;
};

type Coordinate = [longitude: number, latitude: number];

type PeliasResponse = {
  features?: Array<{
    geometry?: {
      coordinates?: number[];
    };
  }>;
};

type DirectionsResponse = {
  routes?: Array<{
    summary?: {
      distance?: number;
      duration?: number;
    };
  }>;
};

export type DeliveryQuote = {
  mode: "FLAT" | "DISTANCE";
  deliveryFeeCents: number;
  distanceMeters?: number;
  distanceKm?: number;
  durationSeconds?: number;
  durationMinutes?: number;
  maxDistanceKm?: number;
};

let originCache:
  | {
      address: string;
      coordinate: Coordinate;
      expiresAt: number;
    }
  | undefined;

function requireApiKey() {
  if (!env.OPENROUTESERVICE_API_KEY) {
    throw new HttpError(
      503,
      "O cálculo de entrega está temporariamente indisponível",
      "DELIVERY_PROVIDER_NOT_CONFIGURED",
    );
  }

  return env.OPENROUTESERVICE_API_KEY;
}

async function providerError(response: Response) {
  const detail = await response.text().catch(() => "");
  console.error("OpenRouteService error", response.status, detail.slice(0, 500));

  if (response.status === 429) {
    throw new HttpError(
      503,
      "O cálculo de entrega está ocupado. Tente novamente em instantes",
      "DELIVERY_PROVIDER_RATE_LIMIT",
    );
  }

  throw new HttpError(
    503,
    "Não foi possível calcular a entrega agora",
    "DELIVERY_PROVIDER_ERROR",
  );
}

async function geocodeAddress(address: string): Promise<Coordinate> {
  const apiKey = requireApiKey();
  const url = new URL("https://api.heigit.org/pelias/v1/search");
  url.searchParams.set("text", address);
  url.searchParams.set("boundary.country", "BR");
  url.searchParams.set("size", "1");

  const response = await fetch(url, {
    headers: {
      Authorization: apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    await providerError(response);
  }

  const data = (await response.json()) as PeliasResponse;
  const coordinates = data.features?.[0]?.geometry?.coordinates;

  if (
    !coordinates ||
    coordinates.length < 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    throw new HttpError(
      422,
      "Não foi possível localizar esse endereço. Confira rua, número, bairro e CEP",
      "ADDRESS_NOT_FOUND",
    );
  }

  return [coordinates[0], coordinates[1]];
}

async function getStoreCoordinate(pickupAddress: string) {
  const now = Date.now();

  if (
    originCache &&
    originCache.address === pickupAddress &&
    originCache.expiresAt > now
  ) {
    return originCache.coordinate;
  }

  const coordinate = await geocodeAddress(`${pickupAddress}, Brasil`);

  originCache = {
    address: pickupAddress,
    coordinate,
    expiresAt: now + 12 * 60 * 60 * 1000,
  };

  return coordinate;
}

async function calculateDrivingRoute(
  origin: Coordinate,
  destination: Coordinate,
) {
  const apiKey = requireApiKey();

  const response = await fetch(
    "https://api.heigit.org/openrouteservice/v2/directions/driving-car",
    {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        coordinates: [origin, destination],
        instructions: false,
      }),
      signal: AbortSignal.timeout(12_000),
    },
  );

  if (!response.ok) {
    await providerError(response);
  }

  const data = (await response.json()) as DirectionsResponse;
  const summary = data.routes?.[0]?.summary;

  if (
    !summary ||
    !Number.isFinite(summary.distance) ||
    !Number.isFinite(summary.duration)
  ) {
    throw new HttpError(
      422,
      "Não foi encontrada uma rota de entrega para esse endereço",
      "DELIVERY_ROUTE_NOT_FOUND",
    );
  }

  return {
    distanceMeters: Math.round(summary.distance!),
    durationSeconds: Math.round(summary.duration!),
  };
}

function formatDestination(address: DeliveryAddress) {
  return [
    address.street,
    address.number,
    address.neighborhood,
    address.city,
    address.state,
    address.postalCode,
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");
}

export async function calculateDeliveryQuote(
  settings: DeliverySettings,
  address: DeliveryAddress,
): Promise<DeliveryQuote> {
  if (!settings.dynamicDeliveryEnabled) {
    return {
      mode: "FLAT",
      deliveryFeeCents: settings.deliveryFeeCents ?? 0,
    };
  }

  const pickupAddress = settings.pickupAddress?.trim();

  if (!pickupAddress) {
    throw new HttpError(
      409,
      "O endereço da loja ainda não foi configurado",
      "STORE_ADDRESS_NOT_CONFIGURED",
    );
  }

  const [origin, destination] = await Promise.all([
    getStoreCoordinate(pickupAddress),
    geocodeAddress(formatDestination(address)),
  ]);

  const route = await calculateDrivingRoute(origin, destination);
  const distanceKm = route.distanceMeters / 1000;
  const maxDistanceKm = settings.deliveryMaxDistanceKm ?? 15;

  if (distanceKm > maxDistanceKm) {
    throw new HttpError(
      422,
      `Endereço fora da área de entrega. Limite atual: ${maxDistanceKm.toFixed(1)} km`,
      "DELIVERY_OUT_OF_RANGE",
    );
  }

  const baseFeeCents = settings.deliveryBaseFeeCents ?? 0;
  const includedKm = settings.deliveryIncludedKm ?? 0;
  const pricePerKmCents = settings.deliveryPricePerKmCents ?? 0;
  const extraKm = Math.max(0, distanceKm - includedKm);

  const deliveryFeeCents =
    baseFeeCents + Math.round(extraKm * pricePerKmCents);

  return {
    mode: "DISTANCE",
    deliveryFeeCents,
    distanceMeters: route.distanceMeters,
    distanceKm: Number(distanceKm.toFixed(2)),
    durationSeconds: route.durationSeconds,
    durationMinutes: Math.max(1, Math.ceil(route.durationSeconds / 60)),
    maxDistanceKm,
  };
}
