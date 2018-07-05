// Compute what scrolling needs to be done on required scrolling boxes for target to be in view

// The type names here are named after the spec to make it easier to find more information around what they mean:
// To reduce churn and reduce things that need be maintained things from the official TS DOM library is used here
// https://drafts.csswg.org/cssom-view/

// For a definition on what is "block flow direction" exactly, check this: https://drafts.csswg.org/css-writing-modes-4/#block-flow-direction

// add support for visualViewport object currently implemented in chrome
declare global {
  interface Window {
    visualViewport?: {
      height: number
      width: number
    }
  }
  // tslint:disable-next-line
  type visualViewport = {
    height: number
    width: number
  }

  // @TODO better declaration of possible shadowdom hosts
  interface Element {
    host: any
  }
}

export interface CustomScrollAction {
  el: Element
  top: number
  left: number
}

// This new option is tracked in this PR, which is the most likely candidate at the time: https://github.com/w3c/csswg-drafts/pull/1805
export type ScrollMode = 'always' | 'if-needed'

// Refactor to just the callback variant
export type CustomScrollBoundary = (parent: Element) => boolean

export interface Options {
  block?: ScrollLogicalPosition
  inline?: ScrollLogicalPosition
  scrollMode?: ScrollMode
  boundary?: CustomScrollBoundary
  skipOverflowHiddenElements?: boolean
}

// return the current viewport depending on wether quirks mode is active or not
function getViewport() {
  return (
    (document.compatMode !== 'CSS1Compat' &&
      (document.scrollingElement as HTMLElement)) ||
    document.documentElement
  )
}

// @TODO better shadowdom test, 11 = document fragment
function isElement(el: any) {
  return (
    el != null &&
    typeof el === 'object' &&
    (el.nodeType === 1 || el.nodeType === 11)
  )
}

function canOverflow(
  overflow: string | null,
  skipOverflowHiddenElements?: boolean
) {
  if (skipOverflowHiddenElements && overflow === 'hidden') {
    return false
  }

  return overflow !== 'visible' && overflow !== 'clip'
}

function isScrollable(el: Element, skipOverflowHiddenElements?: boolean) {
  const style = getComputedStyle(el)
  return (
    (el.clientHeight < el.scrollHeight &&
      canOverflow(style.overflowY, skipOverflowHiddenElements)) ||
    (el.clientWidth < el.scrollWidth &&
      canOverflow(style.overflowX, skipOverflowHiddenElements))
  )
}

/**
 * Find out which edge to align against when logical scroll position is "nearest"
 * Interesting fact: "nearest" works similarily to "if-needed", if the element is fully visible it will not scroll it
 *
 * Legends:
 * ┌────────┐ ┏ ━ ━ ━ ┓
 * │ target │   frame
 * └────────┘ ┗ ━ ━ ━ ┛
 */
