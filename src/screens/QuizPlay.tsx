import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, CheckCircle2, Clock3, RotateCcw, XCircle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { quizApi } from '@/lib/api'
import { tap } from '@/lib/native'
import { useAuthStore } from '@/store/authStore'
import type { Quiz, QuizAttempt, QuizQuestion } from '@/types'

type DisplayQuestion = QuizQuestion & { displayOptions:string[]; displayToOriginal:number[] }
type AnswerState = { selected:number|null; correct:boolean; correctDisplayIndex:number; explanation:string|null; timedOut:boolean }

export default function QuizPlay(){
  const {quizId}=useParams();const navigate=useNavigate();const settings=useAuthStore((s)=>s.settings)
  const [quiz,setQuiz]=useState<Quiz|null>(null);const [attempt,setAttempt]=useState<QuizAttempt|null>(null);const [index,setIndex]=useState(0);const [answers,setAnswers]=useState<Record<string,AnswerState>>({});const [seconds,setSeconds]=useState<number|null>(null);const [totalSeconds,setTotalSeconds]=useState<number|null>(null);const [done,setDone]=useState<QuizAttempt|null>(null);const [error,setError]=useState<string|null>(null);const [confetti,setConfetti]=useState(false);const [wrongFlash,setWrongFlash]=useState(false);const processing=useRef(false)

  useEffect(()=>{if(!quizId)return;Promise.all([quizApi.get(quizId),quizApi.start(quizId)]).then(([q,a])=>{setQuiz(q.quiz);setAttempt(a.attempt);setSeconds(q.quiz.per_question_seconds);setTotalSeconds(q.quiz.total_seconds)}).catch((e)=>setError(e instanceof Error?e.message:'Test ochilmadi.'))},[quizId])

  const questions=useMemo(()=>{if(!quiz?.questions)return[];let list=[...quiz.questions];if(quiz.shuffle_questions)list=shuffle(list);return list.map((question)=>makeDisplayQuestion(question,quiz.shuffle_options))},[quiz])
  const current=questions[index];const answer=current?answers[current.id]:undefined

  useEffect(()=>{if(!quiz?.per_question_seconds||!current||answer||done)return;setSeconds(quiz.per_question_seconds);const timer=window.setInterval(()=>setSeconds((value)=>{if(value===null)return null;if(value<=1){window.clearInterval(timer);window.setTimeout(()=>void submit(null,true),0);return 0}return value-1}),1000);return()=>window.clearInterval(timer)},[current?.id,answer?.selected,done,quiz?.per_question_seconds]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!quiz?.total_seconds||done)return;const timer=window.setInterval(()=>setTotalSeconds((value)=>{if(value===null)return null;if(value<=1){window.clearInterval(timer);window.setTimeout(()=>void finish(),0);return 0}return value-1}),1000);return()=>window.clearInterval(timer)},[quiz?.total_seconds,done]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit=async(selectedDisplay:number|null,timedOut=false)=>{
    if(!current||!attempt||processing.current||answers[current.id])return;processing.current=true
    const selectedOriginal=selectedDisplay===null?null:current.displayToOriginal[selectedDisplay]??null
    try{const result=await quizApi.answer(attempt.id,{questionId:current.id,selectedIndex:selectedOriginal,timedOut,elapsedSeconds:quiz?.per_question_seconds&&seconds!==null?quiz.per_question_seconds-seconds:null});const correctDisplayIndex=current.displayToOriginal.indexOf(result.correctIndex);setAnswers((all)=>({...all,[current.id]:{selected:selectedDisplay,correct:result.correct,correctDisplayIndex,explanation:result.explanation,timedOut}}));if(result.correct){if(settings?.confetti_enabled!==false)setConfetti(true);void tap('light');window.setTimeout(()=>setConfetti(false),1650)}else{setWrongFlash(true);if(settings?.wrong_answer_haptics!==false){if(navigator.vibrate)navigator.vibrate([90,45,120]);void tap('medium')}window.setTimeout(()=>setWrongFlash(false),760)}window.setTimeout(()=>{if(index>=questions.length-1)void finish();else setIndex((i)=>i+1)},1700)}catch(e){setError(e instanceof Error?e.message:'Javob saqlanmadi.')}finally{processing.current=false}
  }
  const finish=async()=>{if(!attempt||done||processing.current)return;processing.current=true;try{const {attempt:completed}=await quizApi.complete(attempt.id);setDone(completed)}catch(e){setError(e instanceof Error?e.message:'Natija saqlanmadi.')}finally{processing.current=false}}
  const restart=async()=>{if(!quizId||processing.current)return;processing.current=true;try{const {attempt:next}=await quizApi.start(quizId);setAttempt(next);setIndex(0);setAnswers({});setDone(null);setError(null);setSeconds(quiz?.per_question_seconds??null);setTotalSeconds(quiz?.total_seconds??null)}catch(e){setError(e instanceof Error?e.message:'Test qayta boshlanmadi.')}finally{processing.current=false}}

  if(error&&!quiz)return <div className="v5-quiz-page" style={{display:'grid',placeItems:'center',padding:24}}><div className="v5-quiz-card" style={{maxWidth:480,textAlign:'center'}}><XCircle size={42} style={{color:'var(--danger)'}}/><h1 style={{marginTop:10}}>Test ochilmadi</h1><p className="muted">{error}</p><button className="btn btn-primary" onClick={()=>navigate('/testlar')}>Orqaga</button></div></div>
  if(!quiz||!attempt||!current)return <div className="v5-quiz-page" style={{padding:20}}><div className="skeleton" style={{height:'85vh',borderRadius:32}}/></div>
  if(done)return <Result quiz={quiz} attempt={done} onAgain={()=>void restart()} onClose={()=>navigate('/testlar')}/>

  const progress=((index+1)/questions.length)*100
  return <div className={`v5-quiz-page ${wrongFlash?'v5-wrong-flash':''}`}>
    {confetti&&<Confetti/>}
    <header className="v5-chat-header"><button className="v5-round-icon" onClick={()=>navigate('/testlar')}><ArrowLeft/></button><div className="v5-chat-title"><span className="v5-source-icon" style={{'--source-color':quiz.background_color,width:38,height:38,fontSize:18} as React.CSSProperties}>{quiz.icon}</span><span className="truncate">{quiz.title}</span></div><div className="row" style={{gap:5}}>{totalSeconds!==null&&<span className="chip"><Clock3 size={14}/>{formatTime(totalSeconds)}</span>}</div></header>
    <div className="hide-sb" style={{flex:1,overflow:'auto',padding:'18px 14px calc(var(--safe-bottom) + 22px)',display:'grid',placeItems:'center'}}>
      <motion.article key={current.id} className={`v5-quiz-card ${answer?.correct?'v5-correct-flash':''}`} initial={{opacity:0,x:38,scale:.985}} animate={{opacity:1,x:0,scale:1}} exit={{opacity:0,x:-38}} transition={{duration:.32,ease:[.16,1,.3,1]}} style={{width:'min(680px,100%)','--quiz-color':quiz.background_color} as React.CSSProperties}>
        {quiz.cover_url&&<img src={quiz.cover_url} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:.055,pointerEvents:'none'}}/>}
        <div style={{position:'relative'}}>
          <div className="row" style={{justifyContent:'space-between'}}><span className="chip chip-strong">{index+1} / {questions.length}</span>{seconds!==null&&<span className="chip" style={{color:seconds<=5?'var(--danger)':'var(--text-2)'}}><Clock3 size={14}/>{seconds}s</span>}</div>
          <div style={{height:7,borderRadius:999,background:'var(--surface-3)',overflow:'hidden',margin:'14px 0 24px'}}><motion.div animate={{width:`${progress}%`}} style={{height:'100%',background:`linear-gradient(90deg,${quiz.background_color},var(--v5-accent-2))`,borderRadius:'inherit'}}/></div>
          <h1 style={{fontSize:'clamp(23px,6vw,34px)',lineHeight:1.25,textWrap:'balance'}}>{current.question}</h1>
          <div style={{display:'grid',gap:10,marginTop:24}}>{current.displayOptions.map((option,optionIndex)=>{let state='';if(answer){if(answer.correct&&answer.selected===optionIndex)state='correct';else if(!answer.correct&&answer.selected===optionIndex)state='wrong';else if(!answer.correct&&answer.correctDisplayIndex===optionIndex)state='reveal'}return <button key={`${option}-${optionIndex}`} className="v5-answer-option" data-state={state} disabled={Boolean(answer)} onClick={()=>void submit(optionIndex,false)}><span className="chip" style={{width:31,height:31,justifyContent:'center',padding:0}}>{String.fromCharCode(65+optionIndex)}</span><span>{option}</span>{state==='correct'&&<CheckCircle2 size={19} style={{marginLeft:'auto'}}/>}{state==='wrong'&&<XCircle size={19} style={{marginLeft:'auto'}}/>}</button>})}</div>
          {answer&&<motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="surface-2" style={{marginTop:14,padding:13,borderRadius:19}}><strong>{answer.timedOut?'Vaqt tugadi':answer.correct?'To‘g‘ri! 🎉':'Xato javob'}</strong>{answer.explanation&&<p className="micro" style={{marginTop:5}}>{answer.explanation}</p>}<span className="micro" style={{display:'block',marginTop:7}}>Keyingi savol avtomatik ochiladi…</span></motion.div>}
        </div>
      </motion.article>
    </div>
  </div>
}

