// Phase 4 — Portfolio Circuit Breakers & Heat Stops Status Endpoint.
// GET: Returns current circuit breaker status, daily drawdown, cooldown timer, and active reasons.
// POST: Operator endpoint to reset a heat stop after manual risk review.

import { NextResponse } from "next/server";
import { circuitBreaker } from "@/lib/services/portfolioCircuitBreaker";
import { requireOperator } from "@/lib/operatorSession";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const state = circuitBreaker.getState();
  return NextResponse.json({
    status: "success",
    data: state,
  });
}

export async function POST(request: Request): Promise<Response> {
  const refused = requireOperator(request);
  if (refused) return refused;

  circuitBreaker.resetHeatStop();
  const state = circuitBreaker.getState();

  return NextResponse.json({
    status: "success",
    message: "Circuit breaker heat stop cleared by operator.",
    data: state,
  });
}
