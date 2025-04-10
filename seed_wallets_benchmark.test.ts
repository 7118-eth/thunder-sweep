import { seedWallets } from "./seed_wallets.ts";
import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";
import { assert, assertEquals } from "@std/assert";

// Test mnemonics
const TEST_MNEMONIC_1 = "test test test test test test test test test test test junk";
const TEST_MNEMONIC_2 = "legal winner thank year wave sausage worth useful legal winner thank yellow";

// Helper to format time
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

// Format numbers with commas
function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Helper to calculate and display performance metrics
function displayPerformanceMetrics(
  walletCount: number,
  startTime: number,
  endTime: number,
  label: string
): void {
  const totalTimeMs = endTime - startTime;
  const walletsPerSecond = walletCount / (totalTimeMs / 1000);
  const timePerWallet = totalTimeMs / walletCount;

  console.log(`\n🧪 ${label} Performance Metrics:`);
  console.log(`  Wallets processed: ${formatNumber(walletCount)}`);
  console.log(`  Total time: ${formatTime(totalTimeMs)}`);
  console.log(`  Speed: ${walletsPerSecond.toFixed(2)} wallets/second`);
  console.log(`  Average time per wallet: ${timePerWallet.toFixed(2)}ms`);
}

// Deno test suite for wallet benchmarking
Deno.test("Wallet generation benchmarks", async (t) => {
  let kv: Deno.Kv;

  // Setup in-memory KV store for tests
  const setup = async () => {
    kv = await Deno.openKv(":memory:");
  };
  const teardown = () => {
    kv?.close();
  };

  // Single seed phrase benchmark (1500 addresses)
  await t.step("Single seed phrase (1500 addresses)", async () => {
    await setup();
    console.log("\n🚀 Beginning benchmark: Single seed phrase (1500 addresses)");
    
    const mockEnv = { SEED_PHRASE_1: TEST_MNEMONIC_1 };
    const options = { maxAddressIndex: 1499 }; // 1500 addresses (0-1499)

    const startTime = performance.now();
    await seedWallets(kv, options, mockEnv);
    const endTime = performance.now();

    displayPerformanceMetrics(1500, startTime, endTime, "Single Seed Phrase (1500 addresses)");

    // Verify first and last addresses
    const firstAddress = await kv.get<Address>(["wallet_address", "seed_1", 0]);
    const lastAddress = await kv.get<Address>(["wallet_address", "seed_1", 1499]);
    
    assert(firstAddress.value);
    assert(lastAddress.value);
    
    await teardown();
  });

  // Multiple seed phrases benchmark (600 addresses each)
  await t.step("Multiple seed phrases (2 phrases, 600 addresses each)", async () => {
    await setup();
    console.log("\n🚀 Beginning benchmark: Multiple seed phrases (2 phrases, 600 addresses each)");
    
    const mockEnv = { 
      SEED_PHRASE_1: TEST_MNEMONIC_1,
      SEED_PHRASE_2: TEST_MNEMONIC_2
    };
    const options = { maxAddressIndex: 599 }; // 600 addresses per phrase (0-599)

    const startTime = performance.now();
    await seedWallets(kv, options, mockEnv);
    const endTime = performance.now();

    displayPerformanceMetrics(1200, startTime, endTime, "Multiple Seed Phrases (1200 total addresses)");

    // Verify addresses from both seed phrases
    const addr1 = await kv.get<Address>(["wallet_address", "seed_1", 0]);
    const addr2 = await kv.get<Address>(["wallet_address", "seed_2", 0]);
    
    assert(addr1.value);
    assert(addr2.value);
    assertEquals(addr1.value, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    assertEquals(addr2.value, "0x58A57ed9d8d624cBD12e2C467D34787555bB1b25");
    
    await teardown();
  });

  // Benchmark batching approach - direct HD path derivation
  await t.step("Optimized HD path derivation (2000 addresses)", async () => {
    await setup();
    console.log("\n🚀 Beginning benchmark: Optimized HD path derivation");

    const startTime = performance.now();
    const wallets: Address[] = [];
    
    for (let i = 0; i < 2000; i++) {
      const account = mnemonicToAccount(TEST_MNEMONIC_1, { addressIndex: i });
      wallets.push(account.address);

      // Store in KV at regular intervals to mimic the full operation
      if (i % 10 === 0) {
        await kv.set(["wallet_address", "optimized", i], account.address);
      }
    }
    
    const endTime = performance.now();
    displayPerformanceMetrics(2000, startTime, endTime, "Optimized HD Path Derivation");
    
    console.log(`  Generated ${wallets.length} addresses without full KV storage`);
    console.log(`  Stored ${Math.ceil(wallets.length / 10)} addresses in KV for comparison`);
    
    await teardown();
  });
  
  // Compare pure derivation vs. derivation+storage
  await t.step("Pure derivation vs. storage comparison (500 addresses)", async () => {
    await setup();
    console.log("\n🚀 Beginning benchmark: Pure derivation vs. storage comparison");
    
    // Pure derivation only
    const derivationStartTime = performance.now();
    const wallets: Address[] = [];
    
    for (let i = 0; i < 500; i++) {
      const account = mnemonicToAccount(TEST_MNEMONIC_1, { addressIndex: i });
      wallets.push(account.address);
    }
    
    const derivationEndTime = performance.now();
    displayPerformanceMetrics(500, derivationStartTime, derivationEndTime, "Pure Derivation Only");
    
    // Derivation + KV storage
    const storageStartTime = performance.now();
    
    for (let i = 0; i < 500; i++) {
      const account = mnemonicToAccount(TEST_MNEMONIC_1, { addressIndex: i });
      await kv.set(["wallet_address", "comparison", i], account.address);
    }
    
    const storageEndTime = performance.now();
    displayPerformanceMetrics(500, storageStartTime, storageEndTime, "Derivation + KV Storage");
    
    const derivationTime = derivationEndTime - derivationStartTime;
    const storageTime = storageEndTime - storageStartTime;
    const storageOverhead = (storageTime - derivationTime) / derivationTime * 100;
    
    console.log(`\n📊 Storage Overhead Analysis:`);
    console.log(`  Pure derivation time: ${formatTime(derivationTime)}`);
    console.log(`  Derivation + storage time: ${formatTime(storageTime)}`);
    console.log(`  Storage overhead: ${storageOverhead.toFixed(2)}%`);
    console.log(`  KV storage adds approximately ${storageOverhead.toFixed(0)}% overhead to the process`);
    
    await teardown();
  });
}); 