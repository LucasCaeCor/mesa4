import { HttpError } from "../../lib/http-error.js";

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

export async function lookupAddressByCep(rawCep: string) {
  const postalCode = rawCep.replace(/\D/g, "");

  if (!/^\d{8}$/.test(postalCode)) {
    throw new HttpError(422, "CEP inválido", "INVALID_POSTAL_CODE");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(
      `https://viacep.com.br/ws/${postalCode}/json/`,
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      },
    );

    if (!response.ok) {
      throw new HttpError(
        502,
        "Não foi possível consultar o CEP agora",
        "POSTAL_CODE_PROVIDER_ERROR",
      );
    }

    const data = (await response.json()) as ViaCepResponse;

    if (data.erro) {
      throw new HttpError(404, "CEP não encontrado", "POSTAL_CODE_NOT_FOUND");
    }

    return {
      postalCode,
      formattedPostalCode: data.cep ?? postalCode,
      street: data.logradouro ?? "",
      complement: data.complemento ?? "",
      neighborhood: data.bairro ?? "",
      city: data.localidade ?? "",
      state: data.uf ?? "",
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;

    throw new HttpError(
      502,
      "Não foi possível consultar o CEP agora",
      "POSTAL_CODE_PROVIDER_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }
}
