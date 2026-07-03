# 0xcafe.fun 最新系统架构与调用流程

更新时间：2026-06-22

本文用 Mermaid `sequenceDiagram` 描述当前项目的主要架构、数据流向和关键调用过程。当前系统核心由以下部分组成：

- Frontend：Next.js 前端，负责创建 token、交易、展示 K 线、池子和收益。
- Backend API：Express 后端，提供 market、monitor、pools、creator、growth、health 等接口。
- Chain Clients：后端 `viemClient` / `walletClient`，按 `APP_ENV + CHAIN_ID` 连接 Anvil / Sepolia / Mainnet。
- Indexers：MarketIndexer / CreatorFeeIndexer，从链上事件投影到 PostgreSQL。
- Storage：PostgreSQL 是市场、交易、K 线、池子等语义数据的主存储；Redis 用于缓存和辅助。
- Monitor/Keeper：后台 liquidity monitor 负责自动/手动完成毕业、加池和 residual sweep。
- Contracts：`MemeFactory`、`TokenMarket`、`LiquidityManager`、`FeeVault`、Uniswap Router/Pair。

## 1. 后端启动与环境选择

```mermaid
sequenceDiagram
    autonumber
    participant Proc as Node Process
    participant Env as Environment
    participant Config as backend/src/config/environment.ts
    participant Viem as viemClient/walletClient
    participant Server as Express Server
    participant Bootstrap as bootstrapBackendServices
    participant Monitor as LiquidityMonitor
    participant MarketIndexer as MarketIndexer
    participant FeeIndexer as CreatorFeeIndexer
    participant PG as PostgreSQL
    participant Redis as Redis

    Proc->>Env: Load .env / backend/.env / runtime secrets
    Proc->>Config: getBackendEnvironment()
    Config->>Config: Validate APP_ENV and CHAIN_ID
    alt APP_ENV and CHAIN_ID mismatch
        Config-->>Proc: Throw startup error
    else valid environment
        Config-->>Proc: appEnv, chainId, chainName
    end

    Proc->>Viem: Create public client for chainId
    alt chainId = 31337
        Viem->>Env: Use RPC_URL_LOCAL and PRIVATE_KEY_LOCAL
    else chainId = 11155111
        Viem->>Env: Use RPC_URL_SEPOLIA and PRIVATE_KEY_SEPOLIA
    else chainId = 1
        Viem->>Env: Use RPC_URL_MAINNET and PRIVATE_KEY_MAINNET
    end

    Proc->>Config: assertOnlineMonitorAdminConfigured()
    alt APP_ENV is sepolia/mainnet and MONITOR_ADMIN_KEY missing
        Config-->>Proc: Throw startup error
    else local or admin key configured
        Config-->>Proc: OK
    end

    Proc->>Bootstrap: bootstrapBackendServices()
    Bootstrap->>PG: Check readiness and migrations
    Bootstrap->>Redis: Check readiness
    Bootstrap-->>Proc: Bootstrap complete

    Proc->>Monitor: initLiquidityMonitor()
    alt LIQUIDITY_MANAGER_ADDRESS configured
        Monitor->>Viem: watch GraduationRegistered and LiquidityAdded
        Monitor->>PG: Start periodic candidate scan
        Monitor-->>Proc: Monitor active
    else missing address
        Monitor-->>Proc: Monitor disabled
    end

    Proc->>MarketIndexer: initMarketIndexer()
    MarketIndexer->>Viem: Watch/query factory and market events
    MarketIndexer->>PG: Persist blocks, logs, trades, markets, pools

    Proc->>FeeIndexer: initCreatorFeeIndexer()
    FeeIndexer->>Viem: Watch/query FeeVault events
    FeeIndexer->>PG: Persist creator fee facts

    Proc->>Server: Listen on PORT
```

## 2. 前端读取市场列表、K 线和交易记录

