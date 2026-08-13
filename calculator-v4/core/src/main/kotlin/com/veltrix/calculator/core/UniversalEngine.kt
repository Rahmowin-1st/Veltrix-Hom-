package com.veltrix.calculator.core

import java.math.BigDecimal
import java.math.MathContext
import java.time.LocalDate
import java.time.Period
import java.time.temporal.ChronoUnit
import kotlin.math.*

class VeltrixCalculatorEngine(private val expression: ExpressionEngine = ExpressionEngine()) {
    private val complex=ComplexEngine()
    private val linear=LinearAlgebraEngine()
    private val units=UnitRegistry()
    private val polynomial=PolynomialEngine()
    private val symbolic=SymbolicEngine(polynomial)
    private val graphs=GraphAnalyzer(expression)

    fun calculate(input:String,settings:EngineSettings=EngineSettings(),preferred:CalculationType?=null):CalculationResult {
        val original=input.trim();if(original.isBlank())return CalculationResult.fail(input,CalculationType.UNKNOWN,"EMPTY","Enter a calculation")
        val s=normalizeSmart(original)
        return try {
            val result = currency(s) ?: date(s) ?: programmer(s) ?: complex.tryCalculate(s,settings)
                ?: linear.tryMatrix(s,settings) ?: vector(s,settings) ?: stats(s,settings) ?: finance(s,settings)
                ?: geometry(s,settings) ?: conversion(s,settings) ?: symbolic.tryCalculate(s,expression,settings)
                ?: calculus(s,settings) ?: discrete(s,settings) ?: graph(s,settings) ?: polynomial.tryCalculate(s,expression,settings)
                ?: equation(s,settings) ?: expression.evaluate(s,settings)
            result.copy(input=input)
        } catch(e:CalcEx){CalculationResult.fail(input,preferred?:CalculationType.UNKNOWN,e.code,e.message?:"Calculation error")}
        catch(_:Exception){CalculationResult.fail(input,preferred?:CalculationType.UNKNOWN,"INVALID_INPUT","Could not parse this calculation")}
    }

    private fun normalizeSmart(raw:String):String {
        var s=raw.trim().replace(Regex("(?i)^(what is|calculate|compute)\\s+"),"").replace(Regex("(?i)^convert\\s+"),"")
        if(s.startsWith("solve ",true)&&s.contains('=')&&!s.startsWith("solve matrix ",true))s=s.substring(6).trim()
        Regex("(?i)^([+-]?[0-9.]+)\\s+percent\\s+of\\s+([+-]?[0-9.]+)$").matchEntire(s)?.let{s="${it.groupValues[1]}% of ${it.groupValues[2]}"}
        Regex("(?i)^what percentage is ([+-]?[0-9.]+) of ([+-]?[0-9.]+)$").matchEntire(raw.trim())?.let{m->s="${m.groupValues[1]}/${m.groupValues[2]}*100"}
        return s
    }

    private fun equation(s:String,st:EngineSettings):CalculationResult? {
        if(!s.contains('='))return null
        if(s.contains(';')){val eqs=s.split(';').map{it.trim()}.filter{it.isNotEmpty()};if(eqs.size>=2)return linear.solveEquations(s,eqs,expression,st)}
        val p=s.split('=',limit=2);val left=expression.parse(p[0]);val right=expression.parse(p[1]);polynomial.solveEquation(s,left,right,st)?.let{return it}
        val vars=(left.vars()+right.vars()).toList();if(vars.size!=1)return CalculationResult.fail(s,CalculationType.ALGEBRA,"VARIABLES","Equation solver requires one variable unless a linear system is supplied")
        val v=vars.single();fun f(x:Double)=left.eval(Ctx(st,mapOf(v to BigDecimal.valueOf(x)))).toDouble()-right.eval(Ctx(st,mapOf(v to BigDecimal.valueOf(x)))).toDouble()
        val roots=mutableListOf<Double>();var x0=-1000.0;var y0=f(x0);val step=.25;var x=x0+step
        while(x<=1000&&roots.size<32){val y=f(x);if(y.isFinite()&&y0.isFinite()){if(abs(y)<1e-10)roots+=x;else if(y*y0<0)roots+=bisect(::f,x-step,x)};y0=y;x+=step}
        val unique=roots.map(::snap).distinctBy{round(it*1e8)}.sorted();if(unique.isEmpty())return CalculationResult.fail(s,CalculationType.ALGEBRA,"NO_REAL_ROOT","No real root found in the supported numerical search range")
        return CalculationResult(s,CalculationType.ALGEBRA,unique.joinToString(", "){"$v = ${fmt(it,st)}"},derived=mapOf("variable" to v,"root_count" to unique.size.toString()),steps=listOf("Built f($v)=0","Bracketed and bisected real roots"))
    }

