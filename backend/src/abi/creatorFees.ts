import { parseAbi, parseAbiItem } from 'viem'

export const feeVaultCreatorAbi = parseAbi([
  'function creatorFeesClaimable(address creator) view returns (uint256)',
  'function totalCreatorFeesAccrued(address creator) view returns (uint256)',
  'function totalCreatorFeesClaimed(address creator) view returns (uint256)',
  'function tokenCreatorFeesAccrued(address token) view returns (uint256)',
])

export const memeFactoryCreatorAbi = parseAbi([
  'function getCreatorTokens(address creator) view returns (address[])',
  'function getMemeTokenInfo(address tokenAddress) view returns ((address tokenAddress,string name,string symbol,address creator,uint256 createdAt,string tokenImage,string description))',
])

export const feesAccruedEvent = parseAbiItem(
  'event FeesAccrued(address indexed token, address indexed market, address indexed creator, uint256 platformFee, uint256 creatorFee)',
)

export const creatorFeesClaimedEvent = parseAbiItem(
  'event CreatorFeesClaimed(address indexed creator, address indexed recipient, uint256 amount)',
)
