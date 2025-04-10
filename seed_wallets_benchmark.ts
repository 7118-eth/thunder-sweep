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

// Benchmark function
async function benchmarkWalletGeneration() {
  console.log(`🧪 Starting benchmark for generating ${WALLETS_COUNT} wallet addresses...`);
  console.log(`Using test mnemonic: "${TEST_MNEMONIC.substring(0, 20)}..."`);
  
  const startTime = performance.now();
  let lastLogTime = startTime;
  let lastProcessedCount = 0;
  
  // Create in-memory KV store for benchmark
  const kv = await Deno.openKv(":memory:");
  
  try {
    // Hook into seedWallets using a custom environment with just one seed phrase
    const mockEnv = { SEED_PHRASE_1: TEST_MNEMONIC };
    
    // Create a proxy around console.log to intercept the logs for stats
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      const message = args[0]?.toString() || "";
      
      // If the message contains the wallet address pattern, extract stats
      if (message.includes("-> Stored index")) {
        const match = message.match(/index (\d+)/);
        if (match) {
          const currentIndex = parseInt(match[1], 10);
          const currentTime = performance.now();
          const elapsedTime = currentTime - startTime;
          const timeSinceLastLog = currentTime - lastLogTime;
          
          // Only update stats every second or for specific milestones
          if (timeSinceLastLog > 1000 || currentIndex === WALLETS_COUNT - 1 || 
              [10, 100, 500, 1000].includes(currentIndex)) {
            const processedSinceLastLog = currentIndex - lastProcessedCount;
            const rate = processedSinceLastLog / (timeSinceLastLog / 1000);
            
            originalLog(
              `📊 Progress: ${currentIndex + 1}/${WALLETS_COUNT} addresses ` +
              `(${((currentIndex + 1) / WALLETS_COUNT * 100).toFixed(1)}%) | ` +
              `Time: ${formatTime(elapsedTime)} | ` +
              `Speed: ${rate.toFixed(1)} addr/s | ` +
              `Est. remaining: ${formatTime((WALLETS_COUNT - currentIndex - 1) / rate * 1000)}`
            );
            
            lastLogTime = currentTime;
            lastProcessedCount = currentIndex;
          }
        }
      }
      
      // Pass through to original console.log
      originalLog(...args);
    };
    
    // Run the actual benchmark
    await seedWallets(kv, { maxAddressIndex: WALLETS_COUNT - 1 }, mockEnv);
    
    // Restore original console.log
    console.log = originalLog;
    
    // Calculate and show final stats
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const walletsPerSecond = WALLETS_COUNT / (totalTime / 1000);
    
    console.log("\n📈 Benchmark Results:");
    console.log(`Total wallets generated: ${WALLETS_COUNT}`);
    console.log(`Total time: ${formatTime(totalTime)}`);
    console.log(`Average speed: ${walletsPerSecond.toFixed(2)} wallets/second`);
    console.log(`Average time per wallet: ${(totalTime / WALLETS_COUNT).toFixed(2)}ms`);
    
    // Verify a few addresses to ensure correctness
    console.log("\n✅ Verification:");
    for (const idx of [0, 42, 999, WALLETS_COUNT - 1]) {
      const storedAddr = await kv.get<Address>(["wallet_address", "seed_1", idx]);
      const expectedAccount = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: idx });
      
      console.log(`Address at index ${idx}: ${storedAddr.value}`);
      console.log(`  Verification: ${storedAddr.value === expectedAccount.address ? "✓" : "✗"}`);
    }
    
  } finally {
    // Clean up
    kv.close();
  }
}

// Run the benchmark
if (import.meta.main) {
  await benchmarkWalletGeneration();
} 