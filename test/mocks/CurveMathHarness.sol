// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {CurveMath} from "../../src/libraries/CurveMath.sol";
import {MarketTypes} from "../../src/libraries/MarketTypes.sol";

contract CurveMathHarness {
    function currentPrice(MarketTypes.CurveConfig memory config, uint256 curveSupply) external pure returns (uint256) {
        return CurveMath.currentPrice(config, curveSupply);
    }

    function reserveCostForBuy(MarketTypes.CurveConfig memory config, uint256 curveSupply, uint256 tokenOut)
        external
        pure
        returns (uint256)
    {
        return CurveMath.reserveCostForBuy(config, curveSupply, tokenOut);
    }

    function grossRefundForSell(MarketTypes.CurveConfig memory config, uint256 curveSupply, uint256 tokenIn)
        external
        pure
        returns (uint256)
    {
        return CurveMath.grossRefundForSell(config, curveSupply, tokenIn);
    }

    function tokenOutForReserveIn(MarketTypes.CurveConfig memory config, uint256 curveSupply, uint256 reserveIn)
        external
        pure
        returns (uint256)
    {
        return CurveMath.tokenOutForReserveIn(config, curveSupply, reserveIn);
    }
}
