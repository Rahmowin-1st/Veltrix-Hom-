package com.veltrix.calculator.core

import java.math.BigDecimal
import kotlin.math.abs
import kotlin.math.hypot

/** Canonical structured execution facade for app, widgets and tests. */
class PlatformEngine(
    val registry: ToolRegistry = ToolRegistry.default(),
    val converters: ConversionRegistry = ConversionRegistry.default(),
    private val formulaEngine: FormulaEngine = FormulaEngine(converter = converters),
    private val legacy: VeltrixCalculatorEngine = VeltrixCalculatorEngine(),
    private val polynomial: StructuredPolynomialSolver = StructuredPolynomialSolver(),
    private val programmer: ProgrammerPlatform = ProgrammerPlatform(),
    private val graph: GraphPlatform = GraphPlatform()
) {
    fun execute(request: ToolRequest): ToolResponse {
        val tool = registry.get(request.toolId) ?: return fail(request.toolId, "UNKNOWN_TOOL", "Unknown tool id")
        V4SpecialPlatform.execute(tool, request)?.let { return it }
        return try {
            when (tool.executorKind) {
                ToolExecutorKind.EXPRESSION -> executeExpression(tool, request)
                ToolExecutorKind.FORMULA -> formulaEngine.execute(tool, request)
                ToolExecutorKind.POLYNOMIAL -> executePolynomial(tool, request)
                ToolExecutorKind.PROGRAMMER -> executeProgrammer(tool, request)
                ToolExecutorKind.MATH_UTILITY -> executeMathUtility(tool, request)
                ToolExecutorKind.MATRIX -> executeMatrix(tool, request)
                ToolExecutorKind.VECTOR -> executeVector(tool, request)
                ToolExecutorKind.CALCULUS -> executeCalculus(tool, request)
                ToolExecutorKind.STATISTICS -> executeStatistics(tool, request)
                ToolExecutorKind.FINANCE -> executeFinance(tool, request)
                ToolExecutorKind.GEOMETRY -> executeGeometry(tool, request)
                ToolExecutorKind.CHEMISTRY -> executeChemistry(tool, request)
                ToolExecutorKind.DATE_TIME -> executeDateTime(tool, request)
                ToolExecutorKind.TEXT_ANALYZER -> executeText(tool, request)
                ToolExecutorKind.GRAPH -> executeGraph(tool, request)
                ToolExecutorKind.CONVERTER -> fail(tool.id, "USE_CONVERTER_API", "Converters use the standalone conversion system")
                ToolExecutorKind.CURRENCY -> fail(tool.id, "LIVE_DATA_LAYER", "Currency is provided by the Android live-data repository")
            }
        } catch (e: CalcEx) { fail(tool.id, e.code, e.message ?: "Calculation failed") }
          catch (e: IllegalArgumentException) { fail(tool.id, "INVALID_INPUT", e.message ?: "Invalid input") }
          catch (_: Exception) { fail(tool.id, "CALCULATION_ERROR", "Calculation could not be completed") }
    }

    fun convert(amount: Double, fromUnit: String, toUnit: String): ConversionResult = converters.convert(amount, fromUnit, toUnit)
        ?: throw CalcEx("INCOMPATIBLE_UNITS", "Units are unknown or belong to different categories")

    private fun executeExpression(tool:ToolDefinition,r:ToolRequest):ToolResponse{
        val expression=req(r,"expression")
        val result=legacy.calculate(expression,r.settings,if(tool.id=="scientific-calculator")CalculationType.SCIENTIFIC else CalculationType.STANDARD)
        return legacyResponse(tool,result,mapOf("expression" to expression))
    }

    private fun executeProgrammer(tool:ToolDefinition,r:ToolRequest):ToolResponse{
        val width=r.inputs["bitWidth"]?.value?.toIntOrNull()?:64
        val signed=when(r.inputs["signedness"]?.value?.lowercase()){"unsigned"->Signedness.UNSIGNED;else->Signedness.SIGNED}
        val out=programmer.evaluate(req(r,"expression"),ProgrammerSettings(width,signed))
        return ToolResponse(tool.id,out.decimal,mapOf("decimal" to out.decimal,"binary" to out.binary,"octal" to out.octal,"hex" to out.hex),metadata=mapOf("bitWidth" to width.toString(),"signedness" to signed.name.lowercase()))
    }

    private fun executePolynomial(tool:ToolDefinition,r:ToolRequest):ToolResponse=when(tool.id){
        "linear-equation","quadratic-solver","cubic-solver","quartic-solver"->{
            val degree=when(tool.id){"linear-equation"->1;"quadratic-solver"->2;"cubic-solver"->3;else->4}
            val ids=(0..degree).map{('a'.code+it).toChar().toString()}
            val coefficients=ids.map{num(r,it)};val rhs=optionalDouble(r,"rhs")?:0.0
            val solved=polynomial.solve(coefficients,rhs); val roots=solved.roots.joinToString(", "){rootString(it,r.settings)}
            val outputs=linkedMapOf("roots" to roots,"classification" to solved.classification)
            solved.discriminant?.let{outputs["discriminant"]=fmt(it,r.settings)}
            if(solved.exactRoots.isNotEmpty())outputs["exactRoots"]=solved.exactRoots.joinToString(", ")
            ToolResponse(tool.id,roots,outputs,normalizedInput=ids.zip(solved.normalizedCoefficientsDescending).associate{it.first to fmt(it.second,r.settings)}+mapOf("rhs" to "0"),metadata=mapOf("degree" to degree.toString(),"resultPrecision" to if(degree<=2)"exact-or-stable" else "numerical"),exact=degree<=2&&solved.roots.none{it.approximate})
        }
        "polynomial-roots"->{val c=parseDoubles(req(r,"coefficients"));val solved=polynomial.solve(c);val roots=solved.roots.joinToString(", "){rootString(it,r.settings)};ToolResponse(tool.id,roots,mapOf("roots" to roots,"classification" to solved.classification),metadata=mapOf("degree" to (solved.normalizedCoefficientsDescending.size-1).toString(),"resultPrecision" to "numerical"))}
        "discriminant"->{val (d,cls)=polynomial.discriminant(num(r,"a"),num(r,"b"),num(r,"c"));ToolResponse(tool.id,fmt(d,r.settings),mapOf("discriminant" to fmt(d,r.settings),"classification" to cls),exact=isSimple(d))}
        "vieta"->{val (sum,product)=polynomial.vieta(num(r,"a"),num(r,"b"),num(r,"c"));ToolResponse(tool.id,"sum=${fmt(sum,r.settings)}, product=${fmt(product,r.settings)}",mapOf("sum" to fmt(sum,r.settings),"product" to fmt(product,r.settings)),exact=isSimple(sum)&&isSimple(product))}
        "polynomial-division"->{val(q,rem)=polynomial.divide(parseDoubles(req(r,"dividend")),parseDoubles(req(r,"divisor")));ToolResponse(tool.id,"quotient=${listFmt(q,r.settings)}; remainder=${listFmt(rem,r.settings)}",mapOf("quotient" to listFmt(q,r.settings),"remainder" to listFmt(rem,r.settings)))}
        else->fail(tool.id,"UNSUPPORTED","Unsupported polynomial tool")
    }

    private fun executeMathUtility(tool:ToolDefinition,r:ToolRequest):ToolResponse=when(tool.id){
        "gcd-lcm"->{val values=parseLongs(req(r,"values"));val(g,l)=MathUtilities.gcdLcm(values);ToolResponse(tool.id,"GCD=$g, LCM=$l",mapOf("gcd" to g.toString(),"lcm" to l.toString()),exact=true)}
        "prime-factorization"->{val v=req(r,"value").toLongOrNull()?:throw CalcEx("INTEGER","Value must be an integer");val f=MathUtilities.primeFactors(v);val text=if(f.isEmpty())"1" else f.joinToString(" × "){(p,n)->if(n==1)"$p" else "$p^$n"};ToolResponse(tool.id,text,mapOf("factors" to text),exact=true)}
        "permutations-combinations"->{val n=int(r,"n");val rr=int(r,"r");val(p,c)=MathUtilities.permutationsCombinations(n,rr);ToolResponse(tool.id,"nPr=$p, nCr=$c",mapOf("nPr" to p.toString(),"nCr" to c.toString()),exact=true)}
        "arithmetic-sequence"->{val(nth,sum)=MathUtilities.arithmeticSequence(num(r,"first"),num(r,"difference"),int(r,"n"));ToolResponse(tool.id,"nth=${fmt(nth,r.settings)}, sum=${fmt(sum,r.settings)}",mapOf("nth" to fmt(nth,r.settings),"sum" to fmt(sum,r.settings)))}
        "geometric-sequence"->{val(nth,sum)=MathUtilities.geometricSequence(num(r,"first"),num(r,"ratio"),int(r,"n"));ToolResponse(tool.id,"nth=${fmt(nth,r.settings)}, sum=${fmt(sum,r.settings)}",mapOf("nth" to fmt(nth,r.settings),"sum" to fmt(sum,r.settings)))}
        "linear-inequality"->{
            val a=num(r,"a");val b=num(r,"b");val rhs=num(r,"rhs");val raw=req(r,"operator");if(raw !in setOf("<","<=",">",">="))throw CalcEx("OPERATOR","Unsupported inequality operator")
            if(abs(a)<1e-14){val trueCase=when(raw){"<"->b<rhs;"<="->b<=rhs;">"->b>rhs;else->b>=rhs};val text=if(trueCase)"all real numbers" else "no solution";ToolResponse(tool.id,text,mapOf("solution" to text),exact=true)}
            else{val boundary=(rhs-b)/a;val op=if(a>0)raw else when(raw){"<"->">";"<="->">=";">"->"<";else->"<="};val text="x $op ${fmt(boundary,r.settings)}";ToolResponse(tool.id,text,mapOf("solution" to text,"boundary" to fmt(boundary,r.settings)),exact=isSimple(boundary))}
        }
        else->fail(tool.id,"UNSUPPORTED","Unsupported math utility")
    }

    private fun executeMatrix(tool:ToolDefinition,r:ToolRequest):ToolResponse{
        val op=req(r,"operation").lowercase();val a=req(r,"a");val b=r.inputs["b"]?.value?.trim().orEmpty()
        val command=when(op){"add"->"matrix $a + $b";"subtract"->"matrix $a - $b";"multiply"->"matrix $a * $b";"transpose"->"transpose $a";"determinant"->"det $a";"inverse"->"inverse $a";"rank"->"rank $a";"solve"->"solve matrix $a = $b";else->throw CalcEx("OPERATION","Unsupported matrix operation")}
        return legacyResponse(tool,legacy.calculate(command,r.settings,CalculationType.MATRIX),mapOf("operation" to op,"a" to a,"b" to b))
    }

    private fun executeVector(tool:ToolDefinition,r:ToolRequest):ToolResponse{
        val op=req(r,"operation").lowercase();val a=req(r,"a");val b=r.inputs["b"]?.value?.trim().orEmpty()
        val cmd=when(op){"magnitude"->"magnitude $a";"dot"->"dot $a $b";"cross"->"cross $a $b";"angle"->"angle $a $b";"projection"->"projection $a on $b";else->throw CalcEx("OPERATION","Unsupported vector operation")}
        return legacyResponse(tool,legacy.calculate(cmd,r.settings,CalculationType.VECTOR),mapOf("operation" to op,"a" to a,"b" to b))
    }

    private fun executeCalculus(tool:ToolDefinition,r:ToolRequest):ToolResponse{
        val op=req(r,"operation").lowercase();val e=req(r,"expression")
        val cmd=when(op){"differentiate"->"differentiate $e";"integrate"->"integrate $e";"numerical derivative"->"derivative $e at ${req(r,"at")}";"numerical integral"->"integral $e from ${req(r,"from")} to ${req(r,"to")}";else->throw CalcEx("OPERATION","Unsupported calculus operation")}
        return legacyResponse(tool,legacy.calculate(cmd,r.settings,CalculationType.CALCULUS),mapOf("operation" to op,"expression" to e))
    }

    private fun executeStatistics(tool:ToolDefinition,r:ToolRequest):ToolResponse{
        val data=StatisticsPlatform.parseDataset(req(r,"data"));val op=when(tool.id){"mean"->"mean";"median"->"median";"mode"->"mode";"range"->"range";"variance"->"variance";"standard-deviation"->"stddev";"weighted-mean"->"weighted mean";"percentile"->"percentile";else->r.inputs["operation"]?.value?.lowercase()?:"summary"}
        val summary=StatisticsPlatform.summary(data)
        val outputs=linkedMapOf<String,String>()
        val primary=when(op){
            "mean"->fmt(summary.mean,r.settings);"median"->fmt(summary.median,r.settings);"range"->fmt(summary.range,r.settings);"variance"->fmt(summary.populationVariance,r.settings);"stddev","standard deviation"->fmt(summary.populationStdDev,r.settings)
            "mode"->{if(summary.modes.isEmpty())throw CalcEx("NO_MODE","Dataset has no repeated mode");summary.modes.joinToString(", "){fmt(it,r.settings)}}
            "weighted mean"->{val weights=StatisticsPlatform.parseDataset(req(r,"weights"));fmt(StatisticsPlatform.weightedMean(data,weights),r.settings)}
            "percentile"->{val p=num(r,"percentile");fmt(StatisticsPlatform.percentile(data,p),r.settings)}
            "summary"->{outputs.putAll(mapOf("count" to summary.count.toString(),"mean" to fmt(summary.mean,r.settings),"median" to fmt(summary.median,r.settings),"mode" to summary.modes.joinToString(", "){fmt(it,r.settings)},"range" to fmt(summary.range,r.settings),"variance" to fmt(summary.populationVariance,r.settings),"stddev" to fmt(summary.populationStdDev,r.settings)));"count=${summary.count}, mean=${outputs["mean"]}, median=${outputs["median"]}"}
            else->throw CalcEx("OPERATION","Unsupported statistics operation")
        }
        if(outputs.isEmpty())outputs["result"]=primary
        return ToolResponse(tool.id,primary,outputs,metadata=mapOf("count" to summary.count.toString(),"varianceType" to "population"))
    }

    private fun executeFinance(tool:ToolDefinition,r:ToolRequest):ToolResponse=when(tool.id){
        "split-bill"->{val x=FinancePlatform.splitBill(num(r,"bill"),optionalDouble(r,"tip")?:0.0,int(r,"people"));ToolResponse(tool.id,fmt(x.perPerson,r.settings),mapOf("total" to fmt(x.total,r.settings),"perPerson" to fmt(x.perPerson,r.settings)))}
        "loan-payment"->{val x=FinancePlatform.loanPayment(num(r,"principal"),num(r,"annualRate"),int(r,"months"));ToolResponse(tool.id,fmt(x.monthlyPayment,r.settings),mapOf("monthlyPayment" to fmt(x.monthlyPayment,r.settings),"totalPaid" to fmt(x.totalPaid,r.settings),"totalInterest" to fmt(x.totalInterest,r.settings)))}
        else->fail(tool.id,"UNSUPPORTED","Unsupported finance tool")
    }

    private fun executeGeometry(tool:ToolDefinition,r:ToolRequest):ToolResponse=when(tool.id){
        "coordinate-distance"->{val d=hypot(num(r,"x2")-num(r,"x1"),num(r,"y2")-num(r,"y1"));ToolResponse(tool.id,fmt(d,r.settings),mapOf("distance" to fmt(d,r.settings)))}
        "coordinate-midpoint"->{val x=(num(r,"x1")+num(r,"x2"))/2;val y=(num(r,"y1")+num(r,"y2"))/2;ToolResponse(tool.id,"(${fmt(x,r.settings)}, ${fmt(y,r.settings)})",mapOf("x" to fmt(x,r.settings),"y" to fmt(y,r.settings)))}
        "line-slope"->{val dx=num(r,"x2")-num(r,"x1");if(abs(dx)<1e-14)ToolResponse(tool.id,"undefined",mapOf("slope" to "undefined"),metadata=mapOf("vertical" to "true"))else{val m=(num(r,"y2")-num(r,"y1"))/dx;ToolResponse(tool.id,fmt(m,r.settings),mapOf("slope" to fmt(m,r.settings)))}}
        "triangle-solver"->{
            fun opt(id:String)=r.inputs[id]?.value?.trim()?.takeIf{it.isNotEmpty()}?.toDoubleOrNull()
            val x=TrianglePlatform.solve(opt("a"),opt("b"),opt("c"),opt("A"),opt("B"),opt("C"));val first=x.solutions.first()
            val primary="a=${fmt(first.a,r.settings)}, b=${fmt(first.b,r.settings)}, c=${fmt(first.c,r.settings)}; A=${fmt(first.angleA,r.settings)}°, B=${fmt(first.angleB,r.settings)}°, C=${fmt(first.angleC,r.settings)}°"
            ToolResponse(tool.id,primary,mapOf("solutionCount" to x.solutions.size.toString(),"firstSolution" to primary),metadata=mapOf("ambiguous" to x.ambiguous.toString(),"allSolutions" to x.solutions.joinToString(" | "){t->"a=${fmt(t.a,r.settings)},b=${fmt(t.b,r.settings)},c=${fmt(t.c,r.settings)},A=${fmt(t.angleA,r.settings)},B=${fmt(t.angleB,r.settings)},C=${fmt(t.angleC,r.settings)}"}))
        }
        else->fail(tool.id,"UNSUPPORTED","Unsupported geometry tool")
    }

    private fun executeChemistry(tool:ToolDefinition,r:ToolRequest):ToolResponse=when(tool.id){
        "molar-mass","percent-composition"->{val m=ChemistryPlatform.molarMass(req(r,"formula"));val comp=m.percentComposition.entries.joinToString(", "){"${it.key}=${fmt(it.value,r.settings)}%"};if(tool.id=="molar-mass")ToolResponse(tool.id,"${fmt(m.molarMass,r.settings)} g/mol",mapOf("molarMass" to fmt(m.molarMass,r.settings),"composition" to comp),metadata=mapOf("datasetVersion" to m.datasetVersion,"datasetSource" to AtomicMassDataset.SOURCE))else ToolResponse(tool.id,comp,mapOf("composition" to comp,"molarMass" to fmt(m.molarMass,r.settings)),metadata=mapOf("datasetVersion" to m.datasetVersion))}
        else->fail(tool.id,"UNSUPPORTED","Unsupported chemistry tool")
    }

    private fun executeDateTime(tool:ToolDefinition,r:ToolRequest):ToolResponse=when(tool.id){
        "date-difference"->{val x=DateTimePlatform.difference(DateTimePlatform.parseDate(req(r,"start"),"start"),DateTimePlatform.parseDate(req(r,"end"),"end"));val p="${x.period.years} years, ${x.period.months} months, ${x.period.days} days";ToolResponse(tool.id,"${x.days} days",mapOf("days" to x.days.toString(),"calendar" to p))}
        "date-add-duration"->{val d=DateTimePlatform.parseDate(req(r,"date"));val out=DateTimePlatform.addDuration(d,optionalLong(r,"years")?:0,optionalLong(r,"months")?:0,optionalLong(r,"days")?:0);ToolResponse(tool.id,out.toString(),mapOf("date" to out.toString()),exact=true)}
        "age-calculator"->{val p=DateTimePlatform.age(DateTimePlatform.parseDate(req(r,"birthDate"),"birthDate"),DateTimePlatform.parseDate(req(r,"onDate"),"onDate"));val a="${p.years} years, ${p.months} months, ${p.days} days";ToolResponse(tool.id,a,mapOf("age" to a,"years" to p.years.toString()),exact=true)}
        else->fail(tool.id,"UNSUPPORTED","Unsupported date/time tool")
    }

    private fun executeText(tool:ToolDefinition,r:ToolRequest):ToolResponse{val x=TextAnalysisPlatform.analyze(req(r,"text"),r.inputs["detectedLanguage"]?.value,r.inputs["languageConfidence"]?.value?.toDoubleOrNull());return ToolResponse(tool.id,"${x.words} words",mapOf("characters" to x.characters.toString(),"charactersNoSpaces" to x.charactersExcludingSpaces.toString(),"words" to x.words.toString(),"sentences" to x.sentences.toString(),"paragraphs" to x.paragraphs.toString()),metadata=buildMap{x.detectedLanguage?.let{put("detectedLanguage",it)};x.languageConfidence?.let{put("languageConfidence",it.toString())}})}

    private fun executeGraph(tool:ToolDefinition,r:ToolRequest):ToolResponse=when(tool.id){
        "graph-functions"->{val expressions=req(r,"expressions").split(';','\n').map{it.trim()}.filter{it.isNotEmpty()};val v=GraphViewport(optionalDouble(r,"minX")?:-10.0,optionalDouble(r,"maxX")?:10.0,optionalDouble(r,"minY")?:-10.0,optionalDouble(r,"maxY")?:10.0);val g=graph.functions(expressions,v,r.settings);ToolResponse(tool.id,"${g.series.size} series",mapOf("seriesCount" to g.series.size.toString(),"intersections" to g.intersections.size.toString(),"roots" to g.series.sumOf{it.roots.size}.toString()),metadata=mapOf("sampleCount" to g.sampleCount.toString(),"segmentedDiscontinuities" to "true"))}
        "graph-line"->{val c=if(r.inputs["x1"]?.value?.isNotBlank()==true&&r.inputs["x2"]?.value?.isNotBlank()==true)graph.lineTwoPoint(num(r,"x1"),num(r,"y1"),num(r,"x2"),num(r,"y2"))else graph.lineSlopeIntercept(num(r,"m"),num(r,"b"));conicResponse(tool,c)}
        "graph-parabola"->{val form=r.inputs["form"]?.value?.lowercase()?:if(r.inputs["h"]?.value?.isNotBlank()==true)"vertex" else "standard";val c=if(form=="vertex")graph.parabolaVertex(num(r,"a"),num(r,"h"),num(r,"k"))else graph.parabolaStandard(num(r,"a"),num(r,"b"),num(r,"c"));conicResponse(tool,c)}
        "graph-circle"->conicResponse(tool,graph.circle(num(r,"h"),num(r,"k"),num(r,"r")))
        "graph-ellipse"->conicResponse(tool,graph.ellipse(num(r,"h"),num(r,"k"),num(r,"a"),num(r,"b")))
        "graph-hyperbola"->conicResponse(tool,graph.hyperbola(num(r,"h"),num(r,"k"),num(r,"a"),num(r,"b"),req(r,"orientation").lowercase()!="vertical"))
        else->fail(tool.id,"UNSUPPORTED","Unsupported graph tool")
    }

    private fun conicResponse(tool:ToolDefinition,c:ConicAnalysis)=ToolResponse(tool.id,c.expression,c.derived+mapOf("expression" to c.expression),metadata=mapOf("family" to c.family,"asymptotes" to c.asymptotes.joinToString("; "),"foci" to c.foci.joinToString("; "),"viewport" to "${c.viewport.minX},${c.viewport.maxX},${c.viewport.minY},${c.viewport.maxY}"))
    private fun legacyResponse(tool:ToolDefinition,result:CalculationResult,normalized:Map<String,String>):ToolResponse=if(!result.isSuccess)fail(tool.id,result.error?.code?:"CALCULATION_ERROR",result.error?.message?:"Calculation failed")else ToolResponse(tool.id,result.primary,mapOf("result" to result.primary)+result.derived,normalizedInput=normalized,metadata=result.metadata,exact=result.exact!=null)

    private fun req(r:ToolRequest,id:String)=r.inputs[id]?.value?.trim()?.takeIf{it.isNotEmpty()}?:throw CalcEx("MISSING_INPUT","$id is required")
    private fun num(r:ToolRequest,id:String)=req(r,id).toDoubleOrNull()?.takeIf{it.isFinite()}?:throw CalcEx("INVALID_NUMBER","$id must be a finite number")
    private fun int(r:ToolRequest,id:String)=req(r,id).toIntOrNull()?:throw CalcEx("INTEGER","$id must be an integer")
    private fun optionalDouble(r:ToolRequest,id:String)=r.inputs[id]?.value?.trim()?.takeIf{it.isNotEmpty()}?.toDoubleOrNull()?.takeIf{it.isFinite()}
    private fun optionalLong(r:ToolRequest,id:String)=r.inputs[id]?.value?.trim()?.takeIf{it.isNotEmpty()}?.toLongOrNull()
    private fun parseDoubles(raw:String)=raw.split(',', ';',' ').mapNotNull{it.trim().takeIf(String::isNotEmpty)}.map{it.toDoubleOrNull()?.takeIf(Double::isFinite)?:throw CalcEx("INVALID_NUMBER","Invalid coefficient: $it")}.also{if(it.isEmpty())throw CalcEx("DATA","Coefficient list cannot be empty")}
    private fun parseLongs(raw:String)=raw.split(',', ';',' ').mapNotNull{it.trim().takeIf(String::isNotEmpty)}.map{it.toLongOrNull()?:throw CalcEx("INTEGER","Invalid integer: $it")}
    private fun fmt(v:Double,st:EngineSettings)=ComplexEngine.formatDouble(v,st)
    private fun listFmt(v:List<Double>,st:EngineSettings)=v.joinToString(", ","[","]"){fmt(it,st)}
    private fun rootString(r:PolynomialRoot,st:EngineSettings)=if(abs(r.imaginary)<1e-12)fmt(r.real,st)else "${fmt(r.real,st)} ${if(r.imaginary>=0)"+" else "-"} ${fmt(abs(r.imaginary),st)}i"
    private fun isSimple(v:Double)=abs(v-kotlin.math.round(v))<1e-12
    private fun fail(id:String,code:String,message:String)=ToolResponse(id,error=StructuredError(code,message))
}
