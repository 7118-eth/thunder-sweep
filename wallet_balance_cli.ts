import "jsr:@std/dotenv/load";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { base } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

// Import the wallet generation module from our existing code
import { generateWalletsParallel } from "./modules/wallet_generator.ts";

// Load configuration from environment
const RPC_URL = Deno.env.get("RPC_URL");
if (!RPC_URL) {
  console.error("RPC_URL environment variable not set");
  Deno.exit(1);
}

// Default token address (can be overridden by environment)
const DEFAULT_TOKEN_ADDRESS = "0x546D239032b24eCEEE0cb05c92FC39090846adc7";
const TOKEN_ADDRESS = Deno.env.get("TOKEN_ADDRESS") || DEFAULT_TOKEN_ADDRESS;

// Parse multiple token addresses if provided
const TOKEN_ADDRESSES = Deno.env.get("TOKEN_ADDRESSES")
  ? Deno.env.get("TOKEN_ADDRESSES")!.split(",")
  : [TOKEN_ADDRESS];

// Get available CPU cores for optimal parallelization
const CPU_CORES = navigator.hardwareConcurrency || 4;

// Parse command line arguments
const args = parseArgs(Deno.args, {
  boolean: ["eth-only", "token-only", "summary-only", "verbose", "help"],
  string: ["format", "output", "min-balance", "max-wallets", "batch-size", "workers"],
  default: {
    format: "text",
    "max-wallets": "100",
    workers: String(CPU_CORES),
    "batch-size": "0", // 0 means auto-select based on wallet count
  },
  alias: {
    h: "help",
    o: "output",
    f: "format",
    v: "verbose",
  },
});

// Show help if requested
if (args.help) {
  console.log(`
Wallet Balance Checker CLI
==========================

A tool to check ETH and ERC20 token balances for multiple wallets derived from seed phrases.

Usage:
  deno run --allow-net --allow-env --allow-read wallet_balance_cli.ts [options]

Options:
  --max-wallets=N         Maximum number of wallets to check per seed phrase (default: 100)
  --format=[text|csv|json] Output format (default: text)
  --output=FILE           Write output to specified file
  --eth-only              Only check ETH balances, skip tokens
  --token-only            Only check token balances, skip ETH
  --summary-only          Only show summary statistics, not individual wallets
  --min-balance=X         Only show wallets with balance >= X
  --batch-size=N          Override auto-selected batch size
  --workers=N             Number of worker threads (default: CPU cores)
  --verbose               Show detailed progress information
  --help, -h              Show this help message

Environment Variables:
  SEED_PHRASE_1           Required: Seed phrase to derive wallets from
  SEED_PHRASE_2, ...      Optional: Additional seed phrases
  RPC_URL                 Required: RPC endpoint URL
  TOKEN_ADDRESS           Optional: Default token address to check
  TOKEN_ADDRESSES         Optional: Comma-separated list of token addresses

Examples:
  # Basic usage - check ETH and default token
  deno run --allow-net --allow-env --allow-read wallet_balance_cli.ts

  # Check ETH only with summary
  deno run --allow-net --allow-env --allow-read wallet_balance_cli.ts --eth-only --summary-only

  # Export token balances as CSV
  deno run --allow-net --allow-env --allow-read wallet_balance_cli.ts --token-only --format=csv --output=balances.csv
`);
  Deno.exit(0);
}

// Validate arguments
const maxWallets = parseInt(args["max-wallets"]);
const workers = parseInt(args.workers);
const batchSize = parseInt(args["batch-size"]);
const minBalance = args["min-balance"] ? parseFloat(args["min-balance"]) : 0;
const format = args.format.toLowerCase();

if (isNaN(maxWallets) || maxWallets <= 0) {
  console.error("Error: --max-wallets must be a positive number");
  Deno.exit(1);
}

if (isNaN(workers) || workers <= 0) {
  console.error("Error: --workers must be a positive number");
  Deno.exit(1);
}

if (isNaN(batchSize) || batchSize < 0) {
  console.error("Error: --batch-size must be a non-negative number");
  Deno.exit(1);
}

if (!["text", "csv", "json"].includes(format)) {
  console.error("Error: --format must be one of: text, csv, json");
  Deno.exit(1);
}

// Find all seed phrases in environment
function getSeedPhrasesFromEnv(): string[] {
  const seedPhrases: string[] = [];
  let i = 1;
  
  while (true) {
    const phrase = Deno.env.get(`SEED_PHRASE_${i}`);
    if (!phrase) break;
    seedPhrases.push(phrase);
    i++;
  }
  
  if (seedPhrases.length === 0) {
    console.error("Error: No seed phrases found in environment variables (SEED_PHRASE_1, etc.)");
    Deno.exit(1);
  }
  
  return seedPhrases;
}

