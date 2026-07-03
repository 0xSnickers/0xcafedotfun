'use client';

import { useState } from 'react';
import { Layout, Button, Dropdown } from 'antd';
import { BarChartOutlined, DollarOutlined, MenuOutlined, PlusOutlined, TrophyOutlined } from '@ant-design/icons';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import WalletInfo from './WalletInfo';

const { Header } = Layout;

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
}: UnifiedHeaderProps) {
  const pathname = usePathname();
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);

  const navigationItems = [
    { key: '/trade', label: 'Markets', href: '/trade', icon: <BarChartOutlined /> },
    { key: '/pools', label: 'Pools', href: '/pools', icon: <TrophyOutlined /> },
    { key: '/earnings', label: 'Earnings', href: '/earnings', icon: <DollarOutlined /> },
  ];

  const isActive = (href: string) => pathname.startsWith(href);
  const mobileMenuItems = navigationItems.map((item) => ({
    key: item.key,
    label: <Link href={item.href}>{item.label}</Link>,
    icon: item.icon,
  }));

  return (
    <Header className="site-header">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-6 lg:gap-10">
          <Link href="/" className="brand-lockup" aria-label="0xcafe.fun home">
            <span className="brand-mark">
              <Image src="/favicon.png" width={30} height={30} alt="" priority />
            </span>
            <span className="brand-name">0xcafe<span>.fun</span></span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
            {navigationItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`nav-link ${isActive(item.href) ? 'nav-link-active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {title && (
            <div className="hidden items-center gap-3 border-l border-white/10 pl-5 xl:flex">
              {showBackButton && <Link href={backUrl} className="text-xs text-slate-500 hover:text-emerald-300">Back</Link>}
              <div>
                <div className="text-sm font-medium text-slate-200">{title}</div>
                {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link href="/create" className="header-action-button header-create hidden shrink-0 md:inline-flex">
            <PlusOutlined />
            <span>Create</span>
          </Link>
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <WalletInfo />
          </div>
          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <WalletInfo />
          </div>
          <div className="shrink-0 lg:hidden">
            <Dropdown
              menu={{ items: mobileMenuItems, selectedKeys: navigationItems.filter((item) => isActive(item.href)).map((item) => item.key) }}
              trigger={['click']}
              placement="bottomRight"
              open={mobileMenuVisible}
              onOpenChange={setMobileMenuVisible}
            >
              <Button className="mobile-menu-button" icon={<MenuOutlined />} aria-label="Open navigation menu" />
            </Dropdown>
          </div>
        </div>
      </div>
    </Header>
  );
}