    private fun conversion(s:String,st:EngineSettings):CalculationResult? {
        Regex("(?i)^(\\d+(?:\\.\\d+)?)\\s*(?:feet|ft)\\s+(\\d+(?:\\.\\d+)?)\\s*(?:inches|inch|in)\\s+(?:to|in)\\s+(.+)$").matchEntire(s)?.let { m ->
            val inches=m.groupValues[1].toDouble()*12+m.groupValues[2].toDouble()
            val conv=units.convert(inches,"in",m.groupValues[3]) ?: return CalculationResult.fail(s,CalculationType.UNIT,"INCOMPATIBLE_UNITS","Unsupported target unit")
            return CalculationResult(s,CalculationType.UNIT,"${fmt(conv.first,st)} ${units.label(conv.third.id)}")
        }
        Regex("(?i)^([+-]?[0-9]+(?:\\.[0-9]+)?)\\s+(.+?)\\s+(?:to|in)\\s+(.+)$").matchEntire(s)?.let { m ->
            val amount=m.groupValues[1].toDouble()
            val conv=units.convert(amount,m.groupValues[2],m.groupValues[3]) ?: return@let
            val (v,f,t)=conv
            return CalculationResult(s,CalculationType.UNIT,"${fmt(v,st)} ${units.label(t.id)}",approximate="${fmt(v,st)} ${units.label(t.id)}",metadata=mapOf("category" to t.category,"from" to f.id,"to" to t.id))
        }
        return null
    }

    private fun programmer(s:String):CalculationResult? {
        Regex("(?i)^(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\\d+)\\s+to\\s+(binary|octal|decimal|hex|hexadecimal)$").matchEntire(s)?.let{m->val n=parseLong(m.groupValues[1]);val out=when(m.groupValues[2].lowercase()){ "binary"->"0b${n.toString(2)}";"octal"->"0o${n.toString(8)}";"hex","hexadecimal"->"0x${n.toString(16).uppercase()}";else->n.toString()};return CalculationResult(s,CalculationType.PROGRAMMER,out,alternatives=programmerFormats(n))}
        Regex("(?i)^(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\\d+)\\s*(<<|>>|&|\\||\\^)\\s*(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\\d+)$").matchEntire(s)?.let{m->val a=parseLong(m.groupValues[1]);val b=parseLong(m.groupValues[3]);if((m.groupValues[2]=="<<"||m.groupValues[2]==">>")&&b !in 0..63)return CalculationResult.fail(s,CalculationType.PROGRAMMER,"SHIFT_RANGE","Shift must be 0..63");val n=when(m.groupValues[2]){"<<"->a shl b.toInt();">>"->a shr b.toInt();"&"->a and b;"|"->a or b;else->a xor b};return CalculationResult(s,CalculationType.PROGRAMMER,n.toString(),alternatives=programmerFormats(n))};return null
    }
    private fun parseLong(s:String)=when{s.startsWith("0x",true)->s.drop(2).toLong(16);s.startsWith("0b",true)->s.drop(2).toLong(2);s.startsWith("0o",true)->s.drop(2).toLong(8);else->s.toLong()}
    private fun programmerFormats(n:Long)=mapOf("binary" to "0b${n.toString(2)}","octal" to "0o${n.toString(8)}","decimal" to n.toString(),"hex" to "0x${n.toString(16).uppercase()}")

