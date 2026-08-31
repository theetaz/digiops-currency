# WSO2 Blockchain Node 03

Node 03 is an existing Clique sealer. For the controlled staging test, Choreo
temporarily publishes its JSON-RPC endpoint for reads, transaction submission
and contract deployment. Normal application traffic remains behind the
approved load balancer, which provides authentication and rate limiting. The
direct public endpoint must be disabled after the test.

## Choreo endpoints

| Purpose | Port and protocol | Visibility |
| --- | --- | --- |
| JSON-RPC | `8545/TCP` (`REST`) | `Public` |
| Geth peer sessions | `30303/TCP` | `Project` |
| Geth peer discovery | `30303/UDP` | `Project` |

The former metrics endpoint on port `6060` is intentionally not published for
this test. Chain progress and sealer participation are checked through
JSON-RPC and the local IPC socket. A dedicated metrics endpoint can be restored
later as a separate operational change if it is required.

## Runtime contract

The executable startup script is mounted by Choreo at
`/startup-scripts/node.sh`; it is not part of the container image. The
deployment must meet all of the following requirements:

- Preserve the existing `/data-directory` volume and never initialize over an
  existing `geth/chaindata` directory.
- Keep the approved Clique signer and static peer configuration.
- Listen for P2P traffic on port `30303` and use `--nodiscover` with the
  approved static peers.
- Listen for JSON-RPC on port `8545` with only the required `eth`, `net` and
  `web3` namespaces. Do not expose `admin`, `personal`, `debug`, `miner`,
  `txpool` or `clique` over HTTP.
- Keep the WSO2 token contract-owner private key outside the node. Owner
  transactions must be signed with that external key before submission.
- Treat JSON-RPC as transaction transport, not as authorization for the WSO2
  token contract. Arbitrary users may submit their own signed transactions or
  deploy their own contracts; the WSO2 contract continues to enforce its
  owner-only operation on-chain.
- This component does not filter methods inside the `eth` namespace. With Geth
  1.13.15, an in-process sealer that enables HTTP must explicitly allow its
  account to be unlocked, so `eth_sendTransaction` and `eth_sign` may use the
  sealer account. This is an accepted, temporary staging exception; it is not
  a production security control.
- Keep the sealer account separate from the WSO2 contract owner. Before
  deployment, verify that the sealer is not the value returned by `owner()`,
  has no WSO2 token balance, and has no allowance from any known WSO2-funded
  wallet. Stop the rollout without changing chain data if any check fails.
- Keep administrative access local to the IPC socket.

## Verification

Deploy one node at a time. Confirm that the existing chain data, WSO2 contract
address and deployed bytecode are unchanged; the canonical head advances; peer
connectivity remains healthy; and a signed staging transaction and an
independent test-contract deployment are confirmed. Verify that:

- `owner()` still returns the approved external owner address;
- a non-owner call to `mintTokens` reverts;
- the sealer has a zero WSO2 token balance and no allowance from known
  WSO2-funded wallets;
- the HTTP RPC modules exclude `admin`, `personal`, `debug`, `miner`, `txpool`
  and `clique`;
- recent blocks show expected sealer participation; and
- port `6060` is not published.
