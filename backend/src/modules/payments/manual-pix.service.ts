import QRCode from "qrcode";
import { HttpError } from "../../lib/http-error.js";

type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";

type CreateManualPixInput = {
  keyType: PixKeyType;
  key: string;
  receiverName: string;
  receiverCity: string;
  amountCents: number;
  txid: string;
};

function emvField(id: string, value: string) {
  const length = Buffer.byteLength(value, "utf8");

  if (length > 99) {
    throw new HttpError(
      422,
      `Campo ${id} excede o limite do Pix`,
      "INVALID_PIX_FIELD",
    );
  }

  return `${id}${String(length).padStart(2, "0")}${value}`;
}

function normalizeText(value: string, maxLength: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizePixKey(type: PixKeyType, value: string) {
  const trimmed = value.trim();

  if (type === "CPF") {
    const digits = trimmed.replace(/\D/g, "");

    if (digits.length !== 11) {
      throw new HttpError(
        422,
        "A chave CPF deve ter 11 dígitos",
        "INVALID_PIX_KEY",
      );
    }

    return digits;
  }

  if (type === "CNPJ") {
    const digits = trimmed.replace(/\D/g, "");

    if (digits.length !== 14) {
      throw new HttpError(
        422,
        "A chave CNPJ deve ter 14 dígitos",
        "INVALID_PIX_KEY",
      );
    }

    return digits;
  }

  if (type === "PHONE") {
    const digits = trimmed.replace(/\D/g, "");

    if (digits.length === 10 || digits.length === 11) {
      return `+55${digits}`;
    }

    if (
      (digits.length === 12 || digits.length === 13) &&
      digits.startsWith("55")
    ) {
      return `+${digits}`;
    }

    throw new HttpError(
      422,
      "Informe o telefone Pix com DDD",
      "INVALID_PIX_KEY",
    );
  }

  if (type === "EMAIL") {
    const email = trimmed.toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(
        422,
        "A chave Pix de e-mail é inválida",
        "INVALID_PIX_KEY",
      );
    }

    return email;
  }

  if (trimmed.length < 10 || trimmed.length > 100) {
    throw new HttpError(
      422,
      "A chave Pix aleatória é inválida",
      "INVALID_PIX_KEY",
    );
  }

  return trimmed;
}

function crc16Ccitt(payload: string) {
  let crc = 0xffff;

  for (const character of Buffer.from(payload, "utf8")) {
    crc ^= character << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        crc & 0x8000
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export async function createManualPixPayment(
  input: CreateManualPixInput,
) {
  if (
    !Number.isInteger(input.amountCents) ||
    input.amountCents <= 0
  ) {
    throw new HttpError(
      422,
      "O valor do Pix é inválido",
      "INVALID_PIX_AMOUNT",
    );
  }

  const key = normalizePixKey(input.keyType, input.key);
  const receiverName = normalizeText(input.receiverName, 25);
  const receiverCity = normalizeText(input.receiverCity, 15);
  const txid =
    normalizeText(input.txid, 25)
      .replace(/\s/g, "")
      .slice(0, 25) || "***";

  if (!receiverName || !receiverCity) {
    throw new HttpError(
      422,
      "Nome e cidade do recebedor são obrigatórios",
      "INVALID_PIX_RECEIVER",
    );
  }

  const merchantAccount =
    emvField("00", "br.gov.bcb.pix") +
    emvField("01", key);

  const additionalData = emvField("05", txid);
  const amount = (input.amountCents / 100).toFixed(2);

  const payloadWithoutCrc =
    emvField("00", "01") +
    emvField("26", merchantAccount) +
    emvField("52", "0000") +
    emvField("53", "986") +
    emvField("54", amount) +
    emvField("58", "BR") +
    emvField("59", receiverName) +
    emvField("60", receiverCity) +
    emvField("62", additionalData) +
    "6304";

  const payload =
    `${payloadWithoutCrc}${crc16Ccitt(payloadWithoutCrc)}`;

  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
  });

  return {
    provider: "MANUAL_PIX" as const,
    txid,
    qrCode: payload,
    qrCodeBase64: dataUrl.replace(
      /^data:image\/png;base64,/,
      "",
    ),
  };
}
