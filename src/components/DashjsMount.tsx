import { useEffect, useRef } from 'react'
import dashjs from 'dashjs'
import 'dashjs/styles'
import type { DashJsInstance, DashJsOptions } from 'dashjs'
import { useColorMode } from '../theme/colorMode'

interface Props {
  options: DashJsOptions
  style?: React.CSSProperties
  colorMode?: 'light' | 'dark'
  /** Called once the dashjs instance is mounted, so the parent can call
   *  instance.save()/flushDraft()/isDirty() (e.g. to guard navigation). */
  onReady?: (instance: DashJsInstance) => void
}

export function DashjsMount({ options, style, colorMode, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const { mode: globalMode } = useColorMode()
  const effectiveMode = colorMode ?? globalMode

  // Keep refs so the mount effect closure always has the latest values
  // without triggering a re-mount on every render.
  const optionsRef = useRef(options)
  optionsRef.current = options
  const modeRef = useRef(effectiveMode)
  modeRef.current = effectiveMode
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    if (!ref.current) return
    const instance = dashjs(ref.current, { ...optionsRef.current, theme: modeRef.current })
    onReadyRef.current?.(instance)
    return () => instance.destroy()
    // Empty deps: dashjs manages its own state internally; re-mounting would
    // destroy the editor. The parent must pass a stable `options` via useMemo.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle the dashjs theme in runtime without re-mounting (theming.md:53-63).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (effectiveMode === 'dark') el.setAttribute('data-dashjs-theme', 'dark')
    else el.removeAttribute('data-dashjs-theme')
  }, [effectiveMode])

  return <div ref={ref} style={{ width: '100%', height: '100%', ...style }} />
}
