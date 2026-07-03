# 0xcafe.fun

一个基于 Foundry + Next.js + Express 的 MEME 代币发射与交易平台，包含链上合约、前端 DApp、后端索引与监控服务，以及本地开发所需的 Anvil / Docker 配套环境。

## 项目组成

- `src/`：智能合约源码
- `script/`：Foundry 部署脚本
- `test/`：合约测试
- `frontend/`：Next.js 前端应用
- `backend/`：Express + TypeScript 后端服务
- `shell/`：本地开发辅助脚本
- `docker-compose.postgres.yml`：本地 Postgres
- `docker-compose.redis.yml`：本地 Redis

## 技术栈

- 合约：Solidity 0.8.29、Foundry
- 前端：Next.js 16、React 19、TypeScript、wagmi、Ant Design
- 后端：Node.js、Express 5、TypeScript、viem、PostgreSQL、Redis
- 本地链：Anvil
- 容器：Docker Compose

## 启动前条件

开始前请先准备以下环境：

### 1. 基础工具

- Node.js 20+
- npm
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Docker Desktop 或可用的 Docker Engine + Docker Compose
- Python 3（用于提取部署地址和 ABI）

### 2. 本地默认端口

- Anvil RPC：`127.0.0.1:8545`
- 前端：`localhost:3000`
- 后端：`localhost:9000`
- Postgres：`localhost:5433`
- Redis：`localhost:6380`

### 3. 依赖安装

在三个层级分别安装依赖：

```bash
npm install
npm install --prefix frontend
npm install --prefix backend
```

## 环境变量说明

本项目本地完整启动通常需要 3 份环境配置：

- 根目录 `.env`：供 Foundry 部署脚本使用
- `frontend/.env.local`：供前端读取合约地址和后端地址
- `backend/.env`：供后端连接链、数据库与缓存

### 1. 根目录 `.env`（Foundry / 部署脚本）

根目录没有 `env.example`，本地开发至少需要这些变量：

```dotenv
LOCAL_URL=http://127.0.0.1:8545
PRIVATE_KEY_LOCAL=<anvil 默认测试账户私钥>

# 可选
TREASURY_ADDRESS=<默认可不填>
GOVERNANCE_ADDRESS=<默认可不填>
GUARDIAN_ADDRESS=<默认可不填>
UNISWAP_V2_ROUTER=<默认可不填>
RUN_LOCAL_E2E=false
```

说明：

- `foundry.toml` 中的 `local` RPC 读取 `LOCAL_URL`
- `script/Deploy.s.sol` 读取 `PRIVATE_KEY_LOCAL`
- `npm run deploy:local` 完成后会自动把合约地址同步到前端和后端环境文件

### 2. 前端环境文件

先从示例文件复制：

```bash
cp frontend/env.example frontend/.env.local
```

本地开发至少需要关注：

- `NEXT_PUBLIC_BACKEND_API_URL=http://localhost:9000`
- `NEXT_PUBLIC_NETWORK_RPC=http://127.0.0.1:8545`
- `NEXT_PUBLIC_CHAIN_ID=31337`
- `NEXT_PUBLIC_MEME_FACTORY_ADDRESS`
- `NEXT_PUBLIC_FEE_VAULT_ADDRESS`
- `NEXT_PUBLIC_LIQUIDITY_MANAGER_ADDRESS`

其中 3 个合约地址会在本地部署后自动回填到 `frontend/.env.local`。

### 3. 后端环境文件

建议先复制或参考示例内容：

```bash
cp backend/env.example backend/.env
```

本地开发至少需要确认这些值：

```dotenv
APP_ENV=local
CHAIN_ID=31337
RPC_URL_LOCAL=http://127.0.0.1:8545
PRIVATE_KEY_LOCAL=<anvil 默认测试账户私钥>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/0xcafe
REDIS_PORT=6380
BACKEND_CORS_ORIGINS=http://localhost:3000
RATE_LIMIT_STORE=redis
```

另外以下地址会在部署后自动回填到 `backend/.env`：

- `MEME_FACTORY_ADDRESS`
- `FEE_VAULT_ADDRESS`
- `LIQUIDITY_MANAGER_ADDRESS`
- `MARKET_INDEXER_START_BLOCK`

注意：

