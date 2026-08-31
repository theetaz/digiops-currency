#!/bin/sh
# Hardened startup for an existing WSO2 Clique sealer with public, signed
# transaction submission. Geth delegates block signing to Clef; Geth itself
# never unlocks an account and never receives a key password.

set -eu

DATADIR=/data-directory
GETH_IPC=/startup-scripts/geth.ipc
P2P_CONFIG=/startup-scripts/p2p.toml
KEY_FILE="$DATADIR/keystore/key"
KEY_PASSWORD_FILE=/startup-scripts/password.txt
CLEF_CONFIG_DIR="$DATADIR/clef"
CLEF_IPC_DIR="$CLEF_CONFIG_DIR/run"
CLEF_IPC="$CLEF_IPC_DIR/clef.ipc"
CLEF_RULE_TEMPLATE=/opt/digiops/clef-rules.js
CLEF_RULES="$CLEF_CONFIG_DIR/rules.js"

if [ "${NODE_ROLE:-}" != "sealer" ]; then
    echo "[startup] ERROR: this component requires NODE_ROLE=sealer"
    exit 64
fi

: "${NODE_HOST:?NODE_HOST must contain the approved RPC host name(s)}"

# Existing sealers must never initialize a new chain or replace their database.
if [ ! -d "$DATADIR/geth/chaindata" ]; then
    echo "[startup] ERROR: existing chaindata is missing; refusing genesis init"
    exit 65
fi
echo "[startup] Existing chaindata found; preserving it"

if [ ! -s "$P2P_CONFIG" ] || \
   ! grep -Eq '^\[Node\.P2P\][[:space:]]*$' "$P2P_CONFIG" || \
   ! grep -Eq '^StaticNodes[[:space:]]*=[[:space:]]*\[' "$P2P_CONFIG"; then
    echo "[startup] ERROR: valid P2P.StaticNodes configuration is required"
    exit 72
fi

if [ ! -s "$KEY_FILE" ] || [ ! -s "$KEY_PASSWORD_FILE" ]; then
    echo "[startup] ERROR: the sealer key or Clef credential mount is missing"
    exit 69
fi

ACCOUNT=$(grep -o '"address":"[0-9A-Fa-f]*"' "$KEY_FILE" | head -n 1 | cut -d'"' -f4)
if [ "${#ACCOUNT}" -ne 40 ] || ! printf '%s\n' "$ACCOUNT" | grep -Eq '^[0-9A-Fa-f]{40}$'; then
    echo "[startup] ERROR: invalid sealer account in key file"
    exit 70
fi
ACCOUNT="0x$(printf '%s' "$ACCOUNT" | tr '[:upper:]' '[:lower:]')"

mkdir -p "$CLEF_CONFIG_DIR"
mkdir -p "$CLEF_IPC_DIR"
chmod 700 "$CLEF_CONFIG_DIR"
chmod 700 "$CLEF_IPC_DIR"

# A dedicated Clef master-password file can be mounted for production. Staging
# falls back to the existing keystore password file so no secret value is
# copied into the image or source repository.
CLEF_MASTER_PASSWORD_FILE=${CLEF_MASTER_PASSWORD_FILE:-$KEY_PASSWORD_FILE}
if [ ! -s "$CLEF_MASTER_PASSWORD_FILE" ]; then
    echo "[startup] ERROR: Clef master-password file is missing"
    exit 73
fi

KEY_PASSWORD=$(sed -n '1p' "$KEY_PASSWORD_FILE")
CLEF_MASTER_PASSWORD=$(sed -n '1p' "$CLEF_MASTER_PASSWORD_FILE")
if [ -z "$KEY_PASSWORD" ] || [ -z "$CLEF_MASTER_PASSWORD" ]; then
    echo "[startup] ERROR: an empty signing credential was supplied"
    exit 74
fi

