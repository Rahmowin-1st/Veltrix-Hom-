package com.veltrix.calculator.app

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.veltrix.calculator.core.*
import org.junit.Assert.*
import org.junit.FixMethodOrder
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.MethodSorters
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.abs

@FixMethodOrder(MethodSorters.NAME_ASCENDING)
@RunWith(AndroidJUnit4::class)
class BackendMasterRuntimeTest {
    private val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private fun <T:View>MainActivity.tagged(tag:String):T{@Suppress("UNCHECKED_CAST") return window.decorView.findViewWithTag<View>(tag) as T}
    private fun waitResult(s:ActivityScenario<MainActivity>,timeout:Long=10000):String{val end=System.currentTimeMillis()+timeout;var v="";while(System.currentTimeMillis()<end){s.onActivity{v=it.tagged<TextView>("result").text.toString()};if(v!="…")return v;Thread.sleep(60)};return v}

    @Test fun aColdLaunchStandardAndScientificProgrammer(){
        ActivityScenario.launch(MainActivity::class.java).use{s->s.onActivity{a->assertTrue(a.tagged<EditText>("standard-input").isShown);a.tagged<EditText>("standard-input").setText("2+3*4");a.tagged<Button>("calculate").performClick()};assertEquals("14",waitResult(s))}
        val e=PlatformEngine();assertEquals("0.5",e.execute(ToolRequest("scientific-calculator",mapOf("expression" to ToolInput("sin(30)")))).primary)
        assertEquals("255",e.execute(ToolRequest("programmer-calculator",mapOf("expression" to ToolInput("0xFF"),"bitWidth" to ToolInput("16"),"signedness" to ToolInput("unsigned")))).primary)
    }

    @Test fun bRegistrySearchAndMajorSubjects(){
        val e=PlatformEngine();assertTrue(e.registry.all().size>=100);assertEquals(Subject.entries.toSet(),e.registry.all().map{it.subject}.toSet());assertEquals("vieta",MegaSearchEngine(e.registry).search("Biyt").first().tool.id)
        fun ok(id:String,inputs:Map<String,String>,unknown:String?=null)=e.execute(ToolRequest(id,inputs.mapValues{ToolInput(it.value)},unknown)).also{assertTrue("$id ${it.error}",it.isSuccess)}
        assertEquals("1, 2",ok("quadratic-solver",mapOf("a" to "2","b" to "-6","c" to "3","rhs" to "-1")).primary)
        assertEquals("3 A",ok("physics-ohms-law",mapOf("V" to "12","R" to "4"),"I").primary)
        assertEquals("5 m",ok("geometry-right-triangle",mapOf("a" to "3","b" to "4"),"c").primary)
        assertTrue(ok("molar-mass",mapOf("formula" to "H2SO4")).primary.endsWith("g/mol"))
        assertEquals("2",ok("standard-deviation",mapOf("data" to "2,4,4,4,5,5,7,9")).primary)
        assertTrue(ok("loan-payment",mapOf("principal" to "250000","annualRate" to "6.5","months" to "360")).primary.startsWith("1580.17"))
        assertEquals("30 days",ok("date-difference",mapOf("start" to "2026-01-01","end" to "2026-01-31")).primary)
        assertEquals("4 words",ok("text-analyzer",mapOf("text" to "One two. Three four!")).primary)
        assertEquals("2",ok("linear-equation",mapOf("a" to "2","b" to "1","rhs" to "5")).primary)
        val tri=ok("triangle-solver",mapOf("a" to "3","b" to "4","c" to "5"));assertEquals("false",tri.metadata["ambiguous"]);assertTrue(tri.primary.contains("C=90"))
        assertTrue(abs(e.convert(0.0,"c","f").value-32.0)<1e-9)
    }

    @Test fun cCurrencyProviderCacheFailureOfflineArchitecture(){
        val cache=CurrencyCacheStore(context);cache.clear()
        val provider=object:CurrencyRateProvider{override val id="fake-live";override fun fetch(base:String,quote:String)=ProviderRate(base,quote,123.45,"2026-08-11",id)}
        val repo=CurrencyRepository(context,provider,cache);val first=repo.rate("USD","UZS",true);assertFalse(first.stale);assertEquals(123.45,first.rate,0.0)
        val failing=object:CurrencyRateProvider{override val id="fail";override fun fetch(base:String,quote:String):ProviderRate=throw CurrencyProviderException("TEST_FAILURE")}
        val cached=CurrencyRepository(context,failing,cache).rate("USD","UZS",true);assertTrue(cached.stale);assertTrue(cached.fromCache);assertEquals(123.45,cached.rate,0.0)
    }

