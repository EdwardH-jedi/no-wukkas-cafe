/** What the steaming step hands to the pour. */
export interface MilkQuality {
  /** °C when the steam valve closed. */
  temp: number;
  /** Air stretched into the milk, 0 = flat, ~0.3–0.6 = silky microfoam, 1 = stiff froth. */
  aeration: number;
  /** Big, visible bubbles from aerating too late or screeching, 0–1. */
  bubbles: number;
}

/** Perfect flat-white milk, used by the owner's demo. */
export const SILKY_MILK: MilkQuality = { temp: 60, aeration: 0.42, bubbles: 0 };
