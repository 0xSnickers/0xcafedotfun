'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Layout, Card, Row, Col, Statistic, Typography, Button, Spin, message } from 'antd';
import { 
  RocketOutlined, 
  FireOutlined, 
  TrophyOutlined,
  PlusCircleOutlined,
  BarChartOutlined,
  ThunderboltOutlined,
  LineChartOutlined,
  StarOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import Link from 'next/link';
import WalletInfo from '../components/WalletInfo';
import { usePlatformStats } from '../hooks/usePlatformStats';
import Image from 'next/image';
import UnifiedHeader from '../components/UnifiedHeader';

const { Content, Footer } = Layout;
const { Title, Paragraph, Text } = Typography;

export default function Home() {
  const { isConnected, chain, isConnecting } = useAccount();
  const [mounted, setMounted] = useState(false);
  
  // 获取平台统计数据 - 只有在连接成功或者不需要连接时才传递chainId
  const { stats, loading: statsLoading, error: statsError, refetch } = usePlatformStats(
    mounted ? (isConnected ? chain?.id : 1) : undefined // 默认使用主网ID进行初始化
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // 处理统计数据刷新
  const handleRefreshStats = async () => {
    try {
      await refetch();
      message.success('数据已刷新');
    } catch (error) {
      console.error('Refresh failed:', error);
      message.error('刷新失败');
    }
  };

  // 格式化数字显示
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  // 格式化ETH数量
  const formatETH = (ethString: string) => {
    const num = parseFloat(ethString);
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    } else if (num >= 1) {
      return num.toFixed(2);
    } else {
      return num.toFixed(4);
    }
  };

  // 如果还没有挂载，显示静态内容避免hydration错误
  if (!mounted) {
    return (
      <Layout className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900">
        <UnifiedHeader />
        <Content className="flex-1 px-4 py-6 lg:py-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <div className="animate-pulse">
                <div className="h-8 bg-slate-700/50 rounded-full w-64 mx-auto mb-4"></div>
                <div className="h-16 bg-slate-700/50 rounded w-96 mx-auto mb-6"></div>
                <div className="h-4 bg-slate-700/50 rounded w-full max-w-2xl mx-auto"></div>
              </div>
            </div>
          </div>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900">
      <UnifiedHeader />

      <Content className="flex-1 px-4 py-6 lg:py-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="mb-8">
              <div className="inline-flex items-center space-x-3 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-full px-6 py-3 mb-6">
                <StarOutlined className="text-yellow-400" />
                <Text className="text-slate-200 font-medium">全新 Bonding Curve 交易机制</Text>
              </div>
              
              <Title level={1} className="!text-white !mb-4 text-4xl lg:text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                创造下一个爆款 Meme 代币
              </Title>
              <Paragraph className="text-xl lg:text-2xl text-slate-300 max-w-4xl mx-auto leading-relaxed">
                通过 <span className="text-blue-400 font-semibold">Bonding Curve</span> 机制，一键创建和交易 Meme 代币<br />
                支持 <span className="text-purple-400 font-semibold">Vanity</span> 地址生成，让你的代币拥有独特个性！
              </Paragraph>
            </div>
            
            {/* <div className="flex flex-col sm:flex-row justify-center items-center space-y-3 sm:space-y-0 sm:space-x-4">
              <Link href="/create">
                <Button 
                  type="primary" 
                  size="large" 
                  icon={<PlusCircleOutlined />}
                  disabled={!isConnected && !isConnecting}
                  loading={isConnecting}
                  className="h-12 px-8 text-lg font-semibold bg-gradient-to-r from-blue-600 to-blue-500 border-0 rounded-xl hover:from-blue-500 hover:to-blue-400 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                >
                  {isConnecting ? '连接中...' : '创建代币'}
                </Button>
              </Link>
              <Link href="/trade">
                <Button 
                  size="large" 
                  icon={<BarChartOutlined />}
                  className="h-12 px-8 text-lg font-semibold bg-slate-700/50 border-slate-600 text-white hover:bg-slate-600/50 hover:border-slate-500 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                >
                  开始交易
                </Button>
              </Link>
            </div> */}
          </div>

          {/* 错误提示和刷新按钮 */}
          {statsError && (
            <div className="text-center mb-6">
              <Text className="text-red-400 mb-2 block">{statsError}</Text>
              <Button 
                icon={<ReloadOutlined />} 
                onClick={handleRefreshStats}
                type="primary"
                ghost
              >
                重新加载统计数据
              </Button>
            </div>
          )}

          {/* Stats Cards */}
          <Row gutter={[24, 24]} className="mb-12">
            <Col xs={24} sm={12} lg={6}>
              <Card className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm">
                <div className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <FireOutlined className="text-white text-xl" />
                  </div>
                  <Statistic
                    title={<span className="text-slate-300 font-medium">今日创建</span>}
                    value={statsLoading ? 0 : stats.todayCreated}
                    valueStyle={{ color: '#fb7185', fontSize: '24px', fontWeight: 'bold' }}
                    suffix={statsLoading ? <Spin size="small" /> : undefined}
                  />
                </div>
              </Card>
            </Col>
            
            <Col xs={24} sm={12} lg={6}>
              <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm">
                <div className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <ThunderboltOutlined className="text-white text-xl" />
                  </div>
                  <Statistic
                    title={<span className="text-slate-300 font-medium">ETH 交易量</span>}
                    value={statsLoading ? 0 : formatETH(stats.totalVolume)}
                    suffix={statsLoading ? <Spin size="small" /> : "ETH"}
                    valueStyle={{ color: '#10b981', fontSize: '24px', fontWeight: 'bold' }}
                  />
                </div>
              </Card>
            </Col>
            
            <Col xs={24} sm={12} lg={6}>
              <Card className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm">
                <div className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <RocketOutlined className="text-white text-xl" />
                  </div>
                  <Statistic
                    title={<span className="text-slate-300 font-medium">活跃代币</span>}
                    value={statsLoading ? 0 : stats.activeTokens}
                    valueStyle={{ color: '#3b82f6', fontSize: '24px', fontWeight: 'bold' }}
                    suffix={statsLoading ? <Spin size="small" /> : undefined}
                  />
                </div>
              </Card>
            </Col>
            
            <Col xs={24} sm={12} lg={6}>
              <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm">
                <div className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <TrophyOutlined className="text-white text-xl" />
                  </div>
                  <Statistic
                    title={<span className="text-slate-300 font-medium">毕业代币</span>}
                    value={statsLoading ? 0 : stats.graduatedTokens}
                    valueStyle={{ color: '#a855f7', fontSize: '24px', fontWeight: 'bold' }}
                    suffix={statsLoading ? <Spin size="small" /> : undefined}
                  />
                </div>
              </Card>
            </Col>
          </Row>

          {/* Features Section */}
          <Row gutter={[24, 24]} className="mb-12">
            <Col xs={24} lg={8}>
              <Card 
                hoverable
                className="h-full bg-slate-800/50 border-slate-700 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm"
              >
                <div className="text-center p-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <LineChartOutlined className="text-white text-2xl" />
                  </div>
                  <Title level={4} className="!text-white mb-4">
                    Bonding Curve 定价
                  </Title>
                  <Paragraph className="text-slate-300 leading-relaxed">
                    采用数学公式确保公平定价，价格随购买量动态上升，
                    提供早期价格发现机制和防止操控。
                  </Paragraph>
                </div>
              </Card>
            </Col>
            
            <Col xs={24} lg={8}>
              <Card 
                hoverable
                className="h-full bg-slate-800/50 border-slate-700 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm"
              >
                <div className="text-center p-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <StarOutlined className="text-white text-2xl" />
                  </div>
                  <Title level={4} className="!text-white mb-4">
                    Vanity 地址生成
                  </Title>
                  <Paragraph className="text-slate-300 leading-relaxed">
                    生成以 &ldquo;cafe&rdquo; 开头的个性化代币地址，
                    让你的代币更具辨识度和品牌价值。
                  </Paragraph>
                </div>
              </Card>
            </Col>
            
            <Col xs={24} lg={8}>
              <Card 
                hoverable
                className="h-full bg-slate-800/50 border-slate-700 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm"
              >
                <div className="text-center p-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <TrophyOutlined className="text-white text-2xl" />
                  </div>
                  <Title level={4} className="!text-white mb-4">
                    自动毕业机制
                  </Title>
                  <Paragraph className="text-slate-300 leading-relaxed">
                    达到市值门槛后自动转移到 DEX 流动性池，
                    永久锁定流动性，防止 Rug Pull 风险。
                  </Paragraph>
                </div>
              </Card>
            </Col>
          </Row>
        </div>
      </Content>

      <Footer className="bg-slate-900/80 backdrop-blur-md border-t border-slate-700 text-center py-6">
        <div className="max-w-7xl mx-auto px-4">
          <Text className="text-slate-400">
            0xcafe.fun © 2025 - 去中心化 Meme 代币创造平台
          </Text>
          <div className="mt-2">
            <Text className="text-slate-500 text-sm">
              由 Bonding Curve 技术驱动 • 安全 • 透明 • 去中心化
            </Text>
          </div>
        </div>
      </Footer>
    </Layout>
  );
}
