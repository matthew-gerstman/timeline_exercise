import type { UniqueIdentifier } from '@dnd-kit/core'
import { differenceInCalendarDays, isAfter, isBefore, isValid } from 'date-fns'
import { useCallback, useEffect, useRef, useState } from 'react'

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

function clampDate(d: Date, start: Date, end: Date) {
  if (isBefore(d, start)) return start
  if (isAfter(d, end)) return end
  return d
}

/**
 * Custom hook to encapsulate all scroll-related logic for the timeline
 */
export function useTimelineScroll(
  tasks: TimelineTask[], 
  viewport: TimelineViewport,
  onReachStart?: () => void,
  onReachEnd?: () => void,
  onStopScrollingLeft?: () => void,
  onScrollLeft?: (args: {
    currentScrollLeft: number
    prevScrollLeft: number
    scrollDelta: number
    scroller: HTMLDivElement
    event: React.UIEvent<HTMLDivElement>
  }) => void
) {
  const rightPaneRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const leftScrollerRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const syncingRef = useRef(false)
  
  const [viewportH, setViewportH] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  // Track previous scroll position to detect scroll direction
  const prevScrollLeftRef = useRef(0)
  
  // Track if we've already fired the callbacks to prevent repeated calls
  const hasReachedEndRef = useRef(false)
  
  // Track if we're currently scrolling left to debounce expansion
  const scrollingLeftRef = useRef(false)
  const scrollLeftTimeoutRef = useRef<number | null>(null)
  const wasScrollingLeftRef = useRef(false)
  
  // Store last scroll state for the stop callback
  const lastScrollStateRef = useRef<{
    scroller: HTMLDivElement
    currentScrollLeft: number
    prevScrollLeft: number
  } | null>(null)

  // Measure viewport height to extend today marker fully even with few rows
  useEffect(() => {
    const el = rightPaneRef.current
    if (!el) return
    const update = () => setViewportH(el.clientHeight || 0)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Derive viewport pixel calculations
  const pxPerDay = viewport.pxPerDay ?? 16

  // Handler to scroll to a task's bar
  const scrollToTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => String(t.id) === taskId)
      if (!task) return
      const scroller = scrollerRef.current
      if (!scroller) return

      const start = task.start && isValid(task.start) ? clampDate(task.start, viewport.start, viewport.end) : null
      if (!start) return

      const startOffset = Math.max(0, differenceInCalendarDays(start, viewport.start)) * pxPerDay
      const targetScrollLeft = startOffset - scroller.clientWidth / 2
      scroller.scrollTo({ left: targetScrollLeft, behavior: 'smooth' })
    },
    [tasks, viewport, pxPerDay]
  )

  // Handler for bar double-click to center the bar
  const handleBarDoubleClick = useCallback((_taskId: string, barLeftPx: number) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const targetScrollLeft = barLeftPx - scroller.clientWidth / 2
    scroller.scrollTo({ left: targetScrollLeft, behavior: 'smooth' })
  }, [])

  // Left scroller onScroll handler - syncs vertical scroll to right
  const handleLeftScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (syncingRef.current) return
    const left = e.currentTarget
    const right = scrollerRef.current
    if (!right) return
    syncingRef.current = true
    right.scrollTop = left.scrollTop
    requestAnimationFrame(() => {
      syncingRef.current = false
    })
  }, [])

  // Right scroller onScroll handler - tracks horizontal scroll and syncs vertical to left
  const handleRightScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scroller = e.currentTarget
    const currentScrollLeft = scroller.scrollLeft
    const prevScrollLeft = prevScrollLeftRef.current
    setScrollLeft(currentScrollLeft)

    const pxPerDay = viewport.pxPerDay ?? 16
    const twelveMonthsPx = 360 * pxPerDay // 12 months (360 days) in pixels

    // Detect when starting to scroll left and expand if needed
    if (currentScrollLeft < prevScrollLeft) {
      // User is scrolling left - call the callback with all available arguments
      onScrollLeft?.({
        currentScrollLeft,
        prevScrollLeft,
        scrollDelta: prevScrollLeft - currentScrollLeft,
        scroller,
        event: e
      })
      
      // Store state for the stop callback
      lastScrollStateRef.current = {
        scroller,
        currentScrollLeft,
        prevScrollLeft
      }
      
      wasScrollingLeftRef.current = true
      
      if (!scrollingLeftRef.current && currentScrollLeft < twelveMonthsPx) {
        // Just started scrolling left and have less than 12 months of unseen content
        scrollingLeftRef.current = true
        onReachStart?.()
      }
      
      // Clear any existing timeout and set a new one to detect when scrolling stops
      if (scrollLeftTimeoutRef.current) {
        clearTimeout(scrollLeftTimeoutRef.current)
      }
      scrollLeftTimeoutRef.current = setTimeout(() => {
        // Scrolling left has stopped
        if (wasScrollingLeftRef.current && lastScrollStateRef.current) {
          wasScrollingLeftRef.current = false
          
          // Call onScrollLeft with the last state to indicate scrolling stopped
          onScrollLeft?.({
            currentScrollLeft: lastScrollStateRef.current.currentScrollLeft,
            prevScrollLeft: lastScrollStateRef.current.prevScrollLeft,
            scrollDelta: 0, // Delta is 0 because we've stopped
            scroller: lastScrollStateRef.current.scroller,
            event: e // Keep the last event reference
          })
          
          onStopScrollingLeft?.()
        }
      }, 150) // Wait 150ms after last scroll event
    } else {
      // Reset when scrolling right or stopped
      scrollingLeftRef.current = false
      wasScrollingLeftRef.current = false
      if (scrollLeftTimeoutRef.current) {
        clearTimeout(scrollLeftTimeoutRef.current)
        scrollLeftTimeoutRef.current = null
      }
    }

    // Check if we've reached the end (right edge) - trigger expansion
    const threshold = 480 // Trigger when 1 month of buffer remains
    const maxScroll = scroller.scrollWidth - scroller.clientWidth
    if (currentScrollLeft >= maxScroll - threshold && prevScrollLeft < maxScroll - threshold) {
      if (!hasReachedEndRef.current) {
        hasReachedEndRef.current = true
        onReachEnd?.()
      }
    } else if (currentScrollLeft < maxScroll - threshold) {
      hasReachedEndRef.current = false
    }

    // Update previous scroll position
    prevScrollLeftRef.current = currentScrollLeft

    // vertical sync to left
    const left = leftScrollerRef.current
    if (!syncingRef.current && left) {
      syncingRef.current = true
      left.scrollTop = scroller.scrollTop
      requestAnimationFrame(() => {
        syncingRef.current = false
      })
    }
  }, [onReachStart, onReachEnd, onStopScrollingLeft, onScrollLeft, viewport.pxPerDay])

  // Horizontal panning handler for pointer drag
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Begin horizontal panning on left mouse or touch
    if (e.button !== 0 && e.pointerType !== 'touch') return
    const scroller = (scrollerRef.current as HTMLElement) || null
    if (!scroller) return
    e.preventDefault()
    try {
      ;(e.currentTarget as unknown as Element).setPointerCapture?.(e.pointerId)
    } catch {}
    const startX = e.clientX
    const startScrollLeft = scroller.scrollLeft
    let panning = true
    // Update cursor
    const el = e.currentTarget as HTMLElement
    const prevCursor = el.style.cursor
    el.style.cursor = 'grabbing'
    const onMove = (ev: PointerEvent) => {
      if (!panning) return
      const dx = ev.clientX - startX
      const newScrollLeft = startScrollLeft - dx
      const prevScrollLeft = prevScrollLeftRef.current
      scroller.scrollLeft = newScrollLeft
      // Explicitly update scrollLeft state to keep header in sync during panning
      setScrollLeft(newScrollLeft)
      
      const pxPerDay = viewport.pxPerDay ?? 16
      const twelveMonthsPx = 360 * pxPerDay // 12 months (360 days) in pixels
      
      // Detect when panning left and expand if needed
      if (newScrollLeft < prevScrollLeft) {
        // User is panning left
        // Create a synthetic UIEvent for the callback
        const syntheticEvent = {
          currentTarget: scroller,
          target: scroller,
        } as unknown as React.UIEvent<HTMLDivElement>
        
        onScrollLeft?.({
          currentScrollLeft: newScrollLeft,
          prevScrollLeft,
          scrollDelta: prevScrollLeft - newScrollLeft,
          scroller: scroller as HTMLDivElement,
          event: syntheticEvent
        })
        
        // Store state for the stop callback
        lastScrollStateRef.current = {
          scroller: scroller as HTMLDivElement,
          currentScrollLeft: newScrollLeft,
          prevScrollLeft
        }
        
        wasScrollingLeftRef.current = true
        
        if (!scrollingLeftRef.current && newScrollLeft < twelveMonthsPx) {
          // Just started panning left and have less than 12 months of unseen content
          scrollingLeftRef.current = true
          onReachStart?.()
        }
      } else {
        // Reset when panning right or stopped
        scrollingLeftRef.current = false
        wasScrollingLeftRef.current = false
      }
      
      // Check right edge
      const threshold = 480 // Trigger when 1 month of buffer remains
      const maxScroll = scroller.scrollWidth - scroller.clientWidth
      if (newScrollLeft >= maxScroll - threshold && prevScrollLeft < maxScroll - threshold) {
        if (!hasReachedEndRef.current) {
          hasReachedEndRef.current = true
          onReachEnd?.()
        }
      } else if (newScrollLeft < maxScroll - threshold) {
        hasReachedEndRef.current = false
      }
      
      // Update previous scroll position
      prevScrollLeftRef.current = newScrollLeft
    }
    const onUp = () => {
      panning = false
      el.style.cursor = prevCursor
      
      // Check if we were panning left and trigger expansion after stopping
      if (wasScrollingLeftRef.current && lastScrollStateRef.current) {
        wasScrollingLeftRef.current = false
        
        // Create a synthetic UIEvent for the callback
        const syntheticEvent = {
          currentTarget: lastScrollStateRef.current.scroller,
          target: lastScrollStateRef.current.scroller,
        } as unknown as React.UIEvent<HTMLDivElement>
        
        // Call onScrollLeft with the last state to indicate panning stopped
        onScrollLeft?.({
          currentScrollLeft: lastScrollStateRef.current.currentScrollLeft,
          prevScrollLeft: lastScrollStateRef.current.prevScrollLeft,
          scrollDelta: 0, // Delta is 0 because we've stopped
          scroller: lastScrollStateRef.current.scroller,
          event: syntheticEvent
        })
        
        onStopScrollingLeft?.()
      }
      
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [onReachStart, onReachEnd, onStopScrollingLeft, onScrollLeft, viewport.pxPerDay])

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

