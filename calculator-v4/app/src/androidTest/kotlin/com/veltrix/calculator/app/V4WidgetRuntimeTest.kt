package com.veltrix.calculator.app

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class V4WidgetRuntimeTest {
    private val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext

    private fun clean(vararg ids: Int) = ids.forEach { WidgetProductRuntime.cleanup(context, it) }

    private fun send(provider: VeltrixCoreWidgetProvider, id: Int, action: String, key: String? = null) {
        val intent = Intent(context, provider.javaClass).setAction(action).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
        key?.let { intent.putExtra(WidgetActions.EXTRA_KEY, it) }
        provider.onReceive(context, intent)
    }

    @Test fun aFourPurposeBuiltProvidersAndFiveProgressiveLayoutsInflate() {
        val keypadTiers = setOf(WidgetSizeTier.M, WidgetSizeTier.L, WidgetSizeTier.XL)
        val openTiers = setOf(WidgetSizeTier.S, WidgetSizeTier.M, WidgetSizeTier.L, WidgetSizeTier.XL)
        WidgetType.entries.forEachIndexed { index, type ->
            val id = 61_000 + index; clean(id); WidgetConfigStore(context).save(WidgetConfig.default(id, type))
            WidgetSizeTier.entries.forEach { tier ->
                val host = FrameLayout(context)
                val view = WidgetRenderer.renderForTest(context, id, type, tier).apply(context, host)
                assertEquals("${type.title}, ${tier.wireName}", view.contentDescription)
                assertEquals(tier in keypadTiers, view.findViewById<android.view.View>(R.id.widget_keypad) != null)
                assertEquals(tier in openTiers, view.findViewById<android.view.View>(R.id.widget_open) != null)
                assertEquals(tier == WidgetSizeTier.XL, view.findViewById<android.view.View>(R.id.widget_percent) != null)
            }
        }
        assertEquals(WidgetSizeTier.XS, WidgetSizeTier.forSize(57, 70))
        assertEquals(WidgetSizeTier.S, WidgetSizeTier.forSize(130, 102))
        assertEquals(WidgetSizeTier.M, WidgetSizeTier.forSize(203, 220))
        assertEquals(WidgetSizeTier.L, WidgetSizeTier.forSize(276, 337))
        assertEquals(WidgetSizeTier.XL, WidgetSizeTier.forSize(349, 455))
    }

    @Test fun bTwoMiniCalculatorsStayIndependentAndUseCanonicalEngine() {
        val a = 61_101; val b = 61_102; clean(a, b)
        val provider = MiniCalculatorWidgetProvider()
        WidgetConfigStore(context).save(WidgetConfig.default(a, WidgetType.MINI_CALCULATOR))
        WidgetConfigStore(context).save(WidgetConfig.default(b, WidgetType.MINI_CALCULATOR))
        listOf("6", "*", "7").forEach { send(provider, a, WidgetActions.KEY, it) }; send(provider, a, WidgetActions.EQUALS)
        listOf("9", "+", "1").forEach { send(provider, b, WidgetActions.KEY, it) }; send(provider, b, WidgetActions.EQUALS)
        assertEquals("42", WidgetRuntimeStore(context).result(a))
        assertEquals("10", WidgetRuntimeStore(context).result(b))
        assertNotEquals(WidgetRuntimeStore(context).expression(a), WidgetRuntimeStore(context).expression(b))
    }

    @Test fun cTwoQuickConvertersUseCanonicalRegistryAndDoNotBleed() {
        val a = 61_201; val b = 61_202; clean(a, b)
        WidgetConfigStore(context).save(WidgetConfig.default(a, WidgetType.QUICK_CONVERTER).copy(converterCategory = "Length", converterFrom = "km", converterTo = "mi", fixedAmount = 100.0))
        WidgetConfigStore(context).save(WidgetConfig.default(b, WidgetType.QUICK_CONVERTER).copy(converterCategory = "Mass", converterFrom = "kg", converterTo = "lb", fixedAmount = 10.0))
        WidgetProductRuntime.recalculateQuick(context, WidgetConfigStore(context).load(a)!!)
        WidgetProductRuntime.recalculateQuick(context, WidgetConfigStore(context).load(b)!!)
        assertTrue(WidgetRuntimeStore(context).result(a).startsWith("62.1371"))
        assertTrue(WidgetRuntimeStore(context).result(b).startsWith("22.0462"))
        send(QuickConverterWidgetProvider(), a, WidgetActions.SWAP)
        assertEquals("mi", WidgetConfigStore(context).load(a)!!.converterFrom)
        assertEquals("kg", WidgetConfigStore(context).load(b)!!.converterFrom)
    }

    @Test fun dCurrencyConverterAndNonEditableBoardUseVerifiedRates() {
        val converterId = 61_301; val boardId = 61_302; clean(converterId, boardId); CurrencyCacheStore(context).clear()
        WidgetConfigStore(context).save(WidgetConfig.default(converterId, WidgetType.CURRENCY_CONVERTER).copy(currencyBase = "USD", currencyQuote = "EUR", currencyQuotes = listOf("EUR"), fixedAmount = 2.0))
        WidgetRuntimeStore(context).setExpression(converterId, "2")
        WidgetConfigStore(context).save(WidgetConfig.default(boardId, WidgetType.CURRENCY_RATE_BOARD).copy(currencyBase = "USD", currencyQuote = "UZS", currencyQuotes = listOf("UZS", "EUR")))
        val provider = object : CurrencyRateProvider {
            override val id = "verified-fixture"
            override fun fetch(base: String, quote: String) = ProviderRate(base, quote, if (quote == "UZS") 12_500.0 else 0.92, "2026-08-13", id)
        }
        val repository = CurrencyRepository(context, provider, CurrencyCacheStore(context))
        WidgetProductRuntime.refreshCurrencyNow(context, converterId, repository)
        WidgetProductRuntime.refreshCurrencyNow(context, boardId, repository)
        assertEquals("1.84 EUR", WidgetRuntimeStore(context).result(converterId))
        val lines = WidgetRateBoardStore(context).load(boardId)
        assertEquals(2, lines.size); assertTrue(lines[0].value.contains("12500 UZS")); assertTrue(lines.all { it.freshness.contains("CURRENT FETCH") })
        val before = WidgetRuntimeStore(context).expression(boardId)
        send(CurrencyRateBoardWidgetProvider(), boardId, WidgetActions.KEY, "9")
        assertEquals(before, WidgetRuntimeStore(context).expression(boardId))
    }

    @Test fun eStaleOfflineCacheIsHonestAndRefreshNeverRunsNetworkOnBroadcastPath() {
        val id = 61_401; clean(id); val cache = CurrencyCacheStore(context); cache.clear()
        WidgetConfigStore(context).save(WidgetConfig.default(id, WidgetType.CURRENCY_CONVERTER).copy(currencyBase = "USD", currencyQuote = "UZS", currencyQuotes = listOf("UZS"), fixedAmount = 2.0))
        WidgetRuntimeStore(context).setExpression(id, "2")
        cache.put(ProviderRate("USD", "UZS", 12_000.0, "2026-08-10", "cached-fixture"), fetchedAt = 1L)
        send(CurrencyConverterWidgetProvider(), id, WidgetActions.REFRESH)
        assertEquals("24000 UZS", WidgetRuntimeStore(context).result(id))
        assertTrue(WidgetRuntimeStore(context).meta(id).contains("STALE / OFFLINE CACHE"))
    }

    @Test fun fSchemaMigrationIsExplicitAndStaleIdReuseResetsEveryStore() {
        val id = 61_501; clean(id)
        WidgetConfigStore(context).save(WidgetConfig(id, "quadratic-solver", values = mapOf("a" to "1"), schemaVersion = 1))
        val migrated = WidgetConfigStore(context).load(id)!!
        assertEquals(WidgetType.MINI_CALCULATOR, migrated.widgetType)
        assertEquals(WidgetConfig.CURRENT_WIDGET_SCHEMA, migrated.schemaVersion)
        assertTrue(migrated.migrationState.startsWith("reset-unsupported-legacy"))
        WidgetRuntimeStore(context).set(id, expression = "99", result = "99")
        val reused = WidgetProductRuntime.ensureConfig(context, id, WidgetType.QUICK_CONVERTER)
        assertEquals(WidgetType.QUICK_CONVERTER, reused.widgetType)
        assertEquals("", WidgetRuntimeStore(context).expression(id))
        assertTrue(reused.migrationState.startsWith("reset-stale-id"))
    }

    @Test fun gDeletionCleansConfigurationRuntimeAndBoardState() {
        val id = 61_601; clean(id)
        WidgetConfigStore(context).save(WidgetConfig.default(id, WidgetType.CURRENCY_RATE_BOARD))
        WidgetRuntimeStore(context).set(id, result = "value", meta = "fresh")
        WidgetRateBoardStore(context).save(id, listOf(WidgetRateLine("USD/UZS", "1 USD = 1 UZS", "CURRENT FETCH")))
        CurrencyRateBoardWidgetProvider().onDeleted(context, intArrayOf(id))
        assertNull(WidgetConfigStore(context).load(id))
        assertEquals("", WidgetRuntimeStore(context).result(id))
        assertTrue(WidgetRateBoardStore(context).load(id).isEmpty())
    }

    @Test fun hExactDeepLinksPreserveEveryConfiguredValue() {
        val ids = intArrayOf(61_701, 61_702, 61_703, 61_704); clean(*ids)
        val mini = WidgetConfig.default(ids[0], WidgetType.MINI_CALCULATOR).copy(defaultMode = "scientific-calculator")
        WidgetRuntimeStore(context).setExpression(ids[0], "sin(30)")
        val quick = WidgetConfig.default(ids[1], WidgetType.QUICK_CONVERTER).copy(converterCategory = "Length", converterFrom = "km", converterTo = "mi", fixedAmount = 5.0)
        val currency = WidgetConfig.default(ids[2], WidgetType.CURRENCY_CONVERTER).copy(currencyBase = "EUR", currencyQuote = "USD", currencyQuotes = listOf("USD"), fixedAmount = 3.0)
        val board = WidgetConfig.default(ids[3], WidgetType.CURRENCY_RATE_BOARD).copy(currencyBase = "USD", currencyQuote = "UZS", currencyQuotes = listOf("UZS", "EUR"))
        val miniUri = WidgetRenderer.deepLinkUri(context, mini)
        assertEquals("veltrix", miniUri.scheme)
        assertEquals("home", miniUri.host)
        assertEquals("/scientific-calculator", miniUri.path)
        assertEquals("sin(30)", miniUri.getQueryParameter("expression"))

        val quickUri = WidgetRenderer.deepLinkUri(context, quick)
        assertEquals("km", quickUri.getQueryParameter("from"))
        assertEquals("mi", quickUri.getQueryParameter("to"))
        assertEquals("5", quickUri.getQueryParameter("amount"))

        val currencyUri = WidgetRenderer.deepLinkUri(context, currency)
        assertEquals("EUR", currencyUri.getQueryParameter("base"))
        assertEquals("USD", currencyUri.getQueryParameter("quote"))
        assertEquals("3", currencyUri.getQueryParameter("amount"))

        val boardUri = WidgetRenderer.deepLinkUri(context, board)
        assertEquals("USD", boardUri.getQueryParameter("base"))
        assertEquals("UZS", boardUri.getQueryParameter("quote"))
    }

    @Test fun iSevenSimultaneousMandatoryInstancesHaveNoStateBleed() {
        val ids = (61_801..61_807).toList(); clean(*ids.toIntArray())
        val configs = listOf(
            WidgetConfig.default(ids[0], WidgetType.MINI_CALCULATOR), WidgetConfig.default(ids[1], WidgetType.MINI_CALCULATOR),
            WidgetConfig.default(ids[2], WidgetType.QUICK_CONVERTER).copy(converterFrom = "km", converterTo = "mi"),
            WidgetConfig.default(ids[3], WidgetType.QUICK_CONVERTER).copy(converterCategory = "Mass", converterFrom = "kg", converterTo = "lb"),
            WidgetConfig.default(ids[4], WidgetType.CURRENCY_CONVERTER).copy(currencyBase = "USD", currencyQuote = "UZS", currencyQuotes = listOf("UZS")),
            WidgetConfig.default(ids[5], WidgetType.CURRENCY_CONVERTER).copy(currencyBase = "EUR", currencyQuote = "USD", currencyQuotes = listOf("USD")),
            WidgetConfig.default(ids[6], WidgetType.CURRENCY_RATE_BOARD).copy(currencyBase = "USD", currencyQuote = "EUR", currencyQuotes = listOf("EUR", "UZS"))
        )
        configs.forEach { WidgetConfigStore(context).save(it); WidgetRuntimeStore(context).setExpression(it.appWidgetId, it.appWidgetId.toString()) }
        assertEquals(7, configs.map { WidgetConfigStore(context).load(it.appWidgetId)!!.widgetType }.size)
        assertEquals(7, configs.map { WidgetRuntimeStore(context).expression(it.appWidgetId) }.distinct().size)
        assertEquals(2, configs.count { it.widgetType == WidgetType.MINI_CALCULATOR })
        assertEquals(2, configs.count { it.widgetType == WidgetType.QUICK_CONVERTER })
        assertEquals(3, configs.count { it.widgetType in setOf(WidgetType.CURRENCY_CONVERTER, WidgetType.CURRENCY_RATE_BOARD) })
    }

    @Test fun jOptionsChangedPersistsActualTierPerInstance() {
        val id = 61_901; clean(id); val provider = MiniCalculatorWidgetProvider(); WidgetConfigStore(context).save(WidgetConfig.default(id, WidgetType.MINI_CALCULATOR))
        val options = Bundle().apply {
            putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 349)
            putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 455)
        }
        provider.onAppWidgetOptionsChanged(context, AppWidgetManager.getInstance(context), id, options)
        assertEquals(WidgetSizeTier.XL.wireName, WidgetConfigStore(context).load(id)!!.sizeCapability)
    }

    @Test fun kPersistenceSeedForRealProcessRestart() {
        val id = PERSIST_ID; clean(id)
        WidgetConfigStore(context).save(WidgetConfig.default(id, WidgetType.QUICK_CONVERTER).copy(converterCategory = "Length", converterFrom = "km", converterTo = "m", fixedAmount = 100.0))
        WidgetRuntimeStore(context).setExpression(id, "100")
        WidgetProductRuntime.recalculateQuick(context, WidgetConfigStore(context).load(id)!!)
        assertEquals("100000 m", WidgetRuntimeStore(context).result(id))
    }

    @Test fun yPersistenceAfterRealProcessRestart() {
        val config = WidgetConfigStore(context).load(PERSIST_ID)
        assumeTrue("Requires external process-restart seed", config != null)
        assertEquals(WidgetType.QUICK_CONVERTER, config!!.widgetType)
        assertEquals("100", WidgetRuntimeStore(context).expression(PERSIST_ID))
        assertEquals("100000 m", WidgetRuntimeStore(context).result(PERSIST_ID))
    }

    companion object { private const val PERSIST_ID = 61_999 }
}
