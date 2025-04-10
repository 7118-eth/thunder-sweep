import {
    assertEquals,
    assertExists,
} from "@std/assert";
import {
    assertSpyCalls,
    spy,
} from "jsr:@std/testing/mock";
import {
    type Address
} from "viem";
import { getSeedPhrasesFromEnv, seedWallets } from "./seed_wallets.ts";

// --- Constants for Testing ---
const TEST_MNEMONIC_1 = "test test test test test test test test test test test junk";
const TEST_MNEMONIC_2 = "legal winner thank year wave sausage worth useful legal winner thank yellow";
// Expected addresses derived from TEST_MNEMONIC_1 (replace with actual results if needed)
const EXPECTED_ADDRESS_1_0: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const EXPECTED_ADDRESS_1_1: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const EXPECTED_ADDRESS_1_2: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
// Expected addresses derived from TEST_MNEMONIC_2
const EXPECTED_ADDRESS_2_0: Address = "0x58A57ed9d8d624cBD12e2C467D34787555bB1b25";

// --- Test Suite: getSeedPhrasesFromEnv ---
Deno.test("getSeedPhrasesFromEnv", async (t) => {
    await t.step("should return phrases from mocked environment", () => {
        const mockEnv = {
            SEED_PHRASE_1: TEST_MNEMONIC_1,
            SEED_PHRASE_2: TEST_MNEMONIC_2,
            OTHER_VAR: "some_value",
        };
        const phrases = getSeedPhrasesFromEnv(mockEnv);
        assertEquals(phrases.length, 2);
        assertEquals(phrases[0], { index: 1, phrase: TEST_MNEMONIC_1 });
        assertEquals(phrases[1], { index: 2, phrase: TEST_MNEMONIC_2 });
    });

    await t.step("should return an empty array if no seed phrases are found", () => {
        const mockEnv = { OTHER_VAR: "some_value" };
        const phrases = getSeedPhrasesFromEnv(mockEnv);
        assertEquals(phrases.length, 0);
    });

    await t.step("should stop searching when a number is skipped", () => {
        const mockEnv = {
            SEED_PHRASE_1: TEST_MNEMONIC_1,
            SEED_PHRASE_3: "should_not_be_found", // Gap at index 2
        };
        const phrases = getSeedPhrasesFromEnv(mockEnv);
        assertEquals(phrases.length, 1);
        assertEquals(phrases[0], { index: 1, phrase: TEST_MNEMONIC_1 });
    });

    await t.step("should handle only one seed phrase", () => {
        const mockEnv = {
            SEED_PHRASE_1: TEST_MNEMONIC_1,
        };
        const phrases = getSeedPhrasesFromEnv(mockEnv);
        assertEquals(phrases.length, 1);
        assertEquals(phrases[0], { index: 1, phrase: TEST_MNEMONIC_1 });
    });
});

// --- Test Suite: seedWallets ---
Deno.test("seedWallets", async (t) => {
    let kv: Deno.Kv;

    // Helper to setup/teardown in-memory KV for each step
    const setup = async () => {
        kv = await Deno.openKv(":memory:");
    };
    const teardown = () => {
        kv?.close();
    };

    await t.step("should derive and store addresses correctly for one mnemonic", async () => {
        await setup();
        const mockEnv = { SEED_PHRASE_1: TEST_MNEMONIC_1 };
        const options = { maxAddressIndex: 2 }; // Test a small range

        await seedWallets(kv, options, mockEnv);

        // Verify KV store contents
        const entry0 = await kv.get<Address>(["wallet_address", "seed_1", 0]);
        const entry1 = await kv.get<Address>(["wallet_address", "seed_1", 1]);
        const entry2 = await kv.get<Address>(["wallet_address", "seed_1", 2]);
        const entry3 = await kv.get<Address>(["wallet_address", "seed_1", 3]); // Should not exist

        assertExists(entry0.value);
        assertEquals(entry0.value, EXPECTED_ADDRESS_1_0);
        assertExists(entry1.value);
        assertEquals(entry1.value, EXPECTED_ADDRESS_1_1);
        assertExists(entry2.value);
        assertEquals(entry2.value, EXPECTED_ADDRESS_1_2);
        assertEquals(entry3.value, null); // Check boundary

        await teardown();
    });

    await t.step("should handle multiple mnemonics", async () => {
        await setup();
        const mockEnv = {
            SEED_PHRASE_1: TEST_MNEMONIC_1,
            SEED_PHRASE_2: TEST_MNEMONIC_2,
        };
        const options = { maxAddressIndex: 0 }; // Test only index 0 for simplicity

        await seedWallets(kv, options, mockEnv);

        const entry1_0 = await kv.get<Address>(["wallet_address", "seed_1", 0]);
        const entry2_0 = await kv.get<Address>(["wallet_address", "seed_2", 0]);
        const entry1_1 = await kv.get<Address>(["wallet_address", "seed_1", 1]); // Should not exist

        assertExists(entry1_0.value);
        assertEquals(entry1_0.value, EXPECTED_ADDRESS_1_0);
        assertExists(entry2_0.value);
        assertEquals(entry2_0.value, EXPECTED_ADDRESS_2_0);
        assertEquals(entry1_1.value, null); // Check boundary

        await teardown();
    });

    await t.step("should do nothing if no seed phrases are provided", async () => {
        await setup();
        const mockEnv = {};
        const options = { maxAddressIndex: 5 };
        const kvSetSpy = spy(kv, "set"); // Spy on kv.set

        // Suppress console.warn for this test
        const consoleWarnSpy = spy(console, "warn");

        try {
            await seedWallets(kv, options, mockEnv);
        } finally {
            consoleWarnSpy.restore(); // Restore console.warn
        }

        // Assert that kv.set was never called
        assertSpyCalls(kvSetSpy, 0);
        kvSetSpy.restore();

        await teardown();
    });

     await t.step("should skip and log warning for short mnemonics", async () => {
        await setup();
        const shortMnemonic = "too short";
        const mockEnv = {
            SEED_PHRASE_1: TEST_MNEMONIC_1, // Valid
            SEED_PHRASE_2: shortMnemonic,    // Invalid
            SEED_PHRASE_3: TEST_MNEMONIC_2, // Valid
        };
        const options = { maxAddressIndex: 0 }; // Test only index 0
        const kvSetSpy = spy(kv, "set");
        const consoleWarnSpy = spy(console, "warn");

        try {
            await seedWallets(kv, options, mockEnv);
        } finally {
            consoleWarnSpy.restore(); // Restore console.warn
        }

        // Verify KV store contents - only seeds 1 and 3 should be present
        const entry1 = await kv.get<Address>(["wallet_address", "seed_1", 0]);
        const entry2 = await kv.get<Address>(["wallet_address", "seed_2", 0]); // Should not exist
        const entry3 = await kv.get<Address>(["wallet_address", "seed_3", 0]);

        assertExists(entry1.value);
        assertEquals(entry1.value, EXPECTED_ADDRESS_1_0);
        assertEquals(entry2.value, null);
        assertExists(entry3.value);
        assertEquals(entry3.value, EXPECTED_ADDRESS_2_0);

        // Assert that kv.set was called twice (for seed 1 and 3)
        assertSpyCalls(kvSetSpy, 2);
        kvSetSpy.restore();

        await teardown();
    });

    // Note: Testing the console output (warn/error logs) is possible but adds complexity.
    // We primarily test the functional outcome (KV state) and function calls.
});

// TODO: Add tests for wallet seeding logic
// - Mock environment variables
// - Test wallet derivation
// - Test KV storage using Deno.openKv(":memory:") 