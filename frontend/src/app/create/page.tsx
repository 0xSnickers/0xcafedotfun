'use client';

import { useState, useEffect } from 'react';
import { keccak256, toUtf8Bytes, parseEther, parseUnits } from "ethers";
import {
  Layout,
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  Typography,
  Space,
  Row,
  Col,
  Divider,
  Alert,
  Tag,
  App
} from 'antd';
import {
  ArrowLeftOutlined,
  RocketOutlined,
  StarOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  DollarCircleOutlined,
  FireOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAccount, useBalance, useWaitForTransactionReceipt } from 'wagmi';
import { writeContract, readContract } from '@wagmi/core';
import { config } from '../../config/wagmi';
import { formatAddress } from '../../hooks/useContracts';
import { getContractAddresses } from '../../config/contracts';
import { MEME_FACTORY_ABI, MEME_PLATFORM_ABI } from '../../config/abis';
import { CONTRACT_CONSTANTS } from '../../config/contracts';
import { generateVanityAddress as generateVanityAddressUtil } from '../../utils/vanityAddress';
import UnifiedHeader from '../../components/UnifiedHeader';

const { Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

interface TokenForm {
  name: string;
  symbol: string;
  decimals: number;
  tokenImage?: string;
  description: string;
}

interface VanityResult {
  address: string;
  salt: string;
  attempts: number;
}

// 统一的Loading组件
const UnifiedLoading = ({ text, subText }: { text: string; subText?: string }) => (
  <div className="flex flex-col justify-center items-center">
    <div className="relative mb-4">
      <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
      <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-b-purple-400 rounded-full animate-spin animation-delay-200"></div>
    </div>
    <Text className="text-white text-lg font-medium">{text}</Text>
    {subText && <Text className="text-slate-400 text-sm mt-1">{subText}</Text>}
  </div>
);

// 骨架屏组件
const CreatePageSkeleton = () => (
  <Layout className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
    <UnifiedHeader 
      title="创建 MEME 代币" 
      icon={<RocketOutlined className="text-white text-xl" />}
    />

    <Content className="p-6">
      <div className="max-w-6xl mx-auto">
        <Row gutter={[24, 24]}>
          {/* 基础信息骨架 */}
          <Col xs={24} lg={14}>
            <Card 
              className="h-full bg-slate-800/50 border-slate-700"
              styles={{ header: { backgroundColor: 'rgba(30, 41, 59, 0.5)', borderBottom: '1px solid rgb(51, 65, 85)' } }}
              title={
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-slate-600 rounded mr-2 animate-pulse"></div>
                  <div className="w-24 h-6 bg-slate-600 rounded animate-pulse"></div>
                </div>
              }
            >
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12}>
                  <div className="space-y-2">
                    <div className="w-20 h-4 bg-slate-600 rounded animate-pulse"></div>
                    <div className="w-full h-10 bg-slate-700 rounded animate-pulse"></div>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div className="space-y-2">
                    <div className="w-20 h-4 bg-slate-600 rounded animate-pulse"></div>
                    <div className="w-full h-10 bg-slate-700 rounded animate-pulse"></div>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div className="space-y-2">
                    <div className="w-20 h-4 bg-slate-600 rounded animate-pulse"></div>
                    <div className="w-full h-10 bg-slate-700 rounded animate-pulse"></div>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div className="space-y-2">
                    <div className="w-20 h-4 bg-slate-600 rounded animate-pulse"></div>
                    <div className="w-full h-10 bg-slate-700 rounded animate-pulse"></div>
                  </div>
                </Col>
              </Row>
              
              {/* Alert骨架 */}
              <div className="mt-4 p-4 bg-slate-700/30 rounded border border-slate-600">
                <div className="w-48 h-5 bg-slate-600 rounded mb-3 animate-pulse"></div>
                <div className="space-y-2">
                  <div className="w-full h-4 bg-slate-600 rounded animate-pulse"></div>
                  <div className="w-3/4 h-4 bg-slate-600 rounded animate-pulse"></div>
                  <div className="w-5/6 h-4 bg-slate-600 rounded animate-pulse"></div>
                </div>
              </div>
              
              {/* 描述区域骨架 */}
              <div className="mt-4 space-y-2">
                <div className="w-20 h-4 bg-slate-600 rounded animate-pulse"></div>
                <div className="w-full h-24 bg-slate-700 rounded animate-pulse"></div>
              </div>
              
              {/* 图标区域骨架 */}
              <div className="mt-4 space-y-2">
                <div className="w-20 h-4 bg-slate-600 rounded animate-pulse"></div>
                <div className="w-full h-10 bg-slate-700 rounded animate-pulse"></div>
                <div className="w-48 h-3 bg-slate-600 rounded animate-pulse mt-1"></div>
              </div>
            </Card>
          </Col>

          {/* Vanity地址骨架 */}
          <Col xs={24} lg={10}>
            <Card 
              className="h-full bg-slate-800/50 border-slate-700"
              styles={{ header: { backgroundColor: 'rgba(30, 41, 59, 0.5)', borderBottom: '1px solid rgb(51, 65, 85)' } }}
              title={
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-slate-600 rounded mr-2 animate-pulse"></div>
                  <div className="w-32 h-6 bg-slate-600 rounded animate-pulse"></div>
                </div>
              }
            >
              {/* Alert骨架 */}
              <div className="p-4 bg-slate-700/30 rounded border border-slate-600 mb-4">
                <div className="w-32 h-5 bg-slate-600 rounded mb-2 animate-pulse"></div>
                <div className="w-full h-4 bg-slate-600 rounded animate-pulse"></div>
              </div>
              
              {/* 按钮骨架 */}
              <div className="w-full h-12 bg-slate-700 rounded animate-pulse mb-4"></div>
              
              {/* 合约信息骨架 */}
              <div className="p-4 bg-slate-700/30 rounded border border-slate-600">
                <div className="flex items-center mb-3">
                  <div className="w-4 h-4 bg-slate-600 rounded mr-2 animate-pulse"></div>
                  <div className="w-20 h-4 bg-slate-600 rounded animate-pulse"></div>
                </div>
                <div className="space-y-2">
                  <div className="p-2 bg-slate-800/30 rounded">
                    <div className="w-12 h-3 bg-slate-600 rounded mb-1 animate-pulse"></div>
                    <div className="w-full h-3 bg-slate-600 rounded animate-pulse"></div>
                  </div>
                  <div className="p-2 bg-slate-800/30 rounded">
                    <div className="w-12 h-3 bg-slate-600 rounded mb-1 animate-pulse"></div>
                    <div className="w-full h-3 bg-slate-600 rounded animate-pulse"></div>
                  </div>
                  <div className="p-2 bg-slate-800/30 rounded">
                    <div className="w-12 h-3 bg-slate-600 rounded mb-1 animate-pulse"></div>
                    <div className="w-16 h-3 bg-slate-600 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* 分割线骨架 */}
        <div className="my-8 h-px bg-slate-700"></div>

        {/* 按钮区域骨架 */}
        <div className="text-center">
          <div className="flex justify-center gap-4 mb-6">
            <div className="w-24 h-12 bg-slate-700 rounded animate-pulse"></div>
            <div className="w-48 h-12 bg-slate-700 rounded animate-pulse"></div>
          </div>
          
          {/* 费用信息骨架 */}
          <div className="max-w-md mx-auto p-4 bg-slate-800/30 rounded-lg border border-slate-700">
            <div className="w-48 h-5 bg-slate-600 rounded mx-auto mb-3 animate-pulse"></div>
            <div className="flex justify-center gap-2 mb-3">
              <div className="w-16 h-6 bg-slate-600 rounded animate-pulse"></div>
              <div className="w-16 h-6 bg-slate-600 rounded animate-pulse"></div>
              <div className="w-16 h-6 bg-slate-600 rounded animate-pulse"></div>
              <div className="w-20 h-6 bg-slate-600 rounded animate-pulse"></div>
            </div>
            <div className="w-64 h-4 bg-slate-600 rounded mx-auto animate-pulse"></div>
          </div>
        </div>
      </div>
    </Content>
  </Layout>
);

