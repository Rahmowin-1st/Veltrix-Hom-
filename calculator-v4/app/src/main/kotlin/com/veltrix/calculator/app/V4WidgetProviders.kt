package com.veltrix.calculator.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import com.veltrix.calculator.core.ConversionRegistry
import com.veltrix.calculator.core.PlatformEngine
import com.veltrix.calculator.core.ToolInput
import com.veltrix.calculator.core.ToolRequest
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.text.DateFormat
import java.util.Date

object WidgetActions {
    const val KEY = "com.veltrix.calculator.widget.v4.KEY"
    const val BACKSPACE = "com.veltrix.calculator.widget.v4.BACKSPACE"
    const val CLEAR = "com.veltrix.calculator.widget.v4.CLEAR"
    const val EQUALS = "com.veltrix.calculator.widget.v4.EQUALS"
    const val SWAP = "com.veltrix.calculator.widget.v4.SWAP"
    const val SIGN = "com.veltrix.calculator.widget.v4.SIGN"
    const val PERCENT = "com.veltrix.calculator.widget.v4.PERCENT"
    const val REFRESH = "com.veltrix.calculator.widget.v4.REFRESH"
    const val EXTRA_KEY = "key"
}

abstract class VeltrixCoreWidgetProvider(private val expectedType: WidgetType) : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id -> WidgetProductRuntime.ensureConfig(context, id, expectedType); WidgetRenderer.update(context, manager, id, expectedType) }
        if (expectedType in setOf(WidgetType.CURRENCY_CONVERTER, WidgetType.CURRENCY_RATE_BOARD)) {
            CurrencyRefreshScheduler.refreshNow(context, "widget-on-update-${expectedType.wireName}")
        }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: android.os.Bundle) {
        WidgetRenderer.update(context, manager, id, expectedType, newOptions)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        ids.forEach { WidgetProductRuntime.cleanup(context, it) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action !in WidgetProductRuntime.localActions) return
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return
        val config = WidgetProductRuntime.ensureConfig(context, id, expectedType)
        WidgetProductRuntime.handleLocal(context, config, intent)
        if (config.widgetType in setOf(WidgetType.CURRENCY_CONVERTER, WidgetType.CURRENCY_RATE_BOARD) &&
            intent.action in setOf(WidgetActions.EQUALS, WidgetActions.REFRESH, WidgetActions.SWAP)
        ) CurrencyRefreshScheduler.refreshNow(context, "widget-action-${intent.action}-$id")
        WidgetRenderer.update(context, AppWidgetManager.getInstance(context), id, expectedType)
    }
}

class MiniCalculatorWidgetProvider : VeltrixCoreWidgetProvider(WidgetType.MINI_CALCULATOR)
class QuickConverterWidgetProvider : VeltrixCoreWidgetProvider(WidgetType.QUICK_CONVERTER)
class CurrencyConverterWidgetProvider : VeltrixCoreWidgetProvider(WidgetType.CURRENCY_CONVERTER)
class CurrencyRateBoardWidgetProvider : VeltrixCoreWidgetProvider(WidgetType.CURRENCY_RATE_BOARD)

data class WidgetRateLine(val pair: String, val value: String, val freshness: String)

class WidgetRateBoardStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("widget_rate_board_v4", Context.MODE_PRIVATE)

    @Synchronized fun save(id: Int, lines: List<WidgetRateLine>) {
        val encoded = JSONArray().apply { lines.take(4).forEach { put(JSONObject().put("pair", it.pair).put("value", it.value).put("freshness", it.freshness)) } }
        prefs.edit().putString(id.toString(), encoded.toString()).commit()
    }

    @Synchronized fun load(id: Int): List<WidgetRateLine> = prefs.getString(id.toString(), null)?.let { raw ->
        runCatching {
            val a = JSONArray(raw)
            (0 until a.length()).map { index -> a.getJSONObject(index) }.map {
                WidgetRateLine(it.getString("pair"), it.getString("value"), it.getString("freshness"))
            }
        }.getOrDefault(emptyList())
    }.orEmpty()

    @Synchronized fun delete(id: Int) { prefs.edit().remove(id.toString()).commit() }
}

