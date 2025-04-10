import "jsr:@std/dotenv/load";
import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

// --- Constants ---
// Removed MAX_ADDRESS_INDEX, will be passed via options
const SEED_PHRASE_PREFIX = "SEED_PHRASE_";

// --- Types ---
interface SeedWalletOptions {
    maxAddressIndex: number;
}

// --- Helper Functions ---

/**
 * Finds all seed phrases defined in the provided environment object
 * following the pattern SEED_PHRASE_N.
 * @param env An object representing environment variables (e.g., Deno.env.toObject()).
 * @returns Array of objects containing the index (N) and the phrase.
 */
export function getSeedPhrasesFromEnv(
    env: Record<string, string> = Deno.env.toObject(),
): { index: number; phrase: string }[] {
    const phrases: { index: number; phrase: string }[] = [];
    let i = 1;
    while (true) {
        const key = `${SEED_PHRASE_PREFIX}${i}`;
        const phrase = env[key]; // Use the provided env object
        if (phrase) {
            // console.log(`Found ${key}`); // Keep console logs out of potentially pure functions
            phrases.push({ index: i, phrase: phrase });
            i++;
        } else {
            // Stop when the next numbered seed phrase is not found
            break;
        }
    }
    // Moved warning to the calling function (seedWallets) which handles output
    return phrases;
}

// --- Main Seeding Logic ---

/**
 * Derives addresses from seed phrases and stores them in the provided Deno KV store.
 * @param kv The Deno KV store instance to use.
 * @param options Configuration options, including maxAddressIndex.
 * @param env The environment object containing seed phrases.
 */
export async function seedWallets(
    kv: Deno.Kv,
    options: SeedWalletOptions,
    env: Record<string, string> = Deno.env.toObject(), // Allow injecting env for testing
) {
    console.log("Starting wallet seeding process...");

    const seedPhrases = getSeedPhrasesFromEnv(env);
    if (seedPhrases.length === 0) {
        console.warn(`No environment variables found starting with ${SEED_PHRASE_PREFIX}. Exiting.`);
        return;
    }

    // KV store is now injected, no need to open it here.
    // console.log("Using provided Deno KV store.");

    for (const { index: seedIndex, phrase: mnemonic } of seedPhrases) {
        console.log(`Processing ${SEED_PHRASE_PREFIX}${seedIndex}...`);
        let storedCount = 0;
        try {
            // Basic check if mnemonic looks somewhat valid (at least 12 words)
            if (mnemonic.split(" ").length < 12) {
                 console.warn(`  ${SEED_PHRASE_PREFIX}${seedIndex} looks too short (less than 12 words). Skipping.`);
                 continue;
            }

            for (let addressIndex = 0; addressIndex <= options.maxAddressIndex; addressIndex++) {
                const account = mnemonicToAccount(mnemonic, {
                    addressIndex: addressIndex,
                });
                const address: Address = account.address;
                const kvKey = ["wallet_address", `seed_${seedIndex}`, addressIndex];

                await kv.set(kvKey, address);
                storedCount++;

                if (addressIndex % 200 === 0 || addressIndex === options.maxAddressIndex) {
                    console.log(`  -> Stored index ${addressIndex}: ${address}`);
                }
            }
            console.log(`Finished processing ${SEED_PHRASE_PREFIX}${seedIndex}. Stored ${storedCount} addresses (indices 0-${options.maxAddressIndex}).`);

        } catch (error) {
            console.error(`Error processing ${SEED_PHRASE_PREFIX}${seedIndex} at index ${storedCount}:`, error.message);
            console.warn(`  Skipping remaining indices for ${SEED_PHRASE_PREFIX}${seedIndex} due to error.`);
            continue;
        }
    }

    console.log("Wallet seeding process completed.");
}

// --- Script Execution ---

// This block runs only when the script is executed directly
if (import.meta.main) {
    const DEFAULT_MAX_ADDRESS_INDEX = 2000;

    // Load .env file content into Deno.env
    // The import "jsr:@std/dotenv/load" at the top handles this.

    (async () => {
        let kv: Deno.Kv | null = null;
        try {
            // Use the default persistent KV store for direct script execution
            kv = await Deno.openKv();
            console.log("Opened default Deno KV store for script execution.");

            await seedWallets(kv, {
                maxAddressIndex: DEFAULT_MAX_ADDRESS_INDEX,
            }); // Uses Deno.env by default

        } catch (err) {
            console.error("Script execution encountered an error:", err);
            Deno.exit(1); // Exit with a non-zero code to indicate failure
        } finally {
            // Ensure the KV store is closed if it was opened
            kv?.close();
            console.log("KV store closed.");
        }
    })();
} 