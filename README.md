# Ethereum Wallet Seed Phrase Manager

A Deno-based tool for deriving multiple Ethereum wallet addresses from seed phrases and storing them in Deno KV.

## Features

- Load seed phrases from environment variables
- Derive wallet addresses using HD paths
- Store addresses in Deno KV for persistence
- Efficient batch processing of multiple seed phrases
- Performance monitoring and statistics

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
deno task seed-wallets
```

This will:
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

## Performance

Performance metrics from benchmark tests:

- Processing speed: ~130 wallets/second
- Time per wallet: ~7.7ms
- Deno KV storage overhead: ~1.1%

See the [task.md](./task.md) file for detailed benchmark results.

## Security Considerations

- Seed phrases are sensitive information. Never share your `.env` file.
- The `.gitignore` file is configured to prevent committing `.env` files.
- Use environment variables rather than hardcoding seed phrases.

## Architecture

- `seed_wallets.ts`: Main implementation file
- `seed_wallets.test.ts`: Test suite
- `seed_wallets_benchmark.ts`: Standalone benchmark
- `seed_wallets_benchmark.test.ts`: Comprehensive benchmark test suite

## License

MIT 