```mermaid
sequenceDiagram
    autonumber
    participant UI as Frontend UI
    participant MarketApi as frontend/src/lib/marketApi.ts
    participant Backend as Backend /api/market
    participant RateLimit as marketReadRateLimit
    participant PGStore as postgresMarketStore/postgresCandleStore
    participant Cache as Redis candle query cache
    participant PG as PostgreSQL
    participant Chain as EVM RPC

    UI->>MarketApi: getMarketList(limit)
    MarketApi->>Backend: GET /api/market/list
    Backend->>PGStore: getMarketList(chainId, now, limit)
    PGStore->>PG: Read token_markets, summaries, pools/trades
    PG-->>Backend: MarketListResponse
    Backend-->>MarketApi: JSON market rows
    MarketApi-->>UI: Render token list

    UI->>MarketApi: getCandles(token, from, to)
    MarketApi->>Backend: GET /api/market/:token/candles?resolution=1
    Backend->>RateLimit: Check read limit
    Backend->>Cache: Try candle query cache
    alt cache hit
        Cache-->>Backend: TradingViewCandlesResponse
    else cache miss
        Backend->>PGStore: getCandles(chainId, token, from, to)
        PGStore->>PG: Read market_candles_1m
        PG-->>Backend: Stored 1m candles
        Backend->>Cache: Store query response
    end
    Backend-->>MarketApi: OHLCV response from persisted candles
    MarketApi-->>UI: Render TradingView bars

    UI->>MarketApi: getMarketTrades(token, limit/cursor)
    MarketApi->>Backend: GET /api/market/:token/trades
    Backend->>RateLimit: Check read limit
    Backend->>PGStore: getRecentTradesByTokenAddress()
    PGStore->>PG: Read canonical market_trades
    PG-->>Backend: Trades page
    Backend-->>MarketApi: MarketTradesResponse
    MarketApi-->>UI: Render activity list

    alt Market list API fails
        UI->>Chain: Optional chain fan-out fallback
        Note over UI,Chain: Local allows full fallback. Sepolia limits count. Mainnet disables full fan-out by default.
    end
```

## 3. Token 创建流程

```mermaid
sequenceDiagram
    autonumber
    participant User as User Wallet
    participant UI as Create Page
    participant Wagmi as wagmi/viem client
    participant Factory as MemeFactory
    participant Token as MemeToken
    participant Market as TokenMarket
    participant Chain as EVM Chain
    participant Indexer as MarketIndexer
    participant PG as PostgreSQL
    participant Backend as Backend /api/market
    participant TradeUI as Trade Page

    User->>UI: Fill token metadata and curve params
    UI->>Wagmi: simulateContract(createToken)
    Wagmi->>Factory: eth_call createToken simulation
    Factory-->>Wagmi: Simulation OK

    User->>UI: Confirm create token
    UI->>Wagmi: writeContract MemeFactory.createToken(...)
    Wagmi->>Factory: Send transaction
    Factory->>Token: Deploy/initialize MemeToken
    Factory->>Market: Deploy/initialize TokenMarket
    Factory->>Chain: Emit registration/config events
    Chain-->>Wagmi: Transaction receipt
    Wagmi-->>UI: tokenAddress / receipt

    UI->>TradeUI: router.push(/trade/:tokenAddress)

    Indexer->>Chain: Read new factory/market events
    Indexer->>PG: Persist token_markets, raw_chain_logs, chain_blocks
    PG-->>Backend: New token appears in market APIs
```

## 4. Bonding Curve 买卖流程

```mermaid
sequenceDiagram
    autonumber
    participant User as User Wallet
    participant UI as Trade Page
    participant MarketClient as tokenMarketClient/useMarket
    participant Wagmi as wagmi/viem client
    participant Factory as MemeFactory
    participant Market as TokenMarket
    participant Token as MemeToken
    participant Chain as EVM Chain
    participant Indexer as MarketIndexer
    participant Projector as candleProjector
    participant PG as PostgreSQL
    participant Backend as Backend /api/market

    UI->>MarketClient: resolveMarketAddress(token)
    MarketClient->>Factory: read marketOf(token)
    Factory-->>MarketClient: marketAddress

    UI->>MarketClient: quote buy/sell
    alt buy
        MarketClient->>Market: read quoteBuyExactEth or quoteBuyExactTokens
    else sell
        MarketClient->>Market: read quoteSell
    end
    Market-->>UI: Price, fees, minOut hints

    alt sell requires approval
        User->>UI: Approve token
        UI->>Wagmi: writeContract MemeToken.approve(market, amount)
        Wagmi->>Token: approve
        Chain-->>UI: Approval receipt
    end

    User->>UI: Confirm trade
    alt buy
        UI->>Wagmi: writeContract TokenMarket.buy(value=ETH, minTokenOut)
        Wagmi->>Market: buy
    else sell
        UI->>Wagmi: writeContract TokenMarket.sell(tokenIn, minEthOut)
        Wagmi->>Market: sell
    end
    Market->>Chain: Emit trade/reserve/state events
    Chain-->>UI: Trade receipt

    Indexer->>Chain: Read canonical logs
    Indexer->>PG: Persist raw_chain_logs, market_trades, token market state
    Indexer->>Projector: rebuildAffectedCandleBuckets()
    Projector->>PG: Upsert market_candles_1m using persisted initial_price_x18

    UI->>Backend: Refetch candles/trades/summary
    Backend->>PG: Read market_candles_1m and market_trades
    Backend-->>UI: Updated chart and activity
```

