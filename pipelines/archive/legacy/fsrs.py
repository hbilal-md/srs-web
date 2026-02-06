"""FSRS (Free Spaced Repetition Scheduler) algorithm implementation.

Based on the FSRS-4.5 algorithm. Reference implementations:
- https://github.com/open-spaced-repetition/py-fsrs
- https://borretti.me/article/implementing-fsrs-in-100-lines
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import IntEnum
from typing import List, Optional
import math


class Rating(IntEnum):
    """User rating for a card review."""

    AGAIN = 1  # Complete blackout, wrong answer
    HARD = 2  # Significant difficulty, but recalled
    GOOD = 3  # Correct with some hesitation
    EASY = 4  # Perfect recall, no hesitation


class State(IntEnum):
    """Card learning state."""

    NEW = 0  # Never reviewed
    LEARNING = 1  # Being learned (short intervals)
    REVIEW = 2  # In regular review cycle
    RELEARNING = 3  # Being relearned after lapse


# Default FSRS-4.5 parameters
DEFAULT_WEIGHTS = [
    0.4072,  # w0: initial stability for Again
    1.1829,  # w1: initial stability for Hard
    3.1262,  # w2: initial stability for Good
    15.4722,  # w3: initial stability for Easy
    7.2102,  # w4: difficulty weight
    0.5316,  # w5: stability decay
    1.0651,  # w6: stability increase factor
    0.0046,  # w7: difficulty reversion
    1.5418,  # w8: stability after failure
    0.1618,  # w9: difficulty adjustment
    1.0,  # w10: hard penalty
    2.0523,  # w11: easy bonus
    0.1011,  # w12: short-term stability decay
    0.3479,  # w13: short-term forgetting factor
    0.2186,  # w14: stability growth rate
    0.0,  # w15: unused
    2.3245,  # w16: difficulty damping
]


@dataclass
class FSRSParams:
    """FSRS algorithm parameters."""

    weights: List[float]
    request_retention: float = 0.9  # Target retention rate
    maximum_interval: int = 36500  # Max interval in days (~100 years)

    @classmethod
    def default(cls) -> "FSRSParams":
        return cls(weights=DEFAULT_WEIGHTS.copy())


@dataclass
class CardState:
    """Current state of a card for scheduling."""

    stability: float = 0.0  # Memory stability (higher = longer retention)
    difficulty: float = 0.0  # Card difficulty (0-10 scale)
    due_date: Optional[datetime] = None
    last_review: Optional[datetime] = None
    review_count: int = 0
    lapses: int = 0  # Number of times card was forgotten
    state: State = State.NEW

    def copy(self) -> "CardState":
        return CardState(
            stability=self.stability,
            difficulty=self.difficulty,
            due_date=self.due_date,
            last_review=self.last_review,
            review_count=self.review_count,
            lapses=self.lapses,
            state=self.state,
        )


@dataclass
class SchedulingResult:
    """Result of scheduling a card review."""

    new_state: CardState
    interval_days: float


class FSRS:
    """FSRS scheduler implementation."""

    def __init__(self, params: Optional[FSRSParams] = None):
        self.params = params or FSRSParams.default()
        self.w = self.params.weights

    def init_stability(self, rating: Rating) -> float:
        """Calculate initial stability for a new card."""
        # w0-w3 are initial stabilities for each rating
        return max(self.w[rating - 1], 0.1)

    def init_difficulty(self, rating: Rating) -> float:
        """Calculate initial difficulty for a new card."""
        # Difficulty starts at w4 and adjusts based on rating
        # Range clamped to 1-10
        d = self.w[4] - math.exp(self.w[5] * (rating - 1)) + 1
        return min(max(d, 1.0), 10.0)

    def retrievability(self, card: CardState, now: datetime) -> float:
        """Calculate the probability of recall (retrievability).

        R(t) = (1 + t/S * factor)^decay
        where t is elapsed days, S is stability
        """
        if card.last_review is None or card.stability <= 0:
            return 0.0

        elapsed_days = (now - card.last_review).total_seconds() / 86400

        if elapsed_days <= 0:
            return 1.0

        # Forgetting curve formula
        factor = 19 / 81  # FSRS constant
        decay = -0.5  # FSRS constant
        return math.pow(1 + factor * elapsed_days / card.stability, decay)

    def next_difficulty(self, d: float, rating: Rating) -> float:
        """Calculate new difficulty after a review."""
        # Mean reversion towards w4
        d_new = d - self.w[6] * (rating - 3)
        # Damping
        d_new = self.w[7] * self.w[4] + (1 - self.w[7]) * d_new
        return min(max(d_new, 1.0), 10.0)

    def next_recall_stability(
        self, d: float, s: float, r: float, rating: Rating
    ) -> float:
        """Calculate new stability after successful recall."""
        # Stability increase factor
        hard_penalty = self.w[15] if rating == Rating.HARD else 1.0
        easy_bonus = self.w[16] if rating == Rating.EASY else 1.0

        s_new = s * (
            1
            + math.exp(self.w[8])
            * (11 - d)
            * math.pow(s, -self.w[9])
            * (math.exp((1 - r) * self.w[10]) - 1)
            * hard_penalty
            * easy_bonus
        )

        return max(s_new, 0.1)

    def next_forget_stability(self, d: float, s: float, r: float) -> float:
        """Calculate new stability after forgetting (rating=Again)."""
        s_new = (
            self.w[11]
            * math.pow(d, -self.w[12])
            * (math.pow(s + 1, self.w[13]) - 1)
            * math.exp((1 - r) * self.w[14])
        )
        return min(max(s_new, 0.1), s)  # Never increase on forget

    def next_interval(self, stability: float) -> float:
        """Calculate the next interval in days based on stability."""
        # Solve for interval where retrievability = request_retention
        # R = (1 + t/S * 19/81)^-0.5 = target
        # t = S * 81/19 * (target^-2 - 1)

        target = self.params.request_retention
        interval = stability * (81 / 19) * (math.pow(target, -2) - 1)
        interval = max(1, round(interval))
        return min(interval, self.params.maximum_interval)

    def next_state(self, current: State, rating: Rating) -> State:
        """Determine the next learning state."""
        if rating == Rating.AGAIN:
            if current == State.NEW or current == State.LEARNING:
                return State.LEARNING
            else:
                return State.RELEARNING

        if current == State.NEW or current == State.LEARNING:
            if rating == Rating.EASY:
                return State.REVIEW
            else:
                return State.LEARNING if rating == Rating.HARD else State.REVIEW

        return State.REVIEW

    def review(
        self, card: CardState, rating: Rating, now: Optional[datetime] = None
    ) -> SchedulingResult:
        """Process a review and return the updated card state.

        Args:
            card: Current card state
            rating: User's rating (1-4)
            now: Review timestamp (defaults to current time)

        Returns:
            SchedulingResult with new state and interval
        """
        if now is None:
            now = datetime.now()

        new_state = card.copy()
        new_state.review_count += 1
        new_state.last_review = now

        if card.state == State.NEW:
            # First review
            new_state.stability = self.init_stability(rating)
            new_state.difficulty = self.init_difficulty(rating)
        else:
            # Subsequent review
            r = self.retrievability(card, now)
            new_state.difficulty = self.next_difficulty(card.difficulty, rating)

            if rating == Rating.AGAIN:
                new_state.stability = self.next_forget_stability(
                    card.difficulty, card.stability, r
                )
                new_state.lapses += 1
            else:
                new_state.stability = self.next_recall_stability(
                    card.difficulty, card.stability, r, rating
                )

        new_state.state = self.next_state(card.state, rating)

        # Calculate interval
        if new_state.state == State.LEARNING or new_state.state == State.RELEARNING:
            # Short intervals for learning cards
            if rating == Rating.AGAIN:
                interval = 1 / 1440  # 1 minute in days
            elif rating == Rating.HARD:
                interval = 5 / 1440  # 5 minutes
            elif rating == Rating.GOOD:
                interval = 10 / 1440  # 10 minutes
            else:  # EASY
                interval = 1  # 1 day, graduate immediately
        else:
            interval = self.next_interval(new_state.stability)

        new_state.due_date = now + timedelta(days=interval)

        return SchedulingResult(new_state=new_state, interval_days=interval)


def format_interval(days: float) -> str:
    """Format an interval in human-readable form."""
    if days < 1 / 24:  # Less than 1 hour
        minutes = round(days * 1440)
        return f"{minutes}m"
    elif days < 1:  # Less than 1 day
        hours = round(days * 24)
        return f"{hours}h"
    elif days < 30:
        return f"{round(days)}d"
    elif days < 365:
        months = round(days / 30)
        return f"{months}mo"
    else:
        years = round(days / 365, 1)
        return f"{years}y"