object WidgetProductRuntime {
    val localActions = setOf(
        WidgetActions.KEY, WidgetActions.BACKSPACE, WidgetActions.CLEAR, WidgetActions.EQUALS,
        WidgetActions.SWAP, WidgetActions.SIGN, WidgetActions.PERCENT, WidgetActions.REFRESH
    )

    fun ensureConfig(context: Context, id: Int, expectedType: WidgetType): WidgetConfig {
        val store = WidgetConfigStore(context)
        val current = store.load(id)
        if (current != null && current.widgetType == expectedType) return current
        if (current != null) cleanup(context, id)
        val fresh = WidgetConfig.default(id, expectedType).copy(
            migrationState = current?.let { "reset-stale-id:${it.widgetType.wireName}" } ?: "native-v4"
        )
        store.save(fresh)
        return fresh
    }

    fun cleanup(context: Context, id: Int) {
        WidgetConfigStore(context).delete(id)
        WidgetInteractionStateStore(context).delete(id)
        WidgetRuntimeStore(context).delete(id)
        WidgetRateBoardStore(context).delete(id)
    }

    fun handleLocal(context: Context, config: WidgetConfig, intent: Intent) {
        when (config.widgetType) {
            WidgetType.MINI_CALCULATOR -> handleCalculator(context, config, intent)
            WidgetType.QUICK_CONVERTER -> handleQuickConverter(context, config, intent)
            WidgetType.CURRENCY_CONVERTER -> handleCurrencyConverter(context, config, intent)
            WidgetType.CURRENCY_RATE_BOARD -> if (intent.action == WidgetActions.REFRESH) refreshCurrencyFromCache(context, config)
        }
    }

    private fun handleCalculator(context: Context, config: WidgetConfig, intent: Intent) {
        val runtime = WidgetRuntimeStore(context); val id = config.appWidgetId
        val current = runtime.expression(id)
        when (intent.action) {
            WidgetActions.KEY -> runtime.setExpression(id, appendCalculatorKey(current, intent.getStringExtra(WidgetActions.EXTRA_KEY).orEmpty()))
            WidgetActions.BACKSPACE -> runtime.setExpression(id, current.dropLast(1))
            WidgetActions.CLEAR -> runtime.set(id, expression = "", result = "0", meta = "")
            WidgetActions.SIGN -> runtime.setExpression(id, toggleSign(current))
            WidgetActions.PERCENT -> runtime.setExpression(id, (current + "%").take(96))
            WidgetActions.EQUALS -> calculateMini(context, id)
        }
    }

    private fun handleQuickConverter(context: Context, config: WidgetConfig, intent: Intent) {
        val runtime = WidgetRuntimeStore(context); val id = config.appWidgetId
        when (intent.action) {
            WidgetActions.KEY -> runtime.setExpression(id, appendNumberKey(runtime.expression(id, format(config.fixedAmount)), intent.getStringExtra(WidgetActions.EXTRA_KEY).orEmpty()))
            WidgetActions.BACKSPACE -> runtime.setExpression(id, runtime.expression(id, format(config.fixedAmount)).dropLast(1))
            WidgetActions.CLEAR -> runtime.setExpression(id, "")
            WidgetActions.SIGN -> runtime.setExpression(id, toggleSign(runtime.expression(id, format(config.fixedAmount))))
            WidgetActions.SWAP -> WidgetConfigStore(context).save(config.copy(converterFrom = config.converterTo, converterTo = config.converterFrom))
        }
        recalculateQuick(context, WidgetConfigStore(context).load(id) ?: config)
    }

    private fun handleCurrencyConverter(context: Context, config: WidgetConfig, intent: Intent) {
        val runtime = WidgetRuntimeStore(context); val id = config.appWidgetId
        when (intent.action) {
            WidgetActions.KEY -> runtime.setExpression(id, appendNumberKey(runtime.expression(id, format(config.fixedAmount)), intent.getStringExtra(WidgetActions.EXTRA_KEY).orEmpty()))
            WidgetActions.BACKSPACE -> runtime.setExpression(id, runtime.expression(id, format(config.fixedAmount)).dropLast(1))
            WidgetActions.CLEAR -> runtime.set(id, expression = "", result = "", meta = "No verified value")
            WidgetActions.SIGN -> runtime.setExpression(id, toggleSign(runtime.expression(id, format(config.fixedAmount))))
            WidgetActions.SWAP -> WidgetConfigStore(context).save(config.copy(currencyBase = config.currencyQuote, currencyQuote = config.currencyBase, currencyQuotes = listOf(config.currencyBase)))
        }
        refreshCurrencyFromCache(context, WidgetConfigStore(context).load(id) ?: config)
    }

