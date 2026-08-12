package com.veltrix.calculator.app

import android.view.View
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.veltrix.calculator.app.frontend.NoImeEditText
import com.veltrix.calculator.core.PlatformEngine
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FrontendQ2MotionEvidenceTest {
    private val S = Q2EvidenceSupport
    private val platform = PlatformEngine()
    private fun launch(block: (ActivityScenario<MainActivity>) -> Unit) = ActivityScenario.launch(MainActivity::class.java).use { scenario -> Thread.sleep(220); block(scenario) }
    private fun visible(s: ActivityScenario<MainActivity>, tag: String): View { var v:View?=null; s.onActivity { v=S.findByTag(it.window.decorView, tag) }; return v ?: error(tag) }
    private fun show(s: ActivityScenario<MainActivity>, screen: String) { s.onActivity { S.invoke(it,"showScreen",screen,false) }; Thread.sleep(160) }
    private fun openTool(s: ActivityScenario<MainActivity>, id:String) { val t=platform.registry.get(id)!!; s.onActivity { S.invoke(it,"openTool",t) }; Thread.sleep(180) }

    @Test fun clip01_standard_press_rapid_equals() = launch { s ->
        listOf("key_1","key_2","key_plus","key_3").forEach { tag -> S.injectTap(visible(s,tag),55) }
        S.injectTap(visible(s,"key__"),120); Thread.sleep(500)
    }
    @Test fun clip02_standard_scientific_continuity() = launch { s ->
        val seg=visible(s,"calculator_mode_segmented"); S.injectDrag(seg,0.17f,0.50f,durationMs=420); Thread.sleep(350); S.injectDrag(seg,0.50f,0.17f,durationMs=420); Thread.sleep(300)
    }
    @Test fun clip03_main_brain_icon_open_close() = launch { s ->
        var b:View?=null; s.onActivity { b=S.findByDescription(it.window.decorView,"Main Brain") }; S.injectTap(b ?: error("Main Brain"),110); Thread.sleep(550)
        var c:View?=null; s.onActivity { c=S.findByDescription(it.window.decorView,"Close Main Brain") }; S.injectTap(c ?: error("Close Main Brain"),100); Thread.sleep(450)
    }
    @Test fun clip04_main_brain_direct_drag_cancel_complete() = launch { s ->
        val display=visible(s,"calculator_display"); S.injectDrag(display,0.80f,0.62f,durationMs=360); Thread.sleep(450); S.injectDrag(display,0.82f,0.16f,durationMs=620); Thread.sleep(550)
    }
    @Test fun clip05_library_subject_moving_lens() = launch { s ->
        show(s,"library"); val lens=visible(s,"library_subject_lens"); S.injectDrag(lens,0.05f,0.25f,durationMs=420); Thread.sleep(280); S.injectDrag(lens,0.25f,0.45f,durationMs=420); Thread.sleep(300)
    }
    @Test fun clip06_library_custom_keyboard_biyt_vieta() = launch { s ->
        show(s,"library"); s.onActivity { (S.findByTag(it.window.decorView,"library_mega_search") as NoImeEditText).requestFocus() }; Thread.sleep(240)
        listOf("B","I","Y","T").forEach { ch -> var v:View?=null; s.onActivity { v=S.findByText(it.window.decorView,ch) }; S.injectTap(v ?: error("keyboard $ch"),75); Thread.sleep(120) }; Thread.sleep(450)
    }
    @Test fun clip07_library_item_to_purpose_tool() = launch { s ->
        show(s,"library"); s.onActivity {
            val q=S.findByTag(it.window.decorView,"library_mega_search") as NoImeEditText
            q.requestFocus(); q.setText("vieta"); S.invoke(it,"renderLibrary")
        }; Thread.sleep(300)
        var v:View?=null; s.onActivity { v=S.clickableAncestor(S.findByText(it.window.decorView,"Vieta's Formulas")) }; S.injectTap(v ?: error("Vieta result"),90); Thread.sleep(600)
    }
    @Test fun clip08_polynomial_degree_morph() = launch { s ->
        openTool(s,"quadratic-solver"); val lens=visible(s,"polynomial_degree_lens"); S.injectDrag(lens,0.16f,0.50f,durationMs=460); Thread.sleep(550); val next=visible(s,"polynomial_degree_lens"); S.injectDrag(next,0.50f,0.84f,durationMs=460); Thread.sleep(500)
    }
    @Test fun clip09_converter_swap() = launch { s ->
        s.onActivity { S.invoke(it,"showConverterEnvironment","length") }; Thread.sleep(260); var v:View?=null; s.onActivity { v=S.findByDescription(it.window.decorView,"Swap units") }; S.injectTap(v ?: error("Swap units"),130); Thread.sleep(500)
    }
    @Test fun clip10_currency_refresh_state() = launch { s ->
        CurrencyCacheStore(S.targetContext).put(ProviderRate("USD","UZS",12600.0,"2026-08-12","q2-evidence"),System.currentTimeMillis())
        s.onActivity { S.invoke(it,"showCurrencyEnvironment") }; Thread.sleep(400); var v:View?=null; s.onActivity { v=S.findByText(it.window.decorView,"Refresh rate") }; S.injectTap(v ?: error("Refresh rate"),90); Thread.sleep(900)
    }
    @Test fun clip11_segmented_rapid_retarget() = launch { s ->
        val seg=visible(s,"calculator_mode_segmented"); S.injectTapAt(seg,0.5f); Thread.sleep(90); S.injectTapAt(seg,0.84f); Thread.sleep(90); S.injectTapAt(seg,0.17f); Thread.sleep(500)
    }
    @Test fun clip12_slider_direct_manipulation() = launch { s ->
        show(s,"settings"); var slider:View?=null; s.onActivity { root -> slider=findFirstClass(root.window.decorView,"LiquidSlider") }; S.injectDrag(slider ?: error("LiquidSlider"),0.18f,0.82f,durationMs=720); Thread.sleep(450)
    }
    @Test fun clip13_expanded_glass_control_space() = launch { s ->
        var b:View?=null; s.onActivity { b=S.findByDescription(it.window.decorView,"Main Brain") }; S.injectTap(b ?: error("Main Brain"),110); Thread.sleep(850)
    }
    @Test fun clip14_graph_parameter_change() = launch { s ->
        show(s,"graph"); s.onActivity { (S.findByTag(it.window.decorView,"graph_expression") as NoImeEditText).setText("x^2"); S.findByTag(it.window.decorView,"graph_plot")?.performClick() }; Thread.sleep(800)
        s.onActivity { (S.findByTag(it.window.decorView,"graph_expression") as NoImeEditText).setText("1/x"); S.findByTag(it.window.decorView,"graph_plot")?.performClick() }; Thread.sleep(900)
    }
    @Test fun clip15_graph_pan_pinch_crosshair() = launch { s ->
        show(s,"graph"); Thread.sleep(750); val graph=visible(s,"graph_canvas"); S.injectDrag(graph,0.70f,0.35f,0.50f,650); Thread.sleep(350); S.injectPinch(graph,0.20f,0.52f,0.5f,620); Thread.sleep(350); S.injectTap(graph,100); Thread.sleep(500)
    }
    @Test fun clip16_system_back_behavior() = launch { s ->
        show(s,"library"); Thread.sleep(300); S.shell("input keyevent KEYCODE_BACK"); Thread.sleep(550)
    }
    @Test fun clip17_reduced_motion_comparison() {
        S.targetContext.getSharedPreferences("calculator_settings",0).edit().putBoolean("reduced_motion",true).commit()
        try { launch { s -> var b:View?=null; s.onActivity { b=S.findByDescription(it.window.decorView,"Main Brain") }; S.injectTap(b ?: error("Main Brain"),90); Thread.sleep(450) } }
        finally { S.targetContext.getSharedPreferences("calculator_settings",0).edit().putBoolean("reduced_motion",false).commit() }
    }
    private fun findFirstClass(root: View, simpleName:String):View? {
        if(root.javaClass.simpleName==simpleName && root.isShown) return root
        if(root is android.view.ViewGroup && root.visibility==View.VISIBLE) for(i in 0 until root.childCount) findFirstClass(root.getChildAt(i),simpleName)?.let{return it}
        return null
    }
}

private fun Q2EvidenceSupport.injectTapAt(view: View, fx:Float, fy:Float=0.5f) {
    val loc=IntArray(2); view.getLocationInWindow(loc); val x=loc[0]+view.width*fx; val y=loc[1]+view.height*fy
    val down=android.os.SystemClock.uptimeMillis()
    instrumentation.uiAutomation.injectInputEvent(android.view.MotionEvent.obtain(down,down,android.view.MotionEvent.ACTION_DOWN,x,y,0),true)
    Thread.sleep(70)
    instrumentation.uiAutomation.injectInputEvent(android.view.MotionEvent.obtain(down,android.os.SystemClock.uptimeMillis(),android.view.MotionEvent.ACTION_UP,x,y,0),true)
    instrumentation.waitForIdleSync()
}
