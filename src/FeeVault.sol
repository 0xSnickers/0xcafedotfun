// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMemeFactory} from "./interfaces/IMemeFactory.sol";

contract FeeVault is Ownable2Step, ReentrancyGuard {
    address public factory;
    address public treasury;

    uint256 public platformFeesClaimable;
    uint256 public totalCreatorFeesClaimable;
    uint256 public totalPlatformFeesAccrued;
    uint256 public totalPlatformFeesClaimed;

    mapping(address creator => uint256) public creatorFeesClaimable;
    mapping(address creator => uint256) public totalCreatorFeesAccrued;
    mapping(address creator => uint256) public totalCreatorFeesClaimed;
    mapping(address token => uint256) public tokenCreatorFeesAccrued;
    mapping(address token => uint256) public tokenPlatformFeesAccrued;

    event FactoryUpdated(address indexed oldFactory, address indexed newFactory);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeesAccrued(
        address indexed token, address indexed market, address indexed creator, uint256 platformFee, uint256 creatorFee
    );
    event CreatorFeesClaimed(address indexed creator, address indexed recipient, uint256 amount);
    event PlatformFeesClaimed(address indexed treasury, address indexed recipient, uint256 amount);

    error EthTransferFailed();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidFeePayment();
    error NotTreasury();
    error UntrustedMarket();

    modifier onlyTreasury() {
        _onlyTreasury();
        _;
    }

    constructor(address initialOwner, address initialTreasury) Ownable(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidAddress();
        treasury = initialTreasury;
    }

    function setFactory(address newFactory) external onlyOwner {
        if (newFactory == address(0) || newFactory.code.length == 0) revert InvalidAddress();
        address oldFactory = factory;
        factory = newFactory;
        emit FactoryUpdated(oldFactory, newFactory);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function accrueFees(address token, address creator, uint256 platformFee, uint256 creatorFee) external payable {
        if (factory == address(0) || !IMemeFactory(factory).isMarket(msg.sender)) {
            revert UntrustedMarket();
        }
        if (token == address(0) || creator == address(0)) revert InvalidAddress();
        if (msg.value != platformFee + creatorFee) revert InvalidFeePayment();

        platformFeesClaimable += platformFee;
        totalCreatorFeesClaimable += creatorFee;
        totalPlatformFeesAccrued += platformFee;
        creatorFeesClaimable[creator] += creatorFee;
        totalCreatorFeesAccrued[creator] += creatorFee;
        tokenCreatorFeesAccrued[token] += creatorFee;
        tokenPlatformFeesAccrued[token] += platformFee;

        emit FeesAccrued(token, msg.sender, creator, platformFee, creatorFee);
    }

    function claimCreatorFees(address payable recipient) external nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        uint256 amount = creatorFeesClaimable[msg.sender];
        if (amount == 0) revert InvalidAmount();

        creatorFeesClaimable[msg.sender] = 0;
        totalCreatorFeesClaimable -= amount;
        totalCreatorFeesClaimed[msg.sender] += amount;

        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert EthTransferFailed();

        emit CreatorFeesClaimed(msg.sender, recipient, amount);
    }

    function _onlyTreasury() internal view {
        if (msg.sender != treasury) revert NotTreasury();
    }

    function claimPlatformFees(uint256 amount, address payable recipient) external nonReentrant onlyTreasury {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0 || amount > platformFeesClaimable) revert InvalidAmount();

        platformFeesClaimable -= amount;
        totalPlatformFeesClaimed += amount;

        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert EthTransferFailed();

        emit PlatformFeesClaimed(msg.sender, recipient, amount);
    }
}
