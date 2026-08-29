import { roundMoney } from '../../utils/money';
import { INSS_2026, INSS_CEILING_2026 } from './tables2026';

export interface InssBracketResult {
  from: number;
  to: number;
  base: number;
  rate: number;
  contribution: number;
}

export interface InssResult {
  contributionSalary: number;
  contribution: number;
  brackets: InssBracketResult[];
}

export function calculateINSS(grossSalary: number): InssResult {
  const normalizedSalary = Math.max(0, grossSalary);
  const contributionSalary = Math.min(normalizedSalary, INSS_CEILING_2026);

  let previousLimit = 0;
  let total = 0;
  const brackets: InssBracketResult[] = [];

  for (const bracket of INSS_2026) {
    if (contributionSalary <= previousLimit) break;

    const upper = Math.min(contributionSalary, bracket.upTo);
    const base = Math.max(0, upper - previousLimit);

    if (base > 0) {
      const contribution = base * bracket.rate;
      total += contribution;

      brackets.push({
        from: previousLimit,
        to: upper,
        base: roundMoney(base),
        rate: bracket.rate,
        contribution: roundMoney(contribution),
      });
    }

    previousLimit = bracket.upTo;
  }

  return {
    contributionSalary: roundMoney(contributionSalary),
    contribution: roundMoney(total),
    brackets,
  };
}
