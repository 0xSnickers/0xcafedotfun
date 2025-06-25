import { viemClient, walletClient } from '../clients/viemClient'
import { getContract, formatEther } from 'viem'

// LiquidityManager 合约 ABI - 使用更简单的格式
const LIQUIDITY_MANAGER_ABI = [
    {
        type: 'function',
        name: 'addLiquidityToUniswap',
        inputs: [{ name: 'tokenAddress', type: 'address' }],
        outputs: [
            { name: 'amountToken', type: 'uint256' },
            { name: 'amountETH', type: 'uint256' },
            { name: 'liquidity', type: 'uint256' },
            { name: 'pair', type: 'address' }
        ],
        stateMutability: 'nonpayable'
    },
    {
        type: 'function',
        name: 'getLiquidityInfo',
        inputs: [{ name: 'tokenAddress', type: 'address' }],
        outputs: [
            { name: 'liquidityTokenAmount', type: 'uint256' },
            { name: 'liquidityEthAmount', type: 'uint256' },
            { name: 'uniswapPair', type: 'address' },
            { name: 'liquidityTokens', type: 'uint256' },
            { name: 'liquidityAdded', type: 'bool' },
            { name: 'liquidityLocked', type: 'bool' },
            { name: 'addedAt', type: 'uint256' }
        ],
        stateMutability: 'view'
    },
    {
        type: 'event',
        name: 'LiquidityAdded',
        inputs: [
            { name: 'token', type: 'address', indexed: true },
            { name: 'pair', type: 'address', indexed: true },
            { name: 'amountToken', type: 'uint256' },
            { name: 'amountETH', type: 'uint256' },
            { name: 'liquidity', type: 'uint256' }
        ]
    }
] as const

interface GraduationEvent {
    token: string
    finalSupply: string
    totalRaised: string
    marketCap: string
    liquidityTokens: string
    liquidityEth: string
}

interface LiquidityDataStoredEvent {
    token: string
    liquidityTokenAmount: string
    liquidityEthAmount: string
}

export class LiquidityMonitor {
    private bondingCurveAddress: `0x${string}`
    private liquidityManagerAddress: `0x${string}`
    private isMonitoring = false
    
    constructor(bondingCurveAddress: `0x${string}`, liquidityManagerAddress: `0x${string}`) {
        this.bondingCurveAddress = bondingCurveAddress
        this.liquidityManagerAddress = liquidityManagerAddress
    }

    /**
     * 开始监听代币毕业事件
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            console.log('⚠️ Monitoring is already running')
            return
        }

        // 检查是否配置了私钥
        if (!process.env.PRIVATE_KEY_LOCAL) {
            console.log('⚠️ PRIVATE_KEY_LOCAL not configured. Monitor will run in read-only mode.')
            console.log('   Set PRIVATE_KEY_LOCAL environment variable to enable automatic liquidity addition.')
        } else {
            console.log('✅ Wallet configured for automatic liquidity addition')
            console.log(`🔑 Account: ${walletClient.account?.address}`)
        }

        this.isMonitoring = true
        console.log('🚀 Starting liquidity monitoring...')
        console.log(`📊 BondingCurve: ${this.bondingCurveAddress}`)
        console.log(`💧 LiquidityManager: ${this.liquidityManagerAddress}`)

        // 监听 TokenGraduatedByMarketCap 事件
        viemClient.watchEvent({
            address: this.bondingCurveAddress,
            event: {
                type: 'event',
                name: 'TokenGraduatedByMarketCap',
                inputs: [
                    { name: 'token', type: 'address', indexed: true },
                    { name: 'finalSupply', type: 'uint256' },
                    { name: 'totalRaised', type: 'uint256' },
                    { name: 'marketCap', type: 'uint256' },
                    { name: 'uniswapPair', type: 'address', indexed: true },
                    { name: 'liquidityTokens', type: 'uint256' },
                    { name: 'liquidityEth', type: 'uint256' }
                ]
            },
            onLogs: (logs) => {
                logs.forEach(log => {
                    this.handleGraduationEvent(log.args as any)
                })
            }
        })

        // 监听 LiquidityDataStored 事件（在 LiquidityManager 中）
        viemClient.watchEvent({
            address: this.liquidityManagerAddress,
            event: {
                type: 'event',
                name: 'LiquidityDataStored',
                inputs: [
                    { name: 'token', type: 'address', indexed: true },
                    { name: 'liquidityTokenAmount', type: 'uint256' },
                    { name: 'liquidityEthAmount', type: 'uint256' }
                ]
            },
            onLogs: (logs) => {
                logs.forEach(log => {
                    this.handleLiquidityDataStored(log.args as any)
                })
            }
        })

        console.log('👂 Event listeners activated!')
    }

    /**
     * 停止监听
     */
    stopMonitoring() {
        this.isMonitoring = false
        console.log('🛑 Liquidity monitoring stopped')
    }

