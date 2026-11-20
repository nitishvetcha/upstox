# Refreshed commit plan (2026-11-08). NOT STAGED. Awaiting explicit approval of the exact lists below.

Rules applied: no `git add .`; no broad ignore rules; source, protocols and evidence are never ignored; raw research data (`web/.research-data/`), runtime data (`web/.data/`), build outputs, `.env*` and tokens are excluded.

## Ignore-file changes applied

```diff
diff --git a/.gitignore b/.gitignore
index 2efff9f..c16fd40 100644
--- a/.gitignore
+++ b/.gitignore
@@ -20,3 +20,6 @@ snscrape/
 .DS_Store
 .env
 
+
+# Raw research data (approved 2026-11-08). Evidence is copied to docs/evidence/ with hashes.
+web/.research-data/
diff --git a/web/.gitignore b/web/.gitignore
index d282d5e..2c6f659 100644
--- a/web/.gitignore
+++ b/web/.gitignore
@@ -44,3 +44,9 @@ next-env.d.ts
 # Upstox access token (server-side store) & test data stores
 /.data
 /.test-data
+/.next-verify/
+
+# Build verification outputs and playwright artefacts (approved 2026-11-08)
+/.next-*/
+/playwright-report/
+/test-results/
```

Pre-existing, not from this session, in `web/next.config.ts`: `distDir` (uncommitted before this session). Reviewed; it is only a build-folder override and is kept.

## Groups (status: M modified, ?? new, D deleted)

Format: status path. Groups 1–5 are proposed commits in this order. PENDING is held until the route rewrite is confirmed.

