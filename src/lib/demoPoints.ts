import { TEST_EX_GRANT } from "@/data/chestConfig";
import type { XperienceState } from "@/types/gamification";
// A fixed test grant is separate from game history and never resets earned rewards.
export function grantDemoPoints(state: XperienceState): XperienceState {
  return { ...state, exPoints: Math.min(Number.MAX_SAFE_INTEGER, state.exPoints + TEST_EX_GRANT) };
}
