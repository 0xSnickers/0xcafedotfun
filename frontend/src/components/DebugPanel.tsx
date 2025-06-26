'use client';

import React, { useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { getContractAddresses } from '../config/contracts';

export default function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);

  const envVars = {
    NEXT_PUBLIC_NETWORK_RPC: process.env.NEXT_PUBLIC_NETWORK_RPC,
    NEXT_PUBLIC_MEME_FACTORY_ADDRESS: process.env.NEXT_PUBLIC_MEME_FACTORY_ADDRESS,
    NEXT_PUBLIC_BONDING_CURVE_ADDRESS: process.env.NEXT_PUBLIC_BONDING_CURVE_ADDRESS,
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs z-50 transition-colors"
        title="打开调试面板"
      >
        🐛 Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs max-w-md z-50 border border-gray-600">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold">Debug Info</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white transition-colors ml-2"
          title="关闭调试面板"
        >
          ✕
        </button>
      </div>
      
      <div className="mb-2">
        <strong>Connection:</strong>
        <div>Connected: {isConnected ? '✅ Yes' : '❌ No'}</div>
        <div>Address: {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'None'}</div>
        <div>Chain ID: {chainId || 'Unknown'}</div>
      </div>

      <div className="mb-2">
        <strong>Environment Variables:</strong>
        {Object.entries(envVars).map(([key, value]) => (
          <div key={key} className="flex justify-between">
            <span className="text-gray-300">{key.replace('NEXT_PUBLIC_', '')}:</span>
            <span className={value ? 'text-green-400' : 'text-red-400'}>
              {value ? '✅' : '❌'}
            </span>
          </div>
        ))}
      </div>

      <div className="mb-2">
        <strong>Contract Addresses:</strong>
        <div className="flex justify-between">
          <span className="text-gray-300">Factory:</span>
          <span className={contractAddresses.MEME_FACTORY ? 'text-green-400' : 'text-red-400'}>
            {contractAddresses.MEME_FACTORY ? '✅' : '❌'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-300">Bonding:</span>
          <span className={contractAddresses.BONDING_CURVE ? 'text-green-400' : 'text-red-400'}>
            {contractAddresses.BONDING_CURVE ? '✅' : '❌'}
          </span>
        </div>
      </div>

      <div className="mb-2">
        <strong>Current URL:</strong>
        <div className="text-gray-300 break-all">
          {typeof window !== 'undefined' ? window.location.href : 'SSR'}
        </div>
      </div>
    </div>
  );
}
