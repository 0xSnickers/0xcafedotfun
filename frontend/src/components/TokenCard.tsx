'use client';

import { useState } from 'react';
import { Card, Typography, Tag, Avatar, Button, Tooltip, Progress } from 'antd';
import {
  FireOutlined, 
  TrophyOutlined, 
  SwapOutlined,
  LineChartOutlined,
  UserOutlined,
  DollarOutlined
} from '@ant-design/icons';
import Link from 'next/link';
import { useBondingCurve, bondingCurveUtils } from '../hooks/useBondingCurve';

const { Title, Text, Paragraph } = Typography;

interface TokenCardProps {
  tokenAddress: string;
  name: string;
  symbol: string;
  description: string;
  image?: string;
  creator: string;
  createdAt?: string;
  className?: string;
}

export default function TokenCard({
  tokenAddress,
  name,
  symbol,
  description,
  image,
  creator,
  createdAt,
  className = ''
}: TokenCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  // 获取代币的Bonding Curve信息
  const { curveParams, isCurveParamsLoading, curveParamsError } = useBondingCurve(tokenAddress);

  // 检查是否有有效的curve数据
  const hasValidCurveData = curveParams && !curveParamsError;

  // 计算进度 (当前供应量 / 目标供应量)
  const getProgress = () => {
    if (!hasValidCurveData || !curveParams.currentSupply || !curveParams.targetSupply) return 0;
    
    try {
      const currentSupply = curveParams.currentSupply;
      const targetSupply = curveParams.targetSupply;
      
      if (targetSupply === BigInt(0)) return 0;
      
      const progress = Number((currentSupply * BigInt(100)) / targetSupply);
      return Math.min(progress, 100);
    } catch (error) {
      console.warn('Error calculating progress:', error);
      return 0;
    }
  };

  // 格式化价格显示
  const getCurrentPrice = () => {
    if (!hasValidCurveData || !curveParams.currentPrice) return '0.000001';
    
    try {
      const currentPrice = curveParams.currentPrice;
      
      if (currentPrice === BigInt(0)) return '0.000001';
      return bondingCurveUtils.formatETH(currentPrice);
    } catch (error) {
      console.warn('Error formatting current price:', error);
      return '0.000001';
    }
  };

  // 格式化市值（当前供应量 * 当前价格）
  const getMarketCap = () => {
    if (!hasValidCurveData || !curveParams.currentSupply || !curveParams.currentPrice) return '0';
    
    try {
      const currentSupply = curveParams.currentSupply;
      const currentPrice = curveParams.currentPrice;
      
      const marketCap = (currentSupply * currentPrice) / BigInt('1000000000000000000');
      return bondingCurveUtils.formatETH(marketCap);
    } catch (error) {
      console.warn('Error calculating market cap:', error);
      return '0';
    }
  };

  // 格式化总供应量
  const getTotalSupply = () => {
    if (!hasValidCurveData || !curveParams.currentSupply) return '0';
    
    try {
      const currentSupply = curveParams.currentSupply;
      
      return bondingCurveUtils.formatToken(currentSupply);
    } catch (error) {
      console.warn('Error formatting total supply:', error);
      return '0';
    }
  };

  // 获取状态标签
  const getStatusTag = () => {
    if (!hasValidCurveData) {
      return <Tag color="gray">数据加载中</Tag>;
    }
    
    const progress = getProgress();
    
    if (progress >= 100) {
      return <Tag color="gold" icon={<TrophyOutlined />}>已毕业</Tag>;
    } else if (progress >= 80) {
      return <Tag color="orange" icon={<FireOutlined />}>即将毕业</Tag>;
    } else if (progress >= 50) {
      return <Tag color="blue" icon={<LineChartOutlined />}>活跃交易</Tag>;
    } else {
      return <Tag color="green">新项目</Tag>;
    }
  };

  // 格式化地址显示
  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // 如果发生严重错误，显示基本信息
  if (curveParamsError) {
  return (
    <Card
      hoverable
        className={`w-full max-w-sm transition-all duration-300 ${className}`}
      cover={
          image ? (
            <div className="h-48 overflow-hidden">
              <img
                alt={name}
                src={image}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default-token.png';
                }}
              />
            </div>
          ) : (
            <div className="h-48 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Avatar size={64} icon={<UserOutlined />} className="bg-white/20" />
            </div>
          )
        }
        actions={[
          <Link href={`/trade/${tokenAddress}`} key="trade">
            <Button 
              type="primary" 
              icon={<SwapOutlined />} 
              block
              size="large"
            >
              交易
            </Button>
          </Link>
        ]}
      >
        <Card.Meta
          title={
            <div className="flex justify-between items-start">
              <div>
                <Title level={4} className="!mb-1">
                  {name}
                </Title>
                <Text type="secondary" className="text-sm">
                  ${symbol}
                </Text>
              </div>
              <Tag color="gray">数据加载失败</Tag>
            </div>
          }
          description={
            <div className="space-y-3">
              <Paragraph 
                ellipsis={{ rows: 2, expandable: true, symbol: '更多' }}
                className="!mb-2 text-gray-600"
              >
                {description}
              </Paragraph>
              
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <Text type="secondary" className="text-sm">
                  暂时无法加载代币数据
                </Text>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <div>
                  <Text className="text-xs text-gray-500">创作者</Text>
                  <br />
                  <Tooltip title={creator}>
                    <Text className="text-sm font-mono">
                      {formatAddress(creator)}
                    </Text>
                  </Tooltip>
                </div>
                
                {createdAt && (
                  <div className="text-right">
                    <Text className="text-xs text-gray-500">创建时间</Text>
                    <br />
                    <Text className="text-sm">
                      {new Date(createdAt).toLocaleDateString()}
                    </Text>
                  </div>
                )}
              </div>
            </div>
          }
        />
      </Card>
    );
  }

  return (
    <Card
      hoverable
      loading={isCurveParamsLoading}
      className={`w-full max-w-sm transition-all duration-300 ${
        isHovered ? 'shadow-xl scale-105' : 'shadow-lg'
      } ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      cover={
        image ? (
          <div className="h-48 overflow-hidden">
            <img
              alt={name}
              src={image}
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/default-token.png';
              }}
            />
          </div>
        ) : (
          <div className="h-48 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Avatar size={64} icon={<UserOutlined />} className="bg-white/20" />
        </div>
        )
      }
      actions={[
        <Link href={`/trade/${tokenAddress}`} key="trade">
        <Button
            type="primary" 
          icon={<SwapOutlined />}
            block
            size="large"
        >
          交易
          </Button>
        </Link>
      ]}
    >
      <Card.Meta
        title={
          <div className="flex justify-between items-start">
            <div>
              <Title level={4} className="!mb-1">
                {name}
              </Title>
              <Text type="secondary" className="text-sm">
                ${symbol}
              </Text>
            </div>
            {getStatusTag()}
          </div>
        }
        description={
          <div className="space-y-3">
        {/* 描述 */}
        <Paragraph 
              ellipsis={{ rows: 2, expandable: true, symbol: '更多' }}
              className="!mb-2 text-gray-600"
        >
              {description}
        </Paragraph>

            {/* 价格信息 */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <Text className="text-sm text-gray-500">当前价格</Text>
                <Text strong className="text-green-600">
                  <Text className="text-white text-lg font-semibold">
                    {getCurrentPrice()} ETH
                  </Text>
                </Text>
              </div>
              
              <div className="flex justify-between items-center">
                <Text className="text-sm text-gray-500">市值</Text>
                <Text strong>
                  <Text className="text-white text-sm">
                    {getMarketCap()} ETH
                  </Text>
                </Text>
              </div>
              
              <div className="flex justify-between items-center">
                <Text className="text-sm text-gray-500">流通供应量</Text>
                <Text className="text-sm">
                  {getTotalSupply()}
                </Text>
              </div>
            </div>

            {/* 进度条 */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <Text className="text-sm text-gray-500">毕业进度</Text>
                <Text className="text-sm font-medium">
                  {getProgress().toFixed(1)}%
                </Text>
              </div>
              <Progress 
                percent={getProgress()} 
                showInfo={false}
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
                trailColor="#f0f0f0"
              />
            </div>

            {/* 创作者信息 */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <div>
                <Text className="text-xs text-gray-500">创作者</Text>
                <br />
                <Tooltip title={creator}>
                  <Text className="text-sm font-mono">
                    {formatAddress(creator)}
            </Text>
          </Tooltip>
              </div>

              {createdAt && (
                <div className="text-right">
                  <Text className="text-xs text-gray-500">创建时间</Text>
                  <br />
                  <Text className="text-sm">
                    {new Date(createdAt).toLocaleDateString()}
          </Text>
                </div>
              )}
            </div>

            {/* 快速操作 */}
            <div className="flex space-x-2 pt-2">
              <Button 
                size="small" 
                type="text" 
                icon={<DollarOutlined />}
                className="flex-1"
              >
                买入
              </Button>
              <Button 
                size="small" 
                type="text" 
                icon={<LineChartOutlined />}
                className="flex-1"
              >
                图表
              </Button>
            </div>
      </div>
        }
      />
    </Card>
  );
} 