- `APP_ENV=local` 时，`CHAIN_ID` 必须是 `31337`
- 后端默认监听 `9000` 端口
- 后端启动时会自动执行 PostgreSQL migration

## 推荐本地启动顺序

如果你要启动完整本地环境，推荐按下面顺序进行：

1. 安装根目录 / 前端 / 后端依赖
2. 准备根目录 `.env`、`frontend/.env.local`、`backend/.env`
3. 启动 Docker 依赖（Postgres / Redis）
4. 启动 Anvil
5. 部署本地合约
6. 启动后端
7. 启动前端
8. 运行环境自检

如果你已经完成依赖安装和环境变量准备，可以从第 3 步开始。

### Mermaid 执行顺序图

```mermaid
flowchart TD
    A[npm install<br/>初始化根目录依赖] --> B[npm install --prefix frontend<br/>初始化前端依赖]
    B --> C[npm install --prefix backend<br/>初始化后端依赖]
    C --> D[准备环境变量<br/>.env / frontend/.env.local / backend/.env]
    D --> E[npm run docker:start:market-data<br/>启动 Postgres / Redis]
    E --> F[anvil<br/>启动本地区块链]
    F --> G[npm run deploy:local<br/>部署合约并回填地址 / ABI]
    G --> H[npm run dev --prefix backend<br/>启动后端]
    H --> I[npm run dev --prefix frontend<br/>启动前端]
    I --> J[npm run dev:doctor<br/>检查联调环境]
```

### 命令顺序示例

```bash
npm install
npm install --prefix frontend
npm install --prefix backend

cp frontend/env.example frontend/.env.local
cp backend/env.example backend/.env
# 手动创建根目录 .env，并填入 LOCAL_URL / PRIVATE_KEY_LOCAL

npm run docker:start:market-data
anvil
npm run deploy:local
npm run dev --prefix backend
npm run dev --prefix frontend
npm run dev:doctor
```

下面是详细步骤。

---

## 一、启动 Docker（Postgres / Redis）

### 启动数据库和缓存

```bash
npm run docker:start:market-data
```

这个命令会执行：

- `docker compose -f docker-compose.postgres.yml up -d`
- `docker compose -f docker-compose.redis.yml up -d`

### 容器说明

#### Postgres

- 容器名：`0xcafe-market-postgres`
- 地址：`127.0.0.1:5433`
- 数据库名：`0xcafe`
- 用户名：`postgres`
- 密码：`postgres`

#### Redis

- 容器名：`0xcafe-market-redis`
- 地址：`127.0.0.1:6380`

### 重置本地数据

如果需要清空 Postgres / Redis 卷：

```bash
npm run docker:reset:market-data
```

---

## 二、启动 Anvil

新开一个终端：

```bash
anvil
```

要求：

- RPC 地址需要是 `http://127.0.0.1:8545`
- 与根目录 `.env` 的 `LOCAL_URL` 保持一致
- 与 `backend/.env` 的 `RPC_URL_LOCAL` 保持一致
- 与 `frontend/.env.local` 的 `NEXT_PUBLIC_NETWORK_RPC` 保持一致

如果你使用自定义端口或 fork 配置，需要同步修改上述环境变量。

---

## 三、部署本地合约（Foundry）

### 方式 A：使用 npm 脚本

在项目根目录执行：

```bash
npm run deploy:local
```

这个命令会完成以下事情：

1. 执行 Foundry 本地部署脚本
2. 从 `broadcast/DeployLocal.s.sol/31337/run-latest.json` 提取合约地址
3. 自动更新 `frontend/.env.local`
4. 自动更新 `backend/.env`
5. 自动提取 ABI 到 `frontend/abi/`

### 方式 B：直接使用 Foundry 命令

```bash
forge script script/DeployLocal.s.sol:DeployLocalScript --rpc-url local --broadcast
```

如果你手动执行了部署命令，而没有走 `npm run deploy:local`，还需要手动同步地址和 ABI：

```bash
python3 ./shell/extract_contract_addresses.py ./broadcast/DeployLocal.s.sol/31337/run-latest.json --quiet
python3 ./shell/extract_abi.py --quiet
```

### 可选：部署前先编译 / 测试

```bash
forge build
forge test
```

### Foundry 常用命令

```bash
npm run build      # forge build
npm run test       # forge test
npm run lint       # forge fmt --check
npm run format     # forge fmt
```

