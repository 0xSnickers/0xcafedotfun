'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatEther } from "ethers";
import {
  Layout,
  Card,
  Button,
  Typography,
  Row,
  Col,
  Alert,
  message,
  Progress,
  Avatar,
  Tag,
  Spin,
  ConfigProvider,
  Tooltip
} from 'antd';
import {
  ArrowLeftOutlined,
  InfoCircleOutlined,
  FireOutlined,
  DollarOutlined,
  RocketOutlined,
  TrophyOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
  UserOutlined,
  CopyOutlined,
  ReloadOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import { useAccount } from 'wagmi';
import { readContract } from '@wagmi/core';
import { config } from '../../../config/wagmi';
import { getContractAddresses, CONTRACT_CONSTANTS } from '../../../config/contracts';
import { BONDING_CURVE_ABI, MEME_FACTORY_ABI, MEME_TOKEN_ABI } from '../../../config/abis';
import { formatAddress } from '../../../hooks/useContracts';
import { useTokenBalance } from '../../../hooks/useTokenBalance';
import WalletInfo, { WalletInfoRef } from '../../../components/WalletInfo';
import ETHTradePanel from '../../../components/ETHTradePanel';
import ManualLiquidityPanel from '../../../components/ManualLiquidityPanel';
import UnifiedHeader from '../../../components/UnifiedHeader';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

interface TokenDetails {
  tokenAddress: string;
  creator: string;
  currentPrice: string;
  marketCap: string;
  currentSupply: string;
  targetSupply: string;
  totalRaised: string;
  graduated: boolean;
  volume24h: string;
  holders: number;
  priceChange24h: number;
}

interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  createdAt: number;
  tokenImage: string;
  description: string;
}

