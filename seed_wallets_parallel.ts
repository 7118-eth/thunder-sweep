import "jsr:@std/dotenv/load";
import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

// --- Constants ---
const SEED_PHRASE_PREFIX = "SEED_PHRASE_";
const DEFAULT_CONCURRENCY = 50; // Number of parallel operations

// --- Types ---
interface SeedWalletOptions {
  maxAddressIndex: number;
  concurrency?: number; // Added parameter for controlling parallelism
}

interface SeedPhrase {
  index: number;
  phrase: string;
}

/**
 * Finds all seed phrases defined in the provided environment object
 * following the pattern SEED_PHRASE_N.
 */
export function getSeedPhrasesFromEnv(
  env: Record<string, string> = Deno.env.toObject(),
): SeedPhrase[] {
  const phrases: SeedPhrase[] = [];
  let i = 1;
  while (true) {
    const key = `${SEED_PHRASE_PREFIX}${i}`;
    const phrase = env[key];
    if (phrase) {
      phrases.push({ index: i, phrase: phrase });
      i++;
    } else {
      break;
    }
  }
  return phrases;
}

/**
 * Process wallet addresses in parallel batches
 */
async function processAddressesInParallel(
  kv: Deno.Kv,
  seedIndex: number,
  mnemonic: string,
  maxAddressIndex: number,
  concurrency: number,
): Promise<number> {
  // Create address ranges for batching
  const batches: number[][] = [];
  const batchSize = Math.ceil(maxAddressIndex / concurrency);
  
  for (let i = 0; i <= maxAddressIndex; i += batchSize) {
    const end = Math.min(i + batchSize - 1, maxAddressIndex);
    const range = Array.from({ length: end - i + 1 }, (_, idx) => i + idx);
    batches.push(range);
  }
  
  // Function to process a batch of addresses
  async function processBatch(addressIndices: number[]): Promise<void> {
    const promises = addressIndices.map(async (addressIndex) => {
      const account = mnemonicToAccount(mnemonic, { addressIndex });
      const address: Address = account.address;
      const kvKey = ["wallet_address", `seed_${seedIndex}`, addressIndex];
      
      await kv.set(kvKey, address);
      
      // Log progress for some indices
      if (addressIndex % 200 === 0 || addressIndex === maxAddressIndex) {
        console.log(`  -> Stored index ${addressIndex}: ${address}`);
      }
    });
    
    await Promise.all(promises);
  }
  
  // Process all batches concurrently
  await Promise.all(batches.map(processBatch));
  
  return maxAddressIndex + 1; // Return the count of processed addresses
}

/**
 * Derives addresses from seed phrases and stores them in the provided Deno KV store,
 * using parallel processing for better performance.
 */
export async function seedWalletsParallel(
  kv: Deno.Kv,
  options: SeedWalletOptions,
  env: Record<string, string> = Deno.env.toObject(),
): Promise<void> {
  console.log("Starting parallel wallet seeding process...");
  
  const seedPhrases = getSeedPhrasesFromEnv(env);
  if (seedPhrases.length === 0) {
    console.warn(`No environment variables found starting with ${SEED_PHRASE_PREFIX}. Exiting.`);
    return;
  }
  
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  console.log(`Using concurrency level: ${concurrency}`);
  
  // Process each seed phrase sequentially, but addresses within each phrase in parallel
  for (const { index: seedIndex, phrase: mnemonic } of seedPhrases) {
    console.log(`Processing ${SEED_PHRASE_PREFIX}${seedIndex}...`);
    
    try {
      // Basic check if mnemonic looks somewhat valid (at least 12 words)
      if (mnemonic.split(" ").length < 12) {
        console.warn(`  ${SEED_PHRASE_PREFIX}${seedIndex} looks too short (less than 12 words). Skipping.`);
        continue;
      }
      
      const startTime = performance.now();
      const addressCount = await processAddressesInParallel(
        kv,
        seedIndex,
        mnemonic,
        options.maxAddressIndex,
        concurrency,
      );
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      const addressesPerSecond = addressCount / (duration / 1000);
      
      console.log(`Finished processing ${SEED_PHRASE_PREFIX}${seedIndex}.`);
      console.log(`  Stored ${addressCount} addresses (indices 0-${options.maxAddressIndex})`);
      console.log(`  Time: ${(duration / 1000).toFixed(2)}s, Speed: ${addressesPerSecond.toFixed(2)} addresses/second`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error processing ${SEED_PHRASE_PREFIX}${seedIndex}:`, errorMessage);
      continue;
    }
  }
  
  console.log("Parallel wallet seeding process completed.");
}

// --- Script Execution ---
if (import.meta.main) {
  const DEFAULT_MAX_ADDRESS_INDEX = 2000;
  
  (async () => {
    let kv: Deno.Kv | null = null;
    try {
      kv = await Deno.openKv();
      console.log("Opened default Deno KV store for script execution.");
      
      await seedWalletsParallel(kv, {
        maxAddressIndex: DEFAULT_MAX_ADDRESS_INDEX,
        concurrency: 50, // Reasonable default concurrency
      });
      
    } catch (err) {
      console.error("Script execution encountered an error:", err);
      Deno.exit(1);
    } finally {
      kv?.close();
      console.log("KV store closed.");
    }
  })();
} 