// Create RPC client
const client = createPublicClient({
  chain: base,
  transport: http(RPC_URL, {
    timeout: 60000,
    retryCount: 3,
    retryDelay: 1000,
  }),
});

// Multicall3 contract address
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

// Define token ABI
const tokenAbi = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
] as const;

// Determine optimal batch size based on wallet count
function getOptimalBatchSize(walletCount: number): number {
  if (batchSize > 0) return batchSize;
  
  if (walletCount < 500) return 1024;
  if (walletCount < 1000) return 2048;
  if (walletCount < 3000) return 4096;
  return 8192;
}

// Fetch ETH balances using multicall
async function fetchEthBalances(wallets: Address[]): Promise<bigint[]> {
  if (args.verbose) console.log(`Fetching ETH balances for ${wallets.length} wallets...`);
  
  const optimalBatchSize = getOptimalBatchSize(wallets.length);
  if (args.verbose) console.log(`Using batch size: ${optimalBatchSize} bytes`);
  
  // Create multicall contracts array for ETH balances
  const contracts = wallets.map((address) => ({
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

  // Execute multicall
  const results = await client.multicall({
    contracts,
    batchSize: optimalBatchSize,
    multicallAddress: MULTICALL3_ADDRESS,
  });

  // Extract and return balance values
  return results.map((result) => 
    result.status === "success" ? result.result : 0n
  );
}

// Fetch token info (symbol, decimals)
async function fetchTokenInfo(tokenAddress: Address) {
  try {
    // Get token symbol
    const symbolResult = await client.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "symbol",
    });
    
    // Get token decimals
    const decimalsResult = await client.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "decimals",
    });
    
    return {
      address: tokenAddress,
      symbol: symbolResult,
      decimals: decimalsResult,
    };
  } catch (error) {
    console.error(`Error fetching info for token ${tokenAddress}:`, error);
    return {
      address: tokenAddress,
      symbol: "UNKNOWN",
      decimals: 18, // Default to 18 decimals
    };
  }
}

// Fetch token balances using multicall
async function fetchTokenBalances(
  wallets: Address[],
  tokenAddress: Address,
  tokenDecimals: number
): Promise<bigint[]> {
  if (args.verbose) console.log(`Fetching token balances for ${wallets.length} wallets from ${tokenAddress}...`);
  
  const optimalBatchSize = getOptimalBatchSize(wallets.length);
  
  // Create multicall contracts array for token balances
  const contracts = wallets.map((address) => ({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [address],
  }));

  // Execute multicall
  const results = await client.multicall({
    contracts,
    batchSize: optimalBatchSize,
    multicallAddress: MULTICALL3_ADDRESS,
  });

  // Extract and return balance values
  return results.map((result) => 
    result.status === "success" ? result.result : 0n
  );
}

// Format balance with proper decimal places
function formatBalance(balance: bigint, decimals: number, symbol: string): string {
  return `${formatUnits(balance, decimals)} ${symbol}`;
}

// Calculate summary statistics for balances
function calculateStats(balances: bigint[], decimals: number) {
  const total = balances.reduce((sum, val) => sum + val, 0n);
  const nonZeroCount = balances.filter(b => b > 0n).length;
  const max = balances.reduce((max, val) => val > max ? val : max, 0n);
  const min = nonZeroCount > 0 
    ? balances.filter(b => b > 0n).reduce((min, val) => val < min ? val : min, balances.find(b => b > 0n) || 0n)
    : 0n;
  const avg = balances.length > 0 ? total / BigInt(balances.length) : 0n;
  
  return {
    total,
    avg,
    min,
    max,
    nonZeroCount,
    percentNonZero: (nonZeroCount / balances.length) * 100,
    decimals,
  };
}

