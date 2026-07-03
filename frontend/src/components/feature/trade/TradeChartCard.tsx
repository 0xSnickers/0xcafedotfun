import TradingViewChart from '@/components/charts/TradingViewChart';

interface TradeChartCardProps {
  tokenAddress: string;
  symbol?: string;
  refreshSignal: number;
}

export function TradeChartCard({ tokenAddress, symbol, refreshSignal }: TradeChartCardProps) {
  return <TradingViewChart tokenAddress={tokenAddress} symbol={symbol} refreshSignal={refreshSignal} />;
}
