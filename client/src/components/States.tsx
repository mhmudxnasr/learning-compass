export function Loading({ label = 'Loading workspace' }: { label?: string }) {
  return <div class="state-block state-loading" role="status" aria-label={label}><i/><i/><i/><span aria-hidden="true">{label}…</span></div>
}

export function Empty({ title, body, action }: { title: string; body: string; action?: preact.ComponentChildren }) {
  return <div class="state-block state-empty"><span class="state-rule"/><h2>{title}</h2><p>{body}</p>{action}</div>
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div class="state-block state-error" role="alert"><span class="state-rule"/><h2>This view could not load</h2><p>{message}</p>{retry && <button type="button" class="button secondary" onClick={retry}>Try again</button>}</div>
}
