// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMemeFactory} from "./interfaces/IMemeFactory.sol";
import {ITokenMarket} from "./interfaces/ITokenMarket.sol";
import {IUniswapV2FactoryLike, IUniswapV2PairLike, IUniswapV2RouterLike} from "./interfaces/IUniswapV2.sol";

contract LiquidityManager is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PRICE_SCALE = 1e18;
    uint16 public constant MAX_PAIR_PRICE_TOLERANCE_BPS = 500;

    address public factory;
    address public uniswapRouter;
    address public uniswapFactory;
    address public weth;
    address public constant LP_LOCK_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint16 public pairPriceToleranceBps = 100;

    struct GraduationLiquidity {
        address market;
        uint256 tokenAmount;
        uint256 ethAmount;
        bool registered;
    }

    struct GraduatedLiquidityData {
        uint256 liquidityTokenAmount;
        uint256 liquidityEthAmount;
        address uniswapPair;
        uint256 liquidityTokens;
        bool liquidityAdded;
        bool liquidityLocked;
        uint256 addedAt;
    }

    mapping(address token => GraduationLiquidity) public graduationLiquidity;
    mapping(address token => GraduatedLiquidityData) public graduatedParams;

    event FactoryUpdated(address indexed oldFactory, address indexed newFactory);
    event PairPriceToleranceUpdated(uint16 oldToleranceBps, uint16 newToleranceBps);
    event GraduationRegistered(address indexed token, address indexed market, uint256 tokenAmount, uint256 ethAmount);
    event LiquidityAdded(
        address indexed token,
        address indexed market,
        address indexed pair,
        uint256 tokenUsed,
        uint256 ethUsed,
        uint256 liquidityLocked,
        uint256 tokenResidual,
        uint256 ethResidual
    );

    error AlreadyRegistered();
    error DeadlineExpired();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidConfig();
    error InvalidFactory();
    error InvalidMarket();
    error InvalidPair();
    error InvalidPairPrice();
    error InvalidPairReserves();
    error InvalidRouter();
    error NotRegistered();

    constructor(address router) Ownable(msg.sender) {
        if (router == address(0) || router.code.length == 0) revert InvalidRouter();
        uniswapRouter = router;
        uniswapFactory = IUniswapV2RouterLike(router).factory();
        weth = IUniswapV2RouterLike(router).WETH();
        if (uniswapFactory == address(0) || weth == address(0)) revert InvalidRouter();
    }
    function setFactory(address newFactory) external onlyOwner {
        if (newFactory == address(0) || newFactory.code.length == 0) revert InvalidFactory();
        address oldFactory = factory;
        factory = newFactory;
        emit FactoryUpdated(oldFactory, newFactory);
    }

    function setPairPriceToleranceBps(uint16 newToleranceBps) external onlyOwner {
        if (newToleranceBps > MAX_PAIR_PRICE_TOLERANCE_BPS) revert InvalidConfig();
        uint16 oldToleranceBps = pairPriceToleranceBps;
        pairPriceToleranceBps = newToleranceBps;
        emit PairPriceToleranceUpdated(oldToleranceBps, newToleranceBps);
    }

    function registerGraduation(address token, address market, uint256 tokenAmount, uint256 ethAmount)
        external
        payable
    {
        if (factory == address(0)) revert InvalidFactory();
        if (
            msg.sender != market || !IMemeFactory(factory).isMarket(market)
                || IMemeFactory(factory).marketOf(token) != market
        ) {
            revert InvalidMarket();
        }
        if (tokenAmount == 0 || ethAmount == 0 || msg.value != ethAmount) revert InvalidAmount();
        if (graduationLiquidity[token].registered) revert AlreadyRegistered();
        if (IERC20(token).balanceOf(address(this)) < tokenAmount) revert InvalidAmount();

        graduationLiquidity[token] =
            GraduationLiquidity({market: market, tokenAmount: tokenAmount, ethAmount: ethAmount, registered: true});
        emit GraduationRegistered(token, market, tokenAmount, ethAmount);
    }

    function addLiquidity(address token, uint256 minTokenAmount, uint256 minEthAmount, uint256 deadline)
        external
        nonReentrant
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        GraduationLiquidity memory graduation = graduationLiquidity[token];
        if (!graduation.registered) revert NotRegistered();
        _validateRouter();
        if (
            IERC20(token).balanceOf(address(this)) < graduation.tokenAmount
                || address(this).balance < graduation.ethAmount
        ) {
            revert InvalidAmount();
        }

        address existingPair = IUniswapV2FactoryLike(uniswapFactory).getPair(token, weth);
        uint256 lockedLiquidityBefore;
        if (existingPair != address(0)) {
            _validatePair(existingPair, token);
            _validateExistingPairPrice(existingPair, token, graduation);
            lockedLiquidityBefore = IUniswapV2PairLike(existingPair).balanceOf(LP_LOCK_ADDRESS);
        }

        IERC20(token).forceApprove(uniswapRouter, graduation.tokenAmount);
        (uint256 tokenUsed, uint256 ethUsed, uint256 liquidity) = IUniswapV2RouterLike(uniswapRouter)
        .addLiquidityETH{value: graduation.ethAmount}(
            token, graduation.tokenAmount, minTokenAmount, minEthAmount, LP_LOCK_ADDRESS, deadline
        );
        IERC20(token).forceApprove(uniswapRouter, 0);

        if (
            tokenUsed > graduation.tokenAmount || ethUsed > graduation.ethAmount || tokenUsed < minTokenAmount
                || ethUsed < minEthAmount || liquidity == 0
        ) {
            revert InvalidAmount();
        }

        address pair = IUniswapV2FactoryLike(uniswapFactory).getPair(token, weth);
        _validatePair(pair, token);
        if (
            (existingPair != address(0) && pair != existingPair)
                || IUniswapV2PairLike(pair).balanceOf(LP_LOCK_ADDRESS) < lockedLiquidityBefore + liquidity
        ) {
            revert InvalidPair();
        }

        uint256 tokenResidual = graduation.tokenAmount - tokenUsed;
        uint256 ethResidual = graduation.ethAmount - ethUsed;
        delete graduationLiquidity[token];

        if (tokenResidual > 0) IERC20(token).safeTransfer(graduation.market, tokenResidual);

        graduatedParams[token] = GraduatedLiquidityData({
            liquidityTokenAmount: tokenUsed,
            liquidityEthAmount: ethUsed,
            uniswapPair: pair,
            liquidityTokens: liquidity,
            liquidityAdded: true,
            liquidityLocked: true,
            addedAt: block.timestamp
        });
        ITokenMarket(graduation.market).onLiquidityAdded{value: ethResidual}(
            pair, tokenUsed, ethUsed, liquidity, tokenResidual, ethResidual
        );

        emit LiquidityAdded(token, graduation.market, pair, tokenUsed, ethUsed, liquidity, tokenResidual, ethResidual);
    }

    function getLiquidityInfo(address token)
        external
        view
        returns (
            uint256 liquidityTokenAmount,
            uint256 liquidityEthAmount,
            address uniswapPair,
            uint256 liquidityTokens,
            bool liquidityAdded,
            bool liquidityLocked,
            uint256 addedAt
        )
    {
        GraduatedLiquidityData memory data = graduatedParams[token];
        return (
            data.liquidityTokenAmount,
            data.liquidityEthAmount,
            data.uniswapPair,
            data.liquidityTokens,
            data.liquidityAdded,
            data.liquidityLocked,
            data.addedAt
        );
    }

    function _validateRouter() internal view {
        if (
            IUniswapV2RouterLike(uniswapRouter).factory() != uniswapFactory
                || IUniswapV2RouterLike(uniswapRouter).WETH() != weth
        ) {
            revert InvalidRouter();
        }
    }

    function _validatePair(address pair, address token) internal view {
        if (pair == address(0)) revert InvalidPair();
        address token0 = IUniswapV2PairLike(pair).token0();
        address token1 = IUniswapV2PairLike(pair).token1();
        if (!((token0 == token && token1 == weth) || (token0 == weth && token1 == token))) {
            revert InvalidPair();
        }
    }

    function _getNormalizedPairReserves(address pair, address token)
        internal
        view
        returns (uint256 tokenReserve, uint256 ethReserve)
    {
        (uint112 reserve0, uint112 reserve1,) = IUniswapV2PairLike(pair).getReserves();
        if (IUniswapV2PairLike(pair).token0() == token) {
            tokenReserve = reserve0;
            ethReserve = reserve1;
        } else {
            tokenReserve = reserve1;
            ethReserve = reserve0;
        }
    }

    function _expectedGraduationPriceX18(GraduationLiquidity memory graduation) internal pure returns (uint256) {
        return graduation.ethAmount * PRICE_SCALE / graduation.tokenAmount;
    }

    function _validateExistingPairPrice(address pair, address token, GraduationLiquidity memory graduation) internal view {
        (uint256 tokenReserve, uint256 ethReserve) = _getNormalizedPairReserves(pair, token);
        if (tokenReserve == 0 && ethReserve == 0) return;
        if (tokenReserve == 0 || ethReserve == 0) revert InvalidPairReserves();

        uint256 pairPriceX18 = ethReserve * PRICE_SCALE / tokenReserve;
        uint256 expectedPriceX18 = _expectedGraduationPriceX18(graduation);
        uint256 priceDelta = pairPriceX18 > expectedPriceX18 ? pairPriceX18 - expectedPriceX18 : expectedPriceX18 - pairPriceX18;
        if (priceDelta * 10_000 > expectedPriceX18 * pairPriceToleranceBps) revert InvalidPairPrice();
    }

    receive() external payable {
        if (msg.sender != uniswapRouter) revert InvalidRouter();
    }
}
