package com.veltrix.calculator.core

data class AdaptiveState(
    val recentToolIds: List<String> = emptyList(),
    val toolUseCounts: Map<String, Int> = emptyMap(),
    val recentConverters: List<String> = emptyList(),
    val converterUseCounts: Map<String, Int> = emptyMap(),
    val favorites: Set<String> = emptySet(),
    val preferredCurrencyPairs: List<String> = emptyList(),
    val preferredUnits: Map<String, String> = emptyMap(),
    val preferredCalculatorMode: String = "standard",
    val lastDegree: Int? = null,
    val perToolSettings: Map<String, Map<String, String>> = emptyMap(),
    val graphState: Map<String, String> = emptyMap(),
    val schemaVersion: Int = 1
)

object AdaptiveEngine {
    fun recordToolUse(state: AdaptiveState, toolId: String): AdaptiveState {
        val recent = (listOf(toolId) + state.recentToolIds.filterNot { it == toolId }).take(50)
        val counts = state.toolUseCounts.toMutableMap().apply { this[toolId] = (this[toolId] ?: 0) + 1 }
        return state.copy(recentToolIds = recent, toolUseCounts = counts)
    }

    fun recordConverterUse(state: AdaptiveState, category: String): AdaptiveState {
        val recent = (listOf(category) + state.recentConverters.filterNot { it == category }).take(20)
        val counts = state.converterUseCounts.toMutableMap().apply { this[category] = (this[category] ?: 0) + 1 }
        return state.copy(recentConverters = recent, converterUseCounts = counts)
    }

    fun lastUsed5(state: AdaptiveState): List<String> = state.recentToolIds.distinct().take(5)
    fun searchBoosts(state: AdaptiveState): Map<String, Double> = state.toolUseCounts.mapValues { (_, count) ->
        when { count >= 50 -> 3.0; count >= 20 -> 2.0; count >= 5 -> 1.0; else -> 0.35 }
    }

    fun reset(): AdaptiveState = AdaptiveState()
}
