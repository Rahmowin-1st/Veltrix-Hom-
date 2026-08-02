import { useEffect, useState } from 'react'
import { LogOut, Play, Square, Check, Library, Sparkles, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { signOut } from '@/lib/supabase'
import { sourceApi, translateApi, type Language } from '@/lib/api'
import { speechSupported, voicesFor, speak, cancelSpeech } from '@/lib/speech'
import { clearCache } from '@/lib/cache'
import { MAX_PDF_MB } from '@/lib/limits'
import type { Subject, UserSettings } from '@/types'
import {
  Card, Row, Toggle, Segment, SelectField, TextField, Slider, Note,
} from './controls'

export type GroupId =
  | 'account' | 'profile' | 'ai' | 'voice' | 'translate' | 'subjects'
  | 'sources' | 'skills' | 'appearance' | 'notifications' | 'performance'
  | 'privacy' | 'about'

/** Renders one settings group. Every control writes to the account. */
export function SettingsPanel({ group, onNavigate }: {
  group: GroupId
  onNavigate: (to: string) => void
}) {
  const profile = useAuthStore((s) => s.profile)
  const settings = useAuthStore((s) => s.settings)
  const patchSettings = useAuthStore((s) => s.patchSettings)
  const patchProfile = useAuthStore((s) => s.patchProfile)

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (group === 'subjects') sourceApi.subjects().then((r) => setSubjects(r.subjects)).catch(() => {})
    if (group === 'translate' || group === 'voice') {
      translateApi.languages().then((r) => setLanguages(r.languages)).catch(() => {})
    }
  }, [group])

  if (!profile || !settings) {
    return <div className="skeleton" style={{ height: 180 }} />
  }

  const flash = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1400) }
  const set = <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => {
    void patchSettings({ [k]: v } as Partial<UserSettings>); flash()
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
      {saved && (
        <span role="status" className="chip chip-strong" style={{ justifySelf: 'start' }}>
          <Check size={13} /> Saqlandi
        </span>
      )}

      {group === 'account' && (
        <Card>
          <Row label="Ism" value={profile.full_name ?? '—'} />
          <Row label="Kirish usuli" value="Google" />
          <Note>
            Chatlar, manbalar, skillar va sozlamalar hisobingizga saqlanadi.
            Boshqa qurilmadan kirsangiz ham hammasi joyida turadi.
          </Note>
          <button className="btn btn-outline" style={{ color: 'var(--danger)', justifySelf: 'start' }}
            onClick={async () => { await signOut(); onNavigate('/kirish') }}>
            <LogOut size={16} /> Chiqish
          </button>
        </Card>
      )}

      {group === 'profile' && (
        <Card>
          <TextField label="Ismingiz" value={profile.preferred_name ?? profile.full_name ?? ''}
            onSave={(v) => { void patchProfile({ preferred_name: v }); flash() }} />
          <SelectField label="Sinf" value={String(profile.grade ?? '')}
            options={[['', 'Tanlanmagan'], ...Array.from({ length: 11 }, (_, i) =>
              [String(i + 1), `${i + 1}-sinf`] as [string, string])]}
            onChange={(v) => { void patchProfile({ grade: v ? Number(v) : null }); flash() }} />
          <SelectField label="Ta'lim tili" value={profile.school_language}
            options={[['uz', "O'zbek"], ['ru', 'Rus'], ['kaa', 'Qoraqalpoq']]}
            onChange={(v) => { void patchProfile({ school_language: v }); flash() }} />
          <Note>Sinf tanlansa, javoblar shu yoshga mos tilda beriladi.</Note>
        </Card>
      )}

      {group === 'ai' && (
        <>
          <Card title="Javob uslubi">
            <Segment label="Uzunlik" value={settings.answer_length}
              options={[['short', 'Qisqa'], ['normal', "O'rta"], ['detailed', 'Batafsil']]}
              onChange={(v) => set('answer_length', v as UserSettings['answer_length'])} />
            <Note>O'rta uzunlik ko'pchilik savollar uchun eng maqbul.</Note>
            <SelectField label="Standart rejim" value={settings.default_answer_mode}
              options={[
                ['full', 'Bosqichma-bosqich'], ['short', 'Qisqa izoh'],
                ['answer_only', 'Faqat javob'], ['notebook', 'Daftar formati'],
              ]}
              onChange={(v) => set('default_answer_mode', v)} />
          </Card>

          <Card title="Manba va aniqlik">
            <Toggle label="Ustoz rejimi" hint="Avval ishora, keyin to'liq yechim"
              value={settings.teacher_mode} onChange={(v) => set('teacher_mode', v)} />
            <Toggle label="Manbani avtomatik tanlash" hint="Kitob biriktirilmasa, mosini o'zi topadi"
              value={settings.auto_source} onChange={(v) => set('auto_source', v)} />
            <Toggle label="Iqtibos majburiy" hint="Har bir dalil uchun bet raqami"
              value={settings.citation_required} onChange={(v) => set('citation_required', v)} />
            <Toggle label="Yoshga moslash" hint="Til murakkabligi sinfga qarab o'zgaradi"
              value={settings.age_adapted} onChange={(v) => set('age_adapted', v)} />
          </Card>
        </>
      )}

      {group === 'voice' && <VoiceGroup settings={settings} languages={languages} set={set} />}

      {group === 'translate' && (
        <Card>
          <SelectField label="Standart manba tili" value={settings.tr_source_lang}
            options={[['auto', 'Avto aniqlash'],
              ...languages.map((l) => [l.code, l.native] as [string, string])]}
            onChange={(v) => set('tr_source_lang', v)} />
          <SelectField label="Standart maqsad tili" value={settings.tr_target_lang}
            options={languages.map((l) => [l.code, l.native] as [string, string])}
            onChange={(v) => set('tr_target_lang', v)} />
          <Toggle label="Oxirgi tanlovni eslab qolish" value={settings.tr_remember_last}
            onChange={(v) => set('tr_remember_last', v)} />
          <Toggle label="Aniqlangan matnni ko'rsatish" value={settings.tr_show_original}
            onChange={(v) => set('tr_show_original', v)} />
          <Toggle label="Tarjimani avtomatik o'qish" value={settings.tr_auto_read}
            onChange={(v) => set('tr_auto_read', v)} />
        </Card>
      )}

      {group === 'subjects' && (
        <Card>
          <Note>
            {subjects.length} ta fan mavjud. AI fanni javob paytida o'zi aniqlaydi —
            bu katalog manbalar va loyihalarni tartiblash uchun.
          </Note>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {subjects.map((s) => (
              <span key={s.id} className="chip">
                <span data-emoji>{s.emoji}</span> {s.name}
              </span>
            ))}
          </div>
        </Card>
      )}

      {group === 'sources' && (
        <Card>
          <Note>
            PDF darslik yuklang — AI javoblarni aynan shu kitobdan, bet raqami
            bilan beradi. Maksimal hajm: {MAX_PDF_MB} MB.
          </Note>
          <button className="btn btn-primary" style={{ justifySelf: 'start' }}
            onClick={() => onNavigate('/manbalar')}>
            <Library size={16} /> Manbalarni ochish
          </button>
        </Card>
      )}

      {group === 'skills' && (
        <Card>
          <Note>
            Skill — qayta ishlatiladigan AI yo'riqnomasi. Bir marta yozib,
            istalgan chatda qo'llaysiz.
          </Note>
          <button className="btn btn-primary" style={{ justifySelf: 'start' }}
            onClick={() => onNavigate('/skills')}>
            <Sparkles size={16} /> Skillarni ochish
          </button>
        </Card>
      )}

      {group === 'appearance' && (
        <Card>
          <Segment label="Mavzu" value={settings.theme}
            options={[['system', 'Tizim'], ['light', "Yorug'"], ['dark', "Qorong'i"]]}
            onChange={(v) => set('theme', v as UserSettings['theme'])} />
          <Slider label="Shrift o'lchami" value={settings.font_scale ?? 1}
            min={0.85} max={1.3} step={0.05} format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => {
              document.documentElement.style.setProperty('--font-scale', String(v))
              set('font_scale', v)
            }} />
          <Toggle label="Ixcham rejim" hint="Elementlar orasidagi masofa kamayadi"
            value={settings.compact_mode} onChange={(v) => set('compact_mode', v)} />
          <Toggle label="Yuqori kontrast" hint="Chegaralar va matn kuchliroq ajraladi"
            value={settings.high_contrast} onChange={(v) => set('high_contrast', v)} />
        </Card>
      )}

      {group === 'notifications' && (
        <Card>
          <Toggle label="Tebranish" hint="Tugma bosilganda qisqa tebranish"
            value={settings.haptics} onChange={(v) => set('haptics', v)} />
          <Toggle label="Javob tayyor bo'lganda ovoz" value={settings.sound_on_done}
            onChange={(v) => set('sound_on_done', v)} />
          <Note>
            Push bildirishnomalar hozircha yo'q — ilova ochiq bo'lganda ishlaydigan
            signallar sozlanadi.
          </Note>
        </Card>
      )}

      {group === 'performance' && (
        <Card>
          <Toggle label="Animatsiyani kamaytirish"
            hint="Eski telefonlarda silliqroq ishlaydi"
            value={settings.reduced_motion} onChange={(v) => set('reduced_motion', v)} />
          <Toggle label="Chat keshini saqlash"
            hint="Chat qayta ochilganda darhol ko'rinadi"
            value={settings.cache_enabled} onChange={(v) => set('cache_enabled', v)} />
          <button className="btn btn-outline" style={{ justifySelf: 'start' }}
            onClick={async () => { await clearCache(); flash() }}>
            <Trash2 size={15} /> Keshni tozalash
          </button>
        </Card>
      )}

      {group === 'privacy' && (
        <Card>
          <Row label="Chat tarixi" value="Hisobda saqlanadi" />
          <Row label="Yuklangan kitoblar" value="Faqat siz ko'rasiz" />
          <Note>
            Har bir jadval satr darajasida himoyalangan (RLS). Boshqa foydalanuvchi
            sizning chatlaringiz, manbalaringiz yoki fayllaringizni ocha olmaydi.
          </Note>
          <button className="btn btn-outline" style={{ justifySelf: 'start' }}
            onClick={async () => {
              localStorage.removeItem('veltrix:ui')
              localStorage.removeItem('veltrix:seen')
              await clearCache()
              flash()
            }}>
            Qurilma ma'lumotini tozalash
          </button>
        </Card>
      )}

      {group === 'about' && (
        <Card>
          <Row label="Versiya" value="3.0" />
          <Row label="AI" value="Gemini" />
          <Row label="PDF limiti" value={`${MAX_PDF_MB} MB`} />
          <Row label="Tarjima fayli" value="15 MB" />
          <Note>
            Bepul tariflar bilan ishlaydi. Limitga yetganda aniq xabar
            ko'rsatiladi — hech narsa jimgina to'xtamaydi.
          </Note>
        </Card>
      )}
    </div>
  )
}

