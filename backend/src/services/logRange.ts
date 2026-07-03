export function uniqueEventBlockNumbers(
  logs: Array<{ blockNumber: bigint | null }>,
): bigint[] {
  return [
    ...new Set(
      logs.map((log) => {
        if (log.blockNumber === null) {
          throw new Error('Trade event is missing block number')
        }
        return log.blockNumber
      }),
    ),
  ]
}

function collectErrorText(error: unknown, seen = new Set<unknown>()): string {
  if (error === null || error === undefined || seen.has(error)) {
    return ''
  }
  seen.add(error)

  if (typeof error === 'string') {
    return error
  }
  if (typeof error !== 'object') {
    return String(error)
  }

  const record = error as Record<string, unknown>
  return ['message', 'details', 'shortMessage', 'cause']
    .map((key) => collectErrorText(record[key], seen))
    .filter(Boolean)
    .join('\n')
}

export function getRpcLogRangeLimit(error: unknown): bigint | null {
  const match = collectErrorText(error).match(
    /eth_getLogs requests with up to a (\d+) block range/i,
  )
  if (!match) {
    return null
  }

  const limit = BigInt(match[1])
  return limit > 0n ? limit : null
}

export async function getLogsWithProviderLimit<T>(
  fetchLogs: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<T[]> {
  try {
    return await fetchLogs(fromBlock, toBlock)
  } catch (error) {
    const limit = getRpcLogRangeLimit(error)
    const requestedBlocks = toBlock - fromBlock + 1n
    if (limit === null || requestedBlocks <= limit) {
      throw error
    }

    console.warn(
      `RPC limits eth_getLogs to ${limit} blocks; splitting range ${fromBlock}-${toBlock}`,
    )
    const logs: T[] = []
    for (let start = fromBlock; start <= toBlock; start += limit) {
      const end = start + limit - 1n > toBlock ? toBlock : start + limit - 1n
      logs.push(...(await fetchLogs(start, end)))
    }
    return logs
  }
}
