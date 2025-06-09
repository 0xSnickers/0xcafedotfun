import { useEffect } from 'react';
import { useAccount, useDisconnect } from 'wagmi';

export function useWalletConnection() {
  const { isConnected, isReconnecting } = useAccount();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    // 如果是服务端渲染或者是重连状态，不执行任何操作
    if (typeof window === 'undefined' || isReconnecting) {
      return;
    }

    // 检查是否有自动连接的标记
    const shouldAutoConnect = localStorage.getItem('wagmi.autoConnect');
    
    // 如果用户之前没有主动连接过，则不自动连接
    if (!shouldAutoConnect && isConnected) {
      disconnect();
    }
  }, [isConnected, isReconnecting, disconnect]);

  const handleManualConnect = () => {
    // 用户主动连接时设置标记
    localStorage.setItem('wagmi.autoConnect', 'true');
  };

  const handleManualDisconnect = () => {
    // 用户主动断开连接时移除标记
    localStorage.removeItem('wagmi.autoConnect');
    disconnect();
  };

  return {
    handleManualConnect,
    handleManualDisconnect,
  };
} 