    /**
     * 处理代币毕业事件
     */
    private async handleGraduationEvent(event: GraduationEvent) {
        console.log('🎓 Token graduated!', {
            token: event.token,
            marketCap: formatEther(BigInt(event.marketCap)) + ' ETH',
            liquidityTokens: formatEther(BigInt(event.liquidityTokens)),
            liquidityEth: formatEther(BigInt(event.liquidityEth)) + ' ETH'
        })

        // 可以在这里添加额外的验证逻辑
        // 比如检查是否是我们关心的代币等
    }

    /**
     * 处理流动性数据存储事件（这是我们要监听的关键事件）
     */
    private async handleLiquidityDataStored(event: LiquidityDataStoredEvent) {
        console.log('💾 Liquidity data stored!', {
            token: event.token,
            liquidityTokenAmount: formatEther(BigInt(event.liquidityTokenAmount)),
            liquidityEthAmount: formatEther(BigInt(event.liquidityEthAmount)) + ' ETH'
        })

        // 直接执行添加流动性操作，不等待区块确认
        await this.autoAddLiquidity(event.token as `0x${string}`)
    }

    /**
     * 自动添加流动性
     */
    private async autoAddLiquidity(tokenAddress: `0x${string}`) {
        try {
            console.log(`🔄 Starting auto liquidity addition for token: ${tokenAddress}`)

            // 检查是否配置了私钥
            if (!process.env.PRIVATE_KEY_LOCAL || !walletClient.account) {
                console.log('❌ Cannot add liquidity: PRIVATE_KEY_LOCAL not configured')
                console.log('   Please set PRIVATE_KEY_LOCAL environment variable to enable automatic transactions')
                return
            }

            // 首先检查流动性状态
            const liquidityInfo = await this.getLiquidityInfo(tokenAddress)
            
            if (liquidityInfo.liquidityAdded) {
                console.log('⚠️ Liquidity already added for this token')
                return
            }

            if (liquidityInfo.liquidityTokenAmount === '0') {
                console.log('⚠️ No liquidity data found for this token')
                return
            }

            console.log('📊 Liquidity info:', {
                liquidityTokenAmount: formatEther(BigInt(liquidityInfo.liquidityTokenAmount)),
                liquidityEthAmount: formatEther(BigInt(liquidityInfo.liquidityEthAmount)) + ' ETH',
                liquidityAdded: liquidityInfo.liquidityAdded
            })

            // 创建带有钱包的合约实例
            const liquidityManagerContract = getContract({
                address: this.liquidityManagerAddress,
                abi: LIQUIDITY_MANAGER_ABI,
                client: walletClient
            })

            console.log('💧 Calling addLiquidityToUniswap...')
            console.log(`🔑 Using account: ${walletClient.account.address}`)
            
            // 执行添加流动性交易 - 修复函数调用，只传递tokenAddress参数
            const txHash = await (liquidityManagerContract.write as any).addLiquidityToUniswap([tokenAddress])
            
            console.log('🎉 Liquidity addition transaction sent!', {
                txHash,
                token: tokenAddress,
                account: walletClient.account.address
            })

            // 等待交易确认
            console.log('⏳ Waiting for transaction confirmation...')
            const receipt = await viemClient.waitForTransactionReceipt({ hash: txHash })
            
            if (receipt.status === 'success') {
                console.log('✅ Transaction confirmed successfully!', {
                    txHash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed.toString()
                })

                // 监听流动性添加确认事件
                this.monitorLiquidityAddition(tokenAddress, txHash)
            } else {
                console.log('❌ Transaction failed!', {
                    txHash,
                    status: receipt.status
                })
            }

        } catch (error) {
            console.error('❌ Error adding liquidity:', error)
            
            // 检查是否是特定错误类型
            if (error instanceof Error) {
                if (error.message.includes('insufficient funds')) {
                    console.log('💰 Error: Insufficient funds in account', walletClient.account?.address)
                } else if (error.message.includes('nonce too low')) {
                    console.log('🔄 Error: Nonce issue, transaction may have been processed already')
                } else {
                    console.log('📝 Error details:', error.message)
                }
            }
            
            // 可以在这里添加重试逻辑或错误通知
            setTimeout(() => {
                console.log('🔄 Retrying liquidity addition...')
                this.autoAddLiquidity(tokenAddress)
            }, 10000) // 10秒后重试
        }
    }

