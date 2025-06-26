'use client';

import { forwardRef, useImperativeHandle } from 'react';
import { useBalance } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export interface WalletInfoRef {
  refreshBalance: () => void;
}

const WalletInfo = forwardRef<WalletInfoRef>((props, ref) => {
  const { refetch: refetchBalance } = useBalance();

  // 暴露刷新方法给父组件
  useImperativeHandle(ref, () => ({
    refreshBalance: () => {
      if (refetchBalance) {
        refetchBalance();
      }
    }
  }), [refetchBalance]);

  return (
    <ConnectButton 
      showBalance={true}
      chainStatus="none"
    />
  );
});

WalletInfo.displayName = 'WalletInfo';

export default WalletInfo; 