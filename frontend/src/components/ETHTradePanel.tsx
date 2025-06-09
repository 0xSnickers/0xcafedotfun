'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Button, 
  Input, 
  Typography, 
  Space, 
  Alert, 
  Slider,
  Spin,
  Tooltip,
  App,
  Modal,
  Divider
} from 'antd';
import { 
  SwapOutlined, 
  InfoCircleOutlined, 
  WalletOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  ReloadOutlined,
  TrophyOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  DollarOutlined
} from '@ant-design/icons';
import { useBondingCurve, bondingCurveUtils } from '../hooks/useBondingCurve';
import { useAccount, useBalance } from 'wagmi';
import { CONTRACT_CONSTANTS } from '../config/contracts';

const { Text } = Typography;

interface ETHTradePanelProps {
  tokenAddress: string;
  tokenSymbol: string;
  tokenBalance?: string;
  onTradeComplete?: () => void;
}

type TradeMode = 'buy' | 'sell';

// 错误处理工具函数
const handleAsyncError = (error: any, context: string) => {
  // 过滤掉chrome扩展相关的错误，避免干扰用户体验
  if (error?.message?.includes('chrome.runtime.sendMessage') || 
      error?.message?.includes('Extension ID') ||
      error?.stack?.includes('inpage.js')) {
    console.warn(`[${context}] Chrome extension error (ignored):`, error.message);
    return null;
  }
  
  console.error(`[${context}] Error:`, error);
  return error;
};

