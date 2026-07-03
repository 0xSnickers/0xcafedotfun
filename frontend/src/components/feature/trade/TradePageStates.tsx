import { Button, Card, ConfigProvider, Layout, Row, Col, Typography } from 'antd';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export function TradePageBootLoading({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-400 border-t-transparent mx-auto mb-4" />
        <Text className="text-slate-300 block mt-4 text-lg">{label}</Text>
      </div>
    </div>
  );
}

export function TradePageSkeleton() {
  return (
    <ConfigProvider
      theme={{
        components: {
          Layout: {
            bodyBg: 'transparent',
            headerBg: 'transparent',
            triggerBg: 'transparent',
          },
        },
      }}
    >
      <Layout className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900">
        <Header className="bg-slate-800/90 backdrop-blur-md border-b border-slate-700 shadow-xl px-4 lg:px-6">
          <div className="flex items-center justify-between max-w-7xl mx-auto h-16">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-slate-700 rounded animate-pulse" />
              <div className="w-32 h-6 bg-slate-700 rounded animate-pulse" />
            </div>
            <div className="w-32 h-8 bg-slate-700 rounded animate-pulse" />
          </div>
        </Header>
        <Content className="p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            <Row gutter={[24, 24]}>
              <Col xs={24} lg={16}>
                <Card className="rounded-2xl border-slate-700 bg-slate-800/50 h-full">
                  <div className="space-y-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 bg-slate-700 rounded-full animate-pulse" />
                      <div className="space-y-2">
                        <div className="w-48 h-6 bg-slate-700 rounded animate-pulse" />
                        <div className="w-32 h-4 bg-slate-700 rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[1, 2, 3, 4].map((item) => (
                        <div key={item} className="bg-slate-700/30 p-4 rounded-xl">
                          <div className="w-16 h-4 bg-slate-700 rounded animate-pulse mb-2" />
                          <div className="w-20 h-6 bg-slate-700 rounded animate-pulse" />
                        </div>
                      ))}
                    </div>
                    <div className="bg-slate-700/30 p-4 rounded-xl">
                      <div className="w-24 h-4 bg-slate-700 rounded animate-pulse mb-4" />
                      <div className="w-full h-2 bg-slate-700 rounded animate-pulse" />
                    </div>
                  </div>
                </Card>
              </Col>
              <Col xs={24} lg={8}>
                <Card className="rounded-2xl border-slate-700 bg-slate-800/50">
                  <div className="space-y-4">
                    <div className="w-32 h-6 bg-slate-700 rounded animate-pulse" />
                    <div className="w-full h-12 bg-slate-700 rounded animate-pulse" />
                    <div className="w-full h-12 bg-slate-700 rounded animate-pulse" />
                    <div className="w-full h-10 bg-slate-700 rounded animate-pulse" />
                  </div>
                </Card>
              </Col>
            </Row>
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}

export function TradePageInvalidState({ onBack }: { onBack: () => void }) {
  return (
    <Layout className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-slate-900">
      <Content className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Title level={3} className="text-white">Invalid token address</Title>
          <Button type="primary" onClick={onBack}>
            Back to markets
          </Button>
        </div>
      </Content>
    </Layout>
  );
}
