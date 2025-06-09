// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "./MemeToken.sol";
import "./BondingCurve.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract MemeFactory is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    
    struct MemeTokenInfo {
        address tokenAddress;
        string name;
        string symbol;
        address creator;
        uint256 createdAt;
        string tokenImage;
        string description;
    }
    
    struct CreateParams {
        string name;
        string symbol;
        uint8 decimals;
        string tokenImage;
        string description;
        bytes32 salt;
        address actualCreator;
        uint256 targetSupply;
        uint256 targetPrice;
        uint256 initialPrice;
    }
    
    mapping(address => MemeTokenInfo) public memeTokens;
    EnumerableSet.AddressSet private allMemeTokensSet;
    mapping(address => EnumerableSet.AddressSet) private creatorTokensSet;
    
    uint256 public totalTokenCount;
    uint256 public creationFee = 0.001 ether;
    uint256 public platformFeePercentage = 100;
    uint256 public constant MAX_PAGE_SIZE = 100;
    
    address public bondingCurveContract;
    
    event MemeTokenCreated(
        address indexed tokenAddress, 
        address indexed creator, 
        string name, 
        string symbol, 
        bytes32 salt, 
        string tokenImage, 
        string description
    );
    event CreationFeeUpdated(uint256 newFee);
    event PlatformFeeUpdated(uint256 newFee);
    event BondingCurveContractUpdated(address indexed newContract);
    
    constructor() Ownable(msg.sender) {}
    
    function setBondingCurveContract(address _bondingCurveContract) external onlyOwner {
        bondingCurveContract = _bondingCurveContract;
        emit BondingCurveContractUpdated(_bondingCurveContract);
    }
    
    function getBytecode(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 totalSupply,
        address deployer,
        string memory tokenImage,
        string memory description
    ) external view returns (bytes memory) {
        return abi.encodePacked(
            type(MemeToken).creationCode,
            abi.encode(name, symbol, decimals, totalSupply, deployer, tokenImage, description)
        );
    }
    
    function predictTokenAddress(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 totalSupply,
        string memory tokenImage,
        string memory description,
        bytes32 salt
    ) external view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(MemeToken).creationCode,
            abi.encode(name, symbol, decimals, totalSupply, msg.sender, tokenImage, description)
        );
        return Create2.computeAddress(salt, keccak256(bytecode), address(this));
    }
    
    function predictTokenAddressForUser(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 totalSupply,
        address platformAddress,
        string memory tokenImage,
        string memory description,
        bytes32 salt
    ) external view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(MemeToken).creationCode,
            abi.encode(name, symbol, decimals, totalSupply, platformAddress, tokenImage, description)
        );
        return Create2.computeAddress(salt, keccak256(bytecode), address(this));
    }
    
    function createMemeToken(
        string memory name,
        string memory symbol,
        uint8 decimals,
        string memory tokenImage,
        string memory description,
        bytes32 salt,
        address actualCreator,
        uint256 targetSupply,
        uint256 targetPrice,
        uint256 initialPrice
    ) external payable returns (address) {
        CreateParams memory params = CreateParams({
            name: name,
            symbol: symbol,
            decimals: decimals,
            tokenImage: tokenImage,
            description: description,
            salt: salt,
            actualCreator: actualCreator,
            targetSupply: targetSupply,
            targetPrice: targetPrice,
            initialPrice: initialPrice
        });
        
        return _createToken(params);
    }
    
    function _createToken(CreateParams memory params) internal returns (address) {
        require(params.actualCreator != address(0), "Invalid creator");
        require(bondingCurveContract != address(0), "BondingCurve contract not set");
        require(msg.value >= creationFee, "Insufficient creation fee");
        require(bytes(params.name).length > 0 && bytes(params.symbol).length > 0, "Invalid params");
        
        // 创建代币
        address tokenAddress = Create2.deploy(0, params.salt, abi.encodePacked(
            type(MemeToken).creationCode,
            abi.encode(
                params.name, 
                params.symbol, 
                params.decimals, 
                params.targetSupply, 
                address(this), 
                params.tokenImage, 
                params.description
            )
        ));
        
        // 存储信息
        memeTokens[tokenAddress] = MemeTokenInfo({
            tokenAddress: tokenAddress,
            name: params.name,
            symbol: params.symbol,
            creator: params.actualCreator,
            createdAt: block.timestamp,
            tokenImage: params.tokenImage,
            description: params.description
        });
        
        allMemeTokensSet.add(tokenAddress);
        creatorTokensSet[params.actualCreator].add(tokenAddress);
        totalTokenCount++;
        
        // 设置minter和初始化curve
        MemeToken(tokenAddress).setMinter(bondingCurveContract);
        BondingCurve(payable(bondingCurveContract)).initializeCurve(
            tokenAddress,
            params.actualCreator,
            params.targetSupply,
            params.targetPrice,
            params.initialPrice
        );
        
        if (msg.value > creationFee) {
            payable(msg.sender).transfer(msg.value - creationFee);
        }
        
        emit MemeTokenCreated(
            tokenAddress, 
            params.actualCreator, 
            params.name, 
            params.symbol, 
            params.salt, 
            params.tokenImage, 
            params.description
        );
        
        return tokenAddress;
    }
    
    function getMemeTokenInfo(address tokenAddress) external view returns (MemeTokenInfo memory) {
        return memeTokens[tokenAddress];
    }
    
    function getAllMemeTokens() external view returns (address[] memory) {
        uint256 totalCount = allMemeTokensSet.length();
        uint256 maxReturn = totalCount > MAX_PAGE_SIZE ? MAX_PAGE_SIZE : totalCount;
        
        address[] memory tokens = new address[](maxReturn);
        for (uint256 i = 0; i < maxReturn; i++) {
            tokens[i] = allMemeTokensSet.at(i);
        }
        return tokens;
    }
    
    function getCreatorTokens(address creator) external view returns (address[] memory) {
        EnumerableSet.AddressSet storage creatorSet = creatorTokensSet[creator];
        uint256 totalCount = creatorSet.length();
        uint256 maxReturn = totalCount > MAX_PAGE_SIZE ? MAX_PAGE_SIZE : totalCount;
        
        address[] memory tokens = new address[](maxReturn);
        for (uint256 i = 0; i < maxReturn; i++) {
            tokens[i] = creatorSet.at(i);
        }
        return tokens;
    }
    
    function getMemeTokenCount() external view returns (uint256) { return totalTokenCount; }
    function getCreatorTokenCount(address creator) external view returns (uint256) { return creatorTokensSet[creator].length(); }
    function tokenExists(address tokenAddress) external view returns (bool) { return allMemeTokensSet.contains(tokenAddress); }
    function isCreatorOf(address creator, address tokenAddress) external view returns (bool) { return creatorTokensSet[creator].contains(tokenAddress); }
    
    function setCreationFee(uint256 _newFee) external onlyOwner {
        creationFee = _newFee;
        emit CreationFeeUpdated(_newFee);
    }
    
    function setPlatformFeePercentage(uint256 _newFee) external onlyOwner {
        require(_newFee <= 1000, "Fee too high");
        platformFeePercentage = _newFee;
        emit PlatformFeeUpdated(_newFee);
    }
    
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees");
        payable(owner()).transfer(balance);
    }
    
    receive() external payable {}
} 