'use client';

import { useCallback, useState } from 'react';
import { Button, Card, Spin, Space, App, Typography } from 'antd';
import { LoadingOutlined, RocketOutlined, TrophyOutlined } from '@ant-design/icons';
import { useLiquidityManager } from '@/hooks/useLiquidityManager';

const { Text } = Typography;

interface PendingLiquidityPanelProps {
  tokenAddress: string;
  tokenSymbol: string;
  onFinalized?: () => void | Promise<void>;
}

function getStatusText(status: ReturnType<typeof useLiquidityManager>['finalizeStatus']) {
  switch (status) {
    case 'checking_stage':
      return 'Checking launch state...';
    case 'prepare_submitted':
      return 'Preparing graduation. Confirming transaction...';
    case 'prepare_confirmed':
      return 'Graduation prepared. Submitting DEX liquidity...';
    case 'liquidity_submitted':
      return 'DEX liquidity submitted. Waiting for confirmation...';
    case 'liquidity_confirmed':
    case 'already_live':
      return 'DEX pool is live.';
    default:
      return 'Waiting for migration to complete...';
  }
}

function getDisplayFinalizeError(description: string) {
  if (description.toLowerCase().includes('nonce too low')) {
    return 'Graduation is already being processed. Please wait a few seconds and try again.';
  }

  return description;
}

export function PendingLiquidityPanel({
  tokenAddress,
  tokenSymbol,
  onFinalized,
}: PendingLiquidityPanelProps) {
  const { message } = App.useApp();
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const {
    canFinalize,
    finalizeStatus,
    finalizeGraduatedPool,
    isFinalizingPool,
  } = useLiquidityManager();
  const isFinalizing = isFinalizingPool(tokenAddress);

  const runFinalize = useCallback(async () => {
    try {
      setFinalizeError(null);
      message.loading({
        content: 'Confirm DEX migration in your wallet...',
        key: 'finalizeTradePanel',
        duration: 0,
      });
      await finalizeGraduatedPool(tokenAddress);
      message.success({
        content: `${tokenSymbol} DEX pool is live`,
        key: 'finalizeTradePanel',
        duration: 3,
      });
      await onFinalized?.();
    } catch (error) {
      message.destroy('finalizeTradePanel');
      const description = error instanceof Error ? error.message : 'DEX migration is still pending';
      const displayError = getDisplayFinalizeError(description);
      setFinalizeError(displayError);
      if (description.includes('User rejected')) {
        message.warning('Migration transaction cancelled');
        return;
      }
      message.error(displayError);
    }
  }, [finalizeGraduatedPool, message, onFinalized, tokenAddress, tokenSymbol]);

  return (
    <Card
      title={
        <Space align="center">
          <TrophyOutlined className="text-amber-300" />
          <span className="text-white">Launching</span>
        </Space>
      }
      className="w-full max-w-md bg-slate-800/50 border-slate-700"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
          <Text className="block text-sm text-amber-100">
            {tokenSymbol} launched. Migrating liquidity to the DEX.
          </Text>
          <Text className="mt-2 block text-xs text-amber-200/70">
            {canFinalize
              ? 'If migration does not finish automatically, confirm the permissionless migration to resume DEX trading.'
              : 'Connect your wallet on the correct network to finalize the permissionless migration.'}
          </Text>
          {finalizeError && (
            <Text className="mt-2 block text-xs text-amber-200/60">
              {finalizeError}
            </Text>
          )}
        </div>

        <div className="flex items-center justify-center rounded-xl border border-slate-700 bg-slate-950/40 p-4">
          <Space>
            {isFinalizing && <Spin indicator={<LoadingOutlined spin className="text-emerald-300" />} />}
            <Text className="text-slate-300">{getStatusText(finalizeStatus)}</Text>
          </Space>
        </div>

        <Button
          block
          type="primary"
          icon={<RocketOutlined />}
          loading={isFinalizing}
          disabled={!canFinalize}
          onClick={() => void runFinalize()}
        >
          Retry migration
        </Button>
      </div>
    </Card>
  );
}
