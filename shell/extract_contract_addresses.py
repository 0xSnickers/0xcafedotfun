#!/usr/bin/env python3
"""
合约地址提取工具
从Forge的broadcast日志中提取合约地址并更新frontend/.env.local和backend/.env文件
"""

import json
import os
import sys
import argparse
from pathlib import Path


def parse_block_number(value) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value, 0)
        except ValueError:
            return None
    return None


def extract_contract_addresses(broadcast_file: str) -> tuple[dict, int | None]:
    """
    从broadcast日志中提取合约地址
    
    Args:
        broadcast_file: broadcast日志文件路径
        
    Returns:
        tuple: 提取到的合约地址字典和最早部署区块
    """
    try:
        # 读取部署日志
        with open(broadcast_file, 'r') as f:
            broadcast_data = json.load(f)
        
        # 提取合约地址
        transactions = broadcast_data.get('transactions', [])
        receipts_by_hash = {
            receipt.get('transactionHash', '').lower(): receipt
            for receipt in broadcast_data.get('receipts', [])
            if receipt.get('transactionHash')
        }
        contracts = {}
        deployment_blocks = []
        
        for tx in transactions:
            if tx.get('transactionType') == 'CREATE':
                contract_name = tx.get('contractName')
                contract_address = tx.get('contractAddress')
                if contract_name and contract_address:
                    contracts[contract_name] = contract_address
                receipt = receipts_by_hash.get(tx.get('hash', '').lower())
                block_number = parse_block_number(receipt.get('blockNumber')) if receipt else None
                if block_number is not None:
                    deployment_blocks.append(block_number)
        
        if not contracts:
            print('❌ 未找到合约地址')
            return {}, None
            
        print(f'✅ 成功提取 {len(contracts)} 个合约地址')
        return contracts, min(deployment_blocks) if deployment_blocks else None
        
    except FileNotFoundError:
        print(f'❌ 找不到broadcast文件: {broadcast_file}')
        return {}, None
    except json.JSONDecodeError:
        print(f'❌ broadcast文件格式错误: {broadcast_file}')
        return {}, None
    except Exception as e:
        print(f'❌ 提取合约地址失败: {e}')
        return {}, None


def update_frontend_env(contracts: dict, chain_id: int, env_file: str = "frontend/.env.local") -> bool:
    """
    更新前端.env.local文件中的合约地址
    
    Args:
        contracts: 合约地址字典
        env_file: .env.local文件路径
        
    Returns:
        bool: 是否更新成功
    """
    try:
        # 读取现有的 .env.local 文件（如果存在）
        env_lines = []
        
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                env_lines = f.readlines()
        
        # 更新或添加合约地址
        updated_vars = {
            'NEXT_PUBLIC_MEME_FACTORY_ADDRESS': contracts.get('MemeFactory', ''),
            'NEXT_PUBLIC_FEE_VAULT_ADDRESS': contracts.get('FeeVault', ''),
            'NEXT_PUBLIC_LIQUIDITY_MANAGER_ADDRESS': contracts.get('LiquidityManager', ''),
            'NEXT_PUBLIC_CHAIN_ID': str(chain_id)
        }
        
        # 创建新的环境变量列表
        new_env_lines = []
        updated_keys = set()
        
        # 更新现有的变量
        for line in env_lines:
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                key = line.split('=')[0]
                if key in updated_vars:
                    new_env_lines.append(f'{key}={updated_vars[key]}\n')
                    updated_keys.add(key)
                else:
                    new_env_lines.append(line + '\n')
            else:
                new_env_lines.append(line + '\n')
        
        # 添加新的变量
        for key, value in updated_vars.items():
            if key not in updated_keys:
                new_env_lines.append(f'{key}={value}\n')
        
        # 确保目录存在
        os.makedirs(os.path.dirname(env_file), exist_ok=True)
        
        # 写入 .env.local 文件
        with open(env_file, 'w') as f:
            f.writelines(new_env_lines)
        
        print(f'✅ 前端合约地址已更新到 {env_file}')
        return True
        
    except Exception as e:
        print(f'❌ 更新前端环境文件失败: {e}')
        return False


