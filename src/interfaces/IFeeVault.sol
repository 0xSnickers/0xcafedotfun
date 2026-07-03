// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface IFeeVault {
    function accrueFees(address token, address creator, uint256 platformFee, uint256 creatorFee) external payable;

    function claimCreatorFees(address payable recipient) external;
    function claimPlatformFees(uint256 amount, address payable recipient) external;
}