# Clef state is additive metadata under the existing persistent volume. Chain
# data, genesis, balances, contracts and historical blocks are not modified.
if [ ! -s "$CLEF_CONFIG_DIR/masterseed.json" ]; then
    echo "[startup] Initializing the Clef credential vault"
    printf '%s\n%s\n' "$CLEF_MASTER_PASSWORD" "$CLEF_MASTER_PASSWORD" | \
        clef --keystore "$DATADIR/keystore" \
             --configdir "$CLEF_CONFIG_DIR" \
             --chainid 10000 \
             --nousb \
             --suppress-bootwarn init
fi

# Store the keystore credential inside Clef's encrypted vault. Geth does not
# receive this password and does not unlock the account.
printf '%s\n%s\n%s\n' \
    "$KEY_PASSWORD" "$KEY_PASSWORD" "$CLEF_MASTER_PASSWORD" | \
    clef --keystore "$DATADIR/keystore" \
         --configdir "$CLEF_CONFIG_DIR" \
         --chainid 10000 \
         --nousb \
         --suppress-bootwarn setpw "$ACCOUNT"

sed "s/__SEALER_ACCOUNT__/$ACCOUNT/g" "$CLEF_RULE_TEMPLATE" > "$CLEF_RULES"
chmod 600 "$CLEF_RULES"
RULE_HASH=$(sha256sum "$CLEF_RULES" | cut -d' ' -f1)
printf '%s\n' "$CLEF_MASTER_PASSWORD" | \
    clef --keystore "$DATADIR/keystore" \
         --configdir "$CLEF_CONFIG_DIR" \
         --chainid 10000 \
         --nousb \
         --suppress-bootwarn attest "$RULE_HASH"

rm -f "$CLEF_IPC"
printf '%s\n' "$CLEF_MASTER_PASSWORD" | \
    clef --keystore "$DATADIR/keystore" \
         --configdir "$CLEF_CONFIG_DIR" \
         --chainid 10000 \
         --nousb \
         --rules "$CLEF_RULES" \
         --ipcpath "$CLEF_IPC_DIR" \
         --auditlog "$CLEF_CONFIG_DIR/audit.log" \
         --suppress-bootwarn &
CLEF_PID=$!

# The loop exits as soon as the local signer socket exists. It also fails fast
# if Clef terminates; no timed sleep is used during container startup.
while [ ! -S "$CLEF_IPC" ]; do
    if ! kill -0 "$CLEF_PID" 2>/dev/null; then
        echo "[startup] ERROR: Clef stopped before opening its IPC socket"
        exit 75
    fi
done

unset KEY_PASSWORD CLEF_MASTER_PASSWORD
echo "[startup] Starting Clef-backed sealer $ACCOUNT with restricted HTTP RPC"

/opt/digiops/rpc-filter &
RPC_FILTER_PID=$!
if ! kill -0 "$RPC_FILTER_PID" 2>/dev/null; then
    echo "[startup] ERROR: restricted RPC ingress failed to start"
    exit 76
fi

exec geth \
    --config "$P2P_CONFIG" \
    --datadir "$DATADIR" \
    --ipcpath "$GETH_IPC" \
    --signer "$CLEF_IPC" \
    --networkid 10000 \
    --nodiscover \
    --port 30303 \
    --authrpc.port 8552 \
    --syncmode full \
    --cache 1024 \
    --txpool.pricelimit 0 \
    --txpool.globalslots 20000 \
    --txpool.globalqueue 5000 \
    --mine \
    --miner.etherbase "$ACCOUNT" \
    --miner.gasprice 0 \
    --http \
    --http.addr 127.0.0.1 \
    --http.port 8546 \
    --http.api eth,net,web3 \
    --http.vhosts localhost \
    --rpc.gascap 5000000 \
    --rpc.batch-request-limit 20 \
    --rpc.batch-response-max-size 1000000 \
    --verbosity 3 \
    --metrics \
    --metrics.addr 0.0.0.0 \
    --metrics.port 6060
