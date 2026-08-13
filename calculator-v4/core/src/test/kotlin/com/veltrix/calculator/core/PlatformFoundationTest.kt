package com.veltrix.calculator.core

import kotlin.math.abs
import kotlin.random.Random
import kotlin.test.*

class PlatformFoundationTest {
    private val engine=PlatformEngine();private fun req(id:String,vararg pairs:Pair<String,String>,unknown:String?=null)=ToolRequest(id,pairs.associate{it.first to ToolInput(it.second)},unknown)
    private fun ok(r:ToolRequest)=engine.execute(r).also{assertTrue(it.isSuccess,"${r.toolId}: ${it.error}")}
    private fun near(actual:Double,expected:Double,tol:Double=1e-8)=assertTrue(abs(actual-expected)<=tol*maxOf(1.0,abs(expected)),"$actual != $expected")

    @Test fun registryIsCanonicalBroadAndConvertersStaySeparate(){
        val all=engine.registry.all();assertTrue(all.size>=100);assertEquals(Subject.entries.toSet(),all.map{it.subject}.toSet());assertEquals(all.size,all.map{it.id}.toSet().size)
        assertTrue(all.none{it.environmentFamily==EnvironmentFamily.ConverterTool||it.category.equals("Converter",true)})
        assertTrue(engine.registry.widgetTools().isNotEmpty());assertTrue(engine.registry.compactTools().isNotEmpty());assertEquals("standard-calculator",MainBrainSnapshot().standardCalculatorToolId)
        assertFalse(MainBrainSnapshot().toString().contains("Continue",true))
    }

    @Test fun structuredPolynomialAndVieta(){
        val q=ok(req("quadratic-solver","a" to "2","b" to "-6","c" to "3","rhs" to "-1"));assertEquals("1, 2",q.primary);assertEquals("4",q.outputs["discriminant"])
        val complex=ok(req("quadratic-solver","a" to "1","b" to "0","c" to "1"));assertTrue(complex.primary.contains("i"))
        val repeated=ok(req("quadratic-solver","a" to "1","b" to "-2","c" to "1"));assertTrue(repeated.outputs["classification"].orEmpty().contains("repeated"))
        val v=ok(req("vieta","a" to "2","b" to "-6","c" to "4"));assertEquals("3",v.outputs["sum"]);assertEquals("2",v.outputs["product"])
        val cubic=ok(req("cubic-solver","a" to "1","b" to "-6","c" to "11","d" to "-6"));assertTrue(cubic.primary.contains("1")&&cubic.primary.contains("2")&&cubic.primary.contains("3"))
    }

    @Test fun representativeSubjectsExecute(){
        assertEquals("14",ok(req("standard-calculator","expression" to "2+3*4")).primary)
        assertEquals("3 A",ok(req("physics-ohms-law","V" to "12","R" to "4",unknown="I")).primary)
        assertEquals("5 m",ok(req("geometry-right-triangle","a" to "3","b" to "4",unknown="c")).primary)
        val water=ok(req("molar-mass","formula" to "H2O"));near(water.outputs.getValue("molarMass").toDouble(),18.015,1e-10);assertEquals(AtomicMassDataset.VERSION,water.metadata["datasetVersion"])
        assertEquals("2",ok(req("standard-deviation","data" to "2,4,4,4,5,5,7,9")).primary)
        val loan=ok(req("loan-payment","principal" to "250000","annualRate" to "6.5","months" to "360"));near(loan.outputs.getValue("monthlyPayment").toDouble(),1580.1700587,1e-7)
        assertEquals("510",ok(req("programmer-calculator","expression" to "255 << 1","bitWidth" to "16","signedness" to "unsigned")).primary)
        assertEquals("30 days",ok(req("date-difference","start" to "2026-01-01","end" to "2026-01-31")).primary)
        assertEquals("4 words",ok(req("text-analyzer","text" to "One two. Three four!")).primary)
    }

    @Test fun domainValidationRejectsImpossibleInputs(){
        val badTime=engine.execute(req("physics-speed","d" to "10","t" to "-2",unknown="v"));assertFalse(badTime.isSuccess);assertEquals("NEGATIVE_NOT_ALLOWED",badTime.error?.code)
        val badTriangle=engine.execute(req("geometry-right-triangle","a" to "5","c" to "3",unknown="b"));assertFalse(badTriangle.isSuccess)
        assertFailsWith<CalcEx>{ChemistryPlatform.molarMass("Xx2")}
        assertFailsWith<CalcEx>{ProgrammerPlatform().evaluate("256",ProgrammerSettings(8,Signedness.UNSIGNED))}
    }

    @Test fun converterRoundTripsAndOffsetWorks(){
        near(engine.convert(0.0,"c","f").value,32.0,1e-12);near(engine.convert(32.0,"f","c").value,0.0,1e-12)
        val rnd=Random(713)
        for((_,units) in engine.converters.categories())if(units.size>=2){repeat(15){val a=units[rnd.nextInt(units.size)];val b=units[rnd.nextInt(units.size)];val v=rnd.nextDouble(-1000.0,1000.0);val x=engine.convert(v,a.id,b.id);val back=engine.convert(x.value,b.id,a.id);near(back.value,v,1e-9)}}
    }

