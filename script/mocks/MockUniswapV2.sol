// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockUniswapV2Pair is ERC20 {
    address public immutable token0;
    address public immutable token1;
    address public immutable router;
    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    constructor(address token0_, address token1_, address router_) ERC20("Mock LP", "MLP") {
        token0 = token0_;
        token1 = token1_;
        router = router_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == router, "NOT_ROUTER");
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external {
        require(msg.sender == router, "NOT_ROUTER");
        _burn(from, amount);
    }

    function syncReserves(uint256 tokenReserve, uint256 ethReserve) external {
        require(msg.sender == router, "NOT_ROUTER");
        if (token0 == routerWeth()) {
            reserve0 = SafeCast.toUint112(ethReserve);
            reserve1 = SafeCast.toUint112(tokenReserve);
        } else {
            reserve0 = SafeCast.toUint112(tokenReserve);
            reserve1 = SafeCast.toUint112(ethReserve);
        }
        blockTimestampLast = uint32(block.timestamp);
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    function routerWeth() internal view returns (address weth) {
        weth = MockUniswapV2Router(payable(router)).WETH();
    }
}

contract MockUniswapV2Factory {
    mapping(address tokenA => mapping(address tokenB => address pair)) public getPair;

    function createPair(address tokenA, address tokenB, address router, bool malformed)
        external
        returns (address pair)
    {
        require(getPair[tokenA][tokenB] == address(0), "PAIR_EXISTS");
        address pairToken0 = malformed ? address(0xBAD) : tokenA;
        pair = address(new MockUniswapV2Pair(pairToken0, tokenB, router));
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;
    }
}

