'use client';

import { formatUnits } from 'viem';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { Dropdown, Space, type MenuProps } from 'antd';
import { DisconnectOutlined, WalletOutlined } from '@ant-design/icons';
import { ConnectWalletButton, useConnectWallet } from 'snk-wallet-kit';
import { useAccount, useBalance, useBlockNumber } from 'wagmi';
import { formatAddress } from '@/hooks/useContracts';
import { formatWalletEthBalance } from '@/lib/formatters/market';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';

export interface WalletInfoRef {
  refreshBalance: () => void;
}

const WalletInfo = forwardRef<WalletInfoRef>((props, ref) => {
  void props;

  const { address, isConnected } = useAccount();
  const { data: balance, refetch: refetchBalance } = useBalance({
    address,
    chainId: DEFAULT_CHAIN_ID,
  });
  const { data: blockNumber } = useBlockNumber({
    chainId: DEFAULT_CHAIN_ID,
    watch: true,
  });
  const { disconnect } = useConnectWallet();
  const { handleManualConnect, handleManualDisconnect } = useWalletConnection();

  useImperativeHandle(ref, () => ({
    refreshBalance: () => {
      if (refetchBalance) {
        void refetchBalance();
      }
    },
  }), [refetchBalance]);

  useEffect(() => {
    if (!address || blockNumber === undefined) return;
    void refetchBalance();
  }, [address, blockNumber, refetchBalance]);

  const walletMenuItems: MenuProps['items'] = isConnected
    ? [
        {
          key: 'disconnect',
          icon: <DisconnectOutlined />,
          label: 'Disconnect wallet',
          onClick: async () => {
            handleManualDisconnect();
            await disconnect();
          },
        },
      ]
    : [];

  const balanceLabel = balance
    ? `${formatWalletEthBalance(formatUnits(balance.value, balance.decimals))} ${balance.symbol}`
    : '0 ETH';

  return (
    <ConnectWalletButton
      label="Connect wallet"
      recommendedWalletIds={['metaMask', 'okxWallet', 'walletConnect']}
      showAccount={false}
      renderButton={({ connected, label, open }) => {
        if (!connected) {
          return (
            <button
              type="button"
              className="header-action-button header-wallet-button"
              onClick={() => {
                handleManualConnect();
                open();
              }}
            >
              <WalletOutlined />
              <span>{label}</span>
            </button>
          );
        }

        return (
          <Dropdown menu={{ items: walletMenuItems }} placement="bottomRight" trigger={['click']}>
            <button type="button" className="header-action-button header-wallet-button header-wallet-button-connected">
              <Space size={8}>
                <span className="header-wallet-dot" />
                <span>{address ? formatAddress(address) : 'Connected'}</span>
                <span className="header-wallet-balance">{balanceLabel}</span>
              </Space>
            </button>
          </Dropdown>
        );
      }}
    />
  );
});

WalletInfo.displayName = 'WalletInfo';

export default WalletInfo;
 
