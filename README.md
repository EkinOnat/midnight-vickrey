# Vickrey

[![CI](https://github.com/EkinOnat/midnight-vickrey/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/EkinOnat/midnight-vickrey/actions/workflows/ci.yml)

> Provable sealed-bid, second-price auctions without trusting the auctioneer's result.

## Live Demo

[Open the Vickrey Preprod demo](https://midnight-vickrey.vercel.app)

## Contract Address

| Network | Address |
|---------|---------|
| Preprod | `401886da29a681628400316bb77ba796a371cc138dd61ca105170b305cc3f259` |

## What This Product Does

Vickrey runs a sealed-bid, second-price auction: the highest bidder wins, but
pays the second-highest bid. That rule makes truthful bidding the rational
strategy. Traditional implementations rarely earn full trust because the
auctioneer sees every bid and can claim that the second price was higher than
it really was.

Vickrey replaces that discretion with a proof. Each bidder locks an opaque
commitment before settlement. A zero-knowledge circuit later verifies that the
private openings match those commitments, selects the highest bid, and derives
the second-highest price. The ledger accepts only the proved winner tag and
price; it never receives the private bid book.

Midnight is essential because the product needs confidentiality and public
verifiability at the same time. This Level 4 prototype supports one auction of
up to four bids. Bidders send their private opening packages to the auction
creator off-chain; the creator can withhold settlement, but cannot publish a
forged winner or price that Midnight will accept.

## Privacy Model

- **What is PUBLIC (on-chain, anyone can see):** auction ID, reserve price,
  phase, bid count, opaque commitments, auction-scoped bidder tags, and—after
  settlement—the winner tag, clearing price, and result digest.
- **What is PRIVATE (private witness, never on-chain):** bid amounts, random
  salts, bidder secret keys, the creator's admin secret, and the complete
  settlement book. For this prototype, the creator receives bid openings over
  a private off-chain channel and therefore learns them.
- **What the user PROVES without revealing:** every opening matches its locked
  commitment, every admitted bid meets the reserve, the winner submitted the
  highest bid, and the public clearing price is exactly the second-highest bid.

The clearing price is deliberately public. It equals one losing bid amount,
but Vickrey does not reveal which losing bidder supplied it.

## Tech Stack

- Midnight Compact 0.31.1 and Compact runtime 0.16.0
- Midnight.js 4.1.1 and Wallet SDK 1.2.0
- React 19, TypeScript, and Vite
- Lace wallet and Midnight Preprod
- Vitest for contract-model tests
- Docker Compose with Midnight proof server 8.1.0
- GitHub Actions for continuous integration

## Prerequisites

- [Lace wallet](https://www.lace.io/) configured for Midnight Preprod
- Node.js v22 or newer and npm
- Docker Desktop with Docker Compose
- Compact developer tools with compiler 0.31.1
- WSL2 on Windows (the Compact toolchain supports Linux and macOS; the npm
  compile script automatically uses the compiler installed in WSL)

## Setup & Run Locally

1. Clone the repository and enter it:

   ```bash
   git clone https://github.com/EkinOnat/midnight-vickrey.git
   cd midnight-vickrey
   ```

2. Install the JavaScript dependencies:

   ```bash
   npm ci
   ```

3. Select the compatible Compact compiler and compile the contract:

   ```bash
   compact update 0.31.1
   npm run compile
   ```

4. Create your local frontend configuration from the committed template:

   ```bash
   cp .env.example .env
   ```

   On PowerShell, use `Copy-Item .env.example .env` instead. The template
   already contains the deployed Preprod contract address.

5. Start the frontend:

   ```bash
   npm run dev
   ```

6. Open the local URL printed by Vite, connect Lace on Preprod, and follow the
   [usage guide](docs/USAGE.md).

To run the headless deployment workflow for a new auction, start the local
proof server with `npm run proof-server:start`, then run
`npm run deploy:preprod -- <RESERVE_PRICE>`. Keep the generated
`.midnight-state.json` private.

## Run Tests

Compile the contract, execute all tests, and verify the production frontend:

```bash
npm run compile
npm test
npm run build
```

The test suite covers bid commitments, reserve enforcement, duplicate-bidder
rejection, second-price settlement, tie handling, and tampered openings.

## CI/CD

The [GitHub Actions workflow](.github/workflows/ci.yml) runs on every push and
pull request to `main`. It installs dependencies, installs Compact compiler
0.31.1, compiles the contract, runs the test suite, and performs a production
frontend build. The badge at the top of this README links to the workflow.

## Usage Guide

See [docs/USAGE.md](docs/USAGE.md).

## Product X Profile

[PLACEHOLDER — add after creating the Vickrey product account]
