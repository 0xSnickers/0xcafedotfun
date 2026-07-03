// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MarketTypes} from "./MarketTypes.sol";

library CurveMath {
    error InvalidCurveConfig();

    function currentPrice(MarketTypes.CurveConfig memory config, uint256 curveSupply) internal pure returns (uint256) {
        _validate(config, curveSupply);
        return config.initialPriceX18
            + Math.mulDiv(config.targetPriceX18 - config.initialPriceX18, curveSupply, config.targetSupply);
    }

    function reserveCostForBuy(MarketTypes.CurveConfig memory config, uint256 curveSupply, uint256 tokenOut)
        internal
        pure
        returns (uint256)
    {
        _validate(config, curveSupply);
        if (tokenOut == 0) {
            return 0;
        }
        if (curveSupply + tokenOut > config.targetSupply) {
            revert InvalidCurveConfig();
        }

        return _reserveIntegral(config, curveSupply + tokenOut) - _reserveIntegral(config, curveSupply);
    }

    function grossRefundForSell(MarketTypes.CurveConfig memory config, uint256 curveSupply, uint256 tokenIn)
        internal
        pure
        returns (uint256)
    {
        _validate(config, curveSupply);
        if (tokenIn == 0) {
            return 0;
        }
        if (tokenIn > curveSupply) {
            revert InvalidCurveConfig();
        }

        return _reserveIntegral(config, curveSupply) - _reserveIntegral(config, curveSupply - tokenIn);
    }

    function tokenOutForReserveIn(MarketTypes.CurveConfig memory config, uint256 curveSupply, uint256 reserveIn)
        internal
        pure
        returns (uint256 tokenOut)
    {
        _validate(config, curveSupply);
        if (reserveIn == 0) {
            return 0;
        }

        uint256 low = 0;
        uint256 high = config.targetSupply - curveSupply;
        while (low < high) {
            uint256 mid = (low + high + 1) / 2;
            if (reserveCostForBuy(config, curveSupply, mid) <= reserveIn) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }

        return low;
    }

    function _reserveIntegral(MarketTypes.CurveConfig memory config, uint256 supply) private pure returns (uint256) {
        uint256 linearTerm = Math.mulDiv(config.initialPriceX18, supply, 1e18);
        uint256 proportionalDelta =
            Math.mulDiv(config.targetPriceX18 - config.initialPriceX18, supply, config.targetSupply);
        uint256 slopeTerm = Math.mulDiv(proportionalDelta, supply, 2e18);
        return linearTerm + slopeTerm;
    }

    function _validate(MarketTypes.CurveConfig memory config, uint256 curveSupply) private pure {
        if (
            config.initialPriceX18 == 0 || config.targetPriceX18 <= config.initialPriceX18 || config.targetSupply == 0
                || curveSupply > config.targetSupply
        ) {
            revert InvalidCurveConfig();
        }
    }
}
