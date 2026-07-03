// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface ILiquidityManager {
    function registerGraduation(address token, address market, uint256 tokenAmount, uint256 ethAmount) external payable;

    function addLiquidity(address token, uint256 minTokenAmount, uint256 minEthAmount, uint256 deadline) external;
}
