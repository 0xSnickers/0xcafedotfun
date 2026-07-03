import { formatEthAmount } from '@/lib/formatters/market';

interface MarketVolumeProps {
  value: number | null;
  complete: boolean | null;
}

export default function MarketVolume({ value, complete }: MarketVolumeProps) {
  return (
    <span
      className="font-mono text-slate-300"
      title={complete === false ? 'Partial gross volume: legacy trades are missing gross quote volume' : undefined}
    >
      {formatEthAmount(value)}
      {complete === false && (
        <small className="ml-1 text-amber-500">partial</small>
      )}
    </span>
  );
}
