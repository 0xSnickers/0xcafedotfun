export async function runBestEffortShadowRead(
  readAndCompare: () => Promise<void>,
): Promise<void> {
  try {
    await readAndCompare()
  } catch (error) {
    console.warn('Candle shadow read failed; serving primary response:', error)
  }
}
