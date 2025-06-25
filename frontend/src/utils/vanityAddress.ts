import { keccak256, toUtf8Bytes, getCreate2Address } from "ethers";

export interface VanityOptions {
  prefix: string;
  maxAttempts?: number;
  batchSize?: number;
  onProgress?: (attempts: number, rate: number) => void;
}

export interface VanityResult {
  address: string;
  salt: string;
  attempts: number;
  timeElapsed: number;
}

// 高性能 salt 生成器
export const generateOptimizedSalt = (index: number, timestamp: number): string => {
  const randomPart = Math.random().toString(36).substring(2);
  const indexPart = index.toString(36);
  const timePart = timestamp.toString(36);
  return keccak256(toUtf8Bytes(`${randomPart}-${indexPart}-${timePart}`));
};

// 优化的 CREATE2 地址计算
export const computeCreate2AddressOptimized = (
  factory: string,
  salt: string,
  bytecodeHash: string
): string => {
  return getCreate2Address(factory, salt, bytecodeHash);
};

// 主要的 vanity 地址生成函数 - 主线程版本
export const generateVanityAddress = async (
  factoryAddress: string,
  bytecodeHash: string,
  options: VanityOptions
): Promise<VanityResult | null> => {
  const {
    prefix,
    maxAttempts = 1000000,
    batchSize = 10000,
    onProgress
  } = options;

  const targetPrefix = prefix.toLowerCase();
  const startTime = Date.now();
  const timestamp = Date.now();

  for (let i = 0; i < maxAttempts; i++) {
    // 使用优化的 salt 生成
    const salt = generateOptimizedSalt(i, timestamp);
    
    try {
      // 计算地址
      const address = computeCreate2AddressOptimized(
        factoryAddress,
        salt,
        bytecodeHash
      );
      
      // 检查前缀匹配
      if (address.toLowerCase().startsWith(targetPrefix)) {
        const timeElapsed = Date.now() - startTime;
        return {
          address,
          salt,
          attempts: i + 1,
          timeElapsed
        };
      }
      
      // 进度回调 - 使用 setTimeout 避免阻塞 UI
      if (i % batchSize === 0 && i > 0) {
        const elapsed = Date.now() - startTime;
        const rate = i / (elapsed / 1000);
        
        if (onProgress) {
          // 使用微任务让 UI 有机会更新
          await new Promise(resolve => {
            setTimeout(() => {
        onProgress(i, rate);
              resolve(true);
            }, 0);
          });
        }
      }
    } catch (error) {
      console.warn(`地址计算失败 (${i}):`, error);
    }
  }

  return null;
}; 