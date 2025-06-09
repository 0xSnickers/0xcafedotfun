// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "forge-std/Test.sol";
import "../src/MemeFactory.sol";
import "../src/MemePlatform.sol";
import "../src/BondingCurve.sol";
import "../src/MemeToken.sol";

contract MemePlatformTest is Test {
    MemeFactory public memeFactory;
    MemePlatform public memePlatform;
    BondingCurve public bondingCurve;
    
    address public owner;
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public user3 = makeAddr("user3");
    
    uint256 public constant CREATION_FEE = 0.001 ether;
    uint256 public constant TARGET_MARKET_CAP = 10 ether; // 毕业门槛
    
    event UserProfileUpdated(address indexed user, string username, string avatar);
    event TokenGraduatedByMarketCap(
        address indexed token,
        uint256 finalSupply,
        uint256 totalRaised,
        uint256 marketCap
    );
    event TokenBought(
        address indexed token,
        address indexed buyer,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 newPrice,
        uint256 newSupply
    );
    
    function setUp() public {
        owner = address(this);
        
        // Deploy contracts
        memeFactory = new MemeFactory();
        memePlatform = new MemePlatform(payable(address(memeFactory)));
        bondingCurve = new BondingCurve(address(memePlatform));
        
        // 设置 BondingCurve 合约地址
        memeFactory.setBondingCurveContract(address(bondingCurve));
        
        // 授权 MemeFactory 调用 BondingCurve
        bondingCurve.addAuthorizedCaller(address(memeFactory));
        
        // 给测试用户分配 ETH
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        vm.deal(user3, 100 ether);
    }
    
    function testFactoryDeployment() public {
        assertEq(memeFactory.owner(), owner);
        assertEq(memeFactory.creationFee(), CREATION_FEE);
        assertEq(memeFactory.platformFeePercentage(), 100); // 1%
        assertEq(memeFactory.getMemeTokenCount(), 0);
    }
    
    function testPlatformDeployment() public {
        assertEq(memePlatform.owner(), owner);
        assertEq(address(memePlatform.memeFactory()), address(memeFactory));
    }
    
    function testBondingCurveConstants() public {
        // 验证毕业市值常量
        assertEq(bondingCurve.TARGET_MARKET_CAP(), TARGET_MARKET_CAP);
    }
    
    function testUserProfile() public {
        vm.startPrank(user1);
        
        vm.expectEmit(true, false, false, true);
        emit UserProfileUpdated(user1, "Alice", "https://example.com/alice-avatar.png");
        
        memePlatform.updateUserProfile("Alice", "https://example.com/alice-avatar.png");
        
        MemePlatform.UserProfile memory profile = memePlatform.getUserProfile(user1);
        assertEq(profile.username, "Alice");
        assertEq(profile.avatar, "https://example.com/alice-avatar.png");
        
        vm.stopPrank();
    }
    
    function testTokenCreation() public {
        vm.startPrank(user1);
        
        address tokenAddress = memePlatform.createMemeToken{value: CREATION_FEE}(
            "Test Token",
            "TEST",
            18,
            "https://example.com/token.png",
            "Token description",
            keccak256("test-salt"),
            800000000 * 1e18, // targetSupply
            0.001 ether,      // targetPrice
            0.0000001 ether   // initialPrice
        );
        
        vm.stopPrank();
        
        assertTrue(tokenAddress != address(0));
        assertTrue(memePlatform.isRegisteredToken(tokenAddress));
        
        // 验证代币详情
        (BondingCurve.CurveParams memory params,
         BondingCurve.TokenInfo memory info,
         uint256 currentPrice,
         uint256 marketCap) = bondingCurve.getTokenDetails(tokenAddress);
        
        assertEq(params.targetSupply, 800000000 * 1e18);
        assertEq(params.targetPrice, 0.001 ether);
        assertEq(params.initialPrice, 0.0000001 ether);
        assertEq(params.currentSupply, 0);
        assertFalse(params.graduated);
        assertEq(info.creator, user1);
        assertEq(currentPrice, 0.0000001 ether); // 初始价格
        assertEq(marketCap, 0); // 初始市值为0
        
        MemePlatform.UserProfile memory profile = memePlatform.getUserProfile(user1);
        assertEq(profile.createdTokens, 1);
    }
    
    function testTokenBuyingBasic() public {
        // 创建代币
        vm.startPrank(user1);
        address tokenAddress = memePlatform.createMemeToken{value: CREATION_FEE}(
            "Test Token",
            "TEST",
            18,
            "https://example.com/token.png",
            "Token description",
            keccak256("test-salt"),
            1000000 * 1e18, // targetSupply
            0.001 ether,     // targetPrice
            0.0000001 ether  // initialPrice
        );
        vm.stopPrank();
        
        // 用户2购买代币
        vm.startPrank(user2);
        uint256 ethAmount = 1 ether;
        
        // 计算能购买多少代币
        uint256 expectedTokens = bondingCurve.calculateTokensForEthPrecise(tokenAddress, ethAmount);
        assertTrue(expectedTokens > 0);
        
        // 购买代币
        bondingCurve.buyTokens{value: ethAmount}(tokenAddress, 0);
        vm.stopPrank();
        
        // 验证代币余额
        MemeToken token = MemeToken(tokenAddress);
        assertEq(token.balanceOf(user2), expectedTokens);
        
        // 验证合约状态
        (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(tokenAddress);
        assertEq(params.currentSupply, expectedTokens);
        assertFalse(params.graduated); // 还未毕业
    }
    
    function testMarketCapGraduation() public {
        // 创建代币，使用较小的targetSupply来更容易达到市值毕业
        vm.startPrank(user1);
        address tokenAddress = memePlatform.createMemeToken{value: CREATION_FEE}(
            "Graduate Token",
            "GRAD",
            18,
            "https://example.com/grad.png",
            "Token that will graduate",
            keccak256("grad-salt"),
            100000 * 1e18,  // 更小的targetSupply
            0.001 ether,     // targetPrice
            0.00001 ether    // 较高的initialPrice来更快达到市值
        );
        vm.stopPrank();
        
        // 分批购买直到达到10 ETH市值
        uint256 totalEthSpent = 0;
        bool graduated = false;
        
        // 购买足够的代币达到10 ETH市值
        for (uint256 i = 0; i < 10 && !graduated; i++) {
            vm.startPrank(user2);
            
            uint256 ethAmount = 2 ether; // 每次购买2 ETH
            totalEthSpent += ethAmount;
            
            // 检查是否会触发毕业
            uint256 currentMarketCap = bondingCurve.getCurrentMarketCap(tokenAddress);
            bool shouldGraduate = bondingCurve.checkGraduationCondition(tokenAddress);
            
            if (currentMarketCap + (ethAmount * 8) / 10 >= TARGET_MARKET_CAP) { // 粗略估算
                // 预期将触发毕业事件
                vm.expectEmit(true, false, false, false);
                emit TokenGraduatedByMarketCap(tokenAddress, 0, 0, 0); // 具体值会在运行时确定
            }
            
            bondingCurve.buyTokens{value: ethAmount}(tokenAddress, 0);
            vm.stopPrank();
            
            // 检查是否已毕业
            (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(tokenAddress);
            if (params.graduated) {
                graduated = true;
                
                // 验证市值确实达到了目标
                uint256 finalMarketCap = bondingCurve.getCurrentMarketCap(tokenAddress);
                assertGe(finalMarketCap, TARGET_MARKET_CAP);
                
                console.log("Token graduated with market cap:", finalMarketCap);
                console.log("Total ETH spent:", totalEthSpent);
                break;
            }
        }
        
        assertTrue(graduated, "Token should have graduated by market cap");
    }
    
    function testGraduatedTokenCannotBeTradedFurther() public {
        // 创建并使代币毕业
        vm.startPrank(user1);
        address tokenAddress = memePlatform.createMemeToken{value: CREATION_FEE}(
            "Graduate Token",
            "GRAD",
            18,
            "https://example.com/grad.png",
            "Token that will graduate",
            keccak256("grad-salt-2"),
            50000 * 1e18,   // 很小的targetSupply
            0.001 ether,    // targetPrice
            0.00005 ether   // 高initialPrice
        );
        vm.stopPrank();
        
        // 大量购买触发毕业
        vm.startPrank(user2);
        bondingCurve.buyTokens{value: 15 ether}(tokenAddress, 0);
        vm.stopPrank();
        
        // 验证已毕业
        (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(tokenAddress);
        assertTrue(params.graduated);
        
        // 尝试继续购买应该失败
        vm.startPrank(user3);
        vm.expectRevert("Token has graduated");
        bondingCurve.buyTokens{value: 1 ether}(tokenAddress, 0);
        vm.stopPrank();
        
        // 尝试卖出也应该失败
        vm.startPrank(user2);
        MemeToken token = MemeToken(tokenAddress);
        uint256 balance = token.balanceOf(user2);
        if (balance > 0) {
            vm.expectRevert("Token has graduated");
            bondingCurve.sellTokens(tokenAddress, balance / 2, 0);
        }
        vm.stopPrank();
    }
    
    function testTokenSelling() public {
        // 创建代币
        vm.startPrank(user1);
        address tokenAddress = memePlatform.createMemeToken{value: CREATION_FEE}(
            "Sell Test Token",
            "SELL",
            18,
            "https://example.com/sell.png",
            "Token for selling test",
            keccak256("sell-salt"),
            1000000 * 1e18,
            0.001 ether,
            0.0000001 ether
        );
        vm.stopPrank();
        
        // 用户2购买代币
        vm.startPrank(user2);
        uint256 buyAmount = 1 ether;
        bondingCurve.buyTokens{value: buyAmount}(tokenAddress, 0);
        
        MemeToken token = MemeToken(tokenAddress);
        uint256 tokenBalance = token.balanceOf(user2);
        assertTrue(tokenBalance > 0);
        
        // 批准并卖出一半代币
        uint256 sellAmount = tokenBalance / 2;
        token.approve(address(bondingCurve), sellAmount);
        
        uint256 ethBefore = user2.balance;
        bondingCurve.sellTokens(tokenAddress, sellAmount, 0);
        uint256 ethAfter = user2.balance;
        
        // 验证收到ETH
        assertTrue(ethAfter > ethBefore);
        
        // 验证代币余额减少
        assertEq(token.balanceOf(user2), tokenBalance - sellAmount);
        vm.stopPrank();
    }
    
    function testPlatformFees() public {
        uint256 feeAmount = 1 ether;
        vm.deal(user1, feeAmount);
        
        vm.startPrank(user1);
        memePlatform.receivePlatformFees{value: feeAmount}();
        vm.stopPrank();
        
        assertEq(memePlatform.getAvailablePlatformFees(), feeAmount);
        
        uint256 withdrawAmount = 0.5 ether;
        memePlatform.withdrawPlatformFees(withdrawAmount);
        
        assertEq(memePlatform.getAvailablePlatformFees(), feeAmount - withdrawAmount);
    }
    
    function testPriceCalculation() public {
        // 创建代币
        vm.startPrank(user1);
        address tokenAddress = memePlatform.createMemeToken{value: CREATION_FEE}(
            "Price Test Token",
            "PRICE",
            18,
            "https://example.com/price.png",
            "Token for price testing",
            keccak256("price-salt"),
            1000000 * 1e18,
            0.001 ether,
            0.0000001 ether
        );
        vm.stopPrank();
        
        // 验证初始价格
        uint256 initialPrice = bondingCurve.getCurrentPrice(tokenAddress);
        assertEq(initialPrice, 0.0000001 ether);
        
        // 模拟购买后价格上涨
        vm.startPrank(user2);
        bondingCurve.buyTokens{value: 1 ether}(tokenAddress, 0);
        vm.stopPrank();
        
        uint256 newPrice = bondingCurve.getCurrentPrice(tokenAddress);
        assertTrue(newPrice > initialPrice, "Price should increase after purchase");
        
        // 验证市值计算
        (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(tokenAddress);
        uint256 expectedMarketCap = (newPrice * params.currentSupply) / 1e18;
        uint256 actualMarketCap = bondingCurve.getCurrentMarketCap(tokenAddress);
        assertEq(actualMarketCap, expectedMarketCap);
    }
    
    function testMultipleTokensIndependentGraduation() public {
        // 创建两个代币
        vm.startPrank(user1);
        address token1 = memePlatform.createMemeToken{value: CREATION_FEE}(
            "Token 1", "TOK1", 18, "img1", "desc1", keccak256("salt1"),
            100000 * 1e18, 0.001 ether, 0.00001 ether
        );
        address token2 = memePlatform.createMemeToken{value: CREATION_FEE}(
            "Token 2", "TOK2", 18, "img2", "desc2", keccak256("salt2"),
            200000 * 1e18, 0.001 ether, 0.000005 ether
        );
        vm.stopPrank();
        
        // 只让token1达到毕业条件
        vm.startPrank(user2);
        bondingCurve.buyTokens{value: 15 ether}(token1, 0);
        vm.stopPrank();
        
        // 验证token1已毕业，token2未毕业
        (BondingCurve.CurveParams memory params1,,,) = bondingCurve.getTokenDetails(token1);
        (BondingCurve.CurveParams memory params2,,,) = bondingCurve.getTokenDetails(token2);
        
        assertTrue(params1.graduated, "Token 1 should be graduated");
        assertFalse(params2.graduated, "Token 2 should not be graduated");
        
        // 验证token2仍可交易
        vm.startPrank(user3);
        bondingCurve.buyTokens{value: 1 ether}(token2, 0);
        vm.stopPrank();
    }
    
    receive() external payable {}
} 