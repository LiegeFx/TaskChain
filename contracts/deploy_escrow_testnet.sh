#!/usr/bin/env bash
set -euo pipefail

# Simple helper to build the escrow contract WASM and show how to deploy it
# to the Soroban / Stellar Testnet using the `soroban` CLI.
#
# Prerequisites:
#  - Rust + cargo (with wasm32 target installed)
#  - `soroban` CLI available in PATH
#  - SOROBAN_RPC_URL set (defaults to https://rpc.testnet.soroban.stellar.org)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACT_DIR="$ROOT_DIR/contracts/escrow"

echo "[escrow deploy] Building escrow contract..."
cd "$CONTRACT_DIR"

# Prefer standard cargo build for wasm target; the project Makefile also
# provides `stellar contract build` which may be available in some setups.
echo "[escrow deploy] Running cargo build (wasm32-unknown-unknown, release)"
cargo build --release --target wasm32-unknown-unknown || {
  echo "cargo build failed — you may need to run 'stellar contract build' or ensure wasm target is installed"
  exit 1
}

WASM_PATH="$CONTRACT_DIR/target/wasm32-unknown-unknown/release/escrow.wasm"
if [ ! -f "$WASM_PATH" ]; then
  echo "WASM not found at $WASM_PATH"
  exit 1
fi

SOROBAN_RPC_URL="${SOROBAN_RPC_URL:-https://rpc.testnet.soroban.stellar.org}"
export SOROBAN_RPC_URL
echo "[escrow deploy] Using SOROBAN_RPC_URL=$SOROBAN_RPC_URL"

if ! command -v soroban >/dev/null 2>&1; then
  echo "soroban CLI not found in PATH. Install from: https://github.com/stellar/soroban-tools"
  exit 1
fi

echo "\nBuilt WASM: $WASM_PATH"
echo "\nTo deploy the contract to the configured Soroban RPC, run:" 
echo "\n  soroban contract deploy --wasm $WASM_PATH\n"

echo "The `soroban contract deploy` command will submit a transaction and print the resulting contract ID and tx hash."
echo "After deployment, you can call the contract methods (fund, release, refund, etc.) using `soroban contract invoke`."

echo "If you want this script to run the deploy step automatically, set AUTO_DEPLOY=1 in the environment." 
if [ "${AUTO_DEPLOY:-0}" = "1" ]; then
  echo "[escrow deploy] AUTO_DEPLOY=1 detected — running deployment now..."
  soroban contract deploy --wasm "$WASM_PATH"
fi

echo "\nDone. See docs/soroban-escrow-deployment.md for full instructions and examples."
