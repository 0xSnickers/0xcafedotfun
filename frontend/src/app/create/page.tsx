'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { decodeEventLog, isAddressEqual } from 'viem';
import { Layout, Form, App } from 'antd';
import { RocketOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { simulateContract, writeContract } from 'wagmi/actions';
import { config } from '@/config/wagmi';
import { DEFAULT_CHAIN_ID, getContractAddresses } from '@/config/contracts';
import { MEME_FACTORY_ABI } from '@/config/abis';
import UnifiedHeader from '@/components/UnifiedHeader';
import { CreatePageSkeleton } from '@/components/feature/create/CreatePageStates';
import { CreateTokenForm } from '@/components/feature/create/CreateTokenForm';
import {
  getVanityFingerprint,
  type TokenForm,
  useVanityTokenGeneration,
} from '@/hooks/useVanityTokenGeneration';
import {
  isCafePrefixedAddress,
  predictMemeTokenAddress,
} from '@/lib/market/vanityTokenAddress';
import { debugError, debugLog, debugWarn } from '@/lib/debugLog';

const { Content } = Layout;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const subscribeToClientSnapshot = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const GENERIC_CREATE_ERROR_PATTERNS = [
  /^unknown error$/i,
  /^execution reverted$/i,
  /^the contract function ".+" reverted\.?$/i,
  /^an unknown rpc error occurred\.?$/i,
];

function normalizeErrorMessage(value: string) {
  return value.trim().split('\n\n')[0]?.trim() || value.trim();
}

function extractErrorMessages(error: unknown) {
  if (typeof error === 'string') {
    return [normalizeErrorMessage(error)];
  }

  const messages: string[] = [];
  const seen = new Set<object>();
  let current: unknown = error;

  while (current && typeof current === 'object' && !seen.has(current as object)) {
    seen.add(current as object);
    const record = current as Record<string, unknown>;

    for (const key of ['shortMessage', 'details', 'message'] as const) {
      const value = record[key];
      if (typeof value !== 'string') {
        continue;
      }

      const normalized = normalizeErrorMessage(value);
      if (normalized && !messages.includes(normalized)) {
        messages.push(normalized);
      }
    }

    current = record.cause;
  }

  return messages;
}

function getDisplayErrorMessage(error: unknown) {
  const messages = extractErrorMessages(error);
  const displayMessage = messages.find(
    (message) => !GENERIC_CREATE_ERROR_PATTERNS.some((pattern) => pattern.test(message)),
  ) ?? messages[0] ?? 'Creation failed. Check the form, balance, and contract status.';

  return {
    messages,
    displayMessage,
    combinedMessage: messages.join('\n'),
  };
}

function useMountedClient() {
  return useSyncExternalStore(subscribeToClientSnapshot, getClientSnapshot, getServerSnapshot);
}

function CreateTokenPageContent() {
  const router = useRouter();
  const { isConnected, address, chain } = useAccount();
  const [form] = Form.useForm<TokenForm>();
  const { message } = App.useApp();

  const mounted = useMountedClient();
  const [isCreating, setIsCreating] = useState(false);
  const [txHash, setTxHash] = useState<string>('');
  const [submittedPredictedTokenAddress, setSubmittedPredictedTokenAddress] = useState<string | null>(null);
  const creationFee = '0';

  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      const errorMsg = event.error?.message || event.message || '';
      const errorStack = event.error?.stack || '';
      const filename = event.filename || '';

      if (
        errorMsg.includes('chrome.runtime.sendMessage') ||
        errorMsg.includes('Extension ID') ||
        errorMsg.includes('runtime.sendMessage') ||
        errorStack.includes('inpage.js') ||
        filename.includes('inpage.js') ||
        errorMsg.includes('chrome-extension://') ||
        errorStack.includes('chrome-extension://') ||
        errorMsg.includes('Cannot access contents of') ||
        errorMsg.includes('extensions::') ||
        filename.includes('extension')
      ) {
        debugWarn('[Chrome Extension Error - Filtered]:', errorMsg);
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason?.message || event.reason || '';
      const stack = event.reason?.stack || '';

      if (
        reason.includes('chrome.runtime.sendMessage') ||
        reason.includes('Extension ID') ||
        reason.includes('runtime.sendMessage') ||
        stack.includes('inpage.js') ||
        reason.includes('chrome-extension://') ||
        stack.includes('chrome-extension://') ||
        reason.includes('Cannot access contents of') ||
        reason.includes('extensions::')
      ) {
        debugWarn('[Chrome Extension Promise Rejection - Filtered]:', reason);
        event.preventDefault();
        return false;
      }
    };

    window.addEventListener('error', handleGlobalError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);

    return () => {
      window.removeEventListener('error', handleGlobalError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection, true);
    };
  }, []);

  const contractAddresses = mounted ? getContractAddresses(chain?.id) : { MEME_FACTORY: null };
  const {
    data: txReceipt,
    isSuccess: txSuccess,
    isLoading: txLoading,
  } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}`,
  });

  const {
    isGeneratingVanity,
    vanityProgress,
    vanityResult,
    clearVanityResultIfChanged,
    resolveVanityResult,
  } = useVanityTokenGeneration({
    factoryAddress: contractAddresses.MEME_FACTORY,
    creatorAddress: address,
  });

  useEffect(() => {
    if (txLoading && txHash) {
      debugLog('Transaction submitted, waiting for confirmation:', txHash);
    }
  }, [txHash, txLoading]);

  useEffect(() => {
    if (!txSuccess || !txReceipt) {
      return;
    }

    debugLog('Token creation transaction confirmed:', txReceipt);
    const finishCreatingTimer = window.setTimeout(() => setIsCreating(false), 0);

    const clearPendingTransaction = () => {
      setTxHash('');
      setSubmittedPredictedTokenAddress(null);
    };

    if (txReceipt.logs && txReceipt.logs.length > 0) {
      debugLog('Inspecting TokenCreated logs:', txReceipt.logs);

      const tokenCreatedLog = txReceipt.logs.find(
        (log) => log.address.toLowerCase() === contractAddresses.MEME_FACTORY?.toLowerCase(),
      );

      if (tokenCreatedLog) {
        const decoded = decodeEventLog({
          abi: MEME_FACTORY_ABI,
          eventName: 'TokenCreated',
          data: tokenCreatedLog.data,
          topics: tokenCreatedLog.topics,
        });
        const tokenAddress = (decoded.args as unknown as { token: string }).token;

        if (tokenAddress && tokenAddress !== ZERO_ADDRESS) {
          if (
            submittedPredictedTokenAddress &&
            !isAddressEqual(
              tokenAddress as `0x${string}`,
              submittedPredictedTokenAddress as `0x${string}`,
            )
          ) {
            clearPendingTransaction();
            message.destroy('creating-token');
            message.error({
              content: 'Created token address did not match the predicted 0xcafe address. Please review this transaction before continuing.',
              duration: 8,
            });
            debugError('TokenCreated address mismatch', {
              txHash: txReceipt.transactionHash,
              predictedAddress: submittedPredictedTokenAddress,
              emittedAddress: tokenAddress,
            });
            return;
          }

          clearPendingTransaction();
          message.destroy('creating-token');
          message.success({
            content: 'Token created. Opening the market...',
            duration: 3,
          });

          debugLog('Opening token market:', tokenAddress);
          setTimeout(() => {
            router.push(`/trade/${tokenAddress}`);
          }, 1500);
          return;
        }
      }

      debugWarn('Unable to extract token address from transaction logs.');
      txReceipt.logs.forEach((log, index) => {
        debugLog(`Log ${index}:`, {
          address: log.address,
          topics: log.topics,
          data: log.data,
        });
      });
    }

    clearPendingTransaction();
    message.destroy('creating-token');
    message.success({
      content: 'Token created. Opening the market...',
      duration: 3,
    });

    setTimeout(() => {
      router.push('/trade');
    }, 1500);

    return () => window.clearTimeout(finishCreatingTimer);
  }, [
    txSuccess,
    txReceipt,
    router,
    message,
    contractAddresses.MEME_FACTORY,
    submittedPredictedTokenAddress,
  ]);

  useEffect(() => {
    if (txHash && !txLoading && !txSuccess) {
      const timer = setTimeout(() => {
        if (!txSuccess && txHash) {
          debugWarn('Token creation confirmation timed out:', txHash);
          message.destroy('creating-token');
          message.error({
            content: 'Transaction confirmation timed out. Check its status and retry.',
            duration: 5,
          });
          setIsCreating(false);
          setTxHash('');
          setSubmittedPredictedTokenAddress(null);
        }
      }, 60000);

      return () => clearTimeout(timer);
    }
  }, [txHash, txLoading, txSuccess, message]);

  const onFinish = async (values: TokenForm) => {
    if (!mounted || !isConnected || !address) {
      message.error('Connect your wallet first');
      return;
    }

    if (!chain || chain.id !== DEFAULT_CHAIN_ID) {
      message.error(`Switch your wallet to Chain ID ${DEFAULT_CHAIN_ID}`);
      return;
    }

    if (!contractAddresses.MEME_FACTORY) {
      message.error('Contract address is not configured');
      return;
    }

    setIsCreating(true);

    try {
      if (!values.name?.trim()) {
        message.error('Enter a token name');
        setIsCreating(false);
        return;
      }

      if (!values.symbol?.trim()) {
        message.error('Enter a token symbol');
        setIsCreating(false);
        return;
      }

      if (!values.description?.trim()) {
        message.error('Enter a token description');
        setIsCreating(false);
        return;
      }

      const fingerprint = getVanityFingerprint(values);
      let resolvedVanityResult = vanityResult;

      if (!resolvedVanityResult || resolvedVanityResult.fingerprint !== fingerprint) {
        message.open({
          content: 'Predicting your creator-bound token address...',
          duration: 0,
          key: 'creating-token',
          type: 'loading',
        });
        resolvedVanityResult = await resolveVanityResult(values);
      }

      const salt = resolvedVanityResult.salt;
      const localPrediction = predictMemeTokenAddress({
        factoryAddress: contractAddresses.MEME_FACTORY,
        creatorAddress: address,
        name: values.name,
        symbol: values.symbol,
        tokenImage: values.tokenImage || '',
        description: values.description,
      }, salt);

      if (!isCafePrefixedAddress(localPrediction) || localPrediction !== resolvedVanityResult.address) {
        throw new Error('Generated token address is not 0xcafe-prefixed. Please retry vanity mining.');
      }

      setSubmittedPredictedTokenAddress(resolvedVanityResult.address);
      debugLog('0xcafe-prefixed predicted token address:', resolvedVanityResult.address);

      message.open({
        content: '0xcafe address ready. Confirm the free creation transaction.',
        duration: 0,
        key: 'creating-token',
        type: 'loading',
      });

      const createArgs = [
        values.name,
        values.symbol,
        values.tokenImage || '',
        values.description,
        salt,
      ];
      const contractRequest = {
        address: contractAddresses.MEME_FACTORY as `0x${string}`,
        abi: MEME_FACTORY_ABI,
        functionName: 'createToken',
        args: createArgs,
        account: address,
        chainId: chain.id,
      } as const;

      await simulateContract(config, contractRequest);
      const hash = await writeContract(config, contractRequest);

      debugLog('Token creation transaction hash:', hash);
      setTxHash(hash);
      message.info({
        content: 'Transaction submitted. Waiting for confirmation...',
        duration: 0,
        key: 'creating-token',
      });
    } catch (error: unknown) {
      const { displayMessage, combinedMessage, messages } = getDisplayErrorMessage(error);
      debugError('Token creation failed:', {
        error,
        messages,
        displayMessage,
      });

      message.destroy('creating-token');

      if (combinedMessage.includes('User rejected') || combinedMessage.includes('user rejected')) {
        message.warning('Transaction cancelled');
      } else if (
        combinedMessage.includes('Requested resource not available') ||
        combinedMessage.includes('ResourceUnavailableRpcError') ||
        combinedMessage.includes('RPC endpoint returned too many errors')
      ) {
        message.error({
          content: 'The RPC cannot submit this transaction right now. Try again shortly.',
          duration: 6,
        });
      } else if (combinedMessage.includes('chain') || combinedMessage.includes('Chain')) {
        message.error({
          content: `Network mismatch. Connect your wallet to Chain ID ${DEFAULT_CHAIN_ID}.`,
          duration: 6,
        });
      } else {
        message.error({
          content: displayMessage,
          duration: 6,
        });
      }

      setIsCreating(false);
      setTxHash('');
      setSubmittedPredictedTokenAddress(null);
    }
  };

  if (!mounted) {
    return <CreatePageSkeleton />;
  }

  return (
    <Layout className="min-h-screen app-shell">
      <UnifiedHeader
        title="Create Meme Token"
        icon={<RocketOutlined className="text-white text-xl" />}
      />

      <Content className="create-page-shell">
        <div className="mx-auto max-w-6xl">
          <div className="create-page-heading">
            <div>
              <span>Create token</span>
            </div>
            <div className="create-heading-meta">
              <span><i /> Bonding Curve Live</span>
            </div>
          </div>

          <CreateTokenForm
            form={form}
            onFinish={onFinish}
            onValuesChange={(_, values) => {
              clearVanityResultIfChanged(values);
            }}
            disabled={isCreating || txLoading}
            isCreating={isCreating}
            isGeneratingVanity={isGeneratingVanity}
            txLoading={txLoading}
            vanityResult={vanityResult}
            vanityProgress={vanityProgress}
            creationFee={creationFee}
            isConnected={isConnected}
            networkName={chain?.name || 'Not connected'}
          />
        </div>
      </Content>
    </Layout>
  );
}

export default function CreateTokenPage() {
  return (
    <App>
      <CreateTokenPageContent />
    </App>
  );
}
