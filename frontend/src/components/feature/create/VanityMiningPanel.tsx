'use client';

import { CheckCircleOutlined } from '@ant-design/icons';
import { Progress } from 'antd';
import { formatAddress } from '@/hooks/useContracts';
import type { VanityProgress, VanityResult } from '@/hooks/useVanityTokenGeneration';

const VANITY_EXPECTED_ATTEMPTS = 65_536;

interface VanityMiningPanelProps {
  isGeneratingVanity: boolean;
  vanityProgress: VanityProgress | null;
  vanityResult: VanityResult | null;
}

export function VanityMiningPanel({
  isGeneratingVanity,
  vanityProgress,
  vanityResult,
}: VanityMiningPanelProps) {
  const vanityPercent = vanityProgress
    ? Math.min(99, Math.floor((vanityProgress.attempts / VANITY_EXPECTED_ATTEMPTS) * 100))
    : 0;

  return (
    <div className="create-vanity-box">
      <div className="create-vanity-label">
        <span>Creator-bound address preview</span>
        <small>CREATE2</small>
      </div>

      {!isGeneratingVanity && !vanityResult && (
        <p className="create-vanity-copy">
          Token creation mines a creator-bound salt until the predicted address starts with 0xcafe.
        </p>
      )}

      {isGeneratingVanity && (
        <div className="create-vanity-progress" role="status" aria-live="polite">
          <span>Vanity Mining 0xcafe address...</span>
          <strong>
            {(vanityProgress?.attempts || 0).toLocaleString()} attempts
            {vanityProgress?.rate
              ? ` · ${Math.round(vanityProgress.rate).toLocaleString()}/s`
              : ''}
          </strong>
          <Progress
            percent={vanityPercent}
            showInfo={false}
            size="small"
            status="active"
            className="create-vanity-progress-bar"
          />
          {vanityProgress?.currentAddress && (
            <small>{formatAddress(vanityProgress.currentAddress)}</small>
          )}
          <i />
        </div>
      )}

      {vanityResult && (
        <div className="create-vanity-result">
          <CheckCircleOutlined />
          <span>{formatAddress(vanityResult.address)}</span>
          <small>0xcafe mined · {vanityResult.attempts.toLocaleString()} tries</small>
        </div>
      )}
    </div>
  );
}
