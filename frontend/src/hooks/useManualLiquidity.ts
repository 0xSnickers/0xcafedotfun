import { useState, useCallback } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { writeContract, waitForTransactionReceipt, readContract } from 'wagmi/actions';
import { config } from '../config/wagmi';
import { getContractAddresses } from '../config/contracts';
import { BONDING_CURVE_ABI } from '../config/abis';
import { formatUnits } from 'ethers';

export interface GraduatedLiquidityData {
  liquidityTokenAmount: bigint;
  liquidityEthAmount: bigint;
}

export interface AddLiquidityResult {
  amountToken: bigint;
  amountETH: bigint;
  liquidity: bigint;
  pair: string;
}

export function useManualLiquidity(tokenAddress: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [liquidityData, setLiquidityData] = useState<GraduatedLiquidityData | null>(null);
  const [hasLiquidityData, setHasLiquidityData] = useState<boolean | null>(null);
  
  const { address } = useAccount();
  const chainId = useChainId();
  const contractAddresses = getContractAddresses(chainId);

  // 获取毕业后的流动性数据
  const fetchLiquidityData = useCallback(async () => {
    if (!tokenAddress || !contractAddresses.BONDING_CURVE) {
      setLiquidityData(null);
      setHasLiquidityData(false);
      return;
    }

    try {
      const result = await readContract(config, {
        address: contractAddresses.BONDING_CURVE as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'graduatedParams',
        args: [tokenAddress as `0x${string}`],
      }) as [bigint, bigint];

      const [liquidityTokenAmount, liquidityEthAmount] = result;
      
      if (liquidityTokenAmount > 0n && liquidityEthAmount > 0n) {
        setLiquidityData({
          liquidityTokenAmount,
          liquidityEthAmount
        });
        setHasLiquidityData(true);
      } else {
        setLiquidityData(null);
        setHasLiquidityData(false);
      }
    } catch (err) {
      console.error('Failed to fetch liquidity data:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch liquidity data'));
      setLiquidityData(null);
      setHasLiquidityData(false);
    }
  }, [tokenAddress, contractAddresses.BONDING_CURVE]);

  // 手动添加流动性到Uniswap
  const addLiquidityToUniswap = useCallback(async (): Promise<AddLiquidityResult | null> => {
    if (!address || !tokenAddress || !contractAddresses.BONDING_CURVE) {
      throw new Error('Missing required parameters');
    }

    if (!liquidityData) {
      throw new Error('No liquidity data available');
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🚀 [DEBUG] Starting manual liquidity addition');
      console.log('🚀 [DEBUG] Token address:', tokenAddress);
      console.log('🚀 [DEBUG] Liquidity data:', {
        tokenAmount: liquidityData.liquidityTokenAmount.toString(),
        ethAmount: liquidityData.liquidityEthAmount.toString(),
        tokenAmountFormatted: formatUnits(liquidityData.liquidityTokenAmount, 18),
        ethAmountFormatted: formatUnits(liquidityData.liquidityEthAmount, 18)
      });

      // 调用合约的addLiquidityToUniswap方法
      const hash = await writeContract(config, {
        address: contractAddresses.BONDING_CURVE as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'addLiquidityToUniswap',
        args: [tokenAddress as `0x${string}`],
      });

      console.log('✅ [DEBUG] Transaction submitted:', hash);

      // 等待交易确认
      const receipt = await waitForTransactionReceipt(config, { 
        hash,
        timeout: 60000 // 60秒超时
      });

      console.log('✅ [DEBUG] Transaction confirmed:', receipt);

      if (receipt.status !== 'success') {
        throw new Error('Transaction failed');
      }

      // 解析交易日志以获取返回值
      // 注意：实际的返回值解析可能需要根据具体的ABI和交易日志来实现
      // 这里返回一个模拟的结果
      const result: AddLiquidityResult = {
        amountToken: liquidityData.liquidityTokenAmount,
        amountETH: liquidityData.liquidityEthAmount,
        liquidity: 0n, // 需要从交易日志中解析
        pair: '0x0000000000000000000000000000000000000000' // 需要从交易日志中解析
      };

      return result;
    } catch (err) {
      console.error('❌ [DEBUG] Manual liquidity addition failed:', err);
      const error = err instanceof Error ? err : new Error('Failed to add liquidity');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [address, tokenAddress, contractAddresses.BONDING_CURVE, liquidityData]);

  // 检查是否可以添加流动性
  const canAddLiquidity = useCallback(() => {
    return !!(
      address && 
      tokenAddress && 
      contractAddresses.BONDING_CURVE && 
      liquidityData && 
      liquidityData.liquidityTokenAmount > 0n && 
      liquidityData.liquidityEthAmount > 0n &&
      !isLoading
    );
  }, [address, tokenAddress, contractAddresses.BONDING_CURVE, liquidityData, isLoading]);

  return {
    // 状态
    isLoading,
    error,
    liquidityData,
    hasLiquidityData,
    
    // 方法
    fetchLiquidityData,
    addLiquidityToUniswap,
    canAddLiquidity: canAddLiquidity(),
    
    // 格式化数据
    formattedLiquidityData: liquidityData ? {
      tokenAmount: formatUnits(liquidityData.liquidityTokenAmount, 18),
      ethAmount: formatUnits(liquidityData.liquidityEthAmount, 18)
    } : null
  };
} 