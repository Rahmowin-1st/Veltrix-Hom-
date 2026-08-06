import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, LockKeyhole, MoreVertical, Pencil, Play, Plus, Search, Sparkles, Trash2, Upload, WandSparkles } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSkillStore } from '@/store/skillStore'
import { useProjectStore } from '@/store/projectStore'
import { skillApi, sourceApi } from '@/lib/api'
import type { Skill, Subject } from '@/types'

const EMOJIS = ['✨','🧮','➗','𝑥','📐','⚛️','🧪','🌿','🦉','🫀','✍️','🏛️','🌍','💻','🎯','🧠','⚡']
const COLORS = ['#0A6CFF','#1E9BFF','#06B6D4','#16A34A','#F59E0B','#F97316','#E11D48','#8B5CF6','#334155']

/** Product name is Talent. The database/API keeps `skills` for compatibility. */
export default function Skills() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { skills, loading, load, remove, duplicate } = useSkillStore()
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.load)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Skill | 'new' | null>(null)
  const [menuFor, setMenuFor] = useState<Skill | null>(null)
  const [deleteFor, setDeleteFor] = useState<Skill | null>(null)

  useEffect(() => { if (params.get('add') === '1') setEditing('new') }, [params])
  useEffect(() => {
    void load(); void loadProjects()
    sourceApi.subjects().then((r) => setSubjects(r.subjects)).catch(() => {})
  }, [load, loadProjects])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? skills.filter((s) => `${s.name} ${s.description ?? ''} ${s.subject_slug ?? ''}`.toLowerCase().includes(q)) : skills
  }, [skills, query])

  const activate = (talent: Skill) => {
    useSkillStore.getState().setActive(talent.id)
    navigate('/general')
  }
  const closeEditor = () => {
    setEditing(null)
    if (params.has('add')) { const next = new URLSearchParams(params); next.delete('add'); setParams(next, { replace: true }) }
  }

  return <div data-scroll-root className="hide-sb v6-talent-screen">
    <div className="v6-talent-shell">
      <header className="v6-page-hero">
        <div><p className="micro">VELTRIX · DOMAIN INTELLIGENCE</p><h1>Talentlar</h1><p className="muted">AI fikrini bitta fan va mavzuga qat’iy bog‘laydigan haqiqiy yo‘riqnomalar.</p></div>
        <button className="btn btn-gradient" onClick={() => setEditing('new')}><Plus size={18}/> Yangi Talent</button>
      </header>

      <label className="v6-search-field"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Talent, fan yoki vazifa bo‘yicha qidiring…" /></label>

      {loading && <div className="v6-talent-grid">{[0,1,2,3].map((x) => <div key={x} className="skeleton" style={{height:190,borderRadius:26}} />)}</div>}
      {!loading && filtered.length === 0 && <EmptyState emoji="🧠" title={query ? 'Talent topilmadi' : 'Talent yo‘q'} body="Matematik, biolog yoki o‘zingizga mos maxsus Talent yarating." action={!query ? <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16}/> Talent yaratish</button> : undefined}/>} 

      <div className="v6-talent-grid">
        {filtered.map((talent, index) => <motion.article key={talent.id} className="v6-talent-card"
          style={{'--talent-color': talent.color || '#0A6CFF','--talent-bg': talent.background_color || talent.color || '#0A6CFF'} as CSSProperties}
          initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:Math.min(index*.035,.2)}}>
          <div className="v6-talent-card-glow" />
          <div className="row" style={{alignItems:'flex-start',gap:12,position:'relative'}}>
            <span className="v6-talent-icon">{talent.icon_url ? <img src={talent.icon_url} alt=""/> : talent.emoji}</span>
            <div className="col" style={{minWidth:0,flex:1,gap:4}}>
              <div className="row" style={{gap:6}}><strong className="truncate">{talent.name}</strong>{talent.is_default && <span className="v6-lock-badge"><LockKeyhole size={11}/> default</span>}</div>
              <span className="micro">{talent.subject_slug ? `Fan: ${talent.subject_slug}` : scopeLabel(talent, projects, subjects)}</span>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={() => setMenuFor(talent)} aria-label={`${talent.name} amallari`}><MoreVertical size={18}/></button>
          </div>
          <p className="v6-talent-description">{talent.description || 'Maxsus fan doirasida aniq va chalg‘imasdan ishlaydi.'}</p>
          <div className="row" style={{gap:8,position:'relative'}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={() => activate(talent)}><Play size={15}/> Ishlatish</button>
            <button className="btn btn-outline" onClick={() => setEditing(talent)}><Pencil size={15}/> Tahrir</button>
          </div>
        </motion.article>)}
      </div>
    </div>

    <AnimatePresence>
      {menuFor && <BottomSheet key="menu" title={menuFor.name} onClose={() => setMenuFor(null)} desktopWidth={380}>
        <div style={{display:'grid',gap:3}}>
          <SheetAction icon={<Play size={17}/>} label="General’da ishlatish" onClick={() => {activate(menuFor);setMenuFor(null)}} />
          <SheetAction icon={<Pencil size={17}/>} label="Tahrirlash" onClick={() => {setEditing(menuFor);setMenuFor(null)}} />
          <SheetAction icon={<Copy size={17}/>} label="Nusxalash" onClick={() => {void duplicate(menuFor.id);setMenuFor(null)}} />
          {!menuFor.is_default && <SheetAction danger icon={<Trash2 size={17}/>} label="O‘chirish" onClick={() => {setDeleteFor(menuFor);setMenuFor(null)}} />}
        </div>
      </BottomSheet>}
      {deleteFor && <BottomSheet key="delete" title="Talent o‘chirilsinmi?" onClose={() => setDeleteFor(null)} desktopWidth={390}>
        <p><strong>{deleteFor.name}</strong> butunlay o‘chiriladi.</p><div className="row" style={{gap:8,marginTop:18}}><button className="btn btn-outline" style={{flex:1}} onClick={() => setDeleteFor(null)}>Bekor</button><button className="btn btn-danger" style={{flex:1}} onClick={() => {void remove(deleteFor.id);setDeleteFor(null)}}>O‘chirish</button></div>
      </BottomSheet>}
      {editing && <TalentEditor key="editor" talent={editing === 'new' ? undefined : editing} subjects={subjects} onClose={closeEditor}/>} 
    </AnimatePresence>
  </div>
}

