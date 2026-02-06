'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface FilterOptions {
  topicTree: Record<string, string[]>
  topics: string[]
  subtopics: string[]
  tags: string[]
  quality: string[]
  states: string[]
  importance: string[]
}

export default function NewDeckPage() {
  const router = useRouter()
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagContainerRef.current && !tagContainerRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    async function fetchFilterOptions() {
      try {
        const res = await fetch('/api/topics')
        const data = await res.json()
        setFilterOptions({
          topicTree: data.topicTree || {},
          topics: data.topics || [],
          subtopics: data.subtopics || [],
          tags: data.tags || [],
          quality: data.quality || [],
          states: data.states || [],
          importance: data.importance || [],
        })
      } catch (err) {
        console.error('Error fetching filter options:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchFilterOptions()
  }, [])

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
        router.push('/')
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

  const toggleTopicExpanded = (topic: string) => {
    setExpandedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    )
  }

  const isTopicFullySelected = (topic: string) => {
    const subtopics = filterOptions.topicTree[topic] || []
    return subtopics.length > 0 && subtopics.every(st => selectedSubtopics.includes(st))
  }

  const isTopicPartiallySelected = (topic: string) => {
    const subtopics = filterOptions.topicTree[topic] || []
    return subtopics.some(st => selectedSubtopics.includes(st)) && !isTopicFullySelected(topic)
  }

  const toggleTopicSelection = (topic: string) => {
    const subtopics = filterOptions.topicTree[topic] || []
    if (isTopicFullySelected(topic)) {
      setSelectedTopics(prev => prev.filter(t => t !== topic))
      setSelectedSubtopics(prev => prev.filter(st => !subtopics.includes(st)))
    } else {
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
      const newSubs = selectedSubtopics.filter(st => st !== subtopic)
      setSelectedSubtopics(newSubs)
      if (newSubs.filter(st => subtopics.includes(st)).length === 0) {
        setSelectedTopics(prev => prev.filter(t => t !== topic))
      }
    } else {
      setSelectedSubtopics(prev => [...prev, subtopic])
      if (!selectedTopics.includes(topic)) {
        setSelectedTopics(prev => [...prev, topic])
      }
    }
  }

  const filteredTags = filterOptions.tags.filter(
    tag => !selectedTags.includes(tag) && tag.toLowerCase().includes(tagSearch.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-pulse">
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-500 hover:text-white transition-colors">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-gray-200 mt-3">
          Create Filtered Deck
        </h1>
      </div>

      <form onSubmit={handleCreateDeck} className="space-y-6">
        {/* Deck Name */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Deck Name</label>
          <input
            type="text"
            value={newDeckName}
            onChange={e => setNewDeckName(e.target.value)}
            placeholder="e.g., Cytology Review"
            className="create-deck-input"
            autoFocus
            required
          />
        </div>

        {/* Topics & Subtopics */}
        {Object.keys(filterOptions.topicTree).length > 0 && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">Topics & Subtopics</label>
            <div className="create-deck-accordion">
              {Object.entries(filterOptions.topicTree).map(([topic, subtopics]) => (
                <div key={topic} className="create-deck-accordion-item">
                  <div className="create-deck-accordion-header">
                    <button
                      type="button"
                      onClick={() => toggleTopicExpanded(topic)}
                      className="create-deck-expand-btn"
                    >
                      {expandedTopics.includes(topic) ? '▼' : '▶'}
                    </button>
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
                      <span className="font-medium text-gray-200">{topic}</span>
                      <span className="text-xs text-gray-500">
                        ({subtopics.length})
                      </span>
                    </label>
                  </div>

                  {expandedTopics.includes(topic) && subtopics.length > 0 && (
                    <div className="create-deck-subtopics">
                      {subtopics.map(subtopic => (
                        <label
                          key={subtopic}
                          className="flex items-center gap-2 py-1.5 cursor-pointer select-none text-gray-300 hover:text-white"
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

            {selectedSubtopics.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedSubtopics.map(st => (
                  <span key={st} className="tag-chip tag-chip-subtopic flex items-center gap-1">
                    {st}
                    <button
                      type="button"
                      onClick={() => {
                        const parentTopic = Object.entries(filterOptions.topicTree)
                          .find(([, subs]) => subs.includes(st))?.[0]
                        if (parentTopic) toggleSubtopicSelection(parentTopic, st)
                      }}
                      className="hover:text-white"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {filterOptions.tags.length > 0 && (
          <div ref={tagContainerRef}>
            <label className="block text-sm text-gray-400 mb-2">Tags</label>

            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedTags.map(tag => (
                  <span key={tag} className="tag-chip flex items-center gap-1">
                    #{tag}
                    <button
                      type="button"
                      onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
                      className="hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

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
                className="create-deck-input"
              />

              {tagDropdownOpen && filteredTags.length > 0 && (
                <div className="create-deck-dropdown">
                  {filteredTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setSelectedTags(prev => [...prev, tag])
                        setTagSearch('')
                        tagInputRef.current?.focus()
                      }}
                      className="create-deck-dropdown-item"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* State */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">State</label>
          <div className="flex flex-wrap gap-2">
            {filterOptions.states.map(state => (
              <button
                key={state}
                type="button"
                onClick={() => toggleSelection(state, selectedStates, setSelectedStates)}
                className={`create-deck-toggle ${selectedStates.includes(state) ? 'create-deck-toggle--active' : ''}`}
              >
                {state}
              </button>
            ))}
          </div>
        </div>

        {/* Importance */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Importance</label>
          <div className="flex flex-wrap gap-2">
            {filterOptions.importance.map(imp => (
              <button
                key={imp}
                type="button"
                onClick={() => toggleSelection(imp, selectedImportance, setSelectedImportance)}
                className={`create-deck-toggle ${selectedImportance.includes(imp) ? 'create-deck-toggle--active' : ''}`}
              >
                {imp === 'core' ? 'Core' : 'Supporting'}
              </button>
            ))}
          </div>
        </div>

        {/* Quality */}
        {filterOptions.quality.length > 0 && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">Quality</label>
            <div className="flex flex-wrap gap-2">
              {filterOptions.quality.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => toggleSelection(q, selectedQuality, setSelectedQuality)}
                  className={`create-deck-toggle ${selectedQuality.includes(q) ? 'create-deck-toggle--active' : ''}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Difficulty Range */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Difficulty Range
            <span className="text-xs text-gray-600 ml-1">(1-10, reviewed cards only)</span>
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
              className="create-deck-input w-24"
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
              className="create-deck-input w-24"
            />
          </div>
        </div>

        {/* Sort Order */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Sort Order</label>
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            className="create-deck-input"
          >
            <option value="due_date">Due Date (most overdue first)</option>
            <option value="difficulty">Most Difficult</option>
            <option value="lapses">Most Lapses</option>
            <option value="random">Random</option>
          </select>
        </div>

        {/* Max Cards */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Max Cards (optional)</label>
          <input
            type="number"
            value={maxCards}
            onChange={e => setMaxCards(e.target.value ? parseInt(e.target.value) : '')}
            placeholder="All matching cards"
            min={1}
            className="create-deck-input"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-2 pb-8">
          <Link
            href="/"
            className="create-deck-btn create-deck-btn--secondary flex-1 text-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isCreating || !newDeckName.trim()}
            className="create-deck-btn create-deck-btn--primary flex-1"
          >
            {isCreating ? 'Creating...' : 'Create Deck'}
          </button>
        </div>
      </form>
    </div>
  )
}
