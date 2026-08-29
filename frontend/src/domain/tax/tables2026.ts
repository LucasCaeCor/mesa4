export interface ProgressiveBracket {
  upTo: number;
  rate: number;
}

export interface IrrfBracket {
  upTo: number;
  rate: number;
  deduction: number;
}

/**
 * INSS 2026 — empregado, empregado doméstico e trabalhador avulso.
 * Vigência: competência janeiro/2026 em diante.
 * Fonte oficial: INSS / Portaria Interministerial MPS/MF nº 13, de 09/01/2026.
 */
export const INSS_2026: readonly ProgressiveBracket[] = [
  { upTo: 1621.0, rate: 0.075 },
  { upTo: 2902.84, rate: 0.09 },
  { upTo: 4354.27, rate: 0.12 },
  { upTo: 8475.55, rate: 0.14 },
] as const;

export const INSS_CEILING_2026 = 8475.55;

/**
 * Tabela progressiva mensal do IRRF usada em 2026.
 */
export const IRRF_2026: readonly IrrfBracket[] = [
  { upTo: 2428.8, rate: 0, deduction: 0 },
  { upTo: 2826.65, rate: 0.075, deduction: 182.16 },
  { upTo: 3751.05, rate: 0.15, deduction: 394.16 },
  { upTo: 4664.68, rate: 0.225, deduction: 675.49 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.275, deduction: 908.73 },
] as const;

export const IRRF_DEPENDENT_DEDUCTION_2026 = 189.59;
export const IRRF_SIMPLIFIED_DEDUCTION_2026 = 607.2;

/** Lei nº 15.270/2025 — redução mensal aplicável a partir de janeiro/2026. */
export const IRRF_REDUCTION_FULL_LIMIT_2026 = 5000;
export const IRRF_REDUCTION_PHASEOUT_LIMIT_2026 = 7350;
export const IRRF_REDUCTION_MAX_2026 = 312.89;
export const IRRF_REDUCTION_INTERCEPT_2026 = 978.62;
export const IRRF_REDUCTION_SLOPE_2026 = 0.133145;
