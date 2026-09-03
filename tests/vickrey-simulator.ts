import {
  CostModel,
  QueryContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import {
  AuctionPhase,
  Contract,
  ledger,
  type BidOpening,
  type Ledger,
} from '../managed/vickrey/contract/index.js';
import {
  emptyOpening,
  type VickreyPrivateState,
  witnesses,
} from '../src/witnesses.js';

export const bytes = (seed: number): Uint8Array =>
  Uint8Array.from({ length: 32 }, (_, i) => (seed * 37 + i * 11) % 256);

export const opening = (amount: bigint, seed: number): BidOpening => ({
  amount,
  salt: bytes(seed),
});

const blankBook = (): [BidOpening, BidOpening, BidOpening, BidOpening] => [
  emptyOpening(),
  emptyOpening(),
  emptyOpening(),
  emptyOpening(),
];

export class VickreySimulator {
  readonly contract: Contract<VickreyPrivateState>;
  circuitContext: CircuitContext<VickreyPrivateState>;

  constructor(
    adminSecret: Uint8Array,
    auctionId: Uint8Array = bytes(90),
    reservePrice = 1n,
  ) {
    this.contract = new Contract<VickreyPrivateState>(witnesses);
    const privateState: VickreyPrivateState = {
      secretKey: adminSecret,
      bid: emptyOpening(),
      settlementBook: blankBook(),
    };
    const initial = this.contract.initialState(
      createConstructorContext(privateState, '0'.repeat(64)),
      auctionId,
      reservePrice,
    );
    this.circuitContext = {
      currentPrivateState: initial.currentPrivateState,
      currentZswapLocalState: initial.currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        initial.currentContractState.data,
        sampleContractAddress(),
      ),
    };
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  switchBidder(secretKey: Uint8Array, bid: BidOpening): void {
    this.circuitContext.currentPrivateState = {
      ...this.circuitContext.currentPrivateState,
      secretKey,
      bid,
    };
  }

  submitBid(): Ledger {
    this.circuitContext = this.contract.impureCircuits.submitBid(
      this.circuitContext,
    ).context;
    return this.getLedger();
  }

  settle(
    adminSecret: Uint8Array,
    bidOpenings: readonly BidOpening[],
  ): Ledger {
    const book = blankBook();
    bidOpenings.slice(0, 4).forEach((value, index) => {
      book[index] = value;
    });
    this.circuitContext.currentPrivateState = {
      ...this.circuitContext.currentPrivateState,
      secretKey: adminSecret,
      settlementBook: book,
    };
    this.circuitContext = this.contract.impureCircuits.settle(
      this.circuitContext,
    ).context;
    return this.getLedger();
  }

  phaseName(): string {
    return this.getLedger().phase === AuctionPhase.OPEN ? 'OPEN' : 'SETTLED';
  }
}
