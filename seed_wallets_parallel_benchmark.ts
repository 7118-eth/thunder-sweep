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
  
  // Run with different concurrency levels to find optimal settings
  const concurrencyLevels = [10, 25, 50, 100, 200];
  
  // Parallel implementation benchmark
  console.log("\n📊 PARALLEL IMPLEMENTATION");
  
  for (const concurrency of concurrencyLevels) {
    console.log(`\n⚙️ Testing with concurrency level: ${concurrency}`);
    kv = await Deno.openKv(":memory:");
    
    try {
      const parStartTime = performance.now();
      await seedWalletsParallel(kv, { 
        maxAddressIndex: WALLETS_COUNT - 1,
        concurrency
      }, mockEnv);
      const parEndTime = performance.now();
      const parTotalTime = parEndTime - parStartTime;
      const parWalletsPerSecond = WALLETS_COUNT / (parTotalTime / 1000);

      console.log(`📈 Parallel Implementation Results (concurrency=${concurrency}):`);
      console.log(`Total wallets generated: ${WALLETS_COUNT}`);
      console.log(`Total time: ${formatTime(parTotalTime)}`);
      console.log(`Average speed: ${parWalletsPerSecond.toFixed(2)} wallets/second`);
      console.log(`Average time per wallet: ${(parTotalTime / WALLETS_COUNT).toFixed(2)}ms`);
    } finally {
      kv.close();
    }
  }
  
  console.log("\n🏁 Benchmark completed!");
}

// Run the benchmark
if (import.meta.main) {
  await runComparisonBenchmark();
} 