    fun calculateMini(context: Context, id: Int) {
        val runtime = WidgetRuntimeStore(context); val expression = runtime.expression(id)
        if (expression.isBlank()) return
        val response = PlatformEngine().execute(ToolRequest("standard-calculator", mapOf("expression" to ToolInput(expression))))
        runtime.setResult(id, if (response.isSuccess) response.primary else response.error?.code ?: "Invalid expression")
        if (response.isSuccess) HistoryDb(context).addStructured(
            "standard-calculator", "Math", expression, response.primary, null, expression,
            response.primary, 1, null, "{\"source\":\"mini-calculator-widget\"}"
        )
    }

    fun recalculateQuick(context: Context, config: WidgetConfig) {
        val runtime = WidgetRuntimeStore(context); val amount = runtime.expression(config.appWidgetId, format(config.fixedAmount)).toDoubleOrNull()
        if (amount == null || !amount.isFinite()) { runtime.setResult(config.appWidgetId, "Enter a valid amount"); return }
        val result = runCatching { ConversionRegistry.default().convert(amount, config.converterFrom, config.converterTo) }.getOrNull()
        if (result == null) runtime.setResult(config.appWidgetId, "Unsupported unit pair")
        else runtime.set(config.appWidgetId, result = "${format(result.value)} ${result.to.symbol}", meta = "${result.from.symbol} → ${result.to.symbol}")
    }

    fun refreshCurrencyNow(context: Context, id: Int, repository: CurrencyRepository = CurrencyRepository(context)) {
        val config = WidgetConfigStore(context).load(id) ?: return
        when (config.widgetType) {
            WidgetType.CURRENCY_CONVERTER -> {
                val runtime = WidgetRuntimeStore(context)
                val amount = runtime.expression(id, format(config.fixedAmount)).toDoubleOrNull()
                if (amount == null || !amount.isFinite()) { runtime.set(id, result = "Enter a valid amount", meta = "No rate requested"); return }
                try {
                    val (value, rate) = repository.convertAmount(amount, config.currencyBase, config.currencyQuote, forceRefresh = true)
                    runtime.set(id, result = "${format(value)} ${rate.quote}", meta = freshness(rate))
                } catch (_: Exception) {
                    refreshCurrencyFromCache(context, config)
                    if (runtime.result(id).isBlank()) runtime.set(id, result = "Unavailable", meta = "OFFLINE • no verified cache")
                }
            }
            WidgetType.CURRENCY_RATE_BOARD -> {
                val lines = config.currencyQuotes.take(4).map { quote ->
                    try {
                        val rate = repository.rate(config.currencyBase, quote, forceRefresh = true)
                        WidgetRateLine("${rate.base}/${rate.quote}", "1 ${rate.base} = ${format(rate.rate)} ${rate.quote}", freshness(rate))
                    } catch (_: Exception) {
                        repository.cached(config.currencyBase, quote, 0)?.let { cached ->
                            WidgetRateLine("${cached.base}/${cached.quote}", "1 ${cached.base} = ${format(cached.rate)} ${cached.quote}", freshness(cached.copy(stale = true)))
                        } ?: WidgetRateLine("${config.currencyBase}/$quote", "Unavailable", "OFFLINE • no verified cache")
                    }
                }
                WidgetRateBoardStore(context).save(id, lines)
                lines.firstOrNull()?.let { WidgetRuntimeStore(context).set(id, result = it.value, meta = it.freshness) }
            }
            else -> Unit
        }
    }

