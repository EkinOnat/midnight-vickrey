import type { ReactNode } from 'react';
import type { MidnightSession } from '../hooks/useMidnight';
import { shortHex } from '../utils/contract';
import { WalletConnect } from './WalletConnect';

export function Layout({
  session,
  children,
}: {
  session: MidnightSession;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Vickrey home">
          VICKREY<span className="brand-dot">.</span>
        </a>
        <div className="network-meta">
          <span>{session.network}</span>
          <code title={session.contractAddress || 'Not deployed'}>
            {session.contractAddress
              ? shortHex(session.contractAddress, 7)
              : 'awaiting deployment'}
          </code>
        </div>
        <WalletConnect session={session} />
      </header>

      {session.error ? (
        <div className="notice error" role="alert">
          <strong>Wallet</strong> {session.error}
        </div>
      ) : null}

      {children}

      <footer>
        <span>Built on Midnight</span>
        <span>Commitments public · bids private · result proved</span>
      </footer>
    </div>
  );
}
