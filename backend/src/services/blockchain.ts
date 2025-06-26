import { viemClient } from '../clients/viemClient'
import { toHex, decodeAbiParameters, keccak256, pad } from 'viem'


export interface LockInfo {
    user: `0x${string}`
    startTime: string
    amount: string
}

export async function getEthBalance(address: `0x${string}`) {
    const balance = await viemClient.getBalance({ address })
    return balance.toString()
}

/**
 * 获取合约指定 slot 的数据
 * @param address 合约地址 
 * @param slot 插槽位置
 * @returns 原始存储数据
 */
export async function getStorageAt(address: `0x${string}`, slot: number) {
    try {
        const slotHex = toHex(slot)
        const storageValue = await viemClient.getStorageAt({
        address: address,
            slot: slotHex
    })
        
        if (!storageValue) {
            throw new Error(`Storage slot ${slot} is empty or not found`)
        }
        
        return {
            slot: slot,
            raw: storageValue,
            address: address
        }
    } catch (error) {
        console.error(`❌ Error reading slot ${slot}:`, error)
        throw error
    }
}

/**
 * 从存储数据中解码地址
 * @param storageData 存储数据
 * @returns 解码后的地址
 */
export function decodeAddressFromStorage(storageData: `0x${string}`): `0x${string}` {
    try {
        if (!storageData || storageData === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            throw new Error('Storage data is empty or zero')
        }
        
        const [address] = decodeAbiParameters([{ type: 'address' }], storageData)
        return address as `0x${string}`
    } catch (error) {
        console.error('❌ Error decoding address:', error)
        throw error
    }
}

/**
 * 获取 LiquidityManager 合约中 bondingCurve 地址 (Slot 4)
 * @param liquidityManagerAddress LiquidityManager合约地址
 * @returns bondingCurve 地址
 */
export async function getBondingCurveAddress(liquidityManagerAddress: `0x${string}`): Promise<`0x${string}`> {
    try {
        const bondingCurveSlot = 4
        const storageResult = await getStorageAt(liquidityManagerAddress, bondingCurveSlot)
        const bondingCurveAddress = decodeAddressFromStorage(storageResult.raw)
        
        console.log(`✅ BondingCurve address from slot ${bondingCurveSlot}:`, bondingCurveAddress)
        return bondingCurveAddress
    } catch (error) {
        console.error('❌ Error getting bondingCurve address:', error)
        throw error
    }
}

/**
 * 获取 LiquidityManager 合约中 uniswapRouter 地址
 * @param liquidityManagerAddress LiquidityManager合约地址
 * @returns uniswapRouter 地址
 */
export async function getUniswapRouterAddress(liquidityManagerAddress: `0x${string}`): Promise<`0x${string}`> {
    try {
        // uniswapRouter 在 slot 3
        const uniswapRouterSlot = 3
        const slotHex = toHex(uniswapRouterSlot)
        
        const storageValue = await viemClient.getStorageAt({
            address: liquidityManagerAddress,
            slot: slotHex
        })
        
        if (!storageValue || storageValue === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            throw new Error('UniswapRouter address not set or contract not found')
        }
        
        // 解码地址
        const [uniswapRouterAddress] = decodeAbiParameters([{ type: 'address' }], storageValue)
        
        console.log(`✅ UniswapRouter address from slot ${uniswapRouterSlot}:`, uniswapRouterAddress)
        return uniswapRouterAddress as `0x${string}`
        
    } catch (error) {
        console.error('❌ Error getting uniswapRouter address:', error)
        throw error
    }
}



/**
 * 获取代币的流动性数据
 * @param liquidityManagerAddress LiquidityManager合约地址
 * @param tokenAddress 代币地址
 * @returns 流动性数据
 */
export async function getGraduatedLiquidityData(
    liquidityManagerAddress: `0x${string}`,
    tokenAddress: `0x${string}`
) {
    try {
        // graduatedParams mapping 在 slot 2
        const graduatedParamsSlot = 2
        
        // 计算 mapping slot: keccak256(key + slot) - Solidity mapping 标准方法
        const keyPadded = pad(tokenAddress, { size: 32 })
        const slotPadded = pad(toHex(graduatedParamsSlot), { size: 32 })
        const concatenated = (keyPadded + slotPadded.slice(2)) as `0x${string}` // 去掉第二个的0x前缀
        const baseStorageSlot = BigInt(keccak256(concatenated))
        
        // GraduatedLiquidityData 结构体有7个字段，需要读取多个slot
        const liquidityData = {
            liquidityTokenAmount: '0',
            liquidityEthAmount: '0', 
            uniswapPair: '0x0000000000000000000000000000000000000000' as `0x${string}`,
            liquidityTokens: '0',
            liquidityAdded: false,
            liquidityLocked: false,
            addedAt: '0'
        }
        
        // 读取各个字段 (每个字段占一个slot)
        for (let i = 0; i < 7; i++) {
            const slotToRead = toHex(baseStorageSlot + BigInt(i))
            const storageValue = await viemClient.getStorageAt({
                address: liquidityManagerAddress,
                slot: slotToRead
            })
            
            if (storageValue && storageValue !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                switch (i) {
                    case 0: // liquidityTokenAmount
                        const [tokenAmount] = decodeAbiParameters([{ type: 'uint256' }], storageValue)
                        liquidityData.liquidityTokenAmount = tokenAmount.toString()
                        break
                    case 1: // liquidityEthAmount
                        const [ethAmount] = decodeAbiParameters([{ type: 'uint256' }], storageValue)
                        liquidityData.liquidityEthAmount = ethAmount.toString()
                        break
                    case 2: // uniswapPair
                        const [pairAddress] = decodeAbiParameters([{ type: 'address' }], storageValue)
                        liquidityData.uniswapPair = pairAddress as `0x${string}`
                        break
                    case 3: // liquidityTokens
                        const [liquidityTokens] = decodeAbiParameters([{ type: 'uint256' }], storageValue)
                        liquidityData.liquidityTokens = liquidityTokens.toString()
                        break
                    case 4: // liquidityAdded (bool)
                        const [liquidityAdded] = decodeAbiParameters([{ type: 'bool' }], storageValue)
                        liquidityData.liquidityAdded = liquidityAdded
                        break
                    case 5: // liquidityLocked (bool)
                        const [liquidityLocked] = decodeAbiParameters([{ type: 'bool' }], storageValue)
                        liquidityData.liquidityLocked = liquidityLocked
                        break
                    case 6: // addedAt
                        const [addedAt] = decodeAbiParameters([{ type: 'uint256' }], storageValue)
                        liquidityData.addedAt = addedAt.toString()
                        break
                }
            }
        }
        
        console.log(`✅ Liquidity data for token ${tokenAddress}:`, liquidityData)
        return liquidityData
        
    } catch (error) {
        console.error('❌ Error getting graduated liquidity data:', error)
        throw error
    }
}



