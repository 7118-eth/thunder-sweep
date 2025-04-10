import "jsr:@std/dotenv/load";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

// Configuration
const RPC_URL = Deno.env.get("RPC_URL") as string;
if (!RPC_URL) {
  console.error("RPC_URL environment variable is not set");
  Deno.exit(1);
}

const SEED_PHRASE = Deno.env.get("SEED_PHRASE_1");
if (!SEED_PHRASE) {
  console.error("SEED_PHRASE_1 environment variable is not set");
  Deno.exit(1);
}

// Parse command line arguments
const args = Deno.args;
const CSV_OUTPUT = args.includes("--csv");
const CSV_FILE = CSV_OUTPUT ? "benchmark_results.csv" : "";
const DETAILED_MODE = args.includes("--detailed");

// Constants for benchmark
const START_WALLET_COUNT = parseInt(Deno.env.get("START_WALLET_COUNT") || "50");
const MAX_WALLET_COUNT = parseInt(Deno.env.get("MAX_WALLET_COUNT") || "10000");
const WALLET_COUNT_INCREMENT = parseInt(Deno.env.get("WALLET_COUNT_INCREMENT") || "50");
const RETRY_COUNT = parseInt(Deno.env.get("RETRY_COUNT") || "3");
const BATCH_SIZES = [1024, 2048, 4096, 8192, 16384].map(
  size => parseInt(Deno.env.get(`BATCH_SIZE_${size}`) || size.toString())
);

// Get available CPU cores using navigator.hardwareConcurrency
const CPU_CORES = navigator.hardwareConcurrency || 4; // Default to 4 if detection fails
const WORKER_COUNT = parseInt(Deno.env.get("WORKER_COUNT") || CPU_CORES.toString());
const WALLET_BATCH_SIZE = parseInt(Deno.env.get("WALLET_BATCH_SIZE") || "100");

// Create public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL, {
    timeout: 60000, // 60 second timeout
    retryCount: 3,
    retryDelay: 1000,
  }),
});

// Multicall3 contract address on Base network
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

// Interface for benchmark results
interface BenchmarkResult {
  walletCount: number;
  batchSize: number;
  success: boolean;
  timeMs: number;
  requestsPerSecond: number;
  error: string;
  timestamp: string;
}

// Worker interface
interface WalletGenerationResult {
  type: 'success' | 'error';
  startIndex: number;
  endIndex: number;
  addresses: Array<{ index: number; address: Address }>;
  error?: string;
}

/**
 * Generate wallet addresses in parallel using Deno Workers
 */
async function generateWalletsParallel(seedPhrase: string, count: number): Promise<Address[]> {
  // Create batches for workers
  const batches: { start: number; end: number }[] = [];
  for (let i = 0; i < count; i += WALLET_BATCH_SIZE) {
    const end = Math.min(i + WALLET_BATCH_SIZE - 1, count - 1);
    batches.push({ start: i, end });
  }
  
  const startTime = performance.now();
  console.log(`Generating ${count} wallet addresses using ${WORKER_COUNT} worker threads...`);
  
  // Create workers
  const workers: Worker[] = [];
  for (let i = 0; i < WORKER_COUNT; i++) {
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
          
          // Show progress
          if (completedBatches % Math.max(1, Math.floor(totalBatches / 10)) === 0 || completedBatches === totalBatches) {
            const progress = Math.round((completedBatches / totalBatches) * 100);
            console.log(`  Progress: ${progress}% (${completedBatches}/${totalBatches} batches)`);
          }
          
          // If there are more batches to process, assign work to this worker
          const nextBatchIndex = workerIndex + (WORKER_COUNT * Math.floor(completedBatches / WORKER_COUNT));
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
            
            console.log(`Generated ${count} addresses in ${duration.toFixed(2)}s (${addressesPerSecond.toFixed(2)} addresses/second)`);
            
            workers.forEach(w => w.terminate());
            resolve(addresses);
          }
        } else if (result.type === 'error') {
          console.error(`Worker error: ${result.error}`);
          workers.forEach(w => w.terminate());
          reject(new Error(`Worker error: ${result.error}`));
        }
      };
      
      worker.onerror = (err) => {
        console.error('Worker error:', err);
        workers.forEach(w => w.terminate());
        reject(err);
      };
    });
    
    // Start initial batch of work (one per worker)
    const initialBatchCount = Math.min(WORKER_COUNT, batches.length);
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

// Helper to measure execution time
async function measureTime<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return [result, end - start];
}

