const debugLogsEnabled = process.env.NEXT_PUBLIC_DEBUG_LOGS === 'true';

export function debugLog(...args: unknown[]) {
  if (debugLogsEnabled) {
    console.log(...args);
  }
}

export function debugWarn(...args: unknown[]) {
  if (debugLogsEnabled) {
    console.warn(...args);
  }
}

export function debugError(...args: unknown[]) {
  if (debugLogsEnabled) {
    console.error(...args);
  }
}
