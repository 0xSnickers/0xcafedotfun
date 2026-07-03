// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {FeeMath} from "../../src/libraries/FeeMath.sol";
import {MarketTypes} from "../../src/libraries/MarketTypes.sol";

contract FeeMathHarness {
    function splitFees(uint256 grossAmount, MarketTypes.FeeConfig memory config)
        external
        pure
        returns (uint256 platformFee, uint256 creatorFee, uint256 netAmount)
    {
        return FeeMath.splitFees(grossAmount, config);
    }

    function grossAmountForNet(uint256 requiredNetAmount, MarketTypes.FeeConfig memory config)
        external
        pure
        returns (uint256)
    {
        return FeeMath.grossAmountForNet(requiredNetAmount, config);
    }

    function totalFeeBps(MarketTypes.FeeConfig memory config) external pure returns (uint256) {
        return FeeMath.totalFeeBps(config);
    }
}
