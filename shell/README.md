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

从Forge的broadcast日志中提取合约地址并更新frontend/.env.local文件。

**用法:**
```bash
# 基本用法
./shell/extract_contract_addresses.py <broadcast_file>

# 指定自定义env文件
./shell/extract_contract_addresses.py <broadcast_file> --env-file custom/.env

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

## 🚀 在local-deploy.sh中的使用

这些脚本被`local-deploy.sh`自动调用：

```bash
# 提取合约地址
./shell/extract_contract_addresses.py "$BROADCAST_FILE" --quiet

# 提取ABI文件
./shell/extract_abi.py --quiet
```

## 📋 支持的合约

目前支持以下合约的处理：

- **MemeFactory** - Meme代币工厂合约
- **MemePlatform** - 平台管理合约  
- **BondingCurve** - 联合曲线合约
- **MemeToken** - Meme代币合约

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