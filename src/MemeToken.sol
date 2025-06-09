// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MemeToken is ERC20, Ownable {
    uint8 private _decimals;
    string private _tokenImage;
    string private _description;
    address public minter; // 授权的铸造者地址（通常是 BondingCurve 合约）
    
    event TokenImageUpdated(string newImage);
    event DescriptionUpdated(string newDescription);
    event MinterUpdated(address indexed newMinter);
    
    modifier onlyMinter() {
        require(msg.sender == minter || msg.sender == owner(), "Not authorized minter");
        _;
    }
    
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 totalSupply,
        address owner,
        string memory tokenImage_,
        string memory description_
    ) ERC20(name, symbol) Ownable(owner) {
        _decimals = decimals_;
        _tokenImage = tokenImage_;
        _description = description_;
        // 对于 bonding curve 模式，不立即铸造所有代币
        // _mint(owner, totalSupply); // 注释掉，改为按需铸造
    }

    // @notice 设置授权铸造者（通常是 BondingCurve 合约）
    function setMinter(address _minter) external onlyOwner {
        minter = _minter;
        emit MinterUpdated(_minter);
    }
    
    // @notice 铸造代币（仅授权铸造者可调用）
    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    // @notice 获取代币小数位
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
    
    // @notice 获取代币图片
    function tokenImage() public view returns (string memory) {
        return _tokenImage;
    }
    
    // @notice 获取代币描述
    function description() public view returns (string memory) {
        return _description;
    }
    
    // @notice 更新代币图片
    // @param newImage 新图片
    function updateTokenImage(string memory newImage) external onlyOwner {
        _tokenImage = newImage;
        emit TokenImageUpdated(newImage);
    }
    
    // @notice 更新代币描述
    // @param newDescription 新描述
    function updateDescription(string memory newDescription) external onlyOwner {
        _description = newDescription;
        emit DescriptionUpdated(newDescription);
    }
    
    // @notice 销毁代币
    // @param amount 销毁数量
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
    
    // @notice 从账户销毁代币
    // @param account 账户地址
    // @param amount 销毁数量
    function burnFrom(address account, uint256 amount) external {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }
} 