function Result({quiz,attempt,onAgain,onClose}:{quiz:Quiz;attempt:QuizAttempt;onAgain:()=>void;onClose:()=>void}){const percent=attempt.max_score?Math.round(attempt.score/attempt.max_score*100):0;return <div className="v5-quiz-page" style={{display:'grid',placeItems:'center',padding:20}}><motion.div className="v5-quiz-card" initial={{opacity:0,scale:.92}} animate={{opacity:1,scale:1}} style={{width:'min(540px,100%)',textAlign:'center'}}><span className="v5-source-icon" style={{'--source-color':quiz.background_color,width:88,height:88,fontSize:40,margin:'0 auto'} as React.CSSProperties}>{percent>=80?'🏆':percent>=50?'😎':'🧩'}</span><h1 style={{fontSize:34,marginTop:17}}>Test yakunlandi</h1><p className="muted">{quiz.title}</p><div className="v5-stats-grid" style={{marginTop:20,textAlign:'left'}}><div className="v5-stat-card"><div className="v5-stat-value">{percent}%</div><span className="micro">Natija</span></div><div className="v5-stat-card"><div className="v5-stat-value">{attempt.correct_count}</div><span className="micro">To‘g‘ri</span></div><div className="v5-stat-card"><div className="v5-stat-value">{attempt.wrong_count}</div><span className="micro">Xato</span></div><div className="v5-stat-card"><div className="v5-stat-value">{attempt.unanswered_count}</div><span className="micro">Javobsiz</span></div></div><div className="row" style={{gap:8,marginTop:20}}><button className="btn btn-outline" style={{flex:1}} onClick={onClose}>Testlarim</button><button className="btn btn-primary" style={{flex:1}} onClick={onAgain}><RotateCcw size={17}/> Qayta</button></div></motion.div></div>}
function Confetti(){return <div className="v5-confetti">{Array.from({length:34},(_,i)=><i key={i} style={{left:`${(i*37)%100}%`,'--drift':`${(i%2?1:-1)*(20+(i%6)*9)}px`,animationDelay:`${(i%8)*35}ms`,fontSize:`${13+(i%5)*3}px`} as React.CSSProperties}>{i%3===0?'🎊':i%3===1?'🎉':'✨'}</i>)}</div>}
function makeDisplayQuestion(q:QuizQuestion,shuffleOptions:boolean):DisplayQuestion{const indexes=q.options.map((_,i)=>i);const order=shuffleOptions?shuffle(indexes):indexes;return{...q,displayOptions:order.map((i)=>q.options[i]??''),displayToOriginal:order}}
function shuffle<T>(array:T[]):T[]{const copy=[...array];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j]!,copy[i]!]}return copy}
function formatTime(seconds:number){const m=Math.floor(seconds/60);const s=seconds%60;return`${m}:${String(s).padStart(2,'0')}`}
