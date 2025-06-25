'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { formatUnits, parseUnits } from 'ethers';
import { useBondingCurve, bondingCurveUtils, useTokenAllowance, useApproveToken, useTokenGraduationStatus } from '../hooks/useBondingCurve';
import { useAccount, useBalance, useChainId } from 'wagmi';
import { waitForTransactionReceipt, readContract, getBalance } from 'wagmi/actions';
import { config } from '../config/wagmi';
import { getContractAddresses } from '../config/contracts';
import { BONDING_CURVE_ABI } from '../config/abis';
import MEME_TOKEN_ABI from '../../abi/MemeToken.json';

const { Text } = Typography;

interface ETHTradePanelProps {
  tokenAddress: string;
  tokenSymbol: string;
  tokenBalance?: { raw: bigint; formatted: string; } | null;
  onTradeComplete?: () => void;
  refetchTokenBalance?: () => Promise<{ raw: bigint; formatted: string; } | null>;
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
  tokenBalance = null,
  onTradeComplete,
  refetchTokenBalance
}: ETHTradePanelProps) {
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy');
  const [inputAmount, setInputAmount] = useState('');
  const [slippage, setSlippage] = useState(2); // 2% 默认滑点
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [isExecutingTrade, setIsExecutingTrade] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [isUpdatingBalance, setIsUpdatingBalance] = useState(false);

  // Hooks
  const bondingCurve = useBondingCurve(tokenAddress);
  const { address } = useAccount();
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);

  const { allowance, checkAllowance, isLoading: isAllowanceLoading } = useTokenAllowance(tokenAddress, contractAddresses.BONDING_CURVE || '');
  const { approveToken, isLoading: isApproving } = useApproveToken();
  const { isGraduated, checkGraduationStatus } = useTokenGraduationStatus(tokenAddress);

  const { message } = App.useApp();

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
  const debouncedInputAmount = useDebounce(inputAmount, 500); // 500ms防抖

  // 使用ref来存储bondingCurve的引用，避免依赖项循环
  const bondingCurveRef = useRef(bondingCurve);
  bondingCurveRef.current = bondingCurve;

  // 检查是否需要授权
  useEffect(() => {
    console.log('🔍 [DEBUG] 防抖输入金额变化:', {
      inputAmount,
      debouncedInputAmount,
      tradeMode,
      hasAddress: !!address
    });
    
    if (tradeMode === 'sell' && debouncedInputAmount && parseFloat(debouncedInputAmount) > 0 && address) {
      console.log('🔍 [DEBUG] 检查代币授权');
      checkAllowance(address);
    }
  }, [debouncedInputAmount, tradeMode, address, checkAllowance]);

  // 检查代币毕业状态
  useEffect(() => {
    if (tokenAddress) {
      checkGraduationStatus();
    }
  }, [tokenAddress, checkGraduationStatus]);

  // 监听毕业状态变化，当代币毕业时立即更新UI
  useEffect(() => {
    if (isGraduated === true) {
      console.log('🎓 [DEBUG] 代币毕业状态变化，立即清空输入并重置状态');
      
      // 清空输入金额
      setInputAmount('');
      
      // 重置授权状态
      setNeedsApproval(false);
      
      // 关闭确认弹窗（如果打开的话）
      setConfirmModalVisible(false);
      
      // 显示毕业提示（只在状态刚变为已毕业时显示一次）
      message.info({
        content: (
          <div>
            <div className="font-medium text-yellow-600">🎓 代币已毕业</div>
            <div className="text-sm mt-1">该代币已迁移到DEX，无法在此处继续交易</div>
          </div>
        ),
        duration: 6,
        key: 'tokenGraduated'
      });
    }
  }, [isGraduated]);

  useEffect(() => {
    if (tradeMode === 'sell' && allowance !== null && debouncedInputAmount && parseFloat(debouncedInputAmount) > 0) {
      try {
        const requiredAmount = parseUnits(debouncedInputAmount, 18);
        setNeedsApproval(allowance < requiredAmount);
      } catch (e) {
        setNeedsApproval(false);
      }
    } else {
      setNeedsApproval(false);
    }
  }, [allowance, debouncedInputAmount, tradeMode]);

  // 计算输出数量 - 添加错误处理和优化
  const calculateOutput = useCallback(async () => {
    console.log('🔍 [DEBUG] calculateOutput - 开始计算输出');
    console.log('🔍 [DEBUG] 计算参数:', {
      debouncedInputAmount,
      tradeMode,
      hasEthBalance: !!ethBalance,
      hasTokenBalance: !!tokenBalance
    });
    
    if (!debouncedInputAmount || parseFloat(debouncedInputAmount) <= 0) {
      console.log('❌ [DEBUG] 输入金额无效，跳过计算');
      return;
    }

    try {
      if (tradeMode === 'buy') {
        console.log('🔍 [DEBUG] 买入模式 - 开始计算代币数量');
        
        // 添加判断条件：输入ETH数量不能超过用户余额
        if (ethBalance) {
          const currentBalance = parseFloat(formatUnits(ethBalance.value, ethBalance.decimals));
          const inputAmountFloat = parseFloat(debouncedInputAmount);
          
          console.log('🔍 [DEBUG] 余额检查:', {
            currentBalance,
            inputAmountFloat,
            ethBalanceValue: ethBalance.value.toString(),
            ethBalanceDecimals: ethBalance.decimals,
            formattedBalance: formatUnits(ethBalance.value, ethBalance.decimals),
            exceedsBalance: inputAmountFloat > currentBalance
          });
          
          if (inputAmountFloat > currentBalance) {
            console.log('❌ [DEBUG] 输入金额超过余额，跳过计算');
          return;
        }
        } else {
          console.log('⚠️ [DEBUG] 无法获取ETH余额，跳过余额检查');
        }
        
        console.log('🚀 [DEBUG] 调用 calculateTokensForETH');
        await bondingCurveRef.current.calculateTokensForETH(debouncedInputAmount);
        
        // 同时计算价格信息用于交易详情
        if (bondingCurveRef.current.tokenAmount) {
          const tokenAmountFormatted = bondingCurveUtils.formatTokenDisplay(bondingCurveRef.current.tokenAmount);
          console.log('🔍 [DEBUG] 计算购买价格，代币数量:', tokenAmountFormatted);
          try {
            await bondingCurveRef.current.calculateBuyPrice(tokenAmountFormatted);
            console.log('✅ [DEBUG] 购买价格计算成功:', bondingCurveRef.current.priceInfo);
          } catch (priceError) {
            console.error('❌ [DEBUG] 购买价格计算失败:', priceError);
            // 不抛出错误，让用户界面继续显示
          }
        } else {
          console.log('⚠️ [DEBUG] 代币数量计算失败，无法计算价格');
        }
      } else {
        console.log('🔍 [DEBUG] 出售模式 - 开始计算ETH数量');
        
        // 添加判断条件：输入数量不能超过用户余额 (使用BigInt)
        if (tokenBalance) {
          const inputAmountBigInt = parseUnits(debouncedInputAmount, 18);
          
          console.log('🔍 [DEBUG] 代币余额检查:', {
            inputAmountBigInt: inputAmountBigInt.toString(),
            tokenBalanceRaw: tokenBalance.raw.toString(),
            exceedsBalance: inputAmountBigInt > tokenBalance.raw
          });
          
          if (inputAmountBigInt > tokenBalance.raw) {
            console.log('❌ [DEBUG] 输入代币数量超过余额，跳过计算');
          // 清除旧的计算结果
          if (bondingCurveRef.current.sellPriceInfo) {
            // 这里可以添加一个清除函数，或者在hook中处理
          }
          return;
        }
        } else {
          console.log('⚠️ [DEBUG] 无法获取代币余额，跳过余额检查');
        }
        
        console.log('🚀 [DEBUG] 调用 calculateSellPrice');
        await bondingCurveRef.current.calculateSellPrice(debouncedInputAmount);
      }
      
      console.log('✅ [DEBUG] calculateOutput 计算完成');
    } catch (error) {
      console.error('❌ [DEBUG] calculateOutput 异常:', error);
      const filteredError = handleAsyncError(error, 'Calculate Output');
      if (filteredError) {
        // 静默处理价格计算失败
        console.log('⚠️ [DEBUG] 价格计算失败，但继续执行');
      }
    }
  }, [debouncedInputAmount, tradeMode, tokenBalance, ethBalance]);

  // 使用防抖的输入金额进行计算
  useEffect(() => {
    console.log('🔍 [DEBUG] useEffect - 防抖输入金额变化触发计算:', {
      debouncedInputAmount,
      tradeMode,
      hasEthBalance: !!ethBalance,
      ethBalanceValue: ethBalance?.value?.toString(),
      ethBalanceFormatted: ethBalance ? formatUnits(ethBalance.value, ethBalance.decimals) : 'N/A'
    });
    
    if (debouncedInputAmount && parseFloat(debouncedInputAmount) > 0) {
      try {
        calculateOutput();
      } catch (error) {
        handleAsyncError(error, 'Calculate Output Timer');
      }
    }
  }, [debouncedInputAmount, tradeMode]);

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
  const showTradeConfirmModal = async () => {
    try {
      console.log('🔍 [DEBUG] showTradeConfirmModal - 开始检查交易条件');
      console.log('🔍 [DEBUG] 输入参数:', { inputAmount, tradeMode, tokenSymbol });
      
      if (!inputAmount || parseFloat(inputAmount) <= 0) {
        console.log('❌ [DEBUG] 输入金额无效:', inputAmount);
        message.warning('请输入有效的数量');
        return;
      }

      // 买入模式下的余额检查
      if (tradeMode === 'buy') {
        console.log('🔍 [DEBUG] 买入模式 - 开始余额检查');
        console.log('🔍 [DEBUG] ethBalance 数据:', ethBalance);
        
        if (!ethBalance) {
          console.log('❌ [DEBUG] 无法获取ETH余额');
          message.error('无法获取ETH余额');
          return;
        }
        
        const inputAmountFloat = parseFloat(inputAmount);
        const currentBalance = parseFloat(formatUnits(ethBalance.value, ethBalance.decimals));
        
        console.log('🔍 [DEBUG] 余额检查详情:', {
          inputAmountFloat,
          currentBalance,
          ethBalanceValue: ethBalance.value.toString(),
          ethBalanceDecimals: ethBalance.decimals,
          formattedBalance: formatUnits(ethBalance.value, ethBalance.decimals)
        });
        
        // 检查输入金额是否超过余额
        if (inputAmountFloat > currentBalance) {
          console.log('❌ [DEBUG] 余额不足:', {
            inputAmountFloat,
            currentBalance,
            difference: inputAmountFloat - currentBalance
          });
          message.error(`余额不足：当前余额 ${currentBalance.toFixed(6)} ETH，需要 ${inputAmountFloat.toFixed(6)} ETH`);
          return;
        }
        
        // 检查是否有足够的余额支付gas费用
        // 如果接近毕业条件，需要更多Gas费用（包含流动性添加）
        let estimatedGasLimit = 800000; // 普通购买
        
        // 检查是否可能触发毕业（需要更多Gas）
        try {
          const tokenDetailsResponse = await readContract(config, {
            address: contractAddresses.BONDING_CURVE as `0x${string}`,
            abi: BONDING_CURVE_ABI,
            functionName: 'getTokenDetails',
            args: [tokenAddress as `0x${string}`],
          }) as [any, any, bigint, bigint];
          
          if (tokenDetailsResponse && tokenDetailsResponse.length >= 4) {
            const [, , , marketCap] = tokenDetailsResponse;
            const marketCapEth = parseFloat(formatUnits(marketCap, 18));
            const TARGET_MARKET_CAP = 10; // 10 ETH毕业门槛
            
            // 如果市值+本次购买可能达到毕业条件，使用更高的Gas估算
            const currentInputContribution = inputAmountFloat * 0.95; // 扣除费用后的贡献
            if (marketCapEth + currentInputContribution >= TARGET_MARKET_CAP * 0.8) {
              estimatedGasLimit = 1500000; // 1.5M Gas for graduation
              console.log('🎓 [DEBUG] 检测到可能触发毕业，使用更高Gas估算:', estimatedGasLimit);
            }
          }
        } catch (gasEstimationError) {
          console.log('⚠️ [DEBUG] Gas估算检查失败，使用保守估算:', gasEstimationError);
          estimatedGasLimit = 1200000; // 保守估算1.2M Gas
        }
        
        const estimatedGasPrice = 2.0; // 增加到2.0 gwei以确保交易成功
        const estimatedGasCost = (estimatedGasLimit * estimatedGasPrice) / 1e9; // 转换为ETH
        const totalRequired = inputAmountFloat + estimatedGasCost;
        
        console.log('🔍 [DEBUG] Gas费用检查:', {
          inputAmountFloat,
          estimatedGasLimit,
          estimatedGasPrice,
          estimatedGasCost,
          totalRequired,
          currentBalance,
          hasEnoughForGas: totalRequired <= currentBalance
        });
        
        if (totalRequired > currentBalance) {
          console.log('⚠️ [DEBUG] 余额可能不足以支付gas费用');
          message.warning(`余额可能不足以支付gas费用，建议减少交易金额或确保有足够的ETH支付gas`);
        }
      }

      // 检查是否有必要的计算结果
      if (tradeMode === 'buy' && !bondingCurveRef.current.tokenAmount) {
        console.log('❌ [DEBUG] 代币数量计算失败:', bondingCurveRef.current.tokenAmount);
        message.warning('请等待价格计算完成');
        return;
      }

      if (tradeMode === 'buy' && !bondingCurveRef.current.priceInfo) {
        console.log('❌ [DEBUG] 购买价格信息计算失败，尝试立即计算:', bondingCurveRef.current.priceInfo);
        
        // 尝试立即计算价格信息
        try {
          message.loading({ content: '正在计算价格信息...', key: 'priceCalculation', duration: 0 });
          
          // 先计算代币数量
          if (!bondingCurveRef.current.tokenAmount) {
            console.log('🔍 [DEBUG] 立即计算代币数量');
            await bondingCurveRef.current.calculateTokensForETH(inputAmount);
          }
          
          // 再计算价格信息
          if (bondingCurveRef.current.tokenAmount) {
            const tokenAmountFormatted = bondingCurveUtils.formatTokenDisplay(bondingCurveRef.current.tokenAmount);
            console.log('🔍 [DEBUG] 立即计算购买价格，代币数量:', tokenAmountFormatted);
            await bondingCurveRef.current.calculateBuyPrice(tokenAmountFormatted);
            console.log('✅ [DEBUG] 立即计算价格成功:', bondingCurveRef.current.priceInfo);
          }
          
          message.destroy('priceCalculation');
          
          // 检查计算是否成功
          if (!bondingCurveRef.current.priceInfo) {
            console.log('❌ [DEBUG] 立即计算价格仍然失败');
            message.warning('价格计算失败，请重试');
            return;
          }
          
        } catch (error) {
          console.error('❌ [DEBUG] 立即计算价格异常:', error);
          message.destroy('priceCalculation');
          message.warning('价格计算失败，请重试');
          return;
        }
      }

      if (tradeMode === 'sell' && !bondingCurveRef.current.sellPriceInfo) {
        console.log('❌ [DEBUG] 出售价格计算失败:', bondingCurveRef.current.sellPriceInfo);
        message.warning('请等待价格计算完成');
        return;
      }

      console.log('✅ [DEBUG] 所有检查通过，打开确认弹窗');
      console.log('🔍 [DEBUG] 当前计算结果:', {
        tradeMode,
        tokenAmount: bondingCurveRef.current.tokenAmount?.toString(),
        priceInfo: bondingCurveRef.current.priceInfo,
        sellPriceInfo: bondingCurveRef.current.sellPriceInfo
      });
      setConfirmModalVisible(true);
    } catch (error) {
      console.error('❌ [DEBUG] showTradeConfirmModal 异常:', error);
      const filteredError = handleAsyncError(error, 'Show Confirm Modal');
      if (filteredError) {
        message.error('打开确认弹窗失败');
      }
    }
  };

  // 执行实际交易 - 增强错误处理
  const executeTradeAction = async () => {
    console.log('🚀 [DEBUG] executeTradeAction - 开始执行交易');
    console.log('🚀 [DEBUG] 交易参数:', {
      tradeMode,
      inputAmount,
      tokenAddress,
      tokenSymbol,
      slippage
    });
    
    setIsExecutingTrade(true);
    const tradeKey = tradeMode === 'buy' ? 'buyProgress' : 'sellProgress';

    try {
      let hash: `0x${string}`;

      if (tradeMode === 'buy') {
        console.log('🔍 [DEBUG] 买入模式 - 开始执行购买');
        
        // 强制刷新余额，获取最新数据
        console.log('🔄 [DEBUG] 强制刷新余额获取最新数据');
        if (refetchEthBalance) {
          await refetchEthBalance();
          console.log('✅ [DEBUG] 强制刷新余额完成');
          
          // 强制等待余额状态更新
          console.log('⏳ [DEBUG] 等待余额状态更新...');
          await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
          console.log('✅ [DEBUG] 余额状态更新等待完成');
          
          // 再次刷新余额，确保获取最新数据
          console.log('🔄 [DEBUG] 再次刷新余额以确保同步');
          await refetchEthBalance();
          console.log('✅ [DEBUG] 最终余额刷新完成');
          
          // 再次等待状态更新
          console.log('⏳ [DEBUG] 最终等待余额状态更新...');
          await new Promise(resolve => setTimeout(resolve, 500)); // 等待0.5秒
          console.log('✅ [DEBUG] 最终余额状态更新完成');
        }
        
        // 检查是否有待处理的交易
        if (address) {
          console.log('🔍 [DEBUG] 检查待处理交易');
          try {
            const nonce = await readContract(config, {
              address: address as `0x${string}`,
              abi: [{ type: 'function', name: 'nonce', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
              functionName: 'nonce',
            }) as bigint;
            
            console.log('🔍 [DEBUG] 当前nonce:', nonce.toString());
            
            // 如果有待处理交易，等待更长时间
            if (nonce > 0) {
              console.log('⚠️ [DEBUG] 检测到待处理交易，等待更长时间');
              await new Promise(resolve => setTimeout(resolve, 3000)); // 等待3秒
              console.log('✅ [DEBUG] 待处理交易等待完成');
            }
          } catch (nonceError) {
            console.log('⚠️ [DEBUG] 无法检查nonce，继续执行:', nonceError);
          }
        }
        
        if (ethBalance) {
          const currentBalance = parseFloat(formatUnits(ethBalance.value, ethBalance.decimals));
          const inputAmountFloat = parseFloat(inputAmount);
          
          // 更严格的Gas费用估算 - 为毕业交易预留更多Gas
          const estimatedGasLimit = 1500000; // 为可能的毕业交易预留1.5M Gas
          const estimatedGasPrice = 2.0; // 增加到2.0 gwei
          const estimatedGasCost = (estimatedGasLimit * estimatedGasPrice) / 1e9; // 转换为ETH
          const totalRequired = inputAmountFloat + estimatedGasCost;
          
          console.log('🔍 [DEBUG] 详细余额检查:', {
            currentBalance,
            inputAmountFloat,
            estimatedGasLimit,
            estimatedGasPrice,
            estimatedGasCost,
            totalRequired,
            hasEnoughBalance: currentBalance >= totalRequired,
            balanceDifference: currentBalance - totalRequired,
            ethBalanceRaw: ethBalance.value.toString()
          });
          
          // 直接从链上获取最新余额进行最终验证
          if (address) {
            console.log('🔍 [DEBUG] 从链上获取最新余额进行验证');
            try {
              const latestBalance = await getBalance(config, {
                address: address as `0x${string}`,
              });
              
              const latestBalanceFormatted = parseFloat(formatUnits(latestBalance.value, latestBalance.decimals));
              
              // 更保守的Gas费用估算
              const conservativeGasLimit = 800000; // 增加到800K
              const conservativeGasPrice = 1.2; // 增加到1.2 gwei
              const conservativeGasCost = (conservativeGasLimit * conservativeGasPrice) / 1e9;
              const conservativeTotalRequired = inputAmountFloat + conservativeGasCost;
              
              console.log('🔍 [DEBUG] 链上余额验证:', {
                latestBalance: latestBalance.value.toString(),
                latestBalanceFormatted,
                conservativeGasCost,
                conservativeTotalRequired,
                hasEnoughForTransaction: latestBalanceFormatted >= conservativeTotalRequired,
                difference: latestBalanceFormatted - conservativeTotalRequired,
                safetyMargin: latestBalanceFormatted - conservativeTotalRequired
              });
              
              if (latestBalanceFormatted < conservativeTotalRequired) {
                console.log('❌ [DEBUG] 链上余额验证失败 - 余额不足');
                throw new Error(`链上余额不足：当前余额 ${latestBalanceFormatted.toFixed(6)} ETH，需要 ${conservativeTotalRequired.toFixed(6)} ETH (包含保守预估gas费用 ${conservativeGasCost.toFixed(6)} ETH)`);
              }
              
              // 如果余额紧张，建议减少交易金额
              const safetyMargin = latestBalanceFormatted - conservativeTotalRequired;
              if (safetyMargin < 0.1) { // 如果安全边际小于0.1 ETH
                console.log('⚠️ [DEBUG] 余额安全边际较小，建议减少交易金额');
                message.warning(`余额安全边际较小 (${safetyMargin.toFixed(6)} ETH)，建议减少交易金额以确保交易成功`);
              }
              
            } catch (balanceError) {
              console.log('⚠️ [DEBUG] 链上余额检查失败，使用缓存余额:', balanceError);
              // 如果链上余额检查失败，继续使用缓存余额
            }
          }
          
          if (totalRequired > currentBalance) {
            console.log('❌ [DEBUG] 最终余额检查失败 - 余额不足');
            throw new Error(`余额不足：当前余额 ${currentBalance.toFixed(6)} ETH，需要 ${totalRequired.toFixed(6)} ETH (包含预估gas费用 ${estimatedGasCost.toFixed(6)} ETH)`);
          }
        }
        
        if (!bondingCurveRef.current.tokenAmount) {
          console.log('❌ [DEBUG] 代币数量计算失败:', bondingCurveRef.current.tokenAmount);
          throw new Error('代币数量计算失败');
        }
        
        const minTokenAmount = bondingCurveUtils.calculateMinReceive(bondingCurveRef.current.tokenAmount, slippage);
        
        console.log('🔍 [DEBUG] 购买参数:', {
          tokenAmount: bondingCurveRef.current.tokenAmount.toString(),
          minTokenAmount: minTokenAmount.toString(),
          formattedMinTokenAmount: bondingCurveUtils.formatTokenDisplay(minTokenAmount),
          slippage
        });

        message.loading({ content: '正在提交购买交易...', key: tradeKey, duration: 0 });
        
        console.log('🚀 [DEBUG] 调用 bondingCurve.buyTokens');
        hash = await bondingCurveRef.current.buyTokens(tokenAddress, inputAmount, bondingCurveUtils.formatTokenDisplay(minTokenAmount));
        console.log('✅ [DEBUG] 购买交易已提交，哈希:', hash);
        
      } else {
        if (!bondingCurveRef.current.sellPriceInfo) throw new Error('出售价格计算失败');
        if (!address) throw new Error('请先连接钱包');

        // 检查代币是否已毕业
        await checkGraduationStatus();

        if (isGraduated === true) {
          throw new Error('代币已毕业，无法在bonding curve中出售');
        }

        let amountToSellBigInt = parseUnits(inputAmount, 18);

        // 验证输入金额的合理性
        if (amountToSellBigInt === 0n) {
          throw new Error('出售数量不能为0');
        }

        // 检查授权额度
        if (needsApproval) {
          throw new Error('代币授权额度不足，请先授权');
        }

        // 直接检查合约中的用户余额
        try {
          const actualBalance = await readContract(config, {
            address: tokenAddress as `0x${string}`,
            abi: MEME_TOKEN_ABI,
            functionName: 'balanceOf',
            args: [address as `0x${string}`],
          }) as bigint;

          if (actualBalance < amountToSellBigInt) {
            throw new Error(`余额不足：合约显示余额 ${formatUnits(actualBalance, 18)}，需要 ${formatUnits(amountToSellBigInt, 18)}`);
          }

          // 检查bonding curve合约的授权额度
          const bondingCurveAllowance = await readContract(config, {
            address: tokenAddress as `0x${string}`,
            abi: MEME_TOKEN_ABI,
            functionName: 'allowance',
            args: [address as `0x${string}`, contractAddresses.BONDING_CURVE as `0x${string}`],
          }) as bigint;

          // 检查Bonding Curve合约的burn权限
          if (bondingCurveAllowance < amountToSellBigInt) {
            throw new Error(`Bonding Curve合约没有足够的burn权限：当前授权 ${formatUnits(bondingCurveAllowance, 18)}，需要 ${formatUnits(amountToSellBigInt, 18)}`);
          }

        } catch (balanceError) {
          throw new Error('无法检查代币余额');
        }

        // 最终余额检查和自动修正
        if (refetchTokenBalance) {
          message.loading({ content: '正在确认最新余额...', key: tradeKey, duration: 0 });
          const latestBalance = await refetchTokenBalance();

          if (!latestBalance) {
            throw new Error('获取最新余额失败');
          }

          if (amountToSellBigInt > latestBalance.raw) {
            message.warning('出售数量超过余额，已自动调整为最大值');
            amountToSellBigInt = latestBalance.raw;
          }
        }

        const minETHAmount = bondingCurveUtils.calculateMinReceive(bondingCurveRef.current.sellPriceInfo.ethReceived, slippage);
        const finalAmountString = formatUnits(amountToSellBigInt, 18);

        message.loading({ content: '正在检查并提交出售交易...', key: tradeKey, duration: 0 });
        hash = await bondingCurveRef.current.sellTokens(
          tokenAddress,
          finalAmountString,
          formatUnits(minETHAmount, 18)
        );
      }

      console.log('⏳ [DEBUG] 等待交易确认，哈希:', hash);
      message.loading({ content: '交易已提交，等待链上确认...', key: tradeKey, duration: 0 });
      const receipt = await waitForTransactionReceipt(config, { hash });

      console.log('🔍 [DEBUG] 交易收据:', receipt);

      if (receipt.status === 'success') {
        console.log('✅ [DEBUG] 交易成功确认');
        const successMessage = tradeMode === 'buy' ?
          `支付: ${inputAmount} ETH → 获得: ${bondingCurveUtils.formatTokenDisplay(bondingCurveRef.current.tokenAmount!)} ${tokenSymbol}` :
          `出售: ${inputAmount} ${tokenSymbol} → 获得: ${bondingCurveUtils.formatETH(bondingCurveRef.current.sellPriceInfo!.ethReceived)} ETH`;

        message.success({
          content: (
            <div>
              <div className="font-medium text-green-600">🎉 交易成功！</div>
              <div className="text-sm mt-1">{successMessage}</div>
              <div className="text-xs mt-1 text-slate-400">交易哈希: {hash.slice(0, 10)}...{hash.slice(-8)}</div>
            </div>
          ),
          duration: 5,
          key: tradeKey
        });

        setInputAmount('');
        setConfirmModalVisible(false);

        // 交易成功后，立即刷新余额，确保数据同步
        console.log('🔄 [DEBUG] 交易成功，开始刷新余额');
        setIsUpdatingBalance(true);
        
        try {
        if (refetchEthBalance) {
            console.log('🔄 [DEBUG] 调用 refetchEthBalance');
          await refetchEthBalance();
            console.log('✅ [DEBUG] refetchEthBalance 完成');
            
            // 强制等待一段时间，确保余额缓存更新
            console.log('⏳ [DEBUG] 等待余额缓存更新...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
            console.log('✅ [DEBUG] 余额缓存更新等待完成');
            
            // 再次刷新余额，确保获取最新数据
            console.log('🔄 [DEBUG] 再次刷新余额以确保同步');
            await refetchEthBalance();
            console.log('✅ [DEBUG] 最终余额刷新完成');
        }

        // 购买交易成功后，检查代币是否触发毕业
        if (tradeMode === 'buy') {
          console.log('🔄 [DEBUG] 购买交易成功，检查代币毕业状态');
          try {
            // 等待更长时间确保区块链状态同步
            console.log('⏳ [DEBUG] 等待区块链状态同步...');
            await new Promise(resolve => setTimeout(resolve, 3000)); // 等待3秒
            console.log('✅ [DEBUG] 区块链状态同步等待完成');
            
            // 检查毕业状态
            await checkGraduationStatus();
            console.log('✅ [DEBUG] 毕业状态检查完成，当前状态:', isGraduated);
            
            // 强制等待状态更新
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 再次检查以确保状态更新
            await checkGraduationStatus();
            console.log('🔄 [DEBUG] 再次检查毕业状态，当前状态:', isGraduated);
            
            // 如果代币已毕业，显示特殊提示并强制刷新父组件
            if (isGraduated === true) {
              console.log('🎓 [DEBUG] 检测到代币已毕业！');
              message.success({
                content: (
                  <div>
                    <div className="font-medium text-yellow-600">🎓 恭喜！代币已毕业！</div>
                    <div className="text-sm mt-1">该代币已达到毕业条件，已迁移到DEX交易</div>
                  </div>
                ),
                duration: 8,
                key: 'graduationNotice'
              });
              
              // 强制触发父组件刷新以更新毕业状态显示
              console.log('🔄 [DEBUG] 强制触发父组件刷新以更新毕业状态');
              if (onTradeComplete) {
                // 立即再次调用以确保父组件获取最新的毕业状态
                setTimeout(() => {
                  console.log('🔄 [DEBUG] 延迟调用 onTradeComplete 以确保状态同步');
                  onTradeComplete();
                }, 1000); // 1秒后再次刷新
              }
            }
          } catch (graduationError) {
            console.error('❌ [DEBUG] 检查毕业状态失败:', graduationError);
            // 不抛出错误，只是记录日志
          }
        }

        if (onTradeComplete) {
            console.log('🔄 [DEBUG] 调用 onTradeComplete');
          onTradeComplete();
          }
        } finally {
          setIsUpdatingBalance(false);
          console.log('✅ [DEBUG] 余额更新状态重置完成');
        }

      } else {
        console.log('❌ [DEBUG] 交易在链上回滚');
        throw new Error('交易已在链上回滚，请检查交易详情');
      }

    } catch (error) {
      console.error('❌ [DEBUG] executeTradeAction 异常:', error);
      console.error('❌ [DEBUG] 错误详情:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      
      const filteredError = handleAsyncError(error, 'Execute Trade');
      message.destroy(tradeKey);

      if (filteredError) {
        if (filteredError instanceof Error) {
          if (filteredError.message.includes('insufficient funds')) {
            console.log('❌ [DEBUG] 检测到余额不足错误');
            message.error('余额不足，请检查您的账户余额');
            return;
          }
          if (filteredError.message.includes('slippage')) {
            console.log('❌ [DEBUG] 检测到滑点错误');
            message.error('滑点过大，请调整滑点设置或稍后重试');
            return;
          }
          if (filteredError.message.includes('User rejected')) {
            console.log('⚠️ [DEBUG] 用户取消交易');
            message.warning('交易已取消');
            return;
          }
        }

        console.log('❌ [DEBUG] 显示通用错误消息');
        message.error('交易失败: ' + (filteredError instanceof Error ? filteredError.message : '未知错误'));
      }
    } finally {
      console.log('🏁 [DEBUG] executeTradeAction 结束');
      setIsExecutingTrade(false);
    }
  };

  // 处理授权
  const handleApprove = async () => {
    if (!contractAddresses.BONDING_CURVE) {
      message.error('合约地址未找到');
      return;
    }

    setIsExecutingTrade(true);
    message.loading({ content: '正在提交无限额度授权交易...', key: 'approveProgress', duration: 0 });

    try {
      // 使用无限额度授权，传入任意金额都会被忽略
      const dummyAmount = parseUnits(inputAmount, 18);
      
      const hash = await approveToken(tokenAddress, contractAddresses.BONDING_CURVE, dummyAmount);

      message.loading({ content: '等待授权确认...', key: 'approveProgress', duration: 0 });
      await waitForTransactionReceipt(config, { hash });

      message.success({ 
        content: '授权成功！', 
        key: 'approveProgress', 
        duration: 5 
      });

      // 重新检查授权额度
      if (address) {
        await checkAllowance(address);
      }

    } catch (error) {
      const filteredError = handleAsyncError(error, 'Approve');
      message.destroy('approveProgress');
      if (filteredError) {
        message.error('授权失败: ' + (filteredError instanceof Error ? filteredError.message : '未知错误'));
      }
    } finally {
      setIsExecutingTrade(false);
    }
  };

  // 渲染交易确认Modal内容
  const renderConfirmModalContent = () => {
    const outputInfo = getOutputInfo();

    // 添加调试信息
    console.log('🔍 [DEBUG] renderConfirmModalContent - 当前状态:', {
      tradeMode,
      inputAmount,
      tokenAmount: bondingCurveRef.current.tokenAmount?.toString(),
      priceInfo: bondingCurveRef.current.priceInfo,
      sellPriceInfo: bondingCurveRef.current.sellPriceInfo,
      hasPriceInfo: !!bondingCurveRef.current.priceInfo,
      hasSellPriceInfo: !!bondingCurveRef.current.sellPriceInfo
    });

    // 详细的价格信息调试
    if (tradeMode === 'buy' && bondingCurveRef.current.priceInfo) {
      console.log('🔍 [DEBUG] 购买价格详情:', {
        ethCost: bondingCurveRef.current.priceInfo.ethCost?.toString(),
        afterFeesCost: bondingCurveRef.current.priceInfo.afterFeesCost?.toString(),
        platformFee: bondingCurveRef.current.priceInfo.platformFee?.toString(),
        creatorFee: bondingCurveRef.current.priceInfo.creatorFee?.toString(),
        formattedEthCost: bondingCurveUtils.formatETH(bondingCurveRef.current.priceInfo.ethCost),
        formattedPlatformFee: bondingCurveUtils.formatETH(bondingCurveRef.current.priceInfo.platformFee),
        formattedCreatorFee: bondingCurveUtils.formatETH(bondingCurveRef.current.priceInfo.creatorFee)
      });
    }

    if (tradeMode === 'sell' && bondingCurveRef.current.sellPriceInfo) {
      console.log('🔍 [DEBUG] 出售价格详情:', {
        ethBeforeFees: bondingCurveRef.current.sellPriceInfo.ethBeforeFees?.toString(),
        ethReceived: bondingCurveRef.current.sellPriceInfo.ethReceived?.toString(),
        platformFee: bondingCurveRef.current.sellPriceInfo.platformFee?.toString(),
        creatorFee: bondingCurveRef.current.sellPriceInfo.creatorFee?.toString(),
        formattedEthBeforeFees: bondingCurveUtils.formatETH(bondingCurveRef.current.sellPriceInfo.ethBeforeFees),
        formattedEthReceived: bondingCurveUtils.formatETH(bondingCurveRef.current.sellPriceInfo.ethReceived),
        formattedPlatformFee: bondingCurveUtils.formatETH(bondingCurveRef.current.sellPriceInfo.platformFee),
        formattedCreatorFee: bondingCurveUtils.formatETH(bondingCurveRef.current.sellPriceInfo.creatorFee)
      });
    }

    return (
      <div className="space-y-4">
        {/* 交易概览 */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
          <div className="flex items-center justify-between mb-3">
            <Text className="text-lg font-semibold text-white">
              {tradeMode === 'buy' ? '购买' : '出售'} {tokenSymbol}
            </Text>
            <div className={`px-2 py-1 rounded text-xs font-medium ${tradeMode === 'buy'
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

          {tradeMode === 'buy' && bondingCurveRef.current.priceInfo && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <Text className="text-slate-400">基础价格:</Text>
                <Text className="text-slate-200">{bondingCurveUtils.formatETH(bondingCurveRef.current.priceInfo.ethCost)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">平台费用 (2%):</Text>
                <Text className="text-slate-200">{bondingCurveUtils.formatETH(bondingCurveRef.current.priceInfo.platformFee)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">创作者费用 (3%):</Text>
                <Text className="text-slate-200">{bondingCurveUtils.formatETH(bondingCurveRef.current.priceInfo.creatorFee)} ETH</Text>
              </div>
              <Divider className="my-2 border-slate-600" />
              {/* <div className="flex justify-between font-medium">
                <Text className="text-white">总计费用:</Text>
                <Text className="text-white">{bondingCurveUtils.formatETH(bondingCurveRef.current.priceInfo.afterFeesCost)} ETH</Text>
              </div> */}
              <div className="flex justify-between">
                <Text className="text-yellow-400">
                  <TrophyOutlined className="mr-1" />
                  市值贡献:
                </Text>
                <Text className="text-yellow-400">+{bondingCurveUtils.formatETH(bondingCurveRef.current.priceInfo.ethCost)} ETH</Text>
              </div>
            </div>
          )}

          {tradeMode === 'sell' && bondingCurveRef.current.sellPriceInfo && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <Text className="text-slate-400">基础价格:</Text>
                <Text className="text-slate-200">{bondingCurveUtils.formatETH(bondingCurveRef.current.sellPriceInfo.ethBeforeFees)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">平台费用 (2%):</Text>
                <Text className="text-slate-200">-{bondingCurveUtils.formatETH(bondingCurveRef.current.sellPriceInfo.platformFee)} ETH</Text>
              </div>
              <div className="flex justify-between">
                <Text className="text-slate-400">创作者费用 (3%):</Text>
                <Text className="text-slate-200">-{bondingCurveUtils.formatETH(bondingCurveRef.current.sellPriceInfo.creatorFee)} ETH</Text>
              </div>
              <Divider className="my-2 border-slate-600" />
              <div className="flex justify-between font-medium">
                <Text className="text-white">实际收到:</Text>
                <Text className="text-green-400">{bondingCurveUtils.formatETH(bondingCurveRef.current.sellPriceInfo.ethReceived)} ETH</Text>
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
        // 更严格的Gas费用估算 - 为毕业交易预留更多Gas
        const estimatedGasLimit = 1500000; // 为可能的毕业交易预留1.5M Gas
        const estimatedGasPrice = 2.0; // 增加到2.0 gwei
        const estimatedGasCost = (estimatedGasLimit * estimatedGasPrice) / 1e9; // 转换为ETH
        
        const currentBalance = parseFloat(formatUnits(ethBalance.value, ethBalance.decimals));
        const maxAmount = Math.max(0, currentBalance - estimatedGasCost); // 保留Gas费用
        
        // 额外的安全检查：确保不超过实际余额的95%
        const safeMaxAmount = Math.min(maxAmount, currentBalance * 0.95);
        handleInputChange(safeMaxAmount.toFixed(6));
        
        console.log('🔍 [DEBUG] handleSetMax:', {
          currentBalance,
          estimatedGasCost,
          maxAmount,
          safeMaxAmount
        });
      }
    } else {
      if (tokenBalance) {
        handleInputChange(formatUnits(tokenBalance.raw, 18));
      } else {
        handleInputChange('0');
      }
    }
  };

  // 计算输出信息
  const getOutputInfo = () => {
    // 如果输入为空或代币已毕业，返回默认值
    if (!inputAmount || parseFloat(inputAmount) <= 0 || isGraduated === true) {
      return {
        amount: '0.0000',
        symbol: tradeMode === 'buy' ? tokenSymbol : 'ETH',
        isLoading: false
      };
    }

    if (tradeMode === 'buy') {
      return {
        amount: bondingCurveRef.current.tokenAmount ? bondingCurveUtils.formatTokenDisplay(bondingCurveRef.current.tokenAmount) : '0.0000',
        symbol: tokenSymbol,
        isLoading: bondingCurveRef.current.isTokenAmountLoading
      };
    } else {
      return {
        amount: bondingCurveRef.current.sellPriceInfo ? bondingCurveUtils.formatETH(bondingCurveRef.current.sellPriceInfo.ethReceived) : '0.0000',
        symbol: 'ETH',
        isLoading: bondingCurveRef.current.isSellPriceLoading
      };
    }
  };

  const outputInfo = getOutputInfo();

  // 获取交易按钮文本和状态
  const getTradeButtonProps = () => {
    // 如果代币已毕业，禁用所有交易
    if (isGraduated === true) {
      return {
        text: '代币已毕业',
        onClick: () => { },
        loading: false,
        disabled: true
      };
    }

    // 如果正在更新余额，禁用所有交易
    if (isUpdatingBalance) {
      return {
        text: '更新余额中...',
        onClick: () => { },
        loading: true,
        disabled: true
      };
    }

    if (tradeMode === 'buy') {
      return {
        text: `购买 ${tokenSymbol}`,
        onClick: showTradeConfirmModal,
        loading: bondingCurveRef.current.isBuying,
        disabled: !bondingCurveRef.current.tokenAmount || bondingCurveRef.current.tokenAmount === BigInt(0)
      };
    } else {
      // Sell Mode Logic
      if (needsApproval) {
        return {
          text: `授权 ${tokenSymbol}`,
          onClick: handleApprove,
          loading: isApproving || isExecutingTrade,
          disabled: !inputAmount || parseFloat(inputAmount) <= 0
        };
      }
      return {
        text: `出售 ${tokenSymbol}`,
        onClick: showTradeConfirmModal,
        loading: bondingCurveRef.current.isSelling || isAllowanceLoading,
        disabled: !bondingCurveRef.current.sellPriceInfo || bondingCurveRef.current.sellPriceInfo.ethReceived === 0n
      };
    }
  };

  const buttonProps = getTradeButtonProps();

  // 手动刷新购买计算函数
  const refreshBuyCalculation = useCallback(async (amount: string) => {
    console.log('🔍 [DEBUG] refreshBuyCalculation - 开始刷新购买计算:', amount);
    
    if (!amount || parseFloat(amount) <= 0) {
      console.log('❌ [DEBUG] 输入金额无效，跳过刷新');
      return;
    }

    try {
      message.loading({ content: '正在重新计算...', key: 'refreshCalculation', duration: 0 });
      
      // 重新计算代币数量
      await bondingCurveRef.current.calculateTokensForETH(amount);
      
      // 同时计算价格信息
      if (bondingCurveRef.current.tokenAmount) {
        const tokenAmountFormatted = bondingCurveUtils.formatTokenDisplay(bondingCurveRef.current.tokenAmount);
        try {
          await bondingCurveRef.current.calculateBuyPrice(tokenAmountFormatted);
          console.log('✅ [DEBUG] 刷新价格计算成功:', bondingCurveRef.current.priceInfo);
        } catch (priceError) {
          console.error('❌ [DEBUG] 刷新价格计算失败:', priceError);
          // 不抛出错误，让用户界面继续显示
        }
      }
      
      message.success({ 
        content: '计算已刷新', 
        key: 'refreshCalculation', 
        duration: 2 
      });
      
      console.log('✅ [DEBUG] refreshBuyCalculation 完成');
    } catch (error) {
      console.error('❌ [DEBUG] refreshBuyCalculation 失败:', error);
      message.error({ 
        content: '刷新失败，请重试', 
        key: 'refreshCalculation', 
        duration: 3 
      });
    }
  }, []);

  // 输入处理函数 - 在用户输入时立即刷新计算
  const handleInputChange = useCallback((value: string) => {
    console.log('🔍 [DEBUG] handleInputChange - 用户输入:', value);
    
    // 更新输入值
    setInputAmount(value);
    
    // 如果是购买模式且有有效输入，立即刷新计算
    if (tradeMode === 'buy' && value && parseFloat(value) > 0) {
      console.log('🔍 [DEBUG] 立即刷新购买计算');
      // 使用 setTimeout 避免阻塞 UI，并且不显示加载消息（静默刷新）
      setTimeout(async () => {
        try {
          // 静默刷新，不显示加载消息
          await bondingCurveRef.current.calculateTokensForETH(value);
          
          if (bondingCurveRef.current.tokenAmount) {
            const tokenAmountFormatted = bondingCurveUtils.formatTokenDisplay(bondingCurveRef.current.tokenAmount);
            try {
              await bondingCurveRef.current.calculateBuyPrice(tokenAmountFormatted);
              console.log('✅ [DEBUG] 静默刷新价格计算成功:', bondingCurveRef.current.priceInfo);
            } catch (priceError) {
              console.error('❌ [DEBUG] 静默刷新价格计算失败:', priceError);
            }
          }
        } catch (error) {
          console.error('❌ [DEBUG] 静默刷新失败:', error);
        }
      }, 0);
    }
  }, [tradeMode]);

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
            loading={bondingCurveRef.current.isBuying || bondingCurveRef.current.isSelling}
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
            onClick={() => {
              setTradeMode('buy');
              handleInputChange(''); // 清空输入框
            }}
            icon={<ArrowUpOutlined />}
          >
            购买
          </Button>
        </Col>
        <Col span={12}>
          <Button
            type={tradeMode === 'sell' ? 'primary' : 'default'}
            block
            onClick={() => {
              setTradeMode('sell');
              handleInputChange(''); // 清空输入框
            }}
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
          <Button
            type="link"
            size="small"
            onClick={handleSetMax}
            className="text-blue-400"
            disabled={isGraduated === true}
          >
            MAX
          </Button>
        </div>

        <div className="relative">
          <Input
            size="large"
            placeholder={isGraduated === true ? "代币已毕业" : "0.00"}
            value={inputAmount}
            onChange={(e) => handleInputChange(e.target.value)}
            className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
            disabled={isGraduated === true}
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
            <div className="flex items-center space-x-2">
              <Text className="text-xs text-slate-400">
                余额: {tradeMode === 'buy'
                  ? (ethBalance ? `${formatETHBalance(formatUnits(ethBalance.value, ethBalance.decimals))} ETH` : '0 ETH')
                  : `${tokenBalance ? tokenBalance.formatted : '0.0000'} ${tokenSymbol}`
                }
              </Text>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                className="text-slate-400 hover:text-blue-400 p-0 h-auto"
                onClick={async () => {
                  if (refetchEthBalance) {
                    await refetchEthBalance();
                    message.success('余额已刷新');
                  }
                }}
                loading={bondingCurveRef.current.isBuying || bondingCurveRef.current.isSelling}
              />
            </div>
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
          {tradeMode === 'buy' && inputAmount && parseFloat(inputAmount) > 0 && (
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              className="text-blue-400 hover:text-blue-300 p-0 h-auto"
              onClick={async () => {
                console.log('🔍 [DEBUG] 手动刷新购买计算');
                await refreshBuyCalculation(inputAmount);
              }}
              loading={bondingCurveRef.current.isTokenAmountLoading}
              disabled={!inputAmount || parseFloat(inputAmount) <= 0 || isGraduated === true}
            />
          )}
        </div>

        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-3">
          <div className="flex justify-between items-center">
            <Text className="text-lg font-medium text-white">
              {isGraduated === true ? '0.0000' : outputInfo.amount}
            </Text>
            <Text className="text-slate-300">
              {isGraduated === true ? '已毕业' : outputInfo.symbol}
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
          disabled={isGraduated === true}
        />
      </div>

      {/* 代币毕业状态提示 */}
      {isGraduated === true ? (
        <Alert
          type="info"
          style={{ marginBottom: '20px' }}
          message="代币已毕业"
          description="请在 0xcafe DEX 中进行交易。"
          showIcon
        />
      ) : (
        <Alert
        type="info"
        style={{ marginBottom: '20px' }}
        message=""
        description={`在毕业前，Token处于动态 Mint/Burn 状态，毕业后自动丢弃 Mint 权限。`}
        showIcon
        />
      )}

     

      {/* 交易按钮 */}
      <Button
        type="primary"
        size="large"
        block
        onClick={buttonProps.onClick}
        loading={buttonProps.loading}
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
            disabled={isExecutingTrade || isUpdatingBalance}
            className="mr-2"
          >
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={isExecutingTrade || isUpdatingBalance}
            onClick={executeTradeAction}
            icon={isExecutingTrade || isUpdatingBalance ? undefined : <CheckCircleOutlined />}
            className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 border-0"
          >
            {isExecutingTrade ? '交易执行中...' : 
             isUpdatingBalance ? '更新余额中...' : '确认交易'}
          </Button>
        ]}
      >
        {renderConfirmModalContent()}
      </Modal>

    </Card>
  );
} 