package com.veltrix.calculator.core

import java.math.BigDecimal
import kotlin.math.*

internal class PolynomialEngine {
    fun tryCalculate(input:String, expression:ExpressionEngine, settings:EngineSettings):CalculationResult? {
        val s=input.trim()
        Regex("(?i)^(?:roots|polynomial roots|solve polynomial)\\s+(.+)$").matchEntire(s)?.let { m ->
            val node=expression.parse(m.groupValues[1]); val variable=node.vars().singleOrNull()?:return CalculationResult.fail(input,CalculationType.POLYNOMIAL,"VARIABLES","Polynomial must contain exactly one variable")
            return rootsResult(input,node,variable,settings)
        }
        return null
    }

    fun solveEquation(input:String,left:Node,right:Node,settings:EngineSettings):CalculationResult? {
        val vars=(left.vars()+right.vars()).toList()
        if(vars.size!=1)return null
        val node=Bin(left,'-',right); val coeff=extract(node,vars[0])?:return null
        if(coeff.size<=1)return null
        val result=rootsResult(input,node,vars[0],settings)
        if(!result.isSuccess) return result
        val labeled=result.primary.split(", ").joinToString(", "){ "${vars[0]} = $it" }
        return result.copy(type=CalculationType.ALGEBRA,primary=labeled)
    }

    fun extract(node:Node, variable:String):DoubleArray? {
        fun trim(a:DoubleArray):DoubleArray{var n=a.size;while(n>1&&abs(a[n-1])<1e-13)n--;return a.copyOf(n)}
        fun add(a:DoubleArray,b:DoubleArray,sign:Double=1.0):DoubleArray{val n=max(a.size,b.size);return trim(DoubleArray(n){i->(a.getOrNull(i)?:0.0)+sign*(b.getOrNull(i)?:0.0)})}
        fun mul(a:DoubleArray,b:DoubleArray):DoubleArray{if(a.size+b.size-1>33)return doubleArrayOf(Double.NaN);val o=DoubleArray(a.size+b.size-1);for(i in a.indices)for(j in b.indices)o[i+j]+=a[i]*b[j];return trim(o)}
        fun rec(n:Node):DoubleArray? {
            return when(n){
                is Num -> doubleArrayOf(n.value.toDouble())
                is Var -> if(n.name==variable) doubleArrayOf(0.0,1.0) else try { doubleArrayOf(n.eval(Ctx(EngineSettings())).toDouble()) } catch(_:Exception){ null }
                is Unary -> rec(n.node)?.let { a -> if(n.op=='-') DoubleArray(a.size){-a[it]} else a }
                is Pct -> rec(n.node)?.let { a -> DoubleArray(a.size){a[it]/100.0} }
                is Fact -> if(n.vars().isEmpty()) doubleArrayOf(n.eval(Ctx(EngineSettings())).toDouble()) else null
                is Fn -> if(n.vars().isEmpty()) doubleArrayOf(n.eval(Ctx(EngineSettings())).toDouble()) else null
                is Bin -> {
                    val a=rec(n.left) ?: return null
                    val b=rec(n.right) ?: return null
                    when(n.op){
                        '+' -> add(a,b)
                        '-' -> add(a,b,-1.0)
                        '*' -> mul(a,b)
                        '/' -> { if(b.size!=1 || abs(b[0])<1e-15) null else DoubleArray(a.size){a[it]/b[0]} }
                        '^' -> {
                            if(b.size!=1) return null
                            val power=b[0].roundToInt()
                            if(abs(b[0]-power)>1e-12 || power<0 || power>32) return null
                            var out=doubleArrayOf(1.0)
                            repeat(power){ out=mul(out,a); if(out.any{!it.isFinite()}) return null }
                            out
                        }
                        else -> null
                    }
                }
                else -> null
            }
        }
        return rec(node)?.takeIf{it.none{v->!v.isFinite()}}
    }

