# Shell Scripts Directory

这个目录包含用于0xcafe.fun项目的辅助脚本工具。

## 📁 目录结构

```
shell/
├── README.md                        # 本文档
├── extract_contract_addresses.py    # 合约地址提取工具
└── extract_abi.py                  # ABI提取工具
```

## 🛠️ 脚本说明

### extract_contract_addresses.py

从 Forge broadcast 日志提取正式版合约地址，并更新前端与后端环境文件。

**用法:**
```bash
# 基本用法
./shell/extract_contract_addresses.py <broadcast_file>

# 指定自定义env文件
./shell/extract_contract_addresses.py <broadcast_file> \
  --frontend-env custom/frontend.env \
  --backend-env custom/backend.env

# 静默模式
./shell/extract_contract_addresses.py <broadcast_file> --quiet
```

**功能:**
- ✅ 从broadcast日志提取合约地址
- ✅ 自动更新.env.local文件
- ✅ 保留现有环境变量
- ✅ 支持自定义输出文件

### extract_abi.py

从Forge的build artifacts中提取ABI并保存为JSON文件。

**用法:**
```bash
# 基本用法
./shell/extract_abi.py

# 列出生成的文件
./shell/extract_abi.py --list

# 指定输出目录
./shell/extract_abi.py --output-dir custom/abi

# 静默模式
./shell/extract_abi.py --quiet
```

**功能:**
- ✅ 提取所有合约的ABI
- ✅ 生成纯JSON格式文件
- ✅ 支持自定义输出目录

## 🚀 在部署命令中的使用

这些脚本被 `npm run deploy:local` 和 `npm run deploy:sepolia` 自动调用：

```bash
# 提取合约地址
./shell/extract_contract_addresses.py "$BROADCAST_FILE" --quiet

# 提取ABI文件
./shell/extract_abi.py --quiet
```

`deploy:local` 会同步到 `frontend/.env.local` 和 `backend/.env`。
`deploy:sepolia` 会同步到 `frontend/.env.local.sepolia` 和 `backend/.env`。

## 📋 支持的合约

目前支持以下合约的处理：

- **MemeFactory** - 正式 Token / Market 工厂
- **MemeToken** - 正式 Meme Token
- **TokenMarket** - 每 Token 独立曲线市场
- **FeeVault** - 平台费与 Creator Fee Pull Payment
- **LiquidityManager** - 毕业登记、加池与 LP 锁定

## 🔧 依赖要求

- Python 3.6+
- 标准库: `json`, `os`, `sys`, `argparse`, `pathlib`

## 💡 使用示例

```bash
# 1. 提取最新部署的合约地址
./shell/extract_contract_addresses.py broadcast/DeployLocal.s.sol/31337/run-latest.json

# 2. 提取所有ABI文件
./shell/extract_abi.py --list

# 3. 查看生成的文件
ls -la frontend/abi/
cat frontend/.env.local
```

## 🎯 设计目标

- **模块化**: 每个脚本专注单一功能
- **可重用**: 可独立使用或集成到其他脚本
- **易维护**: 清晰的代码结构和错误处理
- **用户友好**: 详细的输出信息和帮助文档 
