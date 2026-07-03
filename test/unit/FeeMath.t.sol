// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {FeeMath} from "../../src/libraries/FeeMath.sol";
import {MarketTypes} from "../../src/libraries/MarketTypes.sol";
import {FeeMathHarness} from "../mocks/FeeMathHarness.sol";

contract FeeMathTest is Test {
    FeeMathHarness private harness;
    MarketTypes.FeeConfig private config;

    function setUp() public {
        harness = new FeeMathHarness();
        config = MarketTypes.FeeConfig({platformFeeBps: 100, creatorFeeBps: 25});
    }

    function testSplitFeesUsesFormalFeeSchedule() public view {
        (uint256 platformFee, uint256 creatorFee, uint256 netAmount) = harness.splitFees(10_000, config);

        assertEq(platformFee, 100);
        assertEq(creatorFee, 25);
        assertEq(netAmount, 9_875);
    }

    function testGrossAmountForNetRoundsUpAndStillCoversRequiredNet() public view {
        uint256 requiredNetAmount = 9_999;
        uint256 grossAmount = harness.grossAmountForNet(requiredNetAmount, config);
        (,, uint256 resultingNetAmount) = harness.splitFees(grossAmount, config);

        assertGe(resultingNetAmount, requiredNetAmount);
        (,, uint256 previousNetAmount) = harness.splitFees(grossAmount - 1, config);
        assertLt(previousNetAmount, requiredNetAmount);
    }

    function testGrossAmountForNetReturnsZeroForZeroTarget() public view {
        assertEq(harness.grossAmountForNet(0, config), 0);
    }

    function testFuzzGrossAmountForNetIsMinimal(uint128 requiredNetAmount) public view {
        if (requiredNetAmount == 0) return;

        uint256 grossAmount = harness.grossAmountForNet(requiredNetAmount, config);
        (,, uint256 resultingNetAmount) = harness.splitFees(grossAmount, config);
        (,, uint256 previousNetAmount) = harness.splitFees(grossAmount - 1, config);

        assertGe(resultingNetAmount, requiredNetAmount);
        assertLt(previousNetAmount, requiredNetAmount);
    }

    function testTotalFeeBpsMatchesFormalConstants() public view {
        assertEq(harness.totalFeeBps(config), 125);
    }

    function testSplitFeesRevertsForInvalidFeeConfig() public {
        MarketTypes.FeeConfig memory invalidConfig =
            MarketTypes.FeeConfig({platformFeeBps: 9_000, creatorFeeBps: 1_000});

        vm.expectRevert(FeeMath.InvalidFeeConfig.selector);
        harness.splitFees(1 ether, invalidConfig);
    }
}
