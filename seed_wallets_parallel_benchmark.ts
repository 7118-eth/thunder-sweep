import { seedWalletsParallel } from "./seed_wallets_parallel.ts";
import { seedWallets } from "./seed_wallets.ts";
import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const WALLETS_COUNT = 2000;

// Get available CPU cores
const CPU_CORES = navigator.hardwareConcurrency || 4; // Default to 4 if detection fails

// Helper to format time
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

// Run benchmark at maximum CPU utilization
async function runMaxCPUBenchmark() {
  console.log(`🧪 Starting CPU-optimized benchmark for generating ${WALLETS_COUNT} wallet addresses...`);
  console.log(`Using test mnemonic: "${TEST_MNEMONIC.substring(0, 20)}..."`);
  console.log(`Detected CPU cores: ${CPU_CORES}`);
  
  // Create a custom environment with just one seed phrase
  const mockEnv = { SEED_PHRASE_1: TEST_MNEMONIC };
  
  // Sequential implementation baseline
  console.log("\n📊 SEQUENTIAL IMPLEMENTATION (BASELINE)");
  let kv = await Deno.openKv(":memory:");
  try {
    const seqStartTime = performance.now();
    await seedWallets(kv, { maxAddressIndex: WALLETS_COUNT - 1 }, mockEnv);
    const seqEndTime = performance.now();
    const seqTotalTime = seqEndTime - seqStartTime;
    const seqWalletsPerSecond = WALLETS_COUNT / (seqTotalTime / 1000);

    console.log("\n📈 Sequential Implementation Results:");
    console.log(`Total wallets generated: ${WALLETS_COUNT}`);
    console.log(`Total time: ${formatTime(seqTotalTime)}`);
    console.log(`Average speed: ${seqWalletsPerSecond.toFixed(2)} wallets/second`);
    console.log(`Average time per wallet: ${(seqTotalTime / WALLETS_COUNT).toFixed(2)}ms`);
  } finally {
    kv.close();
  }

  // Benchmark with maximum CPU utilization
  console.log(`\n🚀 MAXIMUM CPU UTILIZATION (${CPU_CORES} cores)`);
  
  // Test different batch sizes to find optimal configuration
  const batchSizes = [50, 100, 200, 500, 1000];
  let bestConfig = { batchSize: 100, time: Infinity, rate: 0 };
  
  for (const batchSize of batchSizes) {
    console.log(`\n⚙️ Testing with max CPU cores and batchSize=${batchSize}`);
    kv = await Deno.openKv(":memory:");
    
    try {
      const startTime = performance.now();
      await seedWalletsParallel(kv, { 
        maxAddressIndex: WALLETS_COUNT - 1,
        concurrency: CPU_CORES,  // Maximum CPU utilization
        batchSize
      }, mockEnv);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const walletsPerSecond = WALLETS_COUNT / (totalTime / 1000);

      console.log(`📈 Results with ${CPU_CORES} cores and batchSize=${batchSize}:`);
      console.log(`Total wallets generated: ${WALLETS_COUNT}`);
      console.log(`Total time: ${formatTime(totalTime)}`);
      console.log(`Average speed: ${walletsPerSecond.toFixed(2)} wallets/second`);
      console.log(`Average time per wallet: ${(totalTime / WALLETS_COUNT).toFixed(2)}ms`);
      
      // Track best configuration
      if (totalTime < bestConfig.time) {
        bestConfig = { batchSize, time: totalTime, rate: walletsPerSecond };
      }
    } finally {
      kv.close();
    }
  }
  
  // Run a pure derivation test (no KV storage) with max CPU
  console.log("\n🧪 PURE DERIVATION TEST (MAX CPU, NO STORAGE)");
  const derivationStartTime = performance.now();
  
  // Create batches for every CPU core
  const batchSize = Math.ceil(WALLETS_COUNT / CPU_CORES);
  const batchPromises = [];
  
  for (let i = 0; i < CPU_CORES; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize - 1, WALLETS_COUNT - 1);
    
    batchPromises.push((async () => {
      const addresses = [];
      for (let j = start; j <= end; j++) {
        const account = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: j });
        addresses.push(account.address);
      }
      return addresses;
    })());
  }
  
  // Run batches across all CPU cores
  const addressBatches = [];
  await Promise.all(batchPromises).then(results => {
    addressBatches.push(...results);
  });
  
  const derivationEndTime = performance.now();
  const derivationTotalTime = derivationEndTime - derivationStartTime;
  const derivationWalletsPerSecond = WALLETS_COUNT / (derivationTotalTime / 1000);
  
  console.log(`📈 Pure Derivation Results (${CPU_CORES} cores):`);
  console.log(`Total wallets generated: ${WALLETS_COUNT}`);
  console.log(`Total time: ${formatTime(derivationTotalTime)}`);
  console.log(`Average speed: ${derivationWalletsPerSecond.toFixed(2)} wallets/second`);
  console.log(`Average time per wallet: ${(derivationTotalTime / WALLETS_COUNT).toFixed(2)}ms`);
  
  // Summary with best configuration
  console.log("\n🏆 OPTIMAL CONFIGURATION:");
  console.log(`Best performance: ${bestConfig.rate.toFixed(2)} wallets/second`);
  console.log(`Configuration: ${CPU_CORES} cores with batch size ${bestConfig.batchSize}`);
  console.log(`Time for ${WALLETS_COUNT} wallets: ${formatTime(bestConfig.time)}`);
  
  // Calculate improvement over sequential
  const improvementFactor = bestConfig.rate / seqWalletsPerSecond;
  console.log(`Speed improvement: ${improvementFactor.toFixed(2)}x faster than sequential processing`);
  
  console.log("\n🏁 Benchmark completed!");
}

// Run the benchmark
if (import.meta.main) {
  await runMaxCPUBenchmark();
} 