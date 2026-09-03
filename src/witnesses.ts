import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type {
  BidOpening,
  Ledger,
  Witnesses,
} from '../managed/vickrey/contract/index.js';

export type VickreyPrivateState = {
  readonly secretKey: Uint8Array;
  readonly bid: BidOpening;
  readonly settlementBook: BidOpening[];
};

const keep = <T>(
  context: WitnessContext<Ledger, VickreyPrivateState>,
  value: T,
): [VickreyPrivateState, T] => [context.privateState, value];

export const witnesses: Witnesses<VickreyPrivateState> = {
  localSecretKey: (context) => keep(context, context.privateState.secretKey),
  privateBid: (context) => keep(context, context.privateState.bid),
  settlementBook: (context) =>
    keep(context, context.privateState.settlementBook),
};

export const emptyOpening = (): BidOpening => ({
  amount: 0n,
  salt: new Uint8Array(32),
});
