# WSO2 Blockchain Node 02

Node 02 is an existing Clique sealer. It produces blocks and accepts already
signed transactions through a restricted Choreo endpoint. Geth delegates block
signing to Clef and does not unlock an account itself.

## Choreo endpoints

| Purpose | Port and protocol | Visibility |
| --- | --- | --- |
| Signed transaction RPC | `8545/TCP` (`REST`) | `Public` |
| Geth peer sessions | `30303/TCP` | `Project` |
| Geth peer discovery | `30303/UDP` | `Project` |
| Geth metrics | `6060/TCP` (`REST`) | `Project` |

The public endpoint must remain behind Choreo authentication and the approved
Cloudflare or load-balancer policy. Geth exposes only the `eth`, `net` and
`web3` namespaces. Gateway policy must allow only the required JSON-RPC methods
and apply request-size, rate, batch and client-identity limits.

## Runtime contract

The reviewed startup script and Clef rules are built into the image at
`/opt/digiops`. The deployment must meet all of these requirements:

- Preserve the existing `/data-directory` persistent volume. The script refuses
  to initialize a missing blockchain database.
- Set `NODE_ROLE=sealer`.
- Set `NODE_HOST` to the approved RPC hostname or comma-separated hostnames.
- Keep the existing sealer key and credential mounts during the Clef migration.
  The credential is consumed by Clef only; Geth receives no password.
- Use the approved `/startup-scripts/p2p.toml` static peer configuration.
- Never add `--unlock`, `--password` or `--allow-insecure-unlock` to Geth.
- Never expose `admin`, `personal`, `miner`, `debug`, `txpool` or `clique` over
  HTTP.
- Keep Clef IPC and Geth IPC local to the container.

Clef auto-approves only correctly identified Clique block headers for the
sealer address. It rejects normal transaction signing and arbitrary data
signing. Applications must sign wallet transactions before calling
`eth_sendRawTransaction`.

Clef metadata is stored below `/data-directory/clef`. Creating this directory
does not reinitialize or rewrite Geth chaindata, genesis, balances, contracts or
historical blocks.

## Verification

Deploy one sealer at a time. For every deployment, confirm all of the following
before continuing to another node:

1. The startup log reports that existing chaindata was preserved.
2. Clef opens only its local IPC socket and Geth reports `Using external signer`.
3. The node seals blocks and follows the canonical head.
4. `eth_sendTransaction` is denied.
5. `admin_stopHTTP`, `personal_sign` and other privileged methods are absent.
6. A signed zero-gas-price staging transaction is accepted and confirmed.
7. Metrics remain available only through the project-visible endpoint.
