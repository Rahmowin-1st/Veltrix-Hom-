# Mega Search and Local Adaptive Engine

## Mega Search
Ranking is deterministic: exact title/id → alias → prefix → substring → explicit misspelling → fuzzy edit similarity → keyword/topic relevance → small local-usage boost. Text is normalized case/punctuation-wise, subject filters are applied before ranking, a confidence cutoff suppresses unrelated results, and optional match reason/score are exposed.

Tests cover exact, aliases, typo/misspelling (`Vieta`, `Biyt`, `qudratic`), subject filtering and false-positive suppression.

## Adaptive Engine
Local-only state may persist Last Used 5, converter usage, favorites, subject/tool usage, preferred currency pairs/units/mode, last degree/form, per-tool settings and graph state. Search boost is intentionally small. Reset returns an empty deterministic state.

There is no Continue field/feed, no streak/gamification, and no keypad/core-navigation reordering contract.
