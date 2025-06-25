// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "./MemeToken.sol";
import "./BondingCurve.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Uniswap V2 接口
interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IUniswapV2Router02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
}

interface IUniswapV2Pair {
    function totalSupply() external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function transfer(address to, uint value) external returns (bool);
}


/**
 * @title LiquidityManager
 * @notice 专门处理代币毕业后的流动性添加和锁定
 * @dev 简化版本：只处理单个代币的流动性添加和自动锁定
 */
contract LiquidityManager is Ownable, ReentrancyGuard {
    
    // 毕业时的流动性数据
    struct GraduatedLiquidityData {
        uint256 liquidityTokenAmount;   // 添加的代币数量
        uint256 liquidityEthAmount;     // 添加的ETH数量
        address uniswapPair;           // Uniswap V2 交易对地址
        uint256 liquidityTokens;       // 获得的流动性代币数量
        bool liquidityAdded;           // 是否已添加流动性
        bool liquidityLocked;          // 是否已锁定流动性
        uint256 addedAt;              // 流动性添加时间
    }
     // 添加流动性操作的结构体，用于解决 Stack too deep 问题
    struct AddLiquidityParams {
        address tokenAddress;
        uint256 liquidityTokenAmount;
        uint256 liquidityEthAmount;
        uint256 minTokenAmount;
        uint256 minEthAmount;
        uint256 tokenBalance;
        address router;
        address factory;
    }
    
    // 添加流动性结果的结构体
    struct AddLiquidityResult {
        uint256 amountToken;
        uint256 amountETH;
        uint256 liquidity;
        address pair;
    }
    // 存储每个代币的流动性数据
    mapping(address => GraduatedLiquidityData) public graduatedParams;

    
    // Uniswap V2 Router 地址
    address public uniswapRouter;
    
    // BondingCurve 合约地址
    address public bondingCurve;
    
    // 滑点保护
    uint256 public constant SLIPPAGE_TOLERANCE = 1500; // 15%
    uint256 public constant SLIPPAGE_BASE = 10000;
    
    // 事件
    event LiquidityDataStored(
        address indexed token,
        uint256 liquidityTokenAmount,
        uint256 liquidityEthAmount
    );
    
    event LiquidityAdded(
        address indexed token,
        address indexed pair,
        uint256 amountToken,
        uint256 amountETH,
        uint256 liquidity
    );
    
    event LiquidityLocked(
        address indexed token,
        address indexed pair,
        uint256 liquidity
    );
    
    event AuthorizedCallerAdded(address indexed caller);
    event AuthorizedCallerRemoved(address indexed caller);
    event UniswapRouterUpdated(address indexed oldRouter, address indexed newRouter);
    event BondingCurveUpdated(address indexed oldBondingCurve, address indexed newBondingCurve);
    
    constructor(address _uniswapRouter) Ownable(msg.sender) {
        require(_uniswapRouter != address(0), "Invalid uniswap router address");
        uniswapRouter = _uniswapRouter;
    }
    
    /**
     * @notice 设置 Uniswap Router 地址
     * @param _uniswapRouter 新的路由地址
     */
    function setUniswapRouter(address _uniswapRouter) external onlyOwner {
        require(_uniswapRouter != address(0), "Invalid uniswap router address");
        address oldRouter = uniswapRouter;
        uniswapRouter = _uniswapRouter;
        emit UniswapRouterUpdated(oldRouter, _uniswapRouter);
    }
    
    /**
     * @notice 设置 BondingCurve 地址
     * @param _bondingCurve 新的 BondingCurve 地址
     */
    function setBondingCurve(address _bondingCurve) external onlyOwner {
        require(_bondingCurve != address(0), "Invalid bonding curve address");
        address oldBondingCurve = bondingCurve;
        bondingCurve = _bondingCurve;
        emit BondingCurveUpdated(oldBondingCurve, _bondingCurve);
    }
    
    /**
     * @notice 存储毕业代币的流动性数据
     * @param tokenAddress 代币地址
     * @param liquidityTokenAmount 流动性代币数量
     * @param liquidityEthAmount 流动性ETH数量
     */
    function storeLiquidityData(
        address tokenAddress,
        uint256 liquidityTokenAmount,
        uint256 liquidityEthAmount
    ) external {
        require(
            msg.sender == bondingCurve,
            "Only BondingCurve can store liquidity data"
        );
        require(tokenAddress != address(0), "Invalid token address");
        require(liquidityTokenAmount > 0, "Invalid token amount");
        require(liquidityEthAmount > 0, "Invalid ETH amount");
        
        // 验证代币是否有效且已毕业
        BondingCurve bc = BondingCurve(payable(bondingCurve));
        require(bc.isValidToken(tokenAddress), "Invalid token");
        
        (,,,,,bool graduated) = bc.curveParams(tokenAddress);
        require(graduated, "Token not graduated");
        
        // 存储流动性数据
        graduatedParams[tokenAddress] = GraduatedLiquidityData({
            liquidityTokenAmount: liquidityTokenAmount,
            liquidityEthAmount: liquidityEthAmount,
            uniswapPair: address(0),
            liquidityTokens: 0,
            liquidityAdded: false,
            liquidityLocked: false,
            addedAt: 0
        });
        
        emit LiquidityDataStored(tokenAddress, liquidityTokenAmount, liquidityEthAmount);
    }
    
   

    /**
     * @notice 添加流动性到 Uniswap V2
     * @dev 此函数完成：添加流动性，然后调用锁定流动性方法
     * @param tokenAddress 代币地址
     * @return amountToken 实际添加的代币数量
     * @return amountETH 实际添加的ETH数量
     * @return liquidity 获得的流动性代币数量
     * @return pair Uniswap V2 交易对地址
     */
    function addLiquidityToUniswap(address tokenAddress)
        external
        nonReentrant
        returns (
            uint256 amountToken,
            uint256 amountETH,
            uint256 liquidity,
            address pair
        )
    {
        GraduatedLiquidityData storage liquidityData = graduatedParams[tokenAddress];
        require(liquidityData.liquidityTokenAmount > 0, "No liquidity data found");
        require(!liquidityData.liquidityAdded, "Liquidity already added");
        
        // 使用结构体封装参数，避免 Stack too deep
        AddLiquidityParams memory params = AddLiquidityParams({
            tokenAddress: tokenAddress,
            liquidityTokenAmount: liquidityData.liquidityTokenAmount,
            liquidityEthAmount: liquidityData.liquidityEthAmount,
            minTokenAmount: 0, // 稍后计算
            minEthAmount: 0,   // 稍后计算
            tokenBalance: 0,   // 稍后获取
            router: uniswapRouter,
            factory: address(0) // 稍后获取
        });
        
        // 验证参数
        require(params.liquidityTokenAmount > 0, "Liquidity token amount must be greater than 0");
        require(params.liquidityEthAmount > 0, "Liquidity ETH amount must be greater than 0");
        require(address(this).balance >= params.liquidityEthAmount, "Insufficient ETH balance for liquidity");
        
        // 获取代币合约实例并检查余额
        MemeToken token = MemeToken(params.tokenAddress);
        params.tokenBalance = token.balanceOf(address(this));
        require(params.tokenBalance >= params.liquidityTokenAmount, "Insufficient token balance for liquidity");
        
        // 执行添加流动性操作
        AddLiquidityResult memory result = _executeAddLiquidity(params, token);
        
        // 更新存储信息
        liquidityData.uniswapPair = result.pair;
        liquidityData.liquidityTokens = result.liquidity;
        liquidityData.liquidityAdded = true;
        liquidityData.addedAt = block.timestamp;
        
        emit LiquidityAdded(tokenAddress, result.pair, result.amountToken, result.amountETH, result.liquidity);
        
        // 调用锁定流动性方法
        _lockLiquidity(tokenAddress, result.pair, result.liquidity);
        return (result.amountToken, result.amountETH, result.liquidity, result.pair);
    }
    
    /**
     * @notice 执行添加流动性的内部方法
     * @dev 将添加流动性的复杂逻辑抽离，避免主方法的 Stack too deep 问题
     * @param params 添加流动性的参数结构体
     * @param token 代币合约实例
     * @return result 添加流动性的结果结构体
     */
    function _executeAddLiquidity(
        AddLiquidityParams memory params,
        MemeToken token
    ) internal returns (AddLiquidityResult memory result) {
        // Step 1: 批准 Router 使用代币
        bool approveSuccess = token.approve(params.router, params.liquidityTokenAmount);
        require(approveSuccess, "TOKEN approval failed");
        
        // Step 2: 获取 Router 和 Factory 实例
        IUniswapV2Router02 router = IUniswapV2Router02(params.router);
        params.factory = router.factory();
        
        // Step 3: 计算滑点保护
        params.minTokenAmount = (params.liquidityTokenAmount * (SLIPPAGE_BASE - SLIPPAGE_TOLERANCE)) / SLIPPAGE_BASE;
        params.minEthAmount = (params.liquidityEthAmount * (SLIPPAGE_BASE - SLIPPAGE_TOLERANCE)) / SLIPPAGE_BASE;
        
        // Step 4: 添加流动性
        (result.amountToken, result.amountETH, result.liquidity) = router.addLiquidityETH{
            value: params.liquidityEthAmount
        }(
            params.tokenAddress,
            params.liquidityTokenAmount,
            params.minTokenAmount,
            params.minEthAmount,
            address(this),  // LP tokens 接收者
            block.timestamp + 3600  // 1小时后过期
        );
        
        // Step 5: 获取交易对地址
        IUniswapV2Factory factory = IUniswapV2Factory(params.factory);
        result.pair = factory.getPair(params.tokenAddress, router.WETH());
        
        // Step 6: 验证结果
        require(result.amountToken > 0, "No tokens were added to liquidity");
        require(result.amountETH > 0, "No ETH was added to liquidity");
        require(result.liquidity > 0, "No liquidity tokens received");
        require(result.pair != address(0), "Failed to get pair address");
        
        return result;
    }
    
    /**
     * @notice 锁定流动性代币
     * @dev 将流动性代币发送到黑洞地址永久锁定
     * @param tokenAddress 代币地址
     * @param pair Uniswap V2 交易对地址
     * @param liquidity 流动性代币数量
     */
    function _lockLiquidity(address tokenAddress, address pair, uint256 liquidity) internal {
        require(pair != address(0), "Invalid pair address");
        require(liquidity > 0, "Invalid liquidity amount");
        
        GraduatedLiquidityData storage liquidityData = graduatedParams[tokenAddress];
        require(!liquidityData.liquidityLocked, "Liquidity already locked");
        
        // 将流动性代币发送到黑洞地址
        bool transferSuccess = IUniswapV2Pair(pair).transfer(
            address(0x000000000000000000000000000000000000dEaD), 
            liquidity
        );
        require(transferSuccess, "Failed to lock liquidity tokens");
        
        // 更新锁定状态
        liquidityData.liquidityLocked = true;
        
        emit LiquidityLocked(tokenAddress, pair, liquidity);
    }
    
 
    
    /**
     * @notice 单独锁定流动性（外部调用）
     * @dev 允许外部调用锁定已添加但未锁定的流动性
     * @param tokenAddress 代币地址
     */
    function lockLiquidity(address tokenAddress) external nonReentrant {
        GraduatedLiquidityData storage liquidityData = graduatedParams[tokenAddress];
        require(liquidityData.liquidityAdded, "Liquidity not added yet");
        require(!liquidityData.liquidityLocked, "Liquidity already locked");
        require(liquidityData.uniswapPair != address(0), "Invalid pair address");
        require(liquidityData.liquidityTokens > 0, "No liquidity tokens to lock");
        
        _lockLiquidity(tokenAddress, liquidityData.uniswapPair, liquidityData.liquidityTokens);
    }
    
    /**
     * @notice 获取代币的流动性信息
     * @param tokenAddress 代币地址
     * @return liquidityData 流动性数据
     */
    function getLiquidityInfo(address tokenAddress) 
        external 
        view 
        returns (GraduatedLiquidityData memory liquidityData) 
    {
        return graduatedParams[tokenAddress];
    }
    
    /**
     * @notice 检查代币是否需要添加流动性
     * @param tokenAddress 代币地址
     * @return needsLiquidity 是否需要添加流动性
     */
    function needsLiquidityAddition(address tokenAddress) external view returns (bool needsLiquidity) {
        GraduatedLiquidityData memory liquidityData = graduatedParams[tokenAddress];
        return liquidityData.liquidityTokenAmount > 0 && !liquidityData.liquidityAdded;
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
     * @notice 紧急提取代币
     * @param tokenAddress 代币地址
     * @param amount 提取数量
     */
    function emergencyWithdrawToken(address tokenAddress, uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        MemeToken token = MemeToken(tokenAddress);
        require(token.balanceOf(address(this)) >= amount, "Insufficient token balance");
        token.transfer(owner(), amount);
    }
    
    /**
     * @notice 接收 ETH
     */
    receive() external payable {}
} 