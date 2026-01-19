/**
 * FSRS (Free Spaced Repetition Scheduler) algorithm implementation.
 *
 * Based on the FSRS-4.5 algorithm. Reference implementations:
 * - https://github.com/open-spaced-repetition/py-fsrs
 * - https://borretti.me/article/implementing-fsrs-in-100-lines
 */

// User rating for a card review
export enum Rating {
  AGAIN = 1,  // Complete blackout, wrong answer
  HARD = 2,   // Significant difficulty, but recalled
  GOOD = 3,   // Correct with some hesitation
  EASY = 4,   // Perfect recall, no hesitation
}

// Card learning state
export enum State {
  NEW = 0,         // Never reviewed
  LEARNING = 1,    // Being learned (short intervals)
  REVIEW = 2,      // In regular review cycle
  RELEARNING = 3,  // Being relearned after lapse
}

// Default FSRS-4.5 parameters
const DEFAULT_WEIGHTS = [
  0.4072,   // w0: initial stability for Again
  1.1829,   // w1: initial stability for Hard
  3.1262,   // w2: initial stability for Good
  15.4722,  // w3: initial stability for Easy
  7.2102,   // w4: difficulty weight
  0.5316,   // w5: stability decay
  1.0651,   // w6: stability increase factor
  0.0046,   // w7: difficulty reversion
  1.5418,   // w8: stability after failure
  0.1618,   // w9: difficulty adjustment
  1.0,      // w10: hard penalty
  2.0523,   // w11: easy bonus
  0.1011,   // w12: short-term stability decay
  0.3479,   // w13: short-term forgetting factor
  0.2186,   // w14: stability growth rate
  0.0,      // w15: unused
  2.3245,   // w16: difficulty damping
]

export interface FSRSParams {
  weights: number[]
  requestRetention: number  // Target retention rate
  maximumInterval: number   // Max interval in days (~100 years)
}

export interface CardState {
  stability: number       // Memory stability (higher = longer retention)
  difficulty: number      // Card difficulty (0-10 scale)
  dueDate: Date | null
  lastReview: Date | null
  reviewCount: number
  lapses: number          // Number of times card was forgotten
  state: State
}

export interface SchedulingResult {
  newState: CardState
  intervalDays: number
}

function defaultParams(): FSRSParams {
  return {
    weights: [...DEFAULT_WEIGHTS],
    requestRetention: 0.9,
    maximumInterval: 36500,  // ~100 years
  }
}

function copyCardState(card: CardState): CardState {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    dueDate: card.dueDate ? new Date(card.dueDate) : null,
    lastReview: card.lastReview ? new Date(card.lastReview) : null,
    reviewCount: card.reviewCount,
    lapses: card.lapses,
    state: card.state,
  }
}

export class FSRS {
  private params: FSRSParams
  private w: number[]

  constructor(params?: Partial<FSRSParams>) {
    this.params = { ...defaultParams(), ...params }
    this.w = this.params.weights
  }

  /**
   * Calculate initial stability for a new card.
   */
  initStability(rating: Rating): number {
    // w0-w3 are initial stabilities for each rating
    return Math.max(this.w[rating - 1], 0.1)
  }

  /**
   * Calculate initial difficulty for a new card.
   */
  initDifficulty(rating: Rating): number {
    // Difficulty starts at w4 and adjusts based on rating
    // Range clamped to 1-10
    const d = this.w[4] - Math.exp(this.w[5] * (rating - 1)) + 1
    return Math.min(Math.max(d, 1.0), 10.0)
  }

  /**
   * Calculate the probability of recall (retrievability).
   *
   * R(t) = (1 + t/S * factor)^decay
   * where t is elapsed days, S is stability
   */
  retrievability(card: CardState, now: Date): number {
    if (card.lastReview === null || card.stability <= 0) {
      return 0.0
    }

    const elapsedDays = (now.getTime() - card.lastReview.getTime()) / (1000 * 86400)

    if (elapsedDays <= 0) {
      return 1.0
    }

    // Forgetting curve formula
    const factor = 19 / 81  // FSRS constant
    const decay = -0.5      // FSRS constant
    return Math.pow(1 + factor * elapsedDays / card.stability, decay)
  }

  /**
   * Calculate new difficulty after a review.
   */
  nextDifficulty(d: number, rating: Rating): number {
    // Mean reversion towards w4
    let dNew = d - this.w[6] * (rating - 3)
    // Damping
    dNew = this.w[7] * this.w[4] + (1 - this.w[7]) * dNew
    return Math.min(Math.max(dNew, 1.0), 10.0)
  }

  /**
   * Calculate new stability after successful recall.
   */
  nextRecallStability(d: number, s: number, r: number, rating: Rating): number {
    // Stability increase factor
    const hardPenalty = rating === Rating.HARD ? this.w[15] : 1.0
    const easyBonus = rating === Rating.EASY ? this.w[16] : 1.0

    const sNew = s * (
      1 +
      Math.exp(this.w[8]) *
      (11 - d) *
      Math.pow(s, -this.w[9]) *
      (Math.exp((1 - r) * this.w[10]) - 1) *
      hardPenalty *
      easyBonus
    )

    return Math.max(sNew, 0.1)
  }

  /**
   * Calculate new stability after forgetting (rating=Again).
   */
  nextForgetStability(d: number, s: number, r: number): number {
    const sNew = (
      this.w[11] *
      Math.pow(d, -this.w[12]) *
      (Math.pow(s + 1, this.w[13]) - 1) *
      Math.exp((1 - r) * this.w[14])
    )
    return Math.min(Math.max(sNew, 0.1), s)  // Never increase on forget
  }

