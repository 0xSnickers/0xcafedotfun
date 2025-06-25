import { redis } from '../clients/redisClient'


// 缓存用户签名（NFT Owner 离线签名派发白名单）
export async function cacheUserPermit(address: string, data: string) {
    // EX=表示设置过期时间的单位为 秒（即 "EXpire"）
    // (60*60*24) 1day = 键的过期时间，单位为秒
    await redis.set(`userPermit:${address}`, data, 'EX', (60*60*24))
}

export async function getCachedUserPermit(address: string): Promise<string | null> {
  return await redis.get(`userPermit:${address}`)
}

export async function delCachedUserPermit(address: string): Promise<number | null> {
  return await redis.del(`userPermit:${address}`)
}