    fun refreshCurrencyFromCache(context: Context, config: WidgetConfig) {
        val repository = CurrencyRepository(context); val runtime = WidgetRuntimeStore(context)
        when (config.widgetType) {
            WidgetType.CURRENCY_CONVERTER -> {
                val amount = runtime.expression(config.appWidgetId, format(config.fixedAmount)).toDoubleOrNull() ?: return
                repository.convertCached(amount, config.currencyBase, config.currencyQuote)?.let { (value, rate) ->
                    runtime.set(config.appWidgetId, result = "${format(value)} ${rate.quote}", meta = freshness(rate))
                }
            }
            WidgetType.CURRENCY_RATE_BOARD -> {
                val lines = config.currencyQuotes.take(4).mapNotNull { quote -> repository.cached(config.currencyBase, quote)?.let { rate ->
                    WidgetRateLine("${rate.base}/${rate.quote}", "1 ${rate.base} = ${format(rate.rate)} ${rate.quote}", freshness(rate))
                } }
                if (lines.isNotEmpty()) {
                    WidgetRateBoardStore(context).save(config.appWidgetId, lines)
                    runtime.set(config.appWidgetId, result = lines.first().value, meta = lines.first().freshness)
                }
            }
            else -> Unit
        }
    }

    fun refreshCurrencyWidgetsFromCache(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        WidgetConfigStore(context).all().filter { it.widgetType in setOf(WidgetType.CURRENCY_CONVERTER, WidgetType.CURRENCY_RATE_BOARD) }.forEach { config ->
            refreshCurrencyFromCache(context, config)
            WidgetRenderer.update(context, manager, config.appWidgetId, config.widgetType)
        }
    }

    fun configuredCurrencyPairs(context: Context): List<String> = WidgetConfigStore(context).all().flatMap { config ->
        when (config.widgetType) {
            WidgetType.CURRENCY_CONVERTER -> listOf("${config.currencyBase}/${config.currencyQuote}")
            WidgetType.CURRENCY_RATE_BOARD -> config.currencyQuotes.map { "${config.currencyBase}/$it" }
            else -> emptyList()
        }
    }.distinct()

    private fun appendCalculatorKey(current: String, key: String): String {
        if (key.length != 1 || key[0] !in "0123456789.+-*/()") return current
        if (key == "." && current.split(Regex("[+\\-*/()]")).lastOrNull().orEmpty().contains('.')) return current
        return (current + key).take(96)
    }

    private fun appendNumberKey(current: String, key: String): String {
        if (key.length != 1 || key[0] !in "0123456789.") return current
        if (key == "." && current.contains('.')) return current
        return (current + key).take(24)
    }

    private fun toggleSign(raw: String): String = when {
        raw.startsWith("-") -> raw.drop(1)
        raw.isBlank() -> "-"
        else -> "-$raw"
    }

    fun freshness(rate: CurrencyRateRecord): String {
        val state = when { rate.stale -> "STALE / OFFLINE CACHE"; rate.fromCache -> "CURRENT CACHE"; else -> "CURRENT FETCH" }
        val verified = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(rate.fetchedAtEpochMs))
        return "$state • ${rate.effectiveDate} • ${rate.source} • verified $verified"
    }

    fun format(value: Double): String = BigDecimal.valueOf(value).stripTrailingZeros().toPlainString()
}

private data class WidgetDisplay(
    val title: String,
    val primary: String,
    val secondary: String,
    val freshness: String = "",
    val lines: List<String> = emptyList()
)

object WidgetRenderer {
    private val responsiveSizes = linkedMapOf(
        SizeF(WidgetSizeTier.XS.minWidthDp.toFloat(), WidgetSizeTier.XS.minHeightDp.toFloat()) to WidgetSizeTier.XS,
        SizeF(WidgetSizeTier.S.minWidthDp.toFloat(), WidgetSizeTier.S.minHeightDp.toFloat()) to WidgetSizeTier.S,
        SizeF(WidgetSizeTier.M.minWidthDp.toFloat(), WidgetSizeTier.M.minHeightDp.toFloat()) to WidgetSizeTier.M,
        SizeF(WidgetSizeTier.L.minWidthDp.toFloat(), WidgetSizeTier.L.minHeightDp.toFloat()) to WidgetSizeTier.L,
        SizeF(WidgetSizeTier.XL.minWidthDp.toFloat(), WidgetSizeTier.XL.minHeightDp.toFloat()) to WidgetSizeTier.XL
    )