  /**
   * Calculate the next interval in days based on stability.
   */
  nextInterval(stability: number): number {
    // Solve for interval where retrievability = request_retention
    // R = (1 + t/S * 19/81)^-0.5 = target
    // t = S * 81/19 * (target^-2 - 1)

    const target = this.params.requestRetention
    let interval = stability * (81 / 19) * (Math.pow(target, -2) - 1)
    interval = Math.max(1, Math.round(interval))
    return Math.min(interval, this.params.maximumInterval)
  }

  /**
   * Determine the next learning state.
   */
  nextState(current: State, rating: Rating): State {
    if (rating === Rating.AGAIN) {
      if (current === State.NEW || current === State.LEARNING) {
        return State.LEARNING
      } else {
        return State.RELEARNING
      }
    }

    if (current === State.NEW || current === State.LEARNING) {
      if (rating === Rating.EASY) {
        return State.REVIEW
      } else {
        return rating === Rating.HARD ? State.LEARNING : State.REVIEW
      }
    }

    return State.REVIEW
  }

  /**
   * Process a review and return the updated card state.
   */
  review(card: CardState, rating: Rating, now?: Date): SchedulingResult {
    if (!now) {
      now = new Date()
    }

    const newState = copyCardState(card)
    newState.reviewCount += 1
    newState.lastReview = now

    if (card.state === State.NEW) {
      // First review
      newState.stability = this.initStability(rating)
      newState.difficulty = this.initDifficulty(rating)
    } else {
      // Subsequent review
      const r = this.retrievability(card, now)
      newState.difficulty = this.nextDifficulty(card.difficulty, rating)

      if (rating === Rating.AGAIN) {
        newState.stability = this.nextForgetStability(
          card.difficulty, card.stability, r
        )
        newState.lapses += 1
      } else {
        newState.stability = this.nextRecallStability(
          card.difficulty, card.stability, r, rating
        )
      }
    }

    newState.state = this.nextState(card.state, rating)

    // Calculate interval
    let interval: number
    if (newState.state === State.LEARNING || newState.state === State.RELEARNING) {
      // Short intervals for learning cards
      if (rating === Rating.AGAIN) {
        interval = 1 / 1440  // 1 minute in days
      } else if (rating === Rating.HARD) {
        interval = 5 / 1440  // 5 minutes
      } else if (rating === Rating.GOOD) {
        interval = 10 / 1440  // 10 minutes
      } else {  // EASY
        interval = 1  // 1 day, graduate immediately
      }
    } else {
      interval = this.nextInterval(newState.stability)
    }

    newState.dueDate = new Date(now.getTime() + interval * 86400 * 1000)

    return { newState, intervalDays: interval }
  }

  /**
   * Get scheduled intervals for all ratings (for preview).
   */
  previewRatings(card: CardState, now?: Date): Record<Rating, number> {
    if (!now) {
      now = new Date()
    }

    return {
      [Rating.AGAIN]: this.review(card, Rating.AGAIN, now).intervalDays,
      [Rating.HARD]: this.review(card, Rating.HARD, now).intervalDays,
      [Rating.GOOD]: this.review(card, Rating.GOOD, now).intervalDays,
      [Rating.EASY]: this.review(card, Rating.EASY, now).intervalDays,
    }
  }
}

/**
 * Format an interval in human-readable form.
 */
export function formatInterval(days: number): string {
  if (days < 1 / 24) {  // Less than 1 hour
    const minutes = Math.round(days * 1440)
    return `${minutes}m`
  } else if (days < 1) {  // Less than 1 day
    const hours = Math.round(days * 24)
    return `${hours}h`
  } else if (days < 30) {
    return `${Math.round(days)}d`
  } else if (days < 365) {
    const months = Math.round(days / 30)
    return `${months}mo`
  } else {
    const years = Math.round(days / 365 * 10) / 10
    return `${years}y`
  }
}

/**
 * Convert database card to CardState for FSRS.
 */
export function dbCardToState(dbCard: {
  stability: number
  difficulty: number
  due_date: string | null
  last_review: string | null
  review_count: number
  lapses: number
  state: string
}): CardState {
  const stateMap: Record<string, State> = {
    'new': State.NEW,
    'learning': State.LEARNING,
    'review': State.REVIEW,
    'relearning': State.RELEARNING,
  }

  return {
    stability: dbCard.stability,
    difficulty: dbCard.difficulty,
    dueDate: dbCard.due_date ? new Date(dbCard.due_date) : null,
    lastReview: dbCard.last_review ? new Date(dbCard.last_review) : null,
    reviewCount: dbCard.review_count,
    lapses: dbCard.lapses,
    state: stateMap[dbCard.state] ?? State.NEW,
  }
}

/**
 * Convert CardState back to database format.
 */
export function stateToDbCard(state: CardState): {
  stability: number
  difficulty: number
  due_date: string | null
  last_review: string | null
  review_count: number
  lapses: number
  state: string
} {
  const stateMap: Record<State, string> = {
    [State.NEW]: 'new',
    [State.LEARNING]: 'learning',
    [State.REVIEW]: 'review',
    [State.RELEARNING]: 'relearning',
  }

  return {
    stability: state.stability,
    difficulty: state.difficulty,
    due_date: state.dueDate?.toISOString() ?? null,
    last_review: state.lastReview?.toISOString() ?? null,
    review_count: state.reviewCount,
    lapses: state.lapses,
    state: stateMap[state.state],
  }
}
