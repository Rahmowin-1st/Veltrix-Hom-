package com.veltrix.calculator.app

import android.content.Context
import com.veltrix.calculator.core.AdaptiveEngine
import com.veltrix.calculator.core.AdaptiveState
import org.json.JSONArray
import org.json.JSONObject

enum class WidgetType(val wireName: String, val title: String, val canonicalToolId: String) {
    MINI_CALCULATOR("mini-calculator", "Mini Calculator", "standard-calculator"),
    QUICK_CONVERTER("quick-converter", "Quick Converter", "quick-converter"),
    CURRENCY_CONVERTER("currency-converter", "Currency Converter", "currency-interactive"),
    CURRENCY_RATE_BOARD("currency-rate-board", "Currency Rate Board", "currency-rate-board");

    companion object {
        fun fromWire(raw: String?): WidgetType? = entries.firstOrNull { it.wireName == raw }
        fun fromLegacyTool(toolId: String): WidgetType = when (toolId) {
            "currency-interactive" -> CURRENCY_CONVERTER
            "currency", "currency-fixed", "currency-rate-board" -> CURRENCY_RATE_BOARD
            "quick-converter" -> QUICK_CONVERTER
            else -> MINI_CALCULATOR
        }
    }
}

enum class WidgetSizeTier(val wireName: String, val minWidthDp: Int, val minHeightDp: Int) {
    XS("xs", 57, 70),
    S("s", 130, 102),
    M("m", 203, 220),
    L("l", 276, 337),
    XL("xl", 349, 455);

    companion object {
        fun forSize(widthDp: Int, heightDp: Int): WidgetSizeTier = when {
            widthDp >= XL.minWidthDp && heightDp >= XL.minHeightDp -> XL
            widthDp >= L.minWidthDp && heightDp >= L.minHeightDp -> L
            widthDp >= M.minWidthDp && heightDp >= M.minHeightDp -> M
            widthDp >= S.minWidthDp && heightDp >= S.minHeightDp -> S
            else -> XS
        }
    }
}

data class WidgetConfig(
    val appWidgetId: Int,
    val toolId: String = "standard-calculator",
    val widgetType: WidgetType = WidgetType.fromLegacyTool(toolId),
    val sizeCapability: String = WidgetSizeTier.M.wireName,
    val values: Map<String, String> = emptyMap(),
    val preferredUnits: Map<String, String> = emptyMap(),
    val converterCategory: String = "Length",
    val converterFrom: String = "km",
    val converterTo: String = "mi",
    val currencyBase: String = "USD",
    val currencyQuote: String = "UZS",
    val currencyQuotes: List<String> = listOf(currencyQuote),
    val fixedAmount: Double = 100.0,
    val defaultMode: String = "standard-calculator",
    val themeKey: String = "system",
    val displayDirection: String = "base-to-quote",
    val migrationState: String = "native-v4",
    val schemaVersion: Int = CURRENT_WIDGET_SCHEMA
) {
    fun normalized(): WidgetConfig {
        val migratedType = if (schemaVersion < CURRENT_WIDGET_SCHEMA) WidgetType.fromLegacyTool(toolId) else widgetType
        val unsupportedLegacy = schemaVersion < CURRENT_WIDGET_SCHEMA && toolId !in setOf(
            "standard-calculator", "scientific-calculator", "programmer-calculator",
            "quick-converter", "currency", "currency-fixed", "currency-interactive", "currency-rate-board"
        )
        val cleanBase = currencyBase.trim().uppercase().takeIf { Regex("[A-Z]{3}").matches(it) } ?: "USD"
        val cleanQuotes = (currencyQuotes + currencyQuote).map { it.trim().uppercase() }
            .filter { Regex("[A-Z]{3}").matches(it) && it != cleanBase }.distinct().take(4)
            .ifEmpty { listOf(if (cleanBase == "UZS") "USD" else "UZS") }
        val cleanAmount = fixedAmount.takeIf { it.isFinite() } ?: 100.0
        return copy(
            toolId = migratedType.canonicalToolId,
            widgetType = migratedType,
            sizeCapability = WidgetSizeTier.entries.firstOrNull { it.wireName == sizeCapability }?.wireName ?: WidgetSizeTier.M.wireName,
            converterCategory = converterCategory.ifBlank { "Length" },
            converterFrom = converterFrom.ifBlank { "km" },
            converterTo = converterTo.ifBlank { "mi" },
            currencyBase = cleanBase,
            currencyQuote = cleanQuotes.first(),
            currencyQuotes = cleanQuotes,
            fixedAmount = cleanAmount,
            defaultMode = defaultMode.takeIf { it in setOf("standard-calculator", "scientific-calculator", "programmer-calculator") } ?: "standard-calculator",
            themeKey = themeKey.takeIf { it in setOf("system", "light", "dark") } ?: "system",
            displayDirection = displayDirection.takeIf { it in setOf("base-to-quote", "bidirectional") } ?: "base-to-quote",
            migrationState = when {
                unsupportedLegacy -> "reset-unsupported-legacy:$toolId"
                schemaVersion < CURRENT_WIDGET_SCHEMA -> "migrated-schema-$schemaVersion:$toolId"
                else -> migrationState.ifBlank { "native-v4" }
            },
            schemaVersion = CURRENT_WIDGET_SCHEMA
        )
    }

    companion object {
        const val CURRENT_WIDGET_SCHEMA = 4
        fun default(id: Int, type: WidgetType): WidgetConfig = WidgetConfig(
            appWidgetId = id,
            toolId = type.canonicalToolId,
            widgetType = type,
            fixedAmount = if (type == WidgetType.CURRENCY_CONVERTER) 1.0 else 100.0
        ).normalized()
    }
}

