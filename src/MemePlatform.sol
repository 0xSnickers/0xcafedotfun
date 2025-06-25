// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "./MemeFactory.sol";
import "./FeeManager.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MemePlatform - 简化版
 * @notice 简化的Meme代币平台，专注于核心功能
 */
contract MemePlatform is Ownable, ReentrancyGuard {
    MemeFactory public immutable memeFactory;
    FeeManager public immutable feeManager;
    
    // 简化的用户档案
    struct UserProfile {
        string username;
        string avatar;
        uint256 createdTokens;
    }
    
    mapping(address => UserProfile) public userProfiles;
    
    // 事件
    event UserProfileUpdated(address indexed user, string username, string avatar);
    
    constructor(address payable _memeFactory, address _feeManager) Ownable(msg.sender) {
        memeFactory = MemeFactory(_memeFactory);
        feeManager = FeeManager(payable(_feeManager));
    }

    // 创建代币
    function createMemeToken(
        string memory name,
        string memory symbol,
        uint8 decimals,
        string memory tokenImage,
        string memory description,
        bytes32 salt,
        uint256 targetSupply,
        uint256 targetPrice,
        uint256 initialPrice
    ) external payable nonReentrant returns (address) {
        address tokenAddress = memeFactory.createMemeToken{value: msg.value}(
            name,
            symbol,
            decimals,
            tokenImage,
            description,
            salt,
            msg.sender,
            targetSupply,
            targetPrice,
            initialPrice
        );
        
        userProfiles[msg.sender].createdTokens++;
        return tokenAddress;
    }

    // 更新用户档案
    function updateUserProfile(string memory username, string memory avatar) external {
        userProfiles[msg.sender].username = username;
        userProfiles[msg.sender].avatar = avatar;
        emit UserProfileUpdated(msg.sender, username, avatar);
    }

    // 获取用户档案
    function getUserProfile(address user) external view returns (UserProfile memory) {
        return userProfiles[user];
    }

    // 检查代币是否已注册
    function isRegisteredToken(address token) public view returns (bool) {
        MemeFactory.MemeTokenInfo memory info = memeFactory.getMemeTokenInfo(token);
        return info.tokenAddress != address(0);
    }

    // 获取所有代币
    function getAllMemeTokens() external view returns (address[] memory) {
        return memeFactory.getAllMemeTokens();
    }

    // 预测代币地址
    function predictTokenAddress(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 totalSupply,
        string memory tokenImage,
        string memory description,
        bytes32 salt
    ) external view returns (address) {
        return memeFactory.predictTokenAddressForUser(
            name,
            symbol,
            decimals,
            totalSupply,
            address(memeFactory),
            tokenImage,
            description,
            salt
        );
    }

    // 获取代币的平台费用
    function getTokenPlatformFees(address token) external view returns (uint256) {
        return feeManager.getTokenPlatformFees(token);
    }

    // 获取代币的创建者费用
    function getTokenCreatorFees(address token) external view returns (uint256) {
        return feeManager.getTokenCreatorFees(token);
    }

    // 紧急提取
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        payable(owner()).transfer(balance);
    }

    // 接收ETH
    receive() external payable {}
} 