package com.veltrix.calculator.app

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import com.veltrix.calculator.core.PlatformEngine
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class Iteration11WidgetRuntimeTest {
    private val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val provider = VeltrixToolWidgetProvider()

    private fun clean(id:Int){WidgetConfigStore(context).delete(id);WidgetInteractionStateStore(context).delete(id);WidgetRuntimeStore(context).delete(id)}
    private fun send(id:Int,action:String,key:String?=null){
        val i=Intent(context,VeltrixToolWidgetProvider::class.java).setAction(action).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id)
        key?.let{i.putExtra(VeltrixToolWidgetProvider.EXTRA_KEY,it)}
        provider.onReceive(context,i)
    }
    private fun state(id:Int)=WidgetInteractionStateStore(context).load(id) ?: error("missing widget state $id")
    private fun assertMainActivityNotRequired(){
        val inst=InstrumentationRegistry.getInstrumentation();var active=false
        inst.runOnMainSync { active=ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).any{it is MainActivity} }
        assertFalse("Standalone widget path unexpectedly requires MainActivity",active)
    }

    @Test fun aQuadraticWidgetEditsCoefficientAndSolvesStandalone(){
        val id=51101;clean(id);WidgetConfigStore(context).save(WidgetConfig(id,"quadratic-solver",values=mapOf("a" to "1","b" to "-6","c" to "4","rhs" to "0"),schemaVersion=2))
        send(id,VeltrixToolWidgetProvider.ACTION_CLEAR);send(id,VeltrixToolWidgetProvider.ACTION_KEY,"2");send(id,VeltrixToolWidgetProvider.ACTION_APPLY);send(id,VeltrixToolWidgetProvider.ACTION_SOLVE)
        val s=state(id);assertEquals("2",s.values["a"]);assertEquals("1, 2",s.outputs["roots"]);assertEquals("4",s.outputs["discriminant"]);assertEquals(WidgetInteractionPhase.RESULT,s.phase);assertMainActivityNotRequired()
    }

    @Test fun bVietaWidgetEditsInputAndSolvesStandalone(){
        val id=51102;clean(id);WidgetConfigStore(context).save(WidgetConfig(id,"vieta",values=mapOf("a" to "1","b" to "-5","c" to "6"),schemaVersion=2))
        send(id,VeltrixToolWidgetProvider.ACTION_NEXT_FIELD);send(id,VeltrixToolWidgetProvider.ACTION_NEXT_FIELD);send(id,VeltrixToolWidgetProvider.ACTION_CLEAR);send(id,VeltrixToolWidgetProvider.ACTION_KEY,"4");send(id,VeltrixToolWidgetProvider.ACTION_APPLY);send(id,VeltrixToolWidgetProvider.ACTION_SOLVE)
        val s=state(id);assertEquals("4",s.values["c"]);assertEquals("5",s.outputs["sum"]);assertEquals("4",s.outputs["product"])
    }

    @Test fun cPhysicsWidgetEditsKnownVariableAndSolvesUnknown(){
        val id=51103;clean(id);WidgetConfigStore(context).save(WidgetConfig(id,"physics-ohms-law",values=mapOf("V" to "","I" to "2","R" to "5"),schemaVersion=2))
        send(id,VeltrixToolWidgetProvider.ACTION_NEXT_FIELD);send(id,VeltrixToolWidgetProvider.ACTION_NEXT_FIELD);send(id,VeltrixToolWidgetProvider.ACTION_CLEAR);send(id,VeltrixToolWidgetProvider.ACTION_KEY,"6");send(id,VeltrixToolWidgetProvider.ACTION_APPLY);send(id,VeltrixToolWidgetProvider.ACTION_SOLVE)
        val s=state(id);assertEquals("6",s.values["R"]);assertEquals("12",s.outputs["V"]);assertEquals("12 V",s.result)
    }

    @Test fun dGeometryWidgetEditsDimensionAndSolves(){
        val id=51104;clean(id);WidgetConfigStore(context).save(WidgetConfig(id,"geometry-rectangle-area",values=mapOf("A" to "","w" to "3","h" to "4"),schemaVersion=2))
        send(id,VeltrixToolWidgetProvider.ACTION_NEXT_FIELD);send(id,VeltrixToolWidgetProvider.ACTION_NEXT_FIELD);send(id,VeltrixToolWidgetProvider.ACTION_CLEAR);send(id,VeltrixToolWidgetProvider.ACTION_KEY,"5");send(id,VeltrixToolWidgetProvider.ACTION_APPLY);send(id,VeltrixToolWidgetProvider.ACTION_SOLVE)
        val s=state(id);assertEquals("5",s.values["h"]);assertEquals("15",s.outputs["A"]);assertTrue(s.result.startsWith("15"))
    }

    @Test fun eGraphWidgetParameterEditChangesGraphSignature(){
        val id=51105;clean(id);WidgetConfigStore(context).save(WidgetConfig(id,"graph-parabola",values=mapOf("a" to "1","h" to "0","k" to "0","form" to "vertex"),schemaVersion=2))
        send(id,VeltrixToolWidgetProvider.ACTION_SOLVE);val before=state(id);assertTrue(before.graphSignature.isNotBlank())
        send(id,VeltrixToolWidgetProvider.ACTION_NEXT_FIELD);send(id,VeltrixToolWidgetProvider.ACTION_NEXT_FIELD);send(id,VeltrixToolWidgetProvider.ACTION_CLEAR);send(id,VeltrixToolWidgetProvider.ACTION_KEY,"3");send(id,VeltrixToolWidgetProvider.ACTION_APPLY);send(id,VeltrixToolWidgetProvider.ACTION_SOLVE)
        val after=state(id);assertEquals("3",after.values["k"]);assertNotEquals(before.graphSignature,after.graphSignature)
        VeltrixToolWidgetProvider.update(context,AppWidgetManager.getInstance(context),id)
    }

    @Test fun fFixedCurrencyWidgetKeepsAmountAndUsesNewVerifiedRate(){
        val id=51106;clean(id);val cache=CurrencyCacheStore(context);cache.clear();WidgetConfigStore(context).save(WidgetConfig(id,"currency-fixed",currencyBase="USD",currencyQuote="UZS",fixedAmount=100.0,schemaVersion=2))
        val p1=object:CurrencyRateProvider{override val id="fixture-a";override fun fetch(base:String,quote:String)=ProviderRate(base,quote,2.0,"2026-08-11",this.id)}
        VeltrixToolWidgetProvider.refreshCurrencyWidget(context,id,true,CurrencyRepository(context,p1,cache));assertEquals("200 UZS",WidgetRuntimeStore(context).result(id));assertEquals(100.0,WidgetConfigStore(context).load(id)!!.fixedAmount,0.0)
        val p2=object:CurrencyRateProvider{override val id="fixture-b";override fun fetch(base:String,quote:String)=ProviderRate(base,quote,3.0,"2026-08-11",this.id)}
        VeltrixToolWidgetProvider.refreshCurrencyWidget(context,id,true,CurrencyRepository(context,p2,cache));assertEquals("300 UZS",WidgetRuntimeStore(context).result(id));assertTrue(WidgetRuntimeStore(context).meta(id).contains("fixture-b"))
    }

    @Test fun gInteractiveCurrencyWidgetAmountSwapRefreshAndCalculate(){
        val id=51107;clean(id);val cache=CurrencyCacheStore(context);cache.clear();WidgetConfigStore(context).save(WidgetConfig(id,"currency-interactive",currencyBase="USD",currencyQuote="EUR",fixedAmount=2.0,schemaVersion=2));WidgetRuntimeStore(context).setExpression(id,"2")
        send(id,VeltrixToolWidgetProvider.ACTION_CLEAR);send(id,VeltrixToolWidgetProvider.ACTION_KEY,"3");assertEquals("3",WidgetRuntimeStore(context).expression(id))
        val usdEur=object:CurrencyRateProvider{override val id="fixture-usd-eur";override fun fetch(base:String,quote:String)=ProviderRate(base,quote,2.0,"2026-08-11",this.id)}
        VeltrixToolWidgetProvider.refreshCurrencyWidget(context,id,true,CurrencyRepository(context,usdEur,cache));assertEquals("6 EUR",WidgetRuntimeStore(context).result(id))
        send(id,VeltrixToolWidgetProvider.ACTION_SWAP);val swapped=WidgetConfigStore(context).load(id)!!;assertEquals("EUR",swapped.currencyBase);assertEquals("USD",swapped.currencyQuote)
        val eurUsd=object:CurrencyRateProvider{override val id="fixture-eur-usd";override fun fetch(base:String,quote:String)=ProviderRate(base,quote,0.5,"2026-08-11",this.id)}
        VeltrixToolWidgetProvider.refreshCurrencyWidget(context,id,true,CurrencyRepository(context,eurUsd,cache));assertEquals("1.5 USD",WidgetRuntimeStore(context).result(id))
    }

    @Test fun hWidgetStatePersistsAcrossStoreRecreationAndConfigMigration(){
        val id=51108;clean(id);WidgetConfigStore(context).save(WidgetConfig(id,"vieta",values=mapOf("a" to "1","b" to "-7","c" to "10"),schemaVersion=1));send(id,VeltrixToolWidgetProvider.ACTION_SOLVE)
        val first=state(id);assertEquals("7",first.outputs["sum"]);assertEquals(2,WidgetConfigStore(context).load(id)!!.schemaVersion)
        val second=WidgetInteractionStateStore(context).load(id);assertEquals(first.values,second!!.values);assertEquals(first.outputs,second.outputs);assertEquals(first.revision,second.revision)
    }

    @Test fun iPersistenceSeedForRealProcessRestart(){
        val id=51109;clean(id);WidgetConfigStore(context).save(WidgetConfig(id,"quadratic-solver",values=mapOf("a" to "1","b" to "-5","c" to "6","rhs" to "0"),schemaVersion=2))
        send(id,VeltrixToolWidgetProvider.ACTION_CLEAR);send(id,VeltrixToolWidgetProvider.ACTION_KEY,"2");send(id,VeltrixToolWidgetProvider.ACTION_APPLY);send(id,VeltrixToolWidgetProvider.ACTION_SOLVE)
        val s=state(id);assertEquals("2",s.values["a"]);assertTrue(s.result.isNotBlank());assertEquals(2,WidgetConfigStore(context).load(id)!!.schemaVersion)
    }

    @Test fun yPersistenceAfterRealProcessRestart(){
        val id=51109;val c=WidgetConfigStore(context).load(id);val s=WidgetInteractionStateStore(context).load(id)
        Assume.assumeTrue("Requires the external real-process-restart seed gate", c != null && s != null)
        assertEquals("quadratic-solver",c!!.toolId);assertEquals("2",s!!.values["a"]);assertEquals(WidgetInteractionPhase.RESULT,s.phase);assertTrue(s.result.isNotBlank())
    }

    @Test fun zRegistryWidgetCoverageStillSchemaDriven(){
        val registry=PlatformEngine().registry;val tools=registry.widgetTools();assertTrue(tools.size>=20);assertTrue(tools.all{it.inputSchema.isNotEmpty()&&it.outputSchema.isNotEmpty()});assertTrue(tools.any{it.id=="quadratic-solver"});assertTrue(tools.any{it.id=="physics-ohms-law"});assertTrue(tools.any{it.id=="geometry-rectangle-area"});assertTrue(tools.any{it.id=="statistics-dataset"})
    }
}