function TalentEditor({talent,subjects,onClose}:{talent?:Skill;subjects:Subject[];onClose:()=>void}) {
  const create = useSkillStore((s) => s.create)
  const update = useSkillStore((s) => s.update)
  const [name,setName] = useState(talent?.name ?? '')
  const [emoji,setEmoji] = useState(talent?.emoji ?? '✨')
  const [color,setColor] = useState(talent?.color ?? '#0A6CFF')
  const [iconUrl,setIconUrl] = useState(talent?.icon_url ?? '')
  const [description,setDescription] = useState(talent?.description ?? '')
  const [instructions,setInstructions] = useState(talent?.instructions ?? '')
  const [subjectSlug,setSubjectSlug] = useState(talent?.subject_slug ?? '')
  const [refining,setRefining] = useState(false)
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')

  const refine = async () => {
    if (description.trim().length < 8) { setError('AI qayta ishlashi uchun kamida 8 ta belgi yozing.'); return }
    setRefining(true); setError('')
    try { const r=await skillApi.refine({description:description.trim(),subject_slug:subjectSlug||null}); setInstructions(r.instructions) }
    catch(e){ setError(e instanceof Error ? e.message : 'Talentni qayta ishlab bo‘lmadi.') }
    finally { setRefining(false) }
  }
  const pickImage = (file?:File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Faqat rasm tanlang.'); return }
    if (file.size > 1024*1024) { setError('Talent rasmi maksimal 1 MB.'); return }
    const reader=new FileReader(); reader.onload=()=>setIconUrl(String(reader.result)); reader.readAsDataURL(file)
  }
  const save = async () => {
    if (!name.trim() || !description.trim()) { setError('Nomi va tavsifini kiriting.'); return }
    setSaving(true); setError('')
    const body:Partial<Skill>&{name:string}={name:name.trim(),emoji,color,background_color:color,icon_url:iconUrl||null,description:description.trim(),instructions:instructions.trim()||null,subject_slug:subjectSlug||null,scope:'global'}
    try { if(talent) await update(talent.id,body); else await create(body); onClose() }
    catch(e){ setError(e instanceof Error ? e.message : 'Saqlab bo‘lmadi.') }
    finally { setSaving(false) }
  }

  return <BottomSheet title={talent ? 'Talentni tahrirlash' : 'Yangi Talent'} onClose={onClose} desktopWidth={620}>
    <div className="v6-talent-editor">
      <div className="v6-talent-preview" style={{'--talent-color':color} as CSSProperties}><span>{iconUrl?<img src={iconUrl} alt=""/>:emoji}</span><div><strong>{name||'Talent nomi'}</strong><p>{description||'Talent qanday fikrlashini qisqa yozing.'}</p></div></div>
      <Field label="Nomi" hint={`${name.length}/60`}><input className="input" value={name} maxLength={60} onChange={(e)=>setName(e.target.value)} placeholder="Masalan: Algebra mutaxassisi"/></Field>
      <Field label="Fan / mavzu"><select className="input" value={subjectSlug} onChange={(e)=>setSubjectSlug(e.target.value)}><option value="">Umumiy</option>{subjects.map((s)=><option key={s.id} value={s.slug}>{s.emoji} {s.name}</option>)}</select></Field>
      <Field label="Belgi yoki rasm"><div className="row" style={{flexWrap:'wrap',gap:7}}>{EMOJIS.map((e)=><button type="button" key={e} className="v6-emoji-choice" data-active={!iconUrl&&emoji===e} onClick={()=>{setEmoji(e);setIconUrl('')}}>{e}</button>)}<label className="v6-emoji-choice" title="Rasm yuklash"><Upload size={18}/><input type="file" accept="image/*" hidden onChange={(e)=>pickImage(e.target.files?.[0])}/></label></div></Field>
      <Field label="Svet rangi"><div className="row" style={{flexWrap:'wrap',gap:9}}>{COLORS.map((c)=><button type="button" key={c} className="v6-color-choice" data-active={color===c} style={{background:c}} onClick={()=>setColor(c)} aria-label={c}/>)}</div></Field>
      <Field label="Tavsif" hint={`${description.length}/500`}><textarea className="input" rows={3} maxLength={500} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Bu Talent nimani biladi, nimalarni aynan shu fan doirasida qabul qiladi?"/></Field>
      <div className="v6-refine-box"><div><strong><WandSparkles size={17}/> AI uchun maksimal yo‘riqnomaga aylantirish</strong><p className="micro">Tavsifni domain-lock qilingan, adashmaydigan Talent instructioniga aylantiradi.</p></div><button className="btn btn-outline" disabled={refining||description.trim().length<8} onClick={()=>void refine()}>{refining?'Qayta ishlanmoqda…':<><Sparkles size={15}/> Qayta ishlash</>}</button></div>
      <Field label="AI ko‘rsatmasi" hint={`${instructions.length}/5000`}><textarea className="input" rows={6} maxLength={5000} value={instructions} onChange={(e)=>setInstructions(e.target.value)} placeholder="AI qayta ishlagan qat’iy ko‘rsatma shu yerda paydo bo‘ladi."/></Field>
      {error&&<p role="alert" style={{color:'var(--danger)'}}>{error}</p>}
      <div className="row" style={{gap:8}}><button className="btn btn-outline" style={{flex:1}} onClick={onClose}>Bekor</button><button className="btn btn-primary" style={{flex:1}} disabled={saving||!name.trim()||!description.trim()} onClick={()=>void save()}>{saving?'Saqlanmoqda…':talent?'Saqlash':'Yaratish'}</button></div>
    </div>
  </BottomSheet>
}

function scopeLabel(s:Skill,projects:{id:string;name:string}[],subjects:Subject[]){if(s.scope==='project')return `Loyiha: ${projects.find((x)=>x.id===s.project_id)?.name??'tanlanmagan'}`;if(s.scope==='subject')return `Fan: ${subjects.find((x)=>x.id===s.subject_id)?.name??s.subject_slug??'tanlanmagan'}`;return 'Barcha chatlarda'}
function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}){return <label className="v6-field"><span>{label}{hint&&<small>{hint}</small>}</span>{children}</label>}
function SheetAction({icon,label,onClick,danger}:{icon:ReactNode;label:string;onClick:()=>void;danger?:boolean}){return <button className="v6-sheet-action" data-danger={danger||undefined} onClick={onClick}>{icon}{label}</button>}
