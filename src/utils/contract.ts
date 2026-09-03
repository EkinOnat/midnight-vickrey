import type {
  APIError,
  ConnectedAPI,
  InitialAPI,
} from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type {
  ContractState,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Transaction,
  type FinalizedTransaction,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  createProofProvider,
  type MidnightProviders,
  type UnboundTransaction,
} from '@midnight-ntwrk/midnight-js-types';
import {
  fromHex,
  parseCoinPublicKeyToHex,
  parseEncPublicKeyToHex,
  toHex as midnightToHex,
  validatePassword,
} from '@midnight-ntwrk/midnight-js-utils';

import * as Vickrey from '../../managed/vickrey/contract/index.js';
import type { BidOpening } from '../../managed/vickrey/contract/index.js';
import {
  emptyOpening,
  type VickreyPrivateState,
  witnesses,
} from '../witnesses';

export const TARGET_NETWORK = (
  import.meta.env.VITE_MIDNIGHT_NETWORK ?? 'preprod'
).trim();
export const CONTRACT_ADDRESS = (
  import.meta.env.VITE_CONTRACT_ADDRESS ?? ''
).trim();
export const PRIVATE_STATE_ID = 'vickreyPrivateState' as const;
export const isConfigured = CONTRACT_ADDRESS.length > 0;

const INDEXERS: Record<string, { http: string; ws: string }> = {
  preprod: {
    http: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    ws: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  },
  preview: {
    http: 'https://indexer.preview.midnight.network/api/v4/graphql',
    ws: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  },
};

const indexerFor = (network: string) =>
  INDEXERS[network] ?? INDEXERS.preprod;

export type VickreyCircuitId = 'submitBid' | 'settle';
export type VickreyProviders = MidnightProviders<
  VickreyCircuitId,
  typeof PRIVATE_STATE_ID,
  VickreyPrivateState
>;

export const compiledContract = CompiledContract.make<
  Vickrey.Contract<VickreyPrivateState>,
  VickreyPrivateState
>('vickrey', Vickrey.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets('vickrey'),
);

export interface PublicBidSlot {
  readonly slot: number;
  readonly commitment: string;
  readonly bidderTag: string;
}

export interface PublicAuction {
  readonly auctionId: string;
  readonly reservePrice: bigint;
  readonly phase: 'OPEN' | 'SETTLED';
  readonly bidCount: number;
  readonly bids: readonly PublicBidSlot[];
  readonly winnerTag: string | null;
  readonly clearingPrice: bigint | null;
  readonly resultDigest: string | null;
}

