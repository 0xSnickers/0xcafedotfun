// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface IMemeFactory {
    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata tokenImage,
        string calldata description,
        bytes32 userSalt
    ) external returns (address token, address market);

    function effectiveSalt(address creator, bytes32 userSalt) external pure returns (bytes32);

    function predictTokenAddress(
        address creator,
        string calldata name,
        string calldata symbol,
        string calldata tokenImage,
        string calldata description,
        bytes32 userSalt
    ) external view returns (address);

    function isMarket(address market) external view returns (bool);
    function marketOf(address token) external view returns (address);
    function creatorOf(address token) external view returns (address);
}
