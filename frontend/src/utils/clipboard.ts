/**
 * 复制文本到剪贴板的通用函数
 * 支持现代浏览器的 Clipboard API 和降级方案
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // 检查浏览器是否支持 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // 降级方案：使用传统的复制方法
      return fallbackCopyTextToClipboard(text);
    }
  } catch (err) {
    console.error('复制到剪贴板失败:', err);
    // 如果现代API失败，尝试降级方案
    return fallbackCopyTextToClipboard(text);
  }
}

/**
 * 降级方案：使用传统的 document.execCommand('copy') 方法
 */
function fallbackCopyTextToClipboard(text: string): boolean {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // 设置样式使其不可见
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    textArea.remove();
    
    return successful;
  } catch (err) {
    console.error('降级复制方案失败:', err);
    return false;
  }
}

/**
 * 检查浏览器是否支持剪贴板功能
 */
export function isClipboardSupported(): boolean {
  return !!(navigator.clipboard || document.queryCommandSupported?.('copy'));
}

/**
 * 格式化地址并复制（常用于区块链地址）
 */
export async function copyAddress(address: string, lowercase: boolean = true): Promise<boolean> {
  const formattedAddress = lowercase ? address.toLowerCase() : address;
  return copyToClipboard(formattedAddress);
} 