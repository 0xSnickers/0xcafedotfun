import { formatUnits } from 'viem';
import { BigNumber, decimalOrNull, formatRawExactInputValue, trimTrailingZeros } from '@/lib/numbers';

const ASSET_DISPLAY_DECIMALS = 7;

export function formatCompactNumber(value: number) {
  const amount = decimalOrNull(value);
  if (amount === null) return '0';
  if (amount.gte(1_000_000)) return `${amount.dividedBy(1_000_000).toFixed(1)}M`;
  if (amount.gte(1_000)) return `${amount.dividedBy(1_000).toFixed(1)}K`;
  return amount.toString();
}

const ETH_DISPLAY_DECIMALS = ASSET_DISPLAY_DECIMALS;
const ETH_PRICE_DISPLAY_DECIMALS = ASSET_DISPLAY_DECIMALS;

interface FormatAssetOptions {
  fallback?: string;
  group?: boolean;
  maxFractionDigits?: number;
  suffix?: string;
}

function parseDisplayNumber(value: string | number | null) {
  return decimalOrNull(value);
}

function addIntegerGrouping(value: string): string {
  const sign = value.startsWith('-') ? '-' : '';
  const unsignedValue = sign ? value.slice(1) : value;
  const [integer, fraction] = unsignedValue.split('.');
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${groupedInteger}${fraction ? `.${fraction}` : ''}`;
}

export function formatAssetValue(
  value: string | number | null,
  options: FormatAssetOptions = {},
): string {
  const {
    fallback = '—',
    group = true,
    maxFractionDigits = ASSET_DISPLAY_DECIMALS,
    suffix,
  } = options;
  const amount = parseDisplayNumber(value);
  if (amount === null) return fallback;

  const threshold = new BigNumber(1).shiftedBy(-maxFractionDigits);
  if (!amount.isZero() && amount.abs().lt(threshold)) {
    const scientific = amount.toExponential(maxFractionDigits);
    return suffix ? `${scientific} ${suffix}` : scientific;
  }

  const formatted = trimTrailingZeros(amount.toFixed(maxFractionDigits));
  const displayValue = group ? addIntegerGrouping(formatted) : formatted;
  return suffix ? `${displayValue} ${suffix}` : displayValue;
}

export function formatAssetAmount(
  value: string | number | null,
  suffix: string,
  options: Omit<FormatAssetOptions, 'suffix'> = {},
): string {
  return formatAssetValue(value, { ...options, suffix });
}

export function formatRawAssetValue(
  value: string | bigint | null,
  decimals = 18,
  options: FormatAssetOptions = {},
): string {
  if (value === null) return options.fallback ?? '—';
  try {
    return formatAssetValue(formatUnits(BigInt(value), decimals), options);
  } catch {
    return options.fallback ?? '—';
  }
}

export function formatRawAssetAmount(
  value: string | bigint | null,
  suffix: string,
  decimals = 18,
  options: Omit<FormatAssetOptions, 'suffix'> = {},
): string {
  return formatRawAssetValue(value, decimals, { ...options, suffix });
}

export function formatAssetInputValue(value: string | number | null, maxFractionDigits = ASSET_DISPLAY_DECIMALS): string {
  const amount = decimalOrNull(value);
  if (amount === null) return '0';
  return trimTrailingZeros(amount.decimalPlaces(maxFractionDigits, BigNumber.ROUND_DOWN).toFixed(maxFractionDigits));
}

export function formatRawAssetInputValue(value: string | bigint | null, decimals = 18): string {
  return formatRawExactInputValue(value, decimals);
}

function formatEthDecimal(value: string | number | null): string {
  return formatAssetValue(value, { group: false, maxFractionDigits: ETH_DISPLAY_DECIMALS });
}

function formatEthPriceDecimal(value: string | number | null): string {
  const price = parseDisplayNumber(value);
  if (price === null) return '—';

  const threshold = new BigNumber(1).shiftedBy(-ETH_PRICE_DISPLAY_DECIMALS);
  if (!price.isZero() && price.abs().lt(threshold)) {
    return price.toExponential(ETH_PRICE_DISPLAY_DECIMALS);
  }

  return formatAssetValue(price.toString(), { group: false, maxFractionDigits: ETH_PRICE_DISPLAY_DECIMALS });
}

export function formatEthPrice(value: string | number | null): string {
  const price = parseDisplayNumber(value);
  if (price === null || price.isZero()) return '—';
  return formatEthPriceDecimal(price.toString());
}

export function formatMarketPrice(value: string): string {
  return formatEthPrice(value);
}

export function formatEthAmount(value: string | number | null): string {
  return formatAssetAmount(value, 'ETH', { group: false });
}

export function formatEthValue(value: string | number | null): string {
  return formatEthDecimal(value);
}

export function formatEthExact(value: string | number | null): string {
  return formatAssetValue(value, { group: false });
}

export function formatPercentChange(value: number | null) {
  if (value === null) return '0.00%';
  const decimals = value !== 0 && Math.abs(value) < 0.01 ? 6 : 2;
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function getPercentChangeClassName(value: number | null) {
  if (value === null || value === 0) return 'text-slate-400';
  return value < 0 ? 'text-red-400' : 'text-emerald-400';
}

export function formatTokenDisplayValue(
  value: string | number | null,
  maxFractionDigits = ASSET_DISPLAY_DECIMALS,
) {
  return formatAssetValue(value, { maxFractionDigits });
}

export function formatWalletEthBalance(value: string) {
  const formatted = formatEthDecimal(value);
  return formatted === '—' ? '0.0000000' : formatted;
}
