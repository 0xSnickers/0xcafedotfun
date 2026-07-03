// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MemeToken} from "./MemeToken.sol";
import {ITokenMarket} from "./interfaces/ITokenMarket.sol";
import {FeeMath} from "./libraries/FeeMath.sol";
import {MarketTypes} from "./libraries/MarketTypes.sol";

contract MemeFactory is Ownable2Step, ReentrancyGuard {
    uint256 public constant CREATE_FEE = 0;
    uint8 public constant TOKEN_DECIMALS = 18;
    uint16 public constant PLATFORM_FEE_BPS = 100;
    uint16 public constant CREATOR_FEE_BPS = 25;
    uint16 public constant TOTAL_TRADE_FEE_BPS = 125;
    uint256 public constant MAX_PAGE_SIZE = 100;
    uint256 public constant MAX_TOKEN_NAME_BYTES = 64;
    uint256 public constant MAX_TOKEN_SYMBOL_BYTES = 16;
    uint256 public constant MAX_TOKEN_IMAGE_BYTES = 256;
    uint256 public constant MAX_TOKEN_DESCRIPTION_BYTES = 500;

    struct MemeTokenInfo {
        address tokenAddress;
        string name;
        string symbol;
        address creator;
        uint256 createdAt;
        string tokenImage;
        string description;
    }

    mapping(address token => address market) public marketOf;
    mapping(address market => bool trusted) public isMarket;
    mapping(address token => address creator) public creatorOf;
    mapping(address token => uint256 version) public tokenConfigVersion;
    mapping(address creator => address[] tokens) internal creatorTokens;
    mapping(address token => MemeTokenInfo) internal tokenInfo;
    mapping(bytes32 effectiveSalt => bool used) public isSaltUsed;

    address[] internal allTokens;

    MarketTypes.CurveConfig public defaultCurveConfig;
    MarketTypes.FeeConfig public defaultFeeConfig;
    address public marketImplementation;
    address public feeVault;
    address public liquidityManager;
    address public guardian;
    uint256 public totalTokenCount;
    uint256 public configVersion;

    event TokenCreated(
        address indexed token,
        address indexed market,
        address indexed creator,
        bytes32 userSalt,
        bytes32 effectiveSalt,
        uint256 configVersion,
        string name,
        string symbol,
        string tokenImage,
        string description
    );
    event ConfigurationUpdated(
        uint256 indexed configVersion,
        address indexed marketImplementation,
        address indexed feeVault,
        address liquidityManager,
        uint256 initialPriceX18,
        uint256 targetPriceX18,
        uint256 targetSupply,
        uint256 graduationMarketCap,
        uint16 platformFeeBps,
        uint16 creatorFeeBps
    );
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);

    error FactoryNotConfigured();
    error InvalidAddress();
    error InvalidCurveConfig();
    error InvalidFeeConfig();
    error InvalidPageSize();
    error NotGuardian();
    error SaltAlreadyUsed();
    error TokenAddressNotOfficial();
    error TokenMetadataTooLong();

    constructor() Ownable(msg.sender) {}

    function configure(
        address marketImplementation_,
        address feeVault_,
        address liquidityManager_,
        MarketTypes.CurveConfig calldata curveConfig_,
        MarketTypes.FeeConfig calldata feeConfig_
    ) external onlyOwner {
        if (
            marketImplementation_ == address(0) || feeVault_ == address(0) || liquidityManager_ == address(0)
                || marketImplementation_.code.length == 0
        ) {
            revert InvalidAddress();
        }
        if (
            curveConfig_.initialPriceX18 == 0 || curveConfig_.targetPriceX18 <= curveConfig_.initialPriceX18
                || curveConfig_.targetSupply == 0 || curveConfig_.graduationMarketCap == 0
                || curveConfig_.graduationMarketCap
                    > Math.mulDiv(curveConfig_.targetPriceX18, curveConfig_.targetSupply, 1e18)
        ) {
            revert InvalidCurveConfig();
        }
        if (
            feeConfig_.platformFeeBps != PLATFORM_FEE_BPS || feeConfig_.creatorFeeBps != CREATOR_FEE_BPS
                || FeeMath.totalFeeBps(feeConfig_) != TOTAL_TRADE_FEE_BPS
        ) {
            revert InvalidFeeConfig();
        }

        marketImplementation = marketImplementation_;
        feeVault = feeVault_;
        liquidityManager = liquidityManager_;
        defaultCurveConfig = curveConfig_;
        defaultFeeConfig = feeConfig_;
        configVersion++;

        emit ConfigurationUpdated(
            configVersion,
            marketImplementation_,
            feeVault_,
            liquidityManager_,
            curveConfig_.initialPriceX18,
            curveConfig_.targetPriceX18,
            curveConfig_.targetSupply,
            curveConfig_.graduationMarketCap,
            feeConfig_.platformFeeBps,
            feeConfig_.creatorFeeBps
        );
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata tokenImage,
        string calldata description,
        bytes32 userSalt
    ) external nonReentrant returns (address token, address market) {
        if (
            marketImplementation == address(0) || feeVault == address(0) || liquidityManager == address(0)
                || configVersion == 0
        ) {
            revert FactoryNotConfigured();
        }
        _validateTokenMetadata(name, symbol, tokenImage, description);

        bytes32 deploymentSalt = effectiveSalt(msg.sender, userSalt);
        if (isSaltUsed[deploymentSalt]) revert SaltAlreadyUsed();

        bytes32 initCodeHash = _initCodeHash(name, symbol, msg.sender, tokenImage, description);
        if (!_isOfficialTokenAddress(_computeCreate2Address(deploymentSalt, initCodeHash))) {
            revert TokenAddressNotOfficial();
        }

        isSaltUsed[deploymentSalt] = true;

        token = address(
            new MemeToken{salt: deploymentSalt}(name, symbol, msg.sender, address(this), tokenImage, description)
        );

        bytes32 marketSalt = _marketSalt(deploymentSalt, token);
        market = Clones.cloneDeterministic(marketImplementation, marketSalt);
        ITokenMarket(market)
            .initialize(token, msg.sender, feeVault, liquidityManager, defaultCurveConfig, defaultFeeConfig);
        MemeToken(token).setMinter(market);

        marketOf[token] = market;
        isMarket[market] = true;
        creatorOf[token] = msg.sender;
        tokenConfigVersion[token] = configVersion;
        creatorTokens[msg.sender].push(token);
        allTokens.push(token);
        totalTokenCount++;
        tokenInfo[token] = MemeTokenInfo({
            tokenAddress: token,
            name: name,
            symbol: symbol,
            creator: msg.sender,
            createdAt: block.timestamp,
            tokenImage: tokenImage,
            description: description
        });

        emit TokenCreated(
            token, market, msg.sender, userSalt, deploymentSalt, configVersion, name, symbol, tokenImage, description
        );
    }

    function effectiveSalt(address creator, bytes32 userSalt) public pure returns (bytes32 result) {
        assembly ("memory-safe") {
            mstore(0x00, creator)
            mstore(0x20, userSalt)
            result := keccak256(0x00, 0x40)
        }
    }

    function predictTokenAddress(
        address creator,
        string calldata name,
        string calldata symbol,
        string calldata tokenImage,
        string calldata description,
        bytes32 userSalt
    ) external view returns (address) {
        _validateTokenMetadata(name, symbol, tokenImage, description);
        bytes32 deploymentSalt = effectiveSalt(creator, userSalt);
        bytes32 initCodeHash = _initCodeHash(name, symbol, creator, tokenImage, description);
        return _computeCreate2Address(deploymentSalt, initCodeHash);
    }

    function predictMarketAddress(address token, address creator, bytes32 userSalt) external view returns (address) {
        bytes32 deploymentSalt = effectiveSalt(creator, userSalt);
        bytes32 marketSalt = _marketSalt(deploymentSalt, token);
        return Clones.predictDeterministicAddress(marketImplementation, marketSalt, address(this));
    }

    function getTokens(uint256 offset, uint256 limit) external view returns (address[] memory) {
        return _page(allTokens, offset, limit);
    }

    function getCreatorTokens(address creator, uint256 offset, uint256 limit) external view returns (address[] memory) {
        return _page(creatorTokens[creator], offset, limit);
    }

    function getMemeTokenInfo(address tokenAddress) external view returns (MemeTokenInfo memory) {
        return tokenInfo[tokenAddress];
    }

    function getAllMemeTokens() external view returns (address[] memory) {
        return allTokens;
    }

    function getCreatorTokens(address creator) external view returns (address[] memory) {
        return creatorTokens[creator];
    }

    function getMemeTokenCount() external view returns (uint256) {
        return totalTokenCount;
    }

    function getCreatorTokenCount(address creator) external view returns (uint256) {
        return creatorTokens[creator].length;
    }

    function tokenExists(address token) external view returns (bool) {
        return marketOf[token] != address(0);
    }

    function isCreatorOf(address creator, address token) external view returns (bool) {
        return creatorOf[token] == creator;
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert InvalidAddress();
        address oldGuardian = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(oldGuardian, newGuardian);
    }

    function setMarketPauses(address market, bool buyPaused, bool sellPaused, bool graduationPaused)
        external
        onlyOwner
    {
        if (!isMarket[market]) revert InvalidAddress();
        ITokenMarket(market).setPauses(buyPaused, sellPaused, graduationPaused);
    }

    function sweepMarketResiduals(address market, address tokenRecipient, address payable ethRecipient)
        external
        onlyOwner
    {
        if (!isMarket[market]) revert InvalidAddress();
        ITokenMarket(market).sweepGraduationResiduals(tokenRecipient, ethRecipient);
    }

    /// @notice Allows the guardian to add emergency pauses to a market.
    /// @dev Guardian pauses are one-way through this entrypoint: passing false never unpauses
    /// an already-paused flag. The owner must call setMarketPauses to resume a market.
    function pauseMarket(address market, bool pauseBuy, bool pauseSell, bool pauseGraduation) external {
        if (msg.sender != guardian) revert NotGuardian();
        if (!isMarket[market]) revert InvalidAddress();

        ITokenMarket target = ITokenMarket(market);
        target.setPauses(
            target.buyPaused() || pauseBuy,
            target.sellPaused() || pauseSell,
            target.graduationPaused() || pauseGraduation
        );
    }

    function _page(address[] storage source, uint256 offset, uint256 limit)
        internal
        view
        returns (address[] memory result)
    {
        if (limit > MAX_PAGE_SIZE) revert InvalidPageSize();
        if (offset >= source.length || limit == 0) return new address[](0);

        uint256 end = offset + limit;
        if (end > source.length) end = source.length;

        result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = source[i];
        }
    }

    function _isOfficialTokenAddress(address token) internal pure returns (bool) {
        return uint160(token) >> 144 == 0xcafe;
    }

    function _validateTokenMetadata(
        string calldata name,
        string calldata symbol,
        string calldata tokenImage,
        string calldata description
    ) internal pure {
        if (
            bytes(name).length > MAX_TOKEN_NAME_BYTES || bytes(symbol).length > MAX_TOKEN_SYMBOL_BYTES
                || bytes(tokenImage).length > MAX_TOKEN_IMAGE_BYTES
                || bytes(description).length > MAX_TOKEN_DESCRIPTION_BYTES
        ) {
            revert TokenMetadataTooLong();
        }
    }

    function _marketSalt(bytes32 deploymentSalt, address token) internal pure returns (bytes32 result) {
        assembly ("memory-safe") {
            mstore(0x00, deploymentSalt)
            mstore(0x20, token)
            result := keccak256(0x00, 0x40)
        }
    }

    function _initCodeHash(
        string calldata name,
        string calldata symbol,
        address creator,
        string calldata tokenImage,
        string calldata description
    ) internal view returns (bytes32 result) {
        bytes memory initCode = abi.encodePacked(
            type(MemeToken).creationCode, abi.encode(name, symbol, creator, address(this), tokenImage, description)
        );
        assembly ("memory-safe") {
            result := keccak256(add(initCode, 0x20), mload(initCode))
        }
    }

    function _computeCreate2Address(bytes32 salt, bytes32 initCodeHash) internal view returns (address result) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore8(ptr, 0xff)
            mstore(add(ptr, 0x01), shl(96, address()))
            mstore(add(ptr, 0x15), salt)
            mstore(add(ptr, 0x35), initCodeHash)
            result := and(keccak256(ptr, 0x55), 0xffffffffffffffffffffffffffffffffffffffff)
        }
    }
}
