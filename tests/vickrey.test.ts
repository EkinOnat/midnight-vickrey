import { describe, expect, it } from 'vitest';
import { pureCircuits } from '../managed/vickrey/contract/index.js';
import {
  VickreySimulator,
  bytes,
  opening,
} from './vickrey-simulator.js';

const ADMIN = bytes(1);
const ALICE = bytes(2);
const BOB = bytes(3);
const CAROL = bytes(4);

const hex = (value: Uint8Array): string => Buffer.from(value).toString('hex');

describe('Vickrey commitment flow', () => {
  it('stores only a salted commitment and auction-scoped tag', () => {
    const sim = new VickreySimulator(ADMIN);
    const aliceBid = opening(90n, 12);
    sim.switchBidder(ALICE, aliceBid);
    const state = sim.submitBid();

    expect(state.bidCount).toBe(1n);
    expect(state.commitments.size()).toBe(1n);
    expect(state.bidderTags.size()).toBe(1n);

    const publicJson = JSON.stringify(state, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(Object.keys(state)).not.toContain('amount');
    expect(Object.keys(state)).not.toContain('salt');
    expect(publicJson).not.toContain(hex(aliceBid.salt));
    expect(publicJson).not.toContain(hex(ALICE));
  });

  it('rejects duplicate bidders and bids below reserve', () => {
    const sim = new VickreySimulator(ADMIN, bytes(90), 20n);
    sim.switchBidder(ALICE, opening(19n, 20));
    expect(() => sim.submitBid()).toThrow();

    sim.switchBidder(ALICE, opening(25n, 21));
    sim.submitBid();
    sim.switchBidder(ALICE, opening(30n, 22));
    expect(() => sim.submitBid()).toThrow();
  });
});

describe('Vickrey private second-price settlement', () => {
  it('publishes the highest bidder tag and exactly the second price', () => {
    const sim = new VickreySimulator(ADMIN);
    const bids = [opening(60n, 31), opening(95n, 32), opening(75n, 33)];

    sim.switchBidder(ALICE, bids[0]);
    sim.submitBid();
    sim.switchBidder(BOB, bids[1]);
    sim.submitBid();
    sim.switchBidder(CAROL, bids[2]);
    sim.submitBid();

    const state = sim.settle(ADMIN, bids);
    const expectedWinner = pureCircuits.deriveBidderTag(BOB, state.auctionId);

    expect(sim.phaseName()).toBe('SETTLED');
    expect(state.clearingPrice).toBe(75n);
    expect(hex(state.winnerTag)).toBe(hex(expectedWinner));
  });

  it('uses earliest commitment as the deterministic winner on a tie', () => {
    const sim = new VickreySimulator(ADMIN);
    const bids = [opening(100n, 41), opening(100n, 42), opening(70n, 43)];

    sim.switchBidder(ALICE, bids[0]);
    sim.submitBid();
    sim.switchBidder(BOB, bids[1]);
    sim.submitBid();
    sim.switchBidder(CAROL, bids[2]);
    sim.submitBid();

    const state = sim.settle(ADMIN, bids);
    expect(state.clearingPrice).toBe(100n);
    expect(hex(state.winnerTag)).toBe(
      hex(pureCircuits.deriveBidderTag(ALICE, state.auctionId)),
    );
  });

  it('rejects a forged opening and leaves the auction open', () => {
    const sim = new VickreySimulator(ADMIN);
    const aliceBid = opening(45n, 51);
    const bobBid = opening(80n, 52);

    sim.switchBidder(ALICE, aliceBid);
    sim.submitBid();
    sim.switchBidder(BOB, bobBid);
    sim.submitBid();

    expect(() =>
      sim.settle(ADMIN, [opening(999n, 51), bobBid]),
    ).toThrow();
    expect(sim.phaseName()).toBe('OPEN');
  });

  it('rejects settlement by anyone without the admin secret', () => {
    const sim = new VickreySimulator(ADMIN);
    const bids = [opening(40n, 61), opening(50n, 62)];
    sim.switchBidder(ALICE, bids[0]);
    sim.submitBid();
    sim.switchBidder(BOB, bids[1]);
    sim.submitBid();

    expect(() => sim.settle(CAROL, bids)).toThrow();
    expect(sim.phaseName()).toBe('OPEN');
  });
});
