import { Request, Response, Router } from 'express'
import { isAddress } from 'viem'
import { postgresEnabled } from '../clients/postgresClient'
import { viemClient } from '../clients/viemClient'
import { postgresMarketStore } from '../services/storage/postgresMarketStore'

const router = Router()
const MAX_RANGE_SECONDS = 90 * 24 * 60 * 60

function parseLimit(value: unknown): number | null {
  if (value === undefined) {
    return null
  }
  if (typeof value !== 'string') {
    return null
  }
  const limit = Number(value)
  return Number.isInteger(limit) && limit > 0 ? limit : null
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp = Number(value)
  return Number.isInteger(timestamp) && timestamp >= 0 ? timestamp : null
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseLimit(req.query.limit) ?? 100
    if (req.query.limit !== undefined && parseLimit(req.query.limit) === null) {
      res.status(400).json({ error: 'Invalid limit' })
      return
    }
    if (!postgresEnabled) {
      throw new Error('DATABASE_URL is required for PostgreSQL pool reads')
    }

    const response = await postgresMarketStore.getPools(
      viemClient.chain.id,
      Math.floor(Date.now() / 1000),
      limit,
    )
    res.json(response)
  } catch (error) {
    console.error('Failed to query pools:', error)
    res.status(500).json({ error: 'Failed to query pools' })
  }
})

router.get('/:tokenAddress/reserves', async (req: Request, res: Response): Promise<void> => {
  try {
    const { tokenAddress } = req.params
    if (!isAddress(tokenAddress)) {
      res.status(400).json({ error: 'Invalid token address' })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const from = req.query.from === undefined
      ? now - 24 * 60 * 60
      : parseTimestamp(req.query.from)
    const to = req.query.to === undefined ? now : parseTimestamp(req.query.to)
    const limit = parseLimit(req.query.limit) ?? 500

    if (from === null || to === null || from > to) {
      res.status(400).json({ error: 'Invalid time range' })
      return
    }
    if (to - from > MAX_RANGE_SECONDS) {
      res.status(400).json({ error: 'Range too large' })
      return
    }
    if (req.query.limit !== undefined && parseLimit(req.query.limit) === null) {
      res.status(400).json({ error: 'Invalid limit' })
      return
    }
    if (!postgresEnabled) {
      throw new Error('DATABASE_URL is required for PostgreSQL pool reserve reads')
    }

    const response = await postgresMarketStore.getPoolReserveSnapshots(
      viemClient.chain.id,
      tokenAddress,
      from,
      to,
      limit,
    )
    res.json(response)
  } catch (error) {
    console.error('Failed to query pool reserves:', error)
    res.status(500).json({ error: 'Failed to query pool reserves' })
  }
})

export default router