    private fun rootsResult(input:String,node:Node,variable:String,settings:EngineSettings):CalculationResult {
        val c=extract(node,variable)?:return CalculationResult.fail(input,CalculationType.POLYNOMIAL,"NOT_POLYNOMIAL","Expression is not a supported polynomial")
        val degree=c.size-1
        if(degree<1)return CalculationResult.fail(input,CalculationType.POLYNOMIAL,"CONSTANT","Polynomial has no variable term")
        val roots=durandKerner(c)
        val formatted=roots.sortedWith(compareBy<ComplexNumber>{it.re}.thenBy{it.im}).joinToString(", "){ComplexEngine.formatComplex(it,settings)}
        return CalculationResult(input,CalculationType.POLYNOMIAL,formatted,approximate=formatted,derived=mapOf("variable" to variable,"degree" to degree.toString(),"root_count" to roots.size.toString(),"coefficients" to c.reversed().joinToString(","){ComplexEngine.formatDouble(it,settings)}),steps=listOf("Extracted polynomial coefficients","Solved all ${roots.size} roots numerically in the complex plane"))
    }

    private fun durandKerner(coeffAsc:DoubleArray):List<ComplexNumber>{
        val n=coeffAsc.size-1;val lead=coeffAsc[n];if(abs(lead)<1e-15)throw CalcEx("POLYNOMIAL","Leading coefficient is zero")
        if(n==1)return listOf(ComplexNumber(-coeffAsc[0]/lead))
        val a=DoubleArray(n+1){coeffAsc[it]/lead};val radius=1.0+(0 until n).maxOf{abs(a[it])}
        val roots=MutableList(n){k->val angle=2*Math.PI*k/n+0.37;ComplexNumber(radius*cos(angle),radius*sin(angle))}
        fun eval(z:ComplexNumber):ComplexNumber{var r=ComplexNumber(a[n]);for(i in n-1 downTo 0)r=r*z+ComplexNumber(a[i]);return r}
        repeat(1500){var maxDelta=0.0;val next=roots.toMutableList();for(i in 0 until n){var denom=ComplexNumber(1.0);for(j in 0 until n)if(i!=j)denom*=roots[i]-roots[j];if(denom.absValue()<1e-20)denom+=ComplexNumber(1e-12,1e-12);val delta=eval(roots[i])/denom;next[i]=roots[i]-delta;maxDelta=max(maxDelta,delta.absValue())};for(i in 0 until n)roots[i]=next[i];if(maxDelta<1e-12)return roots.map(::cleanRoot)}
        return roots.map(::cleanRoot)
    }
    private fun cleanRoot(z:ComplexNumber):ComplexNumber{fun c(v:Double):Double{val r=round(v);return if(abs(v-r)<1e-10)r else if(abs(v)<1e-12)0.0 else v};return ComplexNumber(c(z.re),c(z.im))}
}

internal class SymbolicEngine(private val polynomial:PolynomialEngine) {
    fun tryCalculate(input:String, expression:ExpressionEngine, settings:EngineSettings):CalculationResult? {
        val s=input.trim()
        Regex("(?i)^(?:differentiate|symbolic derivative|derive)\\s+(.+?)(?:\\s+with respect to\\s+([A-Za-z][A-Za-z0-9_]*))?$").matchEntire(s)?.let{m->
            val node=expression.parse(m.groupValues[1]);val v=m.groupValues[2].ifBlank{node.vars().singleOrNull()?:"x"};val d=differentiate(node,v)?:return CalculationResult.fail(input,CalculationType.CALCULUS,"SYMBOLIC_UNSUPPORTED","Symbolic derivative is not supported for this expression")
            val simp=simplify(d);return CalculationResult(input,CalculationType.CALCULUS,render(simp),exact=render(simp),derived=mapOf("variable" to v),steps=listOf("Applied deterministic symbolic differentiation rules","Simplified derivative tree"))
        }
        Regex("(?i)^(?:integrate|symbolic integral|antiderivative)\\s+(.+?)(?:\\s+with respect to\\s+([A-Za-z][A-Za-z0-9_]*))?$").matchEntire(s)?.let{m->
            val node=expression.parse(m.groupValues[1]);val v=m.groupValues[2].ifBlank{node.vars().singleOrNull()?:"x"};val c=polynomial.extract(node,v)?:return CalculationResult.fail(input,CalculationType.CALCULUS,"SYMBOLIC_UNSUPPORTED","Symbolic integration currently supports polynomial expressions")
            val terms=mutableListOf<String>();for(i in c.indices){val a=c[i]/(i+1);if(abs(a)<1e-14)continue;val p=i+1;val term=when{p==1->coefVar(a,v);else->coefVar(a,"$v^$p")};terms+=term};val out=joinTerms(terms)+" + C";return CalculationResult(input,CalculationType.CALCULUS,out,exact=out,derived=mapOf("variable" to v),steps=listOf("Extracted polynomial coefficients","Integrated each power term exactly by rule"))
        }
        return null
    }

