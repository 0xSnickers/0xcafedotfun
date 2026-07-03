import BigNumber from 'bignumber.js';

BigNumber.config({
  EXPONENTIAL_AT: 1_000_000,
  RANGE: 1_000_000,
});

export { BigNumber };

export type DecimalValue = BigNumber.Value | null | undefined;

export function trimTrailingZeros(value: string) {
  return value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

function toBigNumberValue(value: DecimalValue) {
  if (value instanceof BigNumber) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return value;
}

export function decimalOrNull(value: DecimalValue): BigNumber | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  const decimal = new BigNumber(toBigNumberValue(value)!);
  return decimal.isFinite() ? decimal : null;
}

export function decimalOrZero(value: DecimalValue) {
  return decimalOrNull(value) ?? new BigNumber(0);
}

export function hasPositiveDecimal(value: DecimalValue) {
  const decimal = decimalOrNull(value);
  return decimal !== null && decimal.gt(0);
}

export function isAmountGreaterThanRaw(value: string, rawAmount: bigint, decimals = 18) {
  const amount = decimalOrNull(value);
  if (amount === null) {
    return false;
  }

  return amount.gt(formatRawExactInputValue(rawAmount, decimals));
}

export function formatDecimalInputValue(value: DecimalValue, maxFractionDigits = 7) {
  const amount = decimalOrNull(value);
  if (amount === null) {
    return '0';
  }

  const normalized = amount.decimalPlaces(maxFractionDigits, BigNumber.ROUND_DOWN).toFixed(maxFractionDigits);
  return trimTrailingZeros(normalized);
}

export function formatRawExactInputValue(value: string | bigint | null, decimals = 18) {
  if (value === null) {
    return '0';
  }

  try {
    const normalized = decimalOrZero(value).shiftedBy(-decimals).toFixed(decimals);
    return trimTrailingZeros(normalized);
  } catch {
    return '0';
  }
}

export function getSafeBuyMaxDecimal(balanceValue: bigint, decimals: number, gasBufferEth: string | number) {
  const currentBalance = decimalOrZero(balanceValue).shiftedBy(-decimals);
  const gasBuffer = decimalOrZero(gasBufferEth);

  if (currentBalance.lte(gasBuffer)) {
    return new BigNumber(0);
  }

  const amountAfterGasBuffer = currentBalance.minus(gasBuffer);
  const safeMaximum = BigNumber.minimum(amountAfterGasBuffer, currentBalance.multipliedBy(0.95));
  return safeMaximum.gt(0)
    ? safeMaximum.decimalPlaces(decimals, BigNumber.ROUND_DOWN)
    : new BigNumber(0);
}

export function scalePercentToBps(value: string | number) {
  return BigInt(decimalOrZero(value).multipliedBy(100).integerValue(BigNumber.ROUND_HALF_UP).toFixed(0));
}
