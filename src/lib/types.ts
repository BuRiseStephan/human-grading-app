export type Grader = "A" | "B";

export const GRADERS: Grader[] = ["A", "B"];

export function isGrader(value: unknown): value is Grader {
  return value === "A" || value === "B";
}

/**
 * Exactly the fields a grader is allowed to see. Mirrors build_sample.py.
 * Both graders grade every item, in one shared randomized order.
 */
export interface BlindedItem {
  evaluation_id: string;
  display_order: number;
  abbreviation: string;
  primary_meaning: string;
  alternate_plausible_meanings: string;
  prompt: string;
  expected_interpretation_or_behavior: string;
  model_response: string;
}

export interface Grading {
  evaluation_id: string;
  grader: Grader;
  /** 1-4, or null for a full-form control that contains no abbreviation. */
  abbreviation_accuracy_score: number | null;
  final_answer_accuracy_score: number | null;
  clarification_appropriate: number | null;
  asked_for_clarification: number | null;
  unsupported_assumption: number | null;
  overconfident_wrong: number | null;
  hallucinated_detail: number | null;
  notes: string;
  updated_at: string;
}

export interface GraderStatus {
  grader: Grader;
  started_at: string | null;
  completed_at: string | null;
}

/** A grading counts as done only when every required field has a value. */
export const REQUIRED_FIELDS = [
  "final_answer_accuracy_score",
  "clarification_appropriate",
  "asked_for_clarification",
  "unsupported_assumption",
  "overconfident_wrong",
  "hallucinated_detail",
] as const;

export const FIELD_DOMAINS: Record<string, number[]> = {
  abbreviation_accuracy_score: [1, 2, 3, 4],
  final_answer_accuracy_score: [1, 2, 3, 4],
  clarification_appropriate: [0, 1],
  asked_for_clarification: [0, 1],
  unsupported_assumption: [0, 1, 2],
  overconfident_wrong: [0, 1],
  hallucinated_detail: [0, 1],
};
