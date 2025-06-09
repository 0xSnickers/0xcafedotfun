'use client';

import { useState } from 'react';
import { Layout, Typography, Space, Button, Menu, Dropdown } from 'antd';
import {
  HomeOutlined,
  PlusCircleOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  MenuOutlined,
  StarOutlined
} from '@ant-design/icons';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import WalletInfo from './WalletInfo';

const { Header } = Layout;
const { Title } = Typography;

interface UnifiedHeaderProps {
  title?: string;
  subtitle?: string;
  showBackButton?: boolean;
  backUrl?: string;
  icon?: React.ReactNode;
}

export default function UnifiedHeader({
  title,
  subtitle,
  showBackButton = false,
  backUrl = '/',
  icon
}: UnifiedHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);

  // 导航菜单项
  const navigationItems = [
    {
      key: '/create',
      label: '创建代币',
      icon: <PlusCircleOutlined />,
      href: '/create'
    },
    {
      key: '/trade',
      label: '交易市场',
      icon: <BarChartOutlined />,
      href: '/trade'
    }
  ];

  // 判断当前激活的菜单项
  const getCurrentKey = () => {
    if (pathname === '/') return '/';
    if (pathname.startsWith('/create')) return '/create';
    if (pathname.startsWith('/trade')) return '/trade';
    return '/';
  };

  // 移动端菜单
  const mobileMenu = (
    <Menu
      mode="vertical"
      selectedKeys={[getCurrentKey()]}
      items={navigationItems.map(item => ({
        key: item.key,
        label: (
          <Link href={item.href} className="flex items-center space-x-2">
            {item.icon}
            <span>{item.label}</span>
          </Link>
        )
      }))}
      className="border-0 bg-slate-800"
    />
  );

  return (
    <Header className="bg-slate-800/90 backdrop-blur-md border-b border-slate-700 shadow-xl px-4 lg:px-6">
      <div className="flex items-center justify-between max-w-7xl mx-auto h-16">
        {/* 左侧品牌和导航 */}
        <div className="flex items-center space-x-4 lg:space-x-8">
          {/* 品牌标识 */}
          <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
            <Image 
              src="/favicon.png" 
              width={32} 
              height={32} 
              alt="0xcafe.fun logo" 
              className="rounded"
            />
            <div>
              <Title level={3} className="!text-white !mb-0 text-xl lg:text-2xl font-bold">
                0xcafe.fun
              </Title>
            </div>
          </Link>

          {/* 桌面端导航 */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navigationItems.map(item => {
              const isActive = getCurrentKey() === item.key;
              return (
                <Link key={item.key} href={item.href}>
                  <Button
                    type={isActive ? 'primary' : 'text'}
                    icon={item.icon}
                    className={`h-10 px-4 ${
                      isActive 
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 border-0' 
                        : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>
        </div>


        {/* 右侧区域 */}
        <div className="flex items-center space-x-2">
        

          {/* 钱包信息 */}
          <WalletInfo />

          {/* 移动端菜单按钮 */}
          <div className="lg:hidden">
            <Dropdown
              overlay={mobileMenu}
              trigger={['click']}
              placement="bottomRight"
              open={mobileMenuVisible}
              onOpenChange={setMobileMenuVisible}
            >
              <Button
                icon={<MenuOutlined />}
                type="text"
                className="text-slate-300 hover:text-white hover:bg-slate-700/50"
              />
            </Dropdown>
          </div>
        </div>
      </div>
    </Header>
  );
} 