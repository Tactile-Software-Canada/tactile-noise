import { Component, h, type ComponentType } from 'preact'

/**
 * Like React's memo(): re-renders `Inner` only when a prop changes (shallow
 * compare). Keeps slider drags from re-rendering the whole sound library on
 * slow phones. (Preact core has no memo; this avoids pulling in preact/compat.)
 */
export function pure<P extends object>(Inner: ComponentType<P>): ComponentType<P> {
  return class Pure extends Component<P> {
    shouldComponentUpdate(next: P): boolean {
      const prev = this.props as Record<string, unknown>
      const n = next as Record<string, unknown>
      for (const k in n) if (n[k] !== prev[k]) return true
      for (const k in prev) if (!(k in n)) return true
      return false
    }
    render() {
      return h(Inner, this.props)
    }
  }
}
