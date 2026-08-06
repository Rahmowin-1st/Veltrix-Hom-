import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, Clock3, ImagePlus, MoreVertical, Pencil, Play, Plus, Search, Shuffle, Sparkles, Trash2, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { EmptyState } from '@/components/ui/EmptyState'
import { quizApi, type CreateQuizInput, type QuizQuestionInput } from '@/lib/api'
import type { Quiz } from '@/types'
import { useAuthStore } from '@/store/authStore'

const EMOJIS = ['🧠','⚡','🔥','🎯','📐','🧪','🌿','🌍','📚','💻','🧩','🚀','🏆','✨']
const COLORS = ['#0A6CFF','#20A6F2','#8B5CF6','#EF3F5B','#FF7A18','#E4B400','#18A567','#0E8F52']

export default function Quizzes() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const [params, setParams] = useSearchParams()
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState(false)
  const [menu, setMenu] = useState<Quiz|null>(null)

  const refresh = () => quizApi.list().then((r) => setQuizzes(r.quizzes)).catch(()=>{}).finally(()=>setLoading(false))
  useEffect(() => { setQuizzes([]); setLoading(true); if (userId) void refresh(); else setLoading(false) }, [userId])
  useEffect(() => { if (params.get('create') === '1') setEditor(true) }, [params])
  const closeEditor = () => { setEditor(false); if (params.has('create')) { params.delete('create'); setParams(params, { replace:true }) } }
  const filtered = useMemo(() => { const q=query.trim().toLowerCase(); return q ? quizzes.filter((quiz)=>`${quiz.title} ${quiz.description??''}`.toLowerCase().includes(q)) : quizzes }, [quizzes,query])
  const remove = async (quiz:Quiz) => { setQuizzes((all)=>all.filter((item)=>item.id!==quiz.id)); setMenu(null); try { await quizApi.remove(quiz.id) } catch { void refresh() } }

  return <div data-scroll-root className="hide-sb" style={{ flex:1, overflow:'auto', padding:'18px 14px calc(var(--safe-bottom) + 30px)' }}>
    <div style={{ width:'min(900px,100%)', margin:'0 auto', display:'grid', gap:16 }}>
      <header className="row" style={{ alignItems:'flex-end', gap:12 }}><div><p className="micro">PERSONAL · TESTLAR</p><h1 style={{ fontSize:'clamp(30px,8vw,46px)' }}>Mening testlarim</h1><p className="muted">AI bilan yoki qo‘lda yarating. Natijalar hisobda saqlanadi.</p></div><button className="btn btn-primary" style={{ marginLeft:'auto', borderRadius:18 }} onClick={()=>setEditor(true)}><Plus size={18}/> Yangi</button></header>
      <label className="surface-2 row" style={{ height:48, padding:'0 13px', borderRadius:19 }}><Search size={18} style={{ color:'var(--text-3)' }}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Test qidirish…" style={{ flex:1, border:0, outline:0, background:'transparent', color:'var(--text)', font:'inherit' }}/></label>

      {loading ? <div className="v5-modes-grid">{[1,2,3,4].map((x)=><div key={x} className="skeleton" style={{ height:190 }}/>)}</div>
      : filtered.length===0 ? <EmptyState emoji="🧠" title="Hozircha test yo‘q" body="Birinchi testingizni AI bilan yoki qo‘lda yarating." action={<button className="btn btn-primary" onClick={()=>setEditor(true)}><Plus size={17}/> Test yaratish</button>}/>
      : <div className="v5-modes-grid">{filtered.map((quiz,index)=><motion.article key={quiz.id} className="v5-mode-card" style={{ '--mode-color':quiz.background_color, minHeight:210 } as React.CSSProperties} initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:Math.min(index*.04,.2)}}>
          {quiz.cover_url && <img src={quiz.cover_url} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:.12 }}/>} 
          <div className="row" style={{ position:'relative' }}><span className="v5-source-icon" style={{ '--source-color':quiz.background_color, width:52,height:52,fontSize:23 } as React.CSSProperties}>{quiz.icon}</span><button className="v5-round-icon" style={{ marginLeft:'auto',width:39,height:39 }} onClick={()=>setMenu(quiz)}><MoreVertical size={18}/></button></div>
          <div style={{ position:'relative', marginTop:14 }}><h2 style={{fontSize:19}}>{quiz.title}</h2>{quiz.description&&<p className="micro clamp-2" style={{marginTop:4}}>{quiz.description}</p>}</div>
          <div className="row hide-sb" style={{ position:'relative', gap:5, marginTop:12, overflowX:'auto' }}><span className="chip">{quiz.question_count} savol</span>{quiz.per_question_seconds&&<span className="chip"><Clock3 size={13}/>{quiz.per_question_seconds}s</span>}{quiz.shuffle_questions&&<span className="chip"><Shuffle size={13}/> Aralash</span>}</div>
          <button className="btn btn-primary" style={{ position:'relative', marginTop:'auto', width:'100%', borderRadius:17 }} onClick={()=>navigate(`/test/${quiz.id}`)}><Play size={17}/> Boshlash</button>
        </motion.article>)}</div>}
    </div>

    <AnimatePresence>
      {editor&&<QuizEditor onClose={closeEditor} onCreated={(quiz)=>{setQuizzes((all)=>[quiz,...all]);closeEditor()}}/>}
      {menu&&<BottomSheet title={menu.title} onClose={()=>setMenu(null)} desktopWidth={380}><div style={{display:'grid',gap:4}}><button className="v5-picker-item" onClick={()=>navigate(`/test/${menu.id}`)}><Play/> Boshlash</button><button className="v5-picker-item" disabled><Pencil/> Tahrirlash <span className="micro" style={{marginLeft:'auto'}}>keyingi versiya</span></button><button className="v5-picker-item" style={{color:'var(--danger)'}} onClick={()=>void remove(menu)}><Trash2/> O‘chirish</button></div></BottomSheet>}
    </AnimatePresence>
  </div>
}

