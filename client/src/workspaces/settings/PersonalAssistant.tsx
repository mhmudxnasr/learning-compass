import { useState } from 'preact/hooks'
import { api, labelize } from '../../api'

type Branch = { id: string; label: string; category_label?: string }
type AssistantItem = {
  title: string
  creator: string
  item_type: string
  state: string
  rating: number | null
  url: string
  release_year: number | null
  progress_current: number | null
  progress_total: number | null
  progress_unit: string
  tags: string[]
  personal_note: string
}
type AssistantResult = {
  available: boolean
  reply: string
  items: AssistantItem[]
  profile_signals: Array<{ key: string; category: string; value: string; confidence: number }>
  questions: string[]
  needs_clarification?: boolean
}
const modes = [
  { key: 'mixed', label: 'سجّل واسألني', hint: 'يفهم اللي قلته ويكمل الناقص' },
  { key: 'log', label: 'سجّل استهلاكي', hint: 'أفلام، كتب، مسلسلات وأكثر' },
  { key: 'questions', label: 'اعرفني أكتر', hint: 'أسئلة قصيرة عن ذوقك ومواضيعك' },
] as const

export function PersonalAssistant({ branches, onSaved }: { branches: Branch[]; onSaved: () => void }) {
  const [mode, setMode] = useState<(typeof modes)[number]['key']>('mixed')
  const [message, setMessage] = useState('')
  const [branchId, setBranchId] = useState('')
  const [result, setResult] = useState<AssistantResult | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [selectedSignals, setSelectedSignals] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const interpret = async (event: Event) => {
    event.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    setNotice('')
    setResult(null)
    setSelected([])
    setSelectedSignals([])
    try {
      const next = await api<AssistantResult>('/assistant/interpret', {
        method: 'POST',
        body: JSON.stringify({ message, mode }),
      })
      setResult(next)
      setSelected(next.items.map((_, index) => index))
      setSelectedSignals(next.profile_signals.map((_, index) => index))
    } catch (error: any) {
      setNotice(error?.message || 'المساعد مش قادر يرد دلوقتي.')
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    if (!result || (!selected.length && !selectedSignals.length) || (selected.length > 0 && !branchId)) return
    setBusy(true)
    setNotice('')
    try {
      for (const index of selected)
        await api('/capture/personal', {
          method: 'POST',
          body: JSON.stringify({ ...result.items[index], branch_id: branchId }),
        })
      for (const index of selectedSignals) {
        const signal = result.profile_signals[index]
        const key = encodeURIComponent('assistant_' + signal.key.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80))
        await api('/brain/profile/assertions/' + key, {
          method: 'PUT',
          body: JSON.stringify({
            category: signal.category || 'taste',
            value: signal.value,
            reason: 'User-confirmed through Personal Assistant',
          }),
        })
      }
      const saved = [
        selected.length ? `${selected.length} حاجة` : '',
        selectedSignals.length ? `${selectedSignals.length} إشارة ذوق` : '',
      ]
        .filter(Boolean)
        .join(' و')
      setNotice(`اتحفظ ${saved}.`)
      setResult({
        ...result,
        items: result.items.filter((_, index) => !selected.includes(index)),
        profile_signals: result.profile_signals.filter((_, index) => !selectedSignals.includes(index)),
      })
      setSelected([])
      setSelectedSignals([])
      setMessage('')
      onSaved()
    } catch (error: any) {
      setNotice(error?.message || 'ما قدرتش أحفظ كل حاجة. راجع البيانات وحاول تاني.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section class="personal-assistant-panel" aria-labelledby="personal-assistant-title" lang="ar" dir="rtl">
      <div class="personal-assistant-heading">
        <div>
          <span class="folio-object-kicker" lang="en" dir="ltr">
            Personal Assistant
          </span>
          <h2 id="personal-assistant-title">احكيلي إنت استهلكت إيه</h2>
          <p>
            اكتب بالمصري عادي: “اتفرجت على الفيلم ده وعجبني” أو “الكتاب ده وحش”. أنا أرتّبها لك، وأقدر أسألك أسئلة عشان
            أفهم ذوقك ومواضيعك.
          </p>
        </div>
        <span class="personal-assistant-mark" aria-hidden="true" lang="en" dir="ltr">
          AI
        </span>
      </div>
      <div class="personal-assistant-modes" role="tablist" aria-label="وضع المساعد">
        {modes.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={mode === item.key}
            class={mode === item.key ? 'is-active' : ''}
            onClick={() => setMode(item.key)}
          >
            <strong>{item.label}</strong>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>
      <form class="personal-assistant-form" onSubmit={interpret}>
        <label for="personal-assistant-message">احكيلي بطريقتك</label>
        <textarea
          id="personal-assistant-message"
          value={message}
          onInput={(event) => setMessage((event.currentTarget as HTMLTextAreaElement).value)}
          placeholder={
            mode === 'questions'
              ? 'مثلاً: اسألني عن نوع الأفلام اللي بتشدني…'
              : 'مثلاً: اتفرجت على Interstellar وعجبني جدًا، وThe Notebook ما عجبنيش…'
          }
          rows={4}
        />
        <div class="personal-assistant-submit-row">
          <small>مش لازم تكتب بشكل مرتب — أنا أستخرج العناوين والتقييم والحالة.</small>
          <button type="submit" class="button primary" disabled={busy || !message.trim()}>
            {busy ? 'بفهم…' : 'خلّيه يفهمني'}
          </button>
        </div>
      </form>
      {notice && (
        <output class="personal-assistant-notice" aria-live="polite">
          {notice}
        </output>
      )}
      {result && (
        <div class="personal-assistant-result">
          <p class="personal-assistant-reply">{result.reply}</p>
          {result.questions.length > 0 && (
            <div class="personal-assistant-questions">
              <strong>أسئلة ليك</strong>
              {result.questions.map((question) => (
                <button key={question} type="button" onClick={() => setMessage(question + ' ')}>
                  {question}
                </button>
              ))}
            </div>
          )}
          {result.items.length > 0 && (
            <div class="personal-assistant-items">
              <div class="personal-assistant-result-head">
                <strong>حاجات فهمتها</strong>
                <span>{selected.length} محددة</span>
              </div>
              {result.items.map((item, index) => (
                <label class="personal-assistant-item">
                  <input
                    type="checkbox"
                    checked={selected.includes(index)}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(index) ? current.filter((value) => value !== index) : [...current, index],
                      )
                    }
                  />
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {labelize(item.item_type)} · {labelize(item.state)}
                      {item.rating != null ? ' · ' + item.rating + '/10' : ''}
                    </small>
                    {item.personal_note && <em>{item.personal_note}</em>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {result.profile_signals.length > 0 && (
            <div class="personal-assistant-signals">
              <strong>إشارات فهمتها عن ذوقك</strong>
              {result.profile_signals.map((signal, index) => (
                <label key={`${signal.key}-${index}`}>
                  <input
                    type="checkbox"
                    checked={selectedSignals.includes(index)}
                    onChange={() =>
                      setSelectedSignals((current) =>
                        current.includes(index) ? current.filter((value) => value !== index) : [...current, index],
                      )
                    }
                  />
                  <span>{signal.value}</span>
                </label>
              ))}
              <small>راجع كل إشارة. المحدد فقط هيتحفظ لما تضغط حفظ.</small>
            </div>
          )}
          {(result.items.length > 0 || result.profile_signals.length > 0) && (
            <div class="personal-assistant-save">
              {result.items.length > 0 && (
                <label>
                  <span>فرع المعرفة للحاجات المحددة</span>
                  <select
                    value={branchId}
                    onChange={(event) => setBranchId((event.currentTarget as HTMLSelectElement).value)}
                  >
                    <option value="">اختار فرع موثّق قبل حفظ الحاجات</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.label}
                        {branch.category_label ? ' · ' + branch.category_label : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                class="button primary"
                disabled={busy || (!selected.length && !selectedSignals.length) || (selected.length > 0 && !branchId)}
                onClick={save}
              >
                {busy ? 'بيحفظ…' : 'احفظ المحدد'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
