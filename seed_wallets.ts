import "jsr:@std/dotenv/load";
import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

// --- Constants ---
const MAX_ADDRESS_INDEX = 2000; // Derive addresses from index 0 to 2000
const SEED_PHRASE_PREFIX = "SEED_PHRASE_";

// --- Helper Functions ---

/**
 * Finds all seed phrases defined as environment variables
 * following the pattern SEED_PHRASE_N.
 * @returns Array of objects containing the index (N) and the phrase.
 */
function getSeedPhrasesFromEnv(): { index: number; phrase: string }[] {
    const phrases: { index: number; phrase: string }[] = [];
    let i = 1;
    while (true) {
        const key = `${SEED_PHRASE_PREFIX}${i}`;
        const phrase = Deno.env.get(key);
        if (phrase) {
            console.log(`Found ${key}`);
            phrases.push({ index: i, phrase: phrase });
            i++;
        } else {
            // Stop when the next numbered seed phrase is not found
            break;
        }
    }
    if (phrases.length === 0) {
        console.warn(`No environment variables found starting with ${SEED_PHRASE_PREFIX}`);
    }
    return phrases;
}

// --- Main Seeding Logic ---

async function seedWallets() {
    console.log("Starting wallet seeding process...");

    const seedPhrases = getSeedPhrasesFromEnv();
    if (seedPhrases.length === 0) {
        console.log("No seed phrases found to process. Exiting.");
        return;
    }

    // Use the default persistent KV store for the actual seeding task
    const kv = await Deno.openKv();
    console.log("Opened Deno KV store.");

    for (const { index: seedIndex, phrase: mnemonic } of seedPhrases) {
        console.log(`Processing ${SEED_PHRASE_PREFIX}${seedIndex}...`);
        let storedCount = 0;
        try {
            // Basic check if mnemonic looks somewhat valid (at least 12 words)
            if (mnemonic.split(" ").length < 12) {
                 console.warn(`  ${SEED_PHRASE_PREFIX}${seedIndex} looks too short (less than 12 words). Skipping.`);
                 continue;
            }

            for (let addressIndex = 0; addressIndex <= MAX_ADDRESS_INDEX; addressIndex++) {
                // Derive the account for the current index
                // IMPORTANT: We only extract the address, not the private key.
                const account = mnemonicToAccount(mnemonic, {
                    addressIndex: addressIndex,
                });
                const address: Address = account.address;

                // Define the key for KV storage
                const kvKey = ["wallet_address", `seed_${seedIndex}`, addressIndex];

                // Store the derived address in Deno KV
                // The value stored is just the address string.
                await kv.set(kvKey, address);
                storedCount++;

                // Log progress periodically to avoid excessive output
                if (addressIndex % 200 === 0 || addressIndex === MAX_ADDRESS_INDEX) {
                    console.log(`  -> Stored index ${addressIndex}: ${address}`);
                }
            }
            console.log(`Finished processing ${SEED_PHRASE_PREFIX}${seedIndex}. Stored ${storedCount} addresses (indices 0-${MAX_ADDRESS_INDEX}).`);

        } catch (error) {
            // Log errors during derivation (e.g., invalid mnemonic format for viem)
            console.error(`Error processing ${SEED_PHRASE_PREFIX}${seedIndex} at index ${storedCount}:`, error.message);
            console.warn(`  Skipping remaining indices for ${SEED_PHRASE_PREFIX}${seedIndex} due to error.`);
            continue; // Continue to the next seed phrase if one fails
        }
    }

    // kv.close(); // Closing seems implicitly handled by Deno process exit
    console.log("Wallet seeding process completed.");
}

// --- Script Execution ---

seedWallets().catch((err) => {
    console.error("Seeding script encountered an unhandled error:", err);
    Deno.exit(1); // Exit with a non-zero code to indicate failure
}); 