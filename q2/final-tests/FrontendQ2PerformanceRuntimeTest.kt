package com.veltrix.calculator.app

import android.os.Handler
import android.os.HandlerThread
import android.view.FrameMetrics
import android.view.View
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.veltrix.calculator.app.frontend.NoImeEditText
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.atomic.AtomicLong

@RunWith(AndroidJUnit4::class)
class FrontendQ2PerformanceRuntimeTest {
    private val S = Q2EvidenceSupport

    @Test fun measuredNonZeroFrameWorkload() {
        val total = AtomicLong(0)
        val over16 = AtomicLong(0)
        val over32 = AtomicLong(0)
        val maxNs = AtomicLong(0)
        val thread = HandlerThread("q2-frame-metrics").apply { start() }
        val handler = Handler(thread.looper)
        val started = System.currentTimeMillis()
        val listener = android.view.Window.OnFrameMetricsAvailableListener { _, metrics, _ ->
            val ns = metrics.getMetric(FrameMetrics.TOTAL_DURATION)
            if (ns > 0) {
                total.incrementAndGet()
                if (ns > 16_666_667L) over16.incrementAndGet()
                if (ns > 33_333_334L) over32.incrementAndGet()
                maxNs.updateAndGet { old -> maxOf(old, ns) }
            }
        }
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity -> activity.window.addOnFrameMetricsAvailableListener(listener, handler) }
            Thread.sleep(300)
            repeat(8) {
                for (tag in listOf("key_1","key_plus","key_2","key_equals")) {
                    var v:View?=null; scenario.onActivity { v=S.findByTag(it.window.decorView,tag) }; S.injectTap(v!!,32)
                }
            }
            repeat(3) {
                var b:View?=null; scenario.onActivity { b=S.findByDescription(it.window.decorView,"Main Brain") }; S.injectTap(b!!,55); Thread.sleep(180)
                var c:View?=null; scenario.onActivity { c=S.findByDescription(it.window.decorView,"Close Main Brain") }; S.injectTap(c!!,55); Thread.sleep(160)
            }
            val display = run { var v:View?=null; scenario.onActivity { v=S.findByTag(it.window.decorView,"calculator_display") }; v!! }
            S.injectDrag(display,0.82f,0.18f,durationMs=500); Thread.sleep(250)
            scenario.onActivity { S.invoke(it,"closeBrain",false) }; Thread.sleep(120)
            scenario.onActivity { S.invoke(it,"showScreen","library",false) }; Thread.sleep(250)
            val lens = run { var v:View?=null; scenario.onActivity { v=S.findByTag(it.window.decorView,"library_subject_lens") }; v!! }
            S.injectDrag(lens,0.05f,0.45f,durationMs=520); Thread.sleep(180)
            scenario.onActivity { val q=S.findByTag(it.window.decorView,"library_mega_search") as NoImeEditText; q.requestFocus(); q.setText("biyt"); S.clickableAncestor(S.findByText(it.window.decorView,"Search"))?.performClick() }; Thread.sleep(300)
            scenario.onActivity { S.invoke(it,"showConverterEnvironment","length") }; Thread.sleep(220)
            var swap:View?=null; scenario.onActivity { swap=S.findByDescription(it.window.decorView,"Swap units") }; repeat(5){ S.injectTap(swap!!,45); Thread.sleep(80) }
            scenario.onActivity { S.invoke(it,"showScreen","settings",false) }; Thread.sleep(220)
            var slider:View?=null; scenario.onActivity { slider=findClass(it.window.decorView,"LiquidSlider") }; if(slider!=null) S.injectDrag(slider!!,0.12f,0.88f,durationMs=680)
            scenario.onActivity { S.invoke(it,"showScreen","graph",false) }; Thread.sleep(850)
            var graph:View?=null; scenario.onActivity { graph=S.findByTag(it.window.decorView,"graph_canvas") }; S.injectDrag(graph!!,0.75f,0.30f,durationMs=620); Thread.sleep(750)
            scenario.onActivity { activity -> activity.window.removeOnFrameMetricsAvailableListener(listener) }
        }
        Thread.sleep(250)
        thread.quitSafely(); thread.join(1000)
        val frames = total.get()
        val duration = System.currentTimeMillis() - started
        val json = JSONObject()
            .put("framesMeasured", frames)
            .put("framesOver16_67ms", over16.get())
            .put("framesOver33_33ms", over32.get())
            .put("maxFrameMs", maxNs.get()/1_000_000.0)
            .put("durationMs", duration)
            .put("environment", "GitHub Actions API 35 x86_64 emulator; SwiftShader indirect")
            .put("physicalDevice", false)
        S.writeText("performance/frame_metrics.json", json.toString(2))
        assertTrue("FrameMetrics workload must measure real frames, got $frames", frames > 20)
    }

    private fun findClass(root:View,name:String):View? {
        if(root.javaClass.simpleName==name && root.isShown) return root
        if(root is android.view.ViewGroup && root.visibility==View.VISIBLE) for(i in 0 until root.childCount) findClass(root.getChildAt(i),name)?.let{return it}
        return null
    }
}
