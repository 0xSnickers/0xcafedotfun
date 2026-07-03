// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MarketTypes} from "./MarketTypes.sol";

library FeeMath {
    uint256 internal constant FEE_BASE = 10_000;

    error InvalidFeeConfig();

    function splitFees(uint256 grossAmount, MarketTypes.FeeConfig memory config)
        internal
        pure
        returns (uint256 platformFee, uint256 creatorFee, uint256 netAmount)
    {
        _validate(config);
        platformFee = Math.mulDiv(grossAmount, config.platformFeeBps, FEE_BASE);
        creatorFee = Math.mulDiv(grossAmount, config.creatorFeeBps, FEE_BASE);
        netAmount = grossAmount - platformFee - creatorFee;
    }

    function grossAmountForNet(uint256 requiredNetAmount, MarketTypes.FeeConfig memory config)
        internal
        pure
        returns (uint256 grossAmount)
    {
        _validate(config);
        if (requiredNetAmount == 0) {
            return 0;
        }

        uint256 feeFreeBps = FEE_BASE - totalFeeBps(config);
        grossAmount = Math.mulDiv(requiredNetAmount, FEE_BASE, feeFreeBps, Math.Rounding.Ceil);

        while (grossAmount > 0 && _netAmount(grossAmount - 1, config) >= requiredNetAmount) {
            grossAmount--;
        }
    }

    function totalFeeBps(MarketTypes.FeeConfig memory config) internal pure returns (uint256) {
        return uint256(config.platformFeeBps) + uint256(config.creatorFeeBps);
    }

    function _validate(MarketTypes.FeeConfig memory config) private pure {
        if (totalFeeBps(config) >= FEE_BASE) {
            revert InvalidFeeConfig();
        }
    }

    function _netAmount(uint256 grossAmount, MarketTypes.FeeConfig memory config) private pure returns (uint256) {
        uint256 platformFee = Math.mulDiv(grossAmount, config.platformFeeBps, FEE_BASE);
        uint256 creatorFee = Math.mulDiv(grossAmount, config.creatorFeeBps, FEE_BASE);
        return grossAmount - platformFee - creatorFee;
    }
}
