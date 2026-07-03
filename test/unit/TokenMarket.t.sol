// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {FeeVault} from "../../src/FeeVault.sol";
import {MemeFactory} from "../../src/MemeFactory.sol";
import {MemeToken} from "../../src/MemeToken.sol";
import {TokenMarket} from "../../src/TokenMarket.sol";
import {MarketTypes} from "../../src/libraries/MarketTypes.sol";
import {RejectEthReceiver} from "../mocks/RejectEthReceiver.sol";
import {ReentrantMarketUser} from "../mocks/ReentrantMarketUser.sol";
import {OfficialTokenSaltMiner} from "../utils/OfficialTokenSaltMiner.sol";

contract TokenMarketTest is Test, OfficialTokenSaltMiner {
    FeeVault private vault;
    MemeFactory private factory;
    TokenMarket private implementation;
    MemeToken private token;
    TokenMarket private market;

    address private creator = address(0xCAFE);
    address private buyer = address(0xBEEF);
    address private guardian = address(0xABCD);

    function setUp() public {
        vault = new FeeVault(address(this), address(this));
        factory = new MemeFactory();
        implementation = new TokenMarket();
        vault.setFactory(address(factory));
        factory.configure(address(implementation), address(vault), address(0x1111), _curveConfig(), _feeConfig());
        (token, market) = _createOfficialToken(creator, "Cafe", "CAFE", keccak256("market"));
        vm.deal(buyer, 100 ether);
    }

    function testGetMarketStateMatchesGettersAfterTrade() public {
        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);

        MarketTypes.MarketStateView memory state = market.getMarketState();

        assertEq(uint256(state.stage), uint256(market.stage()));
        assertEq(state.curveSupply, market.curveSupply());
        assertEq(state.reserveBalance, market.reserveBalance());
        assertEq(state.currentPriceX18, market.currentPriceX18());
        assertEq(state.currentMarketCap, market.currentMarketCap());
        assertEq(state.creator, market.creator());
        assertEq(state.buyPaused, market.buyPaused());
        assertEq(state.sellPaused, market.sellPaused());
        (uint256 initialPriceX18, uint256 targetPriceX18, uint256 targetSupply, uint256 graduationMarketCap) =
            market.curveConfig();
        assertEq(state.curveConfig.initialPriceX18, initialPriceX18);
        assertEq(state.curveConfig.targetPriceX18, targetPriceX18);
        assertEq(state.curveConfig.targetSupply, targetSupply);
        assertEq(state.curveConfig.graduationMarketCap, graduationMarketCap);
    }

    function testBuyQuoteAndExecutionPreserveFundsAndSupply() public {
        MarketTypes.BuyQuote memory quote = market.quoteBuyExactEth(1 ether);
        uint256 marketBalanceBefore = address(market).balance;

        vm.prank(buyer);
        uint256 tokenOut = market.buy{value: 1 ether}(quote.tokenOut, block.timestamp);

        assertEq(tokenOut, quote.tokenOut);
        assertEq(token.balanceOf(buyer), quote.tokenOut);
        assertEq(token.totalSupply(), quote.tokenOut);
        assertEq(market.curveSupply(), quote.tokenOut);
        assertEq(market.reserveBalance(), quote.reserveIncrease);
        assertEq(address(market).balance - marketBalanceBefore, quote.reserveIncrease);
        assertEq(quote.grossEthIn, quote.platformFee + quote.creatorFee + quote.reserveIncrease);
        assertGe(address(market).balance, market.reserveBalance());
    }

    function testQuoteBuyExactTokensCoversRequestedTokens() public view {
        uint256 tokenOut = 100 ether;
        MarketTypes.BuyQuote memory quote = market.quoteBuyExactTokens(tokenOut);
        MarketTypes.BuyQuote memory exactEthQuote = market.quoteBuyExactEth(quote.grossEthIn);

        assertEq(quote.tokenOut, tokenOut);
        assertGe(exactEthQuote.tokenOut, tokenOut);
        assertEq(quote.grossEthIn, quote.platformFee + quote.creatorFee + quote.reserveIncrease);
    }

    function testExactRemainingSupplyQuoteCanBeExecuted() public {
        MarketTypes.BuyQuote memory quote = market.quoteBuyExactTokens(1_000_000 ether);
        vm.deal(buyer, quote.grossEthIn);

        vm.prank(buyer);
        market.buy{value: quote.grossEthIn}(quote.tokenOut, block.timestamp);

        assertEq(market.curveSupply(), 1_000_000 ether);
        assertEq(token.totalSupply(), 1_000_000 ether);
        assertEq(uint256(market.stage()), uint256(MarketTypes.MarketStage.GRADUATION_PENDING));
    }

    function testBuyRejectsSlippageDeadlineAndExcessiveInput() public {
        MarketTypes.BuyQuote memory quote = market.quoteBuyExactEth(1 ether);

        vm.prank(buyer);
        vm.expectRevert(TokenMarket.InsufficientOutput.selector);
        market.buy{value: 1 ether}(quote.tokenOut + 1, block.timestamp);

        vm.prank(buyer);
        vm.expectRevert(TokenMarket.DeadlineExpired.selector);
        market.buy{value: 1 ether}(0, block.timestamp - 1);

        vm.expectRevert(TokenMarket.ExcessiveEthInput.selector);
        market.quoteBuyExactEth(10_000 ether);
    }

    function testSellPreservesFundsAndBurnsSupply() public {
        vm.prank(buyer);
        market.buy{value: 2 ether}(0, block.timestamp);
        uint256 tokenIn = token.balanceOf(buyer) / 2;
        MarketTypes.SellQuote memory quote = market.quoteSell(tokenIn);
        uint256 reserveBefore = market.reserveBalance();
        uint256 buyerEthBefore = buyer.balance;

        vm.prank(buyer);
        token.approve(address(market), tokenIn);
        vm.prank(buyer);
        uint256 sellerReceives = market.sell(tokenIn, quote.sellerReceives, block.timestamp);

        assertEq(sellerReceives, quote.sellerReceives);
        assertEq(buyer.balance - buyerEthBefore, quote.sellerReceives);
        assertEq(reserveBefore - market.reserveBalance(), quote.grossEthOut);
        assertEq(quote.grossEthOut, quote.platformFee + quote.creatorFee + quote.sellerReceives);
        assertEq(token.totalSupply(), market.curveSupply());
        assertGe(address(market).balance, market.reserveBalance());
    }

    function testSellRejectsWithoutAllowanceAndOnSlippage() public {
        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);
        uint256 tokenIn = token.balanceOf(buyer) / 2;
        MarketTypes.SellQuote memory quote = market.quoteSell(tokenIn);

        vm.prank(buyer);
        vm.expectRevert();
        market.sell(tokenIn, 0, block.timestamp);

        vm.prank(buyer);
        token.approve(address(market), tokenIn);
        vm.prank(buyer);
        vm.expectRevert(TokenMarket.InsufficientOutput.selector);
        market.sell(tokenIn, quote.sellerReceives + 1, block.timestamp);
    }

    function testRejectingCreatorDoesNotBlockTrading() public {
        RejectEthReceiver rejector = new RejectEthReceiver();
        (bytes32 rejectSalt,) =
            mineOfficialSalt(factory, address(rejector), "Reject Creator", "REJECT", "", "", keccak256("reject"));
        (address rejectTokenAddress, address rejectMarketAddress) = rejector.createToken(factory, rejectSalt);
        TokenMarket rejectMarket = TokenMarket(payable(rejectMarketAddress));

        vm.prank(buyer);
        rejectMarket.buy{value: 1 ether}(0, block.timestamp);

        assertGt(MemeToken(rejectTokenAddress).balanceOf(buyer), 0);
        assertEq(vault.creatorFeesClaimable(address(rejector)), 0.0025 ether);
    }

    function testReentrantSellerCannotConsumeReserveTwice() public {
        ReentrantMarketUser attacker = new ReentrantMarketUser();
        vm.deal(address(attacker), 2 ether);
        attacker.buy{value: 1 ether}(market);
        uint256 tokenIn = token.balanceOf(address(attacker)) / 2;
        uint256 reserveBefore = market.reserveBalance();
        uint256 grossOut = market.quoteSell(tokenIn).grossEthOut;

        attacker.sellWithReentry(tokenIn);

        assertTrue(attacker.attemptedReentry());
        assertEq(reserveBefore - market.reserveBalance(), grossOut);
    }

    function testFactoryOwnerCanPauseIndependently() public {
        factory.setMarketPauses(address(market), true, false, true);

        vm.expectRevert(TokenMarket.BuyPaused.selector);
        market.quoteBuyExactEth(1 ether);

        factory.setMarketPauses(address(market), false, true, false);
        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);

        vm.expectRevert(TokenMarket.SellPaused.selector);
        market.quoteSell(1);
    }

    function testGuardianCanPauseButCannotResume() public {
        factory.setGuardian(guardian);

        vm.prank(guardian);
        factory.pauseMarket(address(market), true, false, true);
        assertTrue(market.buyPaused());
        assertFalse(market.sellPaused());
        assertTrue(market.graduationPaused());

        vm.prank(guardian);
        factory.pauseMarket(address(market), false, false, false);
        assertTrue(market.buyPaused());
        assertTrue(market.graduationPaused());

        vm.expectRevert(MemeFactory.NotGuardian.selector);
        factory.pauseMarket(address(market), false, true, false);

        factory.setMarketPauses(address(market), false, false, false);
        assertFalse(market.buyPaused());
        assertFalse(market.graduationPaused());
    }

    function testMarketAOperationsDoNotChangeMarketB() public {
        (, TokenMarket marketB) = _createOfficialToken(creator, "Other", "OTHER", keccak256("other-market"));

        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);

        assertEq(marketB.reserveBalance(), 0);
        assertEq(address(marketB).balance, 0);
        assertEq(marketB.curveSupply(), 0);
        assertEq(uint256(marketB.stage()), uint256(MarketTypes.MarketStage.ACTIVE));
    }

    function testTenEthMarketCapGraduationThresholdStopsFurtherCurveTrading() public {
        MarketTypes.CurveConfig memory lowThresholdConfig = _curveConfig();
        lowThresholdConfig.graduationMarketCap = 10 ether;
        factory.configure(address(implementation), address(vault), address(0x1111), lowThresholdConfig, _feeConfig());

        (, TokenMarket lowThresholdMarket) =
            _createOfficialToken(creator, "Graduate", "GRAD", keccak256("low-threshold"));
        MarketTypes.BuyQuote memory quote = lowThresholdMarket.quoteBuyExactTokens(10_000 ether);
        assertLt(lowThresholdMarket.currentMarketCap(), 10 ether);
        vm.deal(buyer, quote.grossEthIn);

        vm.prank(buyer);
        lowThresholdMarket.buy{value: quote.grossEthIn}(quote.tokenOut, block.timestamp);
        assertGe(lowThresholdMarket.currentMarketCap(), 10 ether);
        assertEq(uint256(lowThresholdMarket.stage()), uint256(MarketTypes.MarketStage.GRADUATION_PENDING));

        vm.expectRevert(TokenMarket.InvalidStage.selector);
        lowThresholdMarket.quoteBuyExactEth(1 ether);
        vm.expectRevert(TokenMarket.InvalidStage.selector);
        lowThresholdMarket.quoteSell(1);
    }

    function testOptimizedTenEthCurveGraduatesBeforeTargetSupply() public {
        MarketTypes.CurveConfig memory optimizedConfig = MarketTypes.CurveConfig({
            initialPriceX18: 0.000001 ether,
            targetPriceX18: 0.000012 ether,
            targetSupply: 1_000_000 ether,
            graduationMarketCap: 10 ether
        });
        factory.configure(address(implementation), address(vault), address(0x1111), optimizedConfig, _feeConfig());

        (, TokenMarket optimizedMarket) = _createOfficialToken(creator, "Optimized", "OPT", keccak256("optimized"));

        MarketTypes.BuyQuote memory quote = optimizedMarket.quoteBuyExactTokens(910_000 ether);
        vm.deal(buyer, quote.grossEthIn);
        vm.prank(buyer);
        optimizedMarket.buy{value: quote.grossEthIn}(quote.tokenOut, block.timestamp);

        assertGe(optimizedMarket.currentMarketCap(), 10 ether);
        assertLt(optimizedMarket.curveSupply(), optimizedConfig.targetSupply);
        assertEq(uint256(optimizedMarket.stage()), uint256(MarketTypes.MarketStage.GRADUATION_PENDING));
    }

    function testFactoryOwnerCanSweepResidualsOnlyAfterDexLive() public {
        (, TokenMarket liveMarket) = _createOfficialToken(creator, "Sweep", "SWEEP", keccak256("sweep-market"));

        vm.prank(buyer);
        liveMarket.buy{value: 1 ether}(0, block.timestamp);

        vm.expectRevert(TokenMarket.InvalidStage.selector);
        factory.sweepMarketResiduals(address(liveMarket), address(0xC0FFEE), payable(address(0xFACE)));
    }

    function testNonOwnerCannotSweepResiduals() public {
        vm.prank(buyer);
        vm.expectRevert();
        factory.sweepMarketResiduals(address(market), address(0xC0FFEE), payable(address(0xFACE)));
    }

    function testFuzzBuyThenSellMaintainsCoreInvariants(uint96 grossInput, uint16 sellBps) public {
        uint256 grossEthIn = bound(uint256(grossInput), 0.01 ether, 100 ether);
        sellBps = uint16(bound(uint256(sellBps), 1, 10_000));
        vm.deal(buyer, grossEthIn);

        vm.prank(buyer);
        market.buy{value: grossEthIn}(0, block.timestamp);
        uint256 tokenIn = token.balanceOf(buyer) * sellBps / 10_000;
        if (tokenIn > 0) {
            vm.prank(buyer);
            token.approve(address(market), tokenIn);
            vm.prank(buyer);
            market.sell(tokenIn, 0, block.timestamp);
        }

        assertEq(token.totalSupply(), market.curveSupply());
        assertGe(address(market).balance, market.reserveBalance());
        assertGe(address(vault).balance, vault.platformFeesClaimable() + vault.totalCreatorFeesClaimable());
    }

    function _createOfficialToken(address tokenCreator, string memory name, string memory symbol, bytes32 seed)
        internal
        returns (MemeToken createdToken, TokenMarket createdMarket)
    {
        (bytes32 salt,) = mineOfficialSalt(factory, tokenCreator, name, symbol, "", "", seed);
        vm.prank(tokenCreator);
        (address tokenAddress, address marketAddress) = factory.createToken(name, symbol, "", "", salt);
        return (MemeToken(tokenAddress), TokenMarket(payable(marketAddress)));
    }

    function _curveConfig() internal pure returns (MarketTypes.CurveConfig memory) {
        return MarketTypes.CurveConfig({
            initialPriceX18: 0.001 ether,
            targetPriceX18: 0.005 ether,
            targetSupply: 1_000_000 ether,
            graduationMarketCap: 5_000 ether
        });
    }

    function _feeConfig() internal pure returns (MarketTypes.FeeConfig memory) {
        return MarketTypes.FeeConfig({platformFeeBps: 100, creatorFeeBps: 25});
    }
}
