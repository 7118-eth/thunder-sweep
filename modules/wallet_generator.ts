import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

// Interface for the result returned from wallet generation workers
interface WalletGenerationResult {
  type: 'success' | 'error';
  startIndex: number;
  endIndex: number;
  addresses: Array<{ index: number; address: Address }>;
  error?: string;
}

/**
 * Generate wallet addresses in parallel using Deno Workers
 * @param seedPhrase The seed phrase to derive wallets from
 * @param count The number of wallet addresses to generate
 * @param options Optional configuration
 * @returns An array of wallet addresses
 */
export async function generateWalletsParallel(
  seedPhrase: string,
  count: number,
  options: { workerCount?: number; batchSize?: number } = {}
): Promise<Address[]> {
  // Get available CPU cores
  const CPU_CORES = navigator.hardwareConcurrency || 4;
  
  // Set default options
  const workerCount = options.workerCount || CPU_CORES;
  const batchSize = options.batchSize || 100;
  
  // Create batches for workers
  const batches: { start: number; end: number }[] = [];
  for (let i = 0; i < count; i += batchSize) {
    const end = Math.min(i + batchSize - 1, count - 1);
    batches.push({ start: i, end });
  }
  
  const startTime = performance.now();
  
  // Create workers
  const workers: Worker[] = [];
  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(new URL("./wallet_worker.ts", import.meta.url).href, {
      type: "module",
    });
    workers.push(worker);
  }
  
  const addresses: Address[] = new Array(count);
  let completedBatches = 0;
  const totalBatches = batches.length;
  
  return new Promise<Address[]>((resolve, reject) => {
    // Set up handlers for all workers
    workers.forEach((worker, workerIndex) => {
      worker.onmessage = (e: MessageEvent<WalletGenerationResult>) => {
        const result = e.data;
        
        if (result.type === 'success') {
          // Store the addresses in the main array
          result.addresses.forEach(({ index, address }) => {
            addresses[index] = address;
          });
          
          completedBatches++;
          
          // Show progress every 10% or for the last batch
          if (completedBatches % Math.max(1, Math.floor(totalBatches / 10)) === 0 || completedBatches === totalBatches) {
            const progress = Math.round((completedBatches / totalBatches) * 100);
            console.log(`  Progress: ${progress}% (${completedBatches}/${totalBatches} batches)`);
          }
          
          // If there are more batches to process, assign work to this worker
          const nextBatchIndex = workerIndex + (workerCount * Math.floor(completedBatches / workerCount));
          if (nextBatchIndex < batches.length) {
            const nextBatch = batches[nextBatchIndex];
            worker.postMessage({
              mnemonic: seedPhrase,
              startIndex: nextBatch.start,
              endIndex: nextBatch.end
            });
          }
          
          // If all batches are processed, clean up and resolve
          if (completedBatches === totalBatches) {
            const endTime = performance.now();
            const duration = (endTime - startTime) / 1000;
            const addressesPerSecond = count / duration;
            
            console.log(`  Generated ${count} addresses in ${duration.toFixed(2)}s (${addressesPerSecond.toFixed(2)} addresses/second)`);
            
            workers.forEach(w => w.terminate());
            resolve(addresses);
          }
        } else if (result.type === 'error') {
          console.error(`  Worker error: ${result.error}`);
          workers.forEach(w => w.terminate());
          reject(new Error(`Worker error: ${result.error}`));
        }
      };
      
      worker.onerror = (err) => {
        console.error('  Worker error:', err);
        workers.forEach(w => w.terminate());
        reject(err);
      };
    });
    
    // Start initial batch of work (one per worker)
    const initialBatchCount = Math.min(workerCount, batches.length);
    for (let i = 0; i < initialBatchCount; i++) {
      const batch = batches[i];
      workers[i].postMessage({
        mnemonic: seedPhrase,
        startIndex: batch.start,
        endIndex: batch.end
      });
    }
  });
}

/**
 * Generate wallet addresses sequentially (fallback if parallel generation fails)
 * @param seedPhrase The seed phrase to derive wallets from
 * @param count The number of wallet addresses to generate
 * @returns An array of wallet addresses
 */
export function generateWalletsSequential(seedPhrase: string, count: number): Address[] {
  console.log(`Generating ${count} wallet addresses sequentially...`);
  const startTime = performance.now();
  
  const addresses: Address[] = [];
  for (let i = 0; i < count; i++) {
    const account = mnemonicToAccount(seedPhrase, { addressIndex: i });
    addresses.push(account.address);
    
    // Show progress every 10%
    if (i % Math.max(1, Math.floor(count / 10)) === 0 || i === count - 1) {
      const progress = Math.round(((i + 1) / count) * 100);
      console.log(`  Progress: ${progress}% (${i + 1}/${count} addresses)`);
    }
  }
  
  const endTime = performance.now();
  const duration = (endTime - startTime) / 1000;
  const addressesPerSecond = count / duration;
  
  console.log(`  Generated ${count} addresses in ${duration.toFixed(2)}s (${addressesPerSecond.toFixed(2)} addresses/second)`);
  
  return addresses;
} 