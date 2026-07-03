'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Input, Modal, Segmented, Slider, Spin, Typography } from 'antd';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { useAccount, useBalance } from 'wagmi';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';
import { config } from '@/config/wagmi';
import type { PoolListItem } from '@/lib/poolsApi';
import {
  addLiquidityEth,
  approveLpForLiquidity,
  approveTokenForLiquidity,
  calculateMinAmount,
  estimateRemoveAmounts,
  formatLiquidityAmount,
  getPoolPosition,
  parseLiquidityAmount,
  type PoolPosition,
  removeLiquidityEth,
} from '@/lib/market/liquidityActionsClient';
import { formatEthValue, formatTokenDisplayValue } from '@/lib/formatters/market';
import type { Address } from '@/lib/market/tokenMarketClient';

const { Text } = Typography;
const ETH_MAX_GAS_BUFFER = 10_000_000_000_000_000n;

interface PoolLiquidityModalProps {
  open: boolean;
  pool: PoolListItem | null;
  onClose: () => void;
  onComplete?: () => void | Promise<void>;
}

type LiquidityMode = 'add' | 'remove';
type AddInputSide = 'token' | 'eth';

function hasPositiveAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function formatBalance(value: bigint | null, suffix: string) {
  if (value === null) return `0 ${suffix}`;
  return `${formatTokenDisplayValue(formatLiquidityAmount(value), 7)} ${suffix}`;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) < 0.01 && value !== 0) return `${value.toFixed(4)}%`;
  return `${value.toFixed(2)}%`;
}

function quoteEthForToken(tokenAmount: bigint, position: PoolPosition | null) {
  if (!position || position.tokenReserve === 0n) return 0n;
  return (tokenAmount * position.ethReserve) / position.tokenReserve;
}

function quoteTokenForEth(ethAmount: bigint, position: PoolPosition | null) {
  if (!position || position.ethReserve === 0n) return 0n;
  return (ethAmount * position.tokenReserve) / position.ethReserve;
}

function estimateAddLiquidity(params: {
  tokenAmount: bigint;
  ethAmount: bigint;
  position: PoolPosition | null;
}) {
  if (!params.position || params.position.totalLiquidity === 0n) {
    return {
      mintedLiquidity: 0n,
      poolSharePercent: null,
      tokenUsed: params.tokenAmount,
      ethUsed: params.ethAmount,
      tokenResidual: 0n,
      ethResidual: 0n,
      imbalancePercent: null,
    };
  }

  const tokenSideLiquidity =
    params.position.tokenReserve === 0n
      ? 0n
      : (params.tokenAmount * params.position.totalLiquidity) / params.position.tokenReserve;
  const ethSideLiquidity =
    params.position.ethReserve === 0n
      ? 0n
      : (params.ethAmount * params.position.totalLiquidity) / params.position.ethReserve;
  const mintedLiquidity = tokenSideLiquidity < ethSideLiquidity ? tokenSideLiquidity : ethSideLiquidity;
  const tokenUsed =
    params.position.totalLiquidity === 0n
      ? params.tokenAmount
      : (mintedLiquidity * params.position.tokenReserve) / params.position.totalLiquidity;
  const ethUsed =
    params.position.totalLiquidity === 0n
      ? params.ethAmount
      : (mintedLiquidity * params.position.ethReserve) / params.position.totalLiquidity;
  const denominator = params.position.totalLiquidity + mintedLiquidity;
  const poolSharePercent =
    denominator === 0n ? null : Number((mintedLiquidity * 1_000_000n) / denominator) / 10_000;
  const largerSide = tokenSideLiquidity > ethSideLiquidity ? tokenSideLiquidity : ethSideLiquidity;
  const smallerSide = tokenSideLiquidity < ethSideLiquidity ? tokenSideLiquidity : ethSideLiquidity;
  const imbalancePercent =
    largerSide === 0n ? null : Number(((largerSide - smallerSide) * 1_000_000n) / largerSide) / 10_000;

  return {
    mintedLiquidity,
    poolSharePercent,
    tokenUsed,
    ethUsed,
    tokenResidual: params.tokenAmount > tokenUsed ? params.tokenAmount - tokenUsed : 0n,
    ethResidual: params.ethAmount > ethUsed ? params.ethAmount - ethUsed : 0n,
    imbalancePercent,
  };
}

