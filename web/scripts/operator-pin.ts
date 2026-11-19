// One-time setup of the operator PIN. Run once: npm run operator:pin
// Reads the PIN from the terminal, stores only a salted hash in .data/operator-pin.json. Refuses to overwrite.
// To change it later, use "Change PIN" in the app (it needs the current PIN).
import readline from "node:readline/promises";
import { setupPin, pinFile, isValidPinFormat } from "../src/lib/operatorPin.ts";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pin = (await rl.question("Choose a 6-digit PIN: ")).trim();
rl.close();
if (!isValidPinFormat(pin)) {
  console.log("The PIN must be exactly 6 digits. Nothing was changed.");
  process.exit(1);
}
const r = setupPin(pin);
if (r.ok) console.log(`PIN saved (hashed) at ${pinFile()}. Use it to sign in.`);
else console.log("A PIN is already set. Use 'Change PIN' in the app to change it. Nothing was changed.");
process.exit(r.ok ? 0 : 1);
