import { useEffect, useRef } from 'react'
import dashjs from 'dashjs'
import 'dashjs/styles'
import type { DashJsOptions } from 'dashjs'

interface Props {
  options: DashJsOptions
  style?: React.CSSProperties
}

export function DashjsMount({ options, style }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep a ref to options so the effect closure always has the latest value
  // without triggering a re-mount on every render.
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (!ref.current) return
    const instance = dashjs(ref.current, optionsRef.current)
    return () => instance.destroy()
    // Empty deps: dashjs manages its own state internally; re-mounting would
    // destroy the editor. The parent must pass a stable `options` via useMemo.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} style={{ width: '100%', height: '100%', ...style }} />
}