// Generate a text report
function generateTextReport(
  wallets: Address[],
  ethBalances: bigint[],
  tokenData: Array<{ address: Address, symbol: string, decimals: number, balances: bigint[] }>
): string {
  const ethStats = calculateStats(ethBalances, 18);
  const totalWallets = wallets.length;
  
  let report = `Wallet Balance Report\n=====================\n`;
  report += `Generated: ${new Date().toISOString()}\n`;
  report += `Wallets Checked: ${totalWallets}\n\n`;
  
  // ETH balance section
  if (!args["token-only"]) {
    report += `ETH Balances:\n-------------\n`;
    report += `Total ETH: ${formatEther(ethStats.total)} ETH\n`;
    report += `Average: ${formatEther(ethStats.avg)} ETH\n`;
    report += `Min: ${formatEther(ethStats.min)} ETH\n`;
    report += `Max: ${formatEther(ethStats.max)} ETH\n`;
    report += `Non-zero Wallets: ${ethStats.nonZeroCount}/${totalWallets} (${ethStats.percentNonZero.toFixed(1)}%)\n\n`;
  }
  
  // Token balance section
  if (!args["eth-only"] && tokenData.length > 0) {
    report += `Token Balances:\n--------------\n`;
    
    for (const token of tokenData) {
      const stats = calculateStats(token.balances, token.decimals);
      const shortAddr = `${token.address.substring(0, 6)}...${token.address.substring(token.address.length - 4)}`;
      
      report += `${token.symbol} (${shortAddr}):\n`;
      report += `  Total: ${formatUnits(stats.total, token.decimals)} ${token.symbol}\n`;
      report += `  Average: ${formatUnits(stats.avg, token.decimals)} ${token.symbol}\n`;
      report += `  Min: ${formatUnits(stats.min, token.decimals)} ${token.symbol}\n`;
      report += `  Max: ${formatUnits(stats.max, token.decimals)} ${token.symbol}\n`;
      report += `  Non-zero Wallets: ${stats.nonZeroCount}/${totalWallets} (${stats.percentNonZero.toFixed(1)}%)\n\n`;
    }
  }
  
  // Individual wallet listing (if not summary only)
  if (!args["summary-only"]) {
    report += `Top Wallets by ETH Balance:\n--------------------------\n`;
    
    // Create combined data for all wallets
    const walletData = wallets.map((address, i) => {
      const ethBalance = ethBalances[i];
      const tokenBalances = tokenData.map(token => ({
        symbol: token.symbol,
        balance: token.balances[i],
        decimals: token.decimals,
      }));
      
      return { address, ethBalance, tokenBalances };
    });
    
    // Filter by minimum balance if specified
    const filteredWallets = args["min-balance"]
      ? walletData.filter(w => parseFloat(formatEther(w.ethBalance)) >= minBalance)
      : walletData;
    
    // Sort by ETH balance (descending)
    const sortedWallets = [...filteredWallets].sort((a, b) => {
      return a.ethBalance > b.ethBalance ? -1 : a.ethBalance < b.ethBalance ? 1 : 0;
    });
    
    // List top wallets (max 20 for readability)
    const topWallets = sortedWallets.slice(0, 20);
    topWallets.forEach((wallet, i) => {
      const shortAddr = `${wallet.address.substring(0, 6)}...${wallet.address.substring(wallet.address.length - 4)}`;
      let line = `${i + 1}. ${shortAddr}: ${formatEther(wallet.ethBalance)} ETH`;
      
      wallet.tokenBalances.forEach(token => {
        line += `, ${formatUnits(token.balance, token.decimals)} ${token.symbol}`;
      });
      
      report += line + '\n';
    });
  }
  
  return report;
}

// Generate a CSV report
function generateCsvReport(
  wallets: Address[],
  ethBalances: bigint[],
  tokenData: Array<{ address: Address, symbol: string, decimals: number, balances: bigint[] }>
): string {
  let csv = "address,eth_balance";
  
  // Add token columns to header
  tokenData.forEach(token => {
    csv += `,${token.symbol}_balance`;
  });
  csv += "\n";
  
  // Add data rows
  wallets.forEach((address, i) => {
    const ethBalance = parseFloat(formatEther(ethBalances[i]));
    
    // Skip if below minimum balance
    if (args["min-balance"] && ethBalance < minBalance) return;
    
    let row = `${address},${ethBalance}`;
    
    // Add token balances
    tokenData.forEach(token => {
      const tokenBalance = formatUnits(token.balances[i], token.decimals);
      row += `,${tokenBalance}`;
    });
    
    csv += row + "\n";
  });
  
  return csv;
}

