# Task: Wallet Seed Phrase Loading and Derivation

**Status:** To Do

**Goal:** Load seed phrases from an environment file (`.env`), derive multiple wallet addresses using `viem`'s mnemonic-to-account functionality, and store these addresses in Deno KV.

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
*   **Testing:** Use Deno's built-in test runner (`deno test`). Tests involving KV should use an in-memory store (`Deno.openKv(":memory:")`) to ensure isolation and repeatability.

**Tasks:**

1.  **Setup `.env`:**
    *   Define the structure for storing multiple seed phrases (`SEED_PHRASE_N`) and `RPC_URL` in the `.env` file. ✅ (SEED_PHRASE_N done, add RPC_URL)
    *   Update `.env.example` with `RPC_URL`.
    *   Add `.env` to `.gitignore`. ✅
2.  **Load Seed Phrases:**
    *   Implement logic to load seed phrases from the `.env` file using `jsr:@std/dotenv/load`. ✅ (Initial implementation done)
    *   Refine loading to dynamically handle `SEED_PHRASE_N`.
3.  **Import Viem:**
    *   `viem` is added to `deno.json` imports. ✅
4.  **Derive Wallets:**
    *   For each seed phrase loaded:
        *   Iterate through address indices (default: 0 to 2000).
        *   Use `mnemonicToAccount` with the appropriate `addressIndex` to derive the account (address).
        *   **Important:** Avoid storing or logging private keys derived during this process.
5.  **Store in Deno KV:**
    *   Open a Deno KV store (use persistent store for the task, in-memory for tests).
    *   Define a key structure for storing the derived addresses (e.g., `["seed_phrase_index", address_index]`).
    *   Store the derived address under the defined key.
6.  **Add Deno Task:**
    *   Create a Deno task in `deno.json` (e.g., `deno task seed-wallets`) to run the seeding script. Ensure it uses the necessary `--allow-*` flags. ✅
7.  **Documentation & Testing:**
    *   Update `task.md` as needed. ✅
    *   Add comments to the code.
    *   Implement tests for wallet derivation and KV storage using `deno test` and in-memory KV. Create a separate `seed_wallets.test.ts` file.

**Next Steps:**

*   Refine environment variable loading in `seed_wallets.ts`.
*   Implement wallet derivation logic.
*   Implement Deno KV storage logic.
*   Add tests. 