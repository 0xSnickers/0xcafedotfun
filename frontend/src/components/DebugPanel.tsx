'use client';

import { useState } from 'react';
import { BugOutlined, CloseOutlined } from '@ant-design/icons';
import { useAccount, useChainId } from 'wagmi';
import NetworkSwitchButton from './NetworkSwitchButton';
import {
  DEFAULT_CHAIN_ID,
  getContractAddresses,
  getNetworkConfig,
} from '@/config/contracts';

function formatChainValue(chainId: number | undefined) {
  if (!chainId) return 'Unknown';
  return `${chainId}`;
}

function formatAddressValue(value: string) {
  return value || 'Not configured';
}

function formatBoolean(value: boolean) {
  return value ? 'Yes' : 'No';
}

export default function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const currentChainId = chainId || DEFAULT_CHAIN_ID;
  const currentNetwork = getNetworkConfig(currentChainId);
  const currentContracts = getContractAddresses(currentChainId);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="debug-panel-trigger"
        title="Open chain debug panel"
        type="button"
      >
        <BugOutlined />
        <span>Debug</span>
      </button>
    );
  }

  return (
    <div className="debug-panel-shell">
      <div className="debug-panel-header">
        <div>
          <div className="debug-panel-title">Current Chain Debug</div>
          <div className="debug-panel-subtitle">Development only</div>
        </div>
        <div className="debug-panel-header-actions">
          <NetworkSwitchButton />
          <button
            onClick={() => setIsOpen(false)}
            className="debug-panel-close"
            title="Close debug panel"
            type="button"
          >
            <CloseOutlined />
          </button>
        </div>
      </div>

      <section className="debug-panel-section">
        <div className="debug-panel-section-title">Connection</div>
        <div className="debug-panel-kv">
          <span>Connected</span>
          <strong>{formatBoolean(isConnected)}</strong>
          <span>Wallet</span>
          <strong className="debug-panel-mono">{address || 'Not connected'}</strong>
          <span>Chain ID</span>
          <strong>{formatChainValue(chainId)}</strong>
          <span>Network</span>
          <strong>{currentNetwork.name}</strong>
          <span>RPC</span>
          <strong className="debug-panel-mono">{currentNetwork.rpcUrl}</strong>
        </div>
      </section>

      <section className="debug-panel-section">
        <div className="debug-panel-section-title">Current chain contracts</div>
        <div className="debug-panel-kv">
          <span>MEME_FACTORY</span>
          <strong className="debug-panel-mono">{formatAddressValue(currentContracts.MEME_FACTORY)}</strong>
          <span>FEE_VAULT</span>
          <strong className="debug-panel-mono">{formatAddressValue(currentContracts.FEE_VAULT)}</strong>
          <span>LIQUIDITY_MANAGER</span>
          <strong className="debug-panel-mono">{formatAddressValue(currentContracts.LIQUIDITY_MANAGER)}</strong>
        </div>
      </section>
    </div>
  );
}
