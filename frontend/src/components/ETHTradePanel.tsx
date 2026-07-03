'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Button, Space, App } from 'antd';
import { SettingOutlined, SwapOutlined } from '@ant-design/icons';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useBalance, useBlockNumber } from 'wagmi';
import { waitForTransactionReceipt, readContract } from 'wagmi/actions';
import {
  useMarket,
  marketUtils,
  useDebounce,
  useTokenAllowance,
  useApproveToken,
} from '@/hooks/useMarket';
import { useTradeConfirmationPreference } from '@/hooks/useTradeConfirmationPreference';
import { config } from '@/config/wagmi';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';
import { MEME_TOKEN_ABI } from '@/config/abis';
import { formatEthValue, formatTokenDisplayValue } from '@/lib/formatters/market';
import { formatRawExactInputValue, isAmountGreaterThanRaw } from '@/lib/numbers';
import { debugError } from '@/lib/debugLog';
import { TradeConfirmModal } from '@/components/feature/trade/TradeConfirmModal';
import { TradePanelForm } from '@/components/feature/trade/TradePanelForm';
import { TradeSettingsModal } from '@/components/feature/trade/TradeSettingsModal';
import {
  formatRawTokenInputAmount,
  getSafeBuyMaxAmount,
  hasPositiveAmount,
} from '@/components/feature/trade/tradePanelUtils';

interface ETHTradePanelProps {
  tokenAddress: string;
  tokenSymbol: string;
  tokenBalance?: { raw: bigint; formatted: string } | null;
  onTradeComplete?: () => void | Promise<void>;
  refetchTokenBalance?: () => Promise<{ raw: bigint; formatted: string } | null>;
}

type TradeMode = 'buy' | 'sell';

const filterKnownNoise = (error: unknown) => {
  if (!(error instanceof Error)) {
    return error;
  }

  if (
    error.message.includes('chrome.runtime.sendMessage') ||
    error.message.includes('Extension ID') ||
    error.stack?.includes('inpage.js')
  ) {
    return null;
  }

  return error;
};

const isCurveCapacityError = (error: Error) => (
  error.message.includes('ExcessiveEthInput') ||
  error.message.includes('InsufficientOutput') ||
  error.message.includes('InvalidStage') ||
  error.message.includes('Transaction reverted onchain')
);

