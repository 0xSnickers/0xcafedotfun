'use client';

import { App, Button, Dropdown, type MenuProps } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useChainId, useSwitchChain } from 'wagmi';
import { DEFAULT_CHAIN_ID, NETWORK_CONFIG, type SupportedChainId } from '@/config/contracts';

const NETWORK_ITEMS: Array<{
  key: SupportedChainId;
  label: string;
  enabled: boolean;
}> = [
  {
    key: 31337,
    label: 'Anvil',
    enabled: true,
  },
  {
    key: 11155111,
    label: 'Sepolia',
    enabled: Boolean(NETWORK_CONFIG.sepolia.rpcUrl),
  },
  {
    key: 1,
    label: 'Mainnet',
    enabled: Boolean(NETWORK_CONFIG.mainnet.rpcUrl),
  },
];

function getNetworkLabel(chainId: number | undefined) {
  return NETWORK_ITEMS.find((item) => item.key === chainId)?.label ?? `Chain ${chainId ?? DEFAULT_CHAIN_ID}`;
}

export default function NetworkSwitchButton() {
  const { message } = App.useApp();
  const chainId = useChainId();
  const { switchChainAsync, isPending } = useSwitchChain();

  const currentChainId = (chainId || DEFAULT_CHAIN_ID) as SupportedChainId;

  const items: MenuProps['items'] = NETWORK_ITEMS.map((item) => ({
    key: String(item.key),
    disabled: !item.enabled || isPending,
    label: item.label,
    onClick: async () => {
      if (!item.enabled) {
        message.info(`${item.label} RPC is not configured`);
        return;
      }

      try {
        await switchChainAsync({ chainId: item.key });
        message.success(`Switched to ${item.label}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Network switch failed';
        message.error(reason);
      }
    },
  }));

  return (
    <Dropdown menu={{ items, selectable: true, selectedKeys: [String(currentChainId)] }} placement="bottomRight" trigger={['click']}>
      <Button className="header-network-button" loading={isPending}>
        {getNetworkLabel(currentChainId)}
        <DownOutlined className="text-[10px]" />
      </Button>
    </Dropdown>
  );
}
