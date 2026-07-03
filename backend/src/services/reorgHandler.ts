export interface CanonicalBlockFact {
  blockNumber: bigint
  blockHash: string
}

export interface CanonicalLogFact {
  blockNumber: bigint
  blockHash: string
  transactionHash: string
  transactionIndex: number
  logIndex: number
  contractAddress?: string
}

export interface ReorgFacts {
  blocks: CanonicalBlockFact[]
  logs: CanonicalLogFact[]
}

export interface ReorgDetection {
  affectedFromBlock: bigint
  reason:
    | 'block_missing'
    | 'block_hash_changed'
    | 'log_missing'
    | 'log_changed'
    | 'log_added'
}

function sortUniqueBlockNumbers(values: bigint[]): bigint[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function blockKey(blockNumber: bigint): string {
  return blockNumber.toString()
}

function logPositionKey(log: {
  blockNumber: bigint
  transactionIndex: number
  logIndex: number
  contractAddress?: string
}): string {
  const contract = log.contractAddress?.toLowerCase() ?? '*'
  return `${log.blockNumber}:${log.transactionIndex}:${log.logIndex}:${contract}`
}

export function detectReorg(
  stored: ReorgFacts,
  fetched: ReorgFacts,
): ReorgDetection | null {
  const storedBlocksByNumber = new Map(
    stored.blocks.map((block) => [blockKey(block.blockNumber), block]),
  )
  const fetchedBlocksByNumber = new Map(
    fetched.blocks.map((block) => [blockKey(block.blockNumber), block]),
  )

  const blockNumbers = sortUniqueBlockNumbers([
    ...stored.blocks.map((block) => block.blockNumber),
    ...fetched.blocks.map((block) => block.blockNumber),
  ])

  for (const blockNumber of blockNumbers) {
    const storedBlock = storedBlocksByNumber.get(blockKey(blockNumber))
    const fetchedBlock = fetchedBlocksByNumber.get(blockKey(blockNumber))

    if (storedBlock && !fetchedBlock) {
      return { affectedFromBlock: blockNumber, reason: 'block_missing' }
    }
    if (storedBlock && fetchedBlock && storedBlock.blockHash !== fetchedBlock.blockHash) {
      return { affectedFromBlock: blockNumber, reason: 'block_hash_changed' }
    }
  }

  const storedLogsByPosition = new Map(
    stored.logs.map((log) => [logPositionKey(log), log]),
  )
  const fetchedLogsByPosition = new Map(
    fetched.logs.map((log) => [logPositionKey(log), log]),
  )

  const logPositions = [...new Set([
    ...stored.logs.map(logPositionKey),
    ...fetched.logs.map(logPositionKey),
  ])].sort((left, right) => {
    const [leftBlock, leftTx, leftLog] = left.split(':')
    const [rightBlock, rightTx, rightLog] = right.split(':')
    return Number(leftBlock) - Number(rightBlock) ||
      Number(leftTx) - Number(rightTx) ||
      Number(leftLog) - Number(rightLog) ||
      left.localeCompare(right)
  })

  for (const position of logPositions) {
    const storedLog = storedLogsByPosition.get(position)
    const fetchedLog = fetchedLogsByPosition.get(position)

    if (storedLog && !fetchedLog) {
      return { affectedFromBlock: storedLog.blockNumber, reason: 'log_missing' }
    }
    if (!storedLog && fetchedLog) {
      return { affectedFromBlock: fetchedLog.blockNumber, reason: 'log_added' }
    }
    if (
      storedLog &&
      fetchedLog &&
      (storedLog.blockHash !== fetchedLog.blockHash ||
        storedLog.transactionHash !== fetchedLog.transactionHash)
    ) {
      return { affectedFromBlock: storedLog.blockNumber, reason: 'log_changed' }
    }
  }

  return null
}
