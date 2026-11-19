// Token gate for the options research scheduler. Reads the local token state only: no network, no refresh,
// never prints the token. Exit 0 when a token is available, 1 otherwise.
import { getAccessToken } from "../src/lib/services/upstoxAuth.ts";

const credentialPresent = Boolean(await getAccessToken());
console.log(credentialPresent ? "CREDENTIAL_AVAILABLE" : "CREDENTIAL_MISSING");
process.exit(credentialPresent ? 0 : 1);
