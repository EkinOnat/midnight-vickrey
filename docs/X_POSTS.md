# Vickrey Launch Posts

The production demo is live at `https://midnight-vickrey.vercel.app`.

## Tweet 1 — Product and Midnight

VICKREY brings sealed-bid, second-price auctions to Midnight: the highest bid
wins, the second-highest sets the price, and a ZK proof makes the result
verifiable. Bids stay off-chain; trusting the auctioneer is no longer part of
settlement. #MidnightNetwork

## Tweet 2 — Privacy Model

VICKREY commits each bid as a hash of the auction, slot, bidder tag, amount and
salt. At settlement, a Compact circuit proves every opening matches, ranks the
bids, and publishes only the winner tag + second price. Amounts and salts never
go on-chain. #ZK

## Tweet 3 — Try the Demo

VICKREY is live on Midnight Preprod. Connect Lace, submit a sealed bid, save
your private opening package, and watch a second-price result become publicly
provable—without publishing the bid book. Try it: https://midnight-vickrey.vercel.app
#MidnightNetwork