/* ------------------- voice: real device voices only ----------------- */

function VoiceGroup({ settings, languages, set }: {
  settings: UserSettings
  languages: Language[]
  set: <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => void
}) {
  const [testing, setTesting] = useState(false)
  const lang = languages.find((l) => l.code === settings.tr_target_lang)
  const bcp47 = lang?.bcp47 ?? 'uz-UZ'
  const available = speechSupported ? voicesFor(bcp47) : []

  useEffect(() => () => cancelSpeech(), [])

  if (!speechSupported) {
    return <Card><Note>Bu qurilma ovozli o'qishni qo'llab-quvvatlamaydi.</Note></Card>
  }

  const test = () => {
    if (testing) { cancelSpeech(); setTesting(false); return }
    setTesting(true)
    speak('Salom! Men Veltrix Hom yordamchisiman. 2 + 2 = 4.', {
      lang: bcp47,
      voice: available.find((v) => v.name === settings.voice_name) ?? available[0] ?? null,
      rate: settings.voice_rate,
      onEnd: () => setTesting(false),
    })
  }

  return (
    <Card>
      <Note>
        Ovozlar qurilmangizdan olinadi. {lang?.native ?? 'Bu til'} uchun{' '}
        {available.length ? `${available.length} ta ovoz topildi.` : 'ovoz topilmadi.'}
      </Note>

      {available.length > 0 && (
        <SelectField label="Diktor" value={settings.voice_name ?? available[0]!.name}
          options={available.map((v) => [v.name, `${v.name} — ${v.lang}`] as [string, string])}
          onChange={(v) => set('voice_name', v)} />
      )}

      {available.length === 0 && (
        <div role="alert" className="surface-2" style={{
          padding: '11px 13px', fontSize: 'var(--fs-label)', color: 'var(--warning)',
        }}>
          Bu til uchun mos ovoz topilmadi. Qurilma sozlamalaridan til paketini qo'shing.
        </div>
      )}

      <Slider label="Tezlik" value={settings.voice_rate} min={0.6} max={1.6} step={0.1}
        format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set('voice_rate', v)} />

      <Toggle label="Javobni avtomatik o'qish" value={settings.auto_read}
        onChange={(v) => set('auto_read', v)} />

      <button className="btn btn-outline" style={{ justifySelf: 'start' }}
        disabled={available.length === 0} onClick={test}>
        {testing ? <Square size={15} /> : <Play size={15} />}
        {testing ? "To'xtatish" : 'Ovozni sinash'}
      </button>
    </Card>
  )
}
