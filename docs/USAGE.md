# How to Use Vickrey

## What You Need

- A desktop browser with the Lace wallet extension installed.
- Lace connected to the Midnight Preprod network and funded for test transactions.
- The Vickrey Preprod demo, or a local copy of the app running in your browser.
- A private way to send your saved bid-opening package to the auction creator.

The Level 4 prototype accepts up to four bidders. At least two valid bids are
required before the auction can be settled, and every bid must be at least the
public reserve price.

## Step-by-Step Guide

1. Open Vickrey and review the **Public record**. Check that the auction phase
   is `OPEN`, note the reserve price, and confirm that fewer than four bids have
   been committed.
2. Select **Connect Lace**, approve the connection in Lace, and make sure Lace
   reports the Midnight Preprod network.
3. Enter your bid in **Private bid amount**. The amount must be a whole number
   equal to or greater than the reserve price.
4. Select **Commit sealed bid** and approve the transaction in Lace. Keep the
   tab open while the wallet creates the zero-knowledge proof.
5. When the transaction succeeds, copy the displayed private opening package.
   Save it somewhere secure before clearing it from the screen. Losing this
   package means the auction creator cannot include your bid in settlement.
6. Send the opening package only to the auction creator through a private
   channel. Do not post it publicly: it contains your bid amount and random
   salt.
7. The auction creator collects every opening package. Once at least two bids
   are committed, open **Settle as auction creator**.
8. Paste all opening packages together as one JSON array. Enter the admin
   secret kept in the private `.midnight-state.json` deployment file, then
   select **Prove & publish result**.
9. Keep the tab open while the settlement proof is generated. When it is
   accepted, the **Public record** changes to `SETTLED` and displays the winner's
   auction-specific tag, the second-highest price, and the result digest.

## What Gets Proved (and What Stays Private)

Vickrey proves that every supplied opening matches a commitment locked before
settlement, every bid meets the reserve, the displayed winner submitted the
highest bid, and the displayed price is exactly the second-highest bid. If the
highest bids tie, the earliest commitment wins and the second price equals that
tied amount.

Anyone can see the auction ID, reserve price, phase, number of bids, opaque bid
commitments, auction-specific bidder tags, and the final winner tag, clearing
price, and result digest. The individual bid amounts, salts, bidder secrets,
admin secret, and complete bid book are never written to the public ledger.

The clearing price is intentionally public and therefore reveals the value of
one losing bid, but it does not identify which losing bidder submitted it. In
this Level 4 prototype, bidders privately send their openings to the auction
creator, so the creator learns those openings even though the chain does not.
Threshold or decentralized opening is a future enhancement.

## Troubleshooting

- **Lace is not detected:** Install or enable Lace, refresh the page, and select
  **Connect Lace** again.
- **Wrong network:** Switch Lace to Midnight Preprod, then reconnect.
- **The contract does not load:** Confirm `.env` contains the deployed
  `VITE_CONTRACT_ADDRESS`, restart the development server, and select
  **Refresh** in the Public record.
- **The bid is rejected:** Check that the auction is open, has an available
  slot, and your amount meets the reserve. One auction-scoped bidder identity
  may commit only once.
- **The proof is taking time:** Keep the page and wallet open. Proof generation
  can take about a minute or longer on slower computers.
- **Settlement says an opening does not match:** Use the exact JSON package
  produced after each bid. Do not edit its slot, amount, salt, auction ID, or
  contract address.
- **Settlement is unavailable:** At least two bids and all corresponding
  opening packages are required. Only the creator's correct admin secret can
  authorize settlement.
- **An opening package was lost:** This prototype cannot reconstruct private
  witness data from the on-chain commitment. The auction cannot be settled
  with that bid included.
- **The admin secret was exposed:** Do not publish or commit it. For a fresh,
  unsettled auction, redeploy with a new private state file before accepting
  bids.
