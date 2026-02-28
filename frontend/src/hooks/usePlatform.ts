export function usePlatform() {
  const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  return {
    isDesktop,
    isWeb: !isDesktop,
    isMobile: false // Rely on useMobile hook for actual mobile breakpoint detection
  }
}
