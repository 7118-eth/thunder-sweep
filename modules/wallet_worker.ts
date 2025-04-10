import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

// The worker receives a message with the batch to process
self.onmessage = async (e) => {
  const { mnemonic, startIndex, endIndex } = e.data;
  
  try {
    // Process addresses in this worker
    const addresses: Array<{ index: number; address: Address }> = [];
    
    for (let i = startIndex; i <= endIndex; i++) {
      const account = mnemonicToAccount(mnemonic, { addressIndex: i });
      addresses.push({ index: i, address: account.address });
    }
    
    // Send back the result
    self.postMessage({
      type: 'success',
      startIndex,
      endIndex,
      addresses
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      startIndex,
      endIndex,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}; 