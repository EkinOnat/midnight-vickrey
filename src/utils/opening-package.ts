import {
  emptyBook,
  hexToBytes,
  type BidOpening,
} from './contract';

export interface OpeningPackage {
  readonly contract: string;
  readonly auctionId: string;
  readonly slot: number;
  readonly amount: string;
  readonly salt: string;
}

const MAX_UINT64 = (1n << 64n) - 1n;

export function parseSettlementBook(
  source: string,
  expectedContract: string,
  expectedAuctionId: string,
  bidCount: number,
): BidOpening[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('Opening packages must be a valid JSON array.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Paste a JSON array of opening packages.');
  }
  if (parsed.length !== bidCount) {
    throw new Error(
      `Expected ${bidCount} opening packages, received ${parsed.length}.`,
    );
  }

  const book = emptyBook();
  const seen = new Set<number>();
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Each opening must be an object.');
    }
    const item = raw as Partial<OpeningPackage>;
    if (!Number.isInteger(item.slot) || item.slot! < 0 || item.slot! >= bidCount) {
      throw new Error('Each opening needs a unique valid slot number.');
    }
    if (seen.has(item.slot!)) throw new Error(`Slot ${item.slot} appears twice.`);
    if (item.auctionId !== expectedAuctionId) {
      throw new Error(`Slot ${item.slot} belongs to a different auction.`);
    }
    if (item.contract !== expectedContract) {
      throw new Error(`Slot ${item.slot} belongs to a different contract.`);
    }

    let amount: bigint;
    try {
      amount = BigInt(String(item.amount));
    } catch {
      throw new Error(`Slot ${item.slot} has an invalid amount.`);
    }
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
