// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface IMemeTokenMetadata {
    function tokenImage() external view returns (string memory);
    function description() external view returns (string memory);
}

interface IMemeToken is IMemeTokenMetadata {
    function creator() external view returns (address);
    function minter() external view returns (address);
    function mint(address to, uint256 amount) external;
    function burnMarketBalance(uint256 amount) external;
    function setMinter(address newMinter) external;
    function updateMetadata(string calldata image, string calldata description) external;
}