// 内部组件，使用 App context
const CreateTokenPageContent = () => {
  const router = useRouter();
  const { isConnected, address, chain } = useAccount();
  const [form] = Form.useForm<TokenForm>();
  const { message } = App.useApp();

  const [mounted, setMounted] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isGeneratingVanity, setIsGeneratingVanity] = useState(false);
  const [vanityResult, setVanityResult] = useState<VanityResult | null>(null);
  const [creationFee] = useState<string>('0.001');
  const [txHash, setTxHash] = useState<string>('');
  const [useVanity, setUseVanity] = useState(false);
  console.log('process.env.NEXT_PUBLIC_NETWORK_RPC->', process.env.NEXT_PUBLIC_NETWORK_RPC);
  // 确保组件已挂载，防止 hydration 错误
  useEffect(() => {
    setMounted(true);
  }, []);

  // 改进的全局错误处理 - 过滤chrome扩展错误
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      // 更全面的chrome扩展错误过滤
      const errorMsg = event.error?.message || event.message || '';
      const errorStack = event.error?.stack || '';
      const filename = event.filename || '';
      
      if (
        errorMsg.includes('chrome.runtime.sendMessage') || 
        errorMsg.includes('Extension ID') ||
        errorMsg.includes('runtime.sendMessage') ||
        errorStack.includes('inpage.js') ||
        filename.includes('inpage.js') ||
        errorMsg.includes('chrome-extension://') ||
        errorStack.includes('chrome-extension://') ||
        errorMsg.includes('Cannot access contents of') ||
        errorMsg.includes('extensions::') ||
        filename.includes('extension')
      ) {
        console.warn('[Chrome Extension Error - Filtered]:', errorMsg);
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason?.message || event.reason || '';
      const stack = event.reason?.stack || '';
      
      if (
        reason.includes('chrome.runtime.sendMessage') || 
        reason.includes('Extension ID') ||
        reason.includes('runtime.sendMessage') ||
        stack.includes('inpage.js') ||
        reason.includes('chrome-extension://') ||
        stack.includes('chrome-extension://') ||
        reason.includes('Cannot access contents of') ||
        reason.includes('extensions::')
      ) {
        console.warn('[Chrome Extension Promise Rejection - Filtered]:', reason);
        event.preventDefault();
        return false;
      }
    };

    window.addEventListener('error', handleGlobalError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);

    return () => {
      window.removeEventListener('error', handleGlobalError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection, true);
    };
  }, []);

  // 获取合约地址 - 只有在客户端挂载后才获取
  const contractAddresses = mounted ? getContractAddresses(chain?.id) : { MEME_PLATFORM: null, MEME_FACTORY: null };

  // 获取用户余额 - 只有在挂载后才获取
  const { data: balance } = useBalance({
    address: mounted ? address : undefined,
  });

  // 监听交易状态
  const { data: txReceipt, isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}`,
  });

  // 监听交易状态和成功事件
  useEffect(() => {
    if (txLoading && txHash) {
      console.log('⏳ 交易已提交，等待确认...', txHash);
    }
  }, [txLoading, txHash]);

  // 监听交易成功
  useEffect(() => {
    if (txSuccess && txReceipt) {
      console.log('✅ 交易确认成功！', txReceipt);
      setIsCreating(false);
      
      // 从交易回执中提取代币地址
      if (txReceipt.logs && txReceipt.logs.length > 0) {
        console.log('📄 分析交易日志...', txReceipt.logs);
        
        // 查找 MemeTokenCreated 事件
        // 通常代币地址在事件的第一个参数中
        const tokenCreatedLog = txReceipt.logs.find(log => 
          log.topics && log.topics.length >= 2 // 至少有 event signature 和 indexed 参数
        );
        
        if (tokenCreatedLog) {
          // 尝试从不同位置提取代币地址
          let tokenAddress = '';
          
          // 方法1: 从log的address字段（代币合约地址）
          if (tokenCreatedLog.address && tokenCreatedLog.address !== contractAddresses.MEME_PLATFORM) {
            tokenAddress = tokenCreatedLog.address;
            console.log('🎯 从log.address提取到代币地址:', tokenAddress);
          }
          // 方法2: 从topics中提取（indexed参数）
          else if (tokenCreatedLog.topics && tokenCreatedLog.topics.length > 1) {
            // 第二个topic通常是代币地址（indexed参数）
            const addressTopic = tokenCreatedLog.topics[1];
            if (addressTopic && addressTopic.length === 66) { // 0x + 64 characters
              tokenAddress = '0x' + addressTopic.slice(-40); // 取最后40个字符
              console.log('🎯 从topics提取到代币地址:', tokenAddress);
            }
          }
          
          if (tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000') {
            setTxHash('');
            // 关闭之前的loading消息
            message.destroy('creating-token');
            message.success({
              content: '代币创建成功！正在跳转到交易页面...',
              duration: 3
            });
            
            console.log('🚀 准备跳转到代币交易页面:', tokenAddress);
            
            // 跳转到对应代币的交易页面
            setTimeout(() => {
              router.push(`/trade/${tokenAddress}`);
            }, 1500);
            return;
          }
        }
        
        console.log('⚠️ 无法从交易日志中提取代币地址，查看所有日志:');
        txReceipt.logs.forEach((log, index) => {
          console.log(`Log ${index}:`, {
            address: log.address,
            topics: log.topics,
            data: log.data
          });
        });
      }
      
             // 如果无法提取代币地址，仍然显示成功信息并跳转到trade首页
       setTxHash('');
       // 关闭之前的loading消息
       message.destroy('creating-token');
       message.success({
         content: '代币创建成功！正在跳转到交易页面...',
         duration: 3
       });
       
       setTimeout(() => {
         router.push('/trade');
       }, 1500);
    }
  }, [txSuccess, txReceipt, router, message, contractAddresses.MEME_PLATFORM]);

  // 监听交易失败或超时
  useEffect(() => {
    if (txHash && !txLoading && !txSuccess) {
      // 等待一段时间后检查交易是否确实失败
      const timer = setTimeout(() => {
        if (!txSuccess && txHash) {
          console.log('⚠️ 交易可能失败或超时:', txHash);
          
          // 关闭loading消息
          message.destroy('creating-token');
          message.error({
            content: '交易确认超时，请检查交易状态或重试',
            duration: 5
          });
          
          setIsCreating(false);
          setTxHash('');
        }
      }, 60000); // 60秒超时
      
      return () => clearTimeout(timer);
    }
  }, [txHash, txLoading, txSuccess, message]);

  const generateVanityAddress = async () => {
    const values = form.getFieldsValue();
    
    if (!values.name || !values.symbol || !values.description) {
      message.warning('请先填写代币基本信息');
      return;
    }
    
    setIsGeneratingVanity(true);
    try {
      const factoryAddress = contractAddresses.MEME_FACTORY;
      
      if (!factoryAddress) {
        throw new Error('未找到工厂合约地址');
      }
      
      console.log(`🎯 开始寻找以 "cafe" 开头的地址...`);
      console.log(`📋 获取合约字节码...`);

      // 通过工厂合约获取字节码
      const bytecode = await readContract(config, {
        address: factoryAddress as `0x${string}`,
        abi: MEME_FACTORY_ABI,
        functionName: 'getBytecode',
        args: [
          values.name,
          values.symbol,
          values.decimals || 18,
          parseUnits(CONTRACT_CONSTANTS.DEFAULT_TARGET_SUPPLY, values.decimals || 18),
          factoryAddress, // deployer 是 MemeFactory 地址，因为实际部署时使用 address(this)
          values.tokenImage || '',
          values.description
        ]
      });

      console.log(`✅ 字节码获取成功，长度: ${(bytecode as string).length} 字符`);
      console.log(`⚡ 开始本地计算地址...`);
      
      // 使用优化的 vanity 地址生成工具
      const result = await generateVanityAddressUtil(
        factoryAddress,
        keccak256(bytecode as string),
        {
          prefix: "0xcafe",
          maxAttempts: 1000000,
          batchSize: 10000,
          onProgress: (attempts: number, rate: number) => {
            console.log(`⏱️  已尝试 ${attempts.toLocaleString()} 次，速度: ${Math.round(rate).toLocaleString()} 次/秒`);
          }
        }
      );
      
      if (result) {
        const vanityResult = {
          address: result.address.toLowerCase(),
          salt: result.salt,
          attempts: result.attempts
        };
        
        setVanityResult(vanityResult);
        setUseVanity(true);
        
        console.log(`🎉 成功生成 vanity 地址！`);
        console.log(`⚡ 总计用时: ${(result.timeElapsed / 1000).toFixed(1)} 秒`);
        console.log(`🚀 平均速度: ${Math.round(result.attempts / (result.timeElapsed / 1000)).toLocaleString()} 次/秒`);
        
        message.success({
          content: `生成成功！用时 ${(result.timeElapsed / 1000).toFixed(1)} 秒，尝试 ${result.attempts.toLocaleString()} 次`,
          duration: 5
        });
      } else {
        message.warning(`在 1,000,000 次尝试后未找到匹配地址，请重试`);
      }
    } catch (error: unknown) {
      console.error('生成 vanity 地址失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      message.error('生成失败: ' + errorMessage);
    } finally {
      setIsGeneratingVanity(false);
    }
  };

  const onFinish = async (values: TokenForm) => {
    if (!mounted || !isConnected) {
      message.error('请先连接钱包');
      return;
    }

    if (!contractAddresses.MEME_PLATFORM) {
      message.error('合约地址未配置');
      return;
    }

    setIsCreating(true);
    try {
      // 简单的客户端验证
      if (!values.name?.trim()) {
        message.error('请输入代币名称');
        setIsCreating(false);
        return;
      }
      
      if (!values.symbol?.trim()) {
        message.error('请输入代币符号');
        setIsCreating(false);
        return;
      }
      
      if (!values.description?.trim()) {
        message.error('请输入代币描述');
        setIsCreating(false);
        return;
      }
      
      if (values.decimals < 0 || values.decimals > 18) {
        message.error('小数位数必须在0-18之间');
        setIsCreating(false);
        return;
      }
      if (!vanityResult || !vanityResult.salt) {
        message.error('请生成 cafe 开头地址');
        setIsCreating(false);
        return;
      }
      // 生成 salt
      const salt = vanityResult.salt;
        console.log('使用 vanity 地址创建代币，预期地址:', vanityResult.address);


      // 使用 Bonding Curve 模式创建（通过 MemePlatform）
      const createArgs = [
        values.name,
        values.symbol,
        values.decimals,
        values.tokenImage || '',
        values.description,
        salt,
        parseUnits(CONTRACT_CONSTANTS.DEFAULT_TARGET_SUPPLY, values.decimals), // targetSupply
        parseUnits(CONTRACT_CONSTANTS.DEFAULT_TARGET_PRICE, CONTRACT_CONSTANTS.ETH_DECIMALS), // targetPrice (ETH)
        parseUnits(CONTRACT_CONSTANTS.DEFAULT_INITIAL_PRICE, CONTRACT_CONSTANTS.ETH_DECIMALS) // initialPrice (ETH)
      ];
      console.log('🚀 创建代币参数:', createArgs);
      const hash = await writeContract(config, {
        address: contractAddresses.MEME_PLATFORM as `0x${string}`,
        abi: MEME_PLATFORM_ABI,
        functionName: 'createMemeToken',
        args: createArgs,
        value: parseEther(creationFee),
      });

      console.log('📝 交易已提交:', hash);
      setTxHash(hash);
      message.info({
        content: '交易已提交，等待区块链确认...',
        duration: 0, // 不自动消失
        key: 'creating-token'
      });

    } catch (error: unknown) {
      console.error('创建代币失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      
      // 关闭loading消息
      message.destroy('creating-token');
      
      // 检查是否是用户取消交易
      if (errorMessage.includes('User rejected') || errorMessage.includes('user rejected')) {
        message.warning('交易已取消');
      } else {
        message.error({
          content: '创建失败: ' + errorMessage,
          duration: 5
        });
      }
      
      setIsCreating(false);
      setTxHash('');
    }
  };

  // 如果还没有挂载，显示加载状态
  if (!mounted) {
    return (
      <CreatePageSkeleton />
    );
  }

  return (
    <Layout className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <UnifiedHeader 
        title="创建 MEME 代币" 
        icon={<RocketOutlined className="text-white text-xl" />}
      />

      <Content className="p-6">
        <div className="max-w-6xl mx-auto">

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            initialValues={{
              decimals: 18,
            }}
          >
            <Row gutter={[24, 24]}>
              {/* 基础信息 */}
              <Col xs={24} lg={14}>
                <Card
                  title={
                    <Space>
                      <FireOutlined className="text-orange-400" />
                      <span className="text-white">基础信息</span>
                    </Space>
                  }
                  className="h-full bg-slate-800/50 border-slate-700"
                  styles={{ header: { backgroundColor: 'rgba(30, 41, 59, 0.5)', borderBottom: '1px solid rgb(51, 65, 85)' } }}
                >
                  <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        label={<span className="text-slate-200">代币名称</span>}
                        name="name"
                        rules={[{ required: true, message: '请输入代币名称' }]}
                      >
                        <Input
                          placeholder="例如：Pepe Meme Token"
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                        />
                      </Form.Item>
                    </Col>

                    <Col xs={24} sm={12}>
                      <Form.Item
                        label={<span className="text-slate-200">代币符号</span>}
                        name="symbol"
                        rules={[{ required: true, message: '请输入代币符号' }]}
                      >
                        <Input
                          placeholder="例如：PEPE"
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                        />
                      </Form.Item>
                    </Col>

                    <Col xs={24} sm={12}>
                      <Form.Item
                        label={<span className="text-slate-200">小数位数</span>}
                        name="decimals"
                        rules={[{ required: true, message: '请输入小数位数' }]}
                      >
                        <InputNumber
                          min={0}
                          max={18}
                          className="w-full bg-slate-700/50 border-slate-600 text-white"
                        />
                      </Form.Item>
                    </Col>

                    <Col xs={24} sm={12}>
                      <div>
                        <Text className="text-slate-200">目标供应量</Text>
                        <div className="mt-2">
                          <Input
                            value={`${parseInt(CONTRACT_CONSTANTS.DEFAULT_TARGET_SUPPLY).toLocaleString()} 代币`}
                            readOnly
                            disabled
                            className="bg-slate-700/30 border-slate-600 text-slate-300"
                          />
                        </div>
                      </div>
                    </Col>
                  </Row>

                  <Alert
                    message={
                      <span className="text-blue-300 font-medium">
                        <TrophyOutlined className="mr-2" />
                        Bonding Curve 参数 & 毕业机制
                      </span>
                    }
                    description={
                      <div className="space-y-2 text-slate-200">
                        <div className="flex items-center">
                          <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                          初始价格: <span className="font-mono ml-1">{CONTRACT_CONSTANTS.DEFAULT_INITIAL_PRICE} ETH</span>
                        </div>
                        <div className="flex items-center">
                          <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                          目标价格: <span className="font-mono ml-1">{CONTRACT_CONSTANTS.DEFAULT_TARGET_PRICE} ETH</span>
                        </div>
                        <div className="flex items-center">
                          <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
                          目标供应量: <span className="font-mono ml-1">{parseInt(CONTRACT_CONSTANTS.DEFAULT_TARGET_SUPPLY).toLocaleString()} 代币</span>
                          <span className="text-xs text-slate-400 ml-2">(仅用于价格计算)</span>
                        </div>
                        <div className="flex items-center">
                          <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
                          <strong className="text-yellow-300">毕业条件: 市值达到 {CONTRACT_CONSTANTS.TARGET_MARKET_CAP} ETH</strong>
                        </div>
                        <div className="flex items-center">
                          <span className="w-2 h-2 bg-orange-400 rounded-full mr-2"></span>
                          费用结构: <span className="text-orange-300">平台费用 2%，创建者分成 3%</span>
                        </div>
                      </div>
                    }
                    type="info"
                    showIcon={false}
                    className="mb-4 bg-blue-900/20 border-blue-600/30"
                  />

                  <Form.Item
                    label={<span className="text-slate-200">代币描述</span>}
                    name="description"
                    rules={[{ required: true, message: '请输入代币描述' }]}
                  >
                    <TextArea
                      rows={4}
                      placeholder="描述你的代币特点和用途..."
                      maxLength={500}
                      showCount
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                    />
                  </Form.Item>

                  <Form.Item label={<span className="text-slate-200">代币图标</span>} name="tokenImage">
                    <Input
                      placeholder="https://example.com/token-image.png"
                      prefix={<InfoCircleOutlined className="text-slate-400" />}
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                    />
                  </Form.Item>
                  <Text className="text-slate-400 text-sm">
                    可选：输入图片URL，留空将使用默认图标
                  </Text>
                </Card>
              </Col>

              {/* Vanity 地址 */}
              <Col xs={24} lg={10}>
                <Card 
                  title={
                    <Space>
                      <StarOutlined className="text-yellow-400" />
                      <span className="text-white">Vanity 地址生成</span>
                    </Space>
                  }
                  className="h-full bg-slate-800/50 border-slate-700"
                  styles={{ header: { backgroundColor: 'rgba(30, 41, 59, 0.5)', borderBottom: '1px solid rgb(51, 65, 85)' } }}
                >
                  <Alert
                    message={<span className="text-yellow-300">cafe前缀地址生成</span>}
                    description={<span className="text-slate-200">使用本地CREATE2算法生成以 &apos;cafe&apos; 开头的个性化代币合约地址，计算速度更快，让你的代币更具辨识度。</span>}
                    type="info"
                    showIcon={false}
                    className="mb-4 bg-yellow-900/20 border-yellow-600/30"
                  />
                  
                  <Button
                    block
                    onClick={generateVanityAddress}
                    disabled={isCreating}
                    type="primary"
                    loading={isGeneratingVanity}
                    className={`mt-4 h-12 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 border-0`}
                  >
                    <Space>
                      {isGeneratingVanity ? '正在生成地址...' : '生成 cafe 开头地址'}
                    </Space>
                  </Button>
                  
                  {vanityResult && (
                    <div className="mt-4 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                      <div className="flex items-center ">
                        <CheckCircleOutlined className="text-green-400 mr-2" />
                        <Text className="text-green-400 font-semibold">生成成功！</Text>
                      </div>
                      <div className="space-y-3">
                        <div className="bg-slate-800/50 p-3 rounded mb-0">
                          <Text className="text-slate-400 text-sm">地址:</Text>
                          <Text className="font-mono text-sm break-all text-green-300 block">
                            {vanityResult.address}
                          </Text>
                        </div>
                        <div className="bg-slate-800/50 p-3 rounded mb-0">
                          <Text className="text-slate-400 text-sm">Salt:</Text>
                          <Text className="font-mono text-xs break-all text-slate-300 block">
                            {vanityResult.salt}
                          </Text>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Tag color="blue">尝试次数: {vanityResult.attempts.toLocaleString()}</Tag>
                          <Tag color="green">将使用此地址</Tag>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 合约信息 */}
                  <div className="mt-4 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                    <div className="flex items-center mb-3">
                      <InfoCircleOutlined className="text-blue-400 mr-2" />
                      <Text className="text-blue-400 font-medium">合约信息</Text>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-slate-800/30 p-2 rounded">
                        <Text className="text-slate-400 text-xs">平台:</Text>
                        <Text className="font-mono text-xs text-slate-300 block break-all">
                          {contractAddresses.MEME_PLATFORM || '加载中...'}
                        </Text>
                      </div>
                      <div className="bg-slate-800/30 p-2 rounded">
                        <Text className="text-slate-400 text-xs">工厂:</Text>
                        <Text className="font-mono text-xs text-slate-300 block break-all">
                          {contractAddresses.MEME_FACTORY || '加载中...'}
                        </Text>
                      </div>
                      <div className="bg-slate-800/30 p-2 rounded">
                        <Text className="text-slate-400 text-xs">网络:</Text>
                        <Text className="text-xs text-slate-300">{chain?.name || '未连接'}</Text>
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>
            </Row>

            <Divider className="border-slate-700 my-8" />

            {/* 提交按钮 */}
            <div className="text-center">
              <Space size="large">
                <Button
                  size="large"
                  onClick={() => router.push('/')}
                  disabled={isCreating || txLoading}
                  className="h-12 px-8 bg-slate-700 hover:bg-slate-600 border-slate-600 text-white"
                >
                  取消
                </Button>
                <Button
                  type="primary"
                  size="large"
                  htmlType="submit"
                  loading={isCreating || txLoading}
                  disabled={isCreating || txLoading}
                  className={`h-12 px-8 ${isCreating || txLoading
                    ? 'bg-purple-600/50 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500'
                    } border-0 font-medium`}
                >
                  <Space>
                    <RocketOutlined />
                    {txLoading ? '确认中...' : isCreating ? '创建中...' : '创建 Bonding Curve 代币'}
                  </Space>
                </Button>
              </Space>

              <div className="mt-6 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
                <div className="flex items-center justify-center mb-3">
                  <DollarCircleOutlined className="text-green-400 mr-2" />
                  <Text className="text-slate-200 font-medium">
                  创建费用: {creationFee} ETH + Gas 费用
                </Text>
                </div>

                <div className="flex flex-wrap justify-center gap-2 mb-3">
                  <Tag color="blue" className="border-blue-500/50">Bonding Curve 模式</Tag>
                  <Tag color="green" className="border-green-500/50">动态定价</Tag>
                  <Tag color="purple" className="border-purple-500/50">创建者分成</Tag>
                  <Tag color="gold" className="border-yellow-500/50">{CONTRACT_CONSTANTS.TARGET_MARKET_CAP} ETH 市值毕业</Tag>
                </div>

                <div className="text-center mb-3">
                  <Text className="text-slate-300 text-sm">
                    🚀 代币将在市值达到 {CONTRACT_CONSTANTS.TARGET_MARKET_CAP} ETH 时自动毕业到 DEX
                  </Text>
                </div>

                {useVanity && vanityResult && (
                  <div className="text-center">
                    <Tag color="gold" className="border-yellow-500/50">
                      使用 Vanity 地址: {formatAddress(vanityResult.address)}
                    </Tag>
                  </div>
                )}
              </div>
            </div>
          </Form>
        </div>
      </Content>
    </Layout>
  );
};

export default function CreateTokenPage() {
  return (
    <App>
      <CreateTokenPageContent />
    </App>
  );
} 