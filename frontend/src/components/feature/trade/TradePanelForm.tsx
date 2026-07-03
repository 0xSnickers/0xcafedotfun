import { ArrowDownOutlined, ArrowUpOutlined, ReloadOutlined, WalletOutlined } from '@ant-design/icons';
import { Button, Col, Input, Row, Space, Typography } from 'antd';
import { hasPositiveDecimal } from '@/lib/numbers';

type TradeMode = 'buy' | 'sell';
const { Text } = Typography;

const BUY_PRESETS = ['0.1', '0.5', '1'];
const SELL_PRESETS = ['10%', '50%', '100%'];

interface TradePanelFormProps {
  tradeMode: TradeMode;
  tokenSymbol: string;
  inputAmount: string;
  outputAmount: string;
  outputSymbol: string;
  outputLabel?: string;
  isGraduated: boolean;
  buttonText: string;
  buttonLoading: boolean;
  buttonDisabled: boolean;
  balanceText: string;
  quoteWarning?: string | null;
  quoteWarningActionText?: string | null;
  onModeChange: (mode: TradeMode) => void;
  onInputChange: (value: string) => void;
  onSetMax: () => void;
  onQuoteWarningAction?: () => void;
  onQuickAmount: (value: string) => void;
  onRefreshBalance: () => void | Promise<void>;
  onRefreshQuote: () => void | Promise<void>;
  onTradeAction: () => void;
  refreshingBalance: boolean;
  refreshingQuote: boolean;
}

export function TradePanelForm({
  tradeMode,
  tokenSymbol,
  inputAmount,
  outputAmount,
  outputSymbol,
  outputLabel,
  isGraduated,
  buttonText,
  buttonLoading,
  buttonDisabled,
  balanceText,
  quoteWarning = null,
  quoteWarningActionText = null,
  onModeChange,
  onInputChange,
  onSetMax,
  onQuoteWarningAction,
  onQuickAmount,
  onRefreshBalance,
  onRefreshQuote,
  onTradeAction,
  refreshingBalance,
  refreshingQuote,
}: TradePanelFormProps) {
  const presets = tradeMode === 'buy' ? BUY_PRESETS : SELL_PRESETS;
  const resolvedOutputLabel = outputLabel ?? (tradeMode === 'buy' ? 'Receive' : 'Receive');

  return (
    <>
      <Row gutter={6} className="mb-5 rounded-lg bg-slate-950/50 p-1">
        <Col span={12}>
          <Button
            type={tradeMode === 'buy' ? 'primary' : 'default'}
            block
            onClick={() => onModeChange('buy')}
            icon={<ArrowUpOutlined />}
            className={tradeMode === 'buy'
              ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300 shadow-none'
              : 'border-transparent bg-transparent text-slate-400 shadow-none'}
          >
            Buy
          </Button>
        </Col>
        <Col span={12}>
          <Button
            type={tradeMode === 'sell' ? 'primary' : 'default'}
            danger={tradeMode === 'sell'}
            block
            onClick={() => onModeChange('sell')}
            icon={<ArrowDownOutlined />}
            className={tradeMode === 'sell'
              ? 'border-rose-500/40 bg-rose-500/20 text-rose-300 shadow-none'
              : 'border-transparent bg-transparent text-slate-400 shadow-none'}
          >
            Sell
          </Button>
        </Col>
      </Row>

      <div className="mb-5">
        <div className="flex justify-between items-center mb-2">
          <Text strong className="text-white">{tradeMode === 'buy' ? 'Pay' : 'Sell'}</Text>
          <Button type="link" size="small" onClick={onSetMax} className="text-blue-400" disabled={isGraduated}>
            MAX
          </Button>
        </div>

        <div className="relative rounded-xl border border-slate-700 bg-slate-950/40 p-3 transition-colors focus-within:border-blue-500/60">
          <Input
            size="large"
            placeholder={isGraduated ? 'Token launched' : '0.00'}
            value={inputAmount}
            onChange={(event) => onInputChange(event.target.value)}
            className="border-0 bg-transparent px-0 text-xl font-semibold text-white shadow-none placeholder:text-slate-500"
            disabled={isGraduated}
            suffix={
              <Space>
                <Text className="text-slate-300">{tradeMode === 'buy' ? 'ETH' : tokenSymbol}</Text>
                <WalletOutlined className="text-slate-400" />
              </Space>
            }
          />

          <div className="mt-3 grid grid-cols-3 gap-2">
            {presets.map((preset) => (
              <Button
                key={preset}
                size="small"
                onClick={() => onQuickAmount(preset)}
                disabled={isGraduated}
                className="border-slate-700 bg-slate-800/70 text-slate-300 transition-colors hover:border-blue-500/60 hover:bg-blue-500/10 hover:text-blue-300"
              >
                {tradeMode === 'buy' ? `${preset} ETH` : preset}
              </Button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2">
            <Text className="text-xs text-slate-500">Available</Text>
            <div className="flex items-center gap-1">
              <Text className="text-xs text-slate-400">{balanceText}</Text>
              <Button
                type="text"
                size="small"
                aria-label="Refresh balance"
                icon={<ReloadOutlined />}
                className="h-5 min-w-5 p-0 text-slate-500 hover:text-blue-400"
                onClick={onRefreshBalance}
                loading={refreshingBalance}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <Text strong className="text-white">{resolvedOutputLabel}</Text>
          {tradeMode === 'buy' && hasPositiveDecimal(inputAmount) && (
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              className="text-blue-400 hover:text-blue-300 p-0 h-auto"
              onClick={onRefreshQuote}
              loading={refreshingQuote}
              disabled={!hasPositiveDecimal(inputAmount) || isGraduated}
            />
          )}
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
          <div className="flex justify-between items-center">
            <Text className="text-lg font-medium text-white">
              {isGraduated ? '0' : outputAmount}
            </Text>
            <Text className="text-slate-300">{isGraduated ? 'Launched' : outputSymbol}</Text>
          </div>
        </div>

        {quoteWarning && !isGraduated && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
            <Text className="block text-xs text-amber-300">
              {quoteWarning}
            </Text>
            {quoteWarningActionText && onQuoteWarningAction && (
              <Button
                type="link"
                size="small"
                className="h-auto self-start p-0 text-amber-200 hover:text-amber-100"
                onClick={onQuoteWarningAction}
              >
                {quoteWarningActionText}
              </Button>
            )}
          </div>
        )}
      </div>

      <Button
        type="primary"
        danger={tradeMode === 'sell'}
        size="large"
        block
        onClick={onTradeAction}
        loading={buttonLoading}
        disabled={buttonDisabled}
        className={tradeMode === 'buy'
          ? 'border-0 bg-emerald-600 font-semibold hover:bg-emerald-500'
          : 'border-0 bg-rose-600 font-semibold hover:bg-rose-500'}
      >
        {buttonText}
      </Button>
    </>
  );
}
