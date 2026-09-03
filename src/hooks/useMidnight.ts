import { useCallback, useEffect, useRef, useState } from 'react';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js-types';

import {
  CONTRACT_ADDRESS,
  PRIVATE_STATE_ID,
  TARGET_NETWORK,
  buildProviders,
  compiledContract,
  connectWallet,
  errorMessage,
  getBidderSecret,
  isConfigured,
  privateState,
  publicDataProviderFor,
  readAuction,
  waitForWallets,
  type DiscoveredWallet,
  type PublicAuction,
  type VickreyProviders,
} from '../utils/contract';

export type ConnectionStatus =
  | 'detecting'
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'error';

export interface MidnightSession {
  readonly status: ConnectionStatus;
  readonly error: string | null;
  readonly wallets: readonly DiscoveredWallet[];
  readonly walletName: string | null;
  readonly address: string | null;
  readonly network: string;
  readonly contractAddress: string;
  readonly auction: PublicAuction | null;
  readonly auctionError: string | null;
  readonly providers: VickreyProviders | null;
  // The SDK derives this generic from the compiled contract. Keeping it opaque
  // here avoids spreading its deeply nested provider type through UI props.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly contract: any | null;
  connect(wallet?: DiscoveredWallet): Promise<void>;
  disconnect(): void;
  refreshAuction(): Promise<void>;
}

export function useMidnight(): MidnightSession {
  const [status, setStatus] = useState<ConnectionStatus>('detecting');
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<readonly DiscoveredWallet[]>([]);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [auction, setAuction] = useState<PublicAuction | null>(null);
  const [auctionError, setAuctionError] = useState<string | null>(
    isConfigured ? null : 'Add VITE_CONTRACT_ADDRESS after the Preprod deployment.',
  );
  const [providers, setProviders] = useState<VickreyProviders | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contract, setContract] = useState<any | null>(null);

  const providersRef = useRef<VickreyProviders | null>(null);
  const publicProviderRef = useRef<PublicDataProvider | null>(null);

  useEffect(() => {
    let cancelled = false;
    void waitForWallets().then((found) => {
      if (cancelled) return;
      setWallets(found);
      setStatus('idle');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const readFrom = useCallback(async (provider: PublicDataProvider) => {
    if (!isConfigured) {
      setAuctionError('Add VITE_CONTRACT_ADDRESS after the Preprod deployment.');
      return;
    }
    try {
      const state = await provider.queryContractState(CONTRACT_ADDRESS);
      if (!state) throw new Error('No contract state exists at this address.');
      setAuction(readAuction(state));
      setAuctionError(null);
    } catch (cause) {
      setAuctionError(errorMessage(cause, 'Could not read the public auction.'));
    }
  }, []);

  const refreshAuction = useCallback(async () => {
    const provider =
      providersRef.current?.publicDataProvider ??
      (publicProviderRef.current ??= publicDataProviderFor());
    await readFrom(provider);
  }, [readFrom]);

  useEffect(() => {
    if (isConfigured) void refreshAuction();
  }, [refreshAuction]);

  const disconnect = useCallback(() => {
    providersRef.current = null;
    setProviders(null);
    setContract(null);
    setWalletName(null);
    setAddress(null);
    setError(null);
    setStatus('idle');
  }, []);

  const connect = useCallback(
    async (preferred?: DiscoveredWallet) => {
      setError(null);
      if (!isConfigured) {
        setError('Deploy first, then set VITE_CONTRACT_ADDRESS and rebuild.');
        setStatus('error');
        return;
      }
      setStatus('connecting');
      try {
        const available = preferred ? [preferred] : await waitForWallets();
        setWallets(available);
        const wallet =
          preferred ??
          available.find((candidate) => /lace/i.test(candidate.name)) ??
          available[0];
        if (!wallet) throw new Error('No Midnight wallet was detected.');

        const connection = await connectWallet(wallet);
        const built = await buildProviders(connection.api, connection.networkId);
        const deployed = await findDeployedContract(built.providers, {
          compiledContract: compiledContract as never,
          contractAddress: CONTRACT_ADDRESS,
          privateStateId: PRIVATE_STATE_ID,
          initialPrivateState: privateState(getBidderSecret()),
        });

        providersRef.current = built.providers;
        setProviders(built.providers);
        setContract(deployed);
        setWalletName(wallet.name);
        setAddress(built.address);
        setStatus('connected');
        await readFrom(built.providers.publicDataProvider);
      } catch (cause) {
        providersRef.current = null;
        setProviders(null);
        setContract(null);
        setStatus('error');
        setError(errorMessage(cause, 'Wallet connection failed.'));
      }
    },
    [readFrom],
  );

  return {
    status,
    error,
    wallets,
    walletName,
    address,
    network: TARGET_NETWORK,
    contractAddress: CONTRACT_ADDRESS,
    auction,
    auctionError,
    providers,
    contract,
    connect,
    disconnect,
    refreshAuction,
  };
}
