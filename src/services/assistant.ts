import { freeAi } from './ai.ts'
import type { Bindings } from '../lib.ts'

export type AssistantMode = 'log' | 'questions' | 'mixed'

const ITEM_TYPES = new Set(['book', 'movie', 'series', 'podcast', 'course', 'game', 'album', 'other'])
const ITEM_STATES = new Set(['planned', 'in_progress', 'completed', 'paused', 'dropped'])

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

function parseJson(raw: string): any {
  const fenced = raw.replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '').trim()
  try { return JSON.parse(fenced) } catch {}
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(fenced.slice(start, end + 1)) } catch {}
  }
  return null
}

function normalizeItem(value: any) {
  const itemType = text(value?.item_type || 'other', 20)
  const state = text(value?.state || 'completed', 20)
  if (!ITEM_TYPES.has(itemType) || !ITEM_STATES.has(state)) return null
  const rating = value?.rating == null || value.rating === '' ? null : Number(value.rating)
  return {
    title: text(value?.title, 500), creator: text(value?.creator, 300), item_type: itemType, state,
    url: text(value?.url, 2048), release_year: value?.release_year == null ? null : Number(value.release_year),
    progress_current: value?.progress_current == null ? null : Number(value.progress_current),
    progress_total: value?.progress_total == null ? null : Number(value.progress_total),
    progress_unit: text(value?.progress_unit, 40),
    rating: rating != null && Number.isFinite(rating) ? Math.max(0, Math.min(10, rating)) : null,
    tags: Array.isArray(value?.tags) ? [...new Set(value.tags.map((tag: unknown) => text(tag, 60)).filter(Boolean))].slice(0, 20) : [],
    personal_note: text(value?.personal_note, 5000),
  }
}

const SYSTEM_PROMPT = [
  'أنت مساعد شخصي داخل Learning Compass. مهمتك تنظيم تاريخ استهلاك المستخدم وفهم ذوقه، وليس اختراع معلومات.',
  'أعد JSON فقط بلا Markdown بهذا الشكل:',
  '{"reply":"رد قصير بالمصرية","items":[{"title":"","creator":"","item_type":"book|movie|series|podcast|course|game|album|other","state":"planned|in_progress|completed|paused|dropped","rating":0,"url":"","release_year":null,"progress_current":null,"progress_total":null,"progress_unit":"","tags":[],"personal_note":""}],"profile_signals":[{"key":"","category":"taste|boundary|habit|goal|context","value":"","confidence":0.0}],"questions":[""],"needs_clarification":false}',
  'استخرج فقط ما قاله المستخدم أو ما صرّح به بوضوح. لا تخترع مؤلفاً أو مخرجاً أو تقييماً.',
  'لو قال حلوة أو عجبتني استخدم rating=8 فقط عندما لا يوجد رقم، ولو قال وحشة أو ما عجبتنيش استخدم rating=3.',
  'اجعل الحالة completed إذا قال شاهدت أو قرأت أو خلصت، وin_progress إذا قال لسه، وplanned إذا قال عايز يبدأ.',
  'لا تنشئ profile_signal من تخمين ضعيف. اسأل سؤالاً واحداً أو اثنين فقط إذا كانت المعلومة ناقصة أو لو mode=questions.',
  'الرد والـquestions بالمصرية العربية ما أمكن. لا تضع أي نص خارج JSON.',
].join('\\n')

export async function interpretAssistantMessage(env: Pick<Bindings, 'OPENCODE_ZEN_API_KEY'>, message: string, mode: AssistantMode = 'mixed') {
  const cleanMessage = text(message, 12000)
  if (!cleanMessage) return { available: true, reply: 'اكتبلي حاجة استهلكتها أو حاجة عايزني أسألك عنها.', items: [], profile_signals: [], questions: [], mode }
  const result = await freeAi(env, SYSTEM_PROMPT + '\\nmode الحالي: ' + mode, cleanMessage, 1200)
  if (!result) return { available: false, reply: 'المساعد مش متاح دلوقتي. اكتبها في النموذج العادي وأنا هسجلها، أو جرّب تاني بعد شوية.', items: [], profile_signals: [], questions: [], mode }
  const parsed = parseJson(result.text)
  if (!parsed || typeof parsed !== 'object') return { available: false, reply: 'فهمت إن فيه حاجة عايز تسجلها، بس محتاج تكتبها بشكل أوضح.', items: [], profile_signals: [], questions: [], mode }
  const items = Array.isArray(parsed.items) ? parsed.items.map(normalizeItem).filter((item: any) => item?.title) : []
  const profileSignals = Array.isArray(parsed.profile_signals) ? parsed.profile_signals.map((signal: any) => ({
    key: text(signal?.key, 100), category: text(signal?.category || 'taste', 80), value: text(signal?.value, 1000), confidence: Math.max(0, Math.min(1, Number(signal?.confidence || 0))),
  })).filter((signal: any) => signal.key && signal.value && signal.confidence >= 0.65).slice(0, 8) : []
  const questions = Array.isArray(parsed.questions) ? parsed.questions.map((question: unknown) => text(question, 500)).filter(Boolean).slice(0, 2) : []
  return { available: true, model: result.model, reply: text(parsed.reply, 1200) || 'تمام، فهمت عليك.', items, profile_signals: profileSignals, questions, needs_clarification: Boolean(parsed.needs_clarification), mode }
}
