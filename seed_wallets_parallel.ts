import "jsr:@std/dotenv/load";
import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

// --- Constants ---
const SEED_PHRASE_PREFIX = "SEED_PHRASE_";
const DEFAULT_CONCURRENCY = 4; // Default to number of CPU cores

// --- Types ---
interface SeedWalletOptions {
  maxAddressIndex: number;
  concurrency?: number; // Parallel worker count (ideally match CPU core count)
  batchSize?: number;   // Addresses per batch
}

interface SeedPhrase {
  index: number;
  phrase: string;
}

interface AddressBatch {
  seedIndex: number;
  startIndex: number;
  endIndex: number;
  addresses: { index: number; address: Address }[];
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
 * Generate addresses for a batch without storing them yet
 * This is the CPU-intensive part we want to parallelize
 */
function generateAddressBatch(
  seedIndex: number,
  mnemonic: string,
  startIndex: number,
  endIndex: number
): AddressBatch {
  const addresses = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const account = mnemonicToAccount(mnemonic, { addressIndex: i });
    addresses.push({ index: i, address: account.address });
  }
  return {
    seedIndex,
    startIndex,
    endIndex,
    addresses
  };
}

/**
 * Process wallet addresses with CPU-bound optimizations
 */
async function processCPUBoundAddresses(
  kv: Deno.Kv,
  seedIndex: number,
  mnemonic: string,
  maxAddressIndex: number,
  concurrency: number,
  batchSize: number
): Promise<number> {
  // Divide the work into batches
  const batches: { start: number; end: number }[] = [];
  
  for (let i = 0; i <= maxAddressIndex; i += batchSize) {
    const end = Math.min(i + batchSize - 1, maxAddressIndex);
    batches.push({ start: i, end });
  }
  
  let processedCount = 0;
  const totalBatches = batches.length;
  
  // Process batches in chunks based on concurrency
  for (let i = 0; i < totalBatches; i += concurrency) {
    const currentBatches = batches.slice(i, i + concurrency);
    
    // Run CPU-intensive work concurrently
    const batchResults = await Promise.all(
      currentBatches.map(batch => 
        generateAddressBatch(seedIndex, mnemonic, batch.start, batch.end)
      )
    );
    
    // Store results in KV (less CPU intensive)
    for (const batch of batchResults) {
      const kvPromises = batch.addresses.map(({ index, address }) => {
        const kvKey = ["wallet_address", `seed_${seedIndex}`, index];
        return kv.set(kvKey, address);
      });
      
      await Promise.all(kvPromises);
      processedCount += batch.addresses.length;
      
      // Log progress 
      if (batch.endIndex % 200 === 0 || batch.endIndex === maxAddressIndex) {
        console.log(`  -> Processed to index ${batch.endIndex}: ${batch.addresses[batch.addresses.length-1].address}`);
      }
    }
    
    // Report progress after each concurrency chunk
    const percentComplete = Math.round((i + currentBatches.length) / totalBatches * 100);
    console.log(`  Progress: ${percentComplete}% (${processedCount}/${maxAddressIndex + 1} addresses)`);
  }
  
  return maxAddressIndex + 1;
}

/**
 * Derives addresses from seed phrases and stores them in the provided Deno KV store,
 * optimizing for CPU-bound operations.
 */
export async function seedWalletsParallel(
  kv: Deno.Kv,
  options: SeedWalletOptions,
  env: Record<string, string> = Deno.env.toObject(),
): Promise<void> {
  console.log("Starting CPU-optimized wallet seeding process...");
  
  const seedPhrases = getSeedPhrasesFromEnv(env);
  if (seedPhrases.length === 0) {
    console.warn(`No environment variables found starting with ${SEED_PHRASE_PREFIX}. Exiting.`);
    return;
  }
  
  // CPU-bound optimizations - keep concurrency close to CPU core count
  // and use larger batch sizes to amortize overhead
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  const batchSize = options.batchSize || 100; // Default batch size
  
  console.log(`Using CPU-optimized settings: concurrency=${concurrency}, batchSize=${batchSize}`);
  
  // Process each seed phrase sequentially
  for (const { index: seedIndex, phrase: mnemonic } of seedPhrases) {
    console.log(`Processing ${SEED_PHRASE_PREFIX}${seedIndex}...`);
    
    try {
      // Basic check if mnemonic looks somewhat valid (at least 12 words)
      if (mnemonic.split(" ").length < 12) {
        console.warn(`  ${SEED_PHRASE_PREFIX}${seedIndex} looks too short (less than 12 words). Skipping.`);
        continue;
      }
      
      const startTime = performance.now();
      
      const addressCount = await processCPUBoundAddresses(
        kv,
        seedIndex,
        mnemonic,
        options.maxAddressIndex,
        concurrency,
        batchSize
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
  
  console.log("CPU-optimized wallet seeding process completed.");
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
        concurrency: 4,  // Set to approximate number of CPU cores
        batchSize: 100   // Process in chunks of 100 addresses
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