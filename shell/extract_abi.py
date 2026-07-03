#!/usr/bin/env python3
"""
ABI提取工具
从Forge的build artifacts中提取ABI并保存为JSON文件
"""

import json
import os
import sys
import argparse
from pathlib import Path
from typing import List, Dict, Tuple


def extract_single_abi(contract_name: str, sol_file: str, output_dir: str = "frontend/abi") -> bool:
    """
    提取单个合约的ABI
    
    Args:
        contract_name: 合约名称
        sol_file: Solidity文件名
        output_dir: 输出目录
        
    Returns:
        bool: 是否提取成功
    """
    try:
        # 构建输入文件路径
        input_file = f"out/{sol_file}/{contract_name}.json"
        
        if not os.path.exists(input_file):
            print(f'❌ 找不到 {contract_name} 构建产物: {input_file}')
            return False
        
        # 读取构建产物
        with open(input_file, 'r') as f:
            artifact = json.load(f)
        
        # 确保输出目录存在
        os.makedirs(output_dir, exist_ok=True)
        
        # 构建输出文件路径
        output_file = f"{output_dir}/{contract_name}.json"
        
        # 提取并保存 ABI
        with open(output_file, 'w') as f:
            json.dump(artifact['abi'], f, indent=2)
        
        print(f'  ✅ {contract_name} ABI 提取成功 -> {output_file}')
        return True
        
    except Exception as e:
        print(f'  ❌ {contract_name} ABI 提取失败: {e}')
        return False


def extract_all_abis(contracts: List[Tuple[str, str]], output_dir: str = "frontend/abi") -> bool:
    """
    提取所有合约的ABI
    
    Args:
        contracts: 合约列表，每个元素为(contract_name, sol_file)元组
        output_dir: 输出目录
        
    Returns:
        bool: 是否全部提取成功
    """
    print(f'📋 正在提取 {len(contracts)} 个合约的 ABI...')
    
    success_count = 0
    
    for contract_name, sol_file in contracts:
        if extract_single_abi(contract_name, sol_file, output_dir):
            success_count += 1
    
    if success_count == len(contracts):
        print(f'✅ 所有 {success_count} 个 ABI 文件提取完成')
        return True
    else:
        print(f'⚠️  {success_count}/{len(contracts)} 个 ABI 文件提取成功')
        return False


def list_generated_files(output_dir: str = "frontend/abi") -> None:
    """
    列出生成的ABI文件
    
    Args:
        output_dir: ABI文件目录
    """
    if not os.path.exists(output_dir):
        print(f'❌ 输出目录不存在: {output_dir}')
        return
    
    files = [f for f in os.listdir(output_dir) if f.endswith('.json')]
    files.sort()
    
    if files:
        print(f'\n📁 生成的 ABI 文件 ({len(files)} 个):')
        for file in files:
            file_path = f"{output_dir}/{file}"
            size = os.path.getsize(file_path)
            print(f'  - {file} ({size} bytes)')
    else:
        print(f'⚠️  {output_dir} 目录中没有找到 ABI 文件')


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='从Forge构建产物中提取ABI文件')
    parser.add_argument('--output-dir', '-o', default='frontend/abi', help='输出目录')
    parser.add_argument('--cleanup', '-c', action='store_true', help='清理旧的USDT相关文件')
    parser.add_argument('--list', '-l', action='store_true', help='列出生成的文件')
    parser.add_argument('--quiet', '-q', action='store_true', help='静默模式')
    
    args = parser.parse_args()
    
    # 定义要提取的合约
    contracts = [
        ("MemeFactory", "MemeFactory.sol"),
        ("MemeToken", "MemeToken.sol"),
        ("TokenMarket", "TokenMarket.sol"),
        ("FeeVault", "FeeVault.sol"),
        ("LiquidityManager", "LiquidityManager.sol"),
    ]
    
    if not args.quiet:
        print('📋 开始提取合约 ABI...')
    
    # 提取ABI
    success = extract_all_abis(contracts, args.output_dir)
 
    # 列出生成的文件
    if args.list:
        list_generated_files(args.output_dir)
    
    if not success:
        sys.exit(1)
    
    if not args.quiet:
        print('\n✨ ABI 提取完成!')


if __name__ == '__main__':
    main() 
