import { COMMODITIES, type CommodityId } from "./instrumentRegistry.ts";
import { getCachedMcxContract } from "./mcxContractResolver.ts";

export interface McxContractHealth {
  underlying: CommodityId;
  instrumentKey: string;
  keySource: "ENVIRONMENT" | "BUNDLED_DEFAULT";
  configuredExpiry: string | null;
  status: "READY_FOR_LIVE_CHECK" | "EXPIRY_UNCONFIGURED" | "ROLL_REQUIRED" | "INVALID_EXPIRY";
  message: string;
}

const expiryEnv: Record<CommodityId, string> = {
  crudeoil: "MCX_CRUDEOIL_EXPIRY",
  naturalgas: "MCX_NATURALGAS_EXPIRY",
  goldm: "MCX_GOLDM_EXPIRY",
  silverm: "MCX_SILVERM_EXPIRY",
};
const keyEnv: Record<CommodityId, string> = {
  crudeoil: "MCX_CRUDEOIL_KEY",
  naturalgas: "MCX_NATURALGAS_KEY",
  goldm: "MCX_GOLDM_KEY",
  silverm: "MCX_SILVERM_KEY",
};

export function mcxContractHealth(now = new Date()): McxContractHealth[] {
  return (Object.keys(COMMODITIES) as CommodityId[]).map((underlying) => {
    const cached = getCachedMcxContract(underlying, now);
    const rawEnvExpiry = process.env[expiryEnv[underlying]]?.trim() || null;
    const sanitizedEnvExpiry = rawEnvExpiry && /^28\d{2}-/.test(rawEnvExpiry) ? rawEnvExpiry.replace(/^28/, "20") : rawEnvExpiry;
    const configuredExpiry = cached?.expiry || sanitizedEnvExpiry;
    const keySource = cached ? "ENVIRONMENT" : (process.env[keyEnv[underlying]]?.trim() ? "ENVIRONMENT" : "BUNDLED_DEFAULT");
    const instrumentKey = cached?.instrumentKey ?? COMMODITIES[underlying].underlyingKey;
    if (!configuredExpiry) return {
      underlying, instrumentKey, keySource, configuredExpiry: null, status: "EXPIRY_UNCONFIGURED",
      message: "Set the current contract expiry in the environment before treating this MCX feed as operational.",
    };
    const expiryAt = Date.parse(`${configuredExpiry}T23:30:00+05:30`);
    if (!Number.isFinite(expiryAt)) return {
      underlying, instrumentKey, keySource, configuredExpiry, status: "INVALID_EXPIRY",
      message: "Configured MCX expiry must use YYYY-MM-DD.",
    };
    if (expiryAt <= now.getTime()) return {
      underlying, instrumentKey, keySource, configuredExpiry, status: "ROLL_REQUIRED",
      message: "Configured MCX contract is expired; update its instrument key and expiry before collection.",
    };
    return {
      underlying, instrumentKey, keySource, configuredExpiry, status: "READY_FOR_LIVE_CHECK",
      message: "Configuration present. A live Upstox quote/contract check is still required before a paper candidate can be accepted.",
    };
  });
}