```
## G1_REPOSITORY_HYGIENE (3)
## G2_APPLICATION_CORRECTNESS_AND_PROVENANCE (232)
## G3_SAVED_PICKS (9)
## G4_RESEARCH_PROTOCOLS_AND_EVIDENCE (76)
## G5_DOCS_CONFIG_TOOLING (126)
## PENDING_OPPORTUNITIES_ROUTE_REWRITE (29)

## G1_REPOSITORY_HYGIENE (3)
M  .gitignore
M  web/.gitignore
M  web/next.config.ts

## G2_APPLICATION_CORRECTNESS_AND_PROVENANCE (232)
M  web/src/app/api/auth/health/route.ts
M  web/src/app/api/auth/status/route.ts
M  web/src/app/api/opportunities/daily-summary/route.ts
M  web/src/app/api/opportunities/options/route.ts
M  web/src/app/api/opportunities/top/route.ts
?? web/src/app/api/options-canary/optionsCanaryRoute.test.ts
?? web/src/app/api/options-canary/route.ts
M  web/src/app/api/paper-opportunities/collect/route.ts
M  web/src/app/api/paper-opportunities/monitor/route.ts
M  web/src/app/api/paper-opportunities/route.ts
M  web/src/app/api/paper-trading/portfolio/route.ts
M  web/src/app/api/recommendations/diagnostic/route.ts
?? web/src/app/api/recommendations/generate/route.test.ts
M  web/src/app/api/recommendations/generate/route.ts
?? web/src/app/api/research/stock-candles-range/route.ts
?? web/src/app/api/research/stock-candles/route.ts
M  web/src/app/api/technical/[index]/route.ts
M  web/src/components/AnalysisPanels.tsx
M  web/src/components/DataStatus.tsx
M  web/src/components/DataTimestamps.tsx
M  web/src/components/MarketCard.tsx
?? web/src/components/OpsDetails.tsx
?? web/src/components/OpsPanel.tsx
M  web/src/components/PriceChart.tsx
M  web/src/components/RecommendationCard.tsx
M  web/src/components/RecommendationDiagnosticPanel.tsx
M  web/src/components/RecommendationEvaluation.tsx
M  web/src/components/SectionViews.tsx
M  web/src/components/Sidebar.tsx
M  web/src/components/TopBar.tsx
M  web/src/components/performance/WhatIfTables.tsx
?? web/src/components/research/CandleChart.tsx
?? web/src/components/research/LineChart.tsx
M  web/src/components/ui.tsx
M  web/src/lib/adapters/upstoxHistoricalOptionsAdapter.ts
?? web/src/lib/backfill-intraday-bars.test.ts
M  web/src/lib/backtestEngine.ts
M  web/src/lib/backtestExecution.ts
M  web/src/lib/backtestSnapshot.ts
?? web/src/lib/backtestTiming.ts
M  web/src/lib/backtestTypes.ts
?? web/src/lib/collect-intraday-bars.test.ts
?? web/src/lib/dataQuality.ts
?? web/src/lib/dataRoot.ts
?? web/src/lib/dataStatus.breadth.test.ts
M  web/src/lib/dataStatus.ts
?? web/src/lib/e2eOffline.test.ts
?? web/src/lib/engine/intradayConfidence.test.ts
?? web/src/lib/engine/intradayReplay.test.ts
?? web/src/lib/engine/intradayReplay.ts
M  web/src/lib/engine/opportunityEngine.ts
?? web/src/lib/engine/positionalBacktest.test.ts
?? web/src/lib/engine/positionalBacktest.ts
?? web/src/lib/engine/positionalTrend.test.ts
?? web/src/lib/engine/positionalTrend.ts
?? web/src/lib/engine/positionalV2.test.ts
?? web/src/lib/engine/positionalV2.ts
M  web/src/lib/engine/stockOpportunityEngine.ts
?? web/src/lib/historicalProbeCodes.test.ts
?? web/src/lib/intradayEvaluation.test.ts
?? web/src/lib/intradayEvaluation.ts
M  web/src/lib/marketHistory.ts
?? web/src/lib/mockLiveSafeguards.test.ts
?? web/src/lib/ops/jsonl.ts
?? web/src/lib/ops/ops.test.ts
?? web/src/lib/ops/opsStatus.ts
?? web/src/lib/options/fixture.ts
?? web/src/lib/options/greeks.ts
?? web/src/lib/options/options.test.ts
?? web/src/lib/options/recommend.ts
?? web/src/lib/options/storedResearch.ts
?? web/src/lib/optionsAudit.test.ts
?? web/src/lib/optionsAudit.ts
?? web/src/lib/optionsAuditReport.ts
?? web/src/lib/optionsDataQualityDiagnostic.test.ts
?? web/src/lib/optionsDataQualityDiagnostic.ts
M  web/src/lib/paperEngine.ts
?? web/src/lib/paperFillCharges.test.ts
?? web/src/lib/paperIntegrity.test.ts
?? web/src/lib/paperMath.ts
?? web/src/lib/paperReport.ts
M  web/src/lib/paperStateMachine.ts
?? web/src/lib/paperTradingHardening.test.ts
M  web/src/lib/paperTypes.ts
M  web/src/lib/phase13.test.ts
?? web/src/lib/phase13OptionsVisibility.test.ts
M  web/src/lib/phase14.test.ts
M  web/src/lib/phase19.test.ts
M  web/src/lib/phase20.test.ts
M  web/src/lib/phase22.test.ts
M  web/src/lib/phase23.test.ts
M  web/src/lib/phase24.test.ts
M  web/src/lib/phase25.test.ts
M  web/src/lib/phase27.test.ts
M  web/src/lib/phase28.test.ts
M  web/src/lib/phase29.test.ts
M  web/src/lib/phase30_1.test.ts
?? web/src/lib/productionReadinessAudit.test.ts
M  web/src/lib/recommendation.test.ts
?? web/src/lib/recommendationDiagnostic.b5.test.ts
?? web/src/lib/recommendationDiagnostic.classification.test.ts
M  web/src/lib/recommendationDiagnostic.ts
?? web/src/lib/recommendationEnricher.indices.test.ts
M  web/src/lib/recommendationEnricher.ts
?? web/src/lib/research/auditExperiments.test.ts
?? web/src/lib/research/auditExperiments.ts
?? web/src/lib/research/candidateStatus.test.ts
?? web/src/lib/research/candidateStatus.ts
?? web/src/lib/research/dailyEquity.test.ts
?? web/src/lib/research/dailyEquity.ts
?? web/src/lib/research/frozenResults.ts
?? web/src/lib/research/intradayHourly.test.ts
?? web/src/lib/research/intradayHourly.ts
?? web/src/lib/research/intradayHypotheses.ts
?? web/src/lib/research/inventoryStore.ts
?? web/src/lib/research/optionChainReconstruction.test.ts
?? web/src/lib/research/optionChainReconstruction.ts
?? web/src/lib/research/optionsAuditResearch.test.ts
?? web/src/lib/research/optionsAuditResearch.ts
?? web/src/lib/research/optionsAuditResearchPhase8.test.ts
?? web/src/lib/research/optionsInventory.test.ts
?? web/src/lib/research/optionsInventory.ts
?? web/src/lib/research/researchRunner.test.ts
?? web/src/lib/research/stockCandleRequest.ts
?? web/src/lib/runnerLib.test.ts
?? web/src/lib/runtimeTrust.test.ts
?? web/src/lib/scoreText.test.ts
?? web/src/lib/scoreText.ts
?? web/src/lib/services/apiIntegration.test.ts
M  web/src/lib/services/backtestScenarios.ts
M  web/src/lib/services/backtestStore.ts
M  web/src/lib/services/breadthConfig.ts
M  web/src/lib/services/breadthConstituents.generated.ts
M  web/src/lib/services/breadthService.ts
?? web/src/lib/services/breadthSetFreshness.test.ts
?? web/src/lib/services/breadthTimestamps.test.ts
M  web/src/lib/services/cache.ts
?? web/src/lib/services/cacheBounds.test.ts
?? web/src/lib/services/candleFreshness.ts
?? web/src/lib/services/candleFreshnessAttribution.test.ts
?? web/src/lib/services/candleFreshnessPolicy.test.ts
?? web/src/lib/services/chainFreshness.test.ts
?? web/src/lib/services/chainFreshness.ts
?? web/src/lib/services/chainNormalization.test.ts
?? web/src/lib/services/contractFreshnessReconciliation.test.ts
?? web/src/lib/services/contractFreshnessSafeguards.test.ts
?? web/src/lib/services/expiryCalendar.test.ts
?? web/src/lib/services/expiryCalendarRules.test.ts
?? web/src/lib/services/freshnessConsistency.test.ts
M  web/src/lib/services/futures.test.ts
M  web/src/lib/services/futures.ts
M  web/src/lib/services/instrumentRegistry.ts
M  web/src/lib/services/liveOpportunityCollector.ts
?? web/src/lib/services/manualPaperOpportunityProtection.test.ts
M  web/src/lib/services/market.ts
M  web/src/lib/services/marketData.test.ts
M  web/src/lib/services/mock.ts
?? web/src/lib/services/mockExecutionGuard.test.ts
?? web/src/lib/services/mockInputs.ts
?? web/src/lib/services/multiSessionPaperEvaluation.test.ts
M  web/src/lib/services/news.test.ts
M  web/src/lib/services/news.ts
M  web/src/lib/services/newsApi.ts
M  web/src/lib/services/newsConfig.ts
?? web/src/lib/services/newsMockMode.test.ts
M  web/src/lib/services/newsProvider.ts
?? web/src/lib/services/nextBarExecution.test.ts
?? web/src/lib/services/nextBarExecutionRegression.test.ts
M  web/src/lib/services/opportunityTrackingStore.ts
?? web/src/lib/services/optionCandidateWindow.ts
M  web/src/lib/services/optionChainAnalytics.ts
M  web/src/lib/services/optionContractLTT.ts
?? web/src/lib/services/optionLegGuard.ts
?? web/src/lib/services/optionPriceConsistency.test.ts
?? web/src/lib/services/optionPriceVerification.ts
?? web/src/lib/services/optionQuoteCanary.ts
?? web/src/lib/services/optionWindowLegs.test.ts
?? web/src/lib/services/optionsV2IndexChecks.test.ts
?? web/src/lib/services/optionsV3Completion.test.ts
?? web/src/lib/services/paperLedgerStore.ts
M  web/src/lib/services/paperOpportunityMonitor.ts
M  web/src/lib/services/paperOpportunityStore.ts
?? web/src/lib/services/paperPriceInput.ts
?? web/src/lib/services/paperSettlementLifecycle.test.ts
M  web/src/lib/services/paperStore.ts
M  web/src/lib/services/paperTradeMonitorRunner.ts
M  web/src/lib/services/paperTrading.test.ts
M  web/src/lib/services/performance.test.ts
M  web/src/lib/services/phase10.test.ts
?? web/src/lib/services/phase11MarketReliability.test.ts
?? web/src/lib/services/phase1Hardening.test.ts
?? web/src/lib/services/phase2315Integration.test.ts
?? web/src/lib/services/phase2316Hardening.test.ts
M  web/src/lib/services/phase9.test.ts
M  web/src/lib/services/recommendationStore.ts
M  web/src/lib/services/risk.test.ts
M  web/src/lib/services/risk/riskConfig.ts
?? web/src/lib/services/risk/riskCosts.test.ts
?? web/src/lib/services/risk/riskService.test.ts
M  web/src/lib/services/risk/riskService.ts
M  web/src/lib/services/risk/riskTypes.ts
M  web/src/lib/services/rss.test.ts
M  web/src/lib/services/sessionEvidenceStore.ts
?? web/src/lib/services/settlementIngestion.test.ts
?? web/src/lib/services/settlementIngestion.ts
?? web/src/lib/services/stockMasterMockGuard.test.ts
M  web/src/lib/services/stockService.ts
M  web/src/lib/services/technical.test.ts
?? web/src/lib/services/technicalFetchGate.test.ts
?? web/src/lib/services/technicalMapping.ts
?? web/src/lib/services/timestampValidation.test.ts
M  web/src/lib/services/upstoxAuth.ts
?? web/src/lib/services/upstoxAuthSources.test.ts
M  web/src/lib/services/upstoxMarket.ts
M  web/src/lib/services/walkForwardStore.ts
?? web/src/lib/stockProvenance.test.ts
?? web/src/lib/stockSwingFreshness.test.ts
?? web/src/lib/stockV2/closingPlaceholders.test.ts
?? web/src/lib/stockV2/dataset.ts
?? web/src/lib/stockV2/indicators.ts
?? web/src/lib/stockV2/metrics.ts
?? web/src/lib/stockV2/placeholderExclusion.test.ts
?? web/src/lib/stockV2/research.ts
?? web/src/lib/stockV2/risk.ts
?? web/src/lib/stockV2/signal.ts
?? web/src/lib/stockV2/simulate.ts
?? web/src/lib/stockV2/stockV2.test.ts
?? web/src/lib/stockV2/stockV2Research.test.ts
?? web/src/lib/stockV2Dashboard.ts
?? web/src/lib/testFixtures/stockScan.ts
M  web/src/lib/time.ts
M  web/src/lib/types.ts

## G3_SAVED_PICKS (9)
?? web/src/app/api/saved-picks/route.test.ts
?? web/src/app/api/saved-picks/route.ts
?? web/src/app/saved-picks/page.tsx
?? web/src/components/SavePickButton.tsx
?? web/src/lib/savedPickMapping.test.ts
?? web/src/lib/savedPickMapping.ts
?? web/src/lib/savedPicks.duplicates.test.ts
?? web/src/lib/savedPicks.test.ts
?? web/src/lib/savedPicks.ts

## G4_RESEARCH_PROTOCOLS_AND_EVIDENCE (76)
?? docs/evidence/EVIDENCE_INDEX.md
?? docs/evidence/inputs/corporate-actions/corporate-actions-validation-all-years.json
?? docs/evidence/inputs/daily-universe/calendar.json
?? docs/evidence/inputs/daily-universe/coverage.json
?? docs/evidence/inputs/daily-universe/verification.json
?? docs/evidence/inputs/equity-master/EQUITY_L.csv
?? docs/evidence/inputs/nifty50/NSE_INDEX_Nifty_50__1d.json
?? docs/evidence/manifests/nse-bhavcopy-2026-11-06__manifest.jsonl
?? docs/evidence/manifests/nse-bhavcopy-newhost-2024-06-03-to-2026-11-05-2026-11-08__manifest.jsonl.gz
?? docs/evidence/manifests/nse-bhavcopy-sweep-2010-2026-2026-11-08__manifest.jsonl.gz
?? docs/evidence/manifests/nse-bhavcopy-sweep-2010-2026-INTERRUPTED-2026-11-08__manifest.copy-verified.jsonl.gz
?? docs/evidence/manifests/nse-bhavcopy-sweep-2010-2026-INTERRUPTED-2026-11-08__manifest.jsonl.gz
?? docs/evidence/manifests/nse-bhavcopy-v2-selftest-2026-11-08__manifest.jsonl
?? docs/evidence/manifests/nse-fo-discovery-2026-11-08__QUANTITY_FREEZE_STATUS.md
?? docs/evidence/manifests/nse-fo-discovery-2026-11-08__STATUS.md
?? docs/evidence/manifests/upstox-daily-universe-2026-11-08__manifest.jsonl.gz
?? docs/evidence/manifests/upstox-daily-universe-verified-2026-11-08__run-manifest.json
?? docs/evidence/manifests/upstox-pilot-100-2026-11-08__manifest.jsonl.gz
?? docs/evidence/manifests/upstox-pilot-verified-2026-11-08__run-manifest.json
?? docs/evidence/manifests/upstox-raw-2026-11-06-v1__manifest.jsonl.gz
?? docs/evidence/manifests/upstox-raw-2026-11-06-v2__manifest.jsonl.gz
?? docs/evidence/manifests/upstox-verified-2026-11-08-15m__run-manifest.json
?? docs/evidence/manifests/upstox-verified-2026-11-08-v1__run-manifest.json
?? docs/evidence/outputs/A2/after/positions-and-exclusions.json.gz
?? docs/evidence/outputs/A2/after/results.json
?? docs/evidence/outputs/A2/before/positions-and-exclusions.json.gz
?? docs/evidence/outputs/A2/before/results.json
?? docs/evidence/outputs/A3/h1-position-audit.json
?? docs/evidence/outputs/development/development-results.json
?? docs/protocols/A2_CONTAMINATION_ATTRIBUTION_AND_RERUN_v1.0.md
?? docs/protocols/A3_H1_POSITION_AUDIT_2026-11-08.md
?? docs/protocols/AMENDMENT_A2_PRICE_ARTEFACT_v1.0.md
?? docs/protocols/DEVELOPMENT_RESULTS_v1.0.md
?? docs/protocols/PROTOCOL_H1_RELATIVE_STRENGTH_12M_SKIP1M_v1.0.md
?? docs/protocols/PROTOCOL_H2_SHORT_REVERSAL_1M_v1.0.md
?? docs/protocols/PROTOCOL_H3_BREADTH_REGIME_v1.0.md
?? docs/protocols/PROTOCOL_H4_VOLATILITY_REGIME_v1.0.md
?? docs/protocols/PROTOCOL_H5_LIQUIDITY_BEHAVIOUR_v1.0.md
?? docs/protocols/REGISTRY_v1.0.json
?? web/scripts/backfill-intraday-bars.mjs
?? web/scripts/backtest-positional-v2.ts
?? web/scripts/backtest-positional.ts
?? web/scripts/check-research-token.ts
?? web/scripts/collect-intraday-bars.mjs
?? web/scripts/crosssectional-daily-a2.py
?? web/scripts/crosssectional-daily-dev.py
?? web/scripts/daily-equity-protocol.ts
?? web/scripts/intraday-evaluation.ts
?? web/scripts/intraday-hypotheses.ts
?? web/scripts/intraday-i1-protocol.ts
?? web/scripts/intraday-replay.ts
?? web/scripts/lib/intraday-core.mjs
?? web/scripts/nse-bhavcopy-sweep-v2.py
?? web/scripts/nse-bhavcopy-sweep.py
?? web/scripts/nse-bhavcopy-verify.py
?? web/scripts/nse-discovery-collect.ts
?? web/scripts/options-audit-research.ts
?? web/scripts/options-data-audit.ts
?? web/scripts/options-data-quality-diagnostic.ts
?? web/scripts/options-research-inventory.ts
?? web/scripts/outbound-recorder.cjs
?? web/scripts/phase15-options-reconstruction.ts
?? web/scripts/predictive-g1-v2.ts
?? web/scripts/predictive-g1.ts
?? web/scripts/recover-intraday-bars.mjs
?? web/scripts/research-audit-experiments.ts
?? web/scripts/stock-v2-export-trades.ts
?? web/scripts/stock-v2-placeholder-comparison.ts
?? web/scripts/stock-v2-research.ts
?? web/scripts/upstox-collect.ts
?? web/scripts/upstox-coverage.ts
?? web/scripts/upstox-daily-universe-collect.ts
?? web/scripts/upstox-discovery.mjs
?? web/scripts/upstox-pilot-collect.ts
?? web/scripts/upstox-verify-clean.ts
?? web/scripts/verify-mock-news-offline.mjs

## G5_DOCS_CONFIG_TOOLING (126)
?? docs/CONSTITUENT_FEASIBILITY_2026-11-08.md
?? docs/DAILY_CROSS_SECTIONAL_PROPOSAL_REVIEW_2026-11-08.md
?? docs/DAILY_CROSS_SECTIONAL_RESEARCH_PROPOSAL_2026-11-08.md
?? docs/DAILY_EQUITY_PROTOCOL.md
?? docs/DAILY_UNIVERSE_COLLECTION_REPORT_2026-11-08.md
?? docs/DAILY_UNIVERSE_COVERAGE_DIAGNOSTIC_2026-11-08.md
?? docs/DATA_VERIFICATION_2026-11-08.md
?? docs/DISK_SPACE_INVENTORY.md
?? docs/FINAL_OPERATIONAL_READINESS_REPORT.md
?? docs/FULL_MARKET_EXPANSION_REPORT_FINAL_2026-11-08.md
?? docs/FULL_MARKET_EXPANSION_REPORT_INTERIM_2026-11-08.md
?? docs/FULL_MARKET_SUPPLEMENT_1_2026-11-08.md
?? docs/FULL_MARKET_UNIVERSE_REQUIREMENTS_2026-11-08.md
?? docs/G1_RESULTS_V2_2026-11-08.md
?? docs/GIT_BASELINE_AUDIT.md
?? docs/GIT_BASELINE_COMMIT_PLAN.txt
?? docs/GIT_BASELINE_STATUS_2026-11-08.txt
?? docs/INTRADAY_PROTOCOLS_I2_TO_I8.md
?? docs/INTRADAY_PROTOCOL_I1_TREND_CONTINUATION.md
?? docs/ISSUE1_AUTHENTICATION_FIX_REPORT.md
?? docs/ISSUE1_AUTHENTICATION_INVESTIGATION.md
?? docs/ISSUE2_B1_DIAGNOSTIC_CLASSIFICATION_FIX_REPORT.md
?? docs/ISSUE2_B3_B7_B6_COMPLETION_REPORT.md
?? docs/ISSUE2_B4_BREADTH_TIMESTAMP_FIX_REPORT.md
?? docs/ISSUE2_B4_FINALISATION_REPORT.md
?? docs/ISSUE2_B4_FOLLOWUP_REPORT.md
?? docs/ISSUE2_B5_COMPLETION_REPORT.md
?? docs/ISSUE2_B5_GROUP_A_IMPLEMENTATION_REPORT.md
?? docs/ISSUE2_B5_TECHNICAL_CANDLE_FRESHNESS_INVESTIGATION.md
?? docs/ISSUE2_B6_B2_B3_B7_PROGRESS_REPORT.md
?? docs/ISSUE2_STALE_CLASSIFICATION_INVESTIGATION.md
?? docs/MASTER_ENGINEERING_AUDIT.md
?? docs/MASTER_PROJECT_COMPLETION_TRACKER.md
?? docs/NEXT_BAR_EXECUTION_VERIFICATION.md
?? docs/NEXT_SECURITY_UPGRADE_PROPOSAL.md
?? docs/OFFLINE_WORKFLOW_AND_DATA_QUALITY_AUDIT.md
?? docs/OPTIONS_DATA_DEPENDENCIES.md
?? docs/OPTIONS_DATA_RESEARCH_2026-11-08.md
?? docs/OPTIONS_ENGINE_AUDIT.md
?? docs/OPTIONS_FINAL_STRATEGY_SPEC.md
?? docs/OPTIONS_POST_COLLECTION_INVESTIGATION.md
?? docs/OPTIONS_STRATEGY_RESEARCH.md
?? docs/PHASE1_RISK_HARDENING.md
?? docs/PHASE2_HISTORICAL_DATA_AUDIT.md
?? docs/PHASE2_LEGACY_VS_NEXT_BAR_COMPARISON.md
?? docs/PHASE2_NEXT_BAR_VALIDATION_REPORT.md
?? docs/PREDICTIVE_POWER_DIAGNOSTIC_G1.md
?? docs/PREDICTIVE_POWER_G1_PROTOCOL_V2.md
?? docs/PROJECT_COMPLETION_REPORT.md
?? docs/PROJECT_TOOLING_AND_LICENSES.md
?? docs/STOCK_SWING_STALE_QUOTE_FIX_REPORT.md
?? docs/STOCK_SWING_STALE_QUOTE_INVESTIGATION.md
?? docs/STOCK_V2_BACKTEST_METHODOLOGY.md
?? docs/STOCK_V2_DEVELOPMENT_RESULTS.md
?? docs/STOCK_V2_FOUNDATION_AUDIT.md
?? docs/STOCK_V2_HISTORICAL_DATA_AUDIT.md
?? docs/STOCK_V2_PROTOCOL_RESTART.md
?? docs/STOCK_V2_STRATEGY_SPEC.md
?? docs/STOCK_V2_VALIDATION_RESULTS.md
?? docs/UPSTOX_ANALYZER_FINAL_PROJECT_REPORT.md
?? docs/UPSTOX_LIVE_DIAGNOSTIC_REPORT.md
M  web/.env.example
?? web/.nvmrc
M  web/AGENTS.md
?? web/docs/disk_crash_recovery_implementation_plan.md
?? web/docs/disk_crash_recovery_specification.md
?? web/docs/final_recommendation_quality_acceptance_report.md
?? web/docs/full_application_audit.md
?? web/docs/full_application_completion_tracker.md
?? web/docs/full_dashboard_completion_report.md
?? web/docs/fundamental_provider_comparison.md
?? web/docs/intraday-evaluation-rules.md
?? web/docs/intraday-replay-rules.md
?? web/docs/inventory/01-engines-and-domain-logic.md
?? web/docs/inventory/02-strategies-and-risk.md
?? web/docs/inventory/03-market-data-and-providers.md
?? web/docs/inventory/04-paper-trading-and-monitoring.md
?? web/docs/inventory/05-persistence-and-audit-storage.md
?? web/docs/inventory/06-api-routes-and-controllers.md
?? web/docs/inventory/07-ui-components-and-pages.md
?? web/docs/inventory/08-research-and-collection-scripts.md
?? web/docs/inventory/09-tests-and-fixtures.md
?? web/docs/inventory/10-application-source-and-lib.md
?? web/docs/inventory/11-configuration-and-deployment.md
?? web/docs/inventory/12-documentation-and-reports.md
?? web/docs/inventory/13-runtime-data-logs-and-bulk-artifacts.md
?? web/docs/inventory/14-legacy-python-root.md
?? web/docs/master-audit-and-implementation-plan.md
?? web/docs/options-audit-1a.md
?? web/docs/options-data-audit.md
?? web/docs/per_stock_technicals_implementation_plan.md
?? web/docs/phase2316_one_session_completion_report.md
?? web/docs/phase2316_opus_independent_audit.md
?? web/docs/phase2316_stage2_multisession_test_report.md
?? web/docs/playwright_e2e_acceptance_report.md
?? web/docs/positional-v2-hypothesis.md
?? web/docs/round1_final_acceptance_report.md
?? web/docs/round1_offline_completion_report.md
?? web/docs/round2_correction_report.md
?? web/docs/round2_final_consistency_audit.md
?? web/docs/round2_final_corrections.md
?? web/docs/round2_final_remediation_acceptance_report.md
?? web/docs/round2_final_remediation_baseline.md
?? web/docs/round2_final_safety_review.md
?? web/docs/round2_remaining_gaps_report.md
?? web/docs/strategy_11_4_baseline_verification.md
?? web/e2e/dashboard.spec.ts
?? web/e2e/logged-out.spec.ts
?? web/e2e/navigation.spec.ts
?? web/e2e/opportunities.spec.ts
?? web/e2e/responsive.spec.ts
?? web/ecosystem.config.cjs
M  web/eslint.config.mjs
M  web/package-lock.json
M  web/package.json
?? web/playwright.config.ts
?? web/scripts/constituents/bankex.txt
?? web/scripts/constituents/sensex.txt
M  web/scripts/paper-live.mjs
?? web/scripts/research-slot-runner.sh
M  web/scripts/run-paper-supervisor.mjs
M  web/scripts/run-paper-supervisor.sh
?? web/scripts/runner-lib.mjs
M  web/scripts/sync-constituents.mjs
M  web/scripts/upstox-status.mjs
M  web/tsconfig.json

## PENDING_OPPORTUNITIES_ROUTE_REWRITE (29)
?? web/src/app/(dashboard)/[section]/page.tsx
?? web/src/app/(dashboard)/layout.tsx
?? web/src/app/(dashboard)/market-history/page.tsx
?? web/src/app/(dashboard)/opportunities/page.tsx
?? web/src/app/(dashboard)/opportunity-journal/page.tsx
?? web/src/app/(dashboard)/option-history/page.tsx
?? web/src/app/(dashboard)/options-audit/page.tsx
?? web/src/app/(dashboard)/page.tsx
?? web/src/app/(dashboard)/recommendation-debug/page.tsx
?? web/src/app/(research)/layout.tsx
?? web/src/app/(research)/options-engine/page.tsx
?? web/src/app/(research)/options-research/page.tsx
?? web/src/app/(research)/performance/page.tsx
?? web/src/app/(research)/stock-v2/page.tsx
?? web/src/app/(research)/strategy-evidence/page.tsx
?? web/src/app/(research)/strategy-performance/page.tsx
D  web/src/app/[section]/page.tsx
M  web/src/app/error.tsx
M  web/src/app/globals.css
M  web/src/app/layout.tsx
D  web/src/app/market-history/page.tsx
D  web/src/app/opportunities/page.tsx
D  web/src/app/opportunity-journal/page.tsx
D  web/src/app/option-history/page.tsx
D  web/src/app/page.tsx
D  web/src/app/performance/page.tsx
D  web/src/app/recommendation-debug/page.tsx
?? web/src/app/route-isolation.test.ts
D  web/src/app/strategy-evidence/page.tsx
```

