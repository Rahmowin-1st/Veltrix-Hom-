
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Bell, BookOpen, ChevronRight, Gauge, Languages, LibraryBig, Mic2, Palette, ShieldCheck, SlidersHorizontal, Sparkles, UserCircle2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SettingsPanel, type GroupId } from '@/components/settings/SettingsPanel'

const GROUPS: { id:GroupId; title:string; description:string; icon:React.ReactNode; color:string }[] = [
  {id:'account',title:'Hisob',description:'Profil va kirish',icon:<UserCircle2/>,color:'#0A6CFF'},
  {id:'profile',title:'Profil',description:'Ism, sinf, ta’lim tili',icon:<UserCircle2/>,color:'#20A6F2'},
  {id:'ai',title:'AI javoblari',description:'Uslub, uzunlik va manba',icon:<SlidersHorizontal/>,color:'#8B5CF6'},
  {id:'voice',title:'Ovoz',description:'Diktor, tezlik va o‘qish',icon:<Mic2/>,color:'#15A66A'},
  {id:'translate',title:'Tarjima',description:'Standart tillar va o‘qish',icon:<Languages/>,color:'#2680F0'},
  {id:'subjects',title:'Fanlar',description:'Sinf va fanlar katalogi',icon:<BookOpen/>,color:'#D99B18'},
  {id:'sources',title:'Manbalar',description:'Yuklangan kitoblar',icon:<LibraryBig/>,color:'#21B7D7'},
  {id:'skills',title:'Talentlar',description:'Claude uslubidagi AI talentlari',icon:<Sparkles/>,color:'#D5366A'},
  {id:'appearance',title:'Ko‘rinish',description:'Gradient, svet, fon va mavzu',icon:<Palette/>,color:'#8B5CF6'},
  {id:'notifications',title:'Bildirishnoma',description:'Tebranish va signallar',icon:<Bell/>,color:'#EF3F5B'},
  {id:'performance',title:'Tezlik',description:'Kesh va animatsiya',icon:<Gauge/>,color:'#FF7A18'},
  {id:'privacy',title:'Maxfiylik',description:'Hisob ma’lumotlari va xavfsizlik',icon:<ShieldCheck/>,color:'#0E8F52'},
]

export default function Settings(){
  const navigate=useNavigate(); const [params,setParams]=useSearchParams();
  const section=params.get('section') as GroupId|null; const active=GROUPS.some((g)=>g.id===section)?section:null; const selected=GROUPS.find((group)=>group.id===active)
  const openSection=(id:GroupId)=>{const next=new URLSearchParams(params);next.set('section',id);setParams(next)}
  const closeSection=()=>{const index=Number(window.history.state?.idx??0);if(index>0)navigate(-1);else{const next=new URLSearchParams(params);next.delete('section');setParams(next,{replace:true})}}
  return <div style={{flex:1,minHeight:0}}>
    <div data-scroll-root className="v5-settings-root hide-sb"><div className="v5-settings-list"><header style={{padding:'4px 6px 12px'}}><p className="micro">VELTRIX HOM</p><h1 style={{fontSize:'clamp(31px,8vw,44px)'}}>Sozlamalar</h1><p className="muted">Barcha tanlovlar hisobingizga saqlanadi.</p></header>{GROUPS.map((group)=><motion.button key={group.id} className="v5-settings-row" whileTap={{scale:.985}} onClick={()=>openSection(group.id)}><span className="v5-source-icon" style={{'--source-color':group.color,width:48,height:48} as React.CSSProperties}>{group.icon}</span><span className="col" style={{gap:3,minWidth:0}}><strong>{group.title}</strong><span className="micro truncate">{group.description}</span></span><ChevronRight size={20} style={{color:'var(--text-3)'}}/></motion.button>)}</div></div>
    <AnimatePresence>{active&&selected&&<motion.section className="v5-settings-subpage" initial={{x:'100%',opacity:.75}} animate={{x:0,opacity:1}} exit={{x:'100%',opacity:.65}} transition={{duration:.25,ease:[.16,1,.3,1]}}><header className="v5-settings-subhead"><button className="v5-round-icon" onClick={closeSection} aria-label="Orqaga"><ArrowLeft/></button><span className="v5-source-icon" style={{'--source-color':selected.color,width:40,height:40} as React.CSSProperties}>{selected.icon}</span><h1 style={{fontSize:21}}>{selected.title}</h1></header><div data-scroll-root className="v5-settings-content hide-sb"><div style={{width:'min(720px,100%)',margin:'0 auto'}}><SettingsPanel group={active} onNavigate={(to)=>navigate(to)}/></div></div></motion.section>}</AnimatePresence>
  </div>
}
