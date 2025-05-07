# ⚡ ThunderSweep ⚡

The **fastest** publicly available multi-wallet management solution, built with TypeScript and Deno. ThunderSweep leverages multi-threading (JS Workers) and multicall technology to achieve unparalleled performance for massive wallet operations.

## ✨ Features

- 🔑 Load seed phrases from environment variables
- 👛 Derive multiple wallet addresses per seed phrase at lightning speed
- 💾 Store addresses in Deno KV for persistence
- 📊 Benchmark wallet derivation performance (up to ~1140 wallets/second)
- 🚀 Test RPC limits with ETH balance multicall benchmark
- 🧵 Multi-threaded architecture using Deno Workers for maximum performance
- ⚙️ Optimized multicall implementation for gathering balances

## 🛠️ Prerequisites

- [Deno](https://deno.land/) installed (version 1.36.0 or newer)
- Access to a EVM network RPC endpoint

## Environment Setup

Create a `.env` file with your seed phrases, RPC URL, and token address:

```
SEED_PHRASE_1="your test seed phrase here with twelve words or more"
SEED_PHRASE_2="another seed phrase if needed for testing multiple"
RPC_URL="https://your-base-rpc-endpoint"
TOKEN_ADDRESS="0xYourTokenAddress"  # Required when checking token balances
# Optional: Multiple token addresses
# TOKEN_ADDRESSES="0xFirstTokenAddress,0xSecondTokenAddress,0xThirdTokenAddress"
```

## Usage

### Wallet Derivation

Derive wallet addresses from seed phrases and store in Deno KV:

```bash
# Sequential version
deno run --allow-net --allow-env --allow-read seed_wallets.ts

# Parallel version (multi-threaded)
deno run --allow-net --allow-env --allow-read seed_wallets_parallel.ts
```

### ETH Balance Multicall Benchmark

Test how many wallet ETH balances can be fetched in a single multicall before the RPC endpoint breaks:

```bash
# Basic benchmark
deno run --allow-net --allow-env --allow-read --allow-write eth_balance_multicall_benchmark.ts

# With CSV export
deno run --allow-net --allow-env --allow-read --allow-write eth_balance_multicall_benchmark.ts --csv

# With detailed output
deno run --allow-net --allow-env --allow-read --allow-write eth_balance_multicall_benchmark.ts --detailed
```

#### Benchmark Configuration

The ETH balance benchmark can be configured via environment variables:

```
# Optional configuration
START_WALLET_COUNT=50
MAX_WALLET_COUNT=10000
WALLET_COUNT_INCREMENT=50
RETRY_COUNT=3
WORKER_COUNT=8     # Number of CPU threads to use (defaults to CPU core count)
WALLET_BATCH_SIZE=100   # Wallet addresses per batch
```

You can also override batch sizes with:

```
BATCH_SIZE_1024=1000  # Override the 1024-byte batch size to 1000
BATCH_SIZE_2048=2000  # etc.
```

## 🔥 Performance

### Wallet Derivation Performance

- **Sequential:** ~130 wallets/second
- **Parallel (16 cores):** ~1140 wallets/second (8.5x faster than single-threaded alternatives)

### ETH Balance Multicall

Our optimized multicall implementation can process thousands of wallet balances in a single request, dramatically outperforming traditional one-by-one API calls by up to 100x.

## 🧪 Testing

Run the tests with:

```bash
deno test --allow-net --allow-env
```

## ⚠️ Disclaimer

⚡ ThunderSweep is provided as-is without any warranties. Users are responsible for their own actions and should use this tool in compliance with all applicable laws and regulations. This software is designed for legitimate wallet management and testing purposes only. The developers are not responsible for any misuse, damage, or legal issues arising from the use of this tool.

## 📜 License

MIT 