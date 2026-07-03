// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {MemeFactory} from "../../src/MemeFactory.sol";
import {MemeToken} from "../../src/MemeToken.sol";

abstract contract OfficialTokenSaltMiner {
    uint160 internal constant OFFICIAL_PREFIX = 0xcafe;

    function mineOfficialSalt(
        MemeFactory factory,
        address creator,
        string memory name,
        string memory symbol,
        string memory tokenImage,
        string memory description,
        bytes32 seed
    ) internal pure returns (bytes32 salt, address predicted) {
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(MemeToken).creationCode,
                abi.encode(name, symbol, creator, address(factory), tokenImage, description)
            )
        );

        for (uint256 i = 0;; i++) {
            salt = deriveSalt(seed, i);
            predicted = computeCreate2Address(address(factory), effectiveSalt(creator, salt), initCodeHash);
            if (isOfficialTokenAddress(predicted)) {
                return (salt, predicted);
            }
        }
    }

    function deriveSalt(bytes32 seed, uint256 nonce) internal pure returns (bytes32 result) {
        assembly ("memory-safe") {
            mstore(0x00, seed)
            mstore(0x20, nonce)
            result := keccak256(0x00, 0x40)
        }
    }

    function effectiveSalt(address creator, bytes32 userSalt) internal pure returns (bytes32 result) {
        assembly ("memory-safe") {
            mstore(0x00, creator)
            mstore(0x20, userSalt)
            result := keccak256(0x00, 0x40)
        }
    }

    function computeCreate2Address(address factoryAddress, bytes32 deploymentSalt, bytes32 initCodeHash)
        internal
        pure
        returns (address result)
    {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore8(ptr, 0xff)
            mstore(add(ptr, 0x01), shl(96, factoryAddress))
            mstore(add(ptr, 0x15), deploymentSalt)
            mstore(add(ptr, 0x35), initCodeHash)
            result := and(keccak256(ptr, 0x55), 0xffffffffffffffffffffffffffffffffffffffff)
        }
    }

    function isOfficialTokenAddress(address tokenAddress) internal pure returns (bool) {
        return uint160(tokenAddress) >> 144 == OFFICIAL_PREFIX;
    }
}
