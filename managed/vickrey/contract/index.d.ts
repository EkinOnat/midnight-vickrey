import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum AuctionPhase { OPEN = 0, SETTLED = 1 }

export type BidOpening = { amount: bigint; salt: Uint8Array };

export type Ranking = { highest: bigint; second: bigint; winnerTag: Uint8Array
                      };

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  privateBid(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, BidOpening];
  settlementBook(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, BidOpening[]];
}

export type ImpureCircuits<PS> = {
  submitBid(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  settle(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  submitBid(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  settle(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  deriveAdmin(secret_0: Uint8Array): Uint8Array;
  deriveBidderTag(secret_0: Uint8Array, id_0: Uint8Array): Uint8Array;
  bidCommitment(id_0: Uint8Array,
                slot_0: bigint,
                tag_0: Uint8Array,
                amount_0: bigint,
                salt_0: Uint8Array): Uint8Array;
  rankCandidate(ranking_0: Ranking, amount_0: bigint, tag_0: Uint8Array): Ranking;
  publicResultDigest(id_0: Uint8Array,
                     tag_0: Uint8Array,
                     price_0: bigint,
                     count_0: bigint): Uint8Array;
}

export type Circuits<PS> = {
  deriveAdmin(context: __compactRuntime.CircuitContext<PS>, secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveBidderTag(context: __compactRuntime.CircuitContext<PS>,
                  secret_0: Uint8Array,
                  id_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  bidCommitment(context: __compactRuntime.CircuitContext<PS>,
                id_0: Uint8Array,
                slot_0: bigint,
                tag_0: Uint8Array,
                amount_0: bigint,
                salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  rankCandidate(context: __compactRuntime.CircuitContext<PS>,
                ranking_0: Ranking,
                amount_0: bigint,
                tag_0: Uint8Array): __compactRuntime.CircuitResults<PS, Ranking>;
  publicResultDigest(context: __compactRuntime.CircuitContext<PS>,
                     id_0: Uint8Array,
                     tag_0: Uint8Array,
                     price_0: bigint,
                     count_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  submitBid(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  settle(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly auctionId: Uint8Array;
  readonly reservePrice: bigint;
  readonly phase: AuctionPhase;
  readonly bidCount: bigint;
  commitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  bidderTags: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  usedBidderTags: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly winnerTag: Uint8Array;
  readonly clearingPrice: bigint;
  readonly resultDigest: Uint8Array;
  readonly admin: Uint8Array;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               _auctionId_0: Uint8Array,
               _reservePrice_0: bigint): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
