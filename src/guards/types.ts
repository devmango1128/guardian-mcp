export type Verdict = "allow" | "confirm" | "block";

export interface ClassifyResult {
  verdict: Verdict;
  reasons: string[];
}

export function allow(): ClassifyResult {
  return { verdict: "allow", reasons: [] };
}

export function block(reason: string): ClassifyResult {
  return { verdict: "block", reasons: [reason] };
}

export function confirm(reason: string): ClassifyResult {
  return { verdict: "confirm", reasons: [reason] };
}

export function worstOf(...results: ClassifyResult[]): ClassifyResult {
  const order: Record<Verdict, number> = { allow: 0, confirm: 1, block: 2 };
  let worst: ClassifyResult = allow();
  for (const r of results) {
    if (order[r.verdict] > order[worst.verdict]) {
      worst = r;
    } else if (r.verdict === worst.verdict && r.reasons.length) {
      worst = { verdict: worst.verdict, reasons: [...worst.reasons, ...r.reasons] };
    }
  }
  return worst;
}