    @Test fun dPersistenceSeed(){
        HistoryDb(context).clear();PersonalizationStore(context).clear();WidgetConfigStore(context).delete(4242)
        HistoryDb(context).addStructured("quadratic-solver","Math","Quadratic Equation Solver","1, 2","{\"a\":\"2\"}","{\"a\":\"2\"}","{\"roots\":\"1, 2\"}",1,null,"{\"seed\":true}")
        PersonalizationStore(context).recordTool("vieta");PersonalizationStore(context).recordTool("molar-mass")
        val personalized=PersonalizationStore(context).load().copy(perToolSettings=mapOf("quadratic-solver" to mapOf("form" to "degree-2")))
        PersonalizationStore(context).save(personalized)
        assertEquals("degree-2",PersonalizationStore(context).load().perToolSettings["quadratic-solver"]?.get("form"))
        WidgetConfigStore(context).save(WidgetConfig.default(4242,WidgetType.QUICK_CONVERTER).copy(converterCategory="Length",converterFrom="km",converterTo="m",fixedAmount=100.0))
        WidgetRuntimeStore(context).setExpression(4242,"100");WidgetProductRuntime.recalculateQuick(context,WidgetConfigStore(context).load(4242)!!)
        assertEquals("100000 m",WidgetRuntimeStore(context).result(4242))
    }

    @Test fun eOcrBundledIntegrationAndTextCounts(){
        val bitmap=Bitmap.createBitmap(900,260,Bitmap.Config.ARGB_8888);val canvas=Canvas(bitmap);canvas.drawColor(Color.WHITE);val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=Color.BLACK;textSize=88f};canvas.drawText("Veltrix 123",40f,150f,paint)
        val latch=CountDownLatch(1);var result:Result<OcrTextResult>?=null;val service=OcrService(context);service.recognizeBitmap(bitmap,"English / Latin"){result=it;latch.countDown()};assertTrue("OCR timed out",latch.await(15,TimeUnit.SECONDS));service.close();assertTrue("OCR integration failed: ${result?.exceptionOrNull()}",result?.isSuccess==true);val text=result!!.getOrThrow().text;assertTrue("Expected recognized text, got '$text'",text.isNotBlank());assertTrue(TextAnalysisPlatform.analyze(text).characters>0)
    }

    @Test fun fActivityRecreationPreservesDraft(){
        ActivityScenario.launch(MainActivity::class.java).use{s->s.onActivity{it.tagged<EditText>("standard-input").setText("987+13")};s.recreate();s.onActivity{assertEquals("987+13",it.tagged<EditText>("standard-input").text.toString())}}
    }

    @Test fun gOfflineDeterministicAndGraph(){
        val e=PlatformEngine();assertEquals("42",e.execute(ToolRequest("standard-calculator",mapOf("expression" to ToolInput("6*7")))).primary)
        val graph=e.execute(ToolRequest("graph-functions",mapOf("expressions" to ToolInput("1/x; x^2-4"))));assertTrue(graph.isSuccess);assertEquals("2",graph.outputs["seriesCount"])
    }

    @Test fun hStandaloneWidgetRuntimePaths(){
        val standardId=4243;WidgetConfigStore(context).save(WidgetConfig.default(standardId,WidgetType.MINI_CALCULATOR))
        context.getSharedPreferences("widget_runtime",Context.MODE_PRIVATE).edit().putString("${standardId}_expr","6*7").commit()
        MiniCalculatorWidgetProvider().onReceive(context,Intent(context,MiniCalculatorWidgetProvider::class.java).setAction(WidgetActions.EQUALS).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,standardId))
        assertEquals("42",context.getSharedPreferences("widget_runtime",Context.MODE_PRIVATE).getString("${standardId}_result",null))

        val currencyId=4244;CurrencyCacheStore(context).put(ProviderRate("USD","UZS",123.0,"2026-08-11","runtime-fixture"))
        WidgetConfigStore(context).save(WidgetConfig.default(currencyId,WidgetType.CURRENCY_CONVERTER).copy(currencyBase="USD",currencyQuote="UZS",currencyQuotes=listOf("UZS"),fixedAmount=2.0))
        context.getSharedPreferences("widget_runtime",Context.MODE_PRIVATE).edit().putString("${currencyId}_expr","2").commit()
        WidgetProductRuntime.refreshCurrencyFromCache(context,WidgetConfigStore(context).load(currencyId)!!)
        val currencyResult=WidgetRuntimeStore(context).result(currencyId)
        assertTrue("Interactive currency widget did not calculate independently: $currencyResult",currencyResult.contains("246"))
        assertTrue(WidgetRuntimeStore(context).meta(currencyId).contains("runtime-fixture"))

        val converterId=4245;WidgetConfigStore(context).save(WidgetConfig.default(converterId,WidgetType.QUICK_CONVERTER).copy(converterCategory="Mass",converterFrom="kg",converterTo="lb",fixedAmount=10.0))
        WidgetProductRuntime.recalculateQuick(context,WidgetConfigStore(context).load(converterId)!!)
        assertTrue(WidgetRuntimeStore(context).result(converterId).startsWith("22.0462"))
    }

    @Test fun zPersistenceAfterProcessRestart(){
        assertTrue(HistoryDb(context).list().any{it.toolId=="quadratic-solver"&&it.result=="1, 2"})
        val lastUsed=AdaptiveEngine.lastUsed5(PersonalizationStore(context).load());assertTrue(lastUsed.contains("molar-mass"));assertTrue(lastUsed.contains("vieta"))
        assertEquals("degree-2",PersonalizationStore(context).load().perToolSettings["quadratic-solver"]?.get("form"))
        val config=WidgetConfigStore(context).load(4242);assertNotNull(config);assertEquals(WidgetType.QUICK_CONVERTER,config!!.widgetType);assertEquals("100000 m",WidgetRuntimeStore(context).result(4242))
    }
}
