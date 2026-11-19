# Cost scenarios (research sensitivity; assumptions, not verified market charges)

The configured rates (`src/lib/services/transactionCosts.ts`, version nse-options-2024-10) are accepted as the **base** assumption. They are not verified against current schedules. Official schedules must be checked for each trading date before any result can count as independent evidence.

| Scenario | Costs | Entry and exit slippage | Use |
|---|---|---|---|
| Base | Configured rates | 1% each side (`riskConfig.ts`) | Default research assumption |
| Adverse | Configured rates × 1.5 | 2% each side | Sensitivity |
| Stress | Configured rates × 2 | 4% each side | Sensitivity |

The multipliers and slippage levels for adverse and stress are **my proposals**, chosen as round sensitivity values. The owner should confirm or replace them before use. They must not be treated as market measurements.

Changing the configured values is a separate decision. Newer rates found in official schedules are recorded as differences, not applied automatically.
