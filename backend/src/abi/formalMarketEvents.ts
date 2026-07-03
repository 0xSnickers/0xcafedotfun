import { parseAbiItem } from 'viem'

export const tokenCreatedEvent = parseAbiItem(
  'event TokenCreated(address indexed token, address indexed market, address indexed creator, bytes32 userSalt, bytes32 effectiveSalt, uint256 configVersion, string name, string symbol, string tokenImage, string description)',
)

export const tokenBoughtEvent = parseAbiItem(
  'event TokenBought(address indexed token, address indexed market, address indexed buyer, uint256 grossEthIn, uint256 reserveEthIn, uint256 platformFee, uint256 creatorFee, uint256 tokenAmountOut, uint256 executionPriceX18, uint256 markPriceX18, uint256 newCurveSupply, uint256 newReserveBalance)',
)

export const tokenSoldEvent = parseAbiItem(
  'event TokenSold(address indexed token, address indexed market, address indexed seller, uint256 tokenAmountIn, uint256 grossEthOut, uint256 sellerEthOut, uint256 platformFee, uint256 creatorFee, uint256 executionPriceX18, uint256 markPriceX18, uint256 newCurveSupply, uint256 newReserveBalance)',
)

export const graduationPreparedEvent = parseAbiItem(
  'event GraduationPrepared(address indexed token, address indexed market, uint256 liquidityTokenDesired, uint256 liquidityEthDesired, uint256 finalCurveSupply, uint256 finalMarkPriceX18)',
)

export const tokenGraduatedEvent = parseAbiItem(
  'event TokenGraduated(address indexed token, address indexed market, address indexed pair, uint256 tokenUsed, uint256 ethUsed, uint256 liquidityLocked, uint256 tokenResidual, uint256 ethResidual)',
)

export const graduationRegisteredEvent = parseAbiItem(
  'event GraduationRegistered(address indexed token, address indexed market, uint256 tokenAmount, uint256 ethAmount)',
)

export const liquidityAddedEvent = parseAbiItem(
  'event LiquidityAdded(address indexed token, address indexed market, address indexed pair, uint256 tokenUsed, uint256 ethUsed, uint256 liquidityLocked, uint256 tokenResidual, uint256 ethResidual)',
)

export const uniswapV2SwapEvent = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
)

export const uniswapV2MintEvent = parseAbiItem(
  'event Mint(address indexed sender, uint256 amount0, uint256 amount1)',
)

export const uniswapV2BurnEvent = parseAbiItem(
  'event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)',
)

export const uniswapV2SyncEvent = parseAbiItem(
  'event Sync(uint112 reserve0, uint112 reserve1)',
)

export const formalTradeEvents = [tokenBoughtEvent, tokenSoldEvent] as const
export const formalMarketLifecycleEvents = [
  graduationPreparedEvent,
  tokenGraduatedEvent,
] as const
export const formalLiquidityEvents = [
  graduationRegisteredEvent,
  liquidityAddedEvent,
] as const
export const uniswapV2PairEvents = [
  uniswapV2SwapEvent,
  uniswapV2MintEvent,
  uniswapV2BurnEvent,
  uniswapV2SyncEvent,
] as const
