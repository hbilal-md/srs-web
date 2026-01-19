'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Deck {
  deck_id: string
  name: string
  filter_topics: string[]
  filter_tags: string[]
  filter_states: string[]
  filter_importance: string[]
  totalCards: number
  progress: number
  progressPercent: number
  completed: boolean
}

interface FilterOptions {
  topics: string[]
  subtopics: string[]
  tags: string[]
  states: string[]
  importance: string[]
}

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    topics: [],
    subtopics: [],
    tags: [],
    states: [],
    importance: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Form state for new deck
  const [newDeckName, setNewDeckName] = useState('')
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [selectedImportance, setSelectedImportance] = useState<string[]>([])
  const [maxCards, setMaxCards] = useState<number | ''>('')
  const [isCreating, setIsCreating] = useState(false)

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
        setFilterOptions(topicsData)
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

  // Reset form
  const resetForm = () => {
    setNewDeckName('')
    setSelectedTopics([])
    setSelectedSubtopics([])
    setSelectedTags([])
    setSelectedStates([])
    setSelectedImportance([])
    setMaxCards('')
  }

  // Delete deck
  const handleDeleteDeck = async (deckId: string) => {
    if (!confirm('Delete this deck?')) return

    try {
      await fetch(`/api/decks/${deckId}`, { method: 'DELETE' })
      setDecks(decks.filter(d => d.deck_id !== deckId))
    } catch (err) {
      console.error('Error deleting deck:', err)
    }
  }

  // Reset deck
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

  // Toggle selection in multi-select
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/" className="text-gray-400 hover:text-white text-sm">
            ← Home
          </Link>
          <h1 className="text-2xl font-bold mt-2">Filtered Decks</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg"
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
            <div
              key={deck.deck_id}
              className="bg-[#16213e] rounded-lg p-4"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-medium text-lg">{deck.name}</h3>
                  <div className="text-sm text-gray-400">
                    {deck.progress} / {deck.totalCards} cards
                    {deck.completed && ' • Completed ✓'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/decks/${deck.deck_id}`}
                    className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm"
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

              {/* Progress bar */}
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${deck.progressPercent}%` }}
                />
              </div>

              {/* Filter tags */}
              {(deck.filter_topics.length > 0 || deck.filter_tags.length > 0 || deck.filter_states.length > 0 || (deck.filter_importance && deck.filter_importance.length > 0)) && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {deck.filter_topics.map(t => (
                    <span key={t} className="text-xs bg-blue-600/30 px-2 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                  {deck.filter_tags.map(t => (
                    <span key={t} className="text-xs bg-purple-600/30 px-2 py-0.5 rounded">
                      #{t}
                    </span>
                  ))}
                  {deck.filter_states.map(s => (
                    <span key={s} className="text-xs bg-gray-600/30 px-2 py-0.5 rounded">
                      {s}
                    </span>
                  ))}
                  {(deck.filter_importance || []).map(imp => (
                    <span key={imp} className={`text-xs px-2 py-0.5 rounded ${imp === 'core' ? 'bg-yellow-600/30' : 'bg-orange-600/30'}`}>
                      {imp === 'core' ? '⭐ core' : 'supporting'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#16213e] rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Create Filtered Deck</h2>

            <form onSubmit={handleCreateDeck} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Deck Name
                </label>
                <input
                  type="text"
                  value={newDeckName}
                  onChange={e => setNewDeckName(e.target.value)}
                  placeholder="e.g., Cytology Review"
                  className="w-full px-3 py-2 bg-[#1a1a2e] rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              {/* Topics */}
              {filterOptions.topics.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Filter by Topics
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.topics.map(topic => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => toggleSelection(topic, selectedTopics, setSelectedTopics)}
                        className={`px-3 py-1 rounded-full text-sm ${
                          selectedTopics.includes(topic)
                            ? 'bg-blue-600'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Subtopics */}
              {filterOptions.subtopics.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Filter by Subtopics
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.subtopics.map(subtopic => (
                      <button
                        key={subtopic}
                        type="button"
                        onClick={() => toggleSelection(subtopic, selectedSubtopics, setSelectedSubtopics)}
                        className={`px-3 py-1 rounded-full text-sm ${
                          selectedSubtopics.includes(subtopic)
                            ? 'bg-cyan-600'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        {subtopic}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {filterOptions.tags.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Filter by Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.tags.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleSelection(tag, selectedTags, setSelectedTags)}
                        className={`px-3 py-1 rounded-full text-sm ${
                          selectedTags.includes(tag)
                            ? 'bg-purple-600'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* States */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Filter by State
                </label>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.states.map(state => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => toggleSelection(state, selectedStates, setSelectedStates)}
                      className={`px-3 py-1 rounded-full text-sm ${
                        selectedStates.includes(state)
                          ? 'bg-green-600'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </div>

              {/* Importance */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Filter by Importance
                </label>
                <div className="flex flex-wrap gap-2">
                  {(filterOptions.importance || ['core', 'supporting']).map(imp => (
                    <button
                      key={imp}
                      type="button"
                      onClick={() => toggleSelection(imp, selectedImportance, setSelectedImportance)}
                      className={`px-3 py-1 rounded-full text-sm ${
                        selectedImportance.includes(imp)
                          ? imp === 'core' ? 'bg-yellow-600' : 'bg-orange-600'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {imp === 'core' ? '⭐ Core' : 'Supporting'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Core = must-know concepts, Supporting = reinforcement
                </p>
              </div>

              {/* Max cards */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Max Cards (optional)
                </label>
                <input
                  type="number"
                  value={maxCards}
                  onChange={e => setMaxCards(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="Leave empty for all matching cards"
                  min={1}
                  className="w-full px-3 py-2 bg-[#1a1a2e] rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Buttons */}
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
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50"
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