---

## 四、启动后端

进入 `backend/` 后启动开发服务：

```bash
npm run dev --prefix backend
```

等价于：

```bash
cd backend
npm run dev
```

### 后端启动时会做什么

后端入口在 [backend/src/server.ts](backend/src/server.ts)。启动时会：

1. 读取 `backend/.env`
2. 检查 `APP_ENV` 与 `CHAIN_ID` 是否匹配
3. 等待 PostgreSQL 可用
4. 自动执行数据库 migration
5. 检查 Redis 可用
6. 初始化 liquidity monitor
7. 初始化 market indexer
8. 初始化 creator fee indexer
9. 启动 HTTP 服务到 `http://localhost:9000`

### 常用接口

- `GET /api/health`
- `GET /api/monitor/status`
- `POST /api/monitor/finalize`
- `GET /api/market/:tokenAddress/candles`

本地可直接访问：

- `http://localhost:9000/api/health`

### 常用后端命令

```bash
npm run build --prefix backend
npm run test --prefix backend
npm run db:migrate --prefix backend
```

说明：

- 正常本地启动时，migration 会自动执行
- 如果只想单独补跑 migration，可以执行 `npm run db:migrate --prefix backend`

---

## 五、启动前端

进入 `frontend/` 后启动开发服务：

```bash
npm run dev --prefix frontend
```

等价于：

```bash
cd frontend
npm run dev
```

启动后访问：

- `http://localhost:3000`

### 前端启动前需要确认

- `frontend/.env.local` 已存在
- `NEXT_PUBLIC_BACKEND_API_URL=http://localhost:9000`
- 合约地址已经由部署脚本回填
- `NEXT_PUBLIC_CHAIN_ID=31337`
- `NEXT_PUBLIC_NETWORK_RPC=http://127.0.0.1:8545`

### 常用前端命令

```bash
npm run lint --prefix frontend
npm run build --prefix frontend
npm run test:e2e --prefix frontend
```

---

## 六、运行环境自检

当前后端和前端都启动后，在项目根目录执行：

```bash
npm run dev:doctor
```

这个脚本会检查：

- 后端健康接口是否可达
- 前后端 `CHAIN_ID` 是否一致
- 前后端合约地址是否一致
- Postgres 是否就绪
- Redis 是否就绪

如果输出全为 `OK`，说明本地联调环境基本正常。

---

## 最短可运行流程

如果你只想尽快把完整本地环境跑起来，可以按下面命令顺序执行：

```bash
npm install
npm install --prefix frontend
npm install --prefix backend

cp frontend/env.example frontend/.env.local
cp backend/env.example backend/.env
# 手动创建根目录 .env，并填入 LOCAL_URL / PRIVATE_KEY_LOCAL

npm run docker:start:market-data
anvil
npm run deploy:local
npm run dev --prefix backend
npm run dev --prefix frontend
npm run dev:doctor
```

说明：`anvil` 需要在单独终端持续运行。

## 常见问题

### 1. `npm run deploy:local` 失败

优先检查：

- Anvil 是否已启动
- 根目录 `.env` 是否存在
- `LOCAL_URL` 是否正确
- `PRIVATE_KEY_LOCAL` 是否可用
- `forge` / `python3` 是否已安装

### 2. 后端启动失败

优先检查：

- `backend/.env` 是否存在
- `APP_ENV=local` 且 `CHAIN_ID=31337`
- Postgres / Redis 容器是否启动
- `MEME_FACTORY_ADDRESS` / `LIQUIDITY_MANAGER_ADDRESS` 是否已经由部署脚本写入

### 3. 前端页面打不开数据

优先检查：

- 后端是否已启动
- `NEXT_PUBLIC_BACKEND_API_URL` 是否指向 `http://localhost:9000`
- 前端环境文件中的合约地址是否为空
- 浏览器钱包网络是否连接到本地 Anvil

### 4. 前后端地址不一致

重新执行一次：

```bash
npm run deploy:local
npm run dev:doctor
```

通常可以重新同步地址。

## 目录级 README

如果你要深入某一层开发，可继续阅读：

- [frontend/README.md](frontend/README.md)
- `backend/` 下的源码与脚本
- [CLAUDE.md](CLAUDE.md)
