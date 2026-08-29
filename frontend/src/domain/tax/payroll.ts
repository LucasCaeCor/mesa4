import { roundMoney } from '../../utils/money';
import { calculateINSS, type InssBracketResult } from './inss';
import { calculateIRRFReduction2026, calculateProgressiveIRRF } from './irrf';
import {
  IRRF_DEPENDENT_DEDUCTION_2026,
  IRRF_SIMPLIFIED_DEDUCTION_2026,
} from './tables2026';

export interface PayrollInput {
  grossSalary: number;
  dependents?: number;
  otherLegalDeductions?: number;
  compareSimplifiedDeduction?: boolean;
}

export interface PayrollResult {
  grossSalary: number;
  inss: number;
  inssBrackets: InssBracketResult[];
  dependentDeduction: number;
  otherLegalDeductions: number;
  legalDeductions: number;
  simplifiedDeduction: number;
  deductionUsed: number;
  deductionType: 'legal' | 'simplified';
  irrfBase: number;
  irrfRate: number;
  irrfBracketDeduction: number;
  irrfBeforeReduction: number;
  irrfReduction2026: number;
  irrf: number;
  netSalary: number;
}

export function calculatePayroll({
  grossSalary,
  dependents = 0,
  otherLegalDeductions = 0,
  compareSimplifiedDeduction = true,
}: PayrollInput): PayrollResult {
  const gross = roundMoney(Math.max(0, grossSalary));
  const normalizedDependents = Math.max(0, Math.floor(dependents));
  const normalizedOtherDeductions = roundMoney(Math.max(0, otherLegalDeductions));

  const inssResult = calculateINSS(gross);
  const dependentDeduction = roundMoney(
    normalizedDependents * IRRF_DEPENDENT_DEDUCTION_2026,
  );

  const legalDeductions = roundMoney(
    inssResult.contribution + dependentDeduction + normalizedOtherDeductions,
  );

  const useSimplified =
    compareSimplifiedDeduction && IRRF_SIMPLIFIED_DEDUCTION_2026 > legalDeductions;

  const deductionUsed = useSimplified ? IRRF_SIMPLIFIED_DEDUCTION_2026 : legalDeductions;
  const deductionType: PayrollResult['deductionType'] = useSimplified ? 'simplified' : 'legal';

  const irrfBase = roundMoney(Math.max(0, gross - deductionUsed));
  const progressive = calculateProgressiveIRRF(irrfBase);
  const irrfReduction2026 = calculateIRRFReduction2026(gross, progressive.tax);
  const irrf = roundMoney(Math.max(0, progressive.tax - irrfReduction2026));
  const netSalary = roundMoney(gross - inssResult.contribution - irrf);

  return {
    grossSalary: gross,
    inss: inssResult.contribution,
    inssBrackets: inssResult.brackets,
    dependentDeduction,
    otherLegalDeductions: normalizedOtherDeductions,
    legalDeductions,
    simplifiedDeduction: IRRF_SIMPLIFIED_DEDUCTION_2026,
    deductionUsed: roundMoney(deductionUsed),
    deductionType,
    irrfBase,
    irrfRate: progressive.rate,
    irrfBracketDeduction: progressive.deduction,
    irrfBeforeReduction: progressive.tax,
    irrfReduction2026,
    irrf,
    netSalary,
  };
}
