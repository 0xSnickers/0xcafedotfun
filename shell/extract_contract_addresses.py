#!/usr/bin/env python3
"""
合约地址提取工具
从Forge的broadcast日志中提取合约地址并更新frontend/.env.local文件
"""

import json
import os
import sys
import argparse
from pathlib import Path


def extract_contract_addresses(broadcast_file: str, env_file: str = "frontend/.env.local") -> dict:
    """
    从broadcast日志中提取合约地址
    
    Args:
        broadcast_file: broadcast日志文件路径
        env_file: .env.local文件路径
        
    Returns:
        dict: 提取到的合约地址字典
    """
    try:
        # 读取部署日志
        with open(broadcast_file, 'r') as f:
            broadcast_data = json.load(f)
        
        # 提取合约地址
        transactions = broadcast_data.get('transactions', [])
        contracts = {}
        
        for tx in transactions:
            if tx.get('transactionType') == 'CREATE':
                contract_name = tx.get('contractName')
                contract_address = tx.get('contractAddress')
                if contract_name and contract_address:
                    contracts[contract_name] = contract_address
        
        if not contracts:
            print('❌ 未找到合约地址')
            return {}
            
        print(f'✅ 成功提取 {len(contracts)} 个合约地址')
        return contracts
        
    except FileNotFoundError:
        print(f'❌ 找不到broadcast文件: {broadcast_file}')
        return {}
    except json.JSONDecodeError:
        print(f'❌ broadcast文件格式错误: {broadcast_file}')
        return {}
    except Exception as e:
        print(f'❌ 提取合约地址失败: {e}')
        return {}


def update_env_file(contracts: dict, env_file: str = "frontend/.env.local") -> bool:
    """
    更新.env.local文件中的合约地址
    
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
            'NEXT_PUBLIC_MEME_PLATFORM_ADDRESS': contracts.get('MemePlatform', ''),
            'NEXT_PUBLIC_BONDING_CURVE_ADDRESS': contracts.get('BondingCurve', ''),
            'NEXT_PUBLIC_NETWORK_RPC': 'http://127.0.0.1:8545',
            'NEXT_PUBLIC_CHAIN_ID': '31337'
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
        
        print(f'✅ 合约地址已更新到 {env_file}')
        return True
        
    except Exception as e:
        print(f'❌ 更新环境文件失败: {e}')
        return False


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='从broadcast日志提取合约地址并更新.env.local')
    parser.add_argument('broadcast_file', help='broadcast日志文件路径')
    parser.add_argument('--env-file', default='frontend/.env.local', help='.env.local文件路径')
    parser.add_argument('--quiet', '-q', action='store_true', help='静默模式')
    
    args = parser.parse_args()
    
    if not args.quiet:
        print('📝 正在提取合约地址...')
    
    # 提取合约地址
    contracts = extract_contract_addresses(args.broadcast_file, args.env_file)
    
    if not contracts:
        sys.exit(1)
    
    # 更新环境文件
    if not update_env_file(contracts, args.env_file):
        sys.exit(1)
    
    # 显示提取的地址
    if not args.quiet:
        print('\n📋 部署的合约地址:')
        for name, address in contracts.items():
            print(f'  {name}: {address}')


if __name__ == '__main__':
    main() 