// Function to fetch ETH balances using multicall
async function fetchBalancesMulticall(addresses: Address[], batchSize: number) {
  // For ETH balances, we use the getEthBalance function on the multicall contract
  const contracts = addresses.map((address) => ({
    address: MULTICALL3_ADDRESS,
    abi: [
      {
        inputs: [{ name: "addr", type: "address" }],
        name: "getEthBalance",
        outputs: [{ name: "balance", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const,
    functionName: "getEthBalance",
    args: [address],
  }));

  return await publicClient.multicall({
    contracts,
    batchSize,
    multicallAddress: MULTICALL3_ADDRESS,
  });
}

// Write results to CSV if enabled
async function writeResultsToCsv(results: BenchmarkResult[]) {
  if (!CSV_OUTPUT || !CSV_FILE) return;
  
  const header = "timestamp,walletCount,batchSize,success,timeMs,requestsPerSecond,error\n";
  const rows = results.map(r => 
    `${r.timestamp},${r.walletCount},${r.batchSize},${r.success},${r.timeMs.toFixed(2)},${r.requestsPerSecond.toFixed(2)},"${r.error}"`
  ).join("\n");
  
  try {
    await Deno.writeTextFile(CSV_FILE, header + rows);
    console.log(`\nResults written to ${CSV_FILE}`);
  } catch (error) {
    console.error(`Error writing to CSV: ${error}`);
  }
}

// Main benchmark function
async function runBenchmark() {
  console.log("Starting ETH balance multicall benchmark on Base network");
  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Configuration: Start=${START_WALLET_COUNT}, Max=${MAX_WALLET_COUNT}, Increment=${WALLET_COUNT_INCREMENT}`);
  console.log(`Wallet Generation: Using ${WORKER_COUNT}/${CPU_CORES} CPU cores, Batch Size=${WALLET_BATCH_SIZE}`);
  console.log(`Batch sizes to test: ${BATCH_SIZES.join(", ")}`);
  console.log("-----------------------------------------------------");
  
  // Create table header
  if (DETAILED_MODE) {
    console.log("| Wallet Count | Batch Size | Success | Time (ms) | Req/s     | Error |");
    console.log("|-------------|------------|---------|-----------|-----------|-------|");
  } else {
    console.log("| Wallet Count | Batch Size | Success | Time (ms) | Req/s     |");
    console.log("|-------------|------------|---------|-----------|-----------|");
  }

  let lastSuccessfulCount = 0;
  let walletCount = START_WALLET_COUNT;
  const benchmarkResults: BenchmarkResult[] = [];

  // Generate a large pool of wallet addresses for testing (in parallel)
  console.log(`Generating ${MAX_WALLET_COUNT} wallet addresses...`);
  const allWallets = await generateWalletsParallel(SEED_PHRASE, MAX_WALLET_COUNT);
  
  // Test with increasing wallet counts
  while (walletCount <= MAX_WALLET_COUNT) {
    const wallets = allWallets.slice(0, walletCount);
    let bestResult: BenchmarkResult | null = null;

    // Try different batch sizes
    for (const batchSize of BATCH_SIZES) {
      for (let retry = 0; retry < RETRY_COUNT; retry++) {
        try {
          const [multicallResults, timeMs] = await measureTime(() => 
            fetchBalancesMulticall(wallets, batchSize)
          );
          
          // Check if all requests were successful
          const allSuccess = multicallResults.every(r => r.status === "success");
          if (allSuccess) {
            const requestsPerSecond = (walletCount / (timeMs / 1000));
            const timestamp = new Date().toISOString();
            
            const result: BenchmarkResult = {
              walletCount,
              batchSize,
              success: true,
              timeMs,
              requestsPerSecond,
              error: "",
              timestamp,
            };
            
            // Only log detailed results if in detailed mode
            if (DETAILED_MODE) {
              console.log(
                `| ${walletCount.toString().padEnd(11)} | ${batchSize.toString().padEnd(10)} | ✓ | ` +
                `${timeMs.toFixed(2).padEnd(9)} | ${requestsPerSecond.toFixed(2).padEnd(9)} | |`
              );
            }
            
            // Track the best result (fastest) for this wallet count
            if (!bestResult || result.timeMs < bestResult.timeMs) {
              bestResult = result;
            }
            
            benchmarkResults.push(result);
            break; // No need to retry this batch size
          }
        } catch (e) {
          const error = e instanceof Error ? e.message.split('\n')[0] : String(e);
          const timestamp = new Date().toISOString();
          
          benchmarkResults.push({
            walletCount,
            batchSize,
            success: false,
            timeMs: 0,
            requestsPerSecond: 0,
            error,
            timestamp,
          });
          
          if (DETAILED_MODE) {
            console.log(
              `| ${walletCount.toString().padEnd(11)} | ${batchSize.toString().padEnd(10)} | ✗ | ` +
              `${"0.00".padEnd(9)} | ${"0.00".padEnd(9)} | ${error.substring(0, 20)}${error.length > 20 ? "..." : ""} |`
            );
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
        }
      }
    }

    // If no batch sizes succeeded for this wallet count
    if (!bestResult) {
      if (!DETAILED_MODE) {
        const lastError = benchmarkResults[benchmarkResults.length - 1]?.error || "Unknown error";
        console.log(
          `| ${walletCount.toString().padEnd(11)} | ${"Failed".padEnd(10)} | ✗ | ` +
          `${"0.00".padEnd(9)} | ${"0.00".padEnd(9)} |` +
          (DETAILED_MODE ? ` ${lastError.substring(0, 20)}${lastError.length > 20 ? "..." : ""} |` : "")
        );
      }
      
      // If we've already tried with small increments, we've found the limit
      if (WALLET_COUNT_INCREMENT <= 10) {
        break;
      }
      
      // Go back to last successful count and increment by smaller amounts
      walletCount = lastSuccessfulCount + Math.floor(WALLET_COUNT_INCREMENT / 5);
    } else {
      if (!DETAILED_MODE) {
        console.log(
          `| ${walletCount.toString().padEnd(11)} | ${bestResult.batchSize.toString().padEnd(10)} | ✓ | ` +
          `${bestResult.timeMs.toFixed(2).padEnd(9)} | ${bestResult.requestsPerSecond.toFixed(2).padEnd(9)} |` +
          (DETAILED_MODE ? ` |` : "")
        );
      }
      
      lastSuccessfulCount = walletCount;
      walletCount += WALLET_COUNT_INCREMENT;
    }
    
    // Add a short delay between tests to let the RPC recover
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log("-----------------------------------------------------");
  console.log(`Maximum successful wallet count: ${lastSuccessfulCount}`);
  
  // Write results to CSV if enabled
  await writeResultsToCsv(benchmarkResults);
  
  console.log("Benchmark complete.");
}

// Execute the benchmark if running directly
if (import.meta.main) {
  try {
    await runBenchmark();
  } catch (error) {
    console.error("Benchmark failed:", error);
    Deno.exit(1);
  }
} 