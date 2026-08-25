# WSO2 Blockchain Node 05

Node 05 is a sealer. It holds an authorized Clique signer account and produces
blocks. It must not serve JSON-RPC traffic.

## Choreo endpoints

| Purpose | Port and protocol | Visibility |
| --- | --- | --- |
| Geth peer sessions | `30303/TCP` | `Project` |
| Geth peer discovery | `30303/UDP` | `Project` |
| Geth metrics | `6060/TCP` (`REST`) | `Project` |

There is deliberately no endpoint for JSON-RPC port `8545`.

## Runtime contract

The executable startup script is mounted by Choreo at
`/startup-scripts/node.sh`; it is not part of the container image. The deployed
sealer configuration must meet all of the following requirements:

- Keep the existing `/data-directory` persistent volume. Never initialize over
  an existing `geth/chaindata` directory.
- Set `NODE_ROLE=sealer` and retain the approved key and password mounts.
- Listen for P2P traffic on port `30303` and use the approved static peers.
- When static peers are used, start Geth with `--nodiscover`. UDP remains
  project-visible for compatibility with environments that still use discovery.
- Do not use `--http`, `--http.addr`, `--http.port`, `--http.api` or
  `--allow-insecure-unlock`. Administrative access is local IPC only.
- Enable the dedicated metrics listener with
  `--metrics --metrics.addr 0.0.0.0 --metrics.port 6060`.

The security-relevant part of the Geth command must include:

```sh
geth \
  --datadir /data-directory \
  --ipcpath /startup-scripts/geth.ipc \
  --networkid 10000 \
  --nodiscover \
  --port 30303 \
  --mine \
  --miner.etherbase "$ACCOUNT" \
  --unlock "$ACCOUNT" \
  --password /startup-scripts/password.txt \
  --metrics \
  --metrics.addr 0.0.0.0 \
  --metrics.port 6060
```

This excerpt documents the security-sensitive flags and is not a replacement
for the complete, reviewed startup script.

## Verification

Deploy one sealer at a time. Through local IPC, verify the expected signer,
peer count and advancing canonical head. Confirm that
`/debug/metrics/prometheus` responds on port `6060` from the Choreo project and
that no public or project endpoint exists for port `8545`.
