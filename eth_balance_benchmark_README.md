# Ethereum Balance Multicall Benchmark

A benchmark tool to test how many wallet balances can be retrieved in a single multicall before the RPC endpoint breaks.

## Features

- Tests increasingly large batches of wallet addresses
- Measures performance in requests per second
- Tests different batch sizes to find optimal settings
- CSV export option for data analysis
- Configurable via environment variables or command-line arguments
- Designed for Base network but can be used on any EVM chain

## Prerequisites

- [Deno](https://deno.land/) installed
- Access to a Base network RPC endpoint
- A seed phrase for generating test wallet addresses

## Environment Variables

Create a `.env` file with the following variables:

```
RPC_URL="https://your-base-rpc-endpoint"
SEED_PHRASE_1="your test seed phrase here"

# Optional configuration
START_WALLET_COUNT=50
MAX_WALLET_COUNT=10000
WALLET_COUNT_INCREMENT=50
RETRY_COUNT=3
```

## Usage

Run the benchmark with default settings:

```bash
deno run --allow-net --allow-env --allow-read eth_balance_multicall_benchmark.ts
```

### Command-line Options

- `--csv`: Export results to a CSV file (benchmark_results.csv)
- `--detailed`: Show detailed output of each batch size test

### Advanced Configuration

You can override batch sizes by setting environment variables:

```
BATCH_SIZE_1024=1000  # Override the 1024 batch size to 1000
BATCH_SIZE_2048=2000  # etc.
```

## Example Output

```
Starting ETH balance multicall benchmark on Base network
RPC URL: https://lb.drpc.org/ogrpc?network=base&dkey=...
Configuration: Start=50, Max=10000, Increment=50
Batch sizes to test: 1024, 2048, 4096, 8192, 16384
-----------------------------------------------------
| Wallet Count | Batch Size | Success | Time (ms) | Req/s     |
|-------------|------------|---------|-----------|-----------|
| 50          | 1024       | ✓       | 320.45    | 156.03    |
| 100         | 1024       | ✓       | 428.72    | 233.25    |
| 150         | 2048       | ✓       | 512.36    | 292.76    |
...
| 5000        | 4096       | ✓       | 3245.67   | 1540.52   |
| 5050        | Failed     | ✗       | 0.00      | 0.00      |
| 5010        | 4096       | ✓       | 3298.45   | 1518.91   |
| 5020        | Failed     | ✗       | 0.00      | 0.00      |
-----------------------------------------------------
Maximum successful wallet count: 5010
Benchmark complete.
```

## Interpreting Results

- **Wallet Count**: Number of wallet addresses being queried
- **Batch Size**: The bytes size limit used for multicall chunking 
- **Success**: Whether the request succeeded (✓) or failed (✗)
- **Time (ms)**: How long the request took in milliseconds
- **Req/s**: Requests per second (wallet balances retrieved per second)

The final "Maximum successful wallet count" shows the maximum number of wallet balances that could be retrieved in a single multicall.

## Tips

- If you're hitting rate limits, try increasing the retry delay between tests
- Different RPC providers may have different limits
- Paid RPC providers typically have higher limits than free ones
- Results can vary based on network congestion 