function alignNearest(
  scrollingEdgeStart: number,
  scrollingEdgeEnd: number,
  scrollingSize: number,
  scrollingBorderStart: number,
  scrollingBorderEnd: number,
  elementEdgeStart: number,
  elementEdgeEnd: number,
  elementSize: number
) {
  /**
   * If element edge A and element edge B are both outside scrolling box edge A and scrolling box edge B
   *
   *          ┌──┐
   *        ┏━│━━│━┓
   *          │  │
   *        ┃ │  │ ┃        do nothing
   *          │  │
   *        ┗━│━━│━┛
   *          └──┘
   *
   *  If element edge C and element edge D are both outside scrolling box edge C and scrolling box edge D
   *
   *    ┏ ━ ━ ━ ━ ┓
   *   ┌───────────┐
   *   │┃         ┃│        do nothing
   *   └───────────┘
   *    ┗ ━ ━ ━ ━ ┛
   */
  if (
    (elementEdgeStart < scrollingEdgeStart &&
      elementEdgeEnd > scrollingEdgeEnd) ||
    (elementEdgeStart > scrollingEdgeStart && elementEdgeEnd < scrollingEdgeEnd)
  ) {
    return 0
  }

  /**
   * If element edge A is outside scrolling box edge A and element height is less than scrolling box height
   *
   *          ┌──┐
   *        ┏━│━━│━┓         ┏━┌━━┐━┓
   *          └──┘             │  │
   *  from  ┃      ┃     to  ┃ └──┘ ┃
   *
   *        ┗━ ━━ ━┛         ┗━ ━━ ━┛
   *
   * If element edge B is outside scrolling box edge B and element height is greater than scrolling box height
   *
   *        ┏━ ━━ ━┓         ┏━┌━━┐━┓
   *                           │  │
   *  from  ┃ ┌──┐ ┃     to  ┃ │  │ ┃
   *          │  │             │  │
   *        ┗━│━━│━┛         ┗━│━━│━┛
   *          │  │             └──┘
   *          │  │
   *          └──┘
   *
   * If element edge C is outside scrolling box edge C and element width is less than scrolling box width
   *
   *       from                 to
   *    ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
   *  ┌───┐                 ┌───┐
   *  │ ┃ │       ┃         ┃   │     ┃
   *  └───┘                 └───┘
   *    ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
   *
   * If element edge D is outside scrolling box edge D and element width is greater than scrolling box width
   *
   *       from                 to
   *    ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
   *        ┌───────────┐   ┌───────────┐
   *    ┃   │     ┃     │   ┃         ┃ │
   *        └───────────┘   └───────────┘
   *    ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
   */
  if (
    (elementEdgeStart < scrollingEdgeStart && elementSize < scrollingSize) ||
    (elementEdgeEnd > scrollingEdgeEnd && elementSize > scrollingSize)
  ) {
    return elementEdgeStart - scrollingEdgeStart - scrollingBorderStart
  }

  /**
   * If element edge B is outside scrolling box edge B and element height is less than scrolling box height
   *
   *        ┏━ ━━ ━┓         ┏━ ━━ ━┓
   *
   *  from  ┃      ┃     to  ┃ ┌──┐ ┃
   *          ┌──┐             │  │
   *        ┗━│━━│━┛         ┗━└━━┘━┛
   *          └──┘
   *
   * If element edge A is outside scrolling box edge A and element height is greater than scrolling box height
   *
   *          ┌──┐
   *          │  │
   *          │  │             ┌──┐
   *        ┏━│━━│━┓         ┏━│━━│━┓
   *          │  │             │  │
   *  from  ┃ └──┘ ┃     to  ┃ │  │ ┃
   *                           │  │
   *        ┗━ ━━ ━┛         ┗━└━━┘━┛
   *
   * If element edge C is outside scrolling box edge C and element width is greater than scrolling box width
   *
   *           from                 to
   *        ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
   *  ┌───────────┐           ┌───────────┐
   *  │     ┃     │   ┃       │ ┃         ┃
   *  └───────────┘           └───────────┘
   *        ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
   *
   * If element edge D is outside scrolling box edge D and element width is less than scrolling box width
   *
   *           from                 to
   *        ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
   *                ┌───┐             ┌───┐
   *        ┃       │ ┃ │       ┃     │   ┃
   *                └───┘             └───┘
   *        ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
   *
   */
  if (
    (elementEdgeEnd > scrollingEdgeEnd && elementSize < scrollingSize) ||
    (elementEdgeStart < scrollingEdgeStart && elementSize > scrollingSize)
  ) {
    return elementEdgeEnd - scrollingEdgeEnd + scrollingBorderEnd
  }

  return 0
}

