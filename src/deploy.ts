/**
 * One-shot Vickrey deployment runner for Midnight Preprod.
 *
 * Usage: npm run deploy:preprod -- 100
 * The positional value is the public reserve price. On first run this script
 * creates a headless Preprod wallet, persists its seed locally, prints the
 * faucet address and waits for funding. The contract admin secret required by
 * the settlement form remains only in the ignored local state file.
 */
import { Buffer } from 'node:buffer';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  DustWallet,
  HDWallet,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  Roles,
  ShieldedWallet,
  UnshieldedWallet,
  WalletFacade,
  WalletEntrySchema,
  createKeystore,
  mergeWalletEntries,
} from '@midnight-ntwrk/wallet-sdk';

import * as Vickrey from '../managed/vickrey/contract/index.js';
import {
  emptyOpening,
  witnesses,
  type VickreyPrivateState,
} from './witnesses.js';

// The wallet SDK expects a global WebSocket implementation when run in Node.
// @ts-expect-error Node's ws implementation is compatible with the SDK.
globalThis.WebSocket = WebSocket;

const NETWORK = 'preprod';
const PRIVATE_STATE_ID = 'vickreyPrivateState';
const STATE_FILE = path.resolve('.midnight-state.json');
const ZK_PATH = path.resolve('managed', 'vickrey');
const SYNC_STALL_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_SYNC_ATTEMPTS = 3;
const CONFIG = {
  indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  proofServer: 'http://127.0.0.1:6300',
  faucet: 'https://midnight-tmnight-preprod.nethermind.dev',
};

function emptyBook(): Vickrey.BidOpening[] {
  return [emptyOpening(), emptyOpening(), emptyOpening(), emptyOpening()];
}

function privateState(
  secretKey: Uint8Array,
  bid: Vickrey.BidOpening = emptyOpening(),
  settlementBook: Vickrey.BidOpening[] = emptyBook(),
): VickreyPrivateState {
  return { secretKey, bid, settlementBook };
}

