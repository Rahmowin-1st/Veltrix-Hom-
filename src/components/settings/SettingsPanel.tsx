import { useEffect, useState } from 'react'
import { LogOut, Play, Square, Check, Library, Sparkles, Trash2, ImagePlus, X } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { signOut } from '@/lib/supabase'
import { sourceApi, translateApi, type Language } from '@/lib/api'
import { speechSupported, voicesFor, speak, cancelSpeech } from '@/lib/speech'
import { clearCache } from '@/lib/cache'
import { MAX_PDF_MB } from '@/lib/limits'
import type { Subject, UserSettings } from '@/types'
import {
  Card, Row, Toggle, Segment, SelectField, TextField, Slider, Note, ChoiceList,
  AccentSwatches, BuiltInBackgrounds,
} from './controls'

export type GroupId =
  | 'account' | 'profile' | 'ai' | 'voice' | 'translate' | 'subjects'
  | 'sources' | 'skills' | 'appearance' | 'notifications' | 'performance'
  | 'privacy' | 'about'
  /* --- V16 root sections --- */
  | 'personalization' | 'learning' | 'sourcemode' | 'difficulty' | 'language'
  | 'haptics'

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
            Chatlar, manbalar, Talentlar va sozlamalar hisobingizga saqlanadi.
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
          <Card title="Javob uzunligi">
            <Note>Javobning batafsillik darajasi</Note>
            <Segment label="" value={settings.answer_length}
              options={[['short', 'Qisqa'], ['normal', "O‘rtacha"], ['detailed', 'Batafsil']]}
              onChange={(v) => set('answer_length', v as UserSettings['answer_length'])} />
          </Card>

          <Card title="Javob uslubi">
            <Note>Javob qanday ko‘rinishda bo‘lsin?</Note>
            <ChoiceList
              value={settings.answer_style}
              onChange={(v) => set('answer_style', v as UserSettings['answer_style'])}
              options={[
                ['plain', 'Oddiy matn', 'Soddalashtirilgan javob'],
                ['structured', 'Strukturali', "Bo‘limlar va punktlar bilan"],
                ['detailed', 'Batafsil tushuntirish', 'Chuqur va keng qamrovli'],
                ['concise', 'Qisqa va aniq', 'Faqat asosiy javob'],
              ]} />
          </Card>

          {/* Solution style lives INSIDE AI javoblari, not as a root category:
              it is a property of how an answer is produced, not a separate
              area of the app. */}
          <Card title="Yechish uslubi">
            <Note>Masalalarni qanday yechishini tanlang</Note>
            <ChoiceList
              value={settings.solution_style}
              onChange={(v) => set('solution_style', v as UserSettings['solution_style'])}
              options={[
                ['steps', 'Bosqichma-bosqich', 'Har bir qadamni tushuntirib'],
                ['final', 'Faqat yakuniy javob', "Natijani ko‘rsatish kifoya"],
                ['hint_first', 'Avval hint, keyin javob', "Avval yo‘l-yo‘riq, so‘ng javob"],
                ['both', 'Ikki usulda', "Bir nechta yechim ko‘rsatish"],
              ]} />
          </Card>

          <Card title="Misollar soni">
            <Note>Javobda nechta misol bo‘lsin?</Note>
            {/* Native range input: no JS-driven slider, so dragging costs
                nothing on a mid-range phone. */}
            <div className="v16-range">
              <input type="range" min={0} max={2} step={1}
                value={settings.example_count}
                aria-label="Misollar soni"
                onChange={(e) => set('example_count', Number(e.target.value))} />
              <div className="v16-range-labels" aria-hidden>
                <span>Kam</span><span>O‘rtacha</span><span>Ko‘p</span>
              </div>
            </div>
          </Card>

          <Card title="Manbaga qat’iylik">
            <Note>AI javobida manbaga tayanish darajasi</Note>
            <Segment label="" value={settings.source_strictness}
              options={[['flexible', 'Moslashuvchan'], ['strict', "Qat’iy"], ['allow_general', 'Manbasiz ham']]}
              onChange={(v) => set('source_strictness', v as UserSettings['source_strictness'])} />
            <Note>
              {settings.source_strictness === 'strict'
                ? "Faqat manbadan javob beriladi. Manbada topilmasa, AI buni ochiq aytadi va taxmin qilmaydi."
                : settings.source_strictness === 'allow_general'
                  ? "Avval manba, yetarli bo‘lmasa umumiy bilim — qaysi qism manbadan emasligi belgilanadi."
                  : "Keragicha manbadan foydalanadi."}
            </Note>
          </Card>

          <Card>
            <Toggle label="Markdown format" hint="Javobni Markdown ko‘rinishida berish"
              value={settings.markdown_format} onChange={(v) => set('markdown_format', v)} />
            <Toggle label="Formulalarni ko‘rsatish" hint="Matematik formulalarni chiroyli ko‘rsatish"
              value={settings.show_formulas} onChange={(v) => set('show_formulas', v)} />
            <Toggle label="Misollar va amaliyotlar" hint="Javobda misollar keltirish"
              value={settings.include_examples} onChange={(v) => set('include_examples', v)} />
            <Toggle label="Iqtibos majburiy" hint="Har bir dalil uchun bet raqami"
              value={settings.citation_required} onChange={(v) => set('citation_required', v)} />
          </Card>

          <Note>Bu sozlamalar barcha yangi chatlarda qo‘llanadi. Istalgan vaqtda o‘zgartirishingiz mumkin.</Note>
        </>
      )}

      {group === 'personalization' && (
        <>
          <Card title="Sizga murojaat">
            <TextField label="AI sizni qanday chaqirsin?"
              value={settings.address_name ?? profile.preferred_name ?? ''}
              onSave={(v) => set('address_name', v.trim() || null)} />
            <Note>Bo‘sh qoldirsangiz, profildagi ismingiz ishlatiladi.</Note>
          </Card>
          <Card title="Shaxsiy ko‘rsatma">
            <TextField label="Veltrix nimani bilishi kerak?"
              value={settings.custom_instructions ?? ''}
              onSave={(v) => set('custom_instructions', v.trim() || null)} />
            <Note>
              Bu ko‘rsatma faqat javob uslubiga ta’sir qiladi — xavfsizlik va manba
              qoidalarini bekor qila olmaydi.
            </Note>
          </Card>
        </>
      )}

      {group === 'learning' && (
        <Card title="O‘qish uslubi">
          <Note>Sizga qulay o‘rganish usulini tanlang</Note>
          <ChoiceList
            value={settings.learning_style}
            onChange={(v) => set('learning_style', v as UserSettings['learning_style'])}
            options={[
              ['balanced', 'Muvozanatli', 'Veltrix o‘zi mos usulni tanlaydi'],
              ['visual', 'Vizual', 'Jadval va sxemalar bilan'],
              ['example_first', 'Avval misol', 'Misoldan boshlab qoidaga'],
              ['theory_first', 'Avval nazariya', 'Qoidadan boshlab misolga'],
              ['step_by_step', 'Bosqichma-bosqich', 'Har doim qadamlar bilan'],
              ['guided', 'Yo‘naltirilgan', 'Savollar bilan o‘zingiz topasiz'],
            ]} />
        </Card>
      )}

      {group === 'sourcemode' && (
        <>
          <Card title="Manbaga qat’iylik">
            <Segment label="" value={settings.source_strictness}
              options={[['flexible', 'Moslashuvchan'], ['strict', "Qat’iy"], ['allow_general', 'Manbasiz ham']]}
              onChange={(v) => set('source_strictness', v as UserSettings['source_strictness'])} />
          </Card>
          <Card title="Manba tanlash">
            <Toggle label="Manbani avtomatik tanlash" hint="Kitob biriktirilmasa, mosini o‘zi topadi"
              value={settings.auto_source} onChange={(v) => set('auto_source', v)} />
            <Toggle label="Iqtibos majburiy" hint="Har bir dalil uchun bet raqami"
              value={settings.citation_required} onChange={(v) => set('citation_required', v)} />
          </Card>
          <button type="button" className="v16-link-row" onClick={() => onNavigate('/manbalar')}>
            Manbalarni boshqarish
          </button>
        </>
      )}

      {group === 'difficulty' && (
        <Card title="Tushuntirish qiyinligi">
          {/* Depth is not length: a short answer can still be conceptually deep,
              which is why this is a separate control from Javob uzunligi. */}
          <Note>Javob uzunligidan farqli — bu tushunchaning chuqurligi</Note>
          <ChoiceList
            value={settings.explanation_depth}
            onChange={(v) => set('explanation_depth', v as UserSettings['explanation_depth'])}
            options={[
              ['simple', 'Sodda', 'Eng oddiy tilda, atamalarsiz'],
              ['standard', 'Standart', 'Sinfingizga mos daraja'],
              ['deep', 'Chuqur', 'Nima uchun shundayligi bilan'],
            ]} />
          <Toggle label="Yoshga moslash" hint="Til murakkabligi sinfga qarab o‘zgaradi"
            value={settings.age_adapted} onChange={(v) => set('age_adapted', v)} />
        </Card>
      )}

      {group === 'language' && (
        <>
          <Card title="Ta’lim tili">
            <SelectField label="Ilova va ta’lim tili" value={profile.school_language}
              options={[['uz', "O‘zbek tili"], ['ru', 'Rus tili'], ['en', 'Ingliz tili']]}
              onChange={(v) => { void patchProfile({ school_language: v }); flash() }} />
          </Card>
          <Card title="Javob tili">
            <SelectField label="AI javob beradigan til" value={settings.ai_language}
              options={[['auto', 'Avtomatik (savol tilida)'], ['uz', "O‘zbek tili"], ['ru', 'Rus tili'], ['en', 'Ingliz tili']]}
              onChange={(v) => set('ai_language', v)} />
            <Note>Avtomatik rejimda javob savol tiliga moslashadi.</Note>
          </Card>
        </>
      )}

      {group === 'haptics' && (
        <Card title="Haptics">
          <Toggle label="Vibratsiya" hint="Teginish va tugmalarda sezilarli javob"
            value={settings.haptics} onChange={(v) => set('haptics', v)} />
          <Toggle label="Xato javobda tebranish" hint="Testlarda noto‘g‘ri javob bildirishi"
            value={settings.wrong_answer_haptics} onChange={(v) => set('wrong_answer_haptics', v)} />
          <Note>Vibratsiyani qo‘llab-quvvatlamaydigan qurilmalarda bu sozlama e’tiborsiz qoldiriladi.</Note>
        </Card>
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
            onClick={() => onNavigate('/talent')}>
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
          <div className="surface-2" style={{ padding: 13, borderRadius: 20, display: 'grid', gap: 14 }}>
            <strong>Rang va fon</strong>

            {/* Accent first: in V17 it drives the background, so it is the
                control that changes the most and belongs at the top. */}
            <AccentSwatches value={settings.accent_color}
              onChange={(hex) => set('accent_color', hex)} />
            <ColorRow label="Aniq rang tanlash" value={settings.accent_color}
              onChange={(v) => set('accent_color', v)} />

            <Segment label="Fon uslubi" value={settings.bg_style ?? 'accent'}
              options={[['accent', 'Rangdan'], ['image', 'Rasm'], ['custom', 'Qo‘lda']]}
              onChange={(v) => set('bg_style', v as UserSettings['bg_style'])} />

            {(settings.bg_style ?? 'accent') === 'accent' && (
              <>
                <Slider label="Fon rang kuchi" value={settings.bg_tint ?? 55}
                  min={0} max={100} step={1} format={(v) => `${Math.round(v)}%`}
                  onChange={(v) => set('bg_tint', Math.round(v))} />
                <Note>
                  Fon tanlangan rangdan hosil bo‘ladi. 0% — deyarli oq,
                  100% — to‘yingan. Matn o‘qilishi uchun eng kuchli darajada ham
                  fon ochiq qoladi.
                </Note>
              </>
            )}

            {(settings.bg_style ?? 'accent') === 'image' && (
              <>
                <BuiltInBackgrounds value={settings.chat_background_url}
                  onChange={(v) => set('chat_background_url', v)} />
                <BackgroundPicker value={settings.chat_background_url}
                  onChange={(v) => set('chat_background_url', v)} />
                <Slider label="Fon blur" value={settings.chat_background_blur ?? 24}
                  min={0} max={42} step={1} format={(v) => `${Math.round(v)}px`}
                  onChange={(v) => set('chat_background_blur', Math.round(v))} />
              </>
            )}

            {(settings.bg_style ?? 'accent') === 'custom' && (
              <>
                <ColorRow label="Gradient boshi" value={settings.chat_gradient_from}
                  onChange={(v) => set('chat_gradient_from', v)} />
                <ColorRow label="Gradient oxiri" value={settings.chat_gradient_to}
                  onChange={(v) => set('chat_gradient_to', v)} />
              </>
            )}

            <ColorRow label="Ikkinchi svet" value={settings.accent_secondary}
              onChange={(v) => set('accent_secondary', v)} />
            <Slider label="Mirror kuchi" value={settings.mirror_intensity ?? 72}
              min={20} max={100} step={1} format={(v) => `${Math.round(v)}%`}
              onChange={(v) => set('mirror_intensity', Math.round(v))} />
          </div>
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
          <Row label="Tarjima fayli" value="20 MB" />
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


function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="row" style={{ gap: 10 }}><span style={{ flex: 1, fontSize: 'var(--fs-sm)' }}>{label}</span><input type="color" value={value || '#0A6CFF'} onChange={(e) => onChange(e.target.value)} style={{ width: 48, height: 38, padding: 3, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }} /></label>
}
function BackgroundPicker({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const read = (file: File) => {
    if (file.size > 4 * 1024 * 1024) return
    const image = new Image(); const url = URL.createObjectURL(file)
    image.onload = () => {
      const max = 960; const scale = Math.min(1, max / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url); onChange(canvas.toDataURL('image/jpeg', .72))
    }
    image.onerror = () => URL.revokeObjectURL(url); image.src = url
  }
  return <div style={{ display: 'grid', gap: 8 }}><span style={{ fontSize: 'var(--fs-sm)' }}>Shaxsiy chat foni</span>{value && <div style={{ height: 112, borderRadius: 18, backgroundImage: `linear-gradient(rgba(255,255,255,.18),rgba(255,255,255,.18)),url(${value})`, backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid var(--border)' }} />}<div className="row" style={{ gap: 7 }}><label className="btn btn-outline" style={{ cursor: 'pointer' }}><ImagePlus size={16}/> Foto tanlash<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file=e.target.files?.[0]; if(file) read(file); e.currentTarget.value='' }} /></label>{value && <button className="btn btn-ghost" onClick={() => onChange(null)}><X size={16}/> Olib tashlash</button>}</div><span className="micro">Rasm hisobingizga siqilgan formatda saqlanadi. Maksimal tanlov: 4 MB.</span></div>
}