## 5. 索引器、确认与 K 线投影

```mermaid
sequenceDiagram
    autonumber
    participant Indexer as MarketIndexer
    participant Chain as EVM RPC
    participant Normalizer as Trade/Event Normalizers
    participant PG as PostgreSQL
    participant Projector as candleProjector
    participant Reorg as Reorg Handler
    participant API as Backend /api/market
    participant UI as Frontend Chart

    loop Poll/watch block ranges
        Indexer->>Chain: eth_getLogs for factory/market/liquidity events
        Chain-->>Indexer: Logs with block metadata
        Indexer->>Reorg: Compare fetched tail with canonical facts
        alt reorg detected
            Reorg->>PG: Mark rolled-back facts non-canonical
            Reorg->>Projector: Rebuild affected candles
        else canonical
            Indexer->>Normalizer: Normalize creation/trade/graduation/liquidity facts
            Normalizer-->>Indexer: Structured facts
            Indexer->>PG: Persist blocks, logs, token_markets, market_trades, pools
            Indexer->>Projector: Rebuild affected 1m buckets
            Projector->>PG: Upsert market_candles_1m
        end
    end

    API->>PG: Read canonical candles/trades/summaries
    API-->>UI: Stable API response
    Note over Projector,PG: First candle open/high/low semantics live in persisted candle projection, not route-time patching.
```

## 6. Graduation 自动毕业与加池

```mermaid
sequenceDiagram
    autonumber
    participant User as User / Frontend
    participant Backend as Backend /api/monitor
    participant Monitor as LiquidityMonitor
    participant Wallet as Backend walletClient
    participant Factory as MemeFactory
    participant Market as TokenMarket
    participant LM as LiquidityManager
    participant Pair as Uniswap Pair
    participant Chain as EVM Chain
    participant Indexer as MarketIndexer
    participant PG as PostgreSQL

    par automatic monitor path
        Monitor->>PG: Scan graduation candidate token_markets
        Monitor->>Factory: read marketOf(token)
        Factory-->>Monitor: marketAddress
        Monitor->>Market: read getMarketState()
    and public/admin API path
        User->>Backend: POST /api/monitor/finalize { tokenAddress }
        alt MONITOR_PUBLIC_FINALIZE=true and not mainnet-disabled
            Backend->>Backend: Rate limit, dedupe, recent-success check
        else admin-only
            Backend->>Backend: Validate x-admin-key or Bearer admin key
        end
        Backend->>Monitor: finalizeGraduation(tokenAddress)
    end

    alt market stage is graduation_pending
        Monitor->>Wallet: Sign prepareGraduation
        Wallet->>Market: prepareGraduation()
        Market->>Chain: Stage becomes liquidity_pending
    else already liquidity_pending or dex_live
        Monitor->>Monitor: Skip prepare step if appropriate
    end

    Monitor->>LM: read getLiquidityInfo(token)
    alt liquidity not added
        Monitor->>Wallet: Sign addLiquidity
        Wallet->>LM: addLiquidity(token, minToken, minETH, deadline)
        LM->>Pair: Add liquidity with price tolerance checks
        LM->>Chain: Emit LiquidityAdded / DEX live events
    else already added
        Monitor->>Monitor: No-op
    end

    Chain-->>Indexer: Graduation/liquidity logs
    Indexer->>PG: Persist final stage, pools, reserves
    Backend-->>User: accepted / already_processing / already_finalized / error
```

