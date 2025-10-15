import type { UniqueIdentifier } from '@dnd-kit/core'
import { differenceInCalendarDays, isAfter, isBefore, isValid } from 'date-fns'
import { useCallback, useEffect, useRef, useState } from 'react'

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface TimelineTask {
  id: UniqueIdentifier
  title: string
  start: Date | null
  end: Date | null
  baseIndex: number
  isSentinel?: boolean
}

export interface TimelineViewport {
  start: Date
  end: Date
  pxPerDay?: number
}

interface ScrollState {
  scroller: HTMLDivElement
  currentScrollLeft: number
  prevScrollLeft: number
}

interface OnScrollLeftArgs {
  currentScrollLeft: number
  prevScrollLeft: number
  scrollDelta: number
  scroller: HTMLDivElement
  event: React.UIEvent<HTMLDivElement>
}

// ============================================================================
// Constants
// ============================================================================

const TWELVE_MONTHS_IN_DAYS = 360
const RIGHT_EDGE_THRESHOLD_PX = 480 // Trigger expansion when 1 month of buffer remains
const SCROLL_STOP_DEBOUNCE_MS = 150

// ============================================================================
// Utility Functions
// ============================================================================

function clampDate(d: Date, start: Date, end: Date) {
  if (isBefore(d, start)) return start
  if (isAfter(d, end)) return end
  return d
}

