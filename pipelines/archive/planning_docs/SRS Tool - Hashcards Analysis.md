---
type: project note
project: SRS Tool
status: active
tags: [work, project, education, board-exam, research]
MoC: "[[SRS Tool - MoC]]"
base: "[[00_Project Notes.base]]"
date_created: 2026-01-18
---
> Key insights from [[Fernando Borretti]]'s Hashcards project
Source: [Hashcards: A Plain-Text Spaced Repetition System](https://borretti.me/article/hashcards-plain-text-spaced-repetition)
GitHub: [eudoxia0/hashcards](https://github.com/eudoxia0/hashcards)
---
## Core Design Decisions to Adopt
### 1. Use FSRS, Not SM-2
Hashcards uses [[FSRS]] (Free Spaced Repetition Scheduler), which is more advanced than SM-2.
- SM-2 is simple but FSRS is proven to yield better recall for less review time
- Anki adopted FSRS as well
- Borretti implemented FSRS in ~100 lines: [blog post](https://borretti.me/article/implementing-fsrs-in-100-lines)
**Action:** Switch from SM-2 to FSRS in our implementation.
### 2. Minimal Cloze Syntax
Hashcards uses single square brackets for cloze:
```markdown
C: Speech is [produced] in [Broca's] area.
```
Compare to Mochi's verbose syntax:
```markdown
Speech is {{1::produced}} in {{2::Broca's}} area.
```
**Why it matters:** Square brackets don't require Shift key. Less typing = more cards = more knowledge.
**Action:** Use `[bracket]` syntax for cloze deletions.
### 3. Content-Addressed Cards (Hashing)
Cards are identified by hash of their content, not by database ID.
- Edit card text → new hash → treated as new card
- Preserves review history for unchanged cards
- Inspired by [[Andy Matuschak]]'s approach
**Action:** Implement content-addressing for card identity.
### 4. Separate State from Content
- **Cards:** Markdown files (human-readable, git-friendly)
- **Review state:** SQLite database in same directory
This separation is key: you edit cards as plain text, but review history persists.
**Action:** Store review state in SQLite, not in YAML frontmatter.
---
## Card Format Comparison
### Hashcards Format (simpler)
```markdown
Q: What is the role of synaptic vesicles?
A: They store neurotransmitters for release at the synaptic terminal.

C: Speech is [produced] in [Broca's] area.
```
### Our Original Format (more metadata)
```markdown
---
type: flashcard
topic: Thyroid FNA
difficulty: 3
ease_factor: 2.5
interval: 7
last_reviewed: 2026-01-15
---
# Question
What is Bethesda Category III?

---

# Answer
AUS/FLUS, 10-30% ROM
```
### Recommendation
Adopt Hashcards' simpler format:
- Less friction for card creation
- Move scheduling metadata to SQLite database
- Keep topic/tag metadata in file organization (folder structure)
---
## Key Insights
### Friction is the Enemy
> "The biggest bottleneck in spaced repetition is not doing the reviews... it's entering cards into the system."
> "If getting cards into the system involves a lot of friction, you write fewer cards."
Every keystroke matters. Every extra step is a card not written.
### More Cards = Better Learning
> "The surest way to shore up your knowledge is to write more flashcards about it: asking the same question in different ways, in different directions, from different angles."
Redundancy is good. Multiple edges connecting knowledge to your mind.
### Editing is Underrated
> "Your knowledge changes and improves over time. Often textbooks take this approach where Chapter 1 introduces one kind of ontology, and by Chapter 3 they tell you, 'actually that was a lie.'"
Cards need to evolve. Plain text makes bulk editing trivial.
### Why Plain Text + Git
- Edit with any editor
- Query with Unix tools (`grep`, `wc`, `awk`)
- Version control with Git
- Share on GitHub
- Generate cards with scripts
---
## Architecture Comparison
| Aspect | Hashcards | Our Original Plan |
|--------|-----------|-------------------|
| Card format | `Q:/A:` and `C:` prefixes | YAML frontmatter |
| Cloze syntax | `[brackets]` | `{{cloze}}` |
| State storage | SQLite | YAML in card files |
| Card identity | Content hash | File path |
| Algorithm | FSRS | SM-2 |
| Interface | Web UI on localhost | CLI first, then web |
---
## Revised Approach
Based on Hashcards insights, update our plan:
1. **Format:** Adopt `Q:/A:` and `C: [cloze]` syntax
2. **Algorithm:** Implement FSRS instead of SM-2
3. **State:** SQLite database for review history
4. **Identity:** Content-addressed (hash-based)
5. **Organization:** Folders/files for topics, not YAML metadata
---
## What We Can Add Beyond Hashcards
Hashcards is minimal by design. We can add:
- **AI card generation** from PDFs/images (not in Hashcards)
- **Topic tagging** via folder structure or filename prefixes
- **Study phases** integration (early/mid/late exam prep)
- **Obsidian integration** potential (cards as notes)
---
## Open Source Reference
Hashcards is open source. We can:
- Study the FSRS implementation
- Look at the card parser
- See how content-addressing works
- Understand the web UI approach
GitHub: https://github.com/eudoxia0/hashcards
---
## Related
- [[SRS Tool - Vision]] - Update with these insights
- [[SRS Tool - Development Plan]] - Revise approach
- [[SRS Tool - MoC]] - Main navigation
