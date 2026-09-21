import { describe, expect, it } from 'vitest';

import { parseSettlementBook } from '../src/utils/opening-package';

const CONTRACT = 'contract-address';
const AUCTION = 'auction-id';
const salt = (digit: string) => digit.repeat(64);
const packageFor = (slot: number, amount: string, digit: string) => ({
  contract: CONTRACT,
  auctionId: AUCTION,
  slot,
  amount,
  salt: salt(digit),
});

describe('settlement opening packages', () => {
  it('orders valid packages by their declared slot', () => {
    const source = JSON.stringify([
      packageFor(1, '90', 'b'),
      packageFor(0, '50', 'a'),
    ]);

    const book = parseSettlementBook(source, CONTRACT, AUCTION, 2);

    expect(book[0].amount).toBe(50n);
    expect(book[1].amount).toBe(90n);
  });

  it('rejects malformed JSON and duplicate slots', () => {
    expect(() => parseSettlementBook('{', CONTRACT, AUCTION, 2)).toThrow(
      'valid JSON array',
    );
    const duplicate = JSON.stringify([
      packageFor(0, '50', 'a'),
      packageFor(0, '90', 'b'),
    ]);
    expect(() => parseSettlementBook(duplicate, CONTRACT, AUCTION, 2)).toThrow(
      'Slot 0 appears twice',
    );
  });

  it('rejects invalid amounts with a field-specific message', () => {
    const source = JSON.stringify([
      packageFor(0, 'not-a-number', 'a'),
      packageFor(1, '90', 'b'),
    ]);

    expect(() => parseSettlementBook(source, CONTRACT, AUCTION, 2)).toThrow(
      'Slot 0 has an invalid amount',
    );
  });

  it('requires every package to identify the expected auction and contract', () => {
    const missingContract = {
      ...packageFor(0, '50', 'a'),
      contract: undefined,
    };
    const wrongAuction = {
      ...packageFor(1, '90', 'b'),
      auctionId: 'another-auction',
    };

    expect(() =>
      parseSettlementBook(
        JSON.stringify([missingContract, packageFor(1, '90', 'b')]),
        CONTRACT,
        AUCTION,
        2,
      ),
    ).toThrow('different contract');
    expect(() =>
      parseSettlementBook(
        JSON.stringify([packageFor(0, '50', 'a'), wrongAuction]),
        CONTRACT,
        AUCTION,
        2,
      ),
    ).toThrow('different auction');
  });
});
