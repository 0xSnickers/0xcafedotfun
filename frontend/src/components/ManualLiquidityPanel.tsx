'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Typography,
  Space,
  Alert,
  Modal,
  Spin,
  App
} from 'antd';
import {
  InfoCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  TrophyOutlined,
  PlusCircleOutlined
} from '@ant-design/icons';
import { useManualLiquidity } from '../hooks/useManualLiquidity';

const { Text } = Typography;

interface ManualLiquidityPanelProps {
  tokenAddress: string;
  tokenSymbol: string;
  isGraduated: boolean;
  onLiquidityAdded?: () => void;
}

export default function ManualLiquidityPanel({
  tokenAddress,
  tokenSymbol,
  isGraduated,
  onLiquidityAdded
}: ManualLiquidityPanelProps) {
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  
  const {
    isLoading,
    error,
    liquidityData,
    hasLiquidityData,
    fetchLiquidityData,
    addLiquidityToUniswap,
    canAddLiquidity,
    formattedLiquidityData
  } = useManualLiquidity(tokenAddress);

  const { message } = App.useApp();

  // 当代币毕业状态变化时，获取流动性数据
  useEffect(() => {
    if (isGraduated && tokenAddress) {
      console.log('🔍 [DEBUG] Token graduated, fetching liquidity data');
      fetchLiquidityData();
    }
  }, [isGraduated, tokenAddress, fetchLiquidityData]);

  // 处理添加流动性
  const handleAddLiquidity = async () => {
    try {
      message.loading({ 
        content: '正在添加流动性到 Uniswap...', 
        key: 'addLiquidity', 
        duration: 0 
      });

      const result = await addLiquidityToUniswap();
      
      if (result) {
        message.success({
          content: (
            <div>
              <div className="font-medium text-green-600">🎉 流动性添加成功！</div>
              <div className="text-sm mt-1">
                已添加 {formattedLiquidityData?.tokenAmount} {tokenSymbol} + {formattedLiquidityData?.ethAmount} ETH
              </div>
            </div>
          ),
          duration: 8,
          key: 'addLiquidity'
        });

        setConfirmModalVisible(false);
        
        if (onLiquidityAdded) {
          onLiquidityAdded();
        }
      }
    } catch (err) {
      console.error('❌ [DEBUG] Manual liquidity addition failed:', err);
      message.error({
        content: '添加流动性失败: ' + (err instanceof Error ? err.message : '未知错误'),
        key: 'addLiquidity',
        duration: 5
      });
    }
  };

  // 显示确认弹窗
  const showConfirmModal = () => {
    setConfirmModalVisible(true);
  };

  // 如果代币没有毕业，不显示面板
  if (!isGraduated) {
    return null;
  }

  // 如果正在加载流动性数据
  if (hasLiquidityData === null) {
    return (
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <div className="flex items-center justify-center p-4">
          <Spin size="small" className="mr-2" />
          <Text className="text-slate-300">检查流动性数据...</Text>
        </div>
      </Card>
    );
  }

  // 如果没有流动性数据
  if (!hasLiquidityData || !liquidityData) {
    return (
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <Alert
          type="info"
          icon={<InfoCircleOutlined />}
          message="流动性已添加"
          description="该代币的流动性已经添加到 Uniswap，可以在 DEX 中交易。"
          className="bg-blue-900/20 border-blue-600/30"
        />
      </Card>
    );
  }

  return (
    <>
      <Card
        className="w-full max-w-md bg-slate-800/50 border-slate-700"
      >

        {/* 添加流动性按钮 */}
        <Button
          type="primary"
          size="large"
          block
          onClick={showConfirmModal}
          loading={isLoading}
          disabled={!canAddLiquidity}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 border-0 font-medium"
          icon={<PlusCircleOutlined />}
        >
          添加流动性到 Uniswap
        </Button>

      </Card>

      {/* 确认弹窗 */}
      <Modal
        title={
          <div className="flex items-center space-x-2">
            <PlusCircleOutlined className="text-blue-400" />
            <span>确认添加流动性</span>
          </div>
        }
        open={confirmModalVisible}
        onCancel={() => !isLoading && setConfirmModalVisible(false)}
        width={500}
        centered
        className="dark-modal"
        maskClosable={!isLoading}
        closable={!isLoading}
        footer={[
          <Button
            key="cancel"
            onClick={() => setConfirmModalVisible(false)}
            disabled={isLoading}
            className="mr-2"
          >
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={isLoading}
            onClick={handleAddLiquidity}
            icon={isLoading ? undefined : <CheckCircleOutlined />}
            className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 border-0"
          >
            {isLoading ? '添加中...' : '确认添加'}
          </Button>
        ]}
      >
        <div className="space-y-4">
          {/* 操作概览 */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
            <div className="flex items-center justify-between mb-3">
              <Text className="text-lg font-semibold text-white">
                添加流动性到 Uniswap V2
              </Text>
              <div className="px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                流动性添加
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Text className="text-slate-300">{tokenSymbol} 数量:</Text>
                <Text className="text-blue-400 font-medium text-lg">
                  {formattedLiquidityData?.tokenAmount}
                </Text>
              </div>

              <div className="flex justify-between items-center">
                <Text className="text-slate-300">ETH 数量:</Text>
                <Text className="text-green-400 font-medium text-lg">
                  {formattedLiquidityData?.ethAmount} ETH
                </Text>
              </div>
            </div>
          </div>

          {/* 重要说明 */}
          <div className="bg-yellow-900/20 rounded-lg p-3 border border-yellow-600/30">
            <div className="flex items-center space-x-2 mb-2">
              <ExclamationCircleOutlined className="text-yellow-400" />
              <Text className="text-yellow-200 font-medium">重要说明</Text>
            </div>
            <div className="text-yellow-100 text-sm space-y-1">
              <div>• 此操作将向 Uniswap V2 添加流动性</div>
              <div>• 流动性代币将被永久锁定</div>
              <div>• 操作完成后用户可在 DEX 中交易此代币</div>
              <div>• 此操作不可逆转，请确认后继续</div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
} 