// Generate a JSON report
function generateJsonReport(
  wallets: Address[],
  ethBalances: bigint[],
  tokenData: Array<{ address: Address, symbol: string, decimals: number, balances: bigint[] }>
): string {
  const ethStats = calculateStats(ethBalances, 18);
  
  // Calculate token stats
  const tokenStats = tokenData.map(token => {
    const stats = calculateStats(token.balances, token.decimals);
    return {
      address: token.address,
      symbol: token.symbol,
      decimals: token.decimals,
      total: formatUnits(stats.total, token.decimals),
      average: formatUnits(stats.avg, token.decimals),
      min: formatUnits(stats.min, token.decimals),
      max: formatUnits(stats.max, token.decimals),
      nonZeroCount: stats.nonZeroCount,
      percentNonZero: stats.percentNonZero,
    };
  });
  
  // Create wallet data
  const walletData = wallets.map((address, i) => {
    const ethBalance = parseFloat(formatEther(ethBalances[i]));
    
    // Skip if below minimum balance
    if (args["min-balance"] && ethBalance < minBalance) return null;
    
    const tokenBalances: Record<string, string> = {};
    tokenData.forEach(token => {
      tokenBalances[token.symbol] = formatUnits(token.balances[i], token.decimals);
    });
    
    return {
      address,
      ethBalance: ethBalance.toString(),
      tokenBalances,
    };
  }).filter(Boolean); // Remove null entries
  
  // Construct the complete report
  const report = {
    generated: new Date().toISOString(),
    walletsChecked: wallets.length,
    summary: {
      eth: args["token-only"] ? undefined : {
        total: formatEther(ethStats.total),
        average: formatEther(ethStats.avg),
        min: formatEther(ethStats.min),
        max: formatEther(ethStats.max),
        nonZeroCount: ethStats.nonZeroCount,
        percentNonZero: ethStats.percentNonZero,
      },
      tokens: args["eth-only"] ? undefined : tokenStats,
    },
    wallets: args["summary-only"] ? undefined : walletData,
  };
  
  return JSON.stringify(report, null, 2);
}

// Main execution function
async function main() {
  console.log("Wallet Balance Checker");
  console.log("=====================");

  // Get seed phrases
  const seedPhrases = getSeedPhrasesFromEnv();
  console.log(`Found ${seedPhrases.length} seed phrase(s) in environment variables`);
  
  // Generate wallet addresses for all seed phrases
  console.log(`Generating wallet addresses (max ${maxWallets} per seed phrase)...`);
  
  const allWallets: Address[] = [];
  for (const [index, phrase] of seedPhrases.entries()) {
    console.log(`Processing seed phrase ${index + 1}...`);
    try {
      const wallets = await generateWalletsParallel(phrase, maxWallets);
      allWallets.push(...wallets);
    } catch (error) {
      console.error(`Error generating wallets for seed phrase ${index + 1}:`, error);
      console.log("Continuing with other seed phrases...");
    }
  }
  
  console.log(`Generated ${allWallets.length} wallet addresses total`);
  
  // Fetch ETH balances if not token-only
  let ethBalances: bigint[] = [];
  if (!args["token-only"]) {
    try {
      ethBalances = await fetchEthBalances(allWallets);
      console.log(`Successfully fetched ETH balances for ${allWallets.length} wallets`);
    } catch (error) {
      console.error("Error fetching ETH balances:", error);
      Deno.exit(1);
    }
  }
  
  // Fetch token info and balances if not eth-only
  const tokenData: Array<{ address: Address, symbol: string, decimals: number, balances: bigint[] }> = [];
  if (!args["eth-only"]) {
    for (const tokenAddress of TOKEN_ADDRESSES) {
      const address = tokenAddress as Address;
      
      try {
        // Get token info
        console.log(`Fetching info for token ${address}...`);
        const tokenInfo = await fetchTokenInfo(address);
        
        // Get token balances
        const balances = await fetchTokenBalances(allWallets, address, tokenInfo.decimals);
        console.log(`Successfully fetched ${tokenInfo.symbol} balances for ${allWallets.length} wallets`);
        
        tokenData.push({
          address,
          symbol: tokenInfo.symbol,
          decimals: tokenInfo.decimals,
          balances,
        });
      } catch (error) {
        console.error(`Error processing token ${address}:`, error);
        console.log("Continuing with other tokens...");
      }
    }
  }
  
  // Generate report based on format
  let report = "";
  if (format === "text") {
    report = generateTextReport(allWallets, ethBalances, tokenData);
  } else if (format === "csv") {
    report = generateCsvReport(allWallets, ethBalances, tokenData);
  } else if (format === "json") {
    report = generateJsonReport(allWallets, ethBalances, tokenData);
  }
  
  // Output the report
  if (args.output) {
    try {
      await Deno.writeTextFile(args.output, report);
      console.log(`Report written to ${args.output}`);
    } catch (error) {
      console.error(`Error writing to file ${args.output}:`, error);
      console.log("Printing to console instead:");
      console.log(report);
    }
  } else {
    console.log("\n" + report);
  }
}

// Execute the main function
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error("Unhandled error:", error);
    Deno.exit(1);
  }
} 