    /**
     * 监听流动性添加确认
     */
    private monitorLiquidityAddition(tokenAddress: `0x${string}`, txHash: string) {
        viemClient.watchEvent({
            address: this.liquidityManagerAddress,
            event: {
                type: 'event',
                name: 'LiquidityAdded',
                inputs: [
                    { name: 'token', type: 'address', indexed: true },
                    { name: 'pair', type: 'address', indexed: true },
                    { name: 'amountToken', type: 'uint256' },
                    { name: 'amountETH', type: 'uint256' },
                    { name: 'liquidity', type: 'uint256' }
                ]
            },
            onLogs: (logs) => {
                logs.forEach(log => {
                    const args = log.args as any
                    if (args.token.toLowerCase() === tokenAddress.toLowerCase()) {
                        console.log('🏆 Liquidity addition confirmed!', {
                            token: args.token,
                            pair: args.pair,
                            amountToken: formatEther(args.amountToken),
                            amountETH: formatEther(args.amountETH) + ' ETH',
                            liquidity: formatEther(args.liquidity),
                            txHash
                        })
                    }
                })
            }
        })
    }

    /**
     * 获取代币流动性信息
     */
    private async getLiquidityInfo(tokenAddress: `0x${string}`) {
        const liquidityManagerContract = getContract({
            address: this.liquidityManagerAddress,
            abi: LIQUIDITY_MANAGER_ABI,
            client: viemClient // 使用公共客户端读取数据
        })

        const result = await liquidityManagerContract.read.getLiquidityInfo([tokenAddress]) as [bigint, bigint, string, bigint, boolean, boolean, bigint]
        
        return {
            liquidityTokenAmount: result[0].toString(),
            liquidityEthAmount: result[1].toString(),
            uniswapPair: result[2],
            liquidityTokens: result[3].toString(),
            liquidityAdded: result[4],
            liquidityLocked: result[5],
            addedAt: result[6].toString()
        }
    }

    /**
     * 手动触发流动性添加（用于测试或手动干预）
     */
    async manualAddLiquidity(tokenAddress: `0x${string}`) {
        console.log(`🔧 Manual liquidity addition triggered for: ${tokenAddress}`)
        await this.autoAddLiquidity(tokenAddress)
    }

    /**
     * 获取当前账户信息
     */
    getAccountInfo() {
        return {
            address: walletClient.account?.address || null,
            hasPrivateKey: !!process.env.PRIVATE_KEY_LOCAL,
            canExecuteTransactions: !!(process.env.PRIVATE_KEY_LOCAL && walletClient.account)
        }
    }
}

// 导出监控实例创建函数
export function createLiquidityMonitor(
    bondingCurveAddress: `0x${string}`, 
    liquidityManagerAddress: `0x${string}`
) {
    return new LiquidityMonitor(bondingCurveAddress, liquidityManagerAddress)
} 