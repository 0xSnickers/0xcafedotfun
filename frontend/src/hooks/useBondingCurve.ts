import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useChainId, useAccount, useWriteContract, useBalance } from 'wagmi';
import { readContract, writeContract, waitForTransactionReceipt } from 'wagmi/actions';
import { parseUnits, formatUnits } from 'ethers';
import { config } from '../config/wagmi';
import { BONDING_CURVE_ABI, MEME_TOKEN_ABI } from '../config/abis';
import { CONTRACT_CONSTANTS, getContractAddresses } from '../config/contracts';

export interface TokenPriceInfo {
  ethCost: bigint;
  afterFeesCost: bigint;
  platformFee: bigint;
  creatorFee: bigint;
}

export interface SellPriceInfo {
  ethBeforeFees: bigint;
  ethReceived: bigint;
  platformFee: bigint;
  creatorFee: bigint;
}

export interface CurveParams {
  k: bigint | null;
  targetSupply: bigint | null;
  targetPrice: bigint | null;
  currentSupply: bigint | null;
  currentPrice: bigint | null;
  creator: string | null;
  isActive: boolean;
}

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

// 获取代币购买价格
export function useBuyPrice(tokenAddress: string) {
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);
  const [priceInfo, setPriceInfo] = useState<TokenPriceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const calculateBuyPrice = useCallback(async (tokenAmount: string) => {
    if (!tokenAddress || !tokenAmount || !contractAddresses.BONDING_CURVE) {
      setPriceInfo(null);
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const tokenAmountBigInt = parseUnits(tokenAmount, 18);
      
      const result = await readContract(config, {
        address: contractAddresses.BONDING_CURVE as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'calculateBuyPrice',
        args: [tokenAddress as `0x${string}`, tokenAmountBigInt],
      });

      // 检查请求是否被取消
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const [ethCost, afterFeesCost] = result as [bigint, bigint];
      
      // 计算费用
      const totalFees = afterFeesCost - ethCost;
      const platformFeePercent = BigInt(CONTRACT_CONSTANTS.PLATFORM_FEE_PERCENTAGE);
      const feeBase = BigInt(CONTRACT_CONSTANTS.FEE_BASE);
      
      const platformFee = (totalFees * platformFeePercent) / feeBase;
      const creatorFee = totalFees - platformFee;
      
      const priceData: TokenPriceInfo = {
        ethCost,
        afterFeesCost,
        platformFee,
        creatorFee,
      };

      console.log('calculateBuyPrice success:', priceData);
      
      setPriceInfo(priceData);
      
    } catch (err) {
      if (abortControllerRef.current?.signal.aborted) {
        return; // 忽略取消的请求
      }
      
      console.error('calculateBuyPrice error:', err);
      setError(err instanceof Error ? err : new Error('Failed to calculate buy price'));
      setPriceInfo(null);
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
      setIsLoading(false);
      }
    }
  }, [tokenAddress, contractAddresses.BONDING_CURVE, chainId]);

  return {
    priceInfo,
    calculateBuyPrice,
    isLoading,
    error,
  };
}