## Excluded from Git

- `web/.research-data/` (1.9 GB, 29,291 raw files): raw per-date snapshots. Evidence copies are in `docs/evidence/` (group 4).
- `web/.data/` (2.3 GB runtime store; contains the Upstox token file). Ignored, never tracked.
- Build and test outputs: `web/.next*`, `/.next-*/`, `web/playwright-report/`, `web/test-results/`, `web/.test-data/`, `web/logs/`.
- `.env`, `web/.env.local`, `*.pkl`, `*.log`, `venv*/`, `__pycache__/`, `snscrape/`.
- Temporary harness page and `.next-harness` from the browser test were deleted before this plan (not present).

## Research manifests, reports and protocols

- Protocols and registry: `docs/protocols/` committed as-is (group 4). Hashes verified against `REGISTRY_v1.0.json`.
- Evidence copies: `docs/evidence/` (28 files, about 14 MB, gzip where large). Index with SHA-256 and verification notes in `docs/evidence/EVIDENCE_INDEX.md`. Originals untouched.
- One original (`newhost` bhavcopy manifest) is still growing from a running sweep (PID 27472). Its copy is a snapshot; the index says so.

## Confirmations

- Research directory (1.9 GB) excluded: yes (ignored by root rule `web/.research-data/`).
- Build artefacts excluded: yes (`/.next-*/`, `/playwright-report/`, `/test-results/`, plus existing `/.next/`, `/.next-verify/`).
- Secrets and tokens excluded: yes. `.env*` ignored; `web/.data/upstox-token.json` ignored and never in history.
