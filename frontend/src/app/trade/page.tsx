'use client';

import { useState, useEffect, Suspense } from 'react';
import { formatEther } from "ethers";
import {
  Layout,
  Card,
  Input,
  Button,
  Typography,
  Space,
  Row,
  Col,
  Alert,
  message,
  Avatar,
  Empty,
  Badge,
  Tag,
  Spin,
  Tabs
} from 'antd';
import {
  ArrowLeftOutlined,
  FireOutlined,
  SearchOutlined,
  RocketOutlined,
  TrophyOutlined,
  UserOutlined,
  CopyOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccount } from 'wagmi';
import { readContract } from '@wagmi/core';
import { config } from '../../config/wagmi';
import { getContractAddresses, CONTRACT_CONSTANTS } from '../../config/contracts';
import { MEME_PLATFORM_ABI, MEME_FACTORY_ABI, BONDING_CURVE_ABI } from '../../config/abis';
import { formatAddress } from '../../hooks/useContracts';
import WalletInfo from '../../components/WalletInfo';
import UnifiedHeader from '../../components/UnifiedHeader';

const { Content } = Layout;
const { Title, Text } = Typography;

interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  createdAt: number;
  tokenImage: string;
  description: string;
  graduated: boolean;
  marketCap?: string;
  currentPrice?: string;
}

function TradePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenAddress = searchParams.get('token');
  
  const { chain } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 获取合约地址
  const contractAddresses = mounted ? getContractAddresses(chain?.id) : { 
    MEME_PLATFORM: null, 
    MEME_FACTORY: null,
    BONDING_CURVE: null 
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && contractAddresses.MEME_PLATFORM && contractAddresses.MEME_FACTORY && contractAddresses.BONDING_CURVE) {
      fetchTokenList();
    }
  }, [mounted, contractAddresses.MEME_PLATFORM, contractAddresses.MEME_FACTORY, contractAddresses.BONDING_CURVE]);

  // 如果URL中有token参数，直接重定向到对应的交易页面
  useEffect(() => {
    if (tokenAddress && mounted) {
      router.replace(`/trade/${tokenAddress}`);
    }
  }, [tokenAddress, mounted, router]);

  const fetchTokenList = async () => {
    if (!contractAddresses.MEME_PLATFORM || !contractAddresses.MEME_FACTORY || !contractAddresses.BONDING_CURVE) return;
    
    setLoadingTokens(true);
    try {
      const allTokens = await readContract(config, {
        address: contractAddresses.MEME_PLATFORM as `0x${string}`,
        abi: MEME_PLATFORM_ABI,
        functionName: 'getAllMemeTokens',
        args: []
      });

      // 获取每个代币的详细信息
      const tokenInfos: TokenInfo[] = [];
      for (const tokenAddr of (allTokens as string[]).slice(0, 20)) { // 限制最多20个代币
        try {
          // 并行获取代币基本信息和毕业状态
          const [tokenInfo, tokenDetails] = await Promise.allSettled([
            // 从工厂合约获取代币信息
            readContract(config, {
              address: contractAddresses.MEME_FACTORY as `0x${string}`,
              abi: MEME_FACTORY_ABI,
              functionName: 'getMemeTokenInfo',
              args: [tokenAddr as `0x${string}`],
            }),
            // 从Bonding Curve获取毕业状态和价格信息
            readContract(config, {
              address: contractAddresses.BONDING_CURVE as `0x${string}`,
              abi: BONDING_CURVE_ABI,
              functionName: 'getTokenDetails',
              args: [tokenAddr as `0x${string}`]
            })
          ]);

          if (tokenInfo.status === 'fulfilled') {
            const info = tokenInfo.value as any;
            let graduated = false;
            let marketCap = '0';
            let currentPrice = '0';

            // 如果能获取到毕业状态信息
            if (tokenDetails.status === 'fulfilled') {
              const details = tokenDetails.value as unknown as [any, any, bigint, bigint];
              const [params, , price, cap] = details;
              graduated = params.graduated || false;
              marketCap = formatEther(cap);
              currentPrice = formatEther(price);
            }

          tokenInfos.push({
            address: tokenAddr,
              name: info.name,
              symbol: info.symbol,
              creator: info.creator,
              createdAt: Number(info.createdAt),
              tokenImage: info.tokenImage,
              description: info.description,
              graduated,
              marketCap,
              currentPrice
            });
          }
        } catch (error) {
          console.error(`获取代币 ${tokenAddr} 信息失败:`, error);
        }
      }
      
      setTokenList(tokenInfos);
    } catch (error) {
      console.error('获取代币列表失败:', error);
      message.error('获取代币列表失败');
    } finally {
      setLoadingTokens(false);
    }
  };

  const handleTokenSelect = (tokenAddr: string) => {
    // 直接导航到具体的代币交易页面
    router.push(`/trade/${tokenAddr}`);
  };

  // 分离毕业和未毕业的代币
  const filteredTokens = tokenList.filter(token => 
    token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    token.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeTokens = filteredTokens.filter(token => !token.graduated);
  const graduatedTokens = filteredTokens.filter(token => token.graduated);

  // 渲染代币卡片
  const renderTokenCard = (token: TokenInfo) => (
    <Col xs={24} sm={12} lg={8} key={token.address}>
      <Card
        hoverable
        className={`token-card ${token.graduated 
          ? 'bg-gradient-to-br from-yellow-900/20 to-amber-900/20 border-yellow-500/30 hover:border-yellow-400/50' 
          : 'bg-slate-700/30 border-slate-600 hover:border-slate-500'
        } transition-all duration-200 hover:shadow-lg`}
        onClick={() => handleTokenSelect(token.address)}
        bodyStyle={{ padding: '16px' }}
      >
        <div className="space-y-3">
          {/* 代币头部信息 */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Avatar 
                src={token.tokenImage || '/favicon.png'} 
                size={40}
                className="shadow-md border border-slate-600"
              />
              {token.graduated && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                  <TrophyOutlined className="text-xs text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <Text className="text-white font-bold text-sm">
                  ${token.symbol}
                </Text>
                {token.graduated && (
                  <Tag color="gold" className="text-xs px-1 py-0 border-0 bg-yellow-500/20">
                    🎓
                  </Tag>
                )}
              </div>
              <Text className="text-slate-400 text-xs truncate block">
                {token.name}
              </Text>
            </div>
          </div>

          {/* 价格和市值信息 */}
          {token.currentPrice && token.marketCap && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/50 px-2 py-1 rounded">
                <Text className="text-slate-400 text-xs block">当前价格</Text>
                <Text className="text-green-400 text-xs font-mono">
                  {parseFloat(token.currentPrice).toFixed(8)} ETH
                </Text>
              </div>
              <div className="bg-slate-800/50 px-2 py-1 rounded">
                <Text className="text-slate-400 text-xs block">市值</Text>
                <Text className="text-blue-400 text-xs font-mono">
                  {parseFloat(token.marketCap).toFixed(4)} ETH
                </Text>
              </div>
            </div>
          )}

          {/* 代币地址 */}
          <div className="flex items-center justify-between bg-slate-800/50 px-2 py-1 rounded">
            <Text className="text-slate-400 text-xs font-mono">
              {formatAddress(token.address)}
            </Text>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  // 检查浏览器是否支持 Clipboard API
                  if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(token.address);
                    message.success('地址已复制到剪贴板');
                  } else {
                    // 降级方案：使用传统的复制方法
                    const textArea = document.createElement('textarea');
                    textArea.value = token.address;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    textArea.style.top = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    try {
                      document.execCommand('copy');
                      message.success('地址已复制到剪贴板');
                    } catch (err) {
                      console.error('复制失败:', err);
                      message.error('复制失败，请手动复制地址');
                    }
                    textArea.remove();
                  }
                } catch (err) {
                  console.error('复制地址失败:', err);
                  message.error('复制失败，请手动复制地址');
                }
              }}
              className="text-slate-400 hover:text-blue-400 p-0"
            />
          </div>

          {/* 创建时间 */}
          <div className="flex items-center justify-between text-xs">
            <Text className="text-slate-500">
              创建时间:
            </Text>
            <Text className="text-slate-400">
              {(() => {
                const now = Date.now() / 1000;
                const diff = now - token.createdAt;
                if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
                if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
                return `${Math.floor(diff / 86400)}天前`;
              })()}
            </Text>
          </div>

          {/* 交易按钮 */}
          <Button
            type="primary"
            block
            className={token.graduated 
              ? "bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 border-0" 
              : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 border-0"
            }
            onClick={(e) => {
              e.stopPropagation();
              handleTokenSelect(token.address);
            }}
          >
            {token.graduated ? '🎓 查看详情' : '🚀 开始交易'}
          </Button>
        </div>
      </Card>
    </Col>
  );

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-400 border-t-transparent mx-auto mb-4"></div>
          <Text className="text-slate-300 block mt-4 text-lg">加载交易平台...</Text>
        </div>
      </div>
    );
  }

  return (
    <Layout className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900">
      <UnifiedHeader />

      <Content className="p-4 lg:p-6">
        <div className="max-w-6xl mx-auto">
          {/* 统计信息 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-xl">
              <div className="text-center">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <ThunderboltOutlined className="text-blue-400" />
                  <Text className="text-blue-300 font-medium">活跃交易</Text>
              </div>
                <Text className="text-2xl font-bold text-blue-400">
                  {activeTokens.length}
                </Text>
                <Text className="text-slate-400 text-sm">代币</Text>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-yellow-500/10 to-amber-500/10 border border-yellow-500/20 rounded-xl">
              <div className="text-center">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <TrophyOutlined className="text-yellow-400" />
                  <Text className="text-yellow-300 font-medium">已毕业</Text>
          </div>
                <Text className="text-2xl font-bold text-yellow-400">
                  {graduatedTokens.length}
                                </Text>
                <Text className="text-slate-400 text-sm">代币</Text>
                              </div>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl">
              <div className="text-center">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <RocketOutlined className="text-purple-400" />
                  <Text className="text-purple-300 font-medium">总代币</Text>
                            </div>
                <Text className="text-2xl font-bold text-purple-400">
                  {tokenList.length}
                                </Text>
                <Text className="text-slate-400 text-sm">代币</Text>
                    </div>
                  </Card>
                    </div>

                  {/* 搜索框区域 */}
          <div className="mb-6">
                    <Input
                      placeholder="搜索代币名称、符号或地址..."
                      prefix={<SearchOutlined className="text-slate-400" />}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
              size="large"
                    />
                  </div>
                  
          {/* 代币列表 */}
                    {loadingTokens ? (
            <div className="flex flex-col justify-center items-center h-64">
              <Spin size="large" />
              <Text className="text-slate-300 mt-4">加载代币列表...</Text>
                      </div>
                    ) : filteredTokens.length === 0 ? (
            <div className="flex justify-center items-center h-64">
                        <Empty 
                description={<Text className="text-slate-400">暂无代币</Text>}
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                        />
                      </div>
                    ) : (
            <div className="space-y-8">
              {/* 活跃代币区域 */}
              {activeTokens.length > 0 && (
                <Card 
                  style={{ marginBottom: '20px' }}
                  className="rounded-2xl shadow-2xl border-slate-700 bg-slate-800/50"
                  title={
                    <div className="flex items-center space-x-2 text-white">
                      <ThunderboltOutlined className="text-blue-400" />
                      <span className="font-semibold">活跃交易代币</span>
                      <Badge count={activeTokens.length} color="#3b82f6" />
                      <Text className="text-slate-400 text-sm ml-2">
                        (正在 Bonding Curve 交易中)
                                  </Text>
                    </div>
                  }
                >
                  <Row gutter={[16, 16]}>
                    {activeTokens.map(renderTokenCard)}
                  </Row>
                </Card>
              )}

              {/* 已毕业代币区域 */}
              {graduatedTokens.length > 0 && (
                <Card 
                  className="rounded-2xl shadow-2xl border-yellow-500/30 bg-gradient-to-br from-yellow-900/10 to-amber-900/10"
                  title={
                    <div className="flex items-center space-x-2 text-white">
                      <TrophyOutlined className="text-yellow-400" />
                      <span className="font-semibold">已毕业代币</span>
                      <Badge count={graduatedTokens.length} color="#eab308" />
                      <Text className="text-slate-400 text-sm ml-2">
                        (已迁移至 DEX 交易)
                              </Text>
                    </div>
                  }
                >
                  <Row gutter={[16, 16]}>
                    {graduatedTokens.map(renderTokenCard)}
                  </Row>
                </Card>
              )}
            </div>
          )}
        </div>
      </Content>
    </Layout>
  );
}

export default function TradePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-400 border-t-transparent mx-auto mb-4"></div>
          <Text className="text-slate-300 block mt-4 text-lg">加载交易页面...</Text>
        </div>
      </div>
    }>
      <TradePageContent />
    </Suspense>
  );
} 