    fun derivativeExpression(node:Node,variable:String):String?=differentiate(node,variable)?.let{render(simplify(it))}

    private fun differentiate(n:Node,v:String):Node? {
        return when(n){
            is Num -> Num(BigDecimal.ZERO)
            is Var -> Num(if(n.name==v) BigDecimal.ONE else BigDecimal.ZERO)
            is Unary -> differentiate(n.node,v)?.let{Unary(n.op,it)}
            is Pct -> differentiate(n.node,v)?.let{Pct(it)}
            is Fact -> if(n.vars().isEmpty()) Num(BigDecimal.ZERO) else null
            is Bin -> {
                val u=n.left; val w=n.right
                val du=differentiate(u,v) ?: return null
                val dw=differentiate(w,v) ?: return null
                when(n.op){
                    '+' -> Bin(du,'+',dw)
                    '-' -> Bin(du,'-',dw)
                    '*' -> Bin(Bin(du,'*',w),'+',Bin(u,'*',dw))
                    '/' -> Bin(Bin(Bin(du,'*',w),'-',Bin(u,'*',dw)),'/',Bin(w,'^',Num(BigDecimal("2"))))
                    '^' -> {
                        if(w.vars().isNotEmpty()) return null
                        val power=try{w.eval(Ctx(EngineSettings()))}catch(_:Exception){return null}
                        Bin(Bin(Num(power),'*',Bin(u,'^',Num(power-BigDecimal.ONE))),'*',du)
                    }
                    else -> null
                }
            }
            is Fn -> {
                if(n.args.size!=1) return null
                val u=n.args[0]; val du=differentiate(u,v) ?: return null
                val outer=when(n.name.lowercase()){
                    "sin" -> Fn("cos",listOf(u))
                    "cos" -> Unary('-',Fn("sin",listOf(u)))
                    "tan" -> Bin(Num(BigDecimal.ONE),'/',Bin(Fn("cos",listOf(u)),'^',Num(BigDecimal("2"))))
                    "exp" -> Fn("exp",listOf(u))
                    "ln" -> Bin(Num(BigDecimal.ONE),'/',u)
                    "sqrt" -> Bin(Num(BigDecimal.ONE),'/',Bin(Num(BigDecimal("2")),'*',Fn("sqrt",listOf(u))))
                    "sinh" -> Fn("cosh",listOf(u))
                    "cosh" -> Fn("sinh",listOf(u))
                    else -> return null
                }
                Bin(outer,'*',du)
            }
            else -> null
        }
    }
    private fun simplify(n:Node):Node=when(n){is Bin->{val a=simplify(n.left);val b=simplify(n.right);if(a is Num&&b is Num)try{Num(Bin(a,n.op,b).eval(Ctx(EngineSettings(precision=34))))}catch(_:Exception){Bin(a,n.op,b)}else when(n.op){'+'->when{isZero(a)->b;isZero(b)->a;else->Bin(a,'+',b)};'-'->if(isZero(b))a else Bin(a,'-',b);'*'->when{isZero(a)||isZero(b)->Num(BigDecimal.ZERO);isOne(a)->b;isOne(b)->a;else->Bin(a,'*',b)};'/'->if(isOne(b))a else Bin(a,'/',b);'^'->when{isZero(b)->Num(BigDecimal.ONE);isOne(b)->a;else->Bin(a,'^',b)};else->Bin(a,n.op,b)}};is Unary->simplify(n.node).let{if(n.op=='-'&&it is Num)Num(it.value.negate())else Unary(n.op,it)};else->n}
    private fun isZero(n:Node)=n is Num&&n.value.compareTo(BigDecimal.ZERO)==0;private fun isOne(n:Node)=n is Num&&n.value.compareTo(BigDecimal.ONE)==0
    private fun render(n:Node):String=when(n){is Num->ExpressionEngine.pretty(n.value);is Var->n.name;is Unary->"${n.op}${render(n.node)}";is Pct->"${render(n.node)}%";is Fact->"${render(n.node)}!";is Fn->"${n.name}(${n.args.joinToString(","){render(it)}})";is Bin->"(${render(n.left)} ${n.op} ${render(n.right)})";else->"?"}
    private fun coefVar(a:Double,x:String)=when{abs(a-1.0)<1e-14->x;abs(a+1.0)<1e-14->"-$x";else->"${fmt(a)}*$x"}
    private fun fmt(v:Double)=BigDecimal.valueOf(v).stripTrailingZeros().toPlainString()
    private fun joinTerms(terms:List<String>):String{if(terms.isEmpty())return "0";return terms.joinToString(" + ").replace("+ -","- ")}
}