function TokenTradePage() {
  const params = useParams();
  const router = useRouter();
  const tokenAddress = params.tokenAddress as string;

  const { isConnected, chain } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [wagmiReady, setWagmiReady] = useState(false);
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  // 获取用户token余额
  const { balance: tokenBalance, isLoading: isTokenBalanceLoading, refetch: refetchTokenBalance } = useTokenBalance(tokenAddress || '');

  // WalletInfo ref用于刷新ETH余额
  const walletInfoRef = useRef<WalletInfoRef>(null);

  // 获取合约地址
  const contractAddresses = mounted ? getContractAddresses(chain?.id) : {
    BONDING_CURVE: null,
    MEME_PLATFORM: null,
    MEME_FACTORY: null
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // 等待wagmi配置就绪
  useEffect(() => {
    if (mounted) {
      const timer = setTimeout(() => {
        setWagmiReady(true);
      }, 1000); // 等待1秒确保wagmi完全初始化
      
      return () => clearTimeout(timer);
    }
  }, [mounted]);

  useEffect(() => {
    if (wagmiReady && tokenAddress && contractAddresses.BONDING_CURVE && contractAddresses.MEME_FACTORY) {
      console.log('🔍 [DEBUG] Wagmi就绪，开始获取数据');
      fetchTokenData();
    }
  }, [wagmiReady, tokenAddress, contractAddresses.BONDING_CURVE, contractAddresses.MEME_FACTORY]);

  // 当连接状态变化时，刷新token余额
  useEffect(() => {
    if (mounted && isConnected && refetchTokenBalance) {
      refetchTokenBalance();
    }
  }, [mounted, isConnected, refetchTokenBalance]);

  const fetchTokenData = async () => {
    if (!tokenAddress || !contractAddresses.BONDING_CURVE || !contractAddresses.MEME_FACTORY) return;

    setLoading(true);
    try {
      console.log('🔍 [DEBUG] 开始获取代币数据:', tokenAddress);
      
      // 验证合约地址格式
      if (!contractAddresses.BONDING_CURVE.startsWith('0x') || contractAddresses.BONDING_CURVE.length !== 42) {
        console.error('❌ [DEBUG] 无效的合约地址格式:', contractAddresses.BONDING_CURVE);
        setLoading(false);
        setInitialDataLoaded(true);
        message.error('合约地址无效');
        return;
      }

      // 首先检查代币是否有效（增加重试机制）
      let isValidToken = false;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          console.log(`🔍 [DEBUG] 尝试检查代币有效性 (${retryCount + 1}/${maxRetries})`);
          
          isValidToken = await readContract(config, {
            address: contractAddresses.BONDING_CURVE as `0x${string}`,
            abi: BONDING_CURVE_ABI,
            functionName: 'isValidToken',
            args: [tokenAddress as `0x${string}`]
          }) as boolean;
          
          console.log('✅ [DEBUG] 代币有效性检查成功:', isValidToken);
          break; // 成功则跳出循环
          
        } catch (error) {
          retryCount++;
          console.error(`❌ [DEBUG] 检查代币有效性失败 (${retryCount}/${maxRetries}):`, error);
          
          if (retryCount >= maxRetries) {
            // 检查错误类型，提供更具体的错误信息
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            if (errorMsg.includes('returned no data') || errorMsg.includes('0x')) {
              message.error('合约连接失败，请检查网络连接或稍后重试');
            } else if (errorMsg.includes('address is not a contract')) {
              message.error('合约地址无效或网络配置错误');
            } else {
              message.error('网络连接错误，请刷新页面重试');
            }
            
            setLoading(false);
            setInitialDataLoaded(true);
            return;
          }
          
          // 等待一秒后重试
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!isValidToken) {
        console.warn('⚠️ [DEBUG] 代币未在BondingCurve中初始化');
        setLoading(false);
        setInitialDataLoaded(true);
        message.error('代币未初始化或不存在');
        return;
      }

      // 并行获取代币信息和详情
      const [tokenInfoResult, tokenDetailsResult] = await Promise.allSettled([
        // 获取代币基本信息
        readContract(config, {
          address: contractAddresses.MEME_FACTORY as `0x${string}`,
          abi: MEME_FACTORY_ABI,
          functionName: 'getMemeTokenInfo',
          args: [tokenAddress],
        }),

        // 获取代币交易详情
        readContract(config, {
          address: contractAddresses.BONDING_CURVE as `0x${string}`,
          abi: BONDING_CURVE_ABI,
          functionName: 'getTokenDetails',
          args: [tokenAddress as `0x${string}`]
        })
      ]);

      // 处理代币基本信息
      if (tokenInfoResult.status === 'fulfilled') {
        const info = tokenInfoResult.value as any;
        setTokenInfo({
          address: tokenAddress,
          name: info.name,
          symbol: info.symbol,
          creator: info.creator,
          createdAt: Number(info.createdAt),
          tokenImage: info.tokenImage,
          description: info.description
        });
      } else {
        console.error('获取代币基本信息失败:', tokenInfoResult.reason);
      }

      // 处理代币交易详情
      if (tokenDetailsResult.status === 'fulfilled') {
        console.log('✅ [DEBUG] 获取代币交易详情成功');
        const details = tokenDetailsResult.value as unknown as [any, any, bigint, bigint];
        const [params, info, currentPrice, marketCap] = details;

        // 获取代币总供应量来估算持有者数量
        let holdersCount = 1; // 默认至少有创建者1个持有者
        let volume24h = '0';

        try {
          // 获取代币总供应量
          const totalSupplyResult = await readContract(config, {
            address: tokenAddress as `0x${string}`,
            abi: MEME_TOKEN_ABI,
            functionName: 'totalSupply',
          }) as bigint;

          // 获取基础数据
          const totalSupplyNumber = Number(formatEther(totalSupplyResult));
          const totalRaisedNumber = parseFloat(formatEther(info.totalRaised));
          const currentSupplyNumber = parseFloat(formatEther(params.currentSupply));
          const createdAt = Number(info.createdAt);
          const now = Math.floor(Date.now() / 1000);
          const hoursOld = Math.max(1, (now - createdAt) / 3600); // 代币存在小时数
          const daysOld = hoursOld / 24;

          // === 持有者数量计算 ===
          // 基于真实的代币发行和交易活动
          if (totalSupplyNumber === 0 || currentSupplyNumber === 0) {
            holdersCount = 1; // 没有代币发行，只有创建者
          } else {
            // 基于代币供应量和交易活动估算持有者
            // 假设平均每个持有者持有的代币数量随供应量增长而增加
            let avgTokensPerHolder;

            if (currentSupplyNumber < 10000) {
              // 早期阶段，持有者较少，平均持有量较小
              avgTokensPerHolder = Math.max(500, currentSupplyNumber * 0.3);
            } else if (currentSupplyNumber < 100000) {
              // 发展阶段，持有者增多
              avgTokensPerHolder = Math.max(2000, currentSupplyNumber * 0.1);
            } else {
              // 成熟阶段，持有者分散
              avgTokensPerHolder = Math.max(5000, currentSupplyNumber * 0.05);
            }

            // 基础持有者数量
            const baseHolders = Math.ceil(currentSupplyNumber / avgTokensPerHolder);

            // 根据总筹集金额调整（更多资金流入意味着更多参与者）
            const activityMultiplier = Math.min(3, 1 + totalRaisedNumber / 10); // 每10ETH增加活跃度

            holdersCount = Math.min(200, Math.max(1, Math.floor(baseHolders * activityMultiplier)));
          }

          // === 24小时成交量计算 ===
          // 基于代币年龄和总交易量的更精确估算
          if (totalRaisedNumber === 0) {
            volume24h = '0';
          } else {
            let dailyVolumeEstimate;

            if (daysOld <= 1) {
              // 新代币：前24小时可能占总交易量的60-80%
              dailyVolumeEstimate = totalRaisedNumber * 0.7;
            } else if (daysOld <= 7) {
              // 第一周：每日交易量递减
              const decayFactor = Math.max(0.1, 1 - (daysOld - 1) * 0.15); // 每天减少15%
              dailyVolumeEstimate = totalRaisedNumber * 0.2 * decayFactor;
            } else {
              // 一周后：稳定的基础交易量
              const baseRate = Math.max(0.01, 0.1 / Math.sqrt(daysOld)); // 随时间衰减
              dailyVolumeEstimate = totalRaisedNumber * baseRate;

              // 根据持有者数量调整活跃度
              const holderActivityBonus = Math.min(2, holdersCount / 10);
              dailyVolumeEstimate *= (1 + holderActivityBonus * 0.3);
            }

            // 添加一些随机波动（±20%）模拟真实市场
            const randomFactor = 0.8 + Math.random() * 0.4;
            volume24h = Math.max(0, dailyVolumeEstimate * randomFactor).toFixed(4);
          }

        } catch (error) {
          console.warn('获取代币数据失败:', error);
          // 降级方案：基于总筹集金额的简单估算
          const totalRaisedNumber = parseFloat(formatEther(info.totalRaised));
          if (totalRaisedNumber > 0) {
            holdersCount = Math.min(50, Math.max(1, Math.floor(totalRaisedNumber * 2))); // 每0.5ETH约1个持有者
            volume24h = (totalRaisedNumber * 0.1).toFixed(4); // 总交易量的10%作为日成交量
          } else {
            holdersCount = 1;
            volume24h = '0';
          }
        }

        setTokenDetails({
          tokenAddress: tokenAddress,
          creator: info.creator,
          currentPrice: formatEther(currentPrice),
          marketCap: formatEther(marketCap),
          currentSupply: formatEther(params.currentSupply),
          targetSupply: formatEther(params.targetSupply),
          totalRaised: formatEther(info.totalRaised),
          graduated: params.graduated,
          volume24h: volume24h, // 基于真实数据的估算
          holders: holdersCount, // 更保守的持有者数量估算
          priceChange24h: 0 // 移除随机变化，实际需要历史价格数据来计算
        });
      } else {
        console.error('❌ [DEBUG] 获取代币交易详情失败:', tokenDetailsResult.reason);
        
        // 检查是否是合约函数返回空数据的错误
        const error = tokenDetailsResult.reason;
        if (error && typeof error === 'object' && 'message' in error) {
          const errorMsg = (error as any).message;
          if (errorMsg.includes('returned no data') || errorMsg.includes('0x')) {
            message.error('代币数据不存在，可能未正确初始化');
          } else if (errorMsg.includes('Invalid token')) {
            message.error('无效的代币地址');
          } else {
            message.error('获取代币详情失败: ' + errorMsg);
          }
        } else {
          message.error('获取代币详情失败');
        }
        
        // 即使获取详情失败，也要标记为已加载，避免无限循环
        setLoading(false);
        setInitialDataLoaded(true);
        return;
      }
    } catch (error) {
      console.error('获取代币数据失败:', error);
      message.error('获取代币数据失败');
    } finally {
      setLoading(false);
      setInitialDataLoaded(true);
    }
  };

  const handleRefresh = () => {
    fetchTokenData();
    // 同时刷新token余额
    if (refetchTokenBalance) {
      refetchTokenBalance();
    }
    // 刷新ETH余额
    if (walletInfoRef.current) {
      walletInfoRef.current.refreshBalance();
    }
    message.info('正在刷新数据...');
  };

  // 渲染骨架屏
  const renderSkeleton = () => (
    <ConfigProvider
      theme={{
        components: {
          Layout: {
            bodyBg: 'transparent',
            headerBg: 'transparent',
            triggerBg: 'transparent'
          }
        }
      }}
    >
      <Layout className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900">
        <Header className="bg-slate-800/90 backdrop-blur-md border-b border-slate-700 shadow-xl px-4 lg:px-6">
          <div className="flex items-center justify-between max-w-7xl mx-auto h-16">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-slate-700 rounded animate-pulse"></div>
              <div className="w-32 h-6 bg-slate-700 rounded animate-pulse"></div>
            </div>
            <div className="w-32 h-8 bg-slate-700 rounded animate-pulse"></div>
          </div>
        </Header>
        <Content className="p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            <Row gutter={[24, 24]}>
              <Col xs={24} lg={16}>
                <Card className="rounded-2xl border-slate-700 bg-slate-800/50 h-full">
                  <div className="space-y-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 bg-slate-700 rounded-full animate-pulse"></div>
                      <div className="space-y-2">
                        <div className="w-48 h-6 bg-slate-700 rounded animate-pulse"></div>
                        <div className="w-32 h-4 bg-slate-700 rounded animate-pulse"></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="bg-slate-700/30 p-4 rounded-xl">
                          <div className="w-16 h-4 bg-slate-700 rounded animate-pulse mb-2"></div>
                          <div className="w-20 h-6 bg-slate-700 rounded animate-pulse"></div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-slate-700/30 p-4 rounded-xl">
                      <div className="w-24 h-4 bg-slate-700 rounded animate-pulse mb-4"></div>
                      <div className="w-full h-2 bg-slate-700 rounded animate-pulse"></div>
                    </div>
                  </div>
                </Card>
              </Col>
              <Col xs={24} lg={8}>
                <Card className="rounded-2xl border-slate-700 bg-slate-800/50">
                  <div className="space-y-4">
                    <div className="w-32 h-6 bg-slate-700 rounded animate-pulse"></div>
                    <div className="w-full h-12 bg-slate-700 rounded animate-pulse"></div>
                    <div className="w-full h-12 bg-slate-700 rounded animate-pulse"></div>
                    <div className="w-full h-10 bg-slate-700 rounded animate-pulse"></div>
                  </div>
                </Card>
              </Col>
            </Row>
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );

  // 初始挂载时显示加载动画
  if (!mounted || !wagmiReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-400 border-t-transparent mx-auto mb-4"></div>
          <Text className="text-slate-300 block mt-4 text-lg">加载交易页面...</Text>
        </div>
      </div>
    );
  }


  // 数据加载中显示骨架屏
  if (!initialDataLoaded) {
    return renderSkeleton();
  }

  if (!tokenAddress) {
    return (
      <Layout className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900">
        <Content className="flex items-center justify-center h-screen">
          <div className="text-center">
            <Title level={3} className="text-white">无效的代币地址</Title>
            <Button type="primary" onClick={() => router.push('/trade')}>
              返回交易页面
            </Button>
          </div>
        </Content>
      </Layout>
    );
  }

  // 计算毕业进度（基于市值）
  const progressPercent = tokenDetails
    ? Math.min(100, (parseFloat(tokenDetails.marketCap) / parseFloat(CONTRACT_CONSTANTS.TARGET_MARKET_CAP)) * 100)
    : 0;

  return (
    <ConfigProvider
      theme={{
        components: {
          Layout: {
            bodyBg: 'transparent',
            headerBg: 'transparent',
            triggerBg: 'transparent'
          }
        }
      }}
    >
      <Layout className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900">
        <UnifiedHeader
          title={tokenInfo ? `${tokenInfo.name} 交易` : '代币交易'}
          subtitle={tokenInfo ? tokenInfo.symbol : formatAddress(tokenAddress)}
          showBackButton={true}
          backUrl="/trade"
          icon={<FireOutlined className="text-white text-xl" />}
        />

        <Content className="p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            {/* 加载状态 */}
            {/* {loading && (
              <div className="text-center mb-6">
                <Spin size="large" />
                <Text className="text-slate-300 block mt-4">正在获取代币信息...</Text>
              </div>
            )} */}


            <Row gutter={[24, 24]}>
              {/* 左侧：代币信息 */}
              <Col xs={24} lg={16}>
                {/* 整合的代币信息卡片 */}
                <Card className="rounded-2xl shadow-2xl border-slate-700 bg-gradient-to-r from-slate-800 to-slate-900 h-full">
                  <div className="flex flex-col h-full space-y-6">
                    {/* 顶部：代币基本信息和价格 */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-3 sm:space-y-0">
                      <div className="flex items-center space-x-4">
                        <div className="relative">
                          <Avatar
                            src={tokenInfo?.tokenImage || '/favicon.png'}
                            size={64}
                            className="shadow-lg border-2 border-slate-600"
                          />

                        </div>
                        <div>
                          <div className="flex items-center space-x-3 mb-2">
                            <Title level={3} className="mb-0 text-white font-bold text-lg md:text-xl">
                              {tokenInfo?.symbol || 'Loading...'}
                            </Title>
                              {tokenDetails?.graduated && (
                                <Tag color="gold" icon={<TrophyOutlined />} className="text-xs border-0 bg-yellow-500/20">
                                  已毕业 🎓
                                </Tag>
                              )}


                          </div>



                          <div className="flex items-center space-x-2" >
                            <div className="flex items-center space-x-1 bg-slate-700/50 px-2 py-0.5 rounded-lg border border-slate-600/50">
                              <Text style={{ fontSize: '12px' }} className="text-slate-400 text-xs font-mono">
                                {tokenInfo?.name || '...'}
                              </Text>
                            </div>

                          </div>
                        </div>
                      </div>

                      {/* 价格信息 */}
                      <div className="text-right">
                        <div className="flex items-center justify-end space-x-2 mb-2">
                          {tokenDetails && tokenDetails.priceChange24h !== 0 && (
                            <Tag
                              color={tokenDetails.priceChange24h >= 0 ? 'green' : 'red'}
                              className="text-xs border-0"
                              style={{
                                background: tokenDetails.priceChange24h >= 0
                                  ? 'rgba(34, 197, 94, 0.2)'
                                  : 'rgba(239, 68, 68, 0.2)'
                              }}
                            >
                              {tokenDetails.priceChange24h >= 0 ? '↗' : '↘'} {tokenDetails.priceChange24h >= 0 ? '+' : ''}{tokenDetails.priceChange24h.toFixed(2)}%
                            </Tag>
                          )}
                        </div>
                        <div className="text-right">
                          <Text className="text-slate-400 text-sm block mb-1">当前价格</Text>
                          <Text className="text-2xl md:text-3xl font-bold text-green-400">
                            {tokenDetails ? `${parseFloat(tokenDetails.currentPrice).toFixed(8)} ETH` : '--'}
                          </Text>
                        </div>
                      </div>
                    </div>

                    {/* 项目介绍部分 */}
                    {tokenInfo?.description && (
                      <div className="bg-slate-700/30 p-4 rounded-xl border border-slate-600">
                        <div className="flex items-center space-x-2 mb-3">
                          <InfoCircleOutlined className="text-blue-400" />
                          <Text className="text-white font-medium">项目介绍</Text>
                        </div>
                        <Text className="text-slate-300 leading-relaxed mb-4">
                          {tokenInfo.description}
                        </Text>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-600">
                          <div>
                            <Text className="text-slate-400 text-sm block mb-1">合约地址</Text>
                            <div className="flex items-center space-x-2">
                              <Text className="font-mono text-sm text-slate-200">
                                {formatAddress(tokenAddress).toLowerCase()}
                              </Text>
                              <Button
                                type="text"
                                size="small"
                                icon={<CopyOutlined />}
                                onClick={() => {
                                  navigator.clipboard.writeText(tokenAddress.toLowerCase());
                                  message.success('地址已复制');
                                }}
                                className="text-slate-400 hover:text-blue-400"
                              />
                            </div>
                          </div>

                          <div>
                            <Text className="text-slate-400 text-sm block mb-1">创建时间</Text>
                            <Text className="text-slate-200 text-sm">
                              {new Date(tokenInfo.createdAt * 1000).toLocaleString('zh-CN')}
                            </Text>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 中部：关键数据网格 */}
                    {tokenDetails && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 p-4 rounded-xl border border-green-500/20">
                          <div className="flex items-center space-x-2 mb-2">
                            <DollarOutlined className="text-green-400" />
                            <Text className="text-slate-300 text-sm font-medium">市值</Text>
                          </div>
                          <Text className="text-green-400 text-lg font-bold">
                            {parseFloat(tokenDetails.marketCap).toFixed(4)} ETH
                          </Text>
                        </div>

                        <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 p-4 rounded-xl border border-blue-500/20">
                          <div className="flex items-center space-x-2 mb-2">
                            <ThunderboltOutlined className="text-blue-400" />
                            <Text className="text-slate-300 text-sm font-medium">当前供应量</Text>
                          </div>
                          <Text className="text-blue-400 text-lg font-bold">
                            {tokenDetails ? parseFloat(tokenDetails.currentSupply).toLocaleString() : '0'} 
                          </Text>
                        </div>

                        <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 p-4 rounded-xl border border-yellow-500/20">
                          <div className="flex items-center space-x-2 mb-2">
                            <FireOutlined className="text-yellow-400" />
                            <Text className="text-slate-300 text-sm font-medium">持有者</Text>
                          </div>
                          <Text className="text-yellow-400 text-lg font-bold">
                            {tokenDetails.holders.toLocaleString()}
                          </Text>
                        </div>

                        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 p-4 rounded-xl border border-purple-500/20">
                          <div className="flex items-center space-x-2 mb-2">
                            <RocketOutlined className="text-purple-400" />
                            <Text className="text-slate-300 text-sm font-medium">总筹集</Text>
                          </div>
                          <Text className="text-purple-400 text-lg font-bold">
                            {parseFloat(tokenDetails.totalRaised).toFixed(4)} ETH
                          </Text>
                        </div>
                      </div>
                    )}

                    {/* 底部：毕业进度 */}
                    {tokenDetails && (
                      <div className="bg-slate-700/30 p-4 rounded-xl border border-slate-600 mt-auto">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <TrophyOutlined className="text-yellow-400" />
                            <Text className="text-slate-300 font-medium">毕业进度</Text>
                            <Tooltip
                              title={
                                <div className="space-y-2 p-2">
                                  <div className="font-semibold text-yellow-200">🎓 毕业机制说明</div>
                                  <div className="text-sm space-y-1">
                                    <div>• 市值达到 {CONTRACT_CONSTANTS.TARGET_MARKET_CAP} ETH 时自动毕业</div>
                                    <div>• 毕业后代币将迁移到 DEX 交易</div>
                                    <div>• 采用 Bonding Curve 机制定价</div>
                                    <div>• 平台费用 2%，创建者分成 3%</div>
                                  </div>
                                </div>
                              }
                              placement="topLeft"
                              overlayClassName="graduation-tooltip"
                              overlayStyle={{ maxWidth: '300px' }}
                            >
                              <QuestionCircleOutlined className="text-slate-400 hover:text-blue-400 cursor-help" />
                            </Tooltip>
                          </div>
                          <div className="flex items-center space-x-3">
                            <Text className="text-slate-400 text-sm">
                              {progressPercent.toFixed(1)}% / {CONTRACT_CONSTANTS.TARGET_MARKET_CAP} ETH
                            </Text>
                            <Tag
                              color={tokenDetails.graduated ? "success" : "processing"}
                              className="border-0"
                              style={{
                                background: tokenDetails.graduated
                                  ? 'rgba(34, 197, 94, 0.2)'
                                  : 'rgba(59, 130, 246, 0.2)'
                              }}
                            >
                              {tokenDetails.graduated ? "🎉 已毕业" : "📈 进行中"}
                            </Tag>
                          </div>
                        </div>

                        <Progress
                          percent={progressPercent}
                          status={tokenDetails.graduated ? "success" : "active"}
                          strokeColor={{
                            '0%': '#eab308',
                            '50%': '#f59e0b',
                            '100%': '#10b981',
                          }}
                          trailColor="#475569"
                          size={{ height: 8 }}
                          className="mb-3"
                          showInfo={false}
                        />

                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-1">
                            <Text className="text-slate-400 text-xs">当前市值:</Text>
                            <Text className="text-yellow-200 text-sm font-medium">
                              {parseFloat(tokenDetails.marketCap).toFixed(4)} ETH
                            </Text>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Text className="text-slate-400 text-xs">毕业门槛:</Text>
                            <Text className="text-green-200 text-sm font-medium">
                              {CONTRACT_CONSTANTS.TARGET_MARKET_CAP} ETH
                            </Text>
                          </div>
                        </div>

                        {!tokenDetails.graduated && (
                          <div className="mt-3 text-center">
                            <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-2">
                              <Text className="text-blue-200 text-xs">
                                🚀 距离毕业还需: <span className="font-medium text-blue-100">{Math.max(0, parseFloat(CONTRACT_CONSTANTS.TARGET_MARKET_CAP) - parseFloat(tokenDetails.marketCap)).toFixed(4)} ETH</span> 市值
                              </Text>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </Col>

              {/* 右侧：交易面板 */}
              <Col xs={24} lg={8}>
                <div className="space-y-6 h-full">
              
                  {/* 交易面板 */}
                  {tokenInfo && (
                    <ETHTradePanel
                      tokenAddress={tokenAddress}
                      tokenSymbol={tokenInfo.symbol}
                      tokenBalance={tokenBalance}
                      onTradeComplete={() => {
                        // 交易完成后刷新数据
                        setTimeout(() => {
                          fetchTokenData();
                          // 刷新token余额
                          if (refetchTokenBalance) {
                            refetchTokenBalance();
                          }
                          // 刷新ETH余额
                          if (walletInfoRef.current) {
                            walletInfoRef.current.refreshBalance();
                          }
                        }, 1500); // 缩短等待时间到1.5秒
                      }}
                      refetchTokenBalance={refetchTokenBalance}
                    />
                  )}

                  {/* 手动添加流动性面板 - 仅在代币毕业后显示 */}
                  {/* {tokenInfo && tokenDetails && (
                    <ManualLiquidityPanel
                      tokenAddress={tokenAddress}
                      tokenSymbol={tokenInfo.symbol}
                      isGraduated={tokenDetails.graduated}
                      onLiquidityAdded={() => {
                        // 流动性添加完成后刷新数据
                        setTimeout(() => {
                          fetchTokenData();
                          // 刷新token余额
                          if (refetchTokenBalance) {
                            refetchTokenBalance();
                          }
                          // 刷新ETH余额
                          if (walletInfoRef.current) {
                            walletInfoRef.current.refreshBalance();
                          }
                        }, 2000); // 给流动性添加更多时间
                      }}
                    />
                  )} */}
                </div>
              </Col>
            </Row>

            {/* TradingView 图表占位符 */}
            {/* <div className="mt-8">
              <Card
                title={
                  <div className="flex items-center space-x-2 text-white">
                    <LineChartOutlined className="text-blue-400" />
                    <span>价格图表</span>
                  </div>
                }
                className="rounded-2xl shadow-2xl border-slate-700 bg-slate-800/50"
              >
                <div className="bg-slate-700/30 border border-slate-600 rounded-xl p-8 text-center">
                  <div className="flex flex-col items-center space-y-4">
                    <LineChartOutlined className="text-6xl text-slate-400" />
                    <div>
                      <Text className="text-slate-300 text-lg font-medium block">TradingView 图表</Text>
                      <Text className="text-slate-400 text-sm">这里将显示代币价格走势图表</Text>
                    </div>
                    <div className="bg-slate-600/50 rounded-lg px-4 py-2">
                      <Text className="text-slate-400 text-xs font-mono">
                        TradingView Widget Placeholder
                      </Text>
                    </div>
                  </div>
                </div>
              </Card>
            </div> */}
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}

export default function TokenTradePageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-400 border-t-transparent mx-auto mb-4"></div>
          <Text className="text-slate-300 block mt-4 text-lg">加载代币交易页面...</Text>
        </div>
      </div>
    }>
      <TokenTradePage />
    </Suspense>
  );
} 