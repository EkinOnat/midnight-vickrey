import type { MidnightSession } from '../hooks/useMidnight';
import { shortHex } from '../utils/contract';

export function WalletConnect({ session }: { session: MidnightSession }) {
  const busy =
    session.status === 'detecting' || session.status === 'connecting';

  if (session.status === 'connected') {
    return (
      <div className="wallet-actions">
        <span className="wallet-status">
          <i className="status-dot connected" />
          {session.walletName} · {shortHex(session.address, 6)}
        </span>
        <button className="button ghost" type="button" onClick={session.disconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  if (session.wallets.length > 1) {
    return (
      <div className="wallet-actions">
        {session.wallets.map((wallet) => (
          <button
            className="button ghost"
            disabled={busy}
            key={wallet.id}
            type="button"
            onClick={() => void session.connect(wallet)}
          >
            Connect {wallet.name}
          </button>
        ))}
      </div>
    );
  }

  const noWallet = session.wallets.length === 0 && !busy;
  return noWallet ? (
    <a
      className="button ghost"
      href="https://www.lace.io/"
      target="_blank"
      rel="noreferrer noopener"
    >
      Install Lace
    </a>
  ) : (
    <button
      className="button ghost"
      type="button"
      disabled={busy}
      onClick={() => void session.connect()}
    >
      {session.status === 'detecting'
        ? 'Finding wallet…'
        : session.status === 'connecting'
          ? 'Approve in wallet…'
          : 'Connect Lace'}
    </button>
  );
}
