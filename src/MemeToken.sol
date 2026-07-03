// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MemeToken is ERC20 {
    uint256 public constant MAX_TOKEN_IMAGE_BYTES = 256;
    uint256 public constant MAX_TOKEN_DESCRIPTION_BYTES = 500;

    address private immutable CREATOR;
    address public minter;

    string private _tokenImage;
    string private _description;

    event TokenImageUpdated(string newImage);
    event DescriptionUpdated(string newDescription);
    event MinterUpdated(address indexed newMinter);

    error InvalidAddress();
    error NotCreator();
    error NotMinter();
    error TokenMetadataTooLong();

    modifier onlyCreator() {
        _onlyCreator();
        _;
    }

    modifier onlyMinter() {
        _onlyMinter();
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        address creator_,
        address minter_,
        string memory tokenImage_,
        string memory description_
    ) ERC20(name, symbol) {
        if (creator_ == address(0) || minter_ == address(0)) revert InvalidAddress();
        _validateMetadata(tokenImage_, description_);

        CREATOR = creator_;
        minter = minter_;
        _tokenImage = tokenImage_;
        _description = description_;
    }

    function _onlyCreator() internal view {
        if (msg.sender != CREATOR) revert NotCreator();
    }

    function _onlyMinter() internal view {
        if (msg.sender != minter) revert NotMinter();
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    function burnMarketBalance(uint256 amount) external onlyMinter {
        _burn(msg.sender, amount);
    }

    function setMinter(address newMinter) external onlyMinter {
        minter = newMinter;
        emit MinterUpdated(newMinter);
    }

    function updateMetadata(string calldata image, string calldata metadataDescription) external onlyCreator {
        _validateMetadata(image, metadataDescription);
        _tokenImage = image;
        _description = metadataDescription;
        emit TokenImageUpdated(image);
        emit DescriptionUpdated(metadataDescription);
    }

    function tokenImage() external view returns (string memory) {
        return _tokenImage;
    }

    function creator() external view returns (address) {
        return CREATOR;
    }

    function description() external view returns (string memory) {
        return _description;
    }

    function _validateMetadata(string memory image, string memory metadataDescription) internal pure {
        if (
            bytes(image).length > MAX_TOKEN_IMAGE_BYTES
                || bytes(metadataDescription).length > MAX_TOKEN_DESCRIPTION_BYTES
        ) {
            revert TokenMetadataTooLong();
        }
    }
}
