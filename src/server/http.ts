import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ScenarioError } from "./errors";

export function scenarioFailure(error: unknown): NextResponse {
  if (error instanceof ZodError) return NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid request." } }, { status: 400 });
  if (error instanceof ScenarioError) return NextResponse.json({ ok: false, error: { code: error.code, message: error.message } }, { status: error.status });
  return NextResponse.json({ ok: false, error: { code: "TRANSITION_CONFLICT", message: "The scenario request could not be completed." } }, { status: 500 });
}

