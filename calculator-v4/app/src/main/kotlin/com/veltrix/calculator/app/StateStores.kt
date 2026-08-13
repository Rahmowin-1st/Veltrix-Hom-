package com.veltrix.calculator.app

import android.content.Context
import com.veltrix.calculator.core.AdaptiveEngine
import com.veltrix.calculator.core.AdaptiveState
import org.json.JSONArray
import org.json.JSONObject

data class WidgetConfig(
    val appWidgetId: Int,
    val toolId: String,
    val sizeCapability: String = "medium",
    val values: Map<String, String> = emptyMap(),
    val preferredUnits: Map<String, String> = emptyMap(),
    val currencyBase: String = "USD",
    val currencyQuote: String = "UZS",
    val fixedAmount: Double = 100.0,
    val schemaVersion: Int = 2
)

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
    @Synchronized fun save(config: WidgetConfig) { prefs.edit().putString(config.appWidgetId.toString(), encode(config).toString()).commit() }
    @Synchronized fun load(id: Int): WidgetConfig? = prefs.getString(id.toString(), null)?.let { runCatching { decode(JSONObject(it)) }.getOrNull() }
    @Synchronized fun delete(id: Int) { prefs.edit().remove(id.toString()).commit() }
    @Synchronized fun all(): List<WidgetConfig> = prefs.all.keys.mapNotNull { it.toIntOrNull()?.let(::load) }

    private fun encode(c: WidgetConfig) = JSONObject().put("id",c.appWidgetId).put("toolId",c.toolId).put("size",c.sizeCapability)
        .put("values",JSONObject(c.values)).put("units",JSONObject(c.preferredUnits)).put("base",c.currencyBase).put("quote",c.currencyQuote)
        .put("amount",c.fixedAmount).put("schemaVersion",c.schemaVersion)
    private fun decode(j: JSONObject) = WidgetConfig(j.getInt("id"),j.getString("toolId"),j.optString("size","medium"),j.optJSONObject("values").stringMap(),j.optJSONObject("units").stringMap(),j.optString("base","USD"),j.optString("quote","UZS"),j.optDouble("amount",100.0),j.optInt("schemaVersion",1).coerceAtLeast(1))
}

private fun JSONArray?.strings(): List<String> = if (this == null) emptyList() else (0 until length()).mapNotNull { optString(it).takeIf(String::isNotBlank) }
private fun JSONObject?.stringMap(): Map<String,String> = if (this == null) emptyMap() else keys().asSequence().associateWith { optString(it) }
private fun JSONObject?.intMap(): Map<String,Int> = if (this == null) emptyMap() else keys().asSequence().associateWith { optInt(it) }

private fun JSONObject?.nestedStringMap(): Map<String,Map<String,String>> = if (this == null) emptyMap() else keys().asSequence().associateWith { optJSONObject(it).stringMap() }