export default function ETHTradePanel({
  tokenAddress,
  tokenSymbol,
  tokenBalance = null,
  onTradeComplete,
  refetchTokenBalance,
}: ETHTradePanelProps) {
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
    marketAddress,
    tokenAmount,
    priceInfo,
    sellPriceInfo,
    buyQuoteLimit,
    calculateTokensForETH,
    calculateBuyPrice,
    calculateSellPrice,
    buyTokens,
    sellTokens,
    isBuying,
    isSelling,
    isTokenAmountLoading,
    isSellPriceLoading,
    isGraduated,
    fetchMarketParams,
  } = useMarket(tokenAddress);

  const { allowance, checkAllowance, isLoading: isAllowanceLoading } = useTokenAllowance(
    tokenAddress,
    marketAddress || '',
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
    if (tradeMode !== 'sell' || allowance === null || !hasDebouncedAmount || isGraduated === true) {
      return false;
    }

    try {
      return allowance < parseUnits(debouncedInputAmount, 18);
    } catch {
      return false;
    }
  }, [allowance, debouncedInputAmount, hasDebouncedAmount, isGraduated, tradeMode]);

  const formatETHBalance = useCallback((balance: string) => {
    try {
      return formatEthValue(balance);
    } catch {
      return '0';
    }
  }, []);

  const balanceText = useMemo(() => {
    if (tradeMode === 'buy') {
      return ethBalance
        ? `${formatETHBalance(formatUnits(ethBalance.value, ethBalance.decimals))} ETH`
        : '0 ETH';
    }

    return `${tokenBalance ? tokenBalance.formatted : '0'} ${tokenSymbol}`;
  }, [ethBalance, formatETHBalance, tokenBalance, tokenSymbol, tradeMode]);

  useEffect(() => {
    if (isGraduated !== true) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setInputAmount('');
      setConfirmModalVisible(false);
      message.info({
        content: 'This token has migrated to the DEX.',
        duration: 4,
        key: 'tokenGraduated',
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isGraduated, message]);

  useEffect(() => {
    if (tradeMode !== 'sell' || !address || !hasDebouncedAmount || isGraduated === true) {
      return;
    }

    void checkAllowance(address);
  }, [address, checkAllowance, debouncedInputAmount, hasDebouncedAmount, isGraduated, tradeMode]);

  useEffect(() => {
    if (!hasDebouncedAmount || isGraduated === true) {
      return;
    }

    const run = async () => {
      try {
        if (tradeMode === 'buy') {
          if (ethBalance && isAmountGreaterThanRaw(debouncedInputAmount, ethBalance.value, ethBalance.decimals)) {
            return;
          }

          await calculateTokensForETH(debouncedInputAmount);
          return;
        }

        if (tokenBalance && isAmountGreaterThanRaw(debouncedInputAmount, tokenBalance.raw)) {
          return;
        }

        await calculateSellPrice(debouncedInputAmount);
      } catch (error) {
        if (filterKnownNoise(error)) {
          debugError('Quote calculation failed:', error);
        }
      }
    };

    void run();
  }, [
    calculateSellPrice,
    calculateTokensForETH,
    blockNumber,
    debouncedInputAmount,
    ethBalance,
    hasDebouncedAmount,
    isGraduated,
    tokenBalance,
    tradeMode,
  ]);

  useEffect(() => {
    if (tradeMode !== 'buy' || !hasDebouncedAmount || !tokenAmount || isGraduated === true) {
      return;
    }

    void calculateBuyPrice(marketUtils.formatTokenDisplay(tokenAmount));
  }, [calculateBuyPrice, hasDebouncedAmount, isGraduated, tokenAmount, tradeMode]);

  const refreshQuotes = useCallback(async () => {
    if (!hasInputAmount || isGraduated === true) {
      return;
    }

    if (tradeMode === 'buy') {
      await calculateTokensForETH(inputAmount);
      message.info('Quote refreshed');
      return;
    }

    await calculateSellPrice(inputAmount);
    message.info('Quote refreshed');
  }, [calculateSellPrice, calculateTokensForETH, hasInputAmount, inputAmount, isGraduated, message, tradeMode]);

  const handleApprove = useCallback(async () => {
    if (!marketAddress) {
      message.error('Market address not found');
      return;
    }

    setIsExecutingTrade(true);
    message.loading({ content: 'Submitting approval...', key: 'approveProgress', duration: 0 });

    try {
      const hash = await approveToken(tokenAddress, marketAddress, 0n);
      message.loading({ content: 'Waiting for approval confirmation...', key: 'approveProgress', duration: 0 });
      await waitForTransactionReceipt(config, { hash });
      message.success({ content: 'Approval confirmed', key: 'approveProgress', duration: 3 });

      if (address) {
        await checkAllowance(address);
      }
    } catch (error) {
      const nextError = filterKnownNoise(error);
      message.destroy('approveProgress');
      if (nextError instanceof Error) {
        message.error(`Approval failed: ${nextError.message}`);
      }
    } finally {
      setIsExecutingTrade(false);
    }
  }, [address, approveToken, checkAllowance, marketAddress, message, tokenAddress]);

  const handleSetMax = useCallback(() => {
    if (tradeMode === 'buy') {
      if (!ethBalance) {
        return;
      }

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

  const buyInputExceedsCurve = tradeMode === 'buy' && buyQuoteLimit !== null;
  const buyQuoteWarning = useMemo(() => {
    if (!buyInputExceedsCurve || !buyQuoteLimit) {
      return null;
    }

    return `Your input exceeds the curve capacity. ${formatEthValue(formatUnits(buyQuoteLimit.maxGrossEthIn, 18))} ETH is the launch quote for this market, with an estimated ${formatTokenDisplayValue(marketUtils.formatTokenDisplay(buyQuoteLimit.estimatedLaunchTokenOut), 7)} ${tokenSymbol} out.`;
  }, [buyInputExceedsCurve, buyQuoteLimit, tokenSymbol]);

  const buyQuoteWarningActionText = useMemo(() => {
    if (!buyInputExceedsCurve || !buyQuoteLimit) {
      return null;
    }

    return 'Use launch quote';
  }, [buyInputExceedsCurve, buyQuoteLimit]);

  const handleUseLaunchCurveBuy = useCallback(() => {
    if (!buyQuoteLimit) {
      return;
    }

    setInputAmount(formatRawExactInputValue(buyQuoteLimit.maxGrossEthIn, 18));
  }, [buyQuoteLimit]);

  const showTradeConfirmModal = useCallback(async () => {
    if (!hasInputAmount) {
      message.warning('Enter a valid amount');
      return;
    }

    if (tradeMode === 'buy') {
      if (!ethBalance) {
        message.error('Unable to load ETH balance');
        return;
      }

      if (isAmountGreaterThanRaw(inputAmount, ethBalance.value, ethBalance.decimals)) {
        message.error(`Insufficient balance: ${formatEthValue(formatUnits(ethBalance.value, ethBalance.decimals))} ETH available`);
        return;
      }

      message.loading({ content: 'Refreshing latest quote...', key: 'quoteBeforeConfirm', duration: 0 });
      const latestQuote = await calculateTokensForETH(inputAmount);
      message.destroy('quoteBeforeConfirm');

      if (!latestQuote?.tokenAmount || !latestQuote.priceInfo) {
        message.warning('Unable to refresh quote. Please try again.');
        return;
      }

      if (latestQuote.quoteLimit) {
        message.warning(`Curve capacity changed. Use the launch quote ${formatEthValue(formatUnits(latestQuote.quoteLimit.maxGrossEthIn, 18))} ETH and try again.`);
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

      if (!sellPriceInfo) {
        message.warning('Wait for the quote to finish');
        return;
      }

      message.loading({ content: 'Refreshing latest quote...', key: 'quoteBeforeConfirm', duration: 0 });
      const latestSellQuote = await calculateSellPrice(inputAmount);
      message.destroy('quoteBeforeConfirm');

      if (!latestSellQuote?.ethReceived) {
        message.warning('Unable to refresh quote. Please try again.');
        return;
      }
    }

    setConfirmModalVisible(true);
  }, [
    calculateSellPrice,
    calculateTokensForETH,
    ethBalance,
    hasInputAmount,
    inputAmount,
    message,
    needsApproval,
    sellPriceInfo,
    tokenBalance,
    tradeMode,
  ]);

  const executeTradeAction = useCallback(async () => {
    const tradeKey = tradeMode === 'buy' ? 'buyProgress' : 'sellProgress';
    setIsExecutingTrade(true);

    try {
      let hash: `0x${string}`;

      if (tradeMode === 'buy') {
        message.loading({ content: 'Refreshing latest quote...', key: tradeKey, duration: 0 });
        const latestQuote = await calculateTokensForETH(inputAmount);

        if (!latestQuote?.tokenAmount) {
          throw new Error('Token amount calculation failed');
        }

        if (latestQuote.quoteLimit) {
          throw new Error('Curve capacity changed. Please use the launch quote and try again.');
        }

        const minTokenAmount = marketUtils.calculateMinReceive(latestQuote.tokenAmount, slippage);
        message.loading({ content: 'Submitting buy transaction...', key: tradeKey, duration: 0 });
        hash = await buyTokens(
          tokenAddress,
          inputAmount,
          marketUtils.formatTokenDisplay(minTokenAmount),
        );
      } else {
        if (!address) {
          throw new Error('Connect your wallet first');
        }

        message.loading({ content: 'Refreshing latest quote...', key: tradeKey, duration: 0 });
        const latestSellQuote = await calculateSellPrice(inputAmount);

        if (!latestSellQuote) {
          throw new Error('Sell quote calculation failed');
        }

        if (needsApproval) {
          throw new Error('Token allowance is insufficient');
        }

        const amountToSell = parseUnits(inputAmount, 18);
        const actualBalance = await readContract(config, {
          address: tokenAddress as `0x${string}`,
          abi: MEME_TOKEN_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
          chainId: DEFAULT_CHAIN_ID,
        }) as bigint;

        if (actualBalance < amountToSell) {
          throw new Error('Latest onchain balance is insufficient');
        }

        const minEthAmount = marketUtils.calculateMinReceive(latestSellQuote.ethReceived, slippage);
        message.loading({ content: 'Submitting sell transaction...', key: tradeKey, duration: 0 });
        hash = await sellTokens(
          tokenAddress,
          formatUnits(amountToSell, 18),
          formatUnits(minEthAmount, 18),
        );
      }

      message.loading({ content: 'Transaction submitted. Waiting for confirmation...', key: tradeKey, duration: 0 });
      const receipt = await waitForTransactionReceipt(config, { hash });

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
        fetchMarketParams(),
      ]);

      await onTradeComplete?.();
    } catch (error) {
      const nextError = filterKnownNoise(error);
      message.destroy(tradeKey);

      if (nextError instanceof Error) {
        if (nextError.message.includes('User rejected')) {
          message.warning('Transaction cancelled');
          return;
        }

        if (nextError.message.includes('insufficient funds')) {
          message.error('Insufficient funds');
          return;
        }

        if (nextError.message.includes('slippage')) {
          message.error('Slippage exceeded. Adjust and retry.');
          return;
        }

        if (isCurveCapacityError(nextError)) {
          message.error('Curve capacity changed. Refresh quote and try again.');
          void fetchMarketParams();
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
    buyTokens,
    calculateSellPrice,
    calculateTokensForETH,
    fetchMarketParams,
    inputAmount,
    message,
    needsApproval,
    onTradeComplete,
    refetchEthBalance,
    refetchTokenBalance,
    sellTokens,
    slippage,
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
    if (!hasInputAmount || isGraduated === true) {
      return {
        amount: '0',
        symbol: tradeMode === 'buy' ? tokenSymbol : 'ETH',
        label: 'Receive',
      };
    }

    if (tradeMode === 'buy') {
      if (buyQuoteLimit) {
        return {
          amount: formatTokenDisplayValue(marketUtils.formatTokenDisplay(buyQuoteLimit.estimatedLaunchTokenOut), 7),
          symbol: tokenSymbol,
          label: 'Estimated launch output',
        };
      }

      return {
        amount: tokenAmount ? formatTokenDisplayValue(marketUtils.formatTokenDisplay(tokenAmount), 7) : '…',
        symbol: tokenSymbol,
        label: 'Receive',
      };
    }

    return {
      amount: sellPriceInfo ? formatEthValue(marketUtils.formatETH(sellPriceInfo.ethReceived)) : '0',
      symbol: 'ETH',
      label: 'Receive',
    };
  }, [buyQuoteLimit, hasInputAmount, isGraduated, sellPriceInfo, tokenAmount, tokenSymbol, tradeMode]);

  const buttonProps = useMemo(() => {
    if (isGraduated === true) {
      return {
        text: 'Token launched',
        onClick: () => undefined,
        loading: false,
        disabled: true,
      };
    }

    if (isUpdatingBalance) {
      return {
        text: 'Updating balance...',
        onClick: () => undefined,
        loading: true,
        disabled: true,
      };
    }

    if (tradeMode === 'buy') {
      if (buyQuoteLimit) {
        return {
          text: `Use launch quote ${formatEthValue(formatUnits(buyQuoteLimit.maxGrossEthIn, 18))} ETH`,
          onClick: handleTradeAction,
          loading: isBuying,
          disabled: true,
        };
      }

      return {
        text: `Buy ${tokenSymbol}`,
        onClick: handleTradeAction,
        loading: isBuying,
        disabled: !tokenAmount || tokenAmount === 0n,
      };
    }

    if (needsApproval) {
      return {
        text: `Approve ${tokenSymbol}`,
        onClick: handleApprove,
        loading: isApproving || isExecutingTrade,
        disabled: !address || !hasInputAmount || !tokenBalance || sellInputExceedsBalance,
      };
    }

    return {
      text: `Sell ${tokenSymbol}`,
      onClick: handleTradeAction,
      loading: isSelling || isAllowanceLoading,
      disabled: !address || !tokenBalance || !hasInputAmount || sellInputExceedsBalance || !sellPriceInfo || sellPriceInfo.ethReceived === 0n,
    };
  }, [
    address,
    handleApprove,
    handleTradeAction,
    hasInputAmount,
    isAllowanceLoading,
    isApproving,
    isBuying,
    buyQuoteLimit,
    isExecutingTrade,
    isGraduated,
    isSelling,
    isUpdatingBalance,
    needsApproval,
    sellInputExceedsBalance,
    sellPriceInfo,
    tokenAmount,
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
      <TradePanelForm
        tradeMode={tradeMode}
        tokenSymbol={tokenSymbol}
        inputAmount={inputAmount}
        outputAmount={outputInfo.amount}
        outputSymbol={outputInfo.symbol}
        outputLabel={outputInfo.label}
        isGraduated={isGraduated === true}
        buttonText={buttonProps.text}
        buttonLoading={buttonProps.loading}
        buttonDisabled={buttonProps.disabled}
        balanceText={balanceText}
        quoteWarning={buyQuoteWarning}
        quoteWarningActionText={buyQuoteWarningActionText}
        onModeChange={(mode) => {
          setTradeMode(mode);
          setInputAmount('');
          setConfirmModalVisible(false);
        }}
        onInputChange={setInputAmount}
        onSetMax={handleSetMax}
        onQuoteWarningAction={handleUseLaunchCurveBuy}
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
        refreshingQuote={tradeMode === 'buy' ? isTokenAmountLoading : isSellPriceLoading}
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
        buyPriceInfo={priceInfo}
        sellPriceInfo={sellPriceInfo}
        formatEth={(value) => formatEthValue(marketUtils.formatETH(value))}
        onCancel={() => setConfirmModalVisible(false)}
        onConfirm={executeTradeAction}
      />
    </Card>
  );
}
