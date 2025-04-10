import { seedWalletsParallel } from "./seed_wallets_parallel.ts";
import { seedWallets } from "./seed_wallets.ts";
import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const WALLETS_COUNT = 2000;

// Helper to format time
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

// Run benchmark comparing sequential vs parallel implementation
async function runComparisonBenchmark() {
  console.log(`🧪 Starting comparison benchmark for generating ${WALLETS_COUNT} wallet addresses...`);
  console.log(`Using test mnemonic: "${TEST_MNEMONIC.substring(0, 20)}..."`);
  
  // Create a custom environment with just one seed phrase
  const mockEnv = { SEED_PHRASE_1: TEST_MNEMONIC };
  
  // Sequential implementation benchmark
  console.log("\n📊 SEQUENTIAL IMPLEMENTATION");
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

  // CPU-bound optimizations - Test with varying concurrency levels and batch sizes
  console.log("\n📊 CPU-OPTIMIZED IMPLEMENTATION");
  
  // Test different combinations of workers (CPU concurrency) and batch sizes
  // For CPU-bound tasks, concurrency should be close to available CPU cores
  const cpuConfigs = [
    { concurrency: 2, batchSize: 100 },
    { concurrency: 4, batchSize: 100 },
    { concurrency: 6, batchSize: 100 },
    { concurrency: 4, batchSize: 50 },
    { concurrency: 4, batchSize: 200 },
    { concurrency: 4, batchSize: 500 },
  ];
  
  for (const config of cpuConfigs) {
    console.log(`\n⚙️ Testing with CPU config: concurrency=${config.concurrency}, batchSize=${config.batchSize}`);
    kv = await Deno.openKv(":memory:");
    
    try {
      const parStartTime = performance.now();
      await seedWalletsParallel(kv, { 
        maxAddressIndex: WALLETS_COUNT - 1,
        concurrency: config.concurrency,
        batchSize: config.batchSize
      }, mockEnv);
      const parEndTime = performance.now();
      const parTotalTime = parEndTime - parStartTime;
      const parWalletsPerSecond = WALLETS_COUNT / (parTotalTime / 1000);

      console.log(`📈 CPU-Optimized Results (concurrency=${config.concurrency}, batchSize=${config.batchSize}):`);
      console.log(`Total wallets generated: ${WALLETS_COUNT}`);
      console.log(`Total time: ${formatTime(parTotalTime)}`);
      console.log(`Average speed: ${parWalletsPerSecond.toFixed(2)} wallets/second`);
      console.log(`Average time per wallet: ${(parTotalTime / WALLETS_COUNT).toFixed(2)}ms`);
    } finally {
      kv.close();
    }
  }
  
  // Test one pure derivation configuration 
  console.log("\n🧪 PURE DERIVATION TEST (CPU-ONLY, NO KV OPERATIONS)");
  const derivationStartTime = performance.now();
  
  // Run pure derivation without KV storage, using worker count = CPU cores
  const PURE_CPU_CONCURRENCY = 4;
  const addressBatches = [];
  
  // Create batches and calculate addresses
  const batchSize = Math.ceil(WALLETS_COUNT / PURE_CPU_CONCURRENCY);
  const batchPromises = [];
  
  for (let i = 0; i < PURE_CPU_CONCURRENCY; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize - 1, WALLETS_COUNT - 1);
    
    // Create a promise for each batch
    batchPromises.push((async () => {
      const addresses = [];
      for (let j = start; j <= end; j++) {
        const account = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: j });
        addresses.push(account.address);
      }
      return addresses;
    })());
  }
  
  // Run all batches in parallel
  await Promise.all(batchPromises).then(results => {
    addressBatches.push(...results);
  });
  
  const derivationEndTime = performance.now();
  const derivationTotalTime = derivationEndTime - derivationStartTime;
  const derivationWalletsPerSecond = WALLETS_COUNT / (derivationTotalTime / 1000);
  
  console.log(`📈 Pure CPU Derivation Results (concurrency=${PURE_CPU_CONCURRENCY}):`);
  console.log(`Total wallets generated: ${WALLETS_COUNT}`);
  console.log(`Total time: ${formatTime(derivationTotalTime)}`);
  console.log(`Average speed: ${derivationWalletsPerSecond.toFixed(2)} wallets/second`);
  console.log(`Average time per wallet: ${(derivationTotalTime / WALLETS_COUNT).toFixed(2)}ms`);
  
  console.log("\n🏁 Benchmark completed!");
}

// Run the benchmark
if (import.meta.main) {
  await runComparisonBenchmark();
} 