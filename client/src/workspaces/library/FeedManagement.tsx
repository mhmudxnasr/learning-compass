import { useState } from 'preact/hooks'
import { useData } from '../../app/useData'
import { type LibraryRecord, type LibraryViewHandlers } from './types'

export function FeedManagement({ feeds, handlers }: { feeds: LibraryRecord[]; handlers: LibraryViewHandlers }) {
  const branches = useData<{ existing?: LibraryRecord[] }>('/brain/branch-deck')
  const [url, setUrl] = useState('')
  const [branch, setBranch] = useState('')
  return (
    <section class="ft-management" aria-label="Manage feeds">
      <div class="ft-management-header">
        <h2>Subscriptions</h2>
        <button
          type="button"
          class="folio-button"
          onClick={() => handlers.onSyncFeeds?.()}
          disabled={Boolean(handlers.busyId)}
        >
          {handlers.busyId === 'sync-feeds' ? 'Checking…' : 'Check all feeds'}
        </button>
      </div>
      <div class="ft-subscriptions">
        {feeds.map((feed) => (
          <div class="ft-subscription" key={feed.id}>
            <span>
              <strong>{feed.title || feed.feed_url}</strong>
              <small>{feed.branch_label}</small>
            </span>
            <button
              type="button"
              class="folio-button"
              onClick={() => handlers.onSyncFeed?.(String(feed.id))}
              disabled={Boolean(handlers.busyId)}
            >
              Check now
            </button>
            <button
              type="button"
              class="folio-button"
              onClick={() => {
                if (
                  window.confirm(`Unsubscribe from ${feed.title || feed.feed_url}? Saved sources stay in your Library.`)
                )
                  handlers.onDeleteFeed?.(feed)
              }}
              disabled={Boolean(handlers.busyId)}
            >
              Unsubscribe
            </button>
          </div>
        ))}
      </div>
      <form
        class="ft-subscribe"
        onSubmit={async (event) => {
          event.preventDefault()
          if (await handlers.onAddFeed?.(url.trim(), branch)) setUrl('')
        }}
      >
        <label>
          Feed URL
          <input
            type="url"
            required
            value={url}
            onInput={(event) => setUrl(event.currentTarget.value)}
            placeholder="https://example.com/feed.xml"
          />
        </label>
        <label>
          Knowledge branch
          <select
            required
            aria-label="Default knowledge branch for imported feed articles"
            value={branch}
            disabled={branches.loading}
            onChange={(event) => setBranch(event.currentTarget.value)}
          >
            <option value="">Choose a branch</option>
            {(branches.data?.existing || [])
              .filter((item) => String(item.status) !== 'pruned')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
          </select>
        </label>
        <button
          type="submit"
          class="folio-button folio-button-primary"
          disabled={!url.trim() || !branch || Boolean(handlers.busyId)}
        >
          {handlers.busyId === 'add-feed' ? 'Subscribing…' : 'Add feed'}
        </button>
      </form>
      <p>New articles inherit the selected branch and stay outside Queue until you add them.</p>
      {branches.error && (
        <p role="alert">
          Branches could not be loaded.{' '}
          <button type="button" class="folio-button" onClick={branches.reload}>
            Retry branches
          </button>
        </p>
      )}
    </section>
  )
}
