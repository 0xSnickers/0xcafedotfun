// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFeeVault} from "./interfaces/IFeeVault.sol";
import {ILiquidityManager} from "./interfaces/ILiquidityManager.sol";
import {IMemeToken} from "./interfaces/IMemeToken.sol";
import {CurveMath} from "./libraries/CurveMath.sol";
import {FeeMath} from "./libraries/FeeMath.sol";
import {MarketTypes} from "./libraries/MarketTypes.sol";

contract TokenMarket is Initializable, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BASE = 10_000;
    uint16 public constant PLATFORM_FEE_BPS = 100;
    uint16 public constant CREATOR_FEE_BPS = 25;
    uint16 public constant TOTAL_TRADE_FEE_BPS = 125;
    uint256 public constant CREATE_FEE = 0;
    uint256 public constant GRADUATION_FEE = 0;

    address public token;
    address public creator;
    address public factory;
    address public feeVault;
    address public liquidityManager;

    MarketTypes.CurveConfig public curveConfig;
    MarketTypes.FeeConfig public feeConfig;
    MarketTypes.MarketStage public stage;

    uint256 public curveSupply;
    uint256 public reserveBalance;
    uint256 public liquidityMintedSupply;
    address public dexPair;
    uint256 public graduationTokenDesired;
    uint256 public graduationEthDesired;
    uint256 public graduationTokenUsed;
    uint256 public graduationEthUsed;
    uint256 public graduationTokenResidual;
    uint256 public graduationEthResidual;
    uint256 public graduationTokenResidualSwept;
    uint256 public graduationEthResidualSwept;

    bool public buyPaused;
    bool public sellPaused;
    bool public graduationPaused;

    event TokenBought(
        address indexed token,
        address indexed market,
        address indexed buyer,
        uint256 grossEthIn,
        uint256 reserveEthIn,
        uint256 platformFee,
        uint256 creatorFee,
        uint256 tokenAmountOut,
        uint256 executionPriceX18,
        uint256 markPriceX18,
        uint256 newCurveSupply,
        uint256 newReserveBalance
    );
    event TokenSold(
        address indexed token,
        address indexed market,
        address indexed seller,
        uint256 tokenAmountIn,
        uint256 grossEthOut,
        uint256 sellerEthOut,
        uint256 platformFee,
        uint256 creatorFee,
        uint256 executionPriceX18,
        uint256 markPriceX18,
        uint256 newCurveSupply,
        uint256 newReserveBalance
    );
    event MarketStageUpdated(MarketTypes.MarketStage indexed previousStage, MarketTypes.MarketStage indexed newStage);
    event PausesUpdated(bool buyPaused, bool sellPaused, bool graduationPaused);
    event GraduationPrepared(
        address indexed token,
        address indexed market,
        uint256 liquidityTokenDesired,
        uint256 liquidityEthDesired,
        uint256 finalCurveSupply,
        uint256 finalMarkPriceX18
    );
    event TokenGraduated(
        address indexed token,
        address indexed market,
        address indexed pair,
        uint256 tokenUsed,
        uint256 ethUsed,
        uint256 liquidityLocked,
        uint256 tokenResidual,
        uint256 ethResidual
    );
    event GraduationResidualsSwept(
        address indexed token,
        address indexed market,
        address indexed operator,
        address tokenRecipient,
        address ethRecipient,
        uint256 tokenAmount,
        uint256 ethAmount
    );

    error BuyPaused();
    error DeadlineExpired();
    error EthTransferFailed();
    error ExcessiveEthInput();
    error GraduationPaused();
    error InsufficientOutput();
    error InsufficientReserve();
    error InvalidAmount();
    error InvalidAddress();
    error InvalidCurveConfig();
    error InvalidFeeConfig();
    error InvalidGraduationAccounting();
    error InvalidLiquidityManager();
    error InvalidStage();
    error NoResidualToSweep();
    error SellPaused();

    constructor() Ownable(msg.sender) {
        _disableInitializers();
    }

    function initialize(
        address token_,
        address creator_,
        address feeVault_,
        address liquidityManager_,
        MarketTypes.CurveConfig calldata curveConfig_,
        MarketTypes.FeeConfig calldata feeConfig_
    ) external initializer {
        if (
            token_ == address(0) || creator_ == address(0) || feeVault_ == address(0) || liquidityManager_ == address(0)
        ) {
            revert InvalidAddress();
        }
        if (
            curveConfig_.initialPriceX18 == 0 || curveConfig_.targetPriceX18 <= curveConfig_.initialPriceX18
                || curveConfig_.targetSupply == 0 || curveConfig_.graduationMarketCap == 0
                || curveConfig_.graduationMarketCap
                    > Math.mulDiv(curveConfig_.targetPriceX18, curveConfig_.targetSupply, 1e18)
        ) {
            revert InvalidCurveConfig();
        }
        if (
            feeConfig_.platformFeeBps != PLATFORM_FEE_BPS || feeConfig_.creatorFeeBps != CREATOR_FEE_BPS
                || FeeMath.totalFeeBps(feeConfig_) != TOTAL_TRADE_FEE_BPS
        ) {
            revert InvalidFeeConfig();
        }

        token = token_;
        creator = creator_;
        factory = msg.sender;
        feeVault = feeVault_;
        liquidityManager = liquidityManager_;
        curveConfig = curveConfig_;
        feeConfig = feeConfig_;
        stage = MarketTypes.MarketStage.ACTIVE;
        _transferOwnership(msg.sender);
    }

    function quoteBuyExactEth(uint256 grossEthIn) public view returns (MarketTypes.BuyQuote memory quote) {
        _requireBuyOpen();
        if (grossEthIn == 0) revert InvalidAmount();

        (quote.platformFee, quote.creatorFee, quote.reserveIncrease) = FeeMath.splitFees(grossEthIn, feeConfig);
        uint256 remainingSupply = curveConfig.targetSupply - curveSupply;
        uint256 maxReserveCost = CurveMath.reserveCostForBuy(curveConfig, curveSupply, remainingSupply);
        if (quote.reserveIncrease > maxReserveCost) revert ExcessiveEthInput();

        quote.tokenOut = CurveMath.tokenOutForReserveIn(curveConfig, curveSupply, quote.reserveIncrease);
        if (quote.tokenOut == 0) revert InvalidAmount();

        quote.grossEthIn = grossEthIn;
        quote.executionPriceX18 = Math.mulDiv(quote.reserveIncrease, 1e18, quote.tokenOut);
        quote.markPriceX18 = CurveMath.currentPrice(curveConfig, curveSupply + quote.tokenOut);
    }

    function quoteBuyExactTokens(uint256 tokenOut) public view returns (MarketTypes.BuyQuote memory quote) {
        _requireBuyOpen();
        if (tokenOut == 0) revert InvalidAmount();

        uint256 requiredReserve = CurveMath.reserveCostForBuy(curveConfig, curveSupply, tokenOut);
        quote.grossEthIn = FeeMath.grossAmountForNet(requiredReserve, feeConfig);
        (quote.platformFee, quote.creatorFee, quote.reserveIncrease) = FeeMath.splitFees(quote.grossEthIn, feeConfig);
        quote.tokenOut = tokenOut;
        quote.executionPriceX18 = Math.mulDiv(quote.reserveIncrease, 1e18, tokenOut);
        quote.markPriceX18 = CurveMath.currentPrice(curveConfig, curveSupply + tokenOut);
    }

    function quoteSell(uint256 tokenIn) public view returns (MarketTypes.SellQuote memory quote) {
        _requireSellOpen();
        if (tokenIn == 0) revert InvalidAmount();

        quote.tokenIn = tokenIn;
        quote.grossEthOut = CurveMath.grossRefundForSell(curveConfig, curveSupply, tokenIn);
        (quote.platformFee, quote.creatorFee, quote.sellerReceives) = FeeMath.splitFees(quote.grossEthOut, feeConfig);
        quote.executionPriceX18 = Math.mulDiv(quote.grossEthOut, 1e18, tokenIn);
        quote.markPriceX18 = CurveMath.currentPrice(curveConfig, curveSupply - tokenIn);
    }

    function currentPriceX18() public view returns (uint256) {
        return CurveMath.currentPrice(curveConfig, curveSupply);
    }

    function currentMarketCap() public view returns (uint256) {
        return Math.mulDiv(currentPriceX18(), curveSupply, 1e18);
    }

    function getMarketState() external view returns (MarketTypes.MarketStateView memory) {
        return MarketTypes.MarketStateView({
            stage: stage,
            curveSupply: curveSupply,
            reserveBalance: reserveBalance,
            currentPriceX18: currentPriceX18(),
            currentMarketCap: currentMarketCap(),
            creator: creator,
            buyPaused: buyPaused,
            sellPaused: sellPaused,
            curveConfig: curveConfig
        });
    }

    function buy(uint256 minTokenOut, uint256 deadline) external payable nonReentrant returns (uint256 tokenOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        MarketTypes.BuyQuote memory quote = quoteBuyExactEth(msg.value);
        if (quote.tokenOut < minTokenOut) revert InsufficientOutput();

        curveSupply += quote.tokenOut;
        reserveBalance += quote.reserveIncrease;

        IFeeVault(feeVault).accrueFees{value: quote.platformFee + quote.creatorFee}(
            token, creator, quote.platformFee, quote.creatorFee
        );
        IMemeToken(token).mint(msg.sender, quote.tokenOut);

        emit TokenBought(
            token,
            address(this),
            msg.sender,
            quote.grossEthIn,
            quote.reserveIncrease,
            quote.platformFee,
            quote.creatorFee,
            quote.tokenOut,
            quote.executionPriceX18,
            quote.markPriceX18,
            curveSupply,
            reserveBalance
        );

        if (currentMarketCap() >= curveConfig.graduationMarketCap) {
            emit MarketStageUpdated(stage, MarketTypes.MarketStage.GRADUATION_PENDING);
            stage = MarketTypes.MarketStage.GRADUATION_PENDING;
        }
        return quote.tokenOut;
    }

    function sell(uint256 tokenIn, uint256 minEthOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 sellerReceives)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        MarketTypes.SellQuote memory quote = quoteSell(tokenIn);
        if (quote.sellerReceives < minEthOut) revert InsufficientOutput();
        if (reserveBalance < quote.grossEthOut) revert InsufficientReserve();

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenIn);
        IMemeToken(token).burnMarketBalance(tokenIn);
        curveSupply -= tokenIn;
        reserveBalance -= quote.grossEthOut;

        IFeeVault(feeVault).accrueFees{value: quote.platformFee + quote.creatorFee}(
            token, creator, quote.platformFee, quote.creatorFee
        );
        (bool success,) = payable(msg.sender).call{value: quote.sellerReceives}("");
        if (!success) revert EthTransferFailed();

        emit TokenSold(
            token,
            address(this),
            msg.sender,
            tokenIn,
            quote.grossEthOut,
            quote.sellerReceives,
            quote.platformFee,
            quote.creatorFee,
            quote.executionPriceX18,
            quote.markPriceX18,
            curveSupply,
            reserveBalance
        );
        return quote.sellerReceives;
    }

    function setPauses(bool buyPaused_, bool sellPaused_, bool graduationPaused_) external onlyOwner {
        buyPaused = buyPaused_;
        sellPaused = sellPaused_;
        graduationPaused = graduationPaused_;
        emit PausesUpdated(buyPaused_, sellPaused_, graduationPaused_);
    }

    function prepareGraduation() external nonReentrant {
        if (graduationPaused) revert GraduationPaused();
        if (stage != MarketTypes.MarketStage.GRADUATION_PENDING) revert InvalidStage();

        uint256 liquidityEthDesired = reserveBalance;
        uint256 finalMarkPriceX18 = currentPriceX18();
        uint256 liquidityTokenDesired = Math.mulDiv(liquidityEthDesired, 1e18, finalMarkPriceX18);
        if (liquidityEthDesired == 0 || liquidityTokenDesired == 0) revert InvalidAmount();

        reserveBalance = 0;
        graduationTokenDesired = liquidityTokenDesired;
        graduationEthDesired = liquidityEthDesired;
        emit MarketStageUpdated(stage, MarketTypes.MarketStage.LIQUIDITY_PENDING);
        stage = MarketTypes.MarketStage.LIQUIDITY_PENDING;

        IMemeToken(token).mint(liquidityManager, liquidityTokenDesired);
        ILiquidityManager(liquidityManager).registerGraduation{value: liquidityEthDesired}(
            token, address(this), liquidityTokenDesired, liquidityEthDesired
        );

        emit GraduationPrepared(
            token, address(this), liquidityTokenDesired, liquidityEthDesired, curveSupply, finalMarkPriceX18
        );
    }

    function onLiquidityAdded(
        address pair,
        uint256 tokenUsed,
        uint256 ethUsed,
        uint256 liquidity,
        uint256 tokenResidual,
        uint256 ethResidual
    ) external payable {
        if (msg.sender != liquidityManager) revert InvalidLiquidityManager();
        if (stage != MarketTypes.MarketStage.LIQUIDITY_PENDING) revert InvalidStage();
        if (
            pair == address(0) || liquidity == 0 || tokenUsed + tokenResidual != graduationTokenDesired
                || ethUsed + ethResidual != graduationEthDesired
                || IERC20(token).balanceOf(address(this)) < tokenResidual || msg.value != ethResidual
        ) {
            revert InvalidGraduationAccounting();
        }

        dexPair = pair;
        graduationTokenUsed = tokenUsed;
        graduationEthUsed = ethUsed;
        liquidityMintedSupply = liquidity;
        graduationTokenResidual = tokenResidual;
        graduationEthResidual = ethResidual;
        IMemeToken(token).setMinter(address(0));

        emit MarketStageUpdated(stage, MarketTypes.MarketStage.DEX_LIVE);
        stage = MarketTypes.MarketStage.DEX_LIVE;
        emit TokenGraduated(token, address(this), pair, tokenUsed, ethUsed, liquidity, tokenResidual, ethResidual);
    }

    function sweepGraduationResiduals(address tokenRecipient, address payable ethRecipient)
        external
        onlyOwner
        nonReentrant
    {
        if (stage != MarketTypes.MarketStage.DEX_LIVE) revert InvalidStage();

        uint256 unsweptToken = graduationTokenResidual - graduationTokenResidualSwept;
        uint256 unsweptEth = graduationEthResidual - graduationEthResidualSwept;
        if (unsweptToken == 0 && unsweptEth == 0) revert NoResidualToSweep();
        if ((unsweptToken > 0 && tokenRecipient == address(0)) || (unsweptEth > 0 && ethRecipient == address(0))) {
            revert InvalidAddress();
        }

        graduationTokenResidualSwept += unsweptToken;
        graduationEthResidualSwept += unsweptEth;

        if (unsweptToken > 0) IERC20(token).safeTransfer(tokenRecipient, unsweptToken);
        if (unsweptEth > 0) {
            (bool success,) = ethRecipient.call{value: unsweptEth}("");
            if (!success) revert EthTransferFailed();
        }

        emit GraduationResidualsSwept(
            token, address(this), msg.sender, tokenRecipient, ethRecipient, unsweptToken, unsweptEth
        );
    }

    function _requireBuyOpen() internal view {
        if (stage != MarketTypes.MarketStage.ACTIVE) revert InvalidStage();
        if (buyPaused) revert BuyPaused();
    }

    function _requireSellOpen() internal view {
        if (stage != MarketTypes.MarketStage.ACTIVE) revert InvalidStage();
        if (sellPaused) revert SellPaused();
    }
}
