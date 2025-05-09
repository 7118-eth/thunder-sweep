# Task: Wallet Seed Phrase Loading and Derivation

**Status:** Completed ✅

**Goal:** Load seed phrases from an environment file (`.env`), derive multiple wallet addresses using `viem`'s mnemonic-to-account functionality, and store these addresses in Deno KV. Development follows a Test-Driven Development (TDD) approach.

**Core Technologies:**

*   **Deno:** Runtime environment.
*   **Deno KV:** Built-in key-value store for persistence.
*   **Viem:** (Imported via `deno.json` imports) Library for Ethereum interactions, specifically `mnemonicToAccount`.

**Rules & Constraints:**

*   **Minimize Dependencies:** While `viem` is used, avoid other unnecessary external dependencies.
*   **Security:** Handle seed phrases securely. Do not commit `.env` files containing real seed phrases to version control. `.gitignore` is configured.
*   **Environment Variables:** Use `.env` file for storing seed phrases (e.g., `SEED_PHRASE_N`) and the `RPC_URL`. Deno's built-in `.env` support (`jsr:@std/dotenv/load`) will be used. [Deno Env Vars Doc](https://docs.deno.com/runtime/reference/env_variables/)
*   **Persistence:** Use Deno KV for storing derived wallet addresses. [Deno KV Docs](https://docs.deno.com/deploy/kv/manual/)
*   **Derivation:** Use `viem`'s `mnemonicToAccount` function to derive addresses based on a standard HD path (`m/44'/60'/0'/0/${addressIndex}`). [Viem Mnemonic Docs](https://viem.sh/docs/accounts/local/mnemonicToAccount)
*   **Testing (TDD):** Development follows TDD. Tests are written *before* or *alongside* implementation in `seed_wallets.test.ts`. Use Deno's built-in test runner (`deno test`). Tests involving KV must use an in-memory store (`Deno.openKv(":memory:")`) for isolation. Mock environment variables where necessary.
*   **Testability:** Code in `seed_wallets.ts` must be structured for testability (e.g., pure functions, dependency injection).

**Tasks (TDD Order):**

1.  **Setup & Basic Structure:**
    *   Define `.env` structure (`SEED_PHRASE_N`, `RPC_URL`). ✅
    *   Create `.env.example`. ✅ (Updated with RPC_URL)
    *   Configure `.gitignore`. ✅
    *   Setup `deno.json` (imports, tasks `seed-wallets`, `test`). ✅
    *   Create initial `seed_wallets.ts` and `seed_wallets.test.ts`. ✅
2.  **Refactor for Testability (`seed_wallets.ts`):**
    *   Export core functions (`getSeedPhrasesFromEnv`, `seedWallets`). ✅
    *   Modify `seedWallets` to accept parameters for dependencies (e.g., `kv: Deno.Kv`, `options: { maxAddressIndex: number }`). ✅
    *   Modify `getSeedPhrasesFromEnv` to optionally accept an environment object for easier mocking (e.g., `getSeedPhrasesFromEnv(env = Deno.env.toObject())`). ✅
    *   Wrap direct script execution logic in `if (import.meta.main)` check. ✅
3.  **Write Tests (`seed_wallets.test.ts`):**
    *   **`getSeedPhrasesFromEnv` Tests:** ✅
        *   Test with mocked env variables containing `SEED_PHRASE_N`. ✅
        *   Test with no relevant env variables. ✅
        *   Test with gaps in numbering (e.g., `SEED_PHRASE_1`, `SEED_PHRASE_3`). ✅
    *   **`seedWallets` Tests (using in-memory KV):** ✅
        *   Test successful seeding of a known mnemonic for a small range of indices (e.g., 0-2). ✅
        *   Verify correct addresses are derived using `viem`. ✅
        *   Verify correct keys and values are stored in the in-memory KV store. ✅
        *   Test with multiple seed phrases. ✅
        *   Test behavior when no seed phrases are provided. ✅
        *   Test behavior with an invalid/short mnemonic (should skip/log error). ✅
4.  **Implement/Adapt Logic (`seed_wallets.ts`):** ✅
    *   Ensure the implementation of `getSeedPhrasesFromEnv` and `seedWallets` passes all tests written in the previous step. ✅
    *   Adapt the existing logic to match the refactored function signatures. ✅
5.  **Performance Benchmark:** ✅
    *   Create a benchmark test that loads 2000 wallets per seed phrase. ✅
    *   Include live statistics during the benchmark (elapsed time, wallets generated per second). ✅
    *   Measure and report total execution time. ✅
    *   Identify any performance bottlenecks and optimize if necessary. ✅
    
    **Sequential Benchmark Results:**
    *   **Single Seed Phrase (1500 addresses):**
        * Processing speed: ~130 wallets/second
        * Time per wallet: ~7.7ms
        * Total time for 1500 addresses: ~11.6 seconds
    
    *   **Multiple Seed Phrases (2 phrases, 600 addresses each):**
        * Processing speed: ~127 wallets/second  
        * Time per wallet: ~7.8ms
        * Total time for 1200 addresses: ~9.4 seconds
        
    *   **Storage Overhead Analysis:**
        * Pure wallet derivation time: 3.79s (for 500 addresses)
        * Derivation + KV storage time: 3.83s (for 500 addresses) 
        * Storage overhead: ~1.1%
        * KV storage adds minimal overhead to the process
    
    **Multi-threaded Benchmark Results:**
    *   **Optimal Configuration (16 CPU cores, batch size of 50):**
        * Processing speed: ~1140 wallets/second
        * Time per wallet: ~0.9ms
        * Total time for 2000 addresses: ~1.75 seconds
        * Performance improvement: 8.54x faster than sequential processing
        
    *   **Batch Size Analysis:**
        * Small batch sizes (50-200) performed best
        * Larger batch sizes (500-1000) performed worse
        * Batch size of 50 was optimal in testing
        
    *   **CPU Utilization:**
        * Performance scales with available CPU cores
        * Implementation uses Deno Workers for true parallelism
        * 16 cores processed wallets 8.5x faster than single-threaded version
        
    **Performance Conclusions:**
    * The CPU-bound nature of wallet derivation makes it ideal for parallelization
    * Multi-threaded implementation with Deno Workers dramatically improves performance
    * Deno KV storage overhead is minimal (~1.1%)
    * Small, evenly-distributed batches yield optimal performance
    * For production use, the multi-threaded implementation is strongly recommended

6.  **Final Review & Documentation:** ✅
    *   Review code for clarity, security, and adherence to constraints. ✅
    *   Add necessary comments. ✅
    *   Ensure `task.md` is up-to-date. ✅
    *   Create README.md with usage instructions. ✅
    *   Add multi-threaded implementation option. ✅

7.  **ETH Balance Multicall Benchmark:** ✅
    *   Create a benchmark script to test RPC limits for ETH balance multicalls on Base network. ✅
    *   Implement parallel wallet address generation for optimal performance. ✅
    *   Test with incrementally increasing wallet counts until the RPC endpoint fails. ✅
    *   Measure and report key metrics (requests per second, response time). ✅
    *   Export results to CSV for further analysis. ✅
    
    **Multicall Benchmark Features:**
    *   **Parallelized Wallet Generation:**
        * Uses Deno Workers for multi-CPU wallet address generation
        * Significantly reduces setup time before testing
        * Dynamically adapts to available CPU cores
    
    *   **Batch Size Optimization:**
        * Tests multiple batch sizes (1024, 2048, 4096, 8192, 16384 bytes)
        * Automatically selects the most efficient batch size for each test
        * Reports the optimal batch size settings
    
    *   **RPC Stress Testing:**
        * Incrementally increases wallet counts to find the RPC breaking point
        * Implements backoff and retry strategies for reliable testing
        * Provides detailed error reporting when failures occur
    
    *   **Performance Metrics:**
        * Measures response time and requests per second
        * Calculates maximum successful wallet count
        * Provides CSV export for detailed analysis
        
    *   **Configuration Options:**
        * Command-line flags (--csv, --detailed)
        * Environment variables for customization
        * Adjustable retry logic and delay settings

**Next Steps:**

*   Project complete and ready for production use 