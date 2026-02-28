import { useState, useEffect } from 'react'

export function useMobile(bp = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < bp : false
  )

  useEffect(() => {
    const cb = () => setIsMobile(window.innerWidth < bp)
    window.addEventListener('resize', cb)
    return () => window.removeEventListener('resize', cb)
  }, [bp])

  return isMobile
}
