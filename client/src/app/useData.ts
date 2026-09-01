import { useEffect, useState } from 'preact/hooks'
import { api } from '../api'

export function useData<T = any>(endpoint?: string) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({
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
    setState((current) => ({ ...current, loading: current.data == null, error: '' }))
    api<T>(endpoint)
      .then((data) => live && setState({ data, loading: false, error: '' }))
      .catch(
        (error) =>
          live && setState({ data: null, loading: false, error: error?.message || 'Could not load this view.' }),
      )
    return () => {
      live = false
    }
  }, [endpoint, version])
  return { ...state, reload: () => setVersion((value) => value + 1) }
}