def update_backend_env(
    contracts: dict,
    deployment_start_block: int | None,
    chain_id: int,
    env_file: str = "backend/.env",
) -> bool:
    """
    更新后端.env文件中的合约地址
    
    Args:
        contracts: 合约地址字典
        env_file: .env文件路径
        
    Returns:
        bool: 是否更新成功
    """
    try:
        # 读取现有的 .env 文件（如果存在）
        env_lines = []
        
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                env_lines = f.readlines()
        
        # 需要更新的后端环境变量
        updated_vars = {
            'CHAIN_ID': str(chain_id),
            'MEME_FACTORY_ADDRESS': contracts.get('MemeFactory', ''),
            'FEE_VAULT_ADDRESS': contracts.get('FeeVault', ''),
            'LIQUIDITY_MANAGER_ADDRESS': contracts.get('LiquidityManager', ''),
        }
        if deployment_start_block is not None:
            updated_vars['MARKET_INDEXER_START_BLOCK'] = str(deployment_start_block)
        
        # 创建新的环境变量列表
        new_env_lines = []
        updated_keys = set()
        
        # 更新现有的变量
        for line in env_lines:
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                key = line.split('=')[0]
                if key in updated_vars:
                    new_env_lines.append(f'{key}={updated_vars[key]}\n')
                    updated_keys.add(key)
                else:
                    new_env_lines.append(line + '\n')
            else:
                new_env_lines.append(line + '\n')
        
        # 添加新的变量（如果不存在）
        for key, value in updated_vars.items():
            if key not in updated_keys:
                new_env_lines.append(f'{key}={value}\n')
        
        # 确保目录存在
        os.makedirs(os.path.dirname(env_file), exist_ok=True)
        
        # 写入 .env 文件
        with open(env_file, 'w') as f:
            f.writelines(new_env_lines)
        
        print(f'✅ 后端合约地址已更新到 {env_file}')
        return True
        
    except Exception as e:
        print(f'❌ 更新后端环境文件失败: {e}')
        return False


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='从broadcast日志提取合约地址并更新前端和后端环境文件')
    parser.add_argument('broadcast_file', help='broadcast日志文件路径')
    parser.add_argument('--frontend-env', default='frontend/.env.local', help='前端.env.local文件路径')
    parser.add_argument('--backend-env', default='backend/.env', help='后端.env文件路径')
    parser.add_argument('--chain-id', type=int, default=31337, help='部署目标 Chain ID')
    parser.add_argument('--quiet', '-q', action='store_true', help='静默模式')
    
    args = parser.parse_args()
    
    if not args.quiet:
        print('📝 正在提取合约地址...')
    
    # 提取合约地址
    contracts, deployment_start_block = extract_contract_addresses(args.broadcast_file)
    
    if not contracts:
        sys.exit(1)
    
    # 更新前端环境文件
    frontend_success = update_frontend_env(contracts, args.chain_id, args.frontend_env)
    
    # 更新后端环境文件
    backend_success = update_backend_env(
        contracts,
        deployment_start_block,
        args.chain_id,
        args.backend_env,
    )
    
    if not frontend_success or not backend_success:
        sys.exit(1)
    
    # 显示提取的地址
    if not args.quiet:
        print('\n📋 部署的合约地址:')
        for name, address in contracts.items():
            print(f'  {name}: {address}')
        if deployment_start_block is not None:
            print(f'  Deployment start block: {deployment_start_block}')
        
        print('\n🔄 地址同步状态:')
        print(f'  前端环境文件: {args.frontend_env} {"✅" if frontend_success else "❌"}')
        print(f'  后端环境文件: {args.backend_env} {"✅" if backend_success else "❌"}')
        
        if contracts.get('MemeFactory') and contracts.get('FeeVault') and contracts.get('LiquidityManager'):
            print('\n🎯 关键合约地址已同步:')
            print(f'  MEME_FACTORY_ADDRESS: {contracts["MemeFactory"]}')
            print(f'  FEE_VAULT_ADDRESS: {contracts["FeeVault"]}')
            print(f'  LIQUIDITY_MANAGER_ADDRESS: {contracts["LiquidityManager"]}')
            if deployment_start_block is not None:
                print(f'  MARKET_INDEXER_START_BLOCK: {deployment_start_block}')


if __name__ == '__main__':
    main() 
