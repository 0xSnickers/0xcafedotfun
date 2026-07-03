import { Request, Response, Router } from 'express'
import { isAddress } from 'viem'
import { postgresCreatorFeeStore } from '../services/storage/postgresCreatorFeeStore'
import { viemClient } from '../clients/viemClient'

const router = Router()

function requiredAddress(name: 'FEE_VAULT_ADDRESS'): `0x${string}` {
  const value = process.env[name]
  if (!value || !isAddress(value)) {
    throw new Error(`${name} is required`)
  }
  return value
}

router.get('/:creatorAddress/fees', async (req: Request, res: Response): Promise<void> => {
  try {
    const creatorAddress = req.params.creatorAddress
    if (!isAddress(creatorAddress)) {
      res.status(400).json({ error: 'Invalid creator address' })
      return
    }
    if (!postgresCreatorFeeStore.enabled) {
      throw new Error('DATABASE_URL is required for creator fee reads')
    }

    const feeVault = requiredAddress('FEE_VAULT_ADDRESS')
    const response = await postgresCreatorFeeStore.getCreatorFees(
      viemClient.chain.id,
      creatorAddress,
      feeVault,
    )

    res.json(response)
  } catch (error) {
    console.error('Failed to query creator fees:', error)
    res.status(500).json({ error: 'Failed to query creator fees' })
  }
})

export default router
