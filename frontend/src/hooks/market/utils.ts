import { formatEther, formatUnits } from 'viem';
import { scalePercentToBps } from '@/lib/numbers';
import { formatAssetValue } from '@/lib/formatters/market';

export const marketUtils = {
  formatETH: (amount: bigint | null | undefined) =>
    amount === null || amount === undefined
      ? '0'
      : formatAssetValue(formatEther(amount), { fallback: '0', group: false }),
  formatToken: (amount: bigint | null | undefined, decimals = 7) =>
    amount === null || amount === undefined
      ? '0'
      : formatAssetValue(formatUnits(amount, 18), { fallback: '0', maxFractionDigits: decimals }),
  formatTokenDisplay: (amount: bigint | null | undefined) =>
    amount === null || amount === undefined ? '0' : formatUnits(amount, 18),
  calculateMinReceive: (amount: bigint, slippage: number) =>
    amount - (amount * scalePercentToBps(slippage)) / 10_000n,
};
