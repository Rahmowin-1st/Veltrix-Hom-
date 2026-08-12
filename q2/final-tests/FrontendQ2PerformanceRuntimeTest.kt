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

    private fun requiredTag(scenario: ActivityScenario<MainActivity>, tag: String): View {
        var result: View? = null
        scenario.onActivity { result = S.findByTag(it.window.decorView, tag) }
        return result ?: error("Required visible tag missing from performance workload: $tag")
    }

    private fun requiredDescription(scenario: ActivityScenario<MainActivity>, description: String): View {
        var result: View? = null
        scenario.onActivity { result = S.findByDescription(it.window.decorView, description) }
        return result ?: error("Required visible control missing from performance workload: $description")
    }

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
            scenario.onActivity { activity ->
                activity.window.addOnFrameMetricsAvailableListener(listener, handler)
                S.invoke(activity, "showScreen", "standard", false)
                S.invoke(activity, "closeBrain", false)
            }
            Thread.sleep(300)

            // Standard keypad: the legacy equals compatibility tag is key__ (safeTag("=") == "_").
            repeat(8) {
                for (tag in listOf("key_1", "key_plus", "key_2", "key__")) {
                    S.injectTap(requiredTag(scenario, tag), 32)
                }
            }

            // Exercise the spatial Main Brain environment from a deterministic closed state.
            repeat(2) {
                S.injectTap(requiredDescription(scenario, "Main Brain"), 55)
                Thread.sleep(220)
                S.injectTap(requiredDescription(scenario, "Close Main Brain"), 55)
                Thread.sleep(190)
            }

            val display = requiredTag(scenario, "calculator_display")
            S.injectDrag(display, 0.82f, 0.18f, durationMs = 500)
            Thread.sleep(250)
            scenario.onActivity { S.invoke(it, "closeBrain", false) }
            Thread.sleep(140)

            scenario.onActivity { S.invoke(it, "showScreen", "library", false) }
            Thread.sleep(280)
            S.injectDrag(requiredTag(scenario, "library_subject_lens"), 0.05f, 0.45f, durationMs = 520)
            Thread.sleep(180)
            scenario.onActivity {
                val q = S.findByTag(it.window.decorView, "library_mega_search") as? NoImeEditText
                    ?: error("Required library search missing from performance workload")
                q.requestFocus()
                q.setText("biyt")
                // Library filtering is live and is driven by renderLibrary/custom keyboard callbacks.
                S.invoke(it, "renderLibrary")
            }
            Thread.sleep(300)

            scenario.onActivity { S.invoke(it, "showConverterEnvironment", "length") }
            Thread.sleep(240)
            val swap = requiredDescription(scenario, "Swap units")
            repeat(5) {
                S.injectTap(swap, 45)
                Thread.sleep(80)
            }

            scenario.onActivity { S.invoke(it, "showScreen", "settings", false) }
            Thread.sleep(240)
            val slider = run {
                var v: View? = null
                scenario.onActivity { v = findClass(it.window.decorView, "LiquidSlider") }
                v ?: error("Required LiquidSlider missing from performance workload")
            }
            S.injectDrag(slider, 0.12f, 0.88f, durationMs = 680)

            scenario.onActivity { S.invoke(it, "showScreen", "graph", false) }
            Thread.sleep(850)
            S.injectDrag(requiredTag(scenario, "graph_canvas"), 0.75f, 0.30f, durationMs = 620)
            Thread.sleep(750)

            scenario.onActivity { activity -> activity.window.removeOnFrameMetricsAvailableListener(listener) }
        }

        Thread.sleep(250)
        thread.quitSafely()
        thread.join(1000)
        val frames = total.get()
        val duration = System.currentTimeMillis() - started
        val json = JSONObject()
            .put("framesMeasured", frames)
            .put("framesOver16_67ms", over16.get())
            .put("framesOver33_33ms", over32.get())
            .put("maxFrameMs", maxNs.get() / 1_000_000.0)
            .put("durationMs", duration)
            .put("environment", "GitHub Actions API 35 x86_64 emulator; SwiftShader indirect")
            .put("physicalDevice", false)
        S.writeText("performance/frame_metrics.json", json.toString(2))
        assertTrue("FrameMetrics workload must measure real frames, got $frames", frames > 20)
    }

    private fun findClass(root: View, name: String): View? {
        if (root.javaClass.simpleName == name && root.isShown) return root
        if (root is android.view.ViewGroup && root.visibility == View.VISIBLE) {
            for (i in 0 until root.childCount) findClass(root.getChildAt(i), name)?.let { return it }
        }
        return null
    }
}