    fun update(context: Context, manager: AppWidgetManager, id: Int, expectedType: WidgetType, optionsOverride: android.os.Bundle? = null) {
        var config = WidgetProductRuntime.ensureConfig(context, id, expectedType)
        if (config.widgetType == WidgetType.QUICK_CONVERTER) WidgetProductRuntime.recalculateQuick(context, config)
        if (config.widgetType in setOf(WidgetType.CURRENCY_CONVERTER, WidgetType.CURRENCY_RATE_BOARD)) WidgetProductRuntime.refreshCurrencyFromCache(context, config)
        val options = optionsOverride ?: manager.getAppWidgetOptions(id)
        val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, WidgetSizeTier.M.minWidthDp)
        val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, WidgetSizeTier.M.minHeightDp)
        val currentTier = WidgetSizeTier.forSize(width, height)
        if (config.sizeCapability != currentTier.wireName) {
            config = config.copy(sizeCapability = currentTier.wireName)
            WidgetConfigStore(context).save(config)
        }
        val views = if (Build.VERSION.SDK_INT >= 31) {
            RemoteViews(responsiveSizes.mapValues { (_, tier) -> create(context, id, config, tier, preview = false) })
        } else create(context, id, config, currentTier, preview = false)
        manager.updateAppWidget(id, views)
    }

    fun preview(context: Context, type: WidgetType, tier: WidgetSizeTier = WidgetSizeTier.M): RemoteViews =
        create(context, 0, WidgetConfig.default(0, type), tier, preview = true)

    fun renderForTest(context: Context, id: Int, type: WidgetType, tier: WidgetSizeTier): RemoteViews {
        val config = WidgetProductRuntime.ensureConfig(context, id, type)
        return create(context, id, config, tier, preview = false)
    }

    private fun create(context: Context, id: Int, config: WidgetConfig, tier: WidgetSizeTier, preview: Boolean): RemoteViews {
        val rv = RemoteViews(context.packageName, layoutFor(tier))
        val display = display(context, config, preview)
        rv.setTextViewText(R.id.widget_title, display.title)
        rv.setTextViewText(R.id.widget_primary, display.primary)
        rv.setTextViewText(R.id.widget_secondary, display.secondary)
        rv.setContentDescription(android.R.id.background, "${config.widgetType.title}, ${tier.wireName}")
        if (!preview) rv.setOnClickPendingIntent(android.R.id.background, openIntent(context, config))
        if (tier != WidgetSizeTier.XS) rv.setTextViewText(R.id.widget_freshness, display.freshness)
        when (tier) {
            WidgetSizeTier.XS -> Unit
            WidgetSizeTier.S -> bindSmall(context, rv, id, config, preview)
            WidgetSizeTier.M -> bindMedium(context, rv, id, config, display, preview)
            WidgetSizeTier.L, WidgetSizeTier.XL -> bindLarge(context, rv, id, config, tier, display, preview)
        }
        return rv
    }

    private fun display(context: Context, config: WidgetConfig, preview: Boolean): WidgetDisplay {
        val runtime = WidgetRuntimeStore(context)
        return when (config.widgetType) {
            WidgetType.MINI_CALCULATOR -> WidgetDisplay(
                title = config.widgetType.title,
                primary = if (preview) "42" else runtime.result(config.appWidgetId, "0"),
                secondary = if (preview) "6 × 7" else runtime.expression(config.appWidgetId).ifBlank { "Tap to calculate" }
            )
            WidgetType.QUICK_CONVERTER -> WidgetDisplay(
                title = "${config.widgetType.title} • ${config.converterCategory}",
                primary = if (preview) "62.1371 mi" else runtime.result(config.appWidgetId, "Convert"),
                secondary = if (preview) "100 km → mi" else "${runtime.expression(config.appWidgetId, WidgetProductRuntime.format(config.fixedAmount))} ${config.converterFrom} → ${config.converterTo}"
            )
            WidgetType.CURRENCY_CONVERTER -> WidgetDisplay(
                title = config.widgetType.title,
                primary = if (preview) "12,500 UZS" else runtime.result(config.appWidgetId, "No verified rate"),
                secondary = if (preview) "1 USD → UZS" else "${runtime.expression(config.appWidgetId, WidgetProductRuntime.format(config.fixedAmount))} ${config.currencyBase} → ${config.currencyQuote}",
                freshness = if (preview) "CURRENT CACHE • verified timestamp" else runtime.meta(config.appWidgetId, "OFFLINE • no verified cache")
            )
            WidgetType.CURRENCY_RATE_BOARD -> {
                val stored = if (preview) listOf(
                    WidgetRateLine("USD/UZS", "1 USD = 12,500 UZS", "CURRENT CACHE • verified timestamp"),
                    WidgetRateLine("USD/EUR", "1 USD = 0.92 EUR", "CURRENT CACHE • verified timestamp")
                ) else WidgetRateBoardStore(context).load(config.appWidgetId)
                WidgetDisplay(
                    title = config.widgetType.title,
                    primary = stored.firstOrNull()?.value ?: "No verified rates",
                    secondary = "Base ${config.currencyBase} • non-editable",
                    freshness = stored.firstOrNull()?.freshness ?: "OFFLINE • no verified cache",
                    lines = stored.map { it.value }
                )
            }
        }
    }

    private fun bindSmall(context: Context, rv: RemoteViews, id: Int, config: WidgetConfig, preview: Boolean) {
        val canSwap = config.widgetType in setOf(WidgetType.QUICK_CONVERTER, WidgetType.CURRENCY_CONVERTER)
        val canRefresh = config.widgetType in setOf(WidgetType.CURRENCY_CONVERTER, WidgetType.CURRENCY_RATE_BOARD)
        rv.setViewVisibility(R.id.widget_swap, if (canSwap) View.VISIBLE else View.GONE)
        rv.setViewVisibility(R.id.widget_refresh, if (canRefresh) View.VISIBLE else View.GONE)
        if (!preview) {
            if (canSwap) bindAction(context, rv, R.id.widget_swap, id, config, WidgetActions.SWAP)
            if (canRefresh) bindAction(context, rv, R.id.widget_refresh, id, config, WidgetActions.REFRESH)
            rv.setOnClickPendingIntent(R.id.widget_open, openIntent(context, config))
        }
    }

    private fun bindMedium(context: Context, rv: RemoteViews, id: Int, config: WidgetConfig, display: WidgetDisplay, preview: Boolean) {
        bindLines(rv, display.lines, 2)
        val board = config.widgetType == WidgetType.CURRENCY_RATE_BOARD
        rv.setViewVisibility(R.id.widget_keypad, if (board) View.GONE else View.VISIBLE)
        rv.setViewVisibility(R.id.widget_refresh, if (config.widgetType in setOf(WidgetType.CURRENCY_CONVERTER, WidgetType.CURRENCY_RATE_BOARD)) View.VISIBLE else View.GONE)
        if (!preview) {
            if (!board) {
                listOf(R.id.w7 to "7", R.id.w8 to "8", R.id.w9 to "9", R.id.w0 to "0").forEach { (view, key) -> bindAction(context, rv, view, id, config, WidgetActions.KEY, key) }
                bindAction(context, rv, R.id.widget_backspace, id, config, WidgetActions.BACKSPACE)
                bindAction(context, rv, R.id.widget_clear, id, config, WidgetActions.CLEAR)
                if (config.widgetType == WidgetType.MINI_CALCULATOR) {
                    rv.setTextViewText(R.id.widget_swap, "+")
                    bindAction(context, rv, R.id.widget_swap, id, config, WidgetActions.KEY, "+")
                } else bindAction(context, rv, R.id.widget_swap, id, config, WidgetActions.SWAP)
                bindAction(context, rv, R.id.widget_equals, id, config, WidgetActions.EQUALS)
            }
            if (config.widgetType in setOf(WidgetType.CURRENCY_CONVERTER, WidgetType.CURRENCY_RATE_BOARD)) bindAction(context, rv, R.id.widget_refresh, id, config, WidgetActions.REFRESH)
            rv.setOnClickPendingIntent(R.id.widget_open, openIntent(context, config))
        }
    }

    private fun bindLarge(context: Context, rv: RemoteViews, id: Int, config: WidgetConfig, tier: WidgetSizeTier, display: WidgetDisplay, preview: Boolean) {
        bindLines(rv, display.lines, if (tier == WidgetSizeTier.XL) 4 else 3)
        val board = config.widgetType == WidgetType.CURRENCY_RATE_BOARD
        rv.setViewVisibility(R.id.widget_keypad, if (board) View.GONE else View.VISIBLE)
        if (board) {
            rv.setViewVisibility(R.id.widget_backspace, if (tier == WidgetSizeTier.L) View.VISIBLE else View.GONE)
            rv.setViewVisibility(R.id.widget_sign, View.GONE)
            rv.setViewVisibility(R.id.widget_swap, View.GONE)
            if (tier == WidgetSizeTier.XL) {
                rv.setViewVisibility(R.id.widget_percent, View.GONE)
                rv.setViewVisibility(R.id.widget_refresh, View.VISIBLE)
            } else rv.setTextViewText(R.id.widget_backspace, "Refresh")
            if (!preview) {
                if (tier == WidgetSizeTier.XL) bindAction(context, rv, R.id.widget_refresh, id, config, WidgetActions.REFRESH)
                else bindAction(context, rv, R.id.widget_backspace, id, config, WidgetActions.REFRESH)
                rv.setOnClickPendingIntent(R.id.widget_open, openIntent(context, config))
            }
            return
        }

        val allDigits = listOf(R.id.w0 to "0", R.id.w1 to "1", R.id.w2 to "2", R.id.w3 to "3", R.id.w4 to "4", R.id.w5 to "5", R.id.w6 to "6", R.id.w7 to "7", R.id.w8 to "8", R.id.w9 to "9")
        if (!preview) allDigits.forEach { (view, key) -> bindAction(context, rv, view, id, config, WidgetActions.KEY, key) }
        val calculator = config.widgetType == WidgetType.MINI_CALCULATOR
        listOf(R.id.wdiv, R.id.wmul, R.id.wsub).forEach { rv.setViewVisibility(it, if (calculator) View.VISIBLE else View.GONE) }
        rv.setViewVisibility(R.id.widget_swap, if (calculator) View.GONE else View.VISIBLE)
        if (tier == WidgetSizeTier.XL) {
            rv.setViewVisibility(R.id.widget_percent, if (calculator) View.VISIBLE else View.GONE)
            rv.setViewVisibility(R.id.widget_refresh, if (config.widgetType == WidgetType.CURRENCY_CONVERTER) View.VISIBLE else View.GONE)
        }
        if (!preview) {
            bindAction(context, rv, R.id.widget_clear, id, config, WidgetActions.CLEAR)
            bindAction(context, rv, R.id.wdot, id, config, WidgetActions.KEY, ".")
            bindAction(context, rv, R.id.widget_equals, id, config, WidgetActions.EQUALS)
            bindAction(context, rv, R.id.widget_backspace, id, config, WidgetActions.BACKSPACE)
            bindAction(context, rv, R.id.widget_sign, id, config, WidgetActions.SIGN)
            if (calculator) {
                listOf(R.id.wdiv to "/", R.id.wmul to "*", R.id.wsub to "-").forEach { (view, key) -> bindAction(context, rv, view, id, config, WidgetActions.KEY, key) }
                if (tier == WidgetSizeTier.XL) bindAction(context, rv, R.id.widget_percent, id, config, WidgetActions.PERCENT)
            } else bindAction(context, rv, R.id.widget_swap, id, config, WidgetActions.SWAP)
            if (tier == WidgetSizeTier.XL && config.widgetType == WidgetType.CURRENCY_CONVERTER) bindAction(context, rv, R.id.widget_refresh, id, config, WidgetActions.REFRESH)
            rv.setOnClickPendingIntent(R.id.widget_open, openIntent(context, config))
        }
    }

    private fun bindLines(rv: RemoteViews, lines: List<String>, maximum: Int) {
        rv.setViewVisibility(R.id.widget_lines, if (lines.isEmpty()) View.GONE else View.VISIBLE)
        val ids = listOf(R.id.widget_line1, R.id.widget_line2, R.id.widget_line3, R.id.widget_line4).take(maximum)
        ids.forEachIndexed { index, viewId ->
            rv.setViewVisibility(viewId, if (index < lines.size) View.VISIBLE else View.GONE)
            if (index < lines.size) rv.setTextViewText(viewId, lines[index])
        }
    }

    private fun bindAction(context: Context, rv: RemoteViews, viewId: Int, id: Int, config: WidgetConfig, action: String, key: String? = null) {
        val intent = Intent(context, providerClass(config.widgetType)).setAction(action)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).addFlags(Intent.FLAG_RECEIVER_FOREGROUND)
        key?.let { intent.putExtra(WidgetActions.EXTRA_KEY, it) }
        val requestCode = (31 * id + action.hashCode() + key.orEmpty().hashCode()).and(Int.MAX_VALUE)
        rv.setOnClickPendingIntent(viewId, PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }

    fun deepLinkUri(context: Context, config: WidgetConfig): Uri = when (config.widgetType) {
            WidgetType.MINI_CALCULATOR -> Uri.Builder().scheme("veltrix").authority("home").appendPath(config.defaultMode)
                .appendQueryParameter("expression", WidgetRuntimeStore(context).expression(config.appWidgetId)).build()
            WidgetType.QUICK_CONVERTER -> Uri.Builder().scheme("veltrix").authority("converter").appendPath(config.converterCategory)
                .appendQueryParameter("from", config.converterFrom).appendQueryParameter("to", config.converterTo)
                .appendQueryParameter("amount", WidgetRuntimeStore(context).expression(config.appWidgetId, WidgetProductRuntime.format(config.fixedAmount))).build()
            WidgetType.CURRENCY_CONVERTER -> Uri.Builder().scheme("veltrix").authority("converter").appendPath("currency")
                .appendQueryParameter("base", config.currencyBase).appendQueryParameter("quote", config.currencyQuote)
                .appendQueryParameter("amount", WidgetRuntimeStore(context).expression(config.appWidgetId, WidgetProductRuntime.format(config.fixedAmount))).build()
            WidgetType.CURRENCY_RATE_BOARD -> Uri.Builder().scheme("veltrix").authority("converter").appendPath("currency")
                .appendQueryParameter("base", config.currencyBase).appendQueryParameter("quote", config.currencyQuotes.firstOrNull() ?: config.currencyQuote).build()
        }

    private fun openIntent(context: Context, config: WidgetConfig): PendingIntent {
        val uri = deepLinkUri(context, config)
        val intent = Intent(Intent.ACTION_VIEW, uri, context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(context, config.appWidgetId, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun providerClass(type: WidgetType): Class<out AppWidgetProvider> = when (type) {
        WidgetType.MINI_CALCULATOR -> MiniCalculatorWidgetProvider::class.java
        WidgetType.QUICK_CONVERTER -> QuickConverterWidgetProvider::class.java
        WidgetType.CURRENCY_CONVERTER -> CurrencyConverterWidgetProvider::class.java
        WidgetType.CURRENCY_RATE_BOARD -> CurrencyRateBoardWidgetProvider::class.java
    }

    private fun layoutFor(tier: WidgetSizeTier): Int = when (tier) {
        WidgetSizeTier.XS -> R.layout.widget_xs
        WidgetSizeTier.S -> R.layout.widget_s
        WidgetSizeTier.M -> R.layout.widget_m
        WidgetSizeTier.L -> R.layout.widget_l
        WidgetSizeTier.XL -> R.layout.widget_xl
    }
}

/** Publishes at most one Android 15+ generated preview per launch window to respect platform rate limits. */
object WidgetPreviewPublisher {
    private const val PREFS = "widget_generated_previews_v4"
    private const val MIN_INTERVAL_MS = 31 * 60_000L

    fun publishNext(context: Context): Boolean? {
        if (Build.VERSION.SDK_INT < 35) return null
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong("lastAttempt", 0L) < MIN_INTERVAL_MS) return null
        val type = WidgetType.entries[prefs.getInt("next", 0).coerceIn(0, WidgetType.entries.lastIndex)]
        val success = AppWidgetManager.getInstance(context).setWidgetPreview(
            android.content.ComponentName(context, WidgetRenderer.providerClass(type)),
            android.appwidget.AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN,
            WidgetRenderer.preview(context, type)
        )
        prefs.edit().putLong("lastAttempt", now)
            .putInt("next", if (success) (type.ordinal + 1) % WidgetType.entries.size else type.ordinal)
            .putString("lastType", type.wireName).putBoolean("lastSuccess", success).apply()
        return success
    }
}
