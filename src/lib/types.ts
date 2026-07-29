export type Grader = "A" | "B";

export const GRADERS: Grader[] = ["A", "B"];

export function isGrader(value: unknown): value is Grader {
  return value === "A" || value === "B";
}

export const VARIANTS = [
  "real_low_context",
  "real_high_context",
  "synthetic_high_context",
] as const;
export type Variant = (typeof VARIANTS)[number];

/** Human-readable condition label shown to graders. */
export const VARIANT_LABELS: Record<string, string> = {
  real_low_context: "Real abbreviation · low context",
  real_high_context: "Real abbreviation · high context",
  synthetic_high_context: "Synthetic sequence · high context",
};

/**
 * Exactly the fields a grader sees. The condition (variant) IS shown in V3
 * because the scoring rules depend on it. Model identity stays hidden.
 */
export interface BlindedItem {
  evaluation_id: string;
  display_order: number;
  variant: string;
  abbreviation: string;
  primary_meaning: string;
  alternate_plausible_meanings: string;
  prompt: string;
  model_response: string;
}

export interface Grading {
  evaluation_id: string;
  grader: Grader;
  /** 0-2, scored on every item. */
  accuracy_score: number | null;
  /** 0-2, only on real_low_context items. */
  clarification_score: number | null;
  /** 0-2, only on synthetic_high_context items. */
  hallucination_score: number | null;
  notes: string;
  updated_at: string;
}

export interface GraderStatus {
  grader: Grader;
  started_at: string | null;
  completed_at: string | null;
}

export const FIELD_DOMAINS: Record<string, number[]> = {
  accuracy_score: [0, 1, 2],
  clarification_score: [0, 1, 2],
  hallucination_score: [0, 1, 2],
};

export type GradingField = "accuracy_score" | "clarification_score" | "hallucination_score";

/** A disputed item to re-grade, with only the dimensions the raters disagreed on. */
export interface RegradeItem extends BlindedItem {
  dimensions: GradingField[];
}

/**
 * Which score fields an item requires, given its condition. Accuracy always;
 * clarification only for real_low_context; hallucination only for
 * synthetic_high_context. Shared by the form (which fields to show) and the
 * server (when an item counts as complete).
 */
export function requiredFields(variant: string): GradingField[] {
  const fields: GradingField[] = ["accuracy_score"];
  if (variant === "real_low_context") fields.push("clarification_score");
  if (variant === "synthetic_high_context") fields.push("hallucination_score");
  return fields;
}