interface DeploymentState {
  readonly version: 1;
  readonly network: typeof NETWORK;
  readonly seed: string;
  readonly adminSecret: string;
  readonly auctionId: string;
  readonly reservePrice: string;
  readonly contractAddress?: string;
  readonly deployerAddress?: string;
  readonly deployedAt?: string;
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function parseReserve(argv: string[]): bigint {
  const flagIndex = argv.findIndex((arg) => arg === '--reserve');
  const raw =
    flagIndex >= 0
      ? argv[flagIndex + 1]
      : argv.slice(2).find((arg) => /^\d+$/.test(arg));
  if (!raw) throw new Error('Reserve missing. Example: npm run deploy:preprod -- 100');
  const reserve = BigInt(raw);
  if (reserve <= 0n || reserve > (1n << 64n) - 1n) {
    throw new Error('Reserve must be an integer from 1 through 2^64 - 1.');
  }
  return reserve;
}

function loadDeploymentState(): DeploymentState | null {
  if (!fs.existsSync(STATE_FILE)) return null;
  const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as DeploymentState;
  if (parsed.version !== 1 || parsed.network !== NETWORK) {
    throw new Error('The existing .midnight-state.json is not a Vickrey Preprod state file.');
  }
  return parsed;
}

function saveDeploymentState(state: DeploymentState): void {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function initialDeploymentState(reservePrice: bigint): DeploymentState {
  const old = loadDeploymentState();
  if (old?.contractAddress) {
    throw new Error(`A deployment is already recorded at ${old.contractAddress}.`);
  }
  if (old && old.reservePrice !== reservePrice.toString()) {
    throw new Error(
      `This wallet state was prepared with reserve ${old.reservePrice}. Re-run with that reserve.`,
    );
  }

  const seed =
    process.env.MIDNIGHT_WALLET_SEED?.trim() ||
    old?.seed ||
    crypto.randomBytes(32).toString('hex');
  if (!/^[0-9a-fA-F]{64}$/.test(seed)) {
    throw new Error('MIDNIGHT_WALLET_SEED must be a 64-character hex seed.');
  }
  const adminSecret = hex(
    crypto.createHash('sha256').update(`vickrey:admin-secret:v1:${seed}`).digest(),
  );
  const state: DeploymentState = {
    version: 1,
    network: NETWORK,
    seed: seed.toLowerCase(),
    adminSecret,
    auctionId: old?.auctionId || crypto.randomBytes(32).toString('hex'),
    reservePrice: reservePrice.toString(),
  };
  saveDeploymentState(state);
  return state;
}

function deriveWalletKeys(seed: string) {
  const root = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (root.type !== 'seedOk') throw new Error('Wallet seed was rejected.');
  const derived = root.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  root.hdWallet.clear();
  if (derived.type !== 'keysDerived') throw new Error('Wallet key derivation failed.');
  return derived.keys;
}

async function createWallet(seed: string) {
  setNetworkId(NETWORK);
  const keys = deriveWalletKeys(seed);
  const networkId = getNetworkId();
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);
  const wallet = await WalletFacade.init({
    configuration: {
      networkId,
      indexerClientConnection: {
        indexerHttpUrl: CONFIG.indexer,
        indexerWsUrl: CONFIG.indexerWS,
      },
      provingServerUrl: new URL(CONFIG.proofServer),
      relayURL: new URL(CONFIG.node.replace(/^http/, 'ws')),
      txHistoryStorage: new InMemoryTransactionHistoryStorage(
        WalletEntrySchema,
        mergeWalletEntries,
      ),
      costParameters: {
        additionalFeeOverhead: 300_000_000_000_000n,
        feeBlocksMargin: 5,
      },
    },
    shielded: async (configuration) =>
      ShieldedWallet(configuration).startWithSecretKeys(shieldedSecretKeys),
    unshielded: async (configuration) =>
      UnshieldedWallet(configuration).startWithPublicKey(
        PublicKey.fromKeyStore(unshieldedKeystore),
      ),
    dust: async (configuration) =>
      DustWallet(configuration).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

type WalletContext = Awaited<ReturnType<typeof createWallet>>;

function formatSyncProgress(
  state: Awaited<ReturnType<WalletContext['wallet']['waitForSyncedState']>>,
): string {
  const shielded = state.shielded.state.progress;
  const unshielded = state.unshielded.progress;
  const dust = state.dust.state.progress;
  const marker = (connected: boolean) => (connected ? 'online' : 'offline');

  return [
    `shielded ${marker(shielded.isConnected)} ${shielded.appliedIndex}/${shielded.highestRelevantWalletIndex}`,
    `NIGHT ${marker(unshielded.isConnected)} ${unshielded.appliedId}/${unshielded.highestTransactionId}`,
    `DUST ${marker(dust.isConnected)} ${dust.appliedIndex}/${dust.highestRelevantWalletIndex}`,
  ].join(' | ');
}

async function waitForWalletSync(
  wallet: WalletContext['wallet'],
): Promise<Awaited<ReturnType<WalletContext['wallet']['waitForSyncedState']>>> {
  let lastState = 'waiting for the first indexer update';
  let lastProgress = '';
  let lastPrintedAt = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let rejectStall: ((reason: Error) => void) | undefined;
  const armStallTimer = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      rejectStall?.(
        new Error(
          `Wallet sync counters did not advance for 2 minutes. Last state: ${lastState}`,
        ),
      );
    }, SYNC_STALL_TIMEOUT_MS);
  };
  const subscription = wallet.state().subscribe({
    next: (state) => {
      lastState = formatSyncProgress(state);
      const shielded = state.shielded.state.progress;
      const unshielded = state.unshielded.progress;
      const dust = state.dust.state.progress;
      const progress = [
        shielded.appliedIndex,
        unshielded.appliedId,
        dust.appliedIndex,
      ].join(':');
      if (progress !== lastProgress) {
        lastProgress = progress;
        armStallTimer();
      }
      const now = Date.now();
      if (state.isSynced || now - lastPrintedAt >= 10_000) {
        console.log(`  ${lastState}`);
        lastPrintedAt = now;
      }
    },
    error: (error) => {
      console.warn(
        `  Wallet state stream error: ${error instanceof Error ? error.message : String(error)}`,
      );
    },
  });

  try {
    const stalled = new Promise<never>((_, reject) => {
      rejectStall = reject;
      armStallTimer();
    });
    return await Promise.race([
      wallet.waitForSyncedState(),
      stalled,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    subscription.unsubscribe();
  }
}

async function createSyncedWallet(seed: string): Promise<WalletContext> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt += 1) {
    let walletContext: WalletContext | undefined;
    try {
      console.log(`Syncing the Preprod wallet (attempt ${attempt}/${MAX_SYNC_ATTEMPTS})…`);
      walletContext = await createWallet(seed);
      await waitForWalletSync(walletContext.wallet);
      console.log('  Wallet synchronized.');
      return walletContext;
    } catch (error) {
      lastError = error;
      if (walletContext) await walletContext.wallet.stop();
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_SYNC_ATTEMPTS) {
        console.warn(`  Sync attempt failed: ${message}`);
        console.warn('  Reconnecting in 3 seconds…');
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Wallet synchronization failed after three attempts.');
}

async function syncedState(wallet: Awaited<ReturnType<typeof WalletFacade.init>>) {
  return Rx.firstValueFrom(
    wallet.state().pipe(Rx.filter((state) => state.isSynced), Rx.take(1)),
  );
}

async function waitForFunds(
  wallet: Awaited<ReturnType<typeof WalletFacade.init>>,
  address: string,
): Promise<void> {
  let state = await syncedState(wallet);
  let balance = state.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n;
  if (balance > 0n) return;

  console.log('\nFund the deployment wallet, then leave this process running:');
  console.log(`  Address: ${address}`);
  console.log(`  Faucet:  ${CONFIG.faucet}\n`);
  while (balance === 0n) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    state = await syncedState(wallet);
    balance = state.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n;
    process.stdout.write(`\rWaiting for Preprod tNIGHT… ${balance.toString()}   `);
  }
  process.stdout.write('\n');
}

async function ensureDust(
  walletContext: Awaited<ReturnType<typeof createWallet>>,
): Promise<void> {
  const state = await syncedState(walletContext.wallet);
  const unregistered = state.unshielded.availableCoins.filter(
    (coin) => !coin.meta?.registeredForDustGeneration,
  );
  if (unregistered.length > 0) {
    console.log(`Registering ${unregistered.length} NIGHT UTXO(s) for DUST…`);
    const recipe = await walletContext.wallet.registerNightUtxosForDustGeneration(
      unregistered,
      walletContext.unshieldedKeystore.getPublicKey(),
      (payload) => walletContext.unshieldedKeystore.signData(payload),
    );
    await walletContext.wallet.submitTransaction(
      await walletContext.wallet.finalizeRecipe(recipe),
    );
  }

  console.log('Waiting for DUST to accrue…');
  await Rx.firstValueFrom(
    walletContext.wallet.state().pipe(
      Rx.filter((next) => next.isSynced),
      Rx.filter((next) => next.dust.balance(new Date()) > 0n),
      Rx.take(1),
    ),
  );
}

async function waitForProofServer(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await fetch(CONFIG.proofServer, { signal: AbortSignal.timeout(2500) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error('Proof server is not reachable. Run: npm run proof-server:start');
}

async function createProviders(
  walletContext: Awaited<ReturnType<typeof createWallet>>,
  seed: string,
) {
  const walletProvider = {
    getCoinPublicKey: () => walletContext.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () =>
      walletContext.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(transaction: unknown, ttl?: Date) {
      const recipe = await walletContext.wallet.balanceUnboundTransaction(
        transaction as never,
        {
          shieldedSecretKeys: walletContext.shieldedSecretKeys,
          dustSecretKey: walletContext.dustSecretKey,
        },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletContext.wallet.finalizeRecipe(recipe);
    },
    submitTx: (transaction: unknown) =>
      walletContext.wallet.submitTransaction(transaction as never) as never,
  };
  const zkConfigProvider = new NodeZkConfigProvider(ZK_PATH);
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'vickrey-deploy-state',
      accountId: walletContext.unshieldedKeystore.getBech32Address().toString(),
      privateStoragePasswordProvider: () =>
        `Vk-${crypto.createHash('sha256').update(seed).digest('hex')}!A7`,
    }),
    publicDataProvider: indexerPublicDataProvider(CONFIG.indexer, CONFIG.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(CONFIG.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

const compiledContract = CompiledContract.make<
  Vickrey.Contract<VickreyPrivateState>,
  VickreyPrivateState
>('vickrey', Vickrey.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(ZK_PATH),
);

async function main(): Promise<void> {
  const reservePrice = parseReserve(process.argv);
  const deployment = initialDeploymentState(reservePrice);
  console.log('\nVICKREY — PREPROD DEPLOYMENT');
  console.log(`Reserve price: ${reservePrice.toString()}`);
  console.log(`Auction ID:    ${deployment.auctionId}`);
  console.log(`State file:    ${STATE_FILE}\n`);

  const walletContext = await createSyncedWallet(deployment.seed);
  try {
    const deployerAddress =
      walletContext.unshieldedKeystore.getBech32Address().toString();
    await waitForFunds(walletContext.wallet, deployerAddress);
    await ensureDust(walletContext);
    await waitForProofServer();
    const providers = await createProviders(walletContext, deployment.seed);

    console.log('Generating deployment proof…');
    let result: Awaited<ReturnType<typeof deployContract>> | undefined;
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      try {
        result = await deployContract(providers, {
          compiledContract: compiledContract as never,
          args: [Buffer.from(deployment.auctionId, 'hex'), reservePrice],
          privateStateId: PRIVATE_STATE_ID,
          initialPrivateState: privateState(
            Buffer.from(deployment.adminSecret, 'hex'),
            undefined,
            emptyBook(),
          ),
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/dust|insufficient funds|balance/i.test(message) || attempt === 12) {
          throw error;
        }
        console.log(`DUST is still accruing; retrying (${attempt}/12)…`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    if (!result) throw new Error('Deployment did not return a result.');

    const contractAddress = result.deployTxData.public.contractAddress;
    saveDeploymentState({
      ...deployment,
      contractAddress,
      deployerAddress,
      deployedAt: new Date().toISOString(),
    });

    console.log('\n✓ Vickrey deployed to Midnight Preprod');
    console.log(`Contract address: ${contractAddress}`);
    console.log('\nKeep .midnight-state.json private; it contains the admin secret.');
  } finally {
    await walletContext.wallet.stop();
  }
}

main().catch((error) => {
  console.error(`\nDeployment failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