private const val CURRENT_WIDGET_SCHEMA = WidgetConfig.CURRENT_WIDGET_SCHEMA

class PersonalizationStore(context: Context) {
    private val prefs = context.getSharedPreferences("adaptive_state", Context.MODE_PRIVATE)

    @Synchronized fun load(): AdaptiveState {
        val raw = prefs.getString("state", null) ?: return AdaptiveState()
        return try {
            val j = JSONObject(raw)
            AdaptiveState(
                recentToolIds = j.optJSONArray("recentTools").strings(),
                toolUseCounts = j.optJSONObject("toolCounts").intMap(),
                recentConverters = j.optJSONArray("recentConverters").strings(),
                converterUseCounts = j.optJSONObject("converterCounts").intMap(),
                favorites = j.optJSONArray("favorites").strings().toSet(),
                preferredCurrencyPairs = j.optJSONArray("currencyPairs").strings(),
                preferredUnits = j.optJSONObject("preferredUnits").stringMap(),
                preferredCalculatorMode = j.optString("calculatorMode", "standard"),
                lastDegree = if (j.has("lastDegree")) j.optInt("lastDegree") else null,
                perToolSettings = j.optJSONObject("perToolSettings").nestedStringMap(),
                graphState = j.optJSONObject("graphState").stringMap(),
                schemaVersion = j.optInt("schemaVersion", 1)
            )
        } catch (_: Exception) { AdaptiveState() }
    }

    @Synchronized fun save(state: AdaptiveState) {
        val j = JSONObject().put("recentTools", JSONArray(state.recentToolIds)).put("toolCounts", JSONObject(state.toolUseCounts))
            .put("recentConverters", JSONArray(state.recentConverters)).put("converterCounts", JSONObject(state.converterUseCounts))
            .put("favorites", JSONArray(state.favorites.toList())).put("currencyPairs", JSONArray(state.preferredCurrencyPairs))
            .put("preferredUnits", JSONObject(state.preferredUnits)).put("calculatorMode", state.preferredCalculatorMode)
            .put("perToolSettings", JSONObject().apply { state.perToolSettings.forEach { (toolId, values) -> put(toolId, JSONObject(values)) } })
            .put("graphState", JSONObject(state.graphState)).put("schemaVersion", state.schemaVersion)
        state.lastDegree?.let { j.put("lastDegree", it) }
        prefs.edit().putString("state", j.toString()).commit()
    }

