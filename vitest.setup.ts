import 'vitest-canvas-mock';
import { vi } from 'vitest';

// jsdom doesn't implement these browser APIs that @mantine/core relies on.
// This is the standard Mantine testing shim (see Mantine "Vitest" docs).
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),       // deprecated
        removeListener: vi.fn(),    // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
window.ResizeObserver = window.ResizeObserver || (ResizeObserverStub as unknown as typeof ResizeObserver);