contract MockUniswapV2Router {
    using SafeERC20 for IERC20;

    struct PoolReserves {
        address token;
        uint256 tokenReserve;
        uint256 ethReserve;
    }

    address public factory;
    address public WETH;
    uint16 public tokenUsageBps = 10_000;
    uint16 public ethUsageBps = 10_000;
    bool public shouldFail;
    bool public malformedPair;
    mapping(address pair => PoolReserves reserves) public poolReserves;

    constructor(address factory_, address weth_) {
        factory = factory_;
        WETH = weth_;
    }

    function setUsage(uint16 tokenUsageBps_, uint16 ethUsageBps_) external {
        require(tokenUsageBps_ <= 10_000 && ethUsageBps_ <= 10_000, "INVALID_BPS");
        tokenUsageBps = tokenUsageBps_;
        ethUsageBps = ethUsageBps_;
    }

    function setShouldFail(bool shouldFail_) external {
        shouldFail = shouldFail_;
    }

    function setMalformedPair(bool malformedPair_) external {
        malformedPair = malformedPair_;
    }

    function setFactory(address factory_) external {
        factory = factory_;
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        require(!shouldFail, "ROUTER_FAILED");
        require(block.timestamp <= deadline, "EXPIRED");

        amountToken = amountTokenDesired * tokenUsageBps / 10_000;
        amountETH = msg.value * ethUsageBps / 10_000;
        require(amountToken >= amountTokenMin && amountETH >= amountETHMin, "SLIPPAGE");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amountToken);
        if (msg.value > amountETH) {
            (bool success,) = payable(msg.sender).call{value: msg.value - amountETH}("");
            require(success, "REFUND_FAILED");
        }

        address pair = MockUniswapV2Factory(factory).getPair(token, WETH);
        if (pair == address(0)) {
            pair = MockUniswapV2Factory(factory).createPair(token, WETH, address(this), malformedPair);
        }
        liquidity = amountToken < amountETH ? amountToken : amountETH;
        PoolReserves storage pool = poolReserves[pair];
        pool.token = token;
        pool.tokenReserve += amountToken;
        pool.ethReserve += amountETH;
        MockUniswapV2Pair(pair).mint(to, liquidity);
        MockUniswapV2Pair(pair).syncReserves(pool.tokenReserve, pool.ethReserve);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        require(path.length == 2, "INVALID_PATH");
        require(amountIn > 0, "INSUFFICIENT_INPUT");
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = _quoteExactInput(amountIn, path[0], path[1]);
    }

    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts)
    {
        require(!shouldFail, "ROUTER_FAILED");
        require(block.timestamp <= deadline, "EXPIRED");
        require(path.length == 2 && path[0] == WETH, "INVALID_PATH");
        require(msg.value > 0, "INSUFFICIENT_INPUT");

        address token = path[1];
        address pair = MockUniswapV2Factory(factory).getPair(token, WETH);
        PoolReserves storage pool = poolReserves[pair];
        require(pool.token == token && pool.tokenReserve > 0 && pool.ethReserve > 0, "INSUFFICIENT_LIQUIDITY");

        uint256 amountOut = _getAmountOut(msg.value, pool.ethReserve, pool.tokenReserve);
        require(amountOut >= amountOutMin, "SLIPPAGE");

        pool.ethReserve += msg.value;
        pool.tokenReserve -= amountOut;
        IERC20(token).safeTransfer(to, amountOut);
        MockUniswapV2Pair(pair).syncReserves(pool.tokenReserve, pool.ethReserve);

        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = amountOut;
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(!shouldFail, "ROUTER_FAILED");
        require(block.timestamp <= deadline, "EXPIRED");
        require(path.length == 2 && path[1] == WETH, "INVALID_PATH");
        require(amountIn > 0, "INSUFFICIENT_INPUT");

        address token = path[0];
        address pair = MockUniswapV2Factory(factory).getPair(token, WETH);
        PoolReserves storage pool = poolReserves[pair];
        require(pool.token == token && pool.tokenReserve > 0 && pool.ethReserve > 0, "INSUFFICIENT_LIQUIDITY");

        uint256 amountOut = _getAmountOut(amountIn, pool.tokenReserve, pool.ethReserve);
        require(amountOut >= amountOutMin, "SLIPPAGE");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amountIn);
        pool.tokenReserve += amountIn;
        pool.ethReserve -= amountOut;
        (bool success,) = payable(to).call{value: amountOut}("");
        require(success, "ETH_TRANSFER_FAILED");
        MockUniswapV2Pair(pair).syncReserves(pool.tokenReserve, pool.ethReserve);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
    }

    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountToken, uint256 amountETH) {
        require(!shouldFail, "ROUTER_FAILED");
        require(block.timestamp <= deadline, "EXPIRED");
        require(liquidity > 0, "INSUFFICIENT_LIQUIDITY_BURNED");

        address pair = MockUniswapV2Factory(factory).getPair(token, WETH);
        PoolReserves storage pool = poolReserves[pair];
        uint256 totalLiquidity = MockUniswapV2Pair(pair).totalSupply();
        require(pool.token == token && totalLiquidity > 0, "INSUFFICIENT_LIQUIDITY");

        amountToken = pool.tokenReserve * liquidity / totalLiquidity;
        amountETH = pool.ethReserve * liquidity / totalLiquidity;
        require(amountToken >= amountTokenMin && amountETH >= amountETHMin, "SLIPPAGE");

        IERC20(pair).safeTransferFrom(msg.sender, pair, liquidity);
        MockUniswapV2Pair(pair).burnFrom(pair, liquidity);
        pool.tokenReserve -= amountToken;
        pool.ethReserve -= amountETH;

        IERC20(token).safeTransfer(to, amountToken);
        (bool success,) = payable(to).call{value: amountETH}("");
        require(success, "ETH_TRANSFER_FAILED");
        MockUniswapV2Pair(pair).syncReserves(pool.tokenReserve, pool.ethReserve);
    }

    function _quoteExactInput(uint256 amountIn, address tokenIn, address tokenOut) internal view returns (uint256) {
        address token = tokenIn == WETH ? tokenOut : tokenIn;
        address pair = MockUniswapV2Factory(factory).getPair(token, WETH);
        PoolReserves storage pool = poolReserves[pair];
        require(pool.token == token && pool.tokenReserve > 0 && pool.ethReserve > 0, "INSUFFICIENT_LIQUIDITY");

        if (tokenIn == WETH && tokenOut == token) {
            return _getAmountOut(amountIn, pool.ethReserve, pool.tokenReserve);
        }
        if (tokenIn == token && tokenOut == WETH) {
            return _getAmountOut(amountIn, pool.tokenReserve, pool.ethReserve);
        }
        revert("INVALID_PATH");
    }

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        require(reserveIn > 0 && reserveOut > 0, "INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * 997;
        return amountInWithFee * reserveOut / (reserveIn * 1000 + amountInWithFee);
    }
}
