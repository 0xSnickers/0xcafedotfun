'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Button, Space, App, Alert } from 'antd';
import { SettingOutlined, SwapOutlined } from '@ant-design/icons';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useBalance, useBlockNumber } from 'wagmi';
import { waitForTransactionReceipt, readContract } from 'wagmi/actions';
import { config } from '@/config/wagmi';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';
import { MEME_TOKEN_ABI } from '@/config/abis';
import { useApproveToken, useDebounce, useTokenAllowance } from '@/hooks/useMarket';
import { useDexTrade } from '@/hooks/useDexTrade';
import { useTradeConfirmationPreference } from '@/hooks/useTradeConfirmationPreference';
import { marketUtils } from '@/hooks/market/utils';
import { formatEthValue, formatTokenDisplayValue } from '@/lib/formatters/market';
import { isAmountGreaterThanRaw } from '@/lib/numbers';
import { debugError } from '@/lib/debugLog';
import type { Address } from '@/lib/market/tokenMarketClient';
import { TradeConfirmModal } from '@/components/feature/trade/TradeConfirmModal';
import { TradePanelForm } from '@/components/feature/trade/TradePanelForm';
import { TradeSettingsModal } from '@/components/feature/trade/TradeSettingsModal';
import {
  formatRawTokenInputAmount,
  getSafeBuyMaxAmount,
  hasPositiveAmount,
} from '@/components/feature/trade/tradePanelUtils';

interface DEXTradePanelProps {
  tokenAddress: string;
  tokenSymbol: string;
  tokenBalance?: { raw: bigint; formatted: string } | null;
  onTradeComplete?: () => void | Promise<void>;
  refetchTokenBalance?: () => Promise<{ raw: bigint; formatted: string } | null>;
}

type TradeMode = 'buy' | 'sell';

function filterWalletNoise(error: unknown) {
  if (!(error instanceof Error)) return error;
  if (
    error.message.includes('chrome.runtime.sendMessage') ||
    error.message.includes('Extension ID') ||
    error.stack?.includes('inpage.js')
  ) {
    return null;
  }
  return error;
}