export default (target: Element, options: Options): CustomScrollAction[] => {
  const {
    scrollMode,
    block,
    inline,
    boundary,
    skipOverflowHiddenElements,
  } = options

  const targetRect = target.getBoundingClientRect()

  // Collect all the scrolling boxes, as defined in the spec: https://drafts.csswg.org/cssom-view/#scrolling-box
  const frames: Element[] = []
  let parent
  // @TODO have a better shadowdom test here
  while (
    isElement((parent = target.parentNode || target.host)) &&
    // Allow using a callback to check the boundary
    boundary
      ? boundary(target)
      : true
  ) {
    if (isScrollable(parent, skipOverflowHiddenElements)) {
      frames.push(parent)
    }

    // next tick
    target = parent
  }

  // Workaround Chrome's behavior on clientHeight/clientWidth after introducing visualViewport
  // https://www.quirksmode.org/blog/archives/2016/02/chrome_change_b.html
  const viewport = getViewport()
  const viewportWidth = innerWidth
  const viewportHeight = innerHeight
  const viewportX = scrollX
  const viewportY = scrollY

  // These values mutate as we loop through and generate scroll coordinates
  let targetBlock: number =
    block === 'center'
      ? targetRect.top + targetRect.height / 2
      : block === 'end'
        ? targetRect.bottom
        : targetRect.top // block === 'start' || block === 'nearest'

  let targetInline: number =
    inline === 'center'
      ? targetRect.left + targetRect.width / 2
      : inline === 'end'
        ? targetRect.right
        : targetRect.left // inline === 'start || inline === 'nearest

  // Collect new scroll positions
  const computations = frames.reduce<CustomScrollAction[]>((results, frame) => {
    const frameRect = frame.getBoundingClientRect()

    // Handle scrollMode: 'if-needed'
    // If the element is already visible we can end it here
    if (
      scrollMode === 'if-needed' && frame === viewport
        ? targetRect.bottom > viewportHeight ||
          targetRect.top < 0 ||
          (targetRect.left > viewportWidth || targetRect.right < 0)
        : targetRect.top < frameRect.top || targetRect.bottom > frameRect.bottom
    ) {
      return []
    }

    const frameStyle = getComputedStyle(frame)
    const borderLeft = parseInt(frameStyle.borderLeftWidth as string, 10)
    const borderTop = parseInt(frameStyle.borderTopWidth as string, 10)
    const borderRight = parseInt(frameStyle.borderRightWidth as string, 10)
    const borderBottom = parseInt(frameStyle.borderBottomWidth as string, 10)
    // The property existance checks for offfset[Width|Height] is because only HTMLElement objects have them, but any Element might pass by here
    // @TODO find out if the "as HTMLElement" overrides can be dropped
    const scrollbarWidth =
      'offsetWidth' in frame
        ? (frame as HTMLElement).offsetWidth -
          (frame as HTMLElement).clientWidth -
          borderLeft -
          borderRight
        : 0
    const scrollbarHeight =
      'offsetHeight' in frame
        ? (frame as HTMLElement).offsetHeight -
          (frame as HTMLElement).clientHeight -
          borderTop -
          borderBottom
        : 0

    let blockScroll: number = 0
    let inlineScroll: number = 0

    if (block === 'start') {
      blockScroll =
        viewport === frame
          ? viewportY + targetBlock
          : targetBlock - frameRect.top - borderTop
    } else if (block === 'end') {
      blockScroll =
        viewport === frame
          ? viewportY + (targetBlock - viewportHeight)
          : frame.scrollTop -
            (frameRect.bottom - targetBlock) +
            borderBottom +
            scrollbarHeight
    } else if (block === 'nearest') {
      blockScroll =
        viewport === frame
          ? viewportY +
            alignNearest(
              viewportY,
              viewportY + viewportHeight,
              viewportHeight,
              borderTop,
              borderBottom,
              viewportY + targetBlock,
              viewportY + targetBlock + targetRect.height,
              targetRect.height
            )
          : frame.scrollTop +
            alignNearest(
              frameRect.top,
              frameRect.bottom,
              frameRect.height,
              borderTop,
              borderBottom + scrollbarHeight,
              targetBlock,
              targetBlock + targetRect.height,
              targetRect.height
            )
    } else {
      // block === 'center' is the default
      blockScroll =
        viewport === frame
          ? viewportY + targetBlock - viewportHeight / 2
          : frame.scrollTop -
            (frameRect.top + frameRect.height / 2 - targetBlock)
    }

    if (inline === 'start') {
      inlineScroll =
        viewport === frame
          ? viewportX + targetInline
          : frame.scrollLeft + (targetInline - frameRect.left) - borderLeft
    } else if (inline === 'center') {
      inlineScroll =
        viewport === frame
          ? viewportX + targetInline - viewportWidth / 2
          : frame.scrollLeft -
            (frameRect.left + frameRect.width / 2 - targetInline)
    } else if (inline === 'end') {
      inlineScroll =
        viewport === frame
          ? viewportX + (targetInline - viewportWidth)
          : frame.scrollLeft -
            (frameRect.right - targetInline) +
            borderRight +
            scrollbarWidth
    } else {
      // inline === 'nearest' is the default
      inlineScroll =
        viewport === frame
          ? viewportX +
            alignNearest(
              viewportX,
              viewportX + viewportWidth,
              viewportWidth,
              borderLeft,
              borderRight,
              viewportX + targetInline,
              viewportX + targetInline + targetRect.width,
              targetRect.width
            )
          : frame.scrollLeft +
            alignNearest(
              frameRect.left,
              frameRect.right,
              frameRect.width,
              borderLeft,
              borderRight + scrollbarWidth,
              targetInline,
              targetInline + targetRect.width,
              targetRect.width
            )
    }

    // Cache the offset so that parent frames can scroll this into view correctly
    targetBlock += frame.scrollTop - blockScroll
    targetInline += frame.scrollLeft - inlineScroll

    return [...results, { el: frame, top: blockScroll, left: inlineScroll }]
  }, [])

  return computations
}