// 获取代币出售价格
export function useSellPrice(tokenAddress: string) {
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);
  const [priceInfo, setPriceInfo] = useState<SellPriceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const calculateSellPrice = useCallback(async (tokenAmount: string) => {
    if (!tokenAddress || !tokenAmount || !contractAddresses.BONDING_CURVE) {
      setPriceInfo(null);
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const tokenAmountBigInt = parseUnits(tokenAmount, 18);
      
      const result = await readContract(config, {
        address: contractAddresses.BONDING_CURVE as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'calculateSellPrice',
        args: [tokenAddress as `0x${string}`, tokenAmountBigInt],
      });

      // 检查请求是否被取消
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const [ethBeforeFees, ethReceived] = result as [bigint, bigint];
      
      // 计算费用
      const totalFees = ethBeforeFees - ethReceived;
      const platformFeePercent = BigInt(CONTRACT_CONSTANTS.PLATFORM_FEE_PERCENTAGE);
      const feeBase = BigInt(CONTRACT_CONSTANTS.FEE_BASE);
      
      const platformFee = (totalFees * platformFeePercent) / feeBase;
      const creatorFee = totalFees - platformFee;

      const sellData: SellPriceInfo = {
        ethBeforeFees,
        ethReceived,
        platformFee,
        creatorFee,
      };

      setPriceInfo(sellData);
      
    } catch (err) {
      if (abortControllerRef.current?.signal.aborted) {
        return; // 忽略取消的请求
      }
      
      console.error('calculateSellPrice error:', err);
      setError(err instanceof Error ? err : new Error('Failed to calculate sell price'));
      setPriceInfo(null);
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
      setIsLoading(false);
      }
    }
  }, [tokenAddress, contractAddresses.BONDING_CURVE, chainId]);

  return {
    priceInfo,
    calculateSellPrice,
    isLoading,
    error,
  };
}

// 获取根据ETH数量能买到的代币数量
export function useTokensForETH(tokenAddress: string) {
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);
  const [tokenAmount, setTokenAmount] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const calculateTokensForETH = useCallback(async (ethAmount: string) => {
    if (!tokenAddress || !ethAmount || !contractAddresses.BONDING_CURVE) {
      setTokenAmount(null);
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const ethAmountBigInt = parseUnits(ethAmount, CONTRACT_CONSTANTS.ETH_DECIMALS);
      
      const result = await readContract(config, {
        address: contractAddresses.BONDING_CURVE as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'calculateTokensForEthPrecise',
        args: [tokenAddress as `0x${string}`, ethAmountBigInt],
      });

      // 检查请求是否被取消
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const tokenAmountResult = result as bigint;
      setTokenAmount(tokenAmountResult);
      
    } catch (err) {
      if (abortControllerRef.current?.signal.aborted) {
        return; // 忽略取消的请求
      }
      
      console.error('calculateTokensForETH error:', err);
      setError(err instanceof Error ? err : new Error('Failed to calculate tokens for ETH'));
      setTokenAmount(null);
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
      setIsLoading(false);
      }
    }
  }, [tokenAddress, contractAddresses.BONDING_CURVE, chainId]);

  return {
    tokenAmount,
    calculateTokensForETH,
    isLoading,
    error,
  };
}

// 获取Curve参数
export function useCurveParams(tokenAddress: string) {
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);
  const [curveParams, setCurveParams] = useState<CurveParams | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchCurveParams = useCallback(async () => {
    if (!tokenAddress || !contractAddresses.BONDING_CURVE) {
      setCurveParams(null);
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const result = await readContract(config, {
        address: contractAddresses.BONDING_CURVE as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'getCurveParams',
        args: [tokenAddress as `0x${string}`],
      });

      // 检查请求是否被取消
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const [k, targetSupply, targetPrice, currentSupply, currentPrice, creator, isActive] = result as [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        string,
        boolean
      ];

      const paramsData: CurveParams = {
        k,
        targetSupply,
        targetPrice,
        currentSupply,
        currentPrice,
        creator,
        isActive,
      };

      setCurveParams(paramsData);
      
    } catch (err) {
      if (abortControllerRef.current?.signal.aborted) {
        return; // 忽略取消的请求
      }
      
      console.error('fetchCurveParams error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch curve params'));
      setCurveParams(null);
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
      setIsLoading(false);
    }
    }
  }, [tokenAddress, contractAddresses.BONDING_CURVE, chainId]);

  return {
    curveParams,
    fetchCurveParams,
    isLoading,
    error,
  };
}

