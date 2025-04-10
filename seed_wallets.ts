import "jsr:@std/dotenv/load";

console.log("Loading environment variables...");

const seedPhrase1 = Deno.env.get("SEED_PHRASE_1");
const seedPhrase2 = Deno.env.get("SEED_PHRASE_2");

if (seedPhrase1) {
    console.log("Loaded SEED_PHRASE_1");
} else {
    console.warn("SEED_PHRASE_1 not found in .env file.");
}

if (seedPhrase2) {
    console.log("Loaded SEED_PHRASE_2");
} else {
    console.warn("SEED_PHRASE_2 not found in .env file.");
}

// TODO: Implement wallet derivation and KV storage 