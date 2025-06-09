// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "./MemeFactory.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MemePlatform - 简化版
 * @notice 简化的Meme代币平台，专注于核心功能
 */
contract MemePlatform is Ownable, ReentrancyGuard {
    MemeFactory public immutable memeFactory;
    
    // 平台费用管理
    uint256 public totalPlatformFeesReceived;
    uint256 public totalPlatformFeesWithdrawn;
    mapping(address => uint256) public erc20FeesReceived;
    mapping(address => uint256) public erc20FeesWithdrawn;
    address public treasury;
    
    // 简化的用户档案
    struct UserProfile {
        string username;
        string avatar;
        uint256 createdTokens;
    }
    
    mapping(address => UserProfile) public userProfiles;
    
    // 事件
    event UserProfileUpdated(address indexed user, string username, string avatar);
    event PlatformFeesReceived(address indexed from, uint256 amount);
    event PlatformFeesWithdrawn(address indexed to, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    
    constructor(address payable _memeFactory) Ownable(msg.sender) {
        memeFactory = MemeFactory(_memeFactory);
        treasury = msg.sender;
    }

    // 接收平台费用（ETH）
    function receivePlatformFees() external payable {
        // 可以接收0值调用，这是来自BondingCurve的通知
        if (msg.value > 0) {
            totalPlatformFeesReceived += msg.value;
        }
        emit PlatformFeesReceived(msg.sender, msg.value);
    }

    // 接收平台费用（ERC20代币）
    function receivePlatformFees(address token, uint256 amount) external {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "No fees received");
        
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        erc20FeesReceived[token] += amount;
        emit PlatformFeesReceived(msg.sender, amount);
    }

    // 设置财务地址
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury address");
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
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

    // 提取ETH费用
    function withdrawPlatformFees(uint256 amount) external {
        require(msg.sender == owner() || msg.sender == treasury, "Unauthorized");
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 availableFees = totalPlatformFeesReceived - totalPlatformFeesWithdrawn;
        require(amount <= availableFees, "Insufficient fees available");
        require(address(this).balance >= amount, "Insufficient contract balance");
        
        totalPlatformFeesWithdrawn += amount;
        payable(treasury).transfer(amount);
        emit PlatformFeesWithdrawn(treasury, amount);
    }

    // 提取ERC20代币费用
    function withdrawERC20Fees(address token, uint256 amount) external {
        require(msg.sender == owner() || msg.sender == treasury, "Unauthorized");
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 availableFees = erc20FeesReceived[token] - erc20FeesWithdrawn[token];
        require(amount <= availableFees, "Insufficient fees available");
        
        erc20FeesWithdrawn[token] += amount;
        IERC20(token).transfer(treasury, amount);
        emit PlatformFeesWithdrawn(treasury, amount);
    }

    // 获取可用费用
    function getAvailablePlatformFees() external view returns (uint256) {
        return totalPlatformFeesReceived - totalPlatformFeesWithdrawn;
    }

    function getAvailableERC20Fees(address token) external view returns (uint256) {
        return erc20FeesReceived[token] - erc20FeesWithdrawn[token];
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

    // 紧急提取
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        payable(owner()).transfer(balance);
    }

    // 接收ETH
    receive() external payable {
        if (msg.value > 0) {
            totalPlatformFeesReceived += msg.value;
            emit PlatformFeesReceived(msg.sender, msg.value);
        }
    }
} 