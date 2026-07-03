import { ArrowDownOutlined, CheckCircleOutlined, SwapOutlined, TrophyOutlined } from '@ant-design/icons';
import { Button, Divider, Modal, Typography } from 'antd';
import { formatEthValue, formatTokenDisplayValue } from '@/lib/formatters/market';

type TradeMode = 'buy' | 'sell';
const { Text } = Typography;

interface TradeConfirmModalProps {
  confirmModalVisible: boolean;
  isExecutingTrade: boolean;
  isUpdatingBalance: boolean;
  tradeMode: TradeMode;
  tokenSymbol: string;
  inputAmount: string;
  outputInfo: {
    amount: string;
    symbol: string;
  };
  buyPriceInfo: {
    ethCost: bigint;
    platformFee: bigint;
    creatorFee: bigint;
  } | null;
  sellPriceInfo: {
    ethBeforeFees: bigint;
    platformFee: bigint;
    creatorFee: bigint;
    ethReceived: bigint;
  } | null;
  formatEth: (value: bigint) => string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function TradeConfirmModal({
  confirmModalVisible,
  isExecutingTrade,
  isUpdatingBalance,
  tradeMode,
  tokenSymbol,
  inputAmount,
  outputInfo,
  buyPriceInfo,
  sellPriceInfo,
  formatEth,
  onCancel,
  onConfirm,
}: TradeConfirmModalProps) {
  return (
    <Modal
      title={
        <div className="flex items-center space-x-2">
          <SwapOutlined className="text-blue-400" />
          <span>Confirm trade</span>
        </div>
      }
      open={confirmModalVisible}
      onCancel={() => !isExecutingTrade && onCancel()}
      width={500}
      centered
      className="dark-modal"
      maskClosable={!isExecutingTrade}
      closable={!isExecutingTrade}
      footer={[
        <Button
          key="cancel"
          onClick={onCancel}
          disabled={isExecutingTrade || isUpdatingBalance}
          className="mr-2"
        >
          Cancel
        </Button>,
        <Button
          key="confirm"
          type="primary"
          loading={isExecutingTrade || isUpdatingBalance}
          onClick={onConfirm}
          icon={isExecutingTrade || isUpdatingBalance ? undefined : <CheckCircleOutlined />}
          className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 border-0"
        >
          {isExecutingTrade ? 'Executing trade...' : isUpdatingBalance ? 'Updating balance...' : 'Confirm trade'}
        </Button>,
      ]}
    >
      <div className="space-y-4">
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
          <div className="flex items-center justify-between mb-3">
            <Text className="text-lg font-semibold text-white">
              {tradeMode === 'buy' ? 'Buy' : 'Sell'} {tokenSymbol}
            </Text>
            <div className={`px-2 py-1 rounded text-xs font-medium ${tradeMode === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {tradeMode === 'buy' ? 'BUY' : 'SELL'}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Text className="text-slate-300">{tradeMode === 'buy' ? 'You pay' : 'You sell'}:</Text>
              <Text className="text-white font-medium text-lg">
                {tradeMode === 'buy' ? formatEthValue(inputAmount) : formatTokenDisplayValue(inputAmount, 7)} {tradeMode === 'buy' ? 'ETH' : tokenSymbol}
              </Text>
            </div>

            <div className="flex items-center justify-center my-2">
              <ArrowDownOutlined className="text-slate-400 text-lg" />
            </div>

            <div className="flex justify-between items-center">
              <Text className="text-slate-300">You receive:</Text>
              <Text className="text-green-400 font-medium text-lg">
                {tradeMode === 'sell' ? formatEthValue(outputInfo.amount) : outputInfo.amount} {outputInfo.symbol}
              </Text>
            </div>
          </div>
        </div>

        <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
          <Text className="text-white font-medium mb-3 block">Trade details</Text>

          {tradeMode === 'buy' && buyPriceInfo && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <Text className="text-slate-400">Base price:</Text>
                <Text className="text-slate-200">{formatEth(buyPriceInfo.ethCost)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">Platform fee (1%):</Text>
                <Text className="text-slate-200">{formatEth(buyPriceInfo.platformFee)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">Creator fee (0.25%):</Text>
                <Text className="text-slate-200">{formatEth(buyPriceInfo.creatorFee)} ETH</Text>
              </div>
              <Divider className="my-2 border-slate-600" />
              <div className="flex justify-between">
                <Text className="text-yellow-400">
                  <TrophyOutlined className="mr-1" />
                  Market cap contribution:
                </Text>
                <Text className="text-yellow-400">+{formatEth(buyPriceInfo.ethCost)} ETH</Text>
              </div>
            </div>
          )}

          {tradeMode === 'sell' && sellPriceInfo && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <Text className="text-slate-400">Base price:</Text>
                <Text className="text-slate-200">{formatEth(sellPriceInfo.ethBeforeFees)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">Platform fee (1%):</Text>
                <Text className="text-slate-200">-{formatEth(sellPriceInfo.platformFee)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">Creator fee (0.25%):</Text>
                <Text className="text-slate-200">-{formatEth(sellPriceInfo.creatorFee)} ETH</Text>
              </div>
              <Divider className="my-2 border-slate-600" />
              <div className="flex justify-between font-medium">
                <Text className="text-white">Net received:</Text>
                <Text className="text-green-400">{formatEth(sellPriceInfo.ethReceived)} ETH</Text>
              </div>
            </div>
          )}

          {!buyPriceInfo && !sellPriceInfo && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <Text className="text-slate-400">{tradeMode === 'buy' ? 'Pay amount:' : 'Sell amount:'}</Text>
                <Text className="text-slate-200">
                  {tradeMode === 'buy' ? formatEthValue(inputAmount) : formatTokenDisplayValue(inputAmount, 7)} {tradeMode === 'buy' ? 'ETH' : tokenSymbol}
                </Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">Estimated receive:</Text>
                <Text className="text-green-400">
                  {tradeMode === 'sell' ? formatEthValue(outputInfo.amount) : outputInfo.amount} {outputInfo.symbol}
                </Text>
              </div>
              <Divider className="my-2 border-slate-600" />
              <div className="flex justify-between">
                <Text className="text-slate-400">Route:</Text>
                <Text className="text-slate-200">Liquidity pool</Text>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
