// The single definition of the Upstox API host. Every module that talks to Upstox imports it from here.
// Changing it is an explicit code change, reviewed with the network gate (upstoxNetworkGate.ts). It is not an env setting,
// so a misconfigured variable cannot send requests to another host.
export const UPSTOX_API_BASE = "https://api.upstox.com";