export default function ETHTradePanel({
  tokenAddress,
  tokenSymbol,
  tokenBalance = '0',
  onTradeComplete
}: ETHTradePanelProps) {
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy');
  const [inputAmount, setInputAmount] = useState('');
  const [slippage, setSlippage] = useState(2); // 2% 默认滑点
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [isExecutingTrade, setIsExecutingTrade] = useState(false);

  // Hooks
  const bondingCurve = useBondingCurve(tokenAddress);

  const { message } = App.useApp();
  const { address } = useAccount();

  // 获取ETH余额 - 修复TypeScript错误
  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address: address,
  });

  // 格式化ETH余额显示（与WalletInfo.tsx保持一致）
  const formatETHBalance = (balance: string) => {
    try {
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
    } catch (error) {
      handleAsyncError(error, 'Format ETH Balance');
      return '0.000000';
    }
  };

  // 防抖Hook
  function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);

      return () => {
        clearTimeout(handler);
      };
    }, [value, delay]);

    return debouncedValue;
  }

  // 防抖输入金额
  const debouncedInputAmount = useDebounce(inputAmount, 800); // 800ms防抖

  // 计算输出数量 - 添加错误处理和优化
  const calculateOutput = useCallback(async () => {
    if (!debouncedInputAmount || parseFloat(debouncedInputAmount) <= 0) return;

    try {
      if (tradeMode === 'buy') {
        await bondingCurve.calculateTokensForETH(debouncedInputAmount);
        // 同时计算价格信息用于交易详情
        if (bondingCurve.tokenAmount) {
          const tokenAmountFormatted = bondingCurveUtils.formatTokenDisplay(bondingCurve.tokenAmount);
          await bondingCurve.calculateBuyPrice(tokenAmountFormatted);
        }
      } else {
        await bondingCurve.calculateSellPrice(debouncedInputAmount);
      }
    } catch (error) {
      const filteredError = handleAsyncError(error, 'Calculate Output');
      if (filteredError) {
        console.warn('价格计算失败:', filteredError.message);
      }
    }
  }, [debouncedInputAmount, tradeMode, bondingCurve]);

  // 使用防抖的输入金额进行计算
  useEffect(() => {
    if (debouncedInputAmount && parseFloat(debouncedInputAmount) > 0) {
      try {
        calculateOutput();
      } catch (error) {
        handleAsyncError(error, 'Calculate Output Timer');
      }
    }
  }, [debouncedInputAmount, tradeMode, calculateOutput]);

  // 错误边界处理
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      const filteredError = handleAsyncError(event.error, 'Global Error');
      if (!filteredError) {
        event.preventDefault(); // 阻止chrome扩展错误显示
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const filteredError = handleAsyncError(event.reason, 'Unhandled Rejection');
      if (!filteredError) {
        event.preventDefault(); // 阻止chrome扩展错误显示
      }
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // 显示交易确认弹窗
  const showTradeConfirmModal = () => {
    try {
      if (!inputAmount || parseFloat(inputAmount) <= 0) {
        message.warning('请输入有效的数量');
        return;
      }

      // 检查是否有必要的计算结果
      if (tradeMode === 'buy' && !bondingCurve.tokenAmount) {
        message.warning('请等待价格计算完成');
        return;
      }

      if (tradeMode === 'sell' && !bondingCurve.sellPriceInfo) {
        message.warning('请等待价格计算完成');
        return;
      }

      setConfirmModalVisible(true);
    } catch (error) {
      const filteredError = handleAsyncError(error, 'Show Confirm Modal');
      if (filteredError) {
        message.error('打开确认弹窗失败');
      }
    }
  };

  // 执行实际交易 - 增强错误处理
  const executeTradeAction = async () => {
    setIsExecutingTrade(true);

    try {
      if (tradeMode === 'buy') {
        // 买入逻辑
        if (!bondingCurve.tokenAmount) {
          throw new Error('代币数量计算失败');
        }

        const minTokenAmount = bondingCurveUtils.calculateMinReceive(
          bondingCurve.tokenAmount,
          slippage
        );

        // 显示进度提示
        message.loading({
          content: '正在提交购买交易...',
          key: 'buyProgress',
          duration: 0
        });

        const hash = await bondingCurve.buyTokens(
          tokenAddress,
          inputAmount,
          bondingCurveUtils.formatTokenDisplay(minTokenAmount)
        );

        // 更新进度提示
        message.loading({
          content: '购买交易已提交，等待确认...',
          key: 'buyProgress',
          duration: 2
        });

        console.log('购买交易hash:', hash);
        
        // 显示详细的成交信息
        const tokenReceived = bondingCurveUtils.formatTokenDisplay(bondingCurve.tokenAmount);
        message.success({
          content: (
            <div>
              <div className="font-medium text-green-600">🎉 购买成功！</div>
              <div className="text-sm mt-1">
                支付: {inputAmount} ETH → 获得: {tokenReceived} {tokenSymbol}
              </div>
              <div className="text-xs mt-1 text-slate-400">
                交易哈希: {hash.slice(0, 10)}...{hash.slice(-8)}
              </div>
            </div>
          ),
          duration: 5,
          key: 'buyProgress'
        });
        
      } else {
        // 卖出逻辑
        if (!bondingCurve.sellPriceInfo) {
          throw new Error('出售价格计算失败');
        }

        if (!address) {
          throw new Error('请先连接钱包');
        }

        const minETHAmount = bondingCurveUtils.calculateMinReceive(
          bondingCurve.sellPriceInfo.ethReceived,
          slippage
        );

        // 显示进度提示
        message.loading({
          content: '正在检查Token授权...',
          key: 'sellProgress',
          duration: 0
        });

        const hash = await bondingCurve.sellTokens(
          tokenAddress,
          inputAmount,
          bondingCurveUtils.formatETH(minETHAmount),
          address // 传递用户地址
        );

        // 更新进度提示
        message.loading({
          content: '出售交易已提交，等待确认...',
          key: 'sellProgress',
          duration: 2
        });

        console.log('出售交易hash:', hash);
        
        // 显示详细的成交信息
        const ethReceived = bondingCurveUtils.formatETH(bondingCurve.sellPriceInfo.ethReceived);
        message.success({
          content: (
            <div>
              <div className="font-medium text-green-600">🎉 卖出成功！</div>
              <div className="text-sm mt-1">
                出售: {inputAmount} {tokenSymbol} → 获得: {ethReceived} ETH
              </div>
              <div className="text-xs mt-1 text-slate-400">
                交易哈希: {hash.slice(0, 10)}...{hash.slice(-8)}
              </div>
            </div>
          ),
          duration: 5,
          key: 'sellProgress'
        });
      }

      // 清空输入
      setInputAmount('');
      
      // 关闭确认弹窗
      setConfirmModalVisible(false);
      
      // 交易成功后刷新ETH余额
      setTimeout(() => {
        try {
          if (refetchEthBalance) {
            refetchEthBalance();
          }
        } catch (error) {
          handleAsyncError(error, 'Refetch ETH Balance');
        }
      }, 2000);
      
      // 调用回调
      if (onTradeComplete) {
        try {
          onTradeComplete();
        } catch (error) {
          handleAsyncError(error, 'Trade Complete Callback');
        }
      }
      
    } catch (error) {
      const filteredError = handleAsyncError(error, 'Execute Trade');
      
      if (filteredError) {
        console.error('Trade failed:', filteredError);
        
        // 详细的错误信息
        if (filteredError instanceof Error) {
          console.log('交易错误详情:', {
            name: filteredError.name,
            message: filteredError.message,
            stack: filteredError.stack
          });
          
          // 检查常见错误
          if (filteredError.message.includes('insufficient funds')) {
            message.error('余额不足，请检查您的账户余额');
            return;
          }
          
          if (filteredError.message.includes('slippage')) {
            message.error('滑点过大，请调整滑点设置或稍后重试');
            return;
          }
          
          if (filteredError.message.includes('User rejected') || 
              filteredError.message.includes('user rejected')) {
            message.warning('交易已取消');
            return;
          }
          
          if (filteredError.message.includes('network')) {
            message.error('网络连接错误，请检查网络设置');
            return;
          }
        }
        
        message.error('交易失败: ' + (filteredError instanceof Error ? filteredError.message : '未知错误'));
      }
    } finally {
      setIsExecutingTrade(false);
    }
  };

  // 渲染交易确认Modal内容
  const renderConfirmModalContent = () => {
    const outputInfo = getOutputInfo();
    
    return (
      <div className="space-y-4">
        {/* 交易概览 */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
          <div className="flex items-center justify-between mb-3">
            <Text className="text-lg font-semibold text-white">
              {tradeMode === 'buy' ? '购买' : '出售'} {tokenSymbol}
            </Text>
            <div className={`px-2 py-1 rounded text-xs font-medium ${
              tradeMode === 'buy' 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              {tradeMode === 'buy' ? '买入' : '卖出'}
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Text className="text-slate-300">
                {tradeMode === 'buy' ? '支付数量' : '出售数量'}:
              </Text>
              <Text className="text-white font-medium text-lg">
                {inputAmount} {tradeMode === 'buy' ? 'ETH' : tokenSymbol}
              </Text>
            </div>
            
            <div className="flex items-center justify-center my-2">
              <ArrowDownOutlined className="text-slate-400 text-lg" />
            </div>
            
            <div className="flex justify-between items-center">
              <Text className="text-slate-300">
                {tradeMode === 'buy' ? '预计获得' : '预计收到'}:
              </Text>
              <Text className="text-green-400 font-medium text-lg">
                {outputInfo.amount} {outputInfo.symbol}
              </Text>
            </div>
          </div>
        </div>

        {/* 交易详情 */}
        <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
          <Text className="text-white font-medium mb-3 block">📊 交易详情</Text>
          
          {tradeMode === 'buy' && bondingCurve.priceInfo && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <Text className="text-slate-400">基础价格:</Text>
                <Text className="text-slate-200">{bondingCurveUtils.formatETH(bondingCurve.priceInfo.ethCost)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">平台费用 (2%):</Text>
                <Text className="text-slate-200">{bondingCurveUtils.formatETH(bondingCurve.priceInfo.platformFee)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">创作者费用 (3%):</Text>
                <Text className="text-slate-200">{bondingCurveUtils.formatETH(bondingCurve.priceInfo.creatorFee)} ETH</Text>
              </div>
              <Divider className="my-2 border-slate-600" />
              <div className="flex justify-between font-medium">
                <Text className="text-white">总计费用:</Text>
                <Text className="text-white">{bondingCurveUtils.formatETH(bondingCurve.priceInfo.afterFeesCost)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-yellow-400">
                  <TrophyOutlined className="mr-1" />
                  市值贡献:
                </Text>
                <Text className="text-yellow-400">+{bondingCurveUtils.formatETH(bondingCurve.priceInfo.ethCost)} ETH</Text>
              </div>
            </div>
          )}

          {tradeMode === 'sell' && bondingCurve.sellPriceInfo && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <Text className="text-slate-400">基础价格:</Text>
                <Text className="text-slate-200">{bondingCurveUtils.formatETH(bondingCurve.sellPriceInfo.ethBeforeFees)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">平台费用 (2%):</Text>
                <Text className="text-slate-200">-{bondingCurveUtils.formatETH(bondingCurve.sellPriceInfo.platformFee)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">创作者费用 (3%):</Text>
                <Text className="text-slate-200">-{bondingCurveUtils.formatETH(bondingCurve.sellPriceInfo.creatorFee)} ETH</Text>
              </div>
              <Divider className="my-2 border-slate-600" />
              <div className="flex justify-between font-medium">
                <Text className="text-white">实际收到:</Text>
                <Text className="text-green-400">{bondingCurveUtils.formatETH(bondingCurve.sellPriceInfo.ethReceived)} ETH</Text>
              </div>
            </div>
          )}
        </div>

        {/* 滑点说明 */}
        <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-600/30">
          <div className="flex items-center space-x-2 mb-2">
            <InfoCircleOutlined className="text-blue-400" />
            <Text className="text-blue-200 font-medium">滑点保护</Text>
          </div>
          <Text className="text-blue-100 text-sm">
            当前滑点容忍度为 <span className="font-medium">{slippage}%</span>，如果价格变动超过此范围，交易将会失败以保护您的资金安全。
          </Text>
        </div>

       
      </div>
    );
  };

  // 设置最大值
  const handleSetMax = () => {
    if (tradeMode === 'buy') {
      if (ethBalance) {
        // 保留一些ETH用于Gas费用
        const maxAmount = parseFloat(ethBalance.formatted) - 0.01;
        setInputAmount(Math.max(0, maxAmount).toString());
      }
    } else {
      setInputAmount(tokenBalance);
    }
  };

  // 计算输出信息
  const getOutputInfo = () => {
    if (tradeMode === 'buy') {
      return {
        amount: bondingCurve.tokenAmount ? bondingCurveUtils.formatTokenDisplay(bondingCurve.tokenAmount) : '0.0000',
        symbol: tokenSymbol,
        isLoading: bondingCurve.isTokenAmountLoading
      };
    } else {
      return {
        amount: bondingCurve.sellPriceInfo ? bondingCurveUtils.formatETH(bondingCurve.sellPriceInfo.ethReceived) : '0',
        symbol: 'ETH',
        isLoading: bondingCurve.isSellPriceLoading
      };
    }
  };

  const outputInfo = getOutputInfo();

  // 获取交易按钮文本和状态
  const getTradeButtonProps = () => {
    if (tradeMode === 'buy') {
      return {
        text: `购买 ${tokenSymbol}`,
        onClick: showTradeConfirmModal,
        loading: bondingCurve.isBuying,
        disabled: !bondingCurve.tokenAmount || bondingCurve.tokenAmount === BigInt(0)
      };
    } else {
      return {
        text: `出售 ${tokenSymbol}`,
        onClick: showTradeConfirmModal,
        loading: bondingCurve.isSelling,
        disabled: !bondingCurve.sellPriceInfo || bondingCurve.sellPriceInfo.ethReceived === BigInt(0)
      };
    }
  };

  const buttonProps = getTradeButtonProps();

  return (
    <Card 
      title={
        <Space align="center">
          <SwapOutlined className="text-blue-400" />
          <span className="text-white">ETH 交易</span>
          <Button 
            type="text" 
            size="small" 
            icon={<ReloadOutlined />}
            className="text-slate-300 hover:text-blue-400"
            onClick={async () => {
              // 重新计算状态
              calculateOutput();
              message.info('已刷新状态');
            }}
            loading={bondingCurve.isBuying || bondingCurve.isSelling}
          />
        </Space>
      }
      className="w-full max-w-md bg-slate-800/50 border-slate-700"
    >
      {/* 交易模式切换 */}
      <Row gutter={8} className="mb-4">
        <Col span={12}>
          <Button
            type={tradeMode === 'buy' ? 'primary' : 'default'}
            block
            onClick={() => setTradeMode('buy')}
            icon={<ArrowUpOutlined />}
          >
            购买
          </Button>
        </Col>
        <Col span={12}>
          <Button
            type={tradeMode === 'sell' ? 'primary' : 'default'}
            block
            onClick={() => setTradeMode('sell')}
            icon={<ArrowDownOutlined />}
          >
            出售
          </Button>
        </Col>
      </Row>

      {/* 输入区域 */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <Text strong className="text-white">
            {tradeMode === 'buy' ? '支付' : '出售'}
          </Text>
          <Button type="link" size="small" onClick={handleSetMax} className="text-blue-400">
            MAX
          </Button>
        </div>
        
        <div className="relative">
          <Input
            size="large"
            placeholder="0.00"
            value={inputAmount}
            onChange={(e) => setInputAmount(e.target.value)}
            className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
            suffix={
              <Space>
                <Text className="text-slate-300">
                  {tradeMode === 'buy' ? 'ETH' : tokenSymbol}
                </Text>
                <WalletOutlined className="text-slate-400" />
              </Space>
            }
          />
          <div className="absolute -bottom-6 right-0">
            <Text className="text-xs text-slate-400">
              余额: {tradeMode === 'buy' 
                ? (ethBalance ? `${formatETHBalance(ethBalance.formatted)} ETH` : '0 ETH')
                : tokenBalance + ' ' + tokenSymbol
              }
            </Text>
          </div>
        </div>
      </div>

      <div className="my-6">
        <ArrowDownOutlined className="block mx-auto text-lg text-slate-400" />
      </div>

      {/* 输出区域 */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <Text strong className="text-white">
            {tradeMode === 'buy' ? '获得' : '收到'}
          </Text>
          {/* {outputInfo.isLoading && <Spin size="small" />} */}
        </div>
        
        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-3">
          <div className="flex justify-between items-center">
            <Text className="text-lg font-medium text-white">
              {outputInfo.amount}
            </Text>
            <Text className="text-slate-300">
              {outputInfo.symbol}
            </Text>
          </div>
        </div>
      </div>

      {/* 滑点设置 */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <Text className="text-white">
            滑点容忍度
            <Tooltip title="交易时允许的最大价格滑点">
              <InfoCircleOutlined className="ml-1 text-slate-400" />
            </Tooltip>
          </Text>
          <Text strong className="text-white">{slippage}%</Text>
        </div>
        <Slider
          min={0.1}
          max={5}
          step={0.1}
          value={slippage}
          onChange={setSlippage}
          className="dark-slider"
          trackStyle={{ backgroundColor: '#3b82f6' }}
          handleStyle={{ borderColor: '#3b82f6', backgroundColor: '#3b82f6' }}
          railStyle={{ backgroundColor: '#475569' }}
          marks={{
            0.5: { style: { color: '#94a3b8' }, label: '0.5%' },
            1: { style: { color: '#94a3b8' }, label: '1%' },
            2: { style: { color: '#94a3b8' }, label: '2%' },
            5: { style: { color: '#94a3b8' }, label: '5%' }
          }}
        />
      </div>

      {/* 毕业进度提示 */}
          <Alert
            type="info"
        style={{ marginBottom: '20px' }}
        message=""
        description={`在毕业前，Token处于动态 Mint/Burn 状态，毕业后自动丢弃 Mint 权限。`}
        showIcon
      />


      {/* 交易按钮 */}
      <Button
        type="primary"
        size="large"
        block
        onClick={showTradeConfirmModal}
        loading={bondingCurve.isBuying || bondingCurve.isSelling}
        disabled={buttonProps.disabled}
        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 border-0 font-medium"
      >
        {buttonProps.text}
      </Button>

      {/* 交易确认Modal */}
      <Modal
        title={
          <div className="flex items-center space-x-2">
            <SwapOutlined className="text-blue-400" />
            <span>确认交易</span>
          </div>
        }
        open={confirmModalVisible}
        onCancel={() => !isExecutingTrade && setConfirmModalVisible(false)}
        width={500}
        centered
        className="dark-modal"
        maskClosable={!isExecutingTrade}
        closable={!isExecutingTrade}
        footer={[
          <Button 
            key="cancel" 
            onClick={() => setConfirmModalVisible(false)}
            disabled={isExecutingTrade}
            className="mr-2"
          >
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={isExecutingTrade}
            onClick={executeTradeAction}
            icon={isExecutingTrade ? undefined : <CheckCircleOutlined />}
            className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 border-0"
          >
            {isExecutingTrade ? '交易执行中...' : '确认交易'}
          </Button>
        ]}
      >
        {renderConfirmModalContent()}
      </Modal>

      {/* 错误显示 */}
      {(bondingCurve.buyError || bondingCurve.sellError) && (
        <Alert
          type="error"
          message="操作失败"
          description={
            bondingCurve.buyError?.message || 
            bondingCurve.sellError?.message
          }
          className="mt-4"
          closable
        />
      )}
    </Card>
  );
} 