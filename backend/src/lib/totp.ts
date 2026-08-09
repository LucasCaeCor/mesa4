import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const BASE32_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_DIGITS = 6;

export function encodeBase32(
  buffer: Buffer,
): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output +=
        BASE32_ALPHABET[
          (value >>> (bits - 5)) & 31
        ];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output +=
      BASE32_ALPHABET[
        (value << (5 - bits)) & 31
      ];
  }

  return output;
}

export function decodeBase32(
  input: string,
): Buffer {
  const normalized = input
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[\s-]/g, "");

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of normalized) {
    const index =
      BASE32_ALPHABET.indexOf(character);

    if (index < 0) {
      throw new Error(
        "Segredo TOTP em Base32 inválido",
      );
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push(
        (value >>> (bits - 8)) & 255,
      );
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function hotp(
  secret: string,
  counter: number,
  digits = DEFAULT_DIGITS,
) {
  const key = decodeBase32(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(
    BigInt(counter),
  );

  const digest = createHmac(
    "sha1",
    key,
  )
    .update(counterBuffer)
    .digest();

  const offset =
    digest[digest.length - 1] & 0x0f;

  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(
    binary % 10 ** digits,
  ).padStart(digits, "0");
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function totpForTime(
  secret: string,
  timeMs = Date.now(),
  digits = DEFAULT_DIGITS,
  periodSeconds = DEFAULT_PERIOD_SECONDS,
) {
  const counter = Math.floor(
    timeMs / 1000 / periodSeconds,
  );

  return hotp(secret, counter, digits);
}

export function verifyTotp(
  secret: string,
  code: string,
  options: {
    timeMs?: number;
    window?: number;
    periodSeconds?: number;
  } = {},
): number | null {
  const normalizedCode =
    code.trim().replace(/\s/g, "");

  if (!/^\d{6}$/.test(normalizedCode)) {
    return null;
  }

  const periodSeconds =
    options.periodSeconds ??
    DEFAULT_PERIOD_SECONDS;
  const currentCounter = Math.floor(
    (options.timeMs ?? Date.now()) /
      1000 /
      periodSeconds,
  );
  const window = options.window ?? 1;

  for (
    let offset = -window;
    offset <= window;
    offset += 1
  ) {
    const counter =
      currentCounter + offset;

    if (counter < 0) {
      continue;
    }

    const expected = hotp(
      secret,
      counter,
    );
    const expectedBuffer =
      Buffer.from(expected);
    const receivedBuffer =
      Buffer.from(normalizedCode);

    if (
      expectedBuffer.length ===
        receivedBuffer.length &&
      timingSafeEqual(
        expectedBuffer,
        receivedBuffer,
      )
    ) {
      return counter;
    }
  }

  return null;
}

export function buildOtpAuthUri(input: {
  secret: string;
  accountName: string;
  issuer: string;
}) {
  const label =
    `${encodeURIComponent(input.issuer)}:` +
    encodeURIComponent(input.accountName);

  const query = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_PERIOD_SECONDS),
  });

  return `otpauth://totp/${label}?${query.toString()}`;
}
