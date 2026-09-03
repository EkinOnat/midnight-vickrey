# VICKREY — Sealed-Bid Auctions That Don't Require Trusting the Auctioneer

**Track:** Finance  
**Approved challenge match:** Sealed-Bid Auction

In a second-price auction the highest bidder wins but pays the second-highest
bid, which makes honest bidding the optimal strategy. It is the cleanest result
in auction theory and it is almost never used, because only the auctioneer sees
the bids — and they earn more when the second price is higher. They can
overstate it, or invent a bid. Bidders know this, so they bid defensively and
the advantage disappears.

Vickrey makes the outcome provable. Bidders submit sealed commitments. At
close, the result is published with a zero-knowledge proof that the winner is
the highest bidder and the price equals the second-highest bid, checked against
commitments locked in before bidding ended. No submitted bid is published,
including the winner's bid. The clearing price is public, but it is not linked
to the losing bidder whose opening produced it. The auctioneer keeps their role
and loses their discretion.

This needs Midnight because it needs both halves at once: bids sealed, or
bidders bid strategically; outcome publicly verifiable, or nobody believes the
price. On a transparent chain those are mutually exclusive.

Level 4 builds the settlement circuit and commitment flow. Level 5 adds the
auction house around it — deadlines, binding deposits, and a public page where
anyone can re-verify a past result. Level 6 targets Mainnet with fees sponsored
by the auction creator, so bidders need no tokens.

## Level 4 Prototype Boundary

The proof circuit is deliberately bounded to four commitments so its cost and
logic remain auditable for the challenge. The creator receives opening packages
through a private off-chain channel and supplies them as one settlement witness.
They can still withhold settlement, but they cannot publish a forged winner or
price that Midnight will accept. Removing that availability dependency through
threshold opening is a future enhancement.