## 7. Residual Sweep 运维恢复流程

```mermaid
sequenceDiagram
    autonumber
    participant Admin as Admin Operator
    participant Backend as Backend /api/monitor
    participant Auth as Monitor Admin Auth
    participant Wallet as Backend walletClient
    participant Factory as MemeFactory
    participant Market as TokenMarket
    participant Chain as EVM Chain

    Admin->>Backend: POST /api/monitor/sweep { marketAddress, tokenRecipient, ethRecipient }
    Backend->>Auth: Validate MONITOR_ADMIN_KEY
    alt unauthorized
        Auth-->>Admin: 401 Unauthorized
    else authorized
        Backend->>Backend: Validate market/recipient addresses
        Backend->>Backend: Require MEME_FACTORY_ADDRESS and wallet account
        Note over Backend: Sweep no longer requires globalMonitor to be active.
        Backend->>Wallet: Sign factory sweep transaction
        Wallet->>Factory: sweepMarketResiduals(market, tokenRecipient, ethRecipient)
        Factory->>Market: Forward owner-authorized residual sweep
        Market->>Chain: Transfer residual token/ETH
        Chain-->>Backend: Receipt
        Backend-->>Admin: 200 success
    end
```

## 8. DEX Live 后交易与池子页面

```mermaid
sequenceDiagram
    autonumber
    participant User as User Wallet
    participant UI as Pools/Trade UI
    participant DexClient as dexTradeClient/liquidityActionsClient
    participant Wagmi as wagmi/viem client
    participant LM as LiquidityManager
    participant Router as Uniswap Router
    participant Pair as Uniswap Pair
    participant Token as MemeToken
    participant Chain as EVM Chain
    participant Indexer as MarketIndexer
    participant PG as PostgreSQL
    participant Backend as Backend /api/pools and /api/market

    UI->>Backend: GET /api/pools or pool details
    Backend->>PG: Read pool reserves, market stage, summaries
    Backend-->>UI: Pool list/details

    UI->>DexClient: Quote DEX buy/sell
    DexClient->>LM: read uniswapRouter/weth or liquidity info
    DexClient->>Router: read getAmountsOut(path)
    Router-->>UI: DEX quote

    alt sell token through DEX
        User->>UI: Approve token to router
        UI->>Wagmi: MemeToken.approve(router, amount)
        Wagmi->>Token: approve
    end

    User->>UI: Confirm DEX trade
    alt DEX buy
        UI->>Wagmi: swapExactETHForTokens
        Wagmi->>Router: ETH -> Token
    else DEX sell
        UI->>Wagmi: swapExactTokensForETH
        Wagmi->>Router: Token -> ETH
    end
    Router->>Pair: Execute swap
    Pair->>Chain: Emit Swap/Sync events
    Chain-->>UI: Receipt

    Indexer->>Chain: Read DEX/pool logs
    Indexer->>PG: Update pool reserve snapshots and market facts
    UI->>Backend: Refetch pools/trades/candles
    Backend->>PG: Read updated facts
    Backend-->>UI: Updated DEX live state
```

## 9. Creator Fee 领取流程

```mermaid
sequenceDiagram
    autonumber
    participant Creator as Creator Wallet
    participant UI as Earnings Page
    participant Backend as Backend /api/creator
    participant FeeVault as FeeVault
    participant Wagmi as wagmi/viem client
    participant FeeIndexer as CreatorFeeIndexer
    participant PG as PostgreSQL
    participant Chain as EVM Chain

    UI->>Backend: Query creator fee summary
    Backend->>PG: Read creator fee facts
    PG-->>Backend: Claimable/accrued fee state
    Backend-->>UI: Fee dashboard data

    Creator->>UI: Claim creator fees
    UI->>Wagmi: writeContract FeeVault.claimCreatorFees(...)
    Wagmi->>FeeVault: claimCreatorFees
    FeeVault->>Chain: Transfer claimable fees
    Chain-->>UI: Claim receipt

    FeeIndexer->>Chain: Read FeeVault events
    FeeIndexer->>PG: Persist claim/accrual facts
    UI->>Backend: Refetch creator fee summary
    Backend-->>UI: Updated balances
```