function createSyntheticScrollEvent(scroller: HTMLElement): React.UIEvent<HTMLDivElement> {
  return {
    currentTarget: scroller,
    target: scroller,
  } as unknown as React.UIEvent<HTMLDivElement>
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Custom hook to encapsulate all scroll-related logic for the timeline.
 * Handles:
 * - Horizontal and vertical scroll synchronization
 * - Scroll position tracking and edge detection
 * - Pointer drag panning
 * - Task navigation and centering
 */
export function useTimelineScroll(
  tasks: TimelineTask[], 
  viewport: TimelineViewport,
  onReachStart?: () => void,
  onReachEnd?: () => void,
  onStopScrollingLeft?: () => void,
  onScrollLeft?: (args: OnScrollLeftArgs) => void
) {
  // ============================================================================
  // Refs - DOM Elements
  // ============================================================================
  
  const rightPaneRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const leftScrollerRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  
  // ============================================================================
  // Refs - Scroll State Tracking
  // ============================================================================
  
  const syncingRef = useRef(false) // Prevent infinite scroll sync loops
  const prevScrollLeftRef = useRef(0) // Track previous horizontal scroll position
  const hasReachedEndRef = useRef(false) // Prevent repeated end callbacks
  
  // Left scroll tracking
  const scrollingLeftRef = useRef(false) // Currently scrolling left?
  const wasScrollingLeftRef = useRef(false) // Was scrolling left (for stop detection)
  const scrollLeftTimeoutRef = useRef<number | null>(null) // Debounce scroll stop
  const lastScrollStateRef = useRef<ScrollState | null>(null) // Last state for stop callback
  
  // ============================================================================
  // State
  // ============================================================================
  
  const [viewportH, setViewportH] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  
  // ============================================================================
  // Derived Values
  // ============================================================================
  
  const pxPerDay = viewport.pxPerDay ?? 16
  const twelveMonthsPx = TWELVE_MONTHS_IN_DAYS * pxPerDay

  // ============================================================================
  // Effects
  // ============================================================================
  
  // Measure viewport height for proper rendering
  useEffect(() => {
    const el = rightPaneRef.current
    if (!el) return
    
    const update = () => setViewportH(el.clientHeight || 0)
    update()
    
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ============================================================================
  // Helper Functions - Scroll Detection
  // ============================================================================

  const checkAndHandleLeftScroll = useCallback((
    currentScrollLeft: number,
    prevScrollLeft: number,
    scroller: HTMLDivElement,
    event: React.UIEvent<HTMLDivElement>
  ) => {
    if (currentScrollLeft >= prevScrollLeft) {
      // Not scrolling left - reset state
      scrollingLeftRef.current = false
      wasScrollingLeftRef.current = false
      if (scrollLeftTimeoutRef.current) {
        clearTimeout(scrollLeftTimeoutRef.current)
        scrollLeftTimeoutRef.current = null
      }
      return
    }

    // User is scrolling left
    const scrollDelta = prevScrollLeft - currentScrollLeft
    
    // Notify immediate scroll callback
    onScrollLeft?.({
      currentScrollLeft,
      prevScrollLeft,
      scrollDelta,
      scroller,
      event
    })
    
    // Store state for the stop callback
    lastScrollStateRef.current = { scroller, currentScrollLeft, prevScrollLeft }
    wasScrollingLeftRef.current = true
    
    // Trigger reach start if we have less than 12 months of unseen content
    if (!scrollingLeftRef.current && currentScrollLeft < twelveMonthsPx) {
      scrollingLeftRef.current = true
      onReachStart?.()
    }
    
    // Set up debounced stop detection
    if (scrollLeftTimeoutRef.current) {
      clearTimeout(scrollLeftTimeoutRef.current)
    }
    
    scrollLeftTimeoutRef.current = setTimeout(() => {
      if (wasScrollingLeftRef.current && lastScrollStateRef.current) {
        wasScrollingLeftRef.current = false
        
        // Notify scroll stopped
        onScrollLeft?.({
          currentScrollLeft: lastScrollStateRef.current.currentScrollLeft,
          prevScrollLeft: lastScrollStateRef.current.prevScrollLeft,
          scrollDelta: 0,
          scroller: lastScrollStateRef.current.scroller,
          event
        })
        
        onStopScrollingLeft?.()
      }
    }, SCROLL_STOP_DEBOUNCE_MS)
  }, [onScrollLeft, onReachStart, onStopScrollingLeft, twelveMonthsPx])

  const checkAndHandleRightEdge = useCallback((
    currentScrollLeft: number,
    prevScrollLeft: number,
    scroller: HTMLElement
  ) => {
    const maxScroll = scroller.scrollWidth - scroller.clientWidth
    const isAtEdge = currentScrollLeft >= maxScroll - RIGHT_EDGE_THRESHOLD_PX
    const wasNotAtEdge = prevScrollLeft < maxScroll - RIGHT_EDGE_THRESHOLD_PX
    
    if (isAtEdge && wasNotAtEdge) {
      if (!hasReachedEndRef.current) {
        hasReachedEndRef.current = true
        onReachEnd?.()
      }
    } else if (!isAtEdge) {
      hasReachedEndRef.current = false
    }
  }, [onReachEnd])

  const syncVerticalScroll = useCallback((from: HTMLElement, to: HTMLElement) => {
    if (syncingRef.current) return
    
    syncingRef.current = true
    to.scrollTop = from.scrollTop
    requestAnimationFrame(() => {
      syncingRef.current = false
    })
  }, [])

  // ============================================================================
  // Handlers - Navigation
  // ============================================================================

  const scrollToTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => String(t.id) === taskId)
      if (!task) return
      
      const scroller = scrollerRef.current
      if (!scroller) return

      const start = task.start && isValid(task.start) 
        ? clampDate(task.start, viewport.start, viewport.end) 
        : null
      if (!start) return

      const startOffset = Math.max(0, differenceInCalendarDays(start, viewport.start)) * pxPerDay
      const targetScrollLeft = startOffset - scroller.clientWidth / 2
      scroller.scrollTo({ left: targetScrollLeft, behavior: 'smooth' })
    },
    [tasks, viewport, pxPerDay]
  )

  const handleBarDoubleClick = useCallback((_taskId: string, barLeftPx: number) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    
    const targetScrollLeft = barLeftPx - scroller.clientWidth / 2
    scroller.scrollTo({ left: targetScrollLeft, behavior: 'smooth' })
  }, [])

  // ============================================================================
  // Handlers - Scroll Events
  // ============================================================================

  const handleLeftScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const left = e.currentTarget
    const right = scrollerRef.current
    if (!right) return
    
    syncVerticalScroll(left, right)
  }, [syncVerticalScroll])

  const handleRightScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scroller = e.currentTarget
    const currentScrollLeft = scroller.scrollLeft
    const prevScrollLeft = prevScrollLeftRef.current
    
    setScrollLeft(currentScrollLeft)

    // Handle left scroll detection and callbacks
    checkAndHandleLeftScroll(currentScrollLeft, prevScrollLeft, scroller, e)
    
    // Handle right edge detection
    checkAndHandleRightEdge(currentScrollLeft, prevScrollLeft, scroller)
    
    // Update tracking state
    prevScrollLeftRef.current = currentScrollLeft

    // Sync vertical scroll to left pane
    const left = leftScrollerRef.current
    if (left) {
      syncVerticalScroll(scroller, left)
    }
  }, [checkAndHandleLeftScroll, checkAndHandleRightEdge, syncVerticalScroll])

  // ============================================================================
  // Handlers - Pointer Drag Panning
  // ============================================================================

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only handle left click or touch
    if (e.button !== 0 && e.pointerType !== 'touch') return
    
    const scroller = scrollerRef.current
    if (!scroller) return
    
    e.preventDefault()
    
    // Capture pointer for smooth dragging
    try {
      (e.currentTarget as unknown as Element).setPointerCapture?.(e.pointerId)
    } catch {}
    
    // Setup drag state
    const startX = e.clientX
    const startScrollLeft = scroller.scrollLeft
    let panning = true
    
    // Update cursor
    const el = e.currentTarget as HTMLElement
    const prevCursor = el.style.cursor
    el.style.cursor = 'grabbing'
    
    const handleMove = (ev: PointerEvent) => {
      if (!panning) return
      
      const dx = ev.clientX - startX
      const newScrollLeft = startScrollLeft - dx
      const prevScrollLeft = prevScrollLeftRef.current
      
      scroller.scrollLeft = newScrollLeft
      setScrollLeft(newScrollLeft)
      
      // Create synthetic event for callbacks
      const syntheticEvent = createSyntheticScrollEvent(scroller)
      
      // Handle left scroll detection
      checkAndHandleLeftScroll(
        newScrollLeft, 
        prevScrollLeft, 
        scroller as HTMLDivElement,
        syntheticEvent
      )
      
      // Handle right edge detection
      checkAndHandleRightEdge(newScrollLeft, prevScrollLeft, scroller)
      
      // Update tracking state
      prevScrollLeftRef.current = newScrollLeft
    }
    
    const handleEnd = () => {
      panning = false
      el.style.cursor = prevCursor
      
      // Handle scroll stop if we were panning left
      if (wasScrollingLeftRef.current && lastScrollStateRef.current) {
        wasScrollingLeftRef.current = false
        
        const syntheticEvent = createSyntheticScrollEvent(lastScrollStateRef.current.scroller)
        
        onScrollLeft?.({
          currentScrollLeft: lastScrollStateRef.current.currentScrollLeft,
          prevScrollLeft: lastScrollStateRef.current.prevScrollLeft,
          scrollDelta: 0,
          scroller: lastScrollStateRef.current.scroller,
          event: syntheticEvent
        })
        
        onStopScrollingLeft?.()
      }
      
      // Cleanup listeners
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleEnd)
      window.removeEventListener('pointercancel', handleEnd)
    }
    
    // Register listeners
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleEnd)
    window.addEventListener('pointercancel', handleEnd)
  }, [checkAndHandleLeftScroll, checkAndHandleRightEdge, onScrollLeft, onStopScrollingLeft])

  // ============================================================================
  // Return API
  // ============================================================================

  return {
    refs: {
      rightPaneRef,
      scrollerRef,
      leftScrollerRef,
      headerRef,
    },
    state: {
      scrollLeft,
      viewportH,
    },
    handlers: {
      handleLeftScroll,
      handleRightScroll,
      handlePointerDown,
      scrollToTask,
      handleBarDoubleClick,
    },
  }
}
