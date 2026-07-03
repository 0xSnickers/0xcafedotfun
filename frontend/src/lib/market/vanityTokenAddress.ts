import {
  concatHex,
  encodeAbiParameters,
  getCreate2Address,
  keccak256,
  parseAbiParameters,
  toHex,
  type Hex,
} from 'viem';
import { MEME_TOKEN_CREATION_BYTECODE } from '@/generated/memeTokenBytecode';

const EFFECTIVE_SALT_PARAMS = parseAbiParameters('address creator, bytes32 userSalt');
const MEME_TOKEN_CONSTRUCTOR_PARAMS = parseAbiParameters(
  'string name, string symbol, address creator, address factory, string tokenImage, string description',
);

export interface VanityTokenParams {
  factoryAddress: string;
  creatorAddress: string;
  name: string;
  symbol: string;
  tokenImage: string;
  description: string;
}

export function createRandomUserSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function computeEffectiveSalt(creatorAddress: string, userSalt: Hex): Hex {
  return keccak256(encodeAbiParameters(EFFECTIVE_SALT_PARAMS, [creatorAddress as Hex, userSalt]));
}

export function computeMemeTokenInitCodeHash(params: VanityTokenParams): Hex {
  const constructorArgs = encodeAbiParameters(
    MEME_TOKEN_CONSTRUCTOR_PARAMS,
    [
      params.name,
      params.symbol,
      params.creatorAddress as Hex,
      params.factoryAddress as Hex,
      params.tokenImage,
      params.description,
    ],
  );

  return keccak256(concatHex([
    MEME_TOKEN_CREATION_BYTECODE,
    constructorArgs,
  ]));
}

export function predictMemeTokenAddress(
  params: VanityTokenParams,
  userSalt: Hex,
  initCodeHash = computeMemeTokenInitCodeHash(params),
): string {
  return getCreate2Address({
    from: params.factoryAddress as Hex,
    salt: computeEffectiveSalt(params.creatorAddress, userSalt),
    bytecodeHash: initCodeHash,
  }).toLowerCase();
}

export function isCafePrefixedAddress(address: string): boolean {
  return address.toLowerCase().startsWith('0xcafe');
}
