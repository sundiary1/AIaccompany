export interface MindfulnessTrack {
  id: string
  title: string
  description?: string
  category: "guided" | "nature"
  /** Same-origin static media, e.g. /audio/mindfulness/forest.mp3. */
  src: string
  cover?: string
}

// Add only supplied, licensed audio. Duration always comes from media metadata.
export const mindfulnessTracks: readonly MindfulnessTrack[] = []
