import "jsr:@std/dotenv/load";
import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

// --- Constants ---
const SEED_PHRASE_PREFIX = "SEED_PHRASE_";
// Get available CPU cores using navigator.hardwareConcurrency
const CPU_CORES = navigator.hardwareConcurrency || 4; // Default to 4 if detection fails
const DEFAULT_CONCURRENCY = CPU_CORES; // Use all available cores

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
 * Process wallet addresses using Deno Workers for true CPU parallelism
 */
async function processAddressesWithWorkers(
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
  
  console.log(`Creating ${concurrency} worker threads for ${batches.length} batches`);
  
  // Create worker pool
  const workers: Worker[] = [];
  for (let i = 0; i < concurrency; i++) {
    const worker = new Worker(new URL("./wallet_worker.ts", import.meta.url).href, {
      type: "module",
      // No extra permissions needed for worker
    });
    workers.push(worker);
  }
  
  let processedCount = 0;
  let workerIndex = 0;
  let pendingBatches = batches.length;
  
  return new Promise<number>((resolve, reject) => {
    // Set up result handlers for all workers
    workers.forEach((worker) => {
      worker.onmessage = async (e) => {
        const result = e.data;
        
        if (result.type === 'success') {
          const { addresses } = result;
          
          // Store addresses in KV
          const kvPromises = addresses.map(({ index, address }) => {
            const kvKey = ["wallet_address", `seed_${seedIndex}`, index];
            return kv.set(kvKey, address);
          });
          
          await Promise.all(kvPromises);
          processedCount += addresses.length;
          
          // Log progress
          if (result.endIndex % 200 === 0 || result.endIndex === maxAddressIndex) {
            console.log(`  -> Processed to index ${result.endIndex}: ${addresses[addresses.length-1].address}`);
          }
          
          // If there are more batches to process, assign work to this worker
          const nextBatchIndex = batches.length - pendingBatches;
          if (nextBatchIndex < batches.length) {
            const nextBatch = batches[nextBatchIndex];
            pendingBatches--;
            
            worker.postMessage({
              mnemonic,
              seedIndex,
              startIndex: nextBatch.start,
              endIndex: nextBatch.end
            });
          }
          
          // Calculate progress
          const percentComplete = Math.round((1 - (pendingBatches / batches.length)) * 100);
          console.log(`  Progress: ${percentComplete}% (${processedCount}/${maxAddressIndex + 1} addresses)`);
          
          // If all batches are processed, terminate workers and resolve
          if (processedCount >= maxAddressIndex + 1) {
            workers.forEach(w => w.terminate());
            resolve(maxAddressIndex + 1);
          }
        } else if (result.type === 'error') {
          // Handle error
          console.error(`Worker error processing indices ${result.startIndex}-${result.endIndex}: ${result.error}`);
          pendingBatches--;
          
          // If all batches are processed (or failed), terminate workers and resolve
          if (pendingBatches === 0) {
            workers.forEach(w => w.terminate());
            resolve(processedCount);
          }
        }
      };
      
      worker.onerror = (err) => {
        console.error('Worker error:', err);
        reject(err);
      };
    });
    
    // Start initial batch of work
    const initialBatchCount = Math.min(concurrency, batches.length);
    for (let i = 0; i < initialBatchCount; i++) {
      const batch = batches[i];
      pendingBatches--;
      
      workers[workerIndex].postMessage({
        mnemonic,
        seedIndex,
        startIndex: batch.start,
        endIndex: batch.end
      });
      
      workerIndex = (workerIndex + 1) % concurrency;
    }
  });
}

/**
 * Derives addresses from seed phrases and stores them in the provided Deno KV store,
 * using Deno Workers for true CPU parallelism.
 */
export async function seedWalletsParallel(
  kv: Deno.Kv,
  options: SeedWalletOptions,
  env: Record<string, string> = Deno.env.toObject(),
): Promise<void> {
  console.log("Starting multi-threaded wallet seeding process...");
  
  const seedPhrases = getSeedPhrasesFromEnv(env);
  if (seedPhrases.length === 0) {
    console.warn(`No environment variables found starting with ${SEED_PHRASE_PREFIX}. Exiting.`);
    return;
  }
  
  // Use all available CPU cores by default
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  const batchSize = options.batchSize || 100; // Default batch size
  
  console.log(`Available CPU cores detected: ${CPU_CORES}`);
  console.log(`Using multi-threaded settings: workers=${concurrency}, batchSize=${batchSize}`);
  
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
      
      const addressCount = await processAddressesWithWorkers(
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
  
  console.log("Multi-threaded wallet seeding process completed.");
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
        concurrency: CPU_CORES,  // Use all available cores
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