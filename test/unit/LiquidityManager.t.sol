// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {FeeVault} from "../../src/FeeVault.sol";
import {LiquidityManager} from "../../src/LiquidityManager.sol";
import {MemeFactory} from "../../src/MemeFactory.sol";
import {MemeToken} from "../../src/MemeToken.sol";
import {TokenMarket} from "../../src/TokenMarket.sol";
import {MarketTypes} from "../../src/libraries/MarketTypes.sol";
import {MockUniswapV2Factory, MockUniswapV2Pair, MockUniswapV2Router} from "../../script/mocks/MockUniswapV2.sol";
import {RejectEthReceiver} from "../mocks/RejectEthReceiver.sol";
import {OfficialTokenSaltMiner} from "../utils/OfficialTokenSaltMiner.sol";

contract LiquidityManagerTest is Test, OfficialTokenSaltMiner {
    address private constant WETH = address(0xBEEF);

    FeeVault private vault;
    MemeFactory private factory;
    TokenMarket private implementation;
    LiquidityManager private manager;
    MockUniswapV2Factory private dexFactory;
    MockUniswapV2Router private router;
    MemeToken private token;
    TokenMarket private market;

    address private creator = address(0xCAFE);
    address private buyer = address(0xB0B);
    address private keeper = address(0xC0DE);

    function setUp() public {
        dexFactory = new MockUniswapV2Factory();
        router = new MockUniswapV2Router(address(dexFactory), WETH);
        manager = new LiquidityManager(address(router));
        vault = new FeeVault(address(this), address(this));
        factory = new MemeFactory();
        implementation = new TokenMarket();

        manager.setFactory(address(factory));
        vault.setFactory(address(factory));
        factory.configure(address(implementation), address(vault), address(manager), _curveConfig(), _feeConfig());

        (bytes32 salt,) = mineOfficialSalt(factory, creator, "Graduate", "GRAD", "", "", keccak256("graduate"));
        vm.prank(creator);
        (address tokenAddress, address marketAddress) = factory.createToken("Graduate", "GRAD", "", "", salt);
        token = MemeToken(tokenAddress);
        market = TokenMarket(payable(marketAddress));
        vm.deal(buyer, 100 ether);
    }

    function testCompleteGraduationLocksLpAndReturnsResiduals() public {
        _reachGraduation();
        market.prepareGraduation();

        uint256 tokenDesired = market.graduationTokenDesired();
        uint256 ethDesired = market.graduationEthDesired();
        router.setUsage(8_000, 7_500);

        vm.prank(keeper);
        manager.addLiquidity(address(token), 0, 0, block.timestamp);

        address pair = dexFactory.getPair(address(token), WETH);
        uint256 tokenUsed = tokenDesired * 8_000 / 10_000;
        uint256 ethUsed = ethDesired * 7_500 / 10_000;
        uint256 tokenResidual = tokenDesired - tokenUsed;
        uint256 ethResidual = ethDesired - ethUsed;
        uint256 liquidity = tokenUsed < ethUsed ? tokenUsed : ethUsed;

        assertEq(uint256(market.stage()), uint256(MarketTypes.MarketStage.DEX_LIVE));
        assertEq(market.dexPair(), pair);
        assertEq(token.minter(), address(0));
        assertEq(token.balanceOf(address(market)), tokenResidual);
        assertEq(address(market).balance, ethResidual);
        assertEq(market.graduationTokenResidual(), tokenResidual);
        assertEq(market.graduationEthResidual(), ethResidual);
        assertEq(MockUniswapV2Pair(pair).balanceOf(manager.LP_LOCK_ADDRESS()), liquidity);
        assertEq(token.balanceOf(address(manager)), 0);
        assertEq(address(manager).balance, 0);
    }

    function testPrepareGraduationUsesAllReserveAndRegistersAssets() public {
        _reachGraduation();
        uint256 reserve = market.reserveBalance();

        vm.prank(keeper);
        market.prepareGraduation();

        (address registeredMarket, uint256 tokenAmount, uint256 ethAmount, bool registered) =
            manager.graduationLiquidity(address(token));
        assertEq(uint256(market.stage()), uint256(MarketTypes.MarketStage.LIQUIDITY_PENDING));
        assertEq(market.reserveBalance(), 0);
        assertEq(registeredMarket, address(market));
        assertEq(ethAmount, reserve);
        assertEq(token.balanceOf(address(manager)), tokenAmount);
        assertEq(address(manager).balance, reserve);
        assertTrue(registered);
    }


    function testRejectsExistingPairWithSkewedPrice() public {
        _reachGraduation();
        market.prepareGraduation();

        uint256 tokenDesired = market.graduationTokenDesired();
        uint256 ethDesired = market.graduationEthDesired();
        uint256 skewedTokenAmount = tokenDesired / 20;

        deal(address(token), keeper, skewedTokenAmount, true);
        vm.deal(keeper, ethDesired);
        vm.startPrank(keeper);
        token.approve(address(router), skewedTokenAmount);
        router.addLiquidityETH{value: ethDesired}(address(token), skewedTokenAmount, 0, 0, keeper, block.timestamp);
        vm.stopPrank();

        vm.expectRevert(LiquidityManager.InvalidPairPrice.selector);
        manager.addLiquidity(address(token), 0, 0, block.timestamp);

        (,,, bool registered) = manager.graduationLiquidity(address(token));
        assertTrue(registered);
        assertEq(uint256(market.stage()), uint256(MarketTypes.MarketStage.LIQUIDITY_PENDING));
        assertEq(token.balanceOf(address(manager)), tokenDesired);
        assertEq(address(manager).balance, ethDesired);
    }

    function testAllowsExistingPairAtExpectedPrice() public {
        _reachGraduation();
        market.prepareGraduation();

        uint256 tokenDesired = market.graduationTokenDesired();
        uint256 ethDesired = market.graduationEthDesired();
        uint256 seedTokenAmount = tokenDesired / 20;
        uint256 seedEthAmount = ethDesired / 20;

        deal(address(token), keeper, seedTokenAmount, true);
        vm.deal(keeper, seedEthAmount);
        vm.startPrank(keeper);
        token.approve(address(router), seedTokenAmount);
        router.addLiquidityETH{value: seedEthAmount}(address(token), seedTokenAmount, 0, 0, keeper, block.timestamp);
        vm.stopPrank();

        manager.addLiquidity(address(token), 0, 0, block.timestamp);

        assertEq(uint256(market.stage()), uint256(MarketTypes.MarketStage.DEX_LIVE));
    }


    function testOwnerCanUpdatePairPriceTolerance() public {
        manager.setPairPriceToleranceBps(250);
        assertEq(manager.pairPriceToleranceBps(), 250);

        vm.prank(keeper);
        vm.expectRevert();
        manager.setPairPriceToleranceBps(200);

        vm.expectRevert(LiquidityManager.InvalidConfig.selector);
        manager.setPairPriceToleranceBps(501);
    }

    function testSweepResidualsViaFactoryTransfersUnsweptBalances() public {
        _reachGraduation();
        market.prepareGraduation();
        router.setUsage(8_000, 7_500);
        manager.addLiquidity(address(token), 0, 0, block.timestamp);

        uint256 tokenResidual = market.graduationTokenResidual();
        uint256 ethResidual = market.graduationEthResidual();
        address tokenRecipient = address(0xC0FFEE);
        address payable ethRecipient = payable(address(0xFACE));

        factory.sweepMarketResiduals(address(market), tokenRecipient, ethRecipient);

        assertEq(token.balanceOf(tokenRecipient), tokenResidual);
        assertEq(ethRecipient.balance, ethResidual);
        assertEq(market.graduationTokenResidual(), tokenResidual);
        assertEq(market.graduationEthResidual(), ethResidual);
        assertEq(market.graduationTokenResidualSwept(), tokenResidual);
        assertEq(market.graduationEthResidualSwept(), ethResidual);

        vm.expectRevert(TokenMarket.NoResidualToSweep.selector);
        factory.sweepMarketResiduals(address(market), tokenRecipient, ethRecipient);
    }

    function testSweepResidualsRejectsBeforeDexLiveAndOnEthTransferFailure() public {
        _reachGraduation();
        market.prepareGraduation();

        vm.expectRevert(TokenMarket.InvalidStage.selector);
        factory.sweepMarketResiduals(address(market), address(0xC0FFEE), payable(address(0xFACE)));

        router.setUsage(8_000, 7_500);
        manager.addLiquidity(address(token), 0, 0, block.timestamp);

        RejectEthReceiver rejector = new RejectEthReceiver();
        vm.expectRevert(TokenMarket.EthTransferFailed.selector);
        factory.sweepMarketResiduals(address(market), address(0xC0FFEE), payable(address(rejector)));

        assertEq(market.graduationTokenResidualSwept(), 0);
        assertEq(market.graduationEthResidualSwept(), 0);
    }


    function testOnlyLiquidityManagerCanCompleteGraduation() public {
        _reachGraduation();
        market.prepareGraduation();

        vm.expectRevert(TokenMarket.InvalidLiquidityManager.selector);
        market.onLiquidityAdded(address(0x1234), 1, 1, 1, 0, 0);
    }

    function testMockRouterSupportsDexSwapsAndUserLpRemoval() public {
        _reachGraduation();
        market.prepareGraduation();
        manager.addLiquidity(address(token), 0, 0, block.timestamp);

        address pair = dexFactory.getPair(address(token), WETH);
        address trader = address(0xA11CE);
        vm.deal(trader, 2 ether);

        address[] memory buyPath = new address[](2);
        buyPath[0] = WETH;
        buyPath[1] = address(token);
        uint256 ethIn = 0.05 ether;
        uint256[] memory buyQuote = router.getAmountsOut(ethIn, buyPath);

        vm.prank(trader);
        router.swapExactETHForTokens{value: ethIn}(buyQuote[1], buyPath, trader, block.timestamp);
        assertEq(token.balanceOf(trader), buyQuote[1]);

        address[] memory sellPath = new address[](2);
        sellPath[0] = address(token);
        sellPath[1] = WETH;
        uint256 tokenIn = buyQuote[1] / 4;
        uint256[] memory sellQuote = router.getAmountsOut(tokenIn, sellPath);
        uint256 ethBeforeSell = trader.balance;

        vm.prank(trader);
        token.approve(address(router), tokenIn);
        vm.prank(trader);
        router.swapExactTokensForETH(tokenIn, sellQuote[1], sellPath, trader, block.timestamp);
        assertEq(trader.balance, ethBeforeSell + sellQuote[1]);

        uint256 addTokenAmount = token.balanceOf(trader) / 2;
        uint256 addEthAmount = 0.01 ether;
        vm.prank(trader);
        token.approve(address(router), addTokenAmount);
        vm.prank(trader);
        router.addLiquidityETH{value: addEthAmount}(address(token), addTokenAmount, 0, 0, trader, block.timestamp);

        MockUniswapV2Pair lpToken = MockUniswapV2Pair(pair);
        uint256 userLiquidity = lpToken.balanceOf(trader);
        assertGt(userLiquidity, 0);

        uint256 removeLiquidity = userLiquidity / 2;
        uint256 tokenBeforeRemove = token.balanceOf(trader);
        uint256 ethBeforeRemove = trader.balance;
        vm.prank(trader);
        lpToken.approve(address(router), removeLiquidity);
        vm.prank(trader);
        router.removeLiquidityETH(address(token), removeLiquidity, 0, 0, trader, block.timestamp);

        assertEq(lpToken.balanceOf(trader), userLiquidity - removeLiquidity);
        assertGt(token.balanceOf(trader), tokenBeforeRemove);
        assertGt(trader.balance, ethBeforeRemove);
    }

    function testGraduationPauseAndStageChecks() public {
        vm.expectRevert(TokenMarket.InvalidStage.selector);
        market.prepareGraduation();

        _reachGraduation();
        factory.setMarketPauses(address(market), false, false, true);
        vm.expectRevert(TokenMarket.GraduationPaused.selector);
        market.prepareGraduation();
    }

    function _reachGraduation() internal {
        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);
    }

    function _curveConfig() internal pure returns (MarketTypes.CurveConfig memory) {
        return MarketTypes.CurveConfig({
            initialPriceX18: 0.001 ether,
            targetPriceX18: 0.005 ether,
            targetSupply: 1_000_000 ether,
            graduationMarketCap: 1
        });
    }

    function _feeConfig() internal pure returns (MarketTypes.FeeConfig memory) {
        return MarketTypes.FeeConfig({platformFeeBps: 100, creatorFeeBps: 25});
    }
}