class GraphAnalyzer(private val expression:ExpressionEngine = ExpressionEngine()) {
    fun analyze(expressions:List<String>,from:Double,to:Double,settings:EngineSettings=EngineSettings(),samples:Int=601):GraphBundle {
        require(expressions.isNotEmpty()){ "At least one function is required" };require(from.isFinite()&&to.isFinite()&&from<to){"Invalid graph domain"};val count=samples.coerceIn(101,5001)
        val nodes=expressions.map{expression.parse(it)};val vars=nodes.flatMap{it.vars()}.distinct();if(vars.size>1)throw CalcEx("VARIABLES","Graph functions must use one common variable");val variable=vars.singleOrNull()?:"x"
        fun y(node:Node,x:Double)=try{node.eval(Ctx(settings,mapOf(variable to BigDecimal.valueOf(x)))).toDouble()}catch(_:Exception){Double.NaN}
        val series=nodes.mapIndexed{si,node->val pts=List(count){i->val x=from+(to-from)*i/(count-1);GraphPoint(x,y(node,x))};val roots=mutableListOf<Double>();for(i in 1 until count){val a=pts[i-1];val b=pts[i];if(a.y.isFinite()&&b.y.isFinite()){if(abs(a.y)<1e-10)roots+=a.x else if(a.y*b.y<0)roots+=bisect({z->y(node,z)},a.x,b.x)}};val finite=pts.filter{it.y.isFinite()};val ext=mutableListOf<GraphExtremum>();for(i in 1 until pts.lastIndex){val p=pts[i-1];val q=pts[i];val r=pts[i+1];if(p.y.isFinite()&&q.y.isFinite()&&r.y.isFinite()){if(q.y<p.y&&q.y<r.y)ext+=GraphExtremum(si,q.x,q.y,"min");if(q.y>p.y&&q.y>r.y)ext+=GraphExtremum(si,q.x,q.y,"max")}};GraphSeriesData(expressions[si],pts,roots.distinctBy{round(it*1e8)},finite.minByOrNull{it.y},finite.maxByOrNull{it.y},ext.take(100))}
        val ints=mutableListOf<GraphIntersection>();for(i in series.indices)for(j in i+1 until series.size){val a=series[i];val b=series[j];for(k in 1 until count){val p0=a.points[k-1];val p1=a.points[k];val q0=b.points[k-1];val q1=b.points[k];val d0=p0.y-q0.y;val d1=p1.y-q1.y;if(d0.isFinite()&&d1.isFinite()&&d0*d1<0){val x=bisect({z->y(nodes[i],z)-y(nodes[j],z)},p0.x,p1.x);ints+=GraphIntersection(i,j,x,y(nodes[i],x))}}}
        return GraphBundle(variable,from,to,series,ints.distinctBy{"${it.firstSeries}:${it.secondSeries}:${round(it.x*1e7)}"},count)
    }
    private fun bisect(f:(Double)->Double,a0:Double,b0:Double):Double{var a=a0;var b=b0;var fa=f(a);repeat(70){val m=(a+b)/2;val fm=f(m);if(abs(fm)<1e-12)return m;if(fa*fm<=0)b=m else{a=m;fa=fm}};return(a+b)/2}
}
