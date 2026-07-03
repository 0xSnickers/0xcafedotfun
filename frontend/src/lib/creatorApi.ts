export interface CreatorTokenEarning {
  tokenAddress: string;
  name: string;
  symbol: string;
  tokenImage: string;
  accrued: string;
}

export interface CreatorClaim {
  recipient: string;
  amount: string;
  transactionHash: string;
  blockNumber: string;
  timestamp: number | null;
}

export interface CreatorFees {
  creatorAddress: string;
  feeVaultAddress: string;
  claimable: string;
  totalAccrued: string;
  totalClaimed: string;
  tokenEarnings: CreatorTokenEarning[];
  claims: CreatorClaim[];
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL?.replace(/\/$/, '') ||
  'http://localhost:9000';

export async function getCreatorFees(
  creatorAddress: string,
  signal?: AbortSignal,
): Promise<CreatorFees> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/creator/${creatorAddress}/fees`,
      { signal, cache: 'no-store' },
    );
  } catch {
    throw new Error('Please try again in a moment.');
  }

  if (!response.ok) {
    throw new Error(`Creator fees request failed: ${response.status}`);
  }

  return await response.json() as CreatorFees;
}
