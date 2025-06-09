'use client';

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { 
  Typography, 
  Button, 
  Dropdown, 
  Avatar, 
  Spin,
  message
} from 'antd';
import { 
  WalletOutlined, 
  DisconnectOutlined, 
  CopyOutlined, 
  ExportOutlined,
  MoreOutlined,
  CheckOutlined
} from '@ant-design/icons';
import { useAccount, useBalance, useDisconnect } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';

const { Text } = Typography;

export interface WalletInfoRef {
  refreshBalance: () => void;
}

const WalletInfo = forwardRef<WalletInfoRef>((props, ref) => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  // 获取ETH余额
  const { data: balance, isLoading: balanceLoading, refetch: refetchBalance } = useBalance({
    address: address,
  });

  // 暴露刷新方法给父组件
  useImperativeHandle(ref, () => ({
    refreshBalance: () => {
      if (refetchBalance) {
        refetchBalance();
      }
    }
  }), [refetchBalance]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 格式化地址
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // 格式化余额显示
  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    if (num >= 1) {
      // 保留两位小数并添加千分位逗号分隔符
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else {
      return num.toFixed(6);
    }
  };

  // 复制地址
  const copyAddress = async () => {
    if (address) {
      try {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        message.success('地址已复制到剪贴板');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        message.error('复制失败');
      }
    }
  };

  // 在区块链浏览器中查看
  const viewOnExplorer = () => {
    if (address) {
      window.open(`https://etherscan.io/address/${address}`, '_blank');
    }
  };

  if (!mounted) {
    return <Spin size="small" />;
  }

  if (!isConnected) {
    return (
      <Button 
        type="primary" 
        icon={<WalletOutlined />}
        onClick={openConnectModal}
        className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 border-none shadow-lg hover:shadow-xl transition-all duration-300 rounded-full px-6"
        size="large"
      >
        连接钱包
      </Button>
    );
  }

  const dropdownItems = [
    // {
    //   key: 'copy',
    //   icon: copied ? <CheckOutlined className="text-green-500" /> : <CopyOutlined />,
    //   label: copied ? '已复制' : '复制地址',
    //   onClick: copyAddress,
    //   className: copied ? 'text-green-500' : '',
    // },
    // {
    //   key: 'explorer',
    //   icon: <ExportOutlined />,
    //   label: '查看详情',
    //   onClick: viewOnExplorer,
    // },
    // {
    //   type: 'divider' as const,
    // },
    {
      key: 'disconnect',
      icon: <DisconnectOutlined />,
      label: '断开连接',
      onClick: () => disconnect(),
      className: 'text-red-500 hover:text-red-600',
    },
  ];

  return (
    <div className="flex items-center space-x-3">
      {/* 余额显示 */}
      <div className="hidden sm:flex items-center space-x-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600/30 rounded-full px-4 py-2">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
        <Text className="text-white text-sm font-medium">
          {balanceLoading ? '...' : balance ? `${formatBalance(balance.formatted)} ETH` : '0 ETH'}
        </Text>
      </div>

      {/* 钱包信息 */}
      <Dropdown
        menu={{ items: dropdownItems }}
        placement="bottom"
        trigger={['click']}
        arrow={{ pointAtCenter: true }}
      >
        <Button 
          type="text" 
          className="flex items-center space-x-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600/30 hover:border-blue-400/50 hover:bg-slate-700/60 rounded-full px-3 py-2 transition-all duration-300 group"
        >
          <Avatar 
            size={24}
            className="bg-gradient-to-r from-blue-400 to-purple-500 flex-shrink-0"
            icon={<WalletOutlined className="text-xs" />}
          />
          <Text className="text-white text-sm font-medium hidden sm:block">
            {formatAddress(address!)}
          </Text>
        </Button>
      </Dropdown>
    </div>
  );
});

WalletInfo.displayName = 'WalletInfo';

export default WalletInfo; 