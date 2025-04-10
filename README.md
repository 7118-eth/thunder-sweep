# Ethereum Wallet Seed Phrase Manager

A Deno-based tool for deriving multiple Ethereum wallet addresses from seed phrases and storing them in Deno KV.

## Features

- Load seed phrases from environment variables
- Derive wallet addresses using HD paths
- Store addresses in Deno KV for persistence
- Efficient batch processing of multiple seed phrases
- Performance monitoring and statistics
- **Multi-threaded processing** for up to 8.5x faster wallet generation

## Prerequisites

- [Deno](https://deno.com/) installed (v1.36.0 or later)
- Basic understanding of seed phrases and HD wallets

## Installation

1. Clone this repository
2. Copy `.env.example` to `.env`
3. Add your seed phrases to the `.env` file (following the `SEED_PHRASE_N` pattern)

## Usage

### Seed Wallet Addresses

To derive wallet addresses from your seed phrases and store them:

```bash
# Sequential processing (standard)
deno task seed-wallets

# Multi-threaded processing (8.5x faster)
deno task seed-wallets-parallel
```

These commands will:
1. Load seed phrases from your `.env` file
2. Derive wallet addresses (default: 2000 addresses per seed phrase)
3. Store them in Deno KV with keys in the format: `["wallet_address", "seed_N", index]`

### Configuration

Adjust the following in the `.env` file:

```
SEED_PHRASE_1="your seed phrase here"
SEED_PHRASE_2="another seed phrase"
# Add more as needed
RPC_URL="https://mainnet.example.com"
```

### Run Tests

```bash
deno task test
```

### Run Performance Benchmarks

Simple benchmark (2000 addresses, single seed phrase):
```bash
deno task benchmark
```

Comprehensive benchmark suite:
```bash
deno task benchmark-test
```

Multi-threaded benchmark:
```bash
deno task benchmark-parallel
```

## Performance

We offer two implementation options for wallet generation:

### Sequential Processing
- Processing speed: ~130 wallets/second
- Time per wallet: ~7.7ms
- Good for smaller batches or limited hardware

### Multi-threaded Processing
- Processing speed: ~1140 wallets/second (with 16 cores)
- Time per wallet: ~0.9ms
- 8.5x faster than sequential processing
- Automatically scales with available CPU cores
- Uses Deno Workers for true parallelism

See the [task.md](./task.md) file for detailed benchmark results.

## Architecture

- `seed_wallets.ts`: Sequential implementation (single-threaded)
- `seed_wallets_parallel.ts`: Multi-threaded implementation using Deno Workers
- `wallet_worker.ts`: Worker file for parallel address derivation
- `seed_wallets.test.ts`: Test suite for wallet generation
- `seed_wallets_benchmark.ts`: Standalone benchmark
- `seed_wallets_benchmark.test.ts`: Comprehensive benchmark test suite
- `seed_wallets_parallel_benchmark.ts`: Multi-threaded benchmark suite

## Security Considerations

- Seed phrases are sensitive information. Never share your `.env` file.
- The `.gitignore` file is configured to prevent committing `.env` files.
- Use environment variables rather than hardcoding seed phrases.

## License

MIT 