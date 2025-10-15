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

interface OnScrollLeftArgs {
  currentScrollLeft: number
  prevScrollLeft: number
  scrollDelta: number
  scroller: HTMLDivElement
  event: React.UIEvent<HTMLDivElement>
}

// Consolidated scroll tracking state
interface ScrollTracking {
  prevScrollLeft: number
  hasReachedEnd: boolean
  isScrollingLeft: boolean
  scrollStopTimeout: number | null
}

// ============================================================================
// Constants
// ============================================================================

const TWELVE_MONTHS_IN_DAYS = 360
const RIGHT_EDGE_THRESHOLD_PX = 480
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
  // Refs - Consolidated State Tracking
  // ============================================================================
  
  const syncingVerticalRef = useRef(false)
  
  // Single ref object for all scroll tracking
  const scrollTrackingRef = useRef<ScrollTracking>({
    prevScrollLeft: 0,
    hasReachedEnd: false,
    isScrollingLeft: false,
    scrollStopTimeout: null,
  })
  
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
  
  // Cleanup scroll stop timeout on unmount
  useEffect(() => {
    return () => {
      const timeout = scrollTrackingRef.current.scrollStopTimeout
      if (timeout) clearTimeout(timeout)
    }
  }, [])

  // ============================================================================
  // Helper Functions
  // ============================================================================

  const handleScrollUpdate = useCallback((
    currentScrollLeft: number,
    scroller: HTMLDivElement,
    event: React.UIEvent<HTMLDivElement>
  ) => {
    const tracking = scrollTrackingRef.current
    const prevScrollLeft = tracking.prevScrollLeft
    
    // Update scroll position state
    setScrollLeft(currentScrollLeft)
    
    // Check if scrolling left
    const isMovingLeft = currentScrollLeft < prevScrollLeft
    
    if (isMovingLeft) {
      const scrollDelta = prevScrollLeft - currentScrollLeft
      
      // Notify scroll callback
      onScrollLeft?.({
        currentScrollLeft,
        prevScrollLeft,
        scrollDelta,
        scroller,
        event
      })
      
      // Trigger reach start if near the left edge
      if (!tracking.isScrollingLeft && currentScrollLeft < twelveMonthsPx) {
        tracking.isScrollingLeft = true
        onReachStart?.()
      }
      
      // Setup debounced stop detection
      if (tracking.scrollStopTimeout) {
        clearTimeout(tracking.scrollStopTimeout)
      }
      
      tracking.scrollStopTimeout = setTimeout(() => {
        tracking.isScrollingLeft = false
        
        onScrollLeft?.({
          currentScrollLeft: scrollTrackingRef.current.prevScrollLeft,
          prevScrollLeft: scrollTrackingRef.current.prevScrollLeft,
          scrollDelta: 0,
          scroller,
          event
        })
        
        onStopScrollingLeft?.()
      }, SCROLL_STOP_DEBOUNCE_MS) as unknown as number
    } else {
      // Moving right or stopped - reset
      tracking.isScrollingLeft = false
      if (tracking.scrollStopTimeout) {
        clearTimeout(tracking.scrollStopTimeout)
        tracking.scrollStopTimeout = null
      }
    }
    
    // Check right edge
    const maxScroll = scroller.scrollWidth - scroller.clientWidth
    const isNearEnd = currentScrollLeft >= maxScroll - RIGHT_EDGE_THRESHOLD_PX
    const wasNotNearEnd = prevScrollLeft < maxScroll - RIGHT_EDGE_THRESHOLD_PX
    
    if (isNearEnd && wasNotNearEnd && !tracking.hasReachedEnd) {
      tracking.hasReachedEnd = true
      onReachEnd?.()
    } else if (!isNearEnd) {
      tracking.hasReachedEnd = false
    }
    
    // Update tracking
    tracking.prevScrollLeft = currentScrollLeft
  }, [onScrollLeft, onReachStart, onStopScrollingLeft, onReachEnd, twelveMonthsPx])

  const syncVerticalScroll = useCallback((from: HTMLElement, to: HTMLElement) => {
    if (syncingVerticalRef.current) return
    
    syncingVerticalRef.current = true
    to.scrollTop = from.scrollTop
    requestAnimationFrame(() => {
      syncingVerticalRef.current = false
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
    handleScrollUpdate(scroller.scrollLeft, scroller, e)
    
    // Sync vertical scroll to left pane
    const left = leftScrollerRef.current
    if (left) {
      syncVerticalScroll(scroller, left)
    }
  }, [handleScrollUpdate, syncVerticalScroll])

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
      
      scroller.scrollLeft = newScrollLeft
      
      // Use synthetic event for the scroll update
      const syntheticEvent = createSyntheticScrollEvent(scroller)
      handleScrollUpdate(newScrollLeft, scroller as HTMLDivElement, syntheticEvent)
    }
    
    const handleEnd = () => {
      panning = false
      el.style.cursor = prevCursor
      
      // Trigger stop callback if we were scrolling left
      const tracking = scrollTrackingRef.current
      if (tracking.isScrollingLeft) {
        tracking.isScrollingLeft = false
        
        if (tracking.scrollStopTimeout) {
          clearTimeout(tracking.scrollStopTimeout)
          tracking.scrollStopTimeout = null
        }
        
        const syntheticEvent = createSyntheticScrollEvent(scroller)
        onScrollLeft?.({
          currentScrollLeft: tracking.prevScrollLeft,
          prevScrollLeft: tracking.prevScrollLeft,
          scrollDelta: 0,
          scroller: scroller as HTMLDivElement,
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
  }, [handleScrollUpdate, onScrollLeft, onStopScrollingLeft])

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