function QuizEditor({ onClose, onCreated }: { onClose:()=>void; onCreated:(quiz:Quiz)=>void }) {
  const fileRef=useRef<HTMLInputElement>(null)
  const [mode,setMode]=useState<'ai'|'manual'>('ai')
  const [title,setTitle]=useState('')
  const [description,setDescription]=useState('')
  const [icon,setIcon]=useState('🧠')
  const [color,setColor]=useState('#0A6CFF')
  const [cover,setCover]=useState<string|null>(null)
  const [prompt,setPrompt]=useState('')
  const [count,setCount]=useState(10)
  const [perQuestion,setPerQuestion]=useState<number|null>(null)
  const [total,setTotal]=useState<number|null>(null)
  const [shuffleQuestions,setShuffleQuestions]=useState(true)
  const [shuffleOptions,setShuffleOptions]=useState(true)
  const [questions,setQuestions]=useState<QuizQuestionInput[]>([blankQuestion()])
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState<string|null>(null)

  const save=async()=>{
    if(!title.trim()){setError('Test nomini kiriting.');return}
    if(mode==='ai'&&!prompt.trim()){setError('AI uchun mavzu yoki ko‘rsatma kiriting.');return}
    if(mode==='manual'&&questions.some((q)=>!q.question.trim()||q.options.some((o)=>!o.trim()))){setError('Barcha savol va variantlarni to‘ldiring.');return}
    setSaving(true);setError(null)
    const body:CreateQuizInput={title:title.trim(),description:description.trim()||null,icon,cover_url:cover,background_color:color,generation_mode:mode,prompt:mode==='ai'?prompt.trim():null,question_count:mode==='ai'?count:questions.length,per_question_seconds:perQuestion,total_seconds:total,shuffle_questions:shuffleQuestions,shuffle_options:shuffleOptions,questions:mode==='manual'?questions:undefined}
    try{const {quiz}=await quizApi.create(body);onCreated(quiz)}catch(e){setError(e instanceof Error?e.message:'Test yaratilmadi.')}finally{setSaving(false)}
  }
  const updateQuestion=(index:number,patch:Partial<QuizQuestionInput>)=>setQuestions((all)=>all.map((q,i)=>i===index?{...q,...patch}:q))
  const readCover=async(file:File)=>{try{setCover(await compressImage(file))}catch{setError('Rasmni o‘qib bo‘lmadi.')}}

  return <BottomSheet title="Yangi test" onClose={onClose} desktopWidth={650}>
    <div style={{display:'grid',gap:15}}>
      <div className="row surface-2" style={{padding:4,borderRadius:18}}>{(['ai','manual'] as const).map((value)=><button key={value} className={mode===value?'btn btn-primary':'btn btn-ghost'} style={{flex:1,borderRadius:15}} onClick={()=>setMode(value)}>{value==='ai'?<><Bot size={17}/> AI bilan</>:<><Pencil size={17}/> Qo‘lda</>}</button>)}</div>
      <div className="row" style={{gap:10,alignItems:'flex-start'}}><button className="v5-source-icon" style={{'--source-color':color,width:74,height:74,fontSize:31,flex:'0 0 74px',overflow:'hidden'} as React.CSSProperties} onClick={()=>fileRef.current?.click()}>{cover?<img src={cover} alt="Test rasmi" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:icon}</button><div style={{display:'grid',gap:8,flex:1}}><input className="input" value={title} maxLength={15} onChange={(e)=>setTitle(e.target.value)} placeholder="Test nomi (15 ta belgi)"/><input className="input" value={description} maxLength={50} onChange={(e)=>setDescription(e.target.value)} placeholder="Tavsif — ixtiyoriy (50 ta)"/></div></div>
      <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>{const f=e.target.files?.[0];if(f)void readCover(f);e.currentTarget.value=''}}/>
      <div><span className="micro">Belgi yoki foto</span><div className="row hide-sb" style={{gap:6,overflowX:'auto',paddingTop:6}}>{EMOJIS.map((e)=><button key={e} className="v5-round-icon" data-active={icon===e} onClick={()=>{setIcon(e);setCover(null)}}>{e}</button>)}<button className="v5-round-icon" onClick={()=>fileRef.current?.click()}><ImagePlus size={18}/></button></div></div>
      <div><span className="micro">Fon svet rangi</span><div className="row" style={{gap:7,flexWrap:'wrap',paddingTop:7}}>{COLORS.map((c)=><button key={c} onClick={()=>setColor(c)} aria-label={c} style={{width:34,height:34,borderRadius:'50%',background:c,border:color===c?'3px solid white':'0',boxShadow:color===c?`0 0 0 3px ${c}`:'none'}}/>)}</div></div>

      {mode==='ai'?<><label style={{display:'grid',gap:6}}><span className="micro">AI ga ko‘rsatma</span><textarea className="input" rows={4} value={prompt} onChange={(e)=>setPrompt(e.target.value)} placeholder="Masalan: 8-sinf algebra, chiziqli tenglamalar, o‘rtacha qiyinlik…"/></label><label className="row" style={{justifyContent:'space-between'}}><span>Savollar soni</span><input className="input" type="number" min={1} max={50} value={count} onChange={(e)=>setCount(Math.max(1,Math.min(50,Number(e.target.value))))} style={{width:90}}/></label></>
      :<div style={{display:'grid',gap:12}}>{questions.map((q,index)=><div key={index} className="surface-2" style={{padding:12,borderRadius:20,display:'grid',gap:8}}><div className="row"><strong>{index+1}-savol</strong>{questions.length>1&&<button className="v5-action-chip" style={{marginLeft:'auto',color:'var(--danger)'}} onClick={()=>setQuestions((all)=>all.filter((_,i)=>i!==index))}><X size={14}/> Olib tashlash</button>}</div><textarea className="input" rows={2} value={q.question} onChange={(e)=>updateQuestion(index,{question:e.target.value})} placeholder="Savol"/>{q.options.map((option,optionIndex)=><label key={optionIndex} className="row" style={{gap:8}}><input type="radio" checked={q.correctIndex===optionIndex} onChange={()=>updateQuestion(index,{correctIndex:optionIndex})}/><input className="input" value={option} onChange={(e)=>{const options=[...q.options];options[optionIndex]=e.target.value;updateQuestion(index,{options})}} placeholder={`${optionIndex+1}-variant`}/></label>)}</div>)}<button className="btn btn-outline" onClick={()=>setQuestions((all)=>[...all,blankQuestion()])}><Plus size={17}/> Savol qo‘shish</button></div>}

      <div className="surface-2" style={{padding:13,borderRadius:21,display:'grid',gap:11}}><strong>Vaqt va aralashtirish</strong><label className="row"><span style={{flex:1}}>Har savol uchun vaqt</span><input className="input" type="number" min={5} placeholder="sekund" value={perQuestion??''} onChange={(e)=>setPerQuestion(e.target.value?Number(e.target.value):null)} style={{width:110}}/></label><label className="row"><span style={{flex:1}}>Butun test vaqti</span><input className="input" type="number" min={10} placeholder="sekund" value={total??''} onChange={(e)=>setTotal(e.target.value?Number(e.target.value):null)} style={{width:110}}/></label><Toggle label="Savollarni har safar aralashtirish" value={shuffleQuestions} setValue={setShuffleQuestions}/><Toggle label="Variantlarni aralashtirish" value={shuffleOptions} setValue={setShuffleOptions}/></div>
      {error&&<p role="alert" style={{color:'var(--danger)',margin:0}}>{error}</p>}
      <button className="btn btn-primary" style={{minHeight:52,borderRadius:19}} onClick={()=>void save()} disabled={saving}><Sparkles size={18}/>{saving?'Yaratilmoqda…':'Testni yaratish'}</button>
    </div>
  </BottomSheet>
}

function Toggle({label,value,setValue}:{label:string;value:boolean;setValue:(value:boolean)=>void}){return <label className="row"><span style={{flex:1}}>{label}</span><button type="button" className="switch" data-on={value} aria-pressed={value} onClick={()=>setValue(!value)}><span/></button></label>}
function blankQuestion():QuizQuestionInput{return{question:'',options:['','','',''],correctIndex:0,explanation:null,points:1}}
async function compressImage(file:File):Promise<string>{return new Promise((resolve,reject)=>{const image=new Image();const url=URL.createObjectURL(file);image.onload=()=>{const max=640;const scale=Math.min(1,max/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d')?.drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.76))};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('image'))};image.src=url})}
