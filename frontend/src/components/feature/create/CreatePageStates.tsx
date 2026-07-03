'use client';

import type { CSSProperties } from 'react';
import { Layout } from 'antd';
import { RocketOutlined } from '@ant-design/icons';
import UnifiedHeader from '@/components/UnifiedHeader';

const { Content } = Layout;

function SkeletonBlock({
  className = '',
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={`create-skeleton-block ${className}`} style={style} />;
}

export function CreatePageSkeleton() {
  return (
    <Layout
      className="min-h-screen app-shell"
      aria-busy="true"
      aria-label="Loading token creation page"
    >
      <UnifiedHeader
        title="Create Meme Token"
        icon={<RocketOutlined className="text-white text-xl" />}
      />

      <Content className="p-4 lg:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 max-w-2xl">
            <SkeletonBlock className="h-3 w-56" />
            <SkeletonBlock className="mt-4 h-9 w-[min(100%,420px)]" />
            <SkeletonBlock className="mt-4 h-4 w-full" />
            <SkeletonBlock className="mt-2 h-4 w-4/5" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section className="create-skeleton-panel">
              <div className="create-skeleton-panel-header">
                <SkeletonBlock className="h-5 w-5 rounded-md" />
                <SkeletonBlock className="h-5 w-24" />
              </div>
              <div className="p-6">
                <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
                  {[1, 2, 3, 4].map((item) => (
                    <div key={item}>
                      <SkeletonBlock className="mb-2 h-4 w-20" />
                      <SkeletonBlock className="h-10 w-full rounded-lg" />
                    </div>
                  ))}
                </div>

                <div className="create-skeleton-inset mt-6">
                  <SkeletonBlock className="h-5 w-56" />
                  <div className="mt-4 space-y-3">
                    {[72, 62, 86, 68, 78].map((width) => (
                      <div className="flex items-center gap-3" key={width}>
                        <SkeletonBlock className="h-2 w-2 shrink-0 rounded-full" />
                        <SkeletonBlock className="h-3" style={{ width: `${width}%` }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6">
                  <SkeletonBlock className="mb-2 h-4 w-20" />
                  <SkeletonBlock className="h-28 w-full rounded-lg" />
                </div>
                <div className="mt-6">
                  <SkeletonBlock className="mb-2 h-4 w-20" />
                  <SkeletonBlock className="h-10 w-full rounded-lg" />
                  <SkeletonBlock className="mt-3 h-3 w-52" />
                </div>
              </div>
            </section>

            <section className="create-skeleton-panel">
              <div className="create-skeleton-panel-header">
                <SkeletonBlock className="h-5 w-5 rounded-md" />
                <SkeletonBlock className="h-5 w-36" />
              </div>
              <div className="p-6">
                <div className="create-skeleton-inset">
                  <SkeletonBlock className="h-5 w-36" />
                  <SkeletonBlock className="mt-3 h-3 w-full" />
                  <SkeletonBlock className="mt-2 h-3 w-4/5" />
                </div>
                <SkeletonBlock className="mt-6 h-12 w-full rounded-lg" />

                <div className="create-skeleton-inset mt-6">
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="h-4 w-4 rounded-md" />
                    <SkeletonBlock className="h-4 w-20" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {[1, 2, 3].map((item) => (
                      <div className="rounded-lg border border-white/[0.04] bg-black/10 p-3" key={item}>
                        <SkeletonBlock className="h-3 w-12" />
                        <SkeletonBlock className="mt-2 h-3 w-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="my-8 h-px bg-white/[0.07]" />

          <div className="mx-auto max-w-xl text-center">
            <div className="flex justify-center gap-4">
              <SkeletonBlock className="h-12 w-24 rounded-lg" />
              <SkeletonBlock className="h-12 w-60 rounded-lg" />
            </div>
            <div className="create-skeleton-inset mt-6">
              <SkeletonBlock className="mx-auto h-5 w-52" />
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {[72, 64, 80, 104].map((width) => (
                  <SkeletonBlock className="h-6 rounded-full" key={width} style={{ width }} />
                ))}
              </div>
              <SkeletonBlock className="mx-auto mt-4 h-3 w-4/5" />
            </div>
          </div>
        </div>
      </Content>
    </Layout>
  );
}
