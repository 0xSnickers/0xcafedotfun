// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "./MemeToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./FeeManager.sol";
import "./LiquidityManager.sol";



/**
 * @title BondingCurve
 * @notice 实现 bonding curve 动态定价和铸造机制【类似 pump.fun】
 * 线性定价算法：- price = initialPrice + k * supply
 *             - price = 初始价格 + 每单位涨幅 × 当前已售数量（supply）
 */
contract BondingCurve is Ownable, ReentrancyGuard {
    using Math for uint256;
    // Bonding Curve 参数
    struct CurveParams {
        uint256 k; // 曲线参数 k (斜率)
        uint256 targetSupply; // 目标供应量 (仅用于计算曲线，不再作为毕业条件)
        uint256 targetPrice; // 目标价格 (ETH)
        uint256 initialPrice; // 初始价格 (ETH)
        uint256 currentSupply; // 当前已铸造供应量
        bool graduated; // 是否已达到目标并迁移
    }

    // 代币信息
    struct TokenInfo {
        address tokenAddress; // 代币地址
        address creator; // 创建者地址
        uint256 createdAt; // 创建时间
        uint256 totalRaised; // 总筹集 ETH
        uint256 graduationEth; // 毕业时的ETH余额
    }
    // 卖出交易数据结构体
    struct SellData {
        uint256 ethBeforeFees;
        uint256 ethReceived;
        uint256 creatorFee;
        uint256 platformFee;
        uint256 totalPaid;
        bool transferSuccess;
    }
   struct LiquidityData {
        uint256 liquidityTokenAmount;   // 添加的代币数量
        uint256 liquidityEthAmount;     // 添加的ETH数量
    }

    // 市值毕业门槛：10 ETH
    uint256 public constant TARGET_MARKET_CAP = 10 ether;

    // 费用常量
    uint256 public constant PLATFORM_FEE = 200; // 2%
    uint256 public constant CREATOR_FEE = 300; // 3%
    uint256 public constant FEE_BASE = 10000; // 100%

    // 毕业时用于添加流动性的ETH数量比例（90%）
    uint256 public constant GRADUATION_ETH_RATIO = 9000; // 90%
    uint256 public constant RATIO_BASE = 10000;

    // 存储每个代币的 curve 参数
    mapping(address => CurveParams) public curveParams; // 代币地址 => curve 参数
    // 存储每个代币的 token 信息
    mapping(address => TokenInfo) public tokenInfos; // 代币地址 => token 信息
    // 是否有效代币
    mapping(address => bool) public isValidToken; // 代币地址 => 是否有效

    // MemeFactory 合约地址
    address public memeFactory;
    // FeeManager 合约地址
    FeeManager public feeManager;

    // LiquidityManager 合约地址
    address public liquidityManager;

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
        uint256 marketCap,
        address indexed uniswapPair,
        uint256 liquidityTokens,
        uint256 liquidityEth
    );

    event MemePlatformUpdated(
        address indexed oldPlatform,
        address indexed newPlatform
    );

    event LiquidityManagerUpdated(
        address indexed oldManager,
        address indexed newManager
    );

    constructor(
        address _feeManager,
        address _liquidityManager
    ) Ownable(msg.sender) {
        require(_feeManager != address(0), "Invalid fee manager address");
        feeManager = FeeManager(payable(_feeManager));
        liquidityManager = _liquidityManager;
    }

    /**
     * @notice 设置 MemeFactory 地址
     * @param _memeFactory 新的平台地址
     */
    function setMemeFactory(address _memeFactory) external onlyOwner {
        require(_memeFactory != address(0), "Invalid platform address");
        address oldFactory = memeFactory;
        memeFactory = _memeFactory;
        emit MemePlatformUpdated(oldFactory, _memeFactory);
    }

    /**
     * @notice 设置 LiquidityManager 地址
     * @param _liquidityManager 新的流动性管理器地址
     */
    function setLiquidityManager(address _liquidityManager) external onlyOwner {
        require(
            _liquidityManager != address(0),
            "Invalid liquidity manager address"
        );
        address oldManager = liquidityManager;
        liquidityManager = _liquidityManager;
        emit LiquidityManagerUpdated(oldManager, _liquidityManager);
    }

    /**
     * @notice 初始化代币的 bonding curve（仅限平台调用）
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
    ) external {
        require(
            msg.sender == memeFactory,
            "Only factory can initialize curves"
        );
        require(!isValidToken[tokenAddress], "Token already initialized");

        // 计算 bonding curve 参数 k
        // 使用线性 bonding curve: price = initialPrice + k * supply
        uint256 k = ((targetPrice - initialPrice) * 1e18) / targetSupply;

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
            graduationEth: 0
        });

        isValidToken[tokenAddress] = true;
    }

    /**
     * @notice 管理员初始化代币的 bonding curve（仅限管理员）
     * @param tokenAddress 代币地址
     * @param creator 创建者地址
     * @param targetSupply 目标供应量（用于计算曲线斜率）
     * @param targetPrice 目标价格 (ETH)
     * @param initialPrice 初始价格 (ETH)
     */
    function adminInitializeCurve(
        address tokenAddress,
        address creator,
        uint256 targetSupply,
        uint256 targetPrice,
        uint256 initialPrice
    ) external onlyOwner {
        require(!isValidToken[tokenAddress], "Token already initialized");

        // 计算 bonding curve 参数 k
        // 使用线性 bonding curve: price = initialPrice + k * supply
        uint256 k = ((targetPrice - initialPrice) * 1e18) / targetSupply;

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
            graduationEth: 0
        });

        isValidToken[tokenAddress] = true;
    }

    /**
     * @notice 根据 bonding curve 计算当前价格
     * @param tokenAddress 代币地址
     * @return 当前价格（ETH）
     */
    function getCurrentPrice(
        address tokenAddress
    ) public view returns (uint256) {
        require(isValidToken[tokenAddress], "Invalid token");

        CurveParams memory params = curveParams[tokenAddress];

        // 无论是否毕业，都使用相同的线性 bonding curve 公式计算价格
        // 这样可以保证价格的连续性，毕业前后价格不会突变
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
    function calculateBuyPrice(
        address tokenAddress,
        uint256 tokenAmount
    ) public view returns (uint256 ethCost, uint256 afterFeesCost) {
        require(isValidToken[tokenAddress], "Invalid token");

        CurveParams memory params = curveParams[tokenAddress];
        require(!params.graduated, "Token has graduated");
        require(
            params.currentSupply + tokenAmount <= params.targetSupply,
            "Exceeds target supply"
        );

        // 计算积分：∫(initialPrice + k*x/1e18)dx from currentSupply to currentSupply+tokenAmount
        uint256 currentSupply = params.currentSupply;
        uint256 newSupply = currentSupply + tokenAmount;

        // 积分结果：initialPrice * tokenAmount + k * (newSupply² - currentSupply²) / (2 * 1e18)
        uint256 supplySquareDiff = (newSupply *
            newSupply -
            currentSupply *
            currentSupply) / 2;
        ethCost =
            (params.initialPrice * tokenAmount) /
            1e18 +
            (params.k * supplySquareDiff) /
            (1e18 * 1e18);

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
    function calculateSellPrice(
        address tokenAddress,
        uint256 tokenAmount
    ) public view returns (uint256 ethBeforeFees, uint256 ethReceived) {
        require(isValidToken[tokenAddress], "Invalid token");

        CurveParams memory params = curveParams[tokenAddress];
        require(params.currentSupply >= tokenAmount, "Insufficient supply");

        // 计算积分（反向）
        // 积分上限：currentSupply
        uint256 currentSupply = params.currentSupply;
        // 积分下限：currentSupply - tokenAmount
        uint256 newSupply = currentSupply - tokenAmount;
        // 积分结果：initialPrice * tokenAmount + k * (currentSupply² - newSupply²) / (2 * 1e18)
        uint256 supplySquareDiff = (currentSupply *
            currentSupply -
            newSupply *
            newSupply) / 2;
        ethBeforeFees =
            (params.initialPrice * tokenAmount) /
            1e18 +
            (params.k * supplySquareDiff) /
            (1e18 * 1e18);

        // 扣除平台费用
        uint256 platformFee = (ethBeforeFees * PLATFORM_FEE) / FEE_BASE;
        ethReceived = ethBeforeFees - platformFee;
    }

    /**
     * @notice 购买代币
     * @param tokenAddress 代币地址
     * @param minTokenAmount 最小代币数量（防止滑点）
     */
    function buyTokens(
        address tokenAddress,
        uint256 minTokenAmount
    ) external payable nonReentrant {
        require(isValidToken[tokenAddress], "Invalid token");
        require(msg.value > 0, "Must send ETH");

        CurveParams storage params = curveParams[tokenAddress];
        require(!params.graduated, "Token has graduated");

        // 计算能购买多少代币
        uint256 tokenAmount = calculateTokensForEthPrecise(
            tokenAddress,
            msg.value
        );
        require(tokenAmount >= minTokenAmount, "Slippage protection");
        require(
            params.currentSupply + tokenAmount <= params.targetSupply,
            "Exceeds target supply"
        );

        // 更新状态
        params.currentSupply += tokenAmount;

        TokenInfo storage info = tokenInfos[tokenAddress];

        // 铸造代币给买家
        MemeToken token = MemeToken(tokenAddress);
        token.mint(msg.sender, tokenAmount);
        token.setCurrentSupply(params.currentSupply);

        // 使用 FeeManager 处理费用
        (uint256 creatorFee, uint256 platformFee) = feeManager.handleBuyFees{
            value: msg.value
        }(tokenAddress, info.creator, msg.value);

        // 计算实际留在合约中的ETH数量（扣除费用）
        uint256 actualEthForCurve = msg.value - creatorFee - platformFee;
        info.totalRaised += actualEthForCurve;

        // 检查是否达到毕业条件
        if (checkGraduationCondition(tokenAddress)) {
            _graduateToken(tokenAddress);
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
    function sellTokens(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 minEthAmount
    ) external nonReentrant {
        require(isValidToken[tokenAddress], "Invalid token");
        require(tokenAmount > 0, "Must sell positive amount");
        require(!curveParams[tokenAddress].graduated, "Token has graduated");

        MemeToken token = MemeToken(tokenAddress);
        require(
            token.balanceOf(msg.sender) >= tokenAmount,
            "Insufficient token balance"
        );

        // 使用结构体封装卖出数据，减少栈变量
        SellData memory sellData;

        // 计算卖出价格
        (sellData.ethBeforeFees, sellData.ethReceived) = calculateSellPrice(
            tokenAddress,
            tokenAmount
        );
        require(sellData.ethReceived >= minEthAmount, "Slippage protection");

        // 检查合约余额是否足够
        require(
            address(this).balance >= sellData.ethBeforeFees,
            "Insufficient contract ETH balance"
        );

        // 更新状态
        curveParams[tokenAddress].currentSupply -= tokenAmount;

        // 销毁代币
        token.burnFrom(msg.sender, tokenAmount);
        token.setCurrentSupply(curveParams[tokenAddress].currentSupply);

        // 使用 FeeManager 处理费用
        (sellData.creatorFee, sellData.platformFee) = feeManager.handleSellFees{
            value: sellData.ethBeforeFees
        }(
            tokenAddress,
            tokenInfos[tokenAddress].creator,
            sellData.ethBeforeFees
        );

        // 减少市值 - 使用实际支付的ETH数量（包含费用）
        sellData.totalPaid =
            sellData.creatorFee +
            sellData.platformFee +
            sellData.ethReceived;
        if (tokenInfos[tokenAddress].totalRaised >= sellData.totalPaid) {
            tokenInfos[tokenAddress].totalRaised -= sellData.totalPaid;
        } else {
            tokenInfos[tokenAddress].totalRaised = 0; // 防止变为负数
        }

        // 转账 ETH 给卖家
        (sellData.transferSuccess, ) = payable(msg.sender).call{
            value: sellData.ethReceived
        }("");
        require(sellData.transferSuccess, "ETH transfer to seller failed");

        emit TokenSold(
            tokenAddress,
            msg.sender,
            tokenAmount,
            sellData.ethReceived,
            getCurrentPrice(tokenAddress),
            curveParams[tokenAddress].currentSupply
        );
    }

    /**
     * @notice 计算给定 ETH 数量能购买多少代币（改进版本 - 使用二分搜索）
     * @param tokenAddress 代币地址
     * @param ethAmount  ETH 数量
     * @return 能购买多少代币
     */
    function calculateTokensForEthPrecise(
        address tokenAddress,
        uint256 ethAmount
    ) public view returns (uint256) {
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
    function getTokenDetails(
        address tokenAddress
    )
        external
        view
        returns (
            CurveParams memory params,
            TokenInfo memory info,
            uint256 currentPrice,
            uint256 marketCap
        )
    {
        require(isValidToken[tokenAddress], "Invalid token");

        params = curveParams[tokenAddress];
        info = tokenInfos[tokenAddress];
        currentPrice = getCurrentPrice(tokenAddress);
        // 市值 = 当前价格 × 当前供应量
        marketCap = (currentPrice * params.currentSupply) / 1e18;
    }

    /**
     * @notice 检查代币是否达到毕业条件（仅市值条件）
     * @param tokenAddress 代币地址
     * @return shouldGraduate 是否应该毕业
     */
    function checkGraduationCondition(
        address tokenAddress
    ) public view returns (bool shouldGraduate) {
        require(isValidToken[tokenAddress], "Invalid token");

        CurveParams memory params = curveParams[tokenAddress];

        // 如果已经毕业，返回false
        if (params.graduated) {
            return false;
        }

        // 检查市值条件 - 使用当前价格 × 流通供应量
        uint256 currentPrice = getCurrentPrice(tokenAddress);
        uint256 currentMarketCap = (currentPrice * params.currentSupply) / 1e18;

        return currentMarketCap >= TARGET_MARKET_CAP;
    }

    /**
     * @notice 计算当前市值
     * @param tokenAddress 代币地址
     * @return marketCap 当前市值 (ETH)
     */
    function getCurrentMarketCap(
        address tokenAddress
    ) public view returns (uint256 marketCap) {
        require(isValidToken[tokenAddress], "Invalid token");

        CurveParams memory params = curveParams[tokenAddress];
        uint256 currentPrice = getCurrentPrice(tokenAddress);
        // 市值 = 当前价格 × 当前供应量
        marketCap = (currentPrice * params.currentSupply) / 1e18;
    }

    /**
     * @notice 准备代币毕业，设置状态并准备流动性
     * @param tokenAddress 代币地址
     * @return liquidityTokenAmount 用于流动性的代币数量
     * @return liquidityEthAmount 用于流动性的ETH数量
     */
    function _prepareForGraduation(
        address tokenAddress
    )
        internal
        returns (uint256 liquidityTokenAmount, uint256 liquidityEthAmount)
    {
        CurveParams storage params = curveParams[tokenAddress];
        TokenInfo storage info = tokenInfos[tokenAddress];

        // 使用该代币筹集的ETH，而不是合约总余额
        uint256 tokenRaisedEth = info.totalRaised;
        info.graduationEth = tokenRaisedEth;

        // 计算用于添加流动性的ETH数量：该代币筹集ETH的90%
        liquidityEthAmount = (tokenRaisedEth * GRADUATION_ETH_RATIO) / RATIO_BASE;

        // 检查ETH余额是否足够
        require(liquidityEthAmount > 0, "No ETH for liquidity");
        require(
            liquidityEthAmount <= tokenRaisedEth,
            "Insufficient ETH for liquidity"
        );
        require(
            address(this).balance >= liquidityEthAmount,
            "Insufficient contract balance for liquidity"
        );

        // 直接使用筹集ETH按当前价格计算等比例的Token数量
        // 获取当前价格
        uint256 currentPrice = getCurrentPrice(tokenAddress);
        
        // 计算流动性代币数量：用流动性ETH数量除以当前价格
        liquidityTokenAmount = (liquidityEthAmount * 1e18) / currentPrice;

        // 最小流动性检查
        require(liquidityTokenAmount > 0, "No tokens for liquidity");

        // 标记为已毕业（在所有计算和验证完成后）
        params.graduated = true;
        require(liquidityManager != address(0), "LiquidityManager not set");
        
        // 铸造代币给 LiquidityManager，将代币和 ETH 发送给它
        MemeToken token = MemeToken(tokenAddress);
        // 这部份仅用于添加流动性（添加后会丢弃LP），不修改currentSupply避免影响价格波动
        token.mint(liquidityManager, liquidityTokenAmount);
        // 丢弃代币的铸造权限
        token.setMinter(address(0));
    }
   

    /**
     * @notice 代币毕业，自动添加流动性到 Uniswap V2
     * @param tokenAddress 代币地址
     */
    function _graduateToken(address tokenAddress) internal {
        require(isValidToken[tokenAddress], "Invalid token");
        require(
            checkGraduationCondition(tokenAddress),
            "Token not ready for graduation"
        );

        CurveParams storage params = curveParams[tokenAddress];
        require(!params.graduated, "Token already graduated");

        TokenInfo storage info = tokenInfos[tokenAddress];

        // 详细检查合约是否有足够ETH进行流动性添加
        uint256 contractBalance = address(this).balance;
        uint256 requiredEthForLiquidity = (info.totalRaised *
            GRADUATION_ETH_RATIO) / RATIO_BASE;

        require(contractBalance > 0, "No ETH available for liquidity");
        require(
            contractBalance >= requiredEthForLiquidity,
            "Insufficient ETH for graduation liquidity"
        );

        // 1. 准备毕业
        (
            uint256 liquidityTokenAmount,
            uint256 liquidityEthAmount
        ) = _prepareForGraduation(tokenAddress);


        // 2. 转移 ETH 给 LiquidityManager
        (bool success, ) = payable(liquidityManager).call{
            value: liquidityEthAmount
        }("");
        require(success, "ETH transfer to LiquidityManager failed");

        // 3. 调用 LiquidityManager 存储流动性数据
        LiquidityManager(payable(liquidityManager)).storeLiquidityData(
            tokenAddress,
            liquidityTokenAmount,
            liquidityEthAmount
        );

        // 4. 发出毕业事件（流动性将由 LiquidityManager 处理）
        uint256 currentMarketCap = getCurrentMarketCap(tokenAddress);

        emit TokenGraduatedByMarketCap(
            tokenAddress,
            params.currentSupply,
            info.totalRaised,
            currentMarketCap,
            address(0), // pair 地址稍后由 LiquidityManager 设置
            liquidityTokenAmount,
            liquidityEthAmount
        );
    }

    /**
     * @notice 提取合约ETH余额
     * @param amount 提取的ETH数量
     */
    function withdrawETH(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "ETH withdrawal failed");
    }

    /**
     * @notice 接收 ETH
     */
    receive() external payable {}
}