// 购买代币
export function useBuyTokens() {
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const buyTokens = useCallback(async (
    tokenAddress: string,
    ethAmount: string,
    minTokenAmount: string
  ) => {
    console.log('🚀 [BUY HOOK DEBUG] buyTokens - 开始执行购买交易');
    console.log('🚀 [BUY HOOK DEBUG] 输入参数:', {
      tokenAddress,
      ethAmount,
      minTokenAmount,
      chainId,
      contractAddress: contractAddresses.BONDING_CURVE
    });
    
    setIsLoading(true);
    setError(null);

    try {
      const ethAmountBigInt = parseUnits(ethAmount, CONTRACT_CONSTANTS.ETH_DECIMALS);
      const minTokenAmountBigInt = parseUnits(minTokenAmount, 18);
      
      console.log('🔍 [BUY HOOK DEBUG] 解析后的参数:', {
        ethAmountBigInt: ethAmountBigInt.toString(),
        minTokenAmountBigInt: minTokenAmountBigInt.toString(),
        ethAmountBigIntHex: '0x' + ethAmountBigInt.toString(16),
        minTokenAmountBigIntHex: '0x' + minTokenAmountBigInt.toString(16)
      });
      
      console.log('🔍 [BUY HOOK DEBUG] 合约调用参数:', {
        address: contractAddresses.BONDING_CURVE,
        functionName: 'buyTokens',
        args: [
          tokenAddress,
          minTokenAmountBigInt.toString()
        ],
        value: ethAmountBigInt.toString(),
        valueHex: '0x' + ethAmountBigInt.toString(16)
      });
      
      console.log('🚀 [BUY HOOK DEBUG] 调用 writeContract');
      const hash = await writeContract(config, {
        address: contractAddresses.BONDING_CURVE as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'buyTokens',
        args: [
          tokenAddress as `0x${string}`,
          minTokenAmountBigInt
        ],
        value: ethAmountBigInt, // 直接发送ETH
      });
      
      console.log('✅ [BUY HOOK DEBUG] writeContract 成功，交易哈希:', hash);
      return hash;
      
    } catch (err) {
      console.error('❌ [BUY HOOK DEBUG] buyTokens 异常:', err);
      console.error('❌ [BUY HOOK DEBUG] 错误详情:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        name: err instanceof Error ? err.name : 'Unknown',
        stack: err instanceof Error ? err.stack : undefined,
        fullError: err
      });
      
      // 特别检查余额不足错误
      if (err instanceof Error) {
        if (err.message.includes('insufficient funds') || 
            err.message.includes('exceeds the balance') ||
            err.message.includes('CallExecutionError')) {
          console.error('❌ [BUY HOOK DEBUG] 检测到余额不足错误:', err.message);
        }
      }
      
      const error = err instanceof Error ? err : new Error('Failed to buy tokens');
      setError(error);
      throw error;
    } finally {
      console.log('🏁 [BUY HOOK DEBUG] buyTokens 结束');
      setIsLoading(false);
    }
  }, [contractAddresses.BONDING_CURVE, chainId]);

  return {
    buyTokens,
    isLoading,
    error,
  };
}

// 出售代币
const useSellTokens = () => {
  const { writeContractAsync, isPending: isSelling, error: sellError } = useWriteContract();
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);

  const sellTokens = useCallback(async (tokenAddress: string, amount: string, minEthReceived: string) => {
    if (!BONDING_CURVE_ABI || !contractAddresses.BONDING_CURVE) {
      throw new Error("Contract address or ABI not found");
    }
    try {
      console.log('[SELL HOOK DEBUG] Input parameters:');
      console.log('  - tokenAddress:', tokenAddress);
      console.log('  - amount (string):', amount);
      console.log('  - minEthReceived (string):', minEthReceived);
      
      const tokenAmount = parseUnits(amount, 18);
      const minEthAmount = parseUnits(minEthReceived, 18);
      
      console.log('[SELL HOOK DEBUG] Parsed values:');
      console.log('  - tokenAmount (BigInt):', tokenAmount.toString());
      console.log('  - minEthAmount (BigInt):', minEthAmount.toString());
      console.log('  - contract address:', contractAddresses.BONDING_CURVE);

      return await writeContractAsync({
        address: contractAddresses.BONDING_CURVE as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'sellTokens',
        args: [tokenAddress as `0x${string}`, tokenAmount, minEthAmount],
      });
    } catch (e: any) {
      console.error("Sell tokens error:", e);
      throw e;
    }
  }, [writeContractAsync, contractAddresses.BONDING_CURVE]);

  return { sellTokens, isSelling, sellError };
};

