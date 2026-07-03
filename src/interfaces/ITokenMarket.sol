// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {MarketTypes} from "../libraries/MarketTypes.sol";

interface ITokenMarket {
    function initialize(
        address token,
        address creator,
        address feeVault,
        address liquidityManager,
        MarketTypes.CurveConfig calldata curveConfig,
        MarketTypes.FeeConfig calldata feeConfig
    ) external;

    function quoteBuyExactEth(uint256 grossEthIn) external view returns (MarketTypes.BuyQuote memory);

    function quoteBuyExactTokens(uint256 tokenOut) external view returns (MarketTypes.BuyQuote memory);

    function quoteSell(uint256 tokenIn) external view returns (MarketTypes.SellQuote memory);

    function getMarketState() external view returns (MarketTypes.MarketStateView memory);
    function currentPriceX18() external view returns (uint256);
    function currentMarketCap() external view returns (uint256);
    function buyPaused() external view returns (bool);
    function sellPaused() external view returns (bool);
    function graduationPaused() external view returns (bool);
    function buy(uint256 minTokenOut, uint256 deadline) external payable returns (uint256);
    function sell(uint256 tokenIn, uint256 minEthOut, uint256 deadline) external returns (uint256);
    function prepareGraduation() external;
    function onLiquidityAdded(
        address pair,
        uint256 tokenUsed,
        uint256 ethUsed,
        uint256 liquidity,
        uint256 tokenResidual,
        uint256 ethResidual
    ) external payable;
    function sweepGraduationResiduals(address tokenRecipient, address payable ethRecipient) external;
    function setPauses(bool buyPaused, bool sellPaused, bool graduationPaused) external;
}