export function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(value: string, label = 'hex value'): Uint8Array {
  const hex = value.trim().replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`${label} must be exactly 64 hexadecimal characters.`);
  }
  return Uint8Array.from(
    { length: 32 },
    (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

export function shortHex(value: string | null, size = 8): string {
  if (!value) return '—';
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}

export function readAuction(state: ContractState): PublicAuction {
  const ledger = Vickrey.ledger(state.data);
  const bids = [...ledger.commitments]
    .map(([slot, commitment]) => ({
      slot: Number(slot),
      commitment: bytesToHex(commitment),
      bidderTag: bytesToHex(ledger.bidderTags.lookup(slot)),
    }))
    .sort((a, b) => a.slot - b.slot);
  const settled = ledger.phase === Vickrey.AuctionPhase.SETTLED;

  return {
    auctionId: bytesToHex(ledger.auctionId),
    reservePrice: ledger.reservePrice,
    phase: settled ? 'SETTLED' : 'OPEN',
    bidCount: Number(ledger.bidCount),
    bids,
    winnerTag: settled ? bytesToHex(ledger.winnerTag) : null,
    clearingPrice: settled ? ledger.clearingPrice : null,
    resultDigest: settled ? bytesToHex(ledger.resultDigest) : null,
  };
}

export function emptyBook(): BidOpening[] {
  return [emptyOpening(), emptyOpening(), emptyOpening(), emptyOpening()];
}

export function privateState(
  secretKey: Uint8Array,
  bid: BidOpening = emptyOpening(),
  settlementBook: BidOpening[] = emptyBook(),
): VickreyPrivateState {
  return { secretKey, bid, settlementBook };
}

function randomBytes(): Uint8Array {
  const value = new Uint8Array(32);
  crypto.getRandomValues(value);
  return value;
}

const BIDDER_SECRET_KEY = 'vickrey.bidder-secret.v1';
const STORAGE_PASSWORD_KEY = 'vickrey.private-store-password.v1';

export function getBidderSecret(): Uint8Array {
  const stored = localStorage.getItem(BIDDER_SECRET_KEY);
  if (stored && /^[0-9a-f]{64}$/.test(stored)) return hexToBytes(stored);
  const generated = randomBytes();
  localStorage.setItem(BIDDER_SECRET_KEY, bytesToHex(generated));
  return generated;
}

export function newBidSalt(): Uint8Array {
  return randomBytes();
}

function storagePassword(): string {
  const existing = localStorage.getItem(STORAGE_PASSWORD_KEY);
  if (existing) return existing;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `Vk-${bytesToHex(randomBytes())}!A7`;
    try {
      validatePassword(candidate);
      localStorage.setItem(STORAGE_PASSWORD_KEY, candidate);
      return candidate;
    } catch {
      // Extremely unlikely policy collision; generate again.
    }
  }
  throw new Error('Could not create a valid local private-state password.');
}

export interface DiscoveredWallet {
  readonly id: string;
  readonly api: InitialAPI;
  readonly name: string;
  readonly icon: string;
}

export function discoverWallets(): DiscoveredWallet[] {
  if (typeof window === 'undefined') return [];
  const injected = (
    window as unknown as { midnight?: Record<string, InitialAPI> }
  ).midnight;
  if (!injected) return [];
  return Object.entries(injected)
    .filter(([, api]) => typeof api?.connect === 'function')
    .map(([id, api]) => ({
      id,
      api,
      name: typeof api.name === 'string' ? api.name : id,
      icon: typeof api.icon === 'string' ? api.icon : '',
    }));
}

export async function waitForWallets(
  timeoutMs = 2500,
): Promise<DiscoveredWallet[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const wallets = discoverWallets();
    if (wallets.length > 0 || Date.now() >= deadline) return wallets;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function connectorError(error: unknown): APIError | null {
  if (
    error &&
    typeof error === 'object' &&
    (error as { type?: unknown }).type === 'DAppConnectorAPIError'
  ) {
    return error as APIError;
  }
  return null;
}

export function errorMessage(
  error: unknown,
  fallback = 'The operation did not complete.',
): string {
  const apiError = connectorError(error);
  if (apiError?.code === 'Rejected' || apiError?.code === 'PermissionRejected') {
    return 'The request was rejected in the wallet.';
  }
  if (apiError?.reason) return apiError.reason;
  let current = error;
  let message = '';
  for (let hop = 0; current && hop < 8; hop += 1) {
    if (current instanceof Error && current.message && current.message !== 'Error') {
      message = current.message;
    }
    current = (current as { cause?: unknown })?.cause;
  }
  return message || fallback;
}

export async function connectWallet(
  wallet: DiscoveredWallet,
): Promise<{ api: ConnectedAPI; networkId: string }> {
  const api = await wallet.api.connect(TARGET_NETWORK);
  const status = await api.getConnectionStatus();
  if (status.status !== 'connected') throw new Error('The wallet disconnected.');
  if (status.networkId !== TARGET_NETWORK) {
    throw new Error(
      `Switch ${wallet.name} to ${TARGET_NETWORK}; it reported ${status.networkId}.`,
    );
  }
  await api
    .hintUsage([
      'getConfiguration',
      'getShieldedAddresses',
      'getUnshieldedAddress',
      'getProvingProvider',
      'balanceUnsealedTransaction',
      'submitTransaction',
    ])
    .catch(() => undefined);
  return { api, networkId: status.networkId };
}

export type CallStage =
  | 'Running the private circuit'
  | 'Generating the zero-knowledge proof'
  | 'Wallet paying the fee'
  | 'Submitting to Midnight'
  | 'Waiting for confirmation';

type StageListener = (stage: CallStage) => void;
const stageListeners = new Set<StageListener>();

export function onCallStage(listener: StageListener): () => void {
  stageListeners.add(listener);
  return () => stageListeners.delete(listener);
}

function emitStage(stage: CallStage): void {
  stageListeners.forEach((listener) => listener(stage));
}

function encodeTransaction(
  transaction: UnboundTransaction | FinalizedTransaction,
): string {
  return midnightToHex(transaction.serialize());
}

function decodeTransaction(encoded: string): FinalizedTransaction {
  return Transaction.deserialize(
    'signature',
    'proof',
    'binding',
    fromHex(encoded.startsWith('0x') ? encoded.slice(2) : encoded),
  ) as FinalizedTransaction;
}

export function publicDataProviderFor(network = TARGET_NETWORK) {
  const indexer = indexerFor(network);
  setNetworkId(network);
  return indexerPublicDataProvider(
    indexer.http,
    indexer.ws,
    WebSocket as unknown as Parameters<typeof indexerPublicDataProvider>[2],
  );
}

export async function buildProviders(
  api: ConnectedAPI,
  networkId: string,
): Promise<{ providers: VickreyProviders; address: string }> {
  setNetworkId(networkId);
  const [configuration, shielded, unshielded] = await Promise.all([
    api.getConfiguration().catch(() => null),
    api.getShieldedAddresses(),
    api.getUnshieldedAddress(),
  ]);
  const fallback = indexerFor(networkId);
  const indexerUri = configuration?.indexerUri || fallback.http;
  const indexerWsUri = configuration?.indexerWsUri || fallback.ws;
  const zkConfigProvider = new FetchZkConfigProvider<VickreyCircuitId>(
    `${window.location.origin}/managed/vickrey`,
    globalThis.fetch.bind(globalThis),
  );
  const walletProver = await api.getProvingProvider(
    zkConfigProvider.asKeyMaterialProvider(),
  );
  const baseProofProvider = createProofProvider(walletProver);
  const proofProvider = {
    proveTx: (...args: Parameters<typeof baseProofProvider.proveTx>) => {
      emitStage('Generating the zero-knowledge proof');
      return baseProofProvider.proveTx(...args);
    },
  };
  const coinPublicKey = parseCoinPublicKeyToHex(
    shielded.shieldedCoinPublicKey,
    networkId,
  );
  const encryptionPublicKey = parseEncPublicKeyToHex(
    shielded.shieldedEncryptionPublicKey,
    networkId,
  );
  const walletProvider = {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,
    async balanceTx(transaction: UnboundTransaction): Promise<FinalizedTransaction> {
      emitStage('Wallet paying the fee');
      const { tx } = await api.balanceUnsealedTransaction(
        encodeTransaction(transaction),
      );
      return decodeTransaction(tx);
    },
  };
  const midnightProvider = {
    async submitTx(transaction: FinalizedTransaction): Promise<string> {
      emitStage('Submitting to Midnight');
      await api.submitTransaction(encodeTransaction(transaction));
      emitStage('Waiting for confirmation');
      const [identifier] = transaction.identifiers();
      return identifier ?? transaction.transactionHash();
    },
  };
  const privateStateProvider = levelPrivateStateProvider<
    typeof PRIVATE_STATE_ID,
    VickreyPrivateState
  >({
    privateStateStoreName: 'vickrey-state',
    accountId: unshielded.unshieldedAddress,
    privateStoragePasswordProvider: storagePassword,
  });
  privateStateProvider.setContractAddress(CONTRACT_ADDRESS);

  return {
    providers: {
      privateStateProvider,
      publicDataProvider: indexerPublicDataProvider(
        indexerUri,
        indexerWsUri,
        WebSocket as unknown as Parameters<typeof indexerPublicDataProvider>[2],
      ),
      zkConfigProvider,
      proofProvider,
      walletProvider,
      midnightProvider,
    },
    address: unshielded.unshieldedAddress,
  };
}

export type { BidOpening, VickreyPrivateState };