    private fun stats(s:String,st:EngineSettings):CalculationResult? {Regex("(?i)^(mean|median|mode|range|variance|standard deviation|std|percentile\\s+([0-9.]+))\\s*:?\\s*(.+)$").matchEntire(s)?.let{m->val op=m.groupValues[1].lowercase();val nums=Regex("[-+]?[0-9]*\\.?[0-9]+").findAll(m.groupValues[3]).map{it.value.toDouble()}.toList();if(nums.isEmpty())return CalculationResult.fail(s,CalculationType.STATISTICS,"DATA","No data values found");val sorted=nums.sorted();val mean=nums.average();val result=when{op=="mean"->mean;op=="median"->if(nums.size%2==1)sorted[nums.size/2] else(sorted[nums.size/2-1]+sorted[nums.size/2])/2;op=="range"->sorted.last()-sorted.first();op=="variance"->nums.sumOf{(it-mean).pow(2)}/nums.size;op=="standard deviation"||op=="std"->sqrt(nums.sumOf{(it-mean).pow(2)}/nums.size);op=="mode"->{val g=nums.groupingBy{it}.eachCount();val max=g.maxOf{it.value};val modes=g.filterValues{it==max}.keys;if(max==1)return CalculationResult.fail(s,CalculationType.STATISTICS,"NO_MODE","No repeated value; dataset has no unique mode");modes.min()};else->{val p=m.groupValues[2].toDouble();if(p !in 0.0..100.0)return CalculationResult.fail(s,CalculationType.STATISTICS,"PERCENTILE","Percentile must be 0..100");val idx=p/100*(sorted.size-1);val lo=floor(idx).toInt();val hi=ceil(idx).toInt();sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo)}};return CalculationResult(s,CalculationType.STATISTICS,fmt(result,st),derived=mapOf("count" to nums.size.toString(),"mean" to fmt(mean,st)))};return null}

    private fun vector(s:String,st:EngineSettings):CalculationResult? {Regex("(?i)^(dot|cross|magnitude)\\s*\\[([^]]+)](?:\\s*\\[([^]]+)])?$").matchEntire(s)?.let{m->val a=m.groupValues[2].split(',').map{it.trim().toDouble()};if(m.groupValues[1].equals("magnitude",true))return CalculationResult(s,CalculationType.VECTOR,fmt(sqrt(a.sumOf{it*it}),st));val b=m.groupValues[3].split(',').map{it.trim().toDouble()};if(a.size!=b.size)return CalculationResult.fail(s,CalculationType.VECTOR,"SHAPE","Vector sizes must match");if(m.groupValues[1].equals("dot",true))return CalculationResult(s,CalculationType.VECTOR,fmt(a.indices.sumOf{a[it]*b[it]},st));if(a.size!=3)return CalculationResult.fail(s,CalculationType.VECTOR,"SHAPE","Cross product requires 3D vectors");val c=listOf(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);return CalculationResult(s,CalculationType.VECTOR,c.joinToString(", ","[","]"){fmt(it,st)})};return null}

    private fun calculus(s:String,st:EngineSettings):CalculationResult? {
        Regex("(?i)^derivative\\s+(.+?)\\s+at\\s+([+-]?[0-9.]+)$").matchEntire(s)?.let { m ->
            val node=expression.parse(m.groupValues[1]); val v=node.vars().singleOrNull()?:"x"
            val x=m.groupValues[2].toDouble(); val h=max(1e-6,abs(x)*1e-6)
            fun f(z:Double):Double = node.eval(Ctx(st,mapOf(v to BigDecimal.valueOf(z)))).toDouble()
            val d=(f(x-2*h)-8*f(x-h)+8*f(x+h)-f(x+2*h))/(12*h)
            val sym=symbolic.derivativeExpression(node,v)
            return CalculationResult(s,CalculationType.CALCULUS,fmt(d,st),approximate=fmt(d,st),derived=buildMap{put("variable",v);sym?.let{put("symbolic_derivative",it)}},steps=listOf("Used a 5-point numerical derivative around $v=$x"))
        }
        Regex("(?i)^integral\\s+(.+?)\\s+from\\s+([+-]?[0-9.]+)\\s+to\\s+([+-]?[0-9.]+)$").matchEntire(s)?.let { m ->
            val node=expression.parse(m.groupValues[1]); val v=node.vars().singleOrNull()?:"x"
            val a=m.groupValues[2].toDouble(); val b=m.groupValues[3].toDouble(); val n=2000; val h=(b-a)/n
            fun f(z:Double):Double = node.eval(Ctx(st,mapOf(v to BigDecimal.valueOf(z)))).toDouble()
            var sum=f(a)+f(b); for(i in 1 until n) sum+=(if(i%2==0)2 else 4)*f(a+i*h)
            val r=sum*h/3
            return CalculationResult(s,CalculationType.CALCULUS,fmt(r,st),approximate=fmt(r,st),steps=listOf("Used Simpson numerical integration with $n intervals"))
        }
        Regex("(?i)^limit\\s+(.+?)\\s+as\\s+([a-zA-Z])\\s*->\\s*([+-]?[0-9.]+)$").matchEntire(s)?.let { m ->
            val node=expression.parse(m.groupValues[1]); val v=m.groupValues[2]; val x=m.groupValues[3].toDouble()
            fun f(z:Double):Double = node.eval(Ctx(st,mapOf(v to BigDecimal.valueOf(z)))).toDouble()
            val estimates=listOf(1e-3,1e-4,1e-5,1e-6).map{it*max(1.0,abs(x))}.map{h->(f(x-h)+f(x+h))/2}.filter{it.isFinite()}
            if(estimates.size<3 || abs(estimates.last()-estimates[estimates.lastIndex-1])>1e-5*max(1.0,abs(estimates.last()))) return CalculationResult.fail(s,CalculationType.CALCULUS,"LIMIT","Stable finite two-sided limit not detected")
            return CalculationResult(s,CalculationType.CALCULUS,fmt(estimates.last(),st),approximate=fmt(estimates.last(),st))
        }
        return null
    }

    private fun discrete(s:String,st:EngineSettings):CalculationResult? {Regex("(?i)^(sum|summation|product)\\s+(.+?)\\s+([a-zA-Z])\\s*=\\s*(-?\\d+)\\.\\.(-?\\d+)$").matchEntire(s)?.let{m->val prod=m.groupValues[1].startsWith("product",true);val node=expression.parse(m.groupValues[2]);val v=m.groupValues[3];val a=m.groupValues[4].toInt();val b=m.groupValues[5].toInt();if(abs(b.toLong()-a)>100000)return CalculationResult.fail(s,CalculationType.ALGEBRA,"TOO_LARGE","Range too large");var acc=if(prod)BigDecimal.ONE else BigDecimal.ZERO;val step=if(b>=a)1 else -1;var i=a;while(true){val x=node.eval(Ctx(st,mapOf(v to BigDecimal(i))));acc=if(prod)acc.multiply(x,MathContext(st.precision))else acc.add(x,MathContext(st.precision));if(i==b)break;i+=step};return CalculationResult(s,CalculationType.ALGEBRA,ExpressionEngine.pretty(acc))};return null}

    private fun graph(s:String,st:EngineSettings):CalculationResult? {Regex("(?i)^graph\\s+(.+?)\\s+from\\s+([+-]?[0-9.]+)\\s+to\\s+([+-]?[0-9.]+)$").matchEntire(s)?.let{m->val exprs=m.groupValues[1].split(Regex("\\s*[;|]\\s*")).filter{it.isNotBlank()};val bundle=graphs.analyze(exprs,m.groupValues[2].toDouble(),m.groupValues[3].toDouble(),st);val roots=bundle.series.mapIndexed{i,x->"f${i+1}: ${x.roots.joinToString{fmt(it,st)}}"}.joinToString(" | ");val ints=bundle.intersections.joinToString{"f${it.firstSeries+1}=f${it.secondSeries+1} @ ${fmt(it.x,st)}"};val meta=buildMap{put("series_count",bundle.series.size.toString());put("sample_count",bundle.sampleCount.toString());bundle.series.forEachIndexed{i,ser->put("series_${i+1}_points",ser.points.joinToString(";"){"${it.x},${it.y}"})}};return CalculationResult(s,CalculationType.GRAPH,"${bundle.series.size} series • ${bundle.sampleCount} samples each",derived=mapOf("domain" to "[${fmt(bundle.domainStart,st)}, ${fmt(bundle.domainEnd,st)}]","roots" to roots,"intersections" to ints.ifBlank{"none"},"extrema" to bundle.series.sumOf{it.localExtrema.size}.toString()),metadata=meta)};return null}

    private fun finance(s:String,st:EngineSettings):CalculationResult? {
        Regex("(?i)^compound interest(?: on)?\\s+([0-9.]+)(?:\\s+at)?\\s+([0-9.]+)%?(?:\\s+for)?\\s+([0-9.]+)(?:\\s+years?)?(?:\\s+(?:compounded )?(monthly|quarterly|yearly|daily|[0-9.]+))?$" ).matchEntire(s)?.let{m->val p=m.groupValues[1].toDouble();val rate=m.groupValues[2].toDouble()/100;val years=m.groupValues[3].toDouble();val n=when(m.groupValues[4].lowercase()){"monthly"->12.0;"quarterly"->4.0;"yearly",""->1.0;"daily"->365.0;else->m.groupValues[4].toDoubleOrNull()?:1.0};if(p<0||rate<0||years<0||n<=0)return CalculationResult.fail(s,CalculationType.FINANCE,"DOMAIN","Finance inputs must be non-negative and compounding positive");val total=p*(1+rate/n).pow(n*years);return CalculationResult(s,CalculationType.FINANCE,fmt(total,st),derived=mapOf("principal" to fmt(p,st),"interest" to fmt(total-p,st),"compounds_per_year" to fmt(n,st)))}
        Regex("(?i)^(discount|tax|markup|margin|tip)\\s+([0-9.]+)%?\\s+(?:on\\s+)?([0-9.]+)$").matchEntire(s)?.let{m->val op=m.groupValues[1].lowercase();val p=m.groupValues[2].toDouble()/100;val a=m.groupValues[3].toDouble();if(op=="margin"&&p>=1)return CalculationResult.fail(s,CalculationType.FINANCE,"DOMAIN","Margin must be below 100%");val r=when(op){"discount"->a*(1-p);"tax","markup","tip"->a*(1+p);else->a/(1-p)};return CalculationResult(s,CalculationType.FINANCE,fmt(r,st),derived=mapOf("change" to fmt(r-a,st)))}
        Regex("(?i)^percentage change\\s+(?:from\\s+)?([+-]?[0-9.]+)\\s+(?:to\\s+)?([+-]?[0-9.]+)$").matchEntire(s)?.let{m->val a=m.groupValues[1].toDouble();val b=m.groupValues[2].toDouble();if(a==0.0)return CalculationResult.fail(s,CalculationType.FINANCE,"DIVIDE_BY_ZERO","Percentage change from zero is undefined");return CalculationResult(s,CalculationType.FINANCE,"${fmt((b-a)/abs(a)*100,st)}%")}
        Regex("(?i)^loan\\s+([0-9.]+)(?:\\s+at)?\\s+([0-9.]+)%?(?:\\s+for)?\\s+([0-9.]+)(?:\\s+years?)?$").matchEntire(s)?.let{m->val p=m.groupValues[1].toDouble();val monthly=m.groupValues[2].toDouble()/100/12;val months=(m.groupValues[3].toDouble()*12).roundToInt();if(months<=0)return CalculationResult.fail(s,CalculationType.FINANCE,"DOMAIN","Loan term must be positive");val pay=if(monthly==0.0)p/months else p*monthly/(1-(1+monthly).pow(-months));return CalculationResult(s,CalculationType.FINANCE,fmt(pay,st),derived=mapOf("monthly_payment" to fmt(pay,st),"total_paid" to fmt(pay*months,st),"total_interest" to fmt(pay*months-p,st)))};return null
    }

    private fun geometry(s:String,st:EngineSettings):CalculationResult? {Regex("(?i)^circle\\s+([0-9.]+)$").matchEntire(s)?.let{m->val r=m.groupValues[1].toDouble();return CalculationResult(s,CalculationType.GEOMETRY,fmt(Math.PI*r*r,st),derived=mapOf("area" to fmt(Math.PI*r*r,st),"circumference" to fmt(2*Math.PI*r,st),"diameter" to fmt(2*r,st)))};Regex("(?i)^rectangle\\s+([0-9.]+)\\s+([0-9.]+)$").matchEntire(s)?.let{m->val a=m.groupValues[1].toDouble();val b=m.groupValues[2].toDouble();return CalculationResult(s,CalculationType.GEOMETRY,fmt(a*b,st),derived=mapOf("area" to fmt(a*b,st),"perimeter" to fmt(2*(a+b),st),"diagonal" to fmt(hypot(a,b),st)))};Regex("(?i)^sphere\\s+([0-9.]+)$").matchEntire(s)?.let{m->val r=m.groupValues[1].toDouble();return CalculationResult(s,CalculationType.GEOMETRY,fmt(4.0/3*Math.PI*r.pow(3),st),derived=mapOf("volume" to fmt(4.0/3*Math.PI*r.pow(3),st),"surface_area" to fmt(4*Math.PI*r*r,st)))};return null}

    private fun date(s:String):CalculationResult? {Regex("(?i)^(?:days|date difference)\\s+between\\s+(\\d{4}-\\d{2}-\\d{2})\\s+and\\s+(\\d{4}-\\d{2}-\\d{2})$").matchEntire(s)?.let{m->val a=LocalDate.parse(m.groupValues[1]);val b=LocalDate.parse(m.groupValues[2]);return CalculationResult(s,CalculationType.DATE_TIME,"${abs(ChronoUnit.DAYS.between(a,b))} days",derived=mapOf("signed_days" to ChronoUnit.DAYS.between(a,b).toString()))};Regex("(?i)^(\\d{4}-\\d{2}-\\d{2})\\s*([+-])\\s*(\\d+)\\s*days?$").matchEntire(s)?.let{m->val d=LocalDate.parse(m.groupValues[1]);val n=m.groupValues[3].toLong()*(if(m.groupValues[2]=="-")-1 else 1);return CalculationResult(s,CalculationType.DATE_TIME,d.plusDays(n).toString())};Regex("(?i)^age\\s+(?:on\\s+)?(\\d{4}-\\d{2}-\\d{2})(?:\\s+at\\s+(\\d{4}-\\d{2}-\\d{2}))?$").matchEntire(s)?.let{m->val birth=LocalDate.parse(m.groupValues[1]);val at=m.groupValues[2].takeIf{it.isNotBlank()}?.let(LocalDate::parse)?:LocalDate.now();if(at<birth)return CalculationResult.fail(s,CalculationType.DATE_TIME,"DATE_ORDER","Reference date is before birth date");val p=Period.between(birth,at);return CalculationResult(s,CalculationType.DATE_TIME,"${p.years} years, ${p.months} months, ${p.days} days")};return null}

    private fun currency(s:String):CalculationResult? {Regex("(?i)^([0-9.]+)\\s+([A-Z]{3})\\s+(?:to|in)\\s+([A-Z]{3})$").matchEntire(s)?.let{m->val known=setOf("USD","EUR","GBP","JPY","CHF","CAD","AUD","CNY","INR","UZS","KRW","TRY","RUB","KZT");val base=m.groupValues[2].uppercase();val quote=m.groupValues[3].uppercase();if(base in known&&quote in known)return CalculationResult(s,CalculationType.CURRENCY,"Rate required",metadata=mapOf("amount" to m.groupValues[1],"base" to base,"quote" to quote,"stale" to "unknown"),requiresNetwork=true)};return null}

    private fun bisect(f:(Double)->Double,a0:Double,b0:Double):Double{var a=a0;var b=b0;var fa=f(a);repeat(80){val m=(a+b)/2;val fm=f(m);if(abs(fm)<1e-12)return m;if(fa*fm<=0)b=m else{a=m;fa=fm}};return(a+b)/2}
    private fun snap(x:Double):Double{val r=round(x);return if(abs(x-r)<1e-9)r else x}
    private fun fmt(x:Double,st:EngineSettings)=ComplexEngine.formatDouble(x,st)
}
