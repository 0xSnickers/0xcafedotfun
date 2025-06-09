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

// 主要的 vanity 地址生成函数
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
      
      // 进度回调
      if (i % batchSize === 0 && i > 0 && onProgress) {
        const elapsed = Date.now() - startTime;
        const rate = i / (elapsed / 1000);
        onProgress(i, rate);
      }
    } catch (error) {
      console.warn(`地址计算失败 (${i}):`, error);
    }
  }

  return null;
};

// Web Worker 版本（更高性能，但需要额外设置）
export const generateVanityAddressWorker = async (
  factoryAddress: string,
  bytecodeHash: string,
  options: VanityOptions
): Promise<VanityResult | null> => {
  return new Promise((resolve, reject) => {
    // 检查 Web Worker 支持
    if (typeof Worker === 'undefined') {
      console.warn('Web Worker 不可用，使用主线程计算');
      return generateVanityAddress(factoryAddress, bytecodeHash, options)
        .then(resolve)
        .catch(reject);
    }

    // 创建内联 Worker
    const workerCode = `
      import { keccak256, toUtf8Bytes, getCreate2Address } from "ethers";
      
      self.onmessage = function(e) {
        const { factoryAddress, bytecodeHash, options } = e.data;
        const { prefix, maxAttempts = 1000000, batchSize = 10000 } = options;
        
        const targetPrefix = prefix.toLowerCase();
        const startTime = Date.now();
        const timestamp = Date.now();
        
        for (let i = 0; i < maxAttempts; i++) {
          // Salt 生成
          const randomPart = Math.random().toString(36).substring(2);
          const indexPart = i.toString(36);
          const timePart = timestamp.toString(36);
          const salt = keccak256(toUtf8Bytes(\`\${randomPart}-\${indexPart}-\${timePart}\`));
          
          try {
            const address = getCreate2Address(factoryAddress, salt, bytecodeHash);
            
            if (address.toLowerCase().startsWith(targetPrefix)) {
              const timeElapsed = Date.now() - startTime;
              self.postMessage({
                success: true,
                result: { address, salt, attempts: i + 1, timeElapsed }
              });
              return;
            }
            
            if (i % batchSize === 0 && i > 0) {
              const elapsed = Date.now() - startTime;
              const rate = i / (elapsed / 1000);
              self.postMessage({
                progress: true,
                attempts: i,
                rate: rate
              });
            }
          } catch (error) {
            // 忽略单次计算错误
          }
        }
        
        self.postMessage({ success: false, result: null });
      };
    `;

    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));

      worker.onmessage = (e) => {
        const { success, result, progress, attempts, rate } = e.data;
        
        if (progress && options.onProgress) {
          options.onProgress(attempts, rate);
        } else if (success !== undefined) {
          worker.terminate();
          resolve(result);
        }
      };

      worker.onerror = (error) => {
        worker.terminate();
        reject(error);
      };

      worker.postMessage({ factoryAddress, bytecodeHash, options });
    } catch (error) {
      // Fallback 到主线程
      generateVanityAddress(factoryAddress, bytecodeHash, options)
        .then(resolve)
        .catch(reject);
    }
  });
}; 