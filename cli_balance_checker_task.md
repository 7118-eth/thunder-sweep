# Task: Multi-Wallet Balance Checker CLI

**Status:** Pending ⏳ 

**Goal:** Build a comprehensive command-line interface (CLI) tool that can efficiently check ETH and ERC20 token balances for large numbers of wallet addresses derived from seed phrases, with summarization capabilities.

## Core Features

1. **ETH Balance Checking**:
   - Fetch native ETH balances for multiple wallets using multicall
   - Optimize for RPC performance based on benchmarking findings
   - Provide summary statistics (total ETH, average per wallet, etc.)

2. **ERC20 Token Balance Checking**:
   - Support configurable token addresses via environment variables
   - Use multicall to efficiently batch token balance requests 
   - Calculate token balances with proper decimal handling

3. **Comprehensive Output**:
   - Detailed balance report with options for different formats (console, CSV, JSON)
   - Summarized totals for quick portfolio overview
   - Filter options to identify wallets meeting specific criteria

4. **Performance Optimization**:
   - Leverage parallelized wallet generation for setup
   - Auto-select optimal batch sizes based on wallet count
   - Implement smart error handling and retries for RPC resilience

## Technical Requirements

### Environment Variables

```
# Required
SEED_PHRASE_1="your test seed phrase here with twelve words or more"
RPC_URL="https://your-base-rpc-endpoint"
TOKEN_ADDRESS="0xYourTokenAddress"  # Required unless using --eth-only

# Optional - Add more seed phrases
SEED_PHRASE_2="another seed phrase if needed"
SEED_PHRASE_3="yet another seed phrase"

# Optional - Multiple tokens
TOKEN_ADDRESSES="0xFirstToken,0xSecondToken,0xThirdToken"  # Alternative to TOKEN_ADDRESS
```

### Command-Line Arguments

The CLI should support the following command-line arguments:

```
--max-wallets=N         Maximum number of wallets to check per seed phrase (default: 100)
--format=[text|csv|json] Output format (default: text)
--output=FILE           Write output to specified file
--eth-only              Only check ETH balances, skip tokens
--token-only            Only check token balances, skip ETH
--summary-only          Only show summary statistics, not individual wallets
--min-balance=X         Only show wallets with balance >= X
--batch-size=N          Override auto-selected batch size
--workers=N             Number of worker threads (default: CPU cores)
--verbose               Show detailed progress information
```

### Technical Design

1. **Modular Architecture**:
   - `balance_checker.ts`: Main module coordinating all operations
   - `eth_balance.ts`: ETH balance checking functionality 
   - `token_balance.ts`: ERC20 token balance checking functionality
   - `wallet_generator.ts`: Multi-threaded wallet generation
   - `formatting.ts`: Output formatting utilities

2. **ERC20 Token Handling**:
   - Use standard ERC20 ABI for `balanceOf` function calls
   - Support automatic decimal detection via `decimals()` method
   - Handle human-readable formatting with proper decimal places

3. **Performance Considerations**:
   - Parallelize wallet address generation
   - Use optimal batch sizes for ETH and token calls
   - Implement request chunking for very large wallet collections

## Implementation Tasks

1. **Setup & Structure**:
   - Create main CLI entry point
   - Setup command-line argument parsing
   - Implement configuration from environment variables

2. **ETH Balance Module**:
   - Leverage existing multicall functionality
   - Implement ETH balance summarization
   - Create formatting options for ETH balances

3. **ERC20 Token Balance Module**:
   - Implement token ABI for multicall
   - Create token info detection (symbol, decimals)
   - Support multiple token addresses
   - Handle token balance summarization

4. **Integration & CLI**:
   - Combine ETH and token balance checking
   - Implement various output formats
   - Create filtering and sorting options
   - Add progress reporting

5. **Testing & Documentation**:
   - Write tests for all major components
   - Create comprehensive usage documentation
   - Include examples for common scenarios

## ERC20 Implementation Details

### Token ABI (Required Methods)

```json
[
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "symbol",
    "outputs": [{"name": "", "type": "string"}],
    "type": "function"
  }
]
```

### Multicall Implementation for Tokens

For token balance fetching, the implementation will:

1. First fetch token metadata (symbol, decimals) for each token address
2. Create multicall batches for `balanceOf` calls to each token contract
3. Process raw balance results with proper decimal handling
4. Combine with ETH balance data for comprehensive reporting

### Performance Target

The implementation should maintain high performance even with:
- Multiple seed phrases (5+)
- Large wallet counts (1000+ per seed phrase)
- Multiple token contracts (5+)

## Success Criteria

1. **Functionality**:
   - Successfully retrieves accurate ETH balances
   - Correctly fetches and displays ERC20 token balances
   - Handles large numbers of wallets efficiently

2. **Performance**:
   - Similar retrieval speeds to the benchmark results
   - Linear scaling with wallet count
   - Efficient error handling and retries

3. **Usability**:
   - Clear, readable console output
   - Useful summary statistics
   - Multiple output format options

## Example Usage

```bash
# Basic usage - check ETH and token balances (TOKEN_ADDRESS must be set in .env)
deno run --allow-net --allow-env --allow-read wallet_balance_cli.ts

# Check ETH only (no token balance checking)
deno run --allow-net --allow-env --allow-read wallet_balance_cli.ts --max-wallets=500 --eth-only --summary-only

# Check token balances only, export as CSV (TOKEN_ADDRESS must be set in .env)
deno run --allow-net --allow-env --allow-read wallet_balance_cli.ts --token-only --format=csv --output=token_balances.csv

# Check multiple tokens with detailed output
TOKEN_ADDRESSES="0xFirstTokenAddress,0xSecondTokenAddress" \
deno run --allow-net --allow-env --allow-read wallet_balance_cli.ts --verbose
```

## Example Output (Console Format)

```
Wallet Balance Report
=====================
Generated: 2023-05-15T12:34:56Z
Seed Phrases: 2
Wallets Checked: 200

ETH Balances:
-------------
Total ETH: 1.45623 ETH
Average: 0.00728 ETH
Min: 0.00000 ETH
Max: 0.12500 ETH
Non-zero Wallets: 156/200 (78.0%)

Token Balances:
--------------
NAME (0x546D...adc7):
  Total: 5,240.50 NAME
  Average: 26.20 NAME
  Min: 0.00 NAME
  Max: 245.75 NAME
  Non-zero Wallets: 180/200 (90.0%)

Top Wallets by ETH Balance:
--------------------------
1. 0xf5a2...e8f9: 0.12500 ETH, 120.50 NAME
2. 0x49b3...7c21: 0.08750 ETH, 240.00 NAME
3. 0x7dfc...2b14: 0.07500 ETH, 85.25 NAME
4. 0x4e9c...a3d2: 0.06250 ETH, 0.00 NAME
5. 0x71e5...9f87: 0.05625 ETH, 180.00 NAME
``` 