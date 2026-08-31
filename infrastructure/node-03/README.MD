# WSO2 Blockchain Node 03

Node 03 is an existing Clique sealer. Choreo publishes an authenticated
JSON-RPC endpoint for chain reads and already-signed transaction submission.
Contract-owner keys remain outside the node.

## Choreo endpoints

| Purpose | Port and protocol | Visibility |
| --- | --- | --- |
| JSON-RPC | `8545/TCP` (`REST`) | `Public` |
| Geth peer sessions | `30303/TCP` | `Project` |
| Geth peer discovery | `30303/UDP` | `Project` |

The former metrics endpoint on port `6060` is not published.

## Runtime contract

The executable startup script is mounted by Choreo at
`/startup-scripts/node.sh`; it is not part of the container image. The
deployment must meet all of the following requirements:

- Preserve the existing `/data-directory` volume and never initialize over an
  existing `geth/chaindata` directory.
- Keep the approved Clique signer and static peer configuration.
- Listen for P2P traffic on port `30303` and use `--nodiscover` with the
  approved static peers.
- Listen for JSON-RPC on port `8545` with only the required `eth`, `net`
  and `web3` namespaces.
- Keep the endpoint behind Choreo authentication and the approved gateway or
  load balancer. Permit required read methods and `eth_sendRawTransaction`;
  reject `eth_sendTransaction`, signing methods and privileged namespaces.
- Keep contract-owner private keys outside the node. Applications must sign
  transactions before submission.
- Keep administrative access local to the IPC socket.

## Verification

Deploy one node at a time. Confirm that the existing chain data is retained,
the canonical head advances, peer connectivity remains healthy, authenticated
reads work and a signed staging transaction is confirmed. Verify that
`eth_sendTransaction`, signing and privileged methods are rejected and that
port `6060` is not published.
