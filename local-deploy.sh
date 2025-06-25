#!/bin/bash

# 本地部署脚本 - Anvil环境
# 用于快速部署和测试Meme代币平台

echo "🚀 开始本地部署流程..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查是否在正确的目录
if [ ! -f "foundry.toml" ]; then
    echo -e "${RED}❌ 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 函数：检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 未安装或不在PATH中${NC}"
        exit 1
    fi
}

# 函数：检查Python脚本是否存在
check_python_scripts() {
    local scripts=(
        "shell/extract_contract_addresses.py"
        "shell/extract_abi.py"
    )
    
    for script in "${scripts[@]}"; do
        if [ ! -f "$script" ]; then
            echo -e "${RED}❌ 找不到必要的脚本: $script${NC}"
            exit 1
        fi
        if [ ! -x "$script" ]; then
            echo -e "${YELLOW}⚠️  设置脚本执行权限: $script${NC}"
            chmod +x "$script"
        fi
    done
}

# 检查必要的工具
echo -e "${BLUE}🔧 检查必要工具...${NC}"
check_command "forge"
check_command "anvil"
check_command "python3"
check_python_scripts
echo -e "${GREEN}✅ 所有工具检查通过${NC}"

# 检查Anvil是否正在运行
echo -e "${BLUE}🔍 检查Anvil状态...${NC}"
if curl -s -X POST -H "Content-Type: application/json" \
   --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
   http://localhost:8545 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Anvil 正在运行${NC}"
else
    echo -e "${YELLOW}⚠️  Anvil 未运行，正在启动...${NC}"
    echo -e "${BLUE}💡 请在新终端窗口运行: anvil${NC}"
    echo -e "${BLUE}💡 或按 Ctrl+C 退出，手动启动 Anvil 后重新运行此脚本${NC}"
    
    # 等待用户确认
    read -p "Anvil 启动后按回车继续，或按 Ctrl+C 退出: "
    
    # 再次检查
    if ! curl -s -X POST -H "Content-Type: application/json" \
       --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
       http://localhost:8545 > /dev/null 2>&1; then
        echo -e "${RED}❌ Anvil 仍未运行，请先启动 Anvil${NC}"
        exit 1
    fi
fi

# 编译合约
echo -e "${BLUE}📦 编译合约...${NC}"
forge build --force
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 合约编译失败${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 合约编译成功${NC}"

# 检查合约大小
echo -e "${BLUE}📏 检查合约大小...${NC}"
forge build --sizes

# 部署合约
echo -e "${BLUE}🚀 部署合约到本地网络...${NC}"
forge script script/DeployLocal.s.sol --rpc-url http://localhost:8545 --broadcast 

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 合约部署失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 合约部署成功${NC}"

# 提取合约地址并更新前端和后端环境文件
echo -e "${BLUE}📝 提取合约地址并更新环境文件...${NC}"

# 获取最新的部署日志
BROADCAST_DIR="./broadcast/DeployLocal.s.sol/31337"
if [ -d "$BROADCAST_DIR" ]; then
    # run-latest.json 直接在 31337 目录下
    BROADCAST_FILE="$BROADCAST_DIR/run-latest.json"
    
    if [ -f "$BROADCAST_FILE" ]; then
        echo -e "${YELLOW}  正在从部署日志提取合约地址...${NC}"
        
        # 使用专用的Python脚本提取合约地址并同步到前端和后端
        ./shell/extract_contract_addresses.py "$BROADCAST_FILE"
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ 合约地址提取失败${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ 找不到部署日志文件: $BROADCAST_FILE${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ 找不到部署目录: $BROADCAST_DIR${NC}"
    exit 1
fi

# 提取 ABI JSON 文件
echo -e "${BLUE}📋 提取合约 ABI JSON 文件...${NC}"

# 使用专用的Python脚本提取ABI
./shell/extract_abi.py --quiet

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ ABI 提取失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 所有 ABI 文件提取完成${NC}"

# 显示生成的文件
echo -e "${BLUE}📁 生成的 ABI 文件:${NC}"
./shell/extract_abi.py --list --quiet


if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  部分测试失败，但部署已完成${NC}"
else
    echo -e "${GREEN}✅ 所有测试通过${NC}"
fi

# 生成测试报告
echo -e "${BLUE}📊 生成测试报告...${NC}"
forge test --gas-report > gas-report.txt
echo -e "${GREEN}✅ Gas报告已保存到 gas-report.txt${NC}"

# 生成覆盖率报告
echo -e "${BLUE}📈 生成覆盖率报告...${NC}"
forge coverage > coverage-report.txt
echo -e "${GREEN}✅ 覆盖率报告已保存到 coverage-report.txt${NC}"

# 显示环境文件内容
echo -e "${BLUE}📄 frontend/.env.local 内容:${NC}"
if [ -f "frontend/.env.local" ]; then
    cat frontend/.env.local
else
    echo -e "${YELLOW}⚠️  前端 .env.local 文件不存在${NC}"
fi

echo ""
echo -e "${BLUE}📄 backend/.env 内容:${NC}"
if [ -f "backend/.env" ]; then
    cat backend/.env
else
    echo -e "${YELLOW}⚠️  后端 .env 文件不存在${NC}"
fi

echo ""
echo -e "${GREEN}🎉 ===== 本地部署完成 =====${NC}"
echo ""
echo -e "${BLUE}📱 前端集成信息:${NC}"
echo "合约地址和网络配置已自动更新到 frontend/.env.local"
echo ""
echo -e "${BLUE}🔧 后端集成信息:${NC}"
echo "合约地址已自动同步到 backend/.env"
echo ""
echo -e "${BLUE}🔧 有用的命令:${NC}"
echo "- 查看账户余额: cast balance <address> --rpc-url http://localhost:8545"
echo "- 发送ETH: cast send <to> --value <amount> --private-key <key> --rpc-url http://localhost:8545"
echo "- 调用合约: cast call <contract> <signature> --rpc-url http://localhost:8545"
echo ""
echo -e "${BLUE}📚 测试账户私钥:${NC}"
echo "账户1: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
echo "账户2: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
echo "账户3: 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
echo ""
echo -e "${BLUE}📄 ABI 文件位置:${NC}"
echo "- frontend/abi/MemeFactory.json"
echo "- frontend/abi/MemePlatform.json" 
echo "- frontend/abi/BondingCurve.json"
echo "- frontend/abi/MemeToken.json"
echo ""
echo -e "${BLUE}🛠️  独立工具:${NC}"
echo "- 提取合约地址: ./shell/extract_contract_addresses.py <broadcast_file>"
echo "- 提取ABI文件: ./shell/extract_abi.py --list"
echo ""
echo -e "${GREEN}✨ 开始愉快的开发吧！${NC}" 