    @Test fun chemistryParserAndComposition(){
        val ca=ChemistryPlatform.molarMass("Ca(OH)2");near(ca.molarMass,74.092,1e-10);assertEquals(mapOf("Ca" to 1,"O" to 2,"H" to 2),ca.elementCounts)
        val hydrate=ChemistryPlatform.molarMass("CuSO4.5H2O");assertEquals(5,hydrate.elementCounts["H"]?.div(2));near(hydrate.percentComposition.values.sum(),100.0,1e-10)
    }

    @Test fun megaSearchRanksAndSuppressesNoise(){
        val s=MegaSearchEngine(engine.registry);assertEquals("vieta",s.search("Vieta").first().tool.id);assertEquals("vieta",s.search("Biyt").first().tool.id);assertEquals("quadratic-solver",s.search("qudratic").first().tool.id)
        assertTrue(s.search("zzzzzzzzzz").isEmpty());assertTrue(s.search("x").isEmpty());assertTrue(s.search("ohm",Subject.PHYSICS).first().tool.id.contains("ohm"))
    }

    @Test fun adaptiveEngineLastUsedAndReset(){
        var s=AdaptiveState();listOf("vieta","molar-mass","vieta","physics-force","graph-functions","mean","loan-payment").forEach{s=AdaptiveEngine.recordToolUse(s,it)}
        assertEquals(listOf("loan-payment","mean","graph-functions","physics-force","vieta"),AdaptiveEngine.lastUsed5(s));assertTrue(AdaptiveEngine.searchBoosts(s).getValue("vieta")>0);assertEquals(AdaptiveState(),AdaptiveEngine.reset());assertFalse(AdaptiveEngine.mainBrain(s,engine.registry).toString().contains("Continue",true))
    }

    @Test fun graphConicsAndSafeSampling(){
        val p=GraphPlatform().parabolaStandard(1.0,-4.0,3.0);assertEquals("(2, -1)",p.derived["vertex"]);assertTrue(p.derived["roots"].orEmpty().contains("1"))
        val h=GraphPlatform().hyperbola(0.0,0.0,2.0,1.0,true);assertEquals(2,h.asymptotes.size);assertEquals(2,h.foci.size)
        val g=GraphPlatform().functions(listOf("1/x","x^2-4"),GraphViewport(-5.0,5.0,-10.0,10.0),samples=1001);assertEquals(2,g.series.size);assertTrue(g.series[0].segments.size>=2);assertTrue(g.series[1].roots.any{abs(abs(it)-2)<1e-5})
    }

    @Test fun statisticsProperties(){
        val s=StatisticsPlatform.summary(listOf(2.0,4.0,4.0,4.0,5.0,5.0,7.0,9.0));near(s.mean,5.0);near(s.populationStdDev,2.0);assertEquals(listOf(4.0),s.modes);near(StatisticsPlatform.percentile(listOf(0.0,10.0),25.0),2.5)
        near(StatisticsPlatform.weightedMean(listOf(10.0,20.0),listOf(1.0,3.0)),17.5)
    }

    @Test fun structuredAlgebraAndTriangleCoverage() {
        val e=PlatformEngine()
        assertEquals("2", e.execute(ToolRequest("linear-equation", mapOf("a" to ToolInput("2"),"b" to ToolInput("1"),"rhs" to ToolInput("5")))).primary)
        assertEquals("x > 2", e.execute(ToolRequest("linear-inequality", mapOf("a" to ToolInput("-2"),"b" to ToolInput("1"),"operator" to ToolInput("<"),"rhs" to ToolInput("-3")))).primary)
        val sys=e.execute(ToolRequest("linear-system", mapOf("expression" to ToolInput("x+y=3; x-y=1"))));assertTrue(sys.isSuccess);assertTrue(sys.primary.contains("x = 2"));assertTrue(sys.primary.contains("y = 1"))
        val complex=e.execute(ToolRequest("complex-calculator", mapOf("expression" to ToolInput("(2+3i)*(1-i)"))));assertTrue(complex.isSuccess)
        val tri=e.execute(ToolRequest("triangle-solver", mapOf("a" to ToolInput("3"),"b" to ToolInput("4"),"c" to ToolInput("5"))));assertTrue(tri.isSuccess);assertEquals("false",tri.metadata["ambiguous"]);assertTrue(tri.primary.contains("C=90"))
        val ambiguous=e.execute(ToolRequest("triangle-solver", mapOf("a" to ToolInput("10"),"b" to ToolInput("12"),"A" to ToolInput("30"))));assertTrue(ambiguous.isSuccess);assertEquals("true",ambiguous.metadata["ambiguous"])
    }
}
