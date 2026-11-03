import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'

// Lazy routes (the staff overview pulls in the chart library) can take several seconds to load under parallel runs.
configure({ asyncUtilTimeout: 10_000 })

// Finish every Motion animation instantly so exit transitions never hold elements in the DOM.
MotionGlobalConfig.skipAnimations = true
window.scrollTo = () => {}

// Node 25+ ships its own localStorage, which is undefined without --localstorage-file and hides jsdom's.
if (!globalThis.localStorage) {
  const { jsdom } = globalThis as unknown as { jsdom: { window: Window } }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: jsdom.window.localStorage })
}

// jsdom lacks these browser APIs; the sidebar, sheets and charts read them. Desktop width by default.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