export function DEXTradePanel({
  tokenAddress,
  tokenSymbol,
  tokenBalance = null,
  onTradeComplete,
  refetchTokenBalance,
}: DEXTradePanelProps) {
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy');
  const [inputAmount, setInputAmount] = useState('');
  const [slippage, setSlippage] = useState(2);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [isExecutingTrade, setIsExecutingTrade] = useState(false);
  const [isUpdatingBalance, setIsUpdatingBalance] = useState(false);
  const { confirmBeforeTrade, setConfirmBeforeTrade } = useTradeConfirmationPreference();
  const debouncedInputAmount = useDebounce(inputAmount, 500);
  const { address } = useAccount();
  const { message } = App.useApp();
  const {
    dexAddresses,
    quote,
    error,
    isQuoteLoading,
    isSwapping,
    quoteExactInput,
    swapExactInput,
  } = useDexTrade(tokenAddress);
  const dexRouterAddress = dexAddresses?.router ?? '';
  const { allowance, checkAllowance, isLoading: isAllowanceLoading } = useTokenAllowance(
    tokenAddress,
    dexRouterAddress,
  );
  const { approveToken, isLoading: isApproving } = useApproveToken();
  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: DEFAULT_CHAIN_ID,
  });
  const { data: blockNumber } = useBlockNumber({
    chainId: DEFAULT_CHAIN_ID,
    watch: true,
  });

  const hasInputAmount = hasPositiveAmount(inputAmount);
  const hasDebouncedAmount = hasPositiveAmount(debouncedInputAmount);

  const needsApproval = useMemo(() => {
    if (tradeMode !== 'sell' || allowance === null || !hasDebouncedAmount) {
      return false;
    }

    try {
      return allowance < parseUnits(debouncedInputAmount, 18);
    } catch {
      return false;
    }
  }, [allowance, debouncedInputAmount, hasDebouncedAmount, tradeMode]);

  const balanceText = useMemo(() => {
    if (tradeMode === 'buy') {
      return ethBalance
        ? `${formatEthValue(formatUnits(ethBalance.value, ethBalance.decimals))} ETH`
        : '0 ETH';
    }
    return `${tokenBalance ? tokenBalance.formatted : '0'} ${tokenSymbol}`;
  }, [ethBalance, tokenBalance, tokenSymbol, tradeMode]);

  useEffect(() => {
    if (tradeMode !== 'sell' || !address || !dexAddresses?.router || !hasDebouncedAmount) {
      return;
    }
    void checkAllowance(address);
  }, [address, checkAllowance, dexAddresses?.router, hasDebouncedAmount, tradeMode]);

  useEffect(() => {
    if (!hasDebouncedAmount) {
      return;
    }

    const run = async () => {
      try {
        if (tradeMode === 'buy' && ethBalance && isAmountGreaterThanRaw(debouncedInputAmount, ethBalance.value, ethBalance.decimals)) {
          return;
        }

        if (tradeMode === 'sell') {
          if (!tokenBalance || isAmountGreaterThanRaw(debouncedInputAmount, tokenBalance.raw)) return;
        }

        await quoteExactInput(tradeMode, debouncedInputAmount);
      } catch (cause) {
        if (filterWalletNoise(cause)) {
          debugError('DEX quote failed:', cause);
        }
      }
    };

    void run();
  }, [
    blockNumber,
    debouncedInputAmount,
    ethBalance,
    hasDebouncedAmount,
    quoteExactInput,
    tokenBalance,
    tradeMode,
  ]);

  const refreshQuotes = useCallback(async () => {
    if (!hasInputAmount) return;
    await quoteExactInput(tradeMode, inputAmount);
    message.info('Quote refreshed');
  }, [hasInputAmount, inputAmount, message, quoteExactInput, tradeMode]);

  const handleSetMax = useCallback(() => {
    if (tradeMode === 'buy') {
      if (!ethBalance) return;
      setInputAmount(getSafeBuyMaxAmount(ethBalance.value, ethBalance.decimals));
      return;
    }

    setInputAmount(tokenBalance ? formatRawTokenInputAmount(tokenBalance.raw) : '0');
  }, [ethBalance, tokenBalance, tradeMode]);

  const handleQuickAmount = useCallback((value: string) => {
    if (tradeMode === 'buy') {
      setInputAmount(value);
      return;
    }

    const percentage = BigInt(value.replace('%', ''));
    const amount = tokenBalance ? (tokenBalance.raw * percentage) / 100n : 0n;
    setInputAmount(formatRawTokenInputAmount(amount));
  }, [tokenBalance, tradeMode]);

  const handleApprove = useCallback(async () => {
    if (!dexRouterAddress) {
      message.error('Router address not found');
      return;
    }

    setIsExecutingTrade(true);
    message.loading({ content: 'Submitting router approval...', key: 'dexApprove', duration: 0 });
    try {
      const hash = await approveToken(tokenAddress, dexRouterAddress, 0n);
      message.loading({ content: 'Waiting for approval confirmation...', key: 'dexApprove', duration: 0 });
      await waitForTransactionReceipt(config, { hash, chainId: DEFAULT_CHAIN_ID });
      message.success({ content: 'Router approval confirmed', key: 'dexApprove', duration: 3 });
      if (address) {
        await checkAllowance(address);
      }
    } catch (cause) {
      message.destroy('dexApprove');
      const nextError = filterWalletNoise(cause);
      if (nextError instanceof Error) {
        message.error(`Approval failed: ${nextError.message}`);
      }
    } finally {
      setIsExecutingTrade(false);
    }
  }, [address, approveToken, checkAllowance, dexRouterAddress, message, tokenAddress]);

  const sellInputExceedsBalance = useMemo(() => {
    if (tradeMode !== 'sell' || !hasInputAmount || !tokenBalance) {
      return false;
    }

    try {
      return isAmountGreaterThanRaw(inputAmount, tokenBalance.raw);
    } catch {
      return true;
    }
  }, [hasInputAmount, inputAmount, tokenBalance, tradeMode]);

  const showTradeConfirmModal = useCallback(async () => {
    if (!address) {
      message.warning('Connect wallet before trading');
      return;
    }
    if (!hasInputAmount) {
      message.warning('Enter a valid amount');
      return;
    }
    if (!quote || quote.amountOut === 0n) {
      message.warning('Wait for the quote to finish');
      return;
    }

    if (tradeMode === 'buy') {
      if (!ethBalance || isAmountGreaterThanRaw(inputAmount, ethBalance.value, ethBalance.decimals)) {
        message.error('Insufficient ETH balance');
        return;
      }
    } else {
      if (!tokenBalance || isAmountGreaterThanRaw(inputAmount, tokenBalance.raw)) {
        message.error('Sell amount exceeds available balance');
        return;
      }
      if (needsApproval) {
        message.warning('Approve the token first');
        return;
      }
    }

    setConfirmModalVisible(true);
  }, [address, ethBalance, hasInputAmount, inputAmount, message, needsApproval, quote, tokenBalance, tradeMode]);

  const executeTradeAction = useCallback(async () => {
    if (!address) {
      message.warning('Connect wallet before trading');
      return;
    }
    if (!quote) {
      message.warning('Quote is unavailable');
      return;
    }

    const tradeKey = tradeMode === 'buy' ? 'dexBuyProgress' : 'dexSellProgress';
    setIsExecutingTrade(true);

    try {
      if (tradeMode === 'sell') {
        const amountToSell = parseUnits(inputAmount, 18);
        const actualBalance = await readContract(config, {
          address: tokenAddress as Address,
          abi: MEME_TOKEN_ABI,
          functionName: 'balanceOf',
          args: [address as Address],
          chainId: DEFAULT_CHAIN_ID,
        }) as bigint;

        if (actualBalance < amountToSell) {
          throw new Error('Latest onchain balance is insufficient');
        }
      }

      const minAmountOut = marketUtils.calculateMinReceive(quote.amountOut, slippage);
      message.loading({ content: 'Submitting swap...', key: tradeKey, duration: 0 });
      const hash = await swapExactInput({
        mode: tradeMode,
        amount: inputAmount,
        minAmountOut,
        recipient: address as Address,
      });

      message.loading({ content: 'Transaction submitted. Waiting for confirmation...', key: tradeKey, duration: 0 });
      const receipt = await waitForTransactionReceipt(config, {
        hash,
        chainId: DEFAULT_CHAIN_ID,
      });

      if (receipt.status !== 'success') {
        throw new Error('Transaction reverted onchain');
      }

      message.success({
        content: tradeMode === 'buy' ? 'Buy confirmed' : 'Sell confirmed',
        key: tradeKey,
        duration: 3,
      });

      setInputAmount('');
      setConfirmModalVisible(false);
      setIsUpdatingBalance(true);

      await Promise.allSettled([
        refetchEthBalance(),
        refetchTokenBalance ? refetchTokenBalance() : Promise.resolve(null),
        onTradeComplete ? onTradeComplete() : Promise.resolve(),
      ]);
    } catch (cause) {
      message.destroy(tradeKey);
      const nextError = filterWalletNoise(cause);
      if (nextError instanceof Error) {
        if (nextError.message.includes('User rejected')) {
          message.warning('Transaction cancelled');
          return;
        }
        message.error(`Trade failed: ${nextError.message}`);
      }
    } finally {
      setIsUpdatingBalance(false);
      setIsExecutingTrade(false);
    }
  }, [
    address,
    inputAmount,
    message,
    onTradeComplete,
    quote,
    refetchEthBalance,
    refetchTokenBalance,
    slippage,
    swapExactInput,
    tokenAddress,
    tradeMode,
  ]);

  const handleTradeAction = useCallback(() => {
    if (confirmBeforeTrade) {
      void showTradeConfirmModal();
      return;
    }

    void executeTradeAction();
  }, [confirmBeforeTrade, executeTradeAction, showTradeConfirmModal]);

  const outputInfo = useMemo(() => {
    if (!hasInputAmount) {
      return {
        amount: '0',
        symbol: tradeMode === 'buy' ? tokenSymbol : 'ETH',
      };
    }

    if (tradeMode === 'buy') {
      return {
        amount: quote ? formatTokenDisplayValue(formatUnits(quote.amountOut, 18), 7) : '...',
        symbol: tokenSymbol,
      };
    }

    return {
      amount: quote ? formatEthValue(formatUnits(quote.amountOut, 18)) : '0',
      symbol: 'ETH',
    };
  }, [hasInputAmount, quote, tokenSymbol, tradeMode]);

  const buttonProps = useMemo(() => {
    if (isUpdatingBalance) {
      return {
        text: 'Updating balance...',
        onClick: () => undefined,
        loading: true,
        disabled: true,
      };
    }

    if (tradeMode === 'sell' && needsApproval) {
      return {
        text: `Approve ${tokenSymbol}`,
        onClick: handleApprove,
        loading: isApproving || isExecutingTrade,
        disabled: !address || !hasInputAmount || !tokenBalance || sellInputExceedsBalance,
      };
    }

    return {
      text: `${tradeMode === 'buy' ? 'Buy' : 'Sell'} ${tokenSymbol}`,
      onClick: handleTradeAction,
      loading: isSwapping || isAllowanceLoading,
      disabled:
        !address ||
        !hasInputAmount ||
        !quote ||
        quote.amountOut === 0n ||
        (tradeMode === 'sell' && (!tokenBalance || sellInputExceedsBalance)),
    };
  }, [
    address,
    handleApprove,
    handleTradeAction,
    hasInputAmount,
    isAllowanceLoading,
    isApproving,
    isExecutingTrade,
    isSwapping,
    isUpdatingBalance,
    needsApproval,
    quote,
    sellInputExceedsBalance,
    tokenBalance,
    tokenSymbol,
    tradeMode,
  ]);

  return (
    <Card
      title={
        <Space align="center">
          <SwapOutlined className="text-blue-400" />
          <span className="text-white">Trade</span>
        </Space>
      }
      extra={
        <Button
          type="text"
          size="small"
          icon={<SettingOutlined />}
          className="text-slate-300 hover:text-blue-400"
          onClick={() => setSettingsModalVisible(true)}
          aria-label="Trade settings"
        />
      }
      className="w-full max-w-md bg-slate-800/50 border-slate-700"
    >
      {error && (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message="Quote unavailable"
          description={error.message}
        />
      )}

      <TradePanelForm
        tradeMode={tradeMode}
        tokenSymbol={tokenSymbol}
        inputAmount={inputAmount}
        outputAmount={outputInfo.amount}
        outputSymbol={outputInfo.symbol}
        isGraduated={false}
        buttonText={buttonProps.text}
        buttonLoading={buttonProps.loading}
        buttonDisabled={buttonProps.disabled}
        balanceText={balanceText}
        onModeChange={(mode) => {
          setTradeMode(mode);
          setInputAmount('');
          setConfirmModalVisible(false);
        }}
        onInputChange={setInputAmount}
        onSetMax={handleSetMax}
        onQuickAmount={handleQuickAmount}
        onRefreshBalance={async () => {
          await refetchEthBalance();
          if (tradeMode === 'sell' && refetchTokenBalance) {
            await refetchTokenBalance();
          }
          message.success('Balance refreshed');
        }}
        onRefreshQuote={refreshQuotes}
        onTradeAction={buttonProps.onClick}
        refreshingBalance={isUpdatingBalance}
        refreshingQuote={isQuoteLoading}
      />

      <TradeSettingsModal
        open={settingsModalVisible}
        slippage={slippage}
        confirmBeforeTrade={confirmBeforeTrade}
        onClose={() => setSettingsModalVisible(false)}
        onSlippageChange={setSlippage}
        onConfirmBeforeTradeChange={setConfirmBeforeTrade}
      />

      <TradeConfirmModal
        confirmModalVisible={confirmModalVisible}
        isExecutingTrade={isExecutingTrade}
        isUpdatingBalance={isUpdatingBalance}
        tradeMode={tradeMode}
        tokenSymbol={tokenSymbol}
        inputAmount={inputAmount}
        outputInfo={outputInfo}
        buyPriceInfo={null}
        sellPriceInfo={null}
        formatEth={(value) => formatEthValue(formatUnits(value, 18))}
        onCancel={() => setConfirmModalVisible(false)}
        onConfirm={executeTradeAction}
      />
    </Card>
  );
}
