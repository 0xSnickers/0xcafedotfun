// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "./MemeToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

// 前向声明 MemePlatform 接口
interface IMemePlatform {
    function receivePlatformFees() external payable;
}

/**
 * @title BondingCurve
 * @notice 实现 bonding curve 动态定价和铸造机制，类似 pump.fun
 * 线性定价算法：- price = initialPrice + k * supply
 *             - price = 初始价格 + 每单位涨幅 × 当前已售数量（supply）
 * ✅ 使用ETH作为计价单位
 * 部署说明：
 * 1. 部署时需要传入 MemePlatform 地址
 * 2. MemePlatform 需要实现 receivePlatformFees() payable 函数
 * 3. 用户直接发送ETH购买代币，无需授权
 * 4. 价格单位为ETH（18位小数）
 */
contract BondingCurve is Ownable, ReentrancyGuard {
    using Math for uint256;

    // 市值毕业门槛：10 ETH
    uint256 public constant TARGET_MARKET_CAP = 10 ether;

    // Bonding Curve 参数
    struct CurveParams {
        uint256 k;              // 曲线参数 k (斜率)
        uint256 targetSupply;   // 目标供应量 (仅用于计算曲线，不再作为毕业条件)
        uint256 targetPrice;    // 目标价格 (ETH)
        uint256 initialPrice;   // 初始价格 (ETH)
        uint256 currentSupply;  // 当前已铸造供应量
        bool graduated;         // 是否已达到目标并迁移
    }

    // 代币信息
    struct TokenInfo {
        address tokenAddress; // 代币地址
        address creator; // 创建者地址
        uint256 createdAt; // 创建时间
        uint256 totalRaised;    // 总筹集 ETH
        uint256 creatorFeeCollected; // 创建者已收集的费用
    }

    // 存储每个代币的 curve 参数
    mapping(address => CurveParams) public curveParams; // 代币地址 => curve 参数
    // 存储每个代币的 token 信息
    mapping(address => TokenInfo) public tokenInfos; // 代币地址 => token 信息
    // 是否有效代币
    mapping(address => bool) public isValidToken; // 代币地址 => 是否有效
    
    // 授权的合约地址（能调用 initializeCurve 的合约）
    mapping(address => bool) public authorizedCallers;

    // MemePlatform 合约地址
    address public memePlatform;
    
    // 累积的平台费用（用于统计和备份）
    uint256 public totalPlatformFeesCollected;

    // 平台参数
    // 2%平台费
    uint256 public constant PLATFORM_FEE = 200;
    // 3%创建者费
    uint256 public constant CREATOR_FEE = 300; 
    // 费率基数
    uint256 public constant FEE_BASE = 10000;

    // 代币购买
    event TokenBought(
        address indexed token,
        address indexed buyer,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 newPrice,
        uint256 newSupply
    );
    // 代币卖出
    event TokenSold(
        address indexed token,
        address indexed seller,
        uint256 tokenAmount,
        uint256 ethAmount,
        uint256 newPrice,
        uint256 newSupply
    );
    // 代币按市值毕业
    event TokenGraduatedByMarketCap(
        address indexed token,
        uint256 finalSupply,
        uint256 totalRaised,
        uint256 marketCap
    );
    // 授权调用者
    event AuthorizedCallerAdded(address indexed caller);
    // 移除授权调用者
    event AuthorizedCallerRemoved(address indexed caller);
    
    // 平台费用事件
    event PlatformFeeSent(address indexed platform, uint256 amount);
    event MemePlatformUpdated(address indexed oldPlatform, address indexed newPlatform);

    constructor(address _memePlatform) Ownable(msg.sender) {
        require(_memePlatform != address(0), "Invalid platform address");
        memePlatform = _memePlatform;
    }

    /**
     * @notice 设置 MemePlatform 地址
     * @param _memePlatform 新的平台地址
     */
    function setMemePlatform(address _memePlatform) external onlyOwner {
        require(_memePlatform != address(0), "Invalid platform address");
        address oldPlatform = memePlatform;
        memePlatform = _memePlatform;
        emit MemePlatformUpdated(oldPlatform, _memePlatform);
    }

    /**
     * @notice 添加授权调用者
     * @param caller 调用者地址
     */
    function addAuthorizedCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = true;
        emit AuthorizedCallerAdded(caller);
    }

    /**
     * @notice 移除授权调用者
     * @param caller 调用者地址
     */
    function removeAuthorizedCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
        emit AuthorizedCallerRemoved(caller);
    }

    /**
     * @notice 检查调用者是否被授权
     */
    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender] || msg.sender == owner(), "Unauthorized caller");
        _;
    }

    /**
     * @notice 初始化代币的 bonding curve
     * @param tokenAddress 代币地址
     * @param creator 创建者地址
     * @param targetSupply 目标供应量（用于计算曲线斜率）
     * @param targetPrice 目标价格 (ETH)
     * @param initialPrice 初始价格 (ETH)
     */
    function initializeCurve(
        address tokenAddress,
        address creator,
        uint256 targetSupply,
        uint256 targetPrice,
        uint256 initialPrice
    ) external onlyAuthorized {
        require(!isValidToken[tokenAddress], "Token already initialized");
        
        // 计算 bonding curve 参数 k
        // 使用线性 bonding curve: price = initialPrice + k * supply
        uint256 k = (targetPrice - initialPrice) * 1e18 / targetSupply;
        
        curveParams[tokenAddress] = CurveParams({
            k: k,
            targetSupply: targetSupply,
            targetPrice: targetPrice,
            initialPrice: initialPrice,
            currentSupply: 0,
            graduated: false
        });

        tokenInfos[tokenAddress] = TokenInfo({
            tokenAddress: tokenAddress,
            creator: creator,
            createdAt: block.timestamp,
            totalRaised: 0,
            creatorFeeCollected: 0
        });

        isValidToken[tokenAddress] = true;
    }

    /**
     * @notice 根据 bonding curve 计算当前价格
     * @param tokenAddress 代币地址
     * @return 当前价格（ETH）
     */
    function getCurrentPrice(address tokenAddress) public view returns (uint256) {
        require(isValidToken[tokenAddress], "Invalid token");
        
        CurveParams memory params = curveParams[tokenAddress];
        if (params.graduated) {
            return params.targetPrice;
        }
        
        // 线性 bonding curve: price = initialPrice + (k * currentSupply) / 1e18
        return params.initialPrice + (params.k * params.currentSupply) / 1e18;
    }

    /**
     * @notice 计算购买指定数量代币需要的 ETH
     * @param tokenAddress 代币地址
     * @param tokenAmount 代币数量
     * @return ethCost 购买指定数量代币需要的 ETH
     * @return afterFeesCost 购买指定数量代币需要的 ETH（加上平台和创建者费用）
     */
    function calculateBuyPrice(address tokenAddress, uint256 tokenAmount) 
        public view returns (uint256 ethCost, uint256 afterFeesCost) {
        require(isValidToken[tokenAddress], "Invalid token");
        
        CurveParams memory params = curveParams[tokenAddress];
        require(!params.graduated, "Token has graduated");
        require(params.currentSupply + tokenAmount <= params.targetSupply, "Exceeds target supply");

        // 计算积分：∫(initialPrice + k*x/1e18)dx from currentSupply to currentSupply+tokenAmount
        uint256 currentSupply = params.currentSupply;
        uint256 newSupply = currentSupply + tokenAmount;
        
        // 积分结果：initialPrice * tokenAmount + k * (newSupply² - currentSupply²) / (2 * 1e18)
        uint256 supplySquareDiff = (newSupply * newSupply - currentSupply * currentSupply) / 2;
        ethCost = params.initialPrice * tokenAmount / 1e18 + params.k * supplySquareDiff / (1e18 * 1e18);
        
        // 加上平台和创建者费用
        uint256 totalFees = (ethCost * (PLATFORM_FEE + CREATOR_FEE)) / FEE_BASE;
        afterFeesCost = ethCost + totalFees;
    }

    /**
     * @notice 计算卖出指定数量代币可获得的 ETH
     * @param tokenAddress 代币地址
     * @param tokenAmount 代币数量
     * @return ethBeforeFees 卖出指定数量代币可获得的 ETH（扣费前）
     * @return ethReceived 卖出指定数量代币可获得的 ETH（扣除平台费用后）
     */
    function calculateSellPrice(address tokenAddress, uint256 tokenAmount) 
        public view returns (uint256 ethBeforeFees, uint256 ethReceived) {
        require(isValidToken[tokenAddress], "Invalid token");
        
        CurveParams memory params = curveParams[tokenAddress];
        require(params.currentSupply >= tokenAmount, "Insufficient supply");

        // 计算积分（反向）
        // 积分上限：currentSupply
        uint256 currentSupply = params.currentSupply;
        // 积分下限：currentSupply - tokenAmount
        uint256 newSupply = currentSupply - tokenAmount;
        // 积分结果：initialPrice * tokenAmount + k * (currentSupply² - newSupply²) / (2 * 1e18)
        uint256 supplySquareDiff = (currentSupply * currentSupply - newSupply * newSupply) / 2;
        ethBeforeFees = params.initialPrice * tokenAmount / 1e18 + params.k * supplySquareDiff / (1e18 * 1e18);
        
        // 扣除平台费用
        uint256 platformFee = (ethBeforeFees * PLATFORM_FEE) / FEE_BASE;
        ethReceived = ethBeforeFees - platformFee;
    }

    /**
     * @notice 购买代币
     * @param tokenAddress 代币地址
     * @param minTokenAmount 最小代币数量（防止滑点）
     */
    function buyTokens(address tokenAddress, uint256 minTokenAmount) 
        external payable nonReentrant {
        require(isValidToken[tokenAddress], "Invalid token");
        require(msg.value > 0, "Must send ETH");
        
        CurveParams storage params = curveParams[tokenAddress];
        require(!params.graduated, "Token has graduated");

        // 计算能购买多少代币（使用二分搜索或近似算法）
        uint256 tokenAmount = calculateTokensForEthPrecise(tokenAddress, msg.value);
        require(tokenAmount >= minTokenAmount, "Slippage protection");
        require(params.currentSupply + tokenAmount <= params.targetSupply, "Exceeds target supply");

        // 更新状态
        params.currentSupply += tokenAmount;
        
        TokenInfo storage info = tokenInfos[tokenAddress];
        info.totalRaised += msg.value;

        // 铸造代币给买家
        MemeToken token = MemeToken(tokenAddress);
        token.mint(msg.sender, tokenAmount);

        // 费用分配和处理
        uint256 creatorFee = (msg.value * CREATOR_FEE) / FEE_BASE;
        uint256 platformFee = (msg.value * PLATFORM_FEE) / FEE_BASE;
        
        // 转账给创建者
        if (creatorFee > 0) {
            (bool success, ) = payable(info.creator).call{value: creatorFee}("");
            require(success, "Creator fee transfer failed");
            info.creatorFeeCollected += creatorFee;
        }

        // 转给 MemePlatform 合约
        if (platformFee > 0) {
            totalPlatformFeesCollected += platformFee;
            (bool success, ) = payable(memePlatform).call{value: platformFee}("");
            require(success, "Platform fee transfer failed");
            // 调用 MemePlatform 的接收函数
            IMemePlatform(memePlatform).receivePlatformFees{value: 0}();
            emit PlatformFeeSent(memePlatform, platformFee);
        }

        // 检查是否达到毕业条件（仅市值条件）
        if (checkGraduationCondition(tokenAddress)) {
            params.graduated = true;
            uint256 currentMarketCap = getCurrentMarketCap(tokenAddress);
            emit TokenGraduatedByMarketCap(tokenAddress, params.currentSupply, info.totalRaised, currentMarketCap);
        }

        emit TokenBought(
            tokenAddress,
            msg.sender,
            msg.value,
            tokenAmount,
            getCurrentPrice(tokenAddress),
            params.currentSupply
        );
    }

    /**
     * @notice 卖出代币
     * @param tokenAddress 代币地址
     * @param tokenAmount 代币数量
     * @param minEthAmount 最小 ETH 数量（防止滑点）
     */
    function sellTokens(address tokenAddress, uint256 tokenAmount, uint256 minEthAmount) 
        external nonReentrant {
        require(isValidToken[tokenAddress], "Invalid token");
        require(tokenAmount > 0, "Must sell positive amount");
        
        CurveParams storage params = curveParams[tokenAddress];
        require(!params.graduated, "Token has graduated");

        MemeToken token = MemeToken(tokenAddress);
        require(token.balanceOf(msg.sender) >= tokenAmount, "Insufficient token balance");

        // 计算卖出价格
        (uint256 ethBeforeFees, uint256 ethReceived) = calculateSellPrice(tokenAddress, tokenAmount);
        require(ethReceived >= minEthAmount, "Slippage protection");
        
        // 计算平台费用和检查合约ETH余额
        uint256 platformFee = (ethBeforeFees * PLATFORM_FEE) / FEE_BASE;
        uint256 totalEthNeeded = ethReceived + platformFee;
        require(address(this).balance >= totalEthNeeded, "Insufficient contract ETH balance");

        // 更新状态
        params.currentSupply -= tokenAmount;

        // 销毁代币
        token.burnFrom(msg.sender, tokenAmount);

        // 转账 ETH 给卖家
        (bool success, ) = payable(msg.sender).call{value: ethReceived}("");
        require(success, "ETH transfer to seller failed");
        
        // 转给 MemePlatform 合约
        if (platformFee > 0) {
            totalPlatformFeesCollected += platformFee;
            (bool platformSuccess, ) = payable(memePlatform).call{value: platformFee}("");
            require(platformSuccess, "Platform fee transfer failed");
            IMemePlatform(memePlatform).receivePlatformFees{value: 0}();
            emit PlatformFeeSent(memePlatform, platformFee);
        }

        emit TokenSold(
            tokenAddress,
            msg.sender,
            tokenAmount,
            ethReceived,
            getCurrentPrice(tokenAddress),
            params.currentSupply
        );
    }

    /**
     * @notice 计算给定 ETH 数量能购买多少代币（改进版本 - 使用二分搜索）
     * @param tokenAddress 代币地址
     * @param ethAmount  ETH 数量
     * @return 能购买多少代币
     */
    function calculateTokensForEthPrecise(address tokenAddress, uint256 ethAmount) 
        public view returns (uint256) {
        CurveParams memory params = curveParams[tokenAddress];
        
        uint256 left = 0;
        uint256 right = params.targetSupply - params.currentSupply;
        
        // 二分搜索找到精确的代币数量
        while (left < right) {
            uint256 mid = (left + right + 1) / 2;
            // 使用 afterFeesCost 与用户发送的 ETH 比较
            (, uint256 afterFeesCost) = calculateBuyPrice(tokenAddress, mid);
            
            if (afterFeesCost <= ethAmount) {
                left = mid;
            } else {
                right = mid - 1;
            }
        }
        
        return left;
    }

    /**
     * @notice 获取代币的详细信息
     * @param tokenAddress 代币地址
     * @return params 代币的 bonding curve 参数
     * @return info 代币的 token 信息
     * @return currentPrice 代币的当前价格
     * @return marketCap 代币的市场资本
     */
    function getTokenDetails(address tokenAddress) 
        external view returns (
            CurveParams memory params,
            TokenInfo memory info,
            uint256 currentPrice,
            uint256 marketCap
        ) {
        require(isValidToken[tokenAddress], "Invalid token");
        
        params = curveParams[tokenAddress];
        info = tokenInfos[tokenAddress];
        currentPrice = getCurrentPrice(tokenAddress);
        marketCap = (currentPrice * params.currentSupply) / 1e18;
    }

    /**
     * @notice 紧急提取函数（仅用于紧急情况）
     * 注意：正常情况下平台费用会直接转给 MemePlatform
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH balance to withdraw");
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "ETH transfer failed");
    }

    /**
     * @notice 紧急情况下暂停代币交易
     */
    function emergencyPause(address tokenAddress) external onlyOwner {
        curveParams[tokenAddress].graduated = true;
    }

    /**
     * @notice 获取合约ETH余额
     */
    function getContractEthBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice 接收ETH的fallback函数
     */
    receive() external payable {}

    /**
     * @notice 检查代币是否达到毕业条件（仅市值条件）
     * @param tokenAddress 代币地址
     * @return shouldGraduate 是否应该毕业
     */
    function checkGraduationCondition(address tokenAddress) 
        public view returns (bool shouldGraduate) {
        require(isValidToken[tokenAddress], "Invalid token");
        
        CurveParams memory params = curveParams[tokenAddress];
        
        // 如果已经毕业，返回false
        if (params.graduated) {
            return false;
        }
        
        // 仅检查市值条件
        uint256 currentPrice = getCurrentPrice(tokenAddress);
        uint256 currentMarketCap = (currentPrice * params.currentSupply) / 1e18;
        
        return currentMarketCap >= TARGET_MARKET_CAP;
    }

    /**
     * @notice 计算当前市值
     * @param tokenAddress 代币地址
     * @return marketCap 当前市值 (ETH)
     */
    function getCurrentMarketCap(address tokenAddress) public view returns (uint256 marketCap) {
        require(isValidToken[tokenAddress], "Invalid token");
        
        CurveParams memory params = curveParams[tokenAddress];
        uint256 currentPrice = getCurrentPrice(tokenAddress);
        marketCap = (currentPrice * params.currentSupply) / 1e18;
    }
} 