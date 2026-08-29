import { roundMoney } from '../../utils/money';
import {
  IRRF_2026,
  IRRF_REDUCTION_FULL_LIMIT_2026,
  IRRF_REDUCTION_INTERCEPT_2026,
  IRRF_REDUCTION_MAX_2026,
  IRRF_REDUCTION_PHASEOUT_LIMIT_2026,
  IRRF_REDUCTION_SLOPE_2026,
} from './tables2026';

export interface IrrfProgressiveResult {
  tax: number;
  rate: number;
  deduction: number;
}

export function calculateProgressiveIRRF(taxableBase: number): IrrfProgressiveResult {
  const base = Math.max(0, taxableBase);
  const bracket = IRRF_2026.find((item) => base <= item.upTo) ?? IRRF_2026[IRRF_2026.length - 1];

  if (!bracket) {
    return { tax: 0, rate: 0, deduction: 0 };
  }

  const tax = Math.max(0, base * bracket.rate - bracket.deduction);

  return {
    tax: roundMoney(tax),
    rate: bracket.rate,
    deduction: bracket.deduction,
  };
}

/**
 * Redução criada pela Lei nº 15.270/2025.
 * Atenção: usa os rendimentos tributáveis sujeitos à incidência mensal
 * (por exemplo, o salário bruto tributável), e não a base após deduções.
 */
export function calculateIRRFReduction2026(
  monthlyTaxableIncome: number,
  taxBeforeReduction: number,
): number {
  const income = Math.max(0, monthlyTaxableIncome);
  const tax = Math.max(0, taxBeforeReduction);

  if (tax === 0) return 0;

  if (income <= IRRF_REDUCTION_FULL_LIMIT_2026) {
    return roundMoney(Math.min(tax, IRRF_REDUCTION_MAX_2026));
  }

  if (income <= IRRF_REDUCTION_PHASEOUT_LIMIT_2026) {
    const reduction = Math.max(
      0,
      IRRF_REDUCTION_INTERCEPT_2026 - IRRF_REDUCTION_SLOPE_2026 * income,
    );

    return roundMoney(Math.min(tax, reduction));
  }

  return 0;
}
