package com.veltrix.calculator.app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.veltrix.calculator.core.AppNavigationState
import com.veltrix.calculator.core.PlatformEngine
import com.veltrix.calculator.core.ToolInput
import com.veltrix.calculator.core.ToolRequest
import com.veltrix.calculator.core.WorkspaceTab
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Locale

@RunWith(AndroidJUnit4::class)
class V4FinalRuntimeAcceptanceTest {
    private val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext

    private fun provider(type: WidgetType): VeltrixCoreWidgetProvider = when (type) {
        WidgetType.MINI_CALCULATOR -> MiniCalculatorWidgetProvider()
        WidgetType.QUICK_CONVERTER -> QuickConverterWidgetProvider()
        WidgetType.CURRENCY_CONVERTER -> CurrencyConverterWidgetProvider()
        WidgetType.CURRENCY_RATE_BOARD -> CurrencyRateBoardWidgetProvider()
    }

    private fun boundIds(type: WidgetType): IntArray {
        val manager = AppWidgetManager.getInstance(context)
        return manager.getAppWidgetIds(ComponentName(context, WidgetRenderer.providerClass(type)))
    }

    @Test
    fun aRealLauncherBoundProvidersResizeAndMultiInstance() {
        val manager = AppWidgetManager.getInstance(context)
        WidgetType.entries.forEach { type ->
            val ids = boundIds(type)
            assertTrue("No launcher-bound instance for ${type.wireName}", ids.isNotEmpty())
            val id = ids.first()
            val p = provider(type)
            val tiers = WidgetSizeTier.entries
            tiers.forEach { tier ->
                val options = Bundle().apply {
                    putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, tier.minWidthDp)
                    putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, tier.minWidthDp)
                    putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, tier.minHeightDp)
                    putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, tier.minHeightDp)
                }
                p.onAppWidgetOptionsChanged(context, manager, id, options)
                assertEquals(
                    "Bound widget did not persist ${tier.wireName} capability",
                    tier.wireName,
                    WidgetConfigStore(context).load(id)?.sizeCapability
                )
            }
            val config = WidgetConfigStore(context).load(id)
            assertNotNull("Bound provider did not own appWidgetId=$id", config)
            assertEquals(type, config!!.widgetType)
            val uri = WidgetRenderer.deepLinkUri(context, config)
            assertEquals("veltrix", uri.scheme)
            assertTrue(uri.host in setOf("home", "converter"))
        }

        val miniIds = boundIds(WidgetType.MINI_CALCULATOR)
        assertTrue("Real launcher multi-instance Mini Calculator proof requires >=2 IDs", miniIds.size >= 2)
        val a = miniIds[0]
        val b = miniIds[1]
        assertTrue("appWidgetIds must be independent", a != b)
        WidgetConfigStore(context).save(WidgetConfig.default(a, WidgetType.MINI_CALCULATOR).copy(defaultMode = "standard-calculator"))
        WidgetConfigStore(context).save(WidgetConfig.default(b, WidgetType.MINI_CALCULATOR).copy(defaultMode = "scientific-calculator"))
        WidgetRuntimeStore(context).setExpression(a, "6*7")
        WidgetRuntimeStore(context).setExpression(b, "9*9")
        WidgetProductRuntime.calculateMini(context, a)
        WidgetProductRuntime.calculateMini(context, b)
        assertEquals("42", WidgetRuntimeStore(context).result(a))
        assertEquals("81", WidgetRuntimeStore(context).result(b))
        assertEquals("standard-calculator", WidgetConfigStore(context).load(a)?.defaultMode)
        assertEquals("scientific-calculator", WidgetConfigStore(context).load(b)?.defaultMode)
    }

    @Test
    fun bSeedRealLauncherProcessDeathState() {
        val mini = boundIds(WidgetType.MINI_CALCULATOR).firstOrNull()
            ?: throw AssertionError("No real bound Mini Calculator")
        WidgetProductRuntime.ensureConfig(context, mini, WidgetType.MINI_CALCULATOR)
        WidgetRuntimeStore(context).setExpression(mini, "123+321")
        WidgetProductRuntime.calculateMini(context, mini)
        context.getSharedPreferences("v4_final_acceptance", Context.MODE_PRIVATE)
            .edit().putInt("realMiniId", mini).commit()
        assertEquals("444", WidgetRuntimeStore(context).result(mini))
    }

    @Test
    fun cVerifyRealLauncherProcessDeathState() {
        val mini = context.getSharedPreferences("v4_final_acceptance", Context.MODE_PRIVATE)
            .getInt("realMiniId", AppWidgetManager.INVALID_APPWIDGET_ID)
        assertTrue("Missing process-death seed", mini != AppWidgetManager.INVALID_APPWIDGET_ID)
        assertTrue(boundIds(WidgetType.MINI_CALCULATOR).contains(mini))
        assertEquals("123+321", WidgetRuntimeStore(context).expression(mini))
        assertEquals("444", WidgetRuntimeStore(context).result(mini))
        assertEquals(WidgetType.MINI_CALCULATOR, WidgetConfigStore(context).load(mini)?.widgetType)
    }

    @Test
    fun dOfflineDeterministicAndCachedCurrencyTruth() {
        val engine = PlatformEngine()
        assertEquals(
            "42",
            engine.execute(ToolRequest("standard-calculator", mapOf("expression" to ToolInput("6*7")))).primary
        )
        val repository = CurrencyRepository(context)
        val cached = repository.cached("USD", "EUR", 0)
        assertNotNull("Final live provider probe must seed USD/EUR cache before offline acceptance", cached)
        val converted = repository.convertCached(2.0, "USD", "EUR")
        assertNotNull("Verified last-known currency value must remain usable from cache", converted)
        assertTrue(converted!!.first.isFinite() && converted.first > 0.0)
    }

    @Test
    fun eMeasuredBackendRuntimeOperations() {
        val engine = PlatformEngine()
        val history = HistoryDb(context)
        history.addStructured(
            "standard-calculator", "Math", "6*7", "42",
            """{"expression":"6*7"}""", "6*7", """{"result":"42"}""", 4, null, """{"source":"perf"}"""
        )

        fun sample(name: String, iterations: Int = 20, action: () -> Unit) {
            repeat(3) { action() }
            var min = Long.MAX_VALUE
            var max = 0L
            var sum = 0L
            repeat(iterations) {
                val start = SystemClock.elapsedRealtimeNanos()
                action()
                val elapsed = (SystemClock.elapsedRealtimeNanos() - start).coerceAtLeast(1)
                min = minOf(min, elapsed)
                max = maxOf(max, elapsed)
                sum += elapsed
            }
            val avgMs = sum.toDouble() / iterations / 1_000_000.0
            val message = String.format(
                Locale.US,
                "VELTRIX_PERF name=%s samples=%d min_ns=%d avg_ms=%.4f max_ns=%d",
                name, iterations, min, avgMs, max
            )
            println(message)
            InstrumentationRegistry.getInstrumentation().sendStatus(
                0,
                Bundle().apply { putString("stream", message + "\n") }
            )
            assertTrue("$name must produce non-zero samples", min > 0 && max > 0 && sum > 0)
        }

        sample("calculator_execute") {
            val result = engine.execute(
                ToolRequest("standard-calculator", mapOf("expression" to ToolInput("12345*67+89")))
            )
            assertTrue(result.isSuccess)
        }
        sample("registry_lookup", 100) {
            assertNotNull(engine.registry.get("physics-ohms-law"))
        }
        sample("conversion", 100) {
            assertTrue(engine.convert(100.0, "km", "mi").value > 0.0)
        }
        sample("navigation", 100) {
            val nav = AppNavigationState()
            nav.openWorkspace(WorkspaceTab.LIBRARY)
            nav.switchTab(WorkspaceTab.CONVERTERS)
            nav.openSettings()
            nav.back()
        }
        sample("history_load", 50) {
            assertTrue(history.list(limit = 20).isNotEmpty())
        }
        sample("currency_cache_read", 50) {
            CurrencyRepository(context).cached("USD", "EUR", 0)
        }
        val perfCache = CurrencyCacheStore(context)
        val perfProvider = object : CurrencyRateProvider {
            override val id: String = "perf-fixture"
            override fun fetch(base: String, quote: String) =
                ProviderRate(base, quote, 1.25, "2026-08-21", id)
        }
        val perfRepository = CurrencyRepository(context, perfProvider, perfCache)
        sample("currency_refresh", 20) {
            assertTrue(perfRepository.rate("USD", "EUR", true).rate > 0.0)
        }

        val realMini = boundIds(WidgetType.MINI_CALCULATOR).firstOrNull()
        if (realMini != null) {
            sample("widget_update", 20) {
                WidgetProductRuntime.calculateMini(context, realMini)
            }
            sample("widget_resize_classification", 50) {
                assertEquals(WidgetSizeTier.M, WidgetSizeTier.forSize(203, 220))
                assertEquals(WidgetSizeTier.XL, WidgetSizeTier.forSize(349, 455))
            }
        }

        sample("repeated_interactions", 50) {
            val nav = AppNavigationState()
            nav.openWorkspace()
            nav.openTool("physics-ohms-law")
            nav.back()
            engine.registry.get("physics-ohms-law")
            engine.convert(1.0, "m", "cm")
        }
    }
}
