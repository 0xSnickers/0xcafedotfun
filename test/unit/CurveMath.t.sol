// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {CurveMath} from "../../src/libraries/CurveMath.sol";
import {MarketTypes} from "../../src/libraries/MarketTypes.sol";
import {CurveMathHarness} from "../mocks/CurveMathHarness.sol";

contract CurveMathTest is Test {
    CurveMathHarness private harness;
    MarketTypes.CurveConfig private config;

    function setUp() public {
        harness = new CurveMathHarness();
        config = MarketTypes.CurveConfig({
            initialPriceX18: 0.001 ether,
            targetPriceX18: 0.005 ether,
            targetSupply: 1_000_000 ether,
            graduationMarketCap: 5_000 ether
        });
    }

    function testCurrentPriceStartsAtInitialPrice() public view {
        assertEq(harness.currentPrice(config, 0), config.initialPriceX18);
    }

    function testCurrentPriceReachesTargetAtTargetSupply() public view {
        assertEq(harness.currentPrice(config, config.targetSupply), config.targetPriceX18);
    }

    function testReserveCostForBuyMatchesSellRefundAcrossSameInterval() public view {
        uint256 startSupply = 2_000 ether;
        uint256 tokenAmount = 500 ether;

        uint256 buyCost = harness.reserveCostForBuy(config, startSupply, tokenAmount);
        uint256 sellRefund = harness.grossRefundForSell(config, startSupply + tokenAmount, tokenAmount);

        assertEq(buyCost, sellRefund);
    }

    function testTokenOutForReserveInRoundTripsExactBuyCost() public view {
        uint256 startSupply = 10_000 ether;
        uint256 expectedTokenOut = 777 ether;
        uint256 reserveIn = harness.reserveCostForBuy(config, startSupply, expectedTokenOut);
        uint256 actualTokenOut = harness.tokenOutForReserveIn(config, startSupply, reserveIn);

        assertGe(actualTokenOut, expectedTokenOut);
        assertLe(actualTokenOut - expectedTokenOut, 1_000);
        assertLe(harness.reserveCostForBuy(config, startSupply, actualTokenOut), reserveIn);
        assertGt(harness.reserveCostForBuy(config, startSupply, actualTokenOut + 1), reserveIn);
    }

    function testReserveCostForBuyRevertsWhenExceedingTargetSupply() public {
        vm.expectRevert(CurveMath.InvalidCurveConfig.selector);
        harness.reserveCostForBuy(config, config.targetSupply, 1);
    }

    function testCurrentPriceRevertsForInvalidCurveConfig() public {
        MarketTypes.CurveConfig memory invalidConfig = MarketTypes.CurveConfig({
            initialPriceX18: 0,
            targetPriceX18: 0.005 ether,
            targetSupply: 1_000_000 ether,
            graduationMarketCap: 5_000 ether
        });

        vm.expectRevert(CurveMath.InvalidCurveConfig.selector);
        harness.currentPrice(invalidConfig, 0);
    }
}
