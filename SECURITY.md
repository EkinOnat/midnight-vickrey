# Security and Privacy

Vickrey is a Preprod prototype, not a production auction service. Do not use it
for real assets or confidential production data.

## Trust Model

The Compact contract proves that every settled opening matches an earlier
on-chain commitment, that the declared winner has the highest bid, and that the
clearing price is the second-highest bid. The auction creator cannot make the
ledger accept a different result.

The prototype does not guarantee settlement availability. Every bidder must
send their opening package to the creator through a private channel, and the
creator can refuse or fail to settle. The creator also learns every opening.
Threshold opening, bid deposits, deadlines, and liveness incentives are outside
this level's scope.

## Sensitive Data

Keep these values private:

- `.midnight-state.json`, which contains the auction admin secret and wallet
  seed used by the deployment CLI;
- each downloaded bid-opening package, which contains the bid amount and salt;
- browser storage for the Vickrey origin, which contains the bidder secret and
  encrypted private-state database credentials.

Never commit those values, paste them into an issue, or publish them in a demo
recording. The repository ignores the generated state files by default. If an
admin secret or opening package is exposed before settlement, treat the auction
as compromised and deploy a fresh instance before accepting bids.

## Public Information

Auction ID, reserve price, phase, bid count, commitments, auction-scoped bidder
tags, winner tag, clearing price, and result digest are public ledger data. The
clearing price reveals the value of one losing bid, but not which losing bidder
submitted it.

## Reporting a Vulnerability

Please use GitHub's private vulnerability-reporting flow for this repository.
Include the affected commit, reproduction steps, expected impact, and whether
the issue could expose a bid opening or admin secret. Do not include live
secrets, wallet seeds, or private opening packages in the report.
