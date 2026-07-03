import { formatDecimalInputValue, formatRawExactInputValue, getSafeBuyMaxDecimal, hasPositiveDecimal } from '@/lib/numbers';

const BUY_GAS_BUFFER_ETH = '0.003';

export function hasPositiveAmount(value: string) {
  return hasPositiveDecimal(value);
}

export function formatTradeInputAmount(value: string, maxFractionDigits = 7) {
  return formatDecimalInputValue(value, maxFractionDigits);
}

export function formatRawTokenInputAmount(rawAmount: bigint, decimals = 18) {
  return formatRawExactInputValue(rawAmount, decimals);
}

export function getSafeBuyMaxAmount(balanceValue: bigint, decimals: number) {
  const safeMaximum = getSafeBuyMaxDecimal(balanceValue, decimals, BUY_GAS_BUFFER_ETH);
  return safeMaximum.isZero()
    ? '0'
    : formatDecimalInputValue(safeMaximum, Math.max(decimals, 7));
}
