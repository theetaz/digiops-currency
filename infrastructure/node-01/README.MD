# WSO2 Blockchain Node 01

Node 01 is a keyless RPC reader. It serves application requests but does not
hold or unlock a sealer account and does not produce blocks.

## Choreo endpoints

| Purpose | Port and protocol | Visibility |
| --- | --- | --- |
| Application JSON-RPC | `8545/TCP` (`REST`) | `Public`, behind the approved gateway and load balancer |
| Geth peer sessions | `30303/TCP` | `Project` |
| Geth peer discovery | `30303/UDP` | `Project` |

## Runtime contract

The executable startup script is mounted by Choreo at
`/startup-scripts/node.sh`; it is not part of the container image. The deployed
reader configuration must meet all of the following requirements:

- Keep the existing `/data-directory` persistent volume. Never initialize over
  an existing `geth/chaindata` directory.
- Set `NODE_ROLE=rpc`.
- Do not load a key, unlock an account, use `--mine`, or use
  `--allow-insecure-unlock`.
- Listen for P2P traffic on port `30303` and use the approved static peers.
- When static peers are used, start Geth with `--nodiscover`. UDP remains
  project-visible for compatibility with environments that still use discovery.
- Serve HTTP on port `8545` with only `eth,net,web3` enabled. Do not expose
  `admin`, `personal`, `miner`, `debug` or `txpool` over HTTP.
- Restrict `--http.vhosts` and `--http.corsdomain` to the approved node hostname
  and wallet origin.

## Verification

Before adding the reader to the load balancer, verify that `eth_chainId` is
`0x2710`, `eth_syncing` is `false`, `net_peerCount` is greater than zero and
`eth_accounts` returns an empty array. Administrative RPC methods must be
unavailable.