// 检查Token是否已毕业
export function useTokenGraduationStatus(tokenAddress: string) {
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);
  const [isGraduated, setIsGraduated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const checkGraduationStatus = useCallback(async () => {
    if (!tokenAddress || !contractAddresses.BONDING_CURVE) {
      setIsGraduated(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await readContract(config, {
        address: contractAddresses.BONDING_CURVE as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'curveParams',
        args: [tokenAddress as `0x${string}`],
      });

      // curveParams 返回的结构体包含: [k, targetSupply, targetPrice, initialPrice, currentSupply, graduated, uniswapPair, liquidityTokens]
      const params = result as [bigint, bigint, bigint, bigint, bigint, boolean, string, bigint];
      const graduated = params[5]; // 第6个字段是 graduated
      
      console.log('checkGraduationStatus result:', {
        tokenAddress,
        graduated,
        allParams: params
      });
      
      setIsGraduated(graduated);
    } catch (err) {
      console.error('checkGraduationStatus error:', err);
      setError(err instanceof Error ? err : new Error('Failed to check graduation status'));
      setIsGraduated(null);
    } finally {
      setIsLoading(false);
    }
  }, [tokenAddress, contractAddresses.BONDING_CURVE]);

  return {
    isGraduated,
    checkGraduationStatus,
    isLoading,
    error,
  };
}

// 检查Token授权额度
export function useTokenAllowance(tokenAddress: string, spenderAddress: string) {
  const chainId = useChainId();
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const checkAllowance = useCallback(async (userAddress: string) => {
    if (!tokenAddress || !spenderAddress || !userAddress) {
      setAllowance(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await readContract(config, {
        address: tokenAddress as `0x${string}`,
        abi: MEME_TOKEN_ABI,
        functionName: 'allowance',
        args: [userAddress as `0x${string}`, spenderAddress as `0x${string}`],
      });

      setAllowance(result as bigint);
    } catch (err) {
      console.error('checkAllowance error:', err);
      setError(err instanceof Error ? err : new Error('Failed to check allowance'));
      setAllowance(null);
    } finally {
      setIsLoading(false);
    }
  }, [tokenAddress, spenderAddress]);

  return {
    allowance,
    checkAllowance,
    isLoading,
    error,
  };
}

// 授权Token
export function useApproveToken() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const approveToken = useCallback(async (
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      // 使用无限额度授权 (2^256 - 1)
      const infiniteAmount = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      
      console.log('🔍 [APPROVE DEBUG] 开始无限额度授权:', {
        tokenAddress,
        spenderAddress,
        requestedAmount: amount.toString(),
        infiniteAmount: infiniteAmount.toString()
      });

      const hash = await writeContract(config, {
        address: tokenAddress as `0x${string}`,
        abi: MEME_TOKEN_ABI,
        functionName: 'approve',
        args: [spenderAddress as `0x${string}`, infiniteAmount],
      });

      console.log('✅ [APPROVE DEBUG] 无限额度授权交易已提交:', hash);
      return hash;
    } catch (err) {
      console.error('❌ [APPROVE DEBUG] approveToken error:', err);
      const error = err instanceof Error ? err : new Error('Failed to approve token');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    approveToken,
    isLoading,
    error,
  };
}

// 组合Hook - 完整的BondingCurve功能
export function useBondingCurve(tokenAddress: string) {
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);
  
  const buyPrice = useBuyPrice(tokenAddress);
  const sellPrice = useSellPrice(tokenAddress);
  const tokensForETH = useTokensForETH(tokenAddress);
  const curveParams = useCurveParams(tokenAddress);
  const buyTokens = useBuyTokens();
  const sellTokens = useSellTokens();
  
  return useMemo(() => ({
    // 价格计算
    priceInfo: buyPrice.priceInfo,
    calculateBuyPrice: buyPrice.calculateBuyPrice,
    sellPriceInfo: sellPrice.priceInfo,
    calculateSellPrice: sellPrice.calculateSellPrice,
    tokenAmount: tokensForETH.tokenAmount,
    calculateTokensForETH: tokensForETH.calculateTokensForETH,
    
    // Curve参数
    curveParams: curveParams.curveParams,
    fetchCurveParams: curveParams.fetchCurveParams,
    
    // 交易功能
    buyTokens: buyTokens.buyTokens,
    sellTokens: sellTokens.sellTokens,
    
    // 加载状态
    isBuyPriceLoading: buyPrice.isLoading,
    isSellPriceLoading: sellPrice.isLoading,
    isTokenAmountLoading: tokensForETH.isLoading,
    isCurveParamsLoading: curveParams.isLoading,
    isBuying: buyTokens.isLoading,
    isSelling: sellTokens.isSelling,
    
    // 错误状态
    buyPriceError: buyPrice.error,
    sellPriceError: sellPrice.error,
    tokenAmountError: tokensForETH.error,
    curveParamsError: curveParams.error,
    buyError: buyTokens.error,
    sellError: sellTokens.sellError,
  }), [
    // 价格计算 - 只依赖状态值，不依赖函数
    buyPrice.priceInfo,
    sellPrice.priceInfo,
    tokensForETH.tokenAmount,
    
    // Curve参数
    curveParams.curveParams,
    
    // 加载状态
    buyPrice.isLoading,
    sellPrice.isLoading,
    tokensForETH.isLoading,
    curveParams.isLoading,
    buyTokens.isLoading,
    sellTokens.isSelling,
    
    // 错误状态
    buyPrice.error,
    sellPrice.error,
    tokensForETH.error,
    curveParams.error,
    buyTokens.error,
    sellTokens.sellError,
  ]);
}

// 工具函数
export const bondingCurveUtils = {
  formatETH: (amount: bigint | null | undefined) => {
    if (amount === null || amount === undefined) return '0';
    try {
      return formatUnits(amount, CONTRACT_CONSTANTS.ETH_DECIMALS);
    } catch (error) {
      console.warn('Error formatting ETH:', error);
      return '0';
    }
  },
  formatToken: (amount: bigint | null | undefined, decimals: number = 4) => {
    if (amount === null || amount === undefined) return '0';
    try {
      const formatted = formatUnits(amount, 18);
      const num = parseFloat(formatted);
      
      // 如果数字很小，显示更多小数位
      if (num < 0.0001 && num > 0) {
        return formatted;
      }
      
      // 否则限制小数位数
      return num.toFixed(decimals);
    } catch (error) {
      console.warn('Error formatting token:', error);
      return '0';
    }
  },
  formatTokenDisplay: (amount: bigint | null | undefined) => {
    // 专门用于UI显示的格式化函数，固定4位小数
    if (amount === null || amount === undefined) return '0.0000';
    try {
      const formatted = formatUnits(amount, 18);
      const num = parseFloat(formatted);
      return num.toFixed(4);
    } catch (error) {
      console.warn('Error formatting token for display:', error);
      return '0.0000';
    }
  },
  parseETH: (amount: string) => parseUnits(amount, CONTRACT_CONSTANTS.ETH_DECIMALS),
  parseToken: (amount: string) => parseUnits(amount, 18),
  
  // 计算滑点
  calculateSlippage: (expected: bigint, actual: bigint) => {
    if (expected === BigInt(0)) return 0;
    const diff = expected > actual ? expected - actual : actual - expected;
    return Number((diff * BigInt(10000)) / expected) / 100; // 返回百分比
  },
  
  // 计算最小接收数量（含滑点保护）
  calculateMinReceive: (amount: bigint, slippagePercent: number) => {
    const slippage = BigInt(Math.floor(slippagePercent * 100));
    return (amount * (BigInt(10000) - slippage)) / BigInt(10000);
  },
}; 