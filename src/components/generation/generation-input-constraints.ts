import type { GenerationInputConstraint, JsonValue } from "@/contracts/generation";

export interface GenerationParameterConflict {
  keys: string[];
}

export function generationParameterConflict(
  constraints: GenerationInputConstraint[],
  values: Record<string, JsonValue>,
): GenerationParameterConflict | null {
  for (const constraint of constraints) {
    if (constraint.kind !== "mutually-exclusive-parameters") continue;
    const populated = constraint.keys.filter((key) => parameterIsPopulated(values[key]));
    if (populated.length > 1) return { keys: populated };
  }
  return null;
}

function parameterIsPopulated(value: JsonValue | undefined) {
  return value !== undefined && value !== null && value !== "";
}
