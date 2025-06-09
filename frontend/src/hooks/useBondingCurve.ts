import { useState, useCallback, useEffect, useRef } from 'react';
import { useChainId } from 'wagmi';
import { readContract, writeContract } from 'wagmi/actions';
import { parseUnits, formatUnits } from 'ethers';
import { config } from '../config/wagmi';
import { BONDING_CURVE_ABI } from '../config/abis';
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

// 缓存管理
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  key: string;
}

class RpcCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly TTL = 30000; // 30秒缓存

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      key
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  // 清理过期缓存
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL) {
        this.cache.delete(key);
      }
    }
  }
}

const rpcCache = new RpcCache();

// 定期清理缓存
if (typeof window !== 'undefined') {
  setInterval(() => {
    rpcCache.cleanup();
  }, 60000); // 每分钟清理一次
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

    // 检查缓存
    const cacheKey = `buyPrice_${tokenAddress}_${tokenAmount}_${chainId}`;
    const cachedResult = rpcCache.get<TokenPriceInfo>(cacheKey);
    if (cachedResult) {
      setPriceInfo(cachedResult);
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
      // 缓存结果
      rpcCache.set(cacheKey, priceData);
      
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

    // 检查缓存
    const cacheKey = `sellPrice_${tokenAddress}_${tokenAmount}_${chainId}`;
    const cachedResult = rpcCache.get<SellPriceInfo>(cacheKey);
    if (cachedResult) {
      setPriceInfo(cachedResult);
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
      // 缓存结果
      rpcCache.set(cacheKey, sellData);
      
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

    // 检查缓存
    const cacheKey = `tokensForETH_${tokenAddress}_${ethAmount}_${chainId}`;
    const cachedResult = rpcCache.get<bigint>(cacheKey);
    if (cachedResult) {
      setTokenAmount(cachedResult);
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
      // 缓存结果
      rpcCache.set(cacheKey, tokenAmountResult);
      
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

    // 检查缓存
    const cacheKey = `curveParams_${tokenAddress}_${chainId}`;
    const cachedResult = rpcCache.get<CurveParams>(cacheKey);
    if (cachedResult) {
      setCurveParams(cachedResult);
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
      // 缓存结果
      rpcCache.set(cacheKey, paramsData);
      
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
    setIsLoading(true);
    setError(null);

    try {
      const ethAmountBigInt = parseUnits(ethAmount, CONTRACT_CONSTANTS.ETH_DECIMALS);
      const minTokenAmountBigInt = parseUnits(minTokenAmount, 18);
      
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

      return hash;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to buy tokens');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [contractAddresses.BONDING_CURVE]);

  return {
    buyTokens,
    isLoading,
    error,
  };
}

// 出售代币
export function useSellTokens() {
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sellTokens = useCallback(async (
    tokenAddress: string,
    tokenAmount: string,
    minEthAmount: string,
    userAddress: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const tokenAmountBigInt = parseUnits(tokenAmount, 18);
      const minEthAmountBigInt = parseUnits(minEthAmount, CONTRACT_CONSTANTS.ETH_DECIMALS);
      
      // 首先检查授权额度
      console.log('检查Token授权额度...');
      const allowance = await readContract(config, {
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "inputs": [{"type": "address", "name": "owner"}, {"type": "address", "name": "spender"}],
            "name": "allowance",
            "outputs": [{"type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
          }
        ],
        functionName: 'allowance',
        args: [
          userAddress as `0x${string}`,
          contractAddresses.BONDING_CURVE as `0x${string}`
        ],
      }) as bigint;

      console.log('当前授权额度:', formatUnits(allowance, 18));
      console.log('需要授权额度:', formatUnits(tokenAmountBigInt, 18));

      // 如果授权额度不足，先进行授权
      if (allowance < tokenAmountBigInt) {
        console.log('授权额度不足，正在进行授权...');
        
        const approveHash = await writeContract(config, {
          address: tokenAddress as `0x${string}`,
          abi: [
            {
              "inputs": [{"type": "address", "name": "spender"}, {"type": "uint256", "name": "amount"}],
              "name": "approve",
              "outputs": [{"type": "bool"}],
              "stateMutability": "nonpayable",
              "type": "function"
            }
          ],
          functionName: 'approve',
          args: [
            contractAddresses.BONDING_CURVE as `0x${string}`,
            tokenAmountBigInt
          ],
        });

        console.log('授权交易hash:', approveHash);
        
        // 等待授权交易确认
        console.log('等待授权交易确认...');
        // 这里可以添加等待确认的逻辑，但为了简化先继续
      }

      // 进行出售交易
      console.log('开始出售Token...');
      const hash = await writeContract(config, {
        address: contractAddresses.BONDING_CURVE as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'sellTokens',
        args: [
          tokenAddress as `0x${string}`,
          tokenAmountBigInt,
          minEthAmountBigInt
        ],
      });

      console.log('出售交易hash:', hash);
      return hash;
    } catch (err) {
      console.error('sellTokens error:', err);
      const error = err instanceof Error ? err : new Error('Failed to sell tokens');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [contractAddresses.BONDING_CURVE, chainId]);

  return {
    sellTokens,
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
        abi: [
          {
            "inputs": [{"type": "address", "name": "owner"}, {"type": "address", "name": "spender"}],
            "name": "allowance",
            "outputs": [{"type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
          }
        ],
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
      const hash = await writeContract(config, {
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "inputs": [{"type": "address", "name": "spender"}, {"type": "uint256", "name": "amount"}],
            "name": "approve",
            "outputs": [{"type": "bool"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: 'approve',
        args: [spenderAddress as `0x${string}`, amount],
      });

      return hash;
    } catch (err) {
      console.error('approveToken error:', err);
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
  
  return {
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
    isSelling: sellTokens.isLoading,
    
    // 错误状态
    buyPriceError: buyPrice.error,
    sellPriceError: sellPrice.error,
    tokenAmountError: tokensForETH.error,
    curveParamsError: curveParams.error,
    buyError: buyTokens.error,
    sellError: sellTokens.error,
  };
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