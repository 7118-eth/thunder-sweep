import "jsr:@std/dotenv/load";
import { createPublicClient, http, parseEther } from "viem";
import { base } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";

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

// Constants for benchmark
const START_WALLET_COUNT = 50;
const MAX_WALLET_COUNT = 10000; // Maximum wallets to test
const WALLET_COUNT_INCREMENT = 50; // How many wallets to add per test
const RETRY_COUNT = 3; // Number of retries for each batch size

// Create public client for Base network
const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

// Multicall3 contract address on Base network
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

// Function to generate wallet addresses from a seed phrase
function generateWallets(seedPhrase: string, count: number) {
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const account = mnemonicToAccount(seedPhrase, { addressIndex: i });
    wallets.push(account.address);
  }
  return wallets;
}

// Helper to measure execution time
async function measureTime<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return [result, end - start];
}

// Function to fetch ETH balances using multicall
async function fetchBalancesMulticall(addresses: string[], batchSize: number) {
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

// Main benchmark function
async function runBenchmark() {
  console.log("Starting ETH balance multicall benchmark on Base network");
  console.log(`RPC URL: ${RPC_URL}`);
  console.log("-----------------------------------------------------");
  console.log("| Wallet Count | Batch Size | Success | Time (ms) | Error |");
  console.log("|-------------|------------|---------|-----------|-------|");

  let lastSuccessfulCount = 0;
  let walletCount = START_WALLET_COUNT;

  // Generate a large pool of wallet addresses for testing
  console.log(`Generating ${MAX_WALLET_COUNT} wallet addresses...`);
  const allWallets = generateWallets(SEED_PHRASE, MAX_WALLET_COUNT);
  
  // Test with increasing wallet counts
  while (walletCount <= MAX_WALLET_COUNT) {
    const wallets = allWallets.slice(0, walletCount);
    let success = false;
    let elapsedTime = 0;
    let error = "";
    let successfulBatchSize = 0;

    // Try different batch sizes
    for (const batchSize of [1024, 2048, 4096, 8192]) {
      for (let retry = 0; retry < RETRY_COUNT; retry++) {
        try {
          const [results, time] = await measureTime(() => 
            fetchBalancesMulticall(wallets, batchSize)
          );
          
          // Check if all requests were successful
          const allSuccess = results.every(r => r.status === "success");
          if (allSuccess) {
            success = true;
            elapsedTime = time;
            successfulBatchSize = batchSize;
            error = "";
            break;
          }
        } catch (e) {
          error = e instanceof Error ? e.message.split('\n')[0] : String(e);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
        }
      }
      
      if (success) break;
    }

    console.log(`| ${walletCount.toString().padEnd(11)} | ${(success ? successfulBatchSize : "Failed").toString().padEnd(10)} | ${success ? "✓" : "✗"} | ${elapsedTime.toFixed(2).padEnd(9)} | ${error.substring(0, 20)}${error.length > 20 ? "..." : ""} |`);
    
    if (success) {
      lastSuccessfulCount = walletCount;
      walletCount += WALLET_COUNT_INCREMENT;
    } else {
      // If failed and we're already incrementing by small amounts, we found the limit
      if (WALLET_COUNT_INCREMENT <= 10) {
        break;
      }
      
      // Otherwise, go back to last successful count and increment by smaller amounts
      walletCount = lastSuccessfulCount + Math.floor(WALLET_COUNT_INCREMENT / 5);
    }
  }

  console.log("-----------------------------------------------------");
  console.log(`Maximum successful wallet count: ${lastSuccessfulCount}`);
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