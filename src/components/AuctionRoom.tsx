import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import type { MidnightSession } from '../hooks/useMidnight';
import {
  CONTRACT_ADDRESS,
  PRIVATE_STATE_ID,
  bytesToHex,
  emptyBook,
  errorMessage,
  getBidderSecret,
  hexToBytes,
  newBidSalt,
  onCallStage,
  privateState,
  shortHex,
  type BidOpening,
  type CallStage,
} from '../utils/contract';

type ActiveAction = 'bid' | 'settle' | null;

interface OpeningPackage {
  readonly contract: string;
  readonly auctionId: string;
  readonly slot: number;
  readonly amount: string;
  readonly salt: string;
}

interface Receipt {
  readonly kind: 'Bid committed' | 'Auction settled';
  readonly transactionId: string;
  readonly blockHeight: string;
}

const MAX_UINT64 = (1n << 64n) - 1n;

export function AuctionRoom({ session }: { session: MidnightSession }) {
  const [action, setAction] = useState<ActiveAction>(null);
  const [stage, setStage] = useState<CallStage | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [openingPackage, setOpeningPackage] =
    useState<OpeningPackage | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => onCallStage(setStage), []);

  const connected =
    session.status === 'connected' &&
    session.contract !== null &&
    session.providers !== null;
  const open = session.auction?.phase === 'OPEN';
  const full = (session.auction?.bidCount ?? 4) >= 4;

  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      await session.refreshAuction();
    } finally {
      setRefreshing(false);
    }
  }

  async function submitBid(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!connected || !session.auction) return;
    const form = event.currentTarget;
    const input = new FormData(form).get('amount');

    try {
      const amount = BigInt(String(input));
      if (amount < session.auction.reservePrice) {
        throw new Error(`The minimum bid is ${session.auction.reservePrice}.`);
      }
      if (amount > MAX_UINT64) throw new Error('The bid is too large.');

      const slot = session.auction.bidCount;
      const salt = newBidSalt();
      const opening: BidOpening = { amount, salt };
      setAction('bid');
      setStage('Running the private circuit');
      setCallError(null);
      setReceipt(null);

      await session.providers.privateStateProvider.set(
        PRIVATE_STATE_ID,
        privateState(getBidderSecret(), opening),
      );
      const result = await session.contract.callTx.submitBid();
      const packageToSave: OpeningPackage = {
        contract: CONTRACT_ADDRESS,
        auctionId: session.auction.auctionId,
        slot,
        amount: amount.toString(),
        salt: bytesToHex(salt),
      };
      setOpeningPackage(packageToSave);
      setReceipt({
        kind: 'Bid committed',
        transactionId: String(result.public.txId),
        blockHeight: String(result.public.blockHeight),
      });
      form.reset();
      await session.refreshAuction();
    } catch (cause) {
      setCallError(errorMessage(cause, 'The bid could not be committed.'));
    } finally {
      await session.providers?.privateStateProvider
        .set(PRIVATE_STATE_ID, privateState(getBidderSecret()))
        .catch(() => undefined);
      setAction(null);
      setStage(null);
    }
  }

  async function settle(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!connected || !session.auction) return;
    const form = event.currentTarget;
    const values = new FormData(form);

    try {
      const adminSecret = hexToBytes(
        String(values.get('adminSecret')),
        'Admin secret',
      );
      const book = parseSettlementBook(
        String(values.get('packages')),
        session.auction.auctionId,
        session.auction.bidCount,
      );
      setAction('settle');
      setStage('Running the private circuit');
      setCallError(null);
      setReceipt(null);

      await session.providers.privateStateProvider.set(
        PRIVATE_STATE_ID,
        privateState(adminSecret, undefined, book),
      );
      const result = await session.contract.callTx.settle();
      setReceipt({
        kind: 'Auction settled',
        transactionId: String(result.public.txId),
        blockHeight: String(result.public.blockHeight),
      });
      form.reset();
      await session.refreshAuction();
    } catch (cause) {
      setCallError(errorMessage(cause, 'Settlement proof failed.'));
    } finally {
      await session.providers?.privateStateProvider
        .set(PRIVATE_STATE_ID, privateState(getBidderSecret()))
        .catch(() => undefined);
      setAction(null);
      setStage(null);
    }
  }

  async function copyPackage(): Promise<void> {
    if (!openingPackage) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(openingPackage, null, 2),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCallError('Clipboard access was blocked. Select and copy the package.');
    }
  }

  return (
    <main id="top">
      <section className="hero">
        <p className="kicker">SEALED-BID / SECOND-PRICE / ZERO-KNOWLEDGE</p>
        <h1>The auctioneer announces a price. The proof makes it true.</h1>
        <p className="hero-copy">
          Commit a bid without publishing it. At settlement, Midnight proves
          the winner was highest and the clearing price was second-highest —
          against commitments that were already locked.
        </p>
        <div className="privacy-equation" aria-label="Privacy model summary">
          <span>bid + salt</span>
          <b>stay here</b>
          <i aria-hidden="true">→</i>
          <span>commitment + proof</span>
          <b>go on-chain</b>
        </div>
      </section>

      <section className="auction-grid">
        <article className="panel public-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-number">01</span>
              <h2>Public record</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              {refreshing ? 'Reading…' : 'Refresh'}
            </button>
          </div>

          {session.auction ? (
            <>
              <dl className="ledger-grid">
                <div>
                  <dt>Phase</dt>
                  <dd>
                    <span className={`phase ${session.auction.phase.toLowerCase()}`}>
                      {session.auction.phase}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Reserve</dt>
                  <dd>{session.auction.reservePrice.toString()}</dd>
                </div>
                <div>
                  <dt>Committed</dt>
                  <dd>{session.auction.bidCount} / 4</dd>
                </div>
                <div>
                  <dt>Auction ID</dt>
                  <dd title={session.auction.auctionId}>
                    {shortHex(session.auction.auctionId)}
                  </dd>
                </div>
              </dl>

              <div className="commitment-list">
                <h3>Locked commitments</h3>
                {session.auction.bids.length === 0 ? (
                  <p className="muted">No commitments yet. Amounts never appear here.</p>
                ) : (
                  session.auction.bids.map((bid) => (
                    <div className="commitment" key={bid.slot}>
                      <span>#{bid.slot}</span>
                      <code title={bid.commitment}>{shortHex(bid.commitment, 10)}</code>
                      <small title={bid.bidderTag}>
                        tag {shortHex(bid.bidderTag, 5)}
                      </small>
                    </div>
                  ))
                )}
              </div>

              {session.auction.phase === 'SETTLED' ? (
                <div className="result-card">
                  <p>PROVED RESULT</p>
                  <div>
                    <span>Winner</span>
                    <code>{shortHex(session.auction.winnerTag, 10)}</code>
                  </div>
                  <div>
                    <span>Second price</span>
                    <strong>{session.auction.clearingPrice?.toString()}</strong>
                  </div>
                  <small title={session.auction.resultDigest ?? undefined}>
                    result {shortHex(session.auction.resultDigest, 10)}
                  </small>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <span className="spinner" aria-hidden="true" />
              <p>{session.auctionError ?? 'Reading the Preprod contract…'}</p>
            </div>
          )}
        </article>

        <article className="panel private-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-number">02</span>
              <h2>Private proving room</h2>
            </div>
            <span className="local-only">LOCAL ONLY</span>
          </div>

          <form className="action-form" onSubmit={(event) => void submitBid(event)}>
            <h3>Seal a bid</h3>
            <p>
              Your amount and random salt become witness inputs. The transaction
              contains their hash, never the opening.
            </p>
            <label htmlFor="amount">Private bid amount</label>
            <input
              id="amount"
              name="amount"
              inputMode="numeric"
              pattern="[0-9]+"
              placeholder={
                session.auction
                  ? `Minimum ${session.auction.reservePrice}`
                  : 'Connect to load reserve'
              }
              autoComplete="off"
              required
              disabled={action !== null}
            />
            <button
              className="button primary"
              type="submit"
              disabled={!connected || !open || full || action !== null}
            >
              {action === 'bid' ? 'Proving bid…' : 'Commit sealed bid'}
            </button>
          </form>

          {openingPackage ? (
            <div className="opening-package">
              <div>
                <h3>Save this private opening</h3>
                <button className="text-button" type="button" onClick={() => void copyPackage()}>
                  {copied ? 'Copied' : 'Copy JSON'}
                </button>
              </div>
              <textarea
                readOnly
                rows={8}
                value={JSON.stringify(openingPackage, null, 2)}
                aria-label="Private bid opening package"
              />
              <p>
                It is not on-chain. Send it only to the auction creator over a
                private channel; they need every opening to generate settlement.
              </p>
              <button
                className="text-button danger-text"
                type="button"
                onClick={() => setOpeningPackage(null)}
              >
                Clear from screen
              </button>
            </div>
          ) : null}

          <details className="settlement">
            <summary>Settle as auction creator</summary>
            <form className="action-form" onSubmit={(event) => void settle(event)}>
              <p>
                Paste the opening packages in slot order. They remain witness
                data; the circuit checks every hash and publishes only the
                winner tag and second price.
              </p>
              <label htmlFor="packages">Opening package JSON array</label>
              <textarea
                id="packages"
                name="packages"
                rows={8}
                autoComplete="off"
                placeholder='[{ "slot": 0, "amount": "…", "salt": "…" }]'
                required
                disabled={action !== null}
              />
              <label htmlFor="adminSecret">Admin secret (64 hex characters)</label>
              <input
                id="adminSecret"
                name="adminSecret"
                type="password"
                minLength={64}
                maxLength={64}
                autoComplete="off"
                required
                disabled={action !== null}
              />
              <button
                className="button secondary"
                type="submit"
                disabled={
                  !connected ||
                  !open ||
                  (session.auction?.bidCount ?? 0) < 2 ||
                  action !== null
                }
              >
                {action === 'settle' ? 'Proving result…' : 'Prove & publish result'}
              </button>
            </form>
          </details>

          {!connected ? (
            <p className="connection-hint">Connect Lace to call either circuit.</p>
          ) : null}
          {stage ? (
            <div className="progress" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <div>
                <strong>{stage}</strong>
                <small>Keep this tab open; proving can take about a minute.</small>
              </div>
            </div>
          ) : null}
          {callError ? (
            <div className="notice error inline" role="alert">
              {callError}
            </div>
          ) : null}
          {receipt ? (
            <div className="receipt">
              <strong>{receipt.kind}</strong>
              <span>Block {receipt.blockHeight}</span>
              <code title={receipt.transactionId}>
                {shortHex(receipt.transactionId, 10)}
              </code>
            </div>
          ) : null}
        </article>
      </section>

      <section className="proof-strip">
        <span>THE PROOF SAYS</span>
        <p>
          Every private opening matched a commitment locked before settlement.
          No bid exceeded the winner. No losing bid exceeded the published price,
          and at least one losing bid equalled it.
        </p>
      </section>
    </main>
  );
}

function parseSettlementBook(
  source: string,
  expectedAuctionId: string,
  bidCount: number,
): BidOpening[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('Opening packages must be a valid JSON array.');
  }
  if (!Array.isArray(parsed)) throw new Error('Paste a JSON array of opening packages.');
  if (parsed.length !== bidCount) {
    throw new Error(`Expected ${bidCount} opening packages, received ${parsed.length}.`);
  }

  const book = emptyBook();
  const seen = new Set<number>();
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') throw new Error('Each opening must be an object.');
    const item = raw as Partial<OpeningPackage>;
    if (!Number.isInteger(item.slot) || item.slot! < 0 || item.slot! >= bidCount) {
      throw new Error('Each opening needs a unique valid slot number.');
    }
    if (seen.has(item.slot!)) throw new Error(`Slot ${item.slot} appears twice.`);
    if (item.auctionId && item.auctionId !== expectedAuctionId) {
      throw new Error(`Slot ${item.slot} belongs to a different auction.`);
    }
    if (item.contract && item.contract !== CONTRACT_ADDRESS) {
      throw new Error(`Slot ${item.slot} belongs to a different contract.`);
    }
    const amount = BigInt(String(item.amount));
    if (amount <= 0n || amount > MAX_UINT64) {
      throw new Error(`Slot ${item.slot} has an invalid amount.`);
    }
    book[item.slot!] = {
      amount,
      salt: hexToBytes(String(item.salt), `Salt for slot ${item.slot}`),
    };
    seen.add(item.slot!);
  }
  return book;
}
