'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Deck {
  deck_id: string
  name: string
  filter_topics: string[]
  filter_subtopics: string[]
  filter_tags: string[]
  filter_states: string[]
  filter_importance: string[]
  filter_quality: string[]
  sort_order: string
  totalCards: number
  progress: number
  progressPercent: number
  completed: boolean
}

interface FilterOptions {
  topicTree: Record<string, string[]>
  topics: string[]
  subtopics: string[]
  tags: string[]
  quality: string[]
  states: string[]
  importance: string[]
}

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    topicTree: {},
    topics: [],
    subtopics: [],
    tags: [],
    quality: [],
    states: [],
    importance: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Form state
  const [newDeckName, setNewDeckName] = useState('')
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [selectedImportance, setSelectedImportance] = useState<string[]>([])
  const [selectedQuality, setSelectedQuality] = useState<string[]>([])
  const [difficultyMin, setDifficultyMin] = useState<number | ''>('')
  const [difficultyMax, setDifficultyMax] = useState<number | ''>('')
  const [sortOrder, setSortOrder] = useState('due_date')
  const [maxCards, setMaxCards] = useState<number | ''>('')
  const [isCreating, setIsCreating] = useState(false)

  // Topic accordion state
  const [expandedTopics, setExpandedTopics] = useState<string[]>([])

  // Tag search state
  const [tagSearch, setTagSearch] = useState('')
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const tagContainerRef = useRef<HTMLDivElement>(null)

  // Close tag dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagContainerRef.current && !tagContainerRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch decks and filter options
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      try {
        const [decksRes, topicsRes] = await Promise.all([
          fetch('/api/decks'),
          fetch('/api/topics'),
        ])

        const decksData = await decksRes.json()
        const topicsData = await topicsRes.json()

        setDecks(decksData.decks || [])
        setFilterOptions({
          topicTree: topicsData.topicTree || {},
          topics: topicsData.topics || [],
          subtopics: topicsData.subtopics || [],
          tags: topicsData.tags || [],
          quality: topicsData.quality || [],
          states: topicsData.states || [],
          importance: topicsData.importance || [],
        })
      } catch (err) {
        console.error('Error fetching data:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  // Create deck
  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDeckName.trim()) return

    setIsCreating(true)
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDeckName,
          filterTopics: selectedTopics,
          filterSubtopics: selectedSubtopics,
          filterTags: selectedTags,
          filterStates: selectedStates,
          filterImportance: selectedImportance,
          filterQuality: selectedQuality,
          filterDifficultyMin: difficultyMin || null,
          filterDifficultyMax: difficultyMax || null,
          sortOrder,
          maxCards: maxCards || null,
        }),
      })

      const data = await res.json()

      if (res.ok && data.deck) {
        setDecks([data.deck, ...decks])
        setShowCreateModal(false)
        resetForm()
      } else {
        alert(data.error || 'Failed to create deck')
      }
    } catch (err) {
      console.error('Error creating deck:', err)
      alert('Failed to create deck')
    } finally {
      setIsCreating(false)
    }
  }

  const resetForm = () => {
    setNewDeckName('')
    setSelectedTopics([])
    setSelectedSubtopics([])
    setSelectedTags([])
    setSelectedStates([])
    setSelectedImportance([])
    setSelectedQuality([])
    setDifficultyMin('')
    setDifficultyMax('')
    setSortOrder('due_date')
    setMaxCards('')
    setExpandedTopics([])
    setTagSearch('')
  }

  const handleDeleteDeck = async (deckId: string) => {
    if (!confirm('Delete this deck?')) return
    try {
      await fetch(`/api/decks/${deckId}`, { method: 'DELETE' })
      setDecks(decks.filter(d => d.deck_id !== deckId))
    } catch (err) {
      console.error('Error deleting deck:', err)
    }
  }

  const handleResetDeck = async (deckId: string) => {
    try {
      await fetch(`/api/decks/${deckId}/reset`, { method: 'POST' })
      setDecks(decks.map(d =>
        d.deck_id === deckId
          ? { ...d, progress: 0, progressPercent: 0, completed: false }
          : d
      ))
    } catch (err) {
      console.error('Error resetting deck:', err)
    }
  }

  const toggleSelection = (
    value: string,
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (selected.includes(value)) {
      setSelected(selected.filter(v => v !== value))
    } else {
      setSelected([...selected, value])
    }
  }

  // Topic accordion helpers
  const toggleTopicExpanded = (topic: string) => {
    setExpandedTopics(prev =>
      prev.includes(topic)
        ? prev.filter(t => t !== topic)
        : [...prev, topic]
    )
  }

  const isTopicFullySelected = (topic: string) => {
    const subtopics = filterOptions.topicTree[topic] || []
    return subtopics.length > 0 && subtopics.every(st => selectedSubtopics.includes(st))
  }

  const isTopicPartiallySelected = (topic: string) => {
    const subtopics = filterOptions.topicTree[topic] || []
    const someSelected = subtopics.some(st => selectedSubtopics.includes(st))
    return someSelected && !isTopicFullySelected(topic)
  }

  const toggleTopicSelection = (topic: string) => {
    const subtopics = filterOptions.topicTree[topic] || []

    if (isTopicFullySelected(topic)) {
      // Deselect topic and all its subtopics
      setSelectedTopics(prev => prev.filter(t => t !== topic))
      setSelectedSubtopics(prev => prev.filter(st => !subtopics.includes(st)))
    } else {
      // Select topic and all its subtopics
      if (!selectedTopics.includes(topic)) {
        setSelectedTopics(prev => [...prev, topic])
      }
      setSelectedSubtopics(prev => {
        const newSubs = [...prev]
        for (const st of subtopics) {
          if (!newSubs.includes(st)) newSubs.push(st)
        }
        return newSubs
      })
    }
  }

  const toggleSubtopicSelection = (topic: string, subtopic: string) => {
    const subtopics = filterOptions.topicTree[topic] || []

    if (selectedSubtopics.includes(subtopic)) {
      // Deselect subtopic
      const newSubs = selectedSubtopics.filter(st => st !== subtopic)
      setSelectedSubtopics(newSubs)
      // If no subtopics of this topic remain, deselect the topic too
      const remainingForTopic = newSubs.filter(st => subtopics.includes(st))
      if (remainingForTopic.length === 0) {
        setSelectedTopics(prev => prev.filter(t => t !== topic))
      }
    } else {
      // Select subtopic and ensure parent topic is selected
      setSelectedSubtopics(prev => [...prev, subtopic])
      if (!selectedTopics.includes(topic)) {
        setSelectedTopics(prev => [...prev, topic])
      }
    }
  }

  // Tag search helpers
  const filteredTags = filterOptions.tags.filter(
    tag =>
      !selectedTags.includes(tag) &&
      tag.toLowerCase().includes(tagSearch.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/" className="text-gray-400 hover:text-white text-sm">
            &larr; Home
          </Link>
          <h1 className="text-2xl font-bold mt-2">Filtered Decks</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent-green hover:opacity-90 rounded-lg text-gray-900 font-medium"
        >
          + New Deck
        </button>
      </div>

      {/* Deck list */}
      {decks.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <p>No filtered decks yet.</p>
          <p className="text-sm mt-2">Create one to study specific topics or tags.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {decks.map(deck => (
            <div key={deck.deck_id} className="bg-dark-card rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-medium text-lg">{deck.name}</h3>
                  <div className="text-sm text-gray-400">
                    {deck.progress} / {deck.totalCards} cards
                    {deck.completed && ' \u2022 Completed \u2713'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/decks/${deck.deck_id}`}
                    className="px-3 py-1 bg-accent-green hover:opacity-90 rounded text-sm text-gray-900 font-medium"
                  >
                    {deck.completed ? 'Review' : 'Continue'}
                  </Link>
                  <button
                    onClick={() => handleResetDeck(deck.deck_id)}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => handleDeleteDeck(deck.deck_id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${deck.progressPercent}%` }}
                />
              </div>

              {/* Filter tags display */}
              {(
                (deck.filter_topics || []).length > 0 ||
                (deck.filter_tags || []).length > 0 ||
                (deck.filter_states || []).length > 0 ||
                (deck.filter_importance || []).length > 0 ||
                (deck.filter_quality || []).length > 0
              ) && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {(deck.filter_topics || []).map(t => (
                    <span key={t} className="text-xs bg-accent-green/30 px-2 py-0.5 rounded">{t}</span>
                  ))}
                  {(deck.filter_subtopics || []).map(t => (
                    <span key={t} className="text-xs bg-accent-green/20 px-2 py-0.5 rounded">{t}</span>
                  ))}
                  {(deck.filter_tags || []).map(t => (
                    <span key={t} className="text-xs bg-dark-accent px-2 py-0.5 rounded">#{t}</span>
                  ))}
                  {(deck.filter_states || []).map(s => (
                    <span key={s} className="text-xs bg-gray-600/30 px-2 py-0.5 rounded">{s}</span>
                  ))}
                  {(deck.filter_importance || []).map(imp => (
                    <span key={imp} className={`text-xs px-2 py-0.5 rounded ${imp === 'core' ? 'bg-accent-green/30' : 'bg-gray-500/30'}`}>
                      {imp === 'core' ? 'core' : 'supporting'}
                    </span>
                  ))}
                  {(deck.filter_quality || []).map(q => (
                    <span key={q} className="text-xs bg-blue-500/30 px-2 py-0.5 rounded">Quality {q}</span>
                  ))}
                  {deck.sort_order && deck.sort_order !== 'due_date' && (
                    <span className="text-xs bg-gray-600/30 px-2 py-0.5 rounded">
                      Sort: {deck.sort_order}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-dark-card rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Create Filtered Deck</h2>

            <form onSubmit={handleCreateDeck} className="space-y-5">
              {/* Deck Name */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Deck Name</label>
                <input
                  type="text"
                  value={newDeckName}
                  onChange={e => setNewDeckName(e.target.value)}
                  placeholder="e.g., Cytology Review"
                  className="w-full px-3 py-2 bg-dark-bg rounded-lg border border-gray-600 focus:border-accent-green focus:outline-none"
                  required
                />
              </div>

              {/* ── Topics & Subtopics Accordion ── */}
              {Object.keys(filterOptions.topicTree).length > 0 && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Topics &amp; Subtopics</label>
                  <div className="border border-gray-600 rounded-lg overflow-hidden">
                    {Object.entries(filterOptions.topicTree).map(([topic, subtopics]) => (
                      <div key={topic} className="border-b border-gray-700 last:border-b-0">
                        {/* Topic row */}
                        <div className="flex items-center gap-2 px-3 py-2 hover:bg-dark-accent/30">
                          {/* Expand/collapse button */}
                          <button
                            type="button"
                            onClick={() => toggleTopicExpanded(topic)}
                            className="text-gray-400 hover:text-white w-5 text-center flex-shrink-0"
                          >
                            {expandedTopics.includes(topic) ? '\u25BC' : '\u25B6'}
                          </button>

                          {/* Topic checkbox */}
                          <label className="flex items-center gap-2 flex-1 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isTopicFullySelected(topic)}
                              ref={el => {
                                if (el) el.indeterminate = isTopicPartiallySelected(topic)
                              }}
                              onChange={() => toggleTopicSelection(topic)}
                              className="w-4 h-4 rounded accent-[#8AC926]"
                            />
                            <span className="font-medium">{topic}</span>
                            <span className="text-xs text-gray-500">
                              ({subtopics.length} subtopic{subtopics.length !== 1 ? 's' : ''})
                            </span>
                          </label>
                        </div>

                        {/* Subtopics (expanded) */}
                        {expandedTopics.includes(topic) && subtopics.length > 0 && (
                          <div className="bg-dark-bg/50 pl-10 pr-3 py-1">
                            {subtopics.map(subtopic => (
                              <label
                                key={subtopic}
                                className="flex items-center gap-2 py-1.5 cursor-pointer select-none hover:text-white text-gray-300"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedSubtopics.includes(subtopic)}
                                  onChange={() => toggleSubtopicSelection(topic, subtopic)}
                                  className="w-4 h-4 rounded accent-[#8AC926]"
                                />
                                <span className="text-sm">{subtopic}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Selected summary */}
                  {selectedSubtopics.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedSubtopics.map(st => (
                        <span
                          key={st}
                          className="text-xs bg-accent-green/20 text-accent-green px-2 py-0.5 rounded-full flex items-center gap-1"
                        >
                          {st}
                          <button
                            type="button"
                            onClick={() => {
                              // Find parent topic
                              const parentTopic = Object.entries(filterOptions.topicTree)
                                .find(([, subs]) => subs.includes(st))?.[0]
                              if (parentTopic) toggleSubtopicSelection(parentTopic, st)
                            }}
                            className="hover:text-white"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Tags Searchable Multi-Select ── */}
              {filterOptions.tags.length > 0 && (
                <div ref={tagContainerRef}>
                  <label className="block text-sm text-gray-400 mb-2">Tags</label>

                  {/* Selected tag chips */}
                  {selectedTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {selectedTags.map(tag => (
                        <span
                          key={tag}
                          className="text-xs bg-dark-accent text-white px-2 py-1 rounded-full flex items-center gap-1"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
                            className="hover:text-red-400"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Search input */}
                  <div className="relative">
                    <input
                      ref={tagInputRef}
                      type="text"
                      value={tagSearch}
                      onChange={e => {
                        setTagSearch(e.target.value)
                        setTagDropdownOpen(true)
                      }}
                      onFocus={() => setTagDropdownOpen(true)}
                      placeholder="Search tags..."
                      className="w-full px-3 py-2 bg-dark-bg rounded-lg border border-gray-600 focus:border-accent-green focus:outline-none text-sm"
                    />

                    {/* Dropdown */}
                    {tagDropdownOpen && filteredTags.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-dark-card border border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {filteredTags.map(tag => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setSelectedTags(prev => [...prev, tag])
                              setTagSearch('')
                              tagInputRef.current?.focus()
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-dark-accent/50 text-gray-300 hover:text-white"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── State Toggle Buttons ── */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">State</label>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.states.map(state => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => toggleSelection(state, selectedStates, setSelectedStates)}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        selectedStates.includes(state)
                          ? 'bg-accent-green text-gray-900'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Importance Toggle Buttons ── */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Importance</label>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.importance.map(imp => (
                    <button
                      key={imp}
                      type="button"
                      onClick={() => toggleSelection(imp, selectedImportance, setSelectedImportance)}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        selectedImportance.includes(imp)
                          ? 'bg-accent-green text-gray-900'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {imp === 'core' ? 'Core' : 'Supporting'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Core = must-know concepts, Supporting = reinforcement
                </p>
              </div>

              {/* ── Quality Toggle Buttons ── */}
              {filterOptions.quality.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Quality</label>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.quality.map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => toggleSelection(q, selectedQuality, setSelectedQuality)}
                        className={`px-3 py-1 rounded-full text-sm transition-colors ${
                          selectedQuality.includes(q)
                            ? 'bg-accent-green text-gray-900'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Difficulty Range ── */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Difficulty Range
                  <span className="text-xs text-gray-500 ml-1">(1 = easy, 10 = hard, reviewed cards only)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={difficultyMin}
                    onChange={e => setDifficultyMin(e.target.value ? parseFloat(e.target.value) : '')}
                    placeholder="Min"
                    min={1}
                    max={10}
                    step={0.5}
                    className="w-24 px-3 py-2 bg-dark-bg rounded-lg border border-gray-600 focus:border-accent-green focus:outline-none text-sm"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="number"
                    value={difficultyMax}
                    onChange={e => setDifficultyMax(e.target.value ? parseFloat(e.target.value) : '')}
                    placeholder="Max"
                    min={1}
                    max={10}
                    step={0.5}
                    className="w-24 px-3 py-2 bg-dark-bg rounded-lg border border-gray-600 focus:border-accent-green focus:outline-none text-sm"
                  />
                </div>
              </div>

              {/* ── Sort Order ── */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Sort Order</label>
                <select
                  value={sortOrder}
                  onChange={e => setSortOrder(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-bg rounded-lg border border-gray-600 focus:border-accent-green focus:outline-none text-sm"
                >
                  <option value="due_date">Due Date (most overdue first)</option>
                  <option value="difficulty">Most Difficult</option>
                  <option value="lapses">Most Lapses</option>
                  <option value="random">Random</option>
                </select>
              </div>

              {/* ── Max Cards ── */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Max Cards (optional)</label>
                <input
                  type="number"
                  value={maxCards}
                  onChange={e => setMaxCards(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="Leave empty for all matching cards"
                  min={1}
                  className="w-full px-3 py-2 bg-dark-bg rounded-lg border border-gray-600 focus:border-accent-green focus:outline-none text-sm"
                />
              </div>

              {/* ── Buttons ── */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    resetForm()
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newDeckName.trim()}
                  className="flex-1 px-4 py-2 bg-accent-green hover:opacity-90 rounded-lg disabled:opacity-50 text-gray-900 font-medium"
                >
                  {isCreating ? 'Creating...' : 'Create Deck'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
