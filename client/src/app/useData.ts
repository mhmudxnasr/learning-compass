import { useCallback, useEffect, useState } from 'preact/hooks'
import { api } from '../api'

export function useData<T = any>(endpoint?: string) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{ endpoint?: string; data: T | null; loading: boolean; error: string }>({
    endpoint,
    data: null,
    loading: Boolean(endpoint),
    error: '',
  })
  useEffect(() => {
    let live = true
    if (!endpoint) {
      setState({ data: null, loading: false, error: '' })
      return
    }
    setState((current) => ({ ...current, loading: true, error: '' }))
    api<T>(endpoint)
      .then((data) => live && setState({ endpoint, data, loading: false, error: '' }))
      .catch(
        (error) =>
          live &&
          setState({ endpoint, data: null, loading: false, error: error?.message || 'Could not load this view.' }),
      )
    return () => {
      live = false
    }
  }, [endpoint, version])
  const reload = useCallback(() => setVersion((value) => value + 1), [])
  // A changed query is pending even before its effect starts. Never expose the
  // previous endpoint's results or announce a premature empty result set.
  const current = state.endpoint === endpoint
  return {
    data: current ? state.data : null,
    loading: Boolean(endpoint) && (!current || state.loading),
    error: current ? state.error : '',
    reload,
  }
}