    @Synchronized fun recordTool(toolId: String) { save(AdaptiveEngine.recordToolUse(load(), toolId)) }
    @Synchronized fun recordConverter(category: String) { save(AdaptiveEngine.recordConverterUse(load(), category)) }
    @Synchronized fun clear() { prefs.edit().clear().commit() }
}

class WidgetConfigStore(context: Context) {
    private val prefs = context.getSharedPreferences("widget_configs", Context.MODE_PRIVATE)
    @Synchronized fun save(config: WidgetConfig) { write(config.normalized()) }
    @Synchronized fun load(id: Int): WidgetConfig? = prefs.getString(id.toString(), null)?.let { raw ->
        runCatching { decode(JSONObject(raw)).normalized() }.getOrNull()?.also { normalized ->
            if (raw != encode(normalized).toString()) write(normalized)
        }
    }
    @Synchronized fun delete(id: Int) { prefs.edit().remove(id.toString()).commit() }
    @Synchronized fun all(): List<WidgetConfig> = prefs.all.keys.mapNotNull { it.toIntOrNull()?.let(::load) }.sortedBy { it.appWidgetId }

    private fun write(config: WidgetConfig) { prefs.edit().putString(config.appWidgetId.toString(), encode(config).toString()).commit() }

    private fun encode(c: WidgetConfig) = JSONObject()
        .put("id", c.appWidgetId).put("toolId", c.toolId).put("widgetType", c.widgetType.wireName).put("size", c.sizeCapability)
        .put("values", JSONObject(c.values)).put("units", JSONObject(c.preferredUnits))
        .put("converterCategory", c.converterCategory).put("converterFrom", c.converterFrom).put("converterTo", c.converterTo)
        .put("base", c.currencyBase).put("quote", c.currencyQuote).put("quotes", JSONArray(c.currencyQuotes))
        .put("amount", c.fixedAmount).put("defaultMode", c.defaultMode).put("theme", c.themeKey)
        .put("displayDirection", c.displayDirection).put("migrationState", c.migrationState).put("schemaVersion", c.schemaVersion)

    private fun decode(j: JSONObject): WidgetConfig {
        val toolId = j.optString("toolId", "standard-calculator")
        val quote = j.optString("quote", "UZS")
        return WidgetConfig(
            appWidgetId = j.getInt("id"), toolId = toolId,
            widgetType = WidgetType.fromWire(j.optString("widgetType")) ?: WidgetType.fromLegacyTool(toolId),
            sizeCapability = j.optString("size", WidgetSizeTier.M.wireName),
            values = j.optJSONObject("values").stringMap(), preferredUnits = j.optJSONObject("units").stringMap(),
            converterCategory = j.optString("converterCategory", "Length"), converterFrom = j.optString("converterFrom", "km"),
            converterTo = j.optString("converterTo", "mi"), currencyBase = j.optString("base", "USD"), currencyQuote = quote,
            currencyQuotes = j.optJSONArray("quotes").strings().ifEmpty { listOf(quote) }, fixedAmount = j.optDouble("amount", 100.0),
            defaultMode = j.optString("defaultMode", "standard-calculator"), themeKey = j.optString("theme", "system"),
            displayDirection = j.optString("displayDirection", "base-to-quote"), migrationState = j.optString("migrationState", ""),
            schemaVersion = j.optInt("schemaVersion", 1).coerceAtLeast(1)
        )
    }
}

private fun JSONArray?.strings(): List<String> = if (this == null) emptyList() else (0 until length()).mapNotNull { optString(it).takeIf(String::isNotBlank) }
private fun JSONObject?.stringMap(): Map<String,String> = if (this == null) emptyMap() else keys().asSequence().associateWith { optString(it) }
private fun JSONObject?.intMap(): Map<String,Int> = if (this == null) emptyMap() else keys().asSequence().associateWith { optInt(it) }

private fun JSONObject?.nestedStringMap(): Map<String,Map<String,String>> = if (this == null) emptyMap() else keys().asSequence().associateWith { optJSONObject(it).stringMap() }
