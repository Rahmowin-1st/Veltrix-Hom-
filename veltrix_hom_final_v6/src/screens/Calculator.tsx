import { useMemo, useState } from 'react'
import { ArrowLeft, Delete, Copy, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const KEYS = ['(',')','√','⌫','7','8','9','÷','4','5','6','×','1','2','3','−','0','.','%','+']

export default function Calculator() {
  const navigate = useNavigate()
  const [expr,setExpr]=useState('')
  const [memory,setMemory]=useState(0)
  const result=useMemo(()=>safeCalculate(expr),[expr])
  const press=(k:string)=>{
    if(k==='⌫') return setExpr(v=>Array.from(v).slice(0,-1).join(''))
    if(k==='√') return setExpr(v=>`${v}sqrt(`)
    setExpr(v=>v+k)
  }
  return <div className="v5-calculator-screen" data-scroll-root>
    <header className="v5-chat-header"><button className="v5-round-icon" onClick={()=>navigate(-1)}><ArrowLeft/></button><h1>Kalkulyator</h1><button className="v5-round-icon" onClick={()=>setExpr('')}><RotateCcw/></button></header>
    <main className="v5-calculator-card">
      <div className="v5-calculator-display">
        <textarea value={expr} onChange={e=>setExpr(e.target.value)} placeholder="Hisobni kiriting…" aria-label="Hisob"/>
        <div className="v5-calculator-result">{result.ok ? result.value : result.error}</div>
      </div>
      <div className="v5-calculator-memory"><button onClick={()=>setMemory(result.ok?Number(result.value):memory)}>M+</button><button onClick={()=>setExpr(v=>v+String(memory))}>MR</button><button onClick={()=>setMemory(0)}>MC</button><button onClick={()=>navigator.clipboard.writeText(result.ok?result.value:expr)}><Copy size={17}/> Nusxa</button></div>
      <div className="v5-calculator-grid">{KEYS.map(k=><button key={k} data-op={/[÷×−+%√()]/.test(k)} onClick={()=>press(k)}>{k==='⌫'?<Delete/>:k}</button>)}<button className="equals" onClick={()=>{if(result.ok)setExpr(result.value)}}>=</button></div>
    </main>
  </div>
}

type Token={type:'n'|'op'|'l'|'r'|'fn',value:string}
function safeCalculate(raw:string):{ok:true,value:string}|{ok:false,error:string}{
  if(!raw.trim()) return {ok:true,value:'0'}
  try{
    const tokens=tokenize(raw.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-'))
    let i=0
    const peek=()=>tokens[i]
    const eat=()=>tokens[i++]!
    const primary=():number=>{const t=eat(); if(!t)throw Error(); if(t.type==='n')return Number(t.value); if(t.type==='l'){const v=expr(); if(eat()?.type!=='r')throw Error(); return v} if(t.type==='fn'){if(eat()?.type!=='l')throw Error(); const v=expr(); if(eat()?.type!=='r')throw Error(); return Math.sqrt(v)} if(t.type==='op'&&t.value==='-')return -primary(); throw Error()}
    const power=():number=>{let v=primary(); while(peek()?.value==='^'){eat();v=Math.pow(v,primary())}return v}
    const term=():number=>{let v=power(); while(['*','/','%'].includes(peek()?.value??'')){const op=eat().value,n=power();v=op==='*'?v*n:op==='/'?v/n:v%n}return v}
    const expr=():number=>{let v=term(); while(['+','-'].includes(peek()?.value??'')){const op=eat().value,n=term();v=op==='+'?v+n:v-n}return v}
    const value=expr(); if(i!==tokens.length||!Number.isFinite(value))throw Error(); return {ok:true,value:Number(value.toPrecision(12)).toString()}
  }catch{return {ok:false,error:'Ifodani tekshiring'}}
}
function tokenize(s:string):Token[]{const out:Token[]=[];let i=0;while(i<s.length){const c=s[i]!;if(/\s/.test(c)){i++;continue}if(/[0-9.]/.test(c)){let n='';while(i<s.length&&/[0-9.]/.test(s[i]!))n+=s[i++];if((n.match(/\./g)||[]).length>1)throw Error();out.push({type:'n',value:n});continue}if(s.startsWith('sqrt',i)){out.push({type:'fn',value:'sqrt'});i+=4;continue}if('+-*/%^'.includes(c))out.push({type:'op',value:c});else if(c==='(')out.push({type:'l',value:c});else if(c===')')out.push({type:'r',value:c});else throw Error();i++}return out}
