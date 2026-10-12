export type SeasonMissionId = "visit" | "three-chests" | "ten-chests" | "trade";
export interface SeasonProgress {
  seasonId: "S1";
  day: string;
  points: number;
  earnedPoints: number;
  claimedMissionIds: SeasonMissionId[];
  /** Redemption stays recorded after selling, consuming or resetting an avatar. */
  redeemedItemIds: string[];
}