export function PoolLiquidityModal({
  open,
  pool,
  onClose,
  onComplete,
}: PoolLiquidityModalProps) {
  const { message } = App.useApp();
  const { address, isConnected } = useAccount();
  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: DEFAULT_CHAIN_ID,
  });
  const [mode, setMode] = useState<LiquidityMode>('add');
  const [lastAddInputSide, setLastAddInputSide] = useState<AddInputSide>('token');
  const [tokenAmount, setTokenAmount] = useState('');
  const [ethAmount, setEthAmount] = useState('');
  const [lpAmount, setLpAmount] = useState('');
  const [slippage, setSlippage] = useState(2);
  const [position, setPosition] = useState<PoolPosition | null>(null);
  const [isLoadingPosition, setIsLoadingPosition] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetInputs = useCallback(() => {
    setTokenAmount('');
    setEthAmount('');
    setLpAmount('');
    setLastAddInputSide('token');
    setError(null);
  }, []);

  const refreshPosition = useCallback(async () => {
    if (!open || !pool?.pairAddress || !address) {
      setPosition(null);
      return;
    }

    setIsLoadingPosition(true);
    setError(null);
    try {
      const nextPosition = await getPoolPosition({
        tokenAddress: pool.tokenAddress,
        pairAddress: pool.pairAddress,
        userAddress: address,
      });
      setPosition(nextPosition);
    } catch (cause) {
      const nextMessage = cause instanceof Error ? cause.message : 'Failed to load pool position';
      setError(nextMessage);
      setPosition(null);
    } finally {
      setIsLoadingPosition(false);
    }
  }, [address, open, pool]);

  useEffect(() => {
    if (!open) {
      const timer = window.setTimeout(() => {
        resetInputs();
        setPosition(null);
      }, 0);

      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      void refreshPosition();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, refreshPosition, resetInputs]);

  const parsedTokenAmount = useMemo(() => {
    try {
      return hasPositiveAmount(tokenAmount) ? parseLiquidityAmount(tokenAmount) : 0n;
    } catch {
      return 0n;
    }
  }, [tokenAmount]);

  const parsedEthAmount = useMemo(() => {
    try {
      return hasPositiveAmount(ethAmount) ? parseLiquidityAmount(ethAmount) : 0n;
    } catch {
      return 0n;
    }
  }, [ethAmount]);

  const parsedLpAmount = useMemo(() => {
    try {
      return hasPositiveAmount(lpAmount) ? parseLiquidityAmount(lpAmount) : 0n;
    } catch {
      return 0n;
    }
  }, [lpAmount]);

  const removeEstimate = useMemo(() => {
    if (!position) {
      return { tokenAmount: 0n, ethAmount: 0n };
    }
    return estimateRemoveAmounts({
      liquidity: parsedLpAmount,
      totalLiquidity: position.totalLiquidity,
      tokenReserve: position.tokenReserve,
      ethReserve: position.ethReserve,
    });
  }, [parsedLpAmount, position]);

  const addEstimate = useMemo(() => estimateAddLiquidity({
    tokenAmount: parsedTokenAmount,
    ethAmount: parsedEthAmount,
    position,
  }), [parsedEthAmount, parsedTokenAmount, position]);

  const handleTokenAmountChange = useCallback((value: string) => {
    setLastAddInputSide('token');
    setTokenAmount(value);
    try {
      const parsed = hasPositiveAmount(value) ? parseLiquidityAmount(value) : 0n;
      const quotedEth = quoteEthForToken(parsed, position);
      setEthAmount(parsed > 0n && quotedEth > 0n ? formatLiquidityAmount(quotedEth) : '');
    } catch {
      setEthAmount('');
    }
  }, [position]);

  const handleEthAmountChange = useCallback((value: string) => {
    setLastAddInputSide('eth');
    setEthAmount(value);
    try {
      const parsed = hasPositiveAmount(value) ? parseLiquidityAmount(value) : 0n;
      const quotedToken = quoteTokenForEth(parsed, position);
      setTokenAmount(parsed > 0n && quotedToken > 0n ? formatLiquidityAmount(quotedToken) : '');
    } catch {
      setTokenAmount('');
    }
  }, [position]);

  const setMaxTokenAmount = useCallback(() => {
    if (!position) return;
    handleTokenAmountChange(formatLiquidityAmount(position.userTokenBalance));
  }, [handleTokenAmountChange, position]);

  const setMaxEthAmount = useCallback(() => {
    if (!ethBalance) return;
    const safeAmount = ethBalance.value > ETH_MAX_GAS_BUFFER
      ? ethBalance.value - ETH_MAX_GAS_BUFFER
      : 0n;
    handleEthAmountChange(formatLiquidityAmount(safeAmount));
  }, [ethBalance, handleEthAmountChange]);

  const setLpPercent = useCallback((percent: number) => {
    if (!position) return;
    setLpAmount(formatLiquidityAmount((position.userLpBalance * BigInt(percent)) / 100n));
  }, [position]);

  const tokenNeedsApproval = position !== null && parsedTokenAmount > 0n && position.tokenAllowance < parsedTokenAmount;
  const lpNeedsApproval = position !== null && parsedLpAmount > 0n && position.lpAllowance < parsedLpAmount;
  const symbol = pool?.symbol || 'TOKEN';

  const validateSubmit = () => {
    if (!isConnected || !address) {
      message.warning('Connect wallet before managing liquidity');
      return false;
    }
    if (!pool?.pairAddress || !position) {
      message.warning('Pool position is not ready');
      return false;
    }
    if (mode === 'add') {
      if (parsedTokenAmount === 0n || parsedEthAmount === 0n) {
        message.warning('Enter token and ETH amounts');
        return false;
      }
      if (position.userTokenBalance < parsedTokenAmount) {
        message.error('Insufficient token balance');
        return false;
      }
      if (ethBalance && ethBalance.value < parsedEthAmount) {
        message.error('Insufficient ETH balance');
        return false;
      }
      return true;
    }

    if (parsedLpAmount === 0n) {
      message.warning('Enter LP amount');
      return false;
    }
    if (position.userLpBalance < parsedLpAmount) {
      message.error('Insufficient LP balance');
      return false;
    }
    return true;
  };

  const handleApprove = async () => {
    if (!pool || !position) return;
    setIsSubmitting(true);
    const key = mode === 'add' ? 'approvePoolToken' : 'approvePoolLp';
    try {
      message.loading({ content: 'Submitting approval...', key, duration: 0 });
      const hash = mode === 'add'
        ? await approveTokenForLiquidity(pool.tokenAddress, position.router)
        : await approveLpForLiquidity(position.pairAddress, position.router);
      await waitForTransactionReceipt(config, { hash, chainId: DEFAULT_CHAIN_ID });
      message.success({ content: 'Approval confirmed', key, duration: 3 });
      await refreshPosition();
    } catch (cause) {
      message.destroy(key);
      message.error(cause instanceof Error ? cause.message : 'Approval failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateSubmit() || !pool || !position || !address) return;
    setIsSubmitting(true);
    const key = mode === 'add' ? 'addPoolLiquidity' : 'removePoolLiquidity';
    try {
      message.loading({
        content: mode === 'add' ? 'Adding liquidity...' : 'Removing liquidity...',
        key,
        duration: 0,
      });

      const hash = mode === 'add'
        ? await addLiquidityEth({
            tokenAddress: pool.tokenAddress,
            tokenAmount: parsedTokenAmount,
            ethAmount: parsedEthAmount,
            minTokenAmount: calculateMinAmount(parsedTokenAmount, slippage),
            minEthAmount: calculateMinAmount(parsedEthAmount, slippage),
            recipient: address as Address,
          })
        : await removeLiquidityEth({
            tokenAddress: pool.tokenAddress,
            liquidity: parsedLpAmount,
            minTokenAmount: calculateMinAmount(removeEstimate.tokenAmount, slippage),
            minEthAmount: calculateMinAmount(removeEstimate.ethAmount, slippage),
            recipient: address as Address,
          });

      await waitForTransactionReceipt(config, { hash, chainId: DEFAULT_CHAIN_ID });
      message.success({
        content: mode === 'add' ? 'Liquidity added' : 'Liquidity removed',
        key,
        duration: 3,
      });
      resetInputs();
      await Promise.allSettled([
        refreshPosition(),
        refetchEthBalance(),
        onComplete ? onComplete() : Promise.resolve(),
      ]);
    } catch (cause) {
      message.destroy(key);
      message.error(cause instanceof Error ? cause.message : 'Liquidity transaction failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const primaryButton = mode === 'add' && tokenNeedsApproval
    ? { text: `Approve ${symbol}`, onClick: handleApprove }
    : mode === 'remove' && lpNeedsApproval
      ? { text: 'Approve LP', onClick: handleApprove }
      : { text: mode === 'add' ? 'Add liquidity' : 'Remove liquidity', onClick: handleSubmit };

  return (
    <Modal
      title={pool ? `${symbol} liquidity` : 'Manage liquidity'}
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      className="dark-modal"
      width={520}
      destroyOnHidden
    >
      {!isConnected && (
        <Alert type="warning" showIcon className="mb-4" message="Connect wallet to manage liquidity" />
      )}

      {error && (
        <Alert type="warning" showIcon className="mb-4" message="Pool position unavailable" description={error} />
      )}

      <Segmented
        block
        value={mode}
        onChange={(value) => {
          setMode(value as LiquidityMode);
          resetInputs();
        }}
        options={[
          { label: 'Add', value: 'add' },
          { label: 'Remove', value: 'remove' },
        ]}
        className="mb-4"
      />

      {isLoadingPosition ? (
        <div className="flex min-h-52 items-center justify-center">
          <Spin />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs">
            <div>
              <Text className="block text-slate-500">Your {symbol}</Text>
              <Text className="text-slate-200">{formatBalance(position?.userTokenBalance ?? null, symbol)}</Text>
            </div>
            <div>
              <Text className="block text-slate-500">Your LP</Text>
              <Text className="text-slate-200">{formatBalance(position?.userLpBalance ?? null, 'LP')}</Text>
            </div>
            <div>
              <Text className="block text-slate-500">Pool {symbol}</Text>
              <Text className="text-slate-200">{formatBalance(position?.tokenReserve ?? null, symbol)}</Text>
            </div>
            <div>
              <Text className="block text-slate-500">Pool ETH</Text>
              <Text className="text-slate-200">{formatEthValue(position ? formatLiquidityAmount(position.ethReserve) : '0')} ETH</Text>
            </div>
          </div>

          {mode === 'add' ? (
            <>
              <Input
                size="large"
                value={tokenAmount}
                onChange={(event) => handleTokenAmountChange(event.target.value)}
                placeholder={`${symbol} amount`}
                suffix={symbol}
              />
              <Input
                size="large"
                value={ethAmount}
                onChange={(event) => handleEthAmountChange(event.target.value)}
                placeholder="ETH amount"
                suffix="ETH"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="small"
                  onClick={setMaxTokenAmount}
                  className="border-slate-700 bg-slate-800/70 text-slate-300"
                >
                  MAX {symbol}
                </Button>
                <Button
                  size="small"
                  onClick={setMaxEthAmount}
                  className="border-slate-700 bg-slate-800/70 text-slate-300"
                >
                  MAX ETH
                </Button>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs">
                <div className="flex justify-between">
                  <Text className="text-slate-500">Pool share</Text>
                  <Text className="text-slate-200">{formatPercent(addEstimate.poolSharePercent)}</Text>
                </div>
                <div className="mt-2 flex justify-between">
                  <Text className="text-slate-500">Estimated LP</Text>
                  <Text className="text-slate-200">
                    {formatTokenDisplayValue(formatLiquidityAmount(addEstimate.mintedLiquidity), 7)} LP
                  </Text>
                </div>
                <div className="mt-2 flex justify-between">
                  <Text className="text-slate-500">Ratio difference</Text>
                  <Text className={addEstimate.imbalancePercent !== null && addEstimate.imbalancePercent > 1 ? 'text-amber-300' : 'text-slate-200'}>
                    {formatPercent(addEstimate.imbalancePercent)}
                  </Text>
                </div>
                {(addEstimate.tokenResidual > 0n || addEstimate.ethResidual > 0n) && (
                  <div className="mt-2 rounded border border-amber-400/20 bg-amber-400/10 p-2 text-amber-100">
                    Router may leave unused {addEstimate.tokenResidual > 0n
                      ? `${formatTokenDisplayValue(formatLiquidityAmount(addEstimate.tokenResidual), 7)} ${symbol}`
                      : `${formatEthValue(formatLiquidityAmount(addEstimate.ethResidual))} ETH`} because the entered ratio differs from the pool.
                  </div>
                )}
                <Text className="mt-2 block text-slate-500">
                  Auto-quoted from {lastAddInputSide === 'token' ? symbol : 'ETH'} using current reserves.
                </Text>
              </div>
            </>
          ) : (
            <>
              <Input
                size="large"
                value={lpAmount}
                onChange={(event) => setLpAmount(event.target.value)}
                placeholder="LP amount"
                suffix="LP"
              />
              <div className="grid grid-cols-3 gap-2">
                {[25, 50, 100].map((percent) => (
                  <Button
                    key={percent}
                    size="small"
                    onClick={() => setLpPercent(percent)}
                    className="border-slate-700 bg-slate-800/70 text-slate-300"
                  >
                    {percent}%
                  </Button>
                ))}
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs">
                <div className="mb-2 flex justify-between">
                  <Text className="text-slate-500">Removing</Text>
                  <Text className="text-slate-200">
                    {position && position.userLpBalance > 0n
                      ? formatPercent(Number((parsedLpAmount * 1_000_000n) / position.userLpBalance) / 10_000)
                      : '—'}
                  </Text>
                </div>
                <div className="flex justify-between">
                  <Text className="text-slate-500">Estimated receive</Text>
                  <Text className="text-slate-200">
                    {formatTokenDisplayValue(formatLiquidityAmount(removeEstimate.tokenAmount), 7)} {symbol}
                  </Text>
                </div>
                <div className="mt-2 flex justify-between">
                  <Text className="text-slate-500">Estimated ETH</Text>
                  <Text className="text-slate-200">
                    {formatEthValue(formatLiquidityAmount(removeEstimate.ethAmount))} ETH
                  </Text>
                </div>
              </div>
            </>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Text className="text-slate-400">Slippage</Text>
              <Text className="text-white">{slippage}%</Text>
            </div>
            <Slider
              min={0.1}
              max={5}
              step={0.1}
              value={slippage}
              onChange={(value) => setSlippage(value as number)}
              className="dark-slider"
            />
          </div>

          <Button
            type="primary"
            size="large"
            block
            loading={isSubmitting}
            disabled={!pool || !position || !isConnected}
            onClick={() => void primaryButton.onClick()}
            className="border-0 bg-emerald-600 font-semibold hover:bg-emerald-500"
          >
            {primaryButton.text}
          </Button>
        </div>
      )}
    </Modal>
  );
}
