# Task: Wallet Seed Phrase Loading and Derivation

**Status:** In Progress (Implementing TDD)

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
    *   Export core functions (`getSeedPhrasesFromEnv`, `seedWallets`).
    *   Modify `seedWallets` to accept parameters for dependencies (e.g., `kv: Deno.Kv`, `options: { maxAddressIndex: number }`).
    *   Modify `getSeedPhrasesFromEnv` to optionally accept an environment object for easier mocking (e.g., `getSeedPhrasesFromEnv(env = Deno.env.toObject())`).
    *   Wrap direct script execution logic in `if (import.meta.main)` check.
3.  **Write Tests (`seed_wallets.test.ts`):**
    *   **`getSeedPhrasesFromEnv` Tests:**
        *   Test with mocked env variables containing `SEED_PHRASE_N`.
        *   Test with no relevant env variables.
        *   Test with gaps in numbering (e.g., `SEED_PHRASE_1`, `SEED_PHRASE_3`).
    *   **`seedWallets` Tests (using in-memory KV):**
        *   Test successful seeding of a known mnemonic for a small range of indices (e.g., 0-2).
        *   Verify correct addresses are derived using `viem`.
        *   Verify correct keys and values are stored in the in-memory KV store.
        *   Test with multiple seed phrases.
        *   Test behavior when no seed phrases are provided.
        *   Test behavior with an invalid/short mnemonic (should skip/log error).
4.  **Implement/Adapt Logic (`seed_wallets.ts`):**
    *   Ensure the implementation of `getSeedPhrasesFromEnv` and `seedWallets` passes all tests written in the previous step.
    *   Adapt the existing logic to match the refactored function signatures.
5.  **Final Review & Documentation:**
    *   Review code for clarity, security, and adherence to constraints.
    *   Add necessary comments.
    *   Ensure `task.md` is up-to-date.

**Next Steps:**

*   Execute **Task 2: Refactor for Testability**. 