// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FeeManager
 * @notice 处理平台费用和创建者费用的管理
 */
contract FeeManager is Ownable, ReentrancyGuard {
    // 费用参数
    uint256 public constant PLATFORM_FEE = 200; // 2%
    uint256 public constant CREATOR_FEE = 300;  // 3%
    uint256 public constant FEE_BASE = 10000;   // 100%

    // 费用统计
    uint256 public totalPlatformFeesCollected;
    mapping(address => uint256) public tokenPlatformFees;
    mapping(address => uint256) public tokenCreatorFees;

    // 事件
    event PlatformFeeCollected(address indexed token, uint256 amount);
    event CreatorFeeCollected(address indexed token, address indexed creator, uint256 amount);
    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice 处理买入代币时的费用
     * @param token 代币地址
     * @param creator 创建者地址
     * @param amount 交易金额
     * @return creatorFee 创建者费用
     * @return platformFee 平台费用
     */
    function handleBuyFees(
        address token,
        address creator,
        uint256 amount
    ) external payable returns (uint256 creatorFee, uint256 platformFee) {
        require(msg.value == amount, "Incorrect ETH amount");
        
        // 计算费用
        creatorFee = (amount * CREATOR_FEE) / FEE_BASE;
        platformFee = (amount * PLATFORM_FEE) / FEE_BASE;
        
        // 转账给创建者
        if (creatorFee > 0) {
            (bool success, ) = payable(creator).call{value: creatorFee}("");
            require(success, "Creator fee transfer failed");
            tokenCreatorFees[token] += creatorFee;
            emit CreatorFeeCollected(token, creator, creatorFee);
        }
        
        // 更新平台费用统计
        if (platformFee > 0) {
            (bool success, ) = payable(address(this)).call{value: platformFee}("");
            require(success, "Platform fee transfer failed");
            totalPlatformFeesCollected += platformFee;
            tokenPlatformFees[token] += platformFee;
            emit PlatformFeeCollected(token, platformFee);
        }

         // 将剩余的 ETH 返回给调用者（BondingCurve 合约）
        uint256 remainingEth = amount - platformFee - creatorFee;
        if (remainingEth > 0) {
            (bool success, ) = payable(msg.sender).call{value: remainingEth}("");
            require(success, "ETH return to caller failed");
        }
    }

    /**
     * @notice 处理卖出代币时的费用
     * @param token 代币地址
     * @param creator 创建者地址
     * @param amount 交易金额
     * @return creatorFee 创建者费用
     * @return platformFee 平台费用
     */
    function handleSellFees(
        address token,
        address creator,
        uint256 amount
    ) external payable returns (uint256 creatorFee, uint256 platformFee) {
        require(msg.value == amount, "Incorrect ETH amount");
        
        // 计算平台费用
        platformFee = (amount * PLATFORM_FEE) / FEE_BASE;
        // 计算创建者奖励（与平台费用相同比例）
        creatorFee = (amount * PLATFORM_FEE) / FEE_BASE;
        
        // 转账给创建者
        if (creatorFee > 0) {
            (bool success, ) = payable(creator).call{value: creatorFee}("");
            require(success, "Creator reward transfer failed");
            tokenCreatorFees[token] += creatorFee;
            emit CreatorFeeCollected(token, creator, creatorFee);
        }
        
        // 更新平台费用统计
        if (platformFee > 0) {
            (bool success, ) = payable(address(this)).call{value: platformFee}("");
            require(success, "Platform fee transfer failed");
            totalPlatformFeesCollected += platformFee;
            tokenPlatformFees[token] += platformFee;
            emit PlatformFeeCollected(token, platformFee);
        }
        
        // 将剩余的 ETH 返回给调用者（BondingCurve 合约）
        uint256 remainingEth = amount - platformFee - creatorFee;
        if (remainingEth > 0) {
            (bool success, ) = payable(msg.sender).call{value: remainingEth}("");
            require(success, "ETH return to caller failed");
        }
    }

    /**
     * @notice 提取平台费用
     * @param amount 提取金额
     */
    function withdrawFees(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(amount <= address(this).balance, "Insufficient balance");
        
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Fee withdrawal failed");
        
        emit FeesWithdrawn(owner(), amount);
    }

    /**
     * @notice 获取代币的平台费用
     * @param token 代币地址
     * @return platformFees 平台费用
     */
    function getTokenPlatformFees(address token) external view returns (uint256) {
        return tokenPlatformFees[token];
    }

    /**
     * @notice 获取代币的创建者费用
     * @param token 代币地址
     * @return creatorFees 创建者费用
     */
    function getTokenCreatorFees(address token) external view returns (uint256) {
        return tokenCreatorFees[token];
    }

    /**
     * @notice 紧急提取所有ETH
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Emergency withdrawal failed");
    }

    receive() external payable {}
} 