'use client'

import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { useEffect, useRef, useState } from 'react'

interface Suggestion {
  id: string
  name: string
  slug: string
  category_name: string | null
}

/**
 * Search entry point. Supports the PRD's launch search modes: product name,
 * brand, category and barcode. A purely numeric term of 8+ digits is treated
 * as a GTIN and routed straight to the product, which is how a shopkeeper
 * scanning a pack expects it to behave.
 */
export function SearchBar({
  initial = '',
  placeholder = 'Search for products nearby…',
  autoFocus = false,
}: {
  initial?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(initial)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const term = value.trim()

  // The effect only talks to the network. Clearing the list for a short term
  // is derived below instead of set here: calling setState synchronously in an
  // effect body triggers a second render pass on every keystroke.
  useEffect(() => {
    if (term.length < 2) return

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        if (res.ok) setSuggestions(await res.json())
      } catch {
        // aborted or offline - suggestions are an enhancement, not required
      }
    }, 180)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [term])

  // Stale results must not linger under a term too short to have produced them.
  const visibleSuggestions = term.length < 2 ? [] : suggestions
  const listOpen = open && visibleSuggestions.length > 0

  /*
   * Which suggestion the keyboard is on. -1 means "none" — the caret is still
   * in the field and Enter should run the search the person typed, rather than
   * quietly opening whichever product happened to be listed first.
   *
   * Focus never actually moves into the list. The input keeps it and points at
   * the active option through aria-activedescendant, which is what lets a
   * screen-reader user hear each suggestion while still being able to type.
   */
  /*
   * Stored with the term it belongs to, so that a new term invalidates the
   * position during render rather than in an effect. Resetting it in an effect
   * would cost a second render pass on every keystroke — the same reason the
   * suggestion list above is derived rather than cleared in one.
   */
  const [activeState, setActiveState] = useState({ term: '', index: -1 })
  const active = activeState.term === term ? activeState.index : -1
  const setActive = (next: number | ((current: number) => number)) =>
    setActiveState({ term, index: typeof next === 'function' ? next(active) : next })

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function go(s: Suggestion) {
    setOpen(false)
    setActive(-1)
    router.push(`/product/${s.slug}`)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (active >= 0 && visibleSuggestions[active]) return go(visibleSuggestions[active])
    if (!term) return
    setOpen(false)
    if (/^\d{8,14}$/.test(term)) router.push(`/barcode/${term}`)
    else router.push(`/search?q=${encodeURIComponent(term)}`)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      // Close the list but keep the term: Escape dismisses the suggestions,
      // it does not undo the typing.
      setOpen(false)
      setActive(-1)
      return
    }
    if (!listOpen) {
      // Down opens the list again after Escape, without needing a keystroke.
      if (e.key === 'ArrowDown' && visibleSuggestions.length > 0) {
        e.preventDefault()
        setOpen(true)
        setActive(0)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % visibleSuggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? visibleSuggestions.length - 1 : i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(visibleSuggestions.length - 1)
    } else if (e.key === 'Tab') {
      setOpen(false)
      setActive(-1)
    }
  }

  const LIST_ID = 'site-search-suggestions'
  const optionId = (i: number) => `${LIST_ID}-option-${i}`

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={submit} role="search">
        <label htmlFor="site-search" className="sr-only">
          Search products
        </label>
        {/* The shell carries the field surface and shadow; the input inside is
            bare, so the two do not stack into a double shadow. */}
        <div className="field-with-icon field-shell flex items-center focus-within:field-shell-focus">
          <span className="field-icon">
            <Icon name="search" size={18} />
          </span>
          <input
            id="site-search"
            name="q"
            value={value}
            autoFocus={autoFocus}
            autoComplete="off"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={LIST_ID}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            onChange={(e) => {
              setValue(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent py-2.5 pl-11 pr-2 text-sm text-field-ink shadow-none outline-none placeholder:text-field-muted"
          />
          <button
            type="submit"
            className="rounded-brand bg-accent-500 px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-600"
          >
            Search
          </button>
        </div>
      </form>

      {/* How many suggestions there are, for someone who cannot see the list
          appear. Polite, so it waits for a pause in typing rather than talking
          over every keystroke. */}
      <p aria-live="polite" className="sr-only">
        {listOpen
          ? `${visibleSuggestions.length} ${visibleSuggestions.length === 1 ? 'suggestion' : 'suggestions'} available. Use the up and down arrow keys to review them.`
          : ''}
      </p>

      <ul
        id={LIST_ID}
        role="listbox"
        aria-label="Product suggestions"
        hidden={!listOpen}
        className="absolute z-50 mt-1 w-full overflow-hidden rounded-brand border border-line-soft bg-surface shadow-lg"
      >
        {visibleSuggestions.map((s, i) => (
          <li
            key={s.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            // The pointer keeps working exactly as before; mousedown rather
            // than click so the list is not dismissed by the blur first.
            onMouseDown={(e) => {
              e.preventDefault()
              go(s)
            }}
            onMouseEnter={() => setActive(i)}
            className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left ${
              i === active ? 'bg-surface-muted' : ''
            }`}
          >
            <span className="text-sm text-ink">{s.name}</span>
            {s.category_name && (
              <span className="shrink-0 text-xs text-muted">{s.category_name}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
