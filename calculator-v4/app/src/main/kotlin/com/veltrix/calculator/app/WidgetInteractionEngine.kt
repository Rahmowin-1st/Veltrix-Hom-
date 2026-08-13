package com.veltrix.calculator.app

import android.content.Context
import com.veltrix.calculator.core.ConversionRegistry
import com.veltrix.calculator.core.InputFieldDefinition
import com.veltrix.calculator.core.InputKind
import com.veltrix.calculator.core.PlatformEngine
import com.veltrix.calculator.core.ToolDefinition
import com.veltrix.calculator.core.ToolInput
import com.veltrix.calculator.core.ToolRequest
import org.json.JSONObject

enum class WidgetInteractionPhase { CONFIGURED, SELECT_FIELD, EDIT_VALUE, RESULT }

data class WidgetInteractionState(
    val appWidgetId: Int,
    val toolId: String,
    val phase: WidgetInteractionPhase = WidgetInteractionPhase.CONFIGURED,
    val selectedFieldId: String? = null,
    val buffer: String = "",
    val values: Map<String, String> = emptyMap(),
    val units: Map<String, String> = emptyMap(),
    val result: String = "",
    val outputs: Map<String, String> = emptyMap(),
    val errorCode: String? = null,
    val graphSignature: String = "",
    val revision: Long = 0,
    val schemaVersion: Int = 2
)

/** Persistent state for standalone widget editing. Uses process-independent SharedPreferences. */
class WidgetInteractionStateStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("widget_interaction_v2", Context.MODE_PRIVATE)

    @Synchronized fun load(id: Int): WidgetInteractionState? = prefs.getString(id.toString(), null)?.let { raw ->
        runCatching {
            val j = JSONObject(raw)
            WidgetInteractionState(
                appWidgetId = j.getInt("id"), toolId = j.getString("toolId"),
                phase = runCatching { WidgetInteractionPhase.valueOf(j.optString("phase", "CONFIGURED")) }.getOrDefault(WidgetInteractionPhase.CONFIGURED),
                selectedFieldId = j.optString("selectedField", "").ifBlank { null }, buffer = j.optString("buffer", ""),
                values = j.optJSONObject("values").stringMapLocal(), units = j.optJSONObject("units").stringMapLocal(),
                result = j.optString("result", ""), outputs = j.optJSONObject("outputs").stringMapLocal(),
                errorCode = j.optString("error", "").ifBlank { null }, graphSignature = j.optString("graphSignature", ""),
                revision = j.optLong("revision", 0), schemaVersion = j.optInt("schemaVersion", 2)
            )
        }.getOrNull()
    }

    @Synchronized fun save(s: WidgetInteractionState) {
        val j = JSONObject().put("id", s.appWidgetId).put("toolId", s.toolId).put("phase", s.phase.name)
            .put("selectedField", s.selectedFieldId ?: "").put("buffer", s.buffer).put("values", JSONObject(s.values))
            .put("units", JSONObject(s.units)).put("result", s.result).put("outputs", JSONObject(s.outputs))
            .put("error", s.errorCode ?: "").put("graphSignature", s.graphSignature).put("revision", s.revision)
            .put("schemaVersion", s.schemaVersion)
        prefs.edit().putString(s.appWidgetId.toString(), j.toString()).commit()
    }

    @Synchronized fun delete(id: Int) { prefs.edit().remove(id.toString()).commit() }
}

/** Existing calculator/currency display state, now exposed through a typed store for deterministic tests. */
class WidgetRuntimeStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("widget_runtime", Context.MODE_PRIVATE)
    fun expression(id: Int, default: String = "") = prefs.getString("${id}_expr", default).orEmpty()
    fun result(id: Int, default: String = "") = prefs.getString("${id}_result", default).orEmpty()
    fun meta(id: Int, default: String = "") = prefs.getString("${id}_meta", default).orEmpty()
    fun setExpression(id: Int, value: String) { prefs.edit().putString("${id}_expr", value).commit() }
    fun setResult(id: Int, value: String) { prefs.edit().putString("${id}_result", value).commit() }
    fun setMeta(id: Int, value: String) { prefs.edit().putString("${id}_meta", value).commit() }
    fun set(id: Int, expression: String? = null, result: String? = null, meta: String? = null) {
        val e = prefs.edit(); expression?.let { e.putString("${id}_expr", it) }; result?.let { e.putString("${id}_result", it) }; meta?.let { e.putString("${id}_meta", it) }; e.commit()
    }
    fun delete(id: Int) { prefs.edit().remove("${id}_expr").remove("${id}_result").remove("${id}_meta").commit() }
}

/**
 * Schema-driven standalone widget interaction engine.
 * Tool-specific widget code is deliberately avoided: inputSchema/outputSchema remain canonical.
 */
class WidgetInteractionEngine(
    private val platform: PlatformEngine = PlatformEngine(),
    private val converters: ConversionRegistry = ConversionRegistry.default()
) {
    fun initial(config: WidgetConfig): WidgetInteractionState {
        val tool = platform.registry.require(config.toolId)
        val selected = initialField(tool, config.values)
        return WidgetInteractionState(
            appWidgetId = config.appWidgetId, toolId = config.toolId, phase = WidgetInteractionPhase.SELECT_FIELD,
            selectedFieldId = selected?.id, buffer = selected?.let { config.values[it.id].orEmpty() }.orEmpty(),
            values = config.values, units = config.preferredUnits, revision = 1
        )
    }

    fun reconcile(config: WidgetConfig, persisted: WidgetInteractionState?): WidgetInteractionState {
        if (persisted == null || persisted.toolId != config.toolId || persisted.schemaVersion < 2) return initial(config)
        val tool = platform.registry.require(config.toolId)
        val valid = tool.inputSchema.map { it.id }.toSet()
        val selected = persisted.selectedFieldId?.takeIf { it in valid } ?: initialField(tool, config.values)?.id
        val merged = config.values + persisted.values.filterKeys { it in valid }
        return persisted.copy(selectedFieldId = selected, values = merged, units = config.preferredUnits + persisted.units)
    }

    fun next(tool: ToolDefinition, state: WidgetInteractionState, delta: Int): WidgetInteractionState {
        if (tool.inputSchema.isEmpty()) return state
        val current = tool.inputSchema.indexOfFirst { it.id == state.selectedFieldId }.let { if (it < 0) 0 else it }
        val next = Math.floorMod(current + delta, tool.inputSchema.size)
        val field = tool.inputSchema[next]
        val applied = applyBuffer(tool, state)
        return applied.copy(
            phase = WidgetInteractionPhase.SELECT_FIELD, selectedFieldId = field.id,
            buffer = applied.values[field.id].orEmpty().ifBlank { defaultFor(field) }, revision = applied.revision + 1
        )
    }

    fun key(tool: ToolDefinition, state: WidgetInteractionState, key: String): WidgetInteractionState {
        val f = field(tool, state) ?: return state
        if (f.kind == InputKind.SELECT) return cycleOption(tool, state)
        if (!allowed(f, state.buffer, key)) return state
        return state.copy(phase = WidgetInteractionPhase.EDIT_VALUE, buffer = (state.buffer + key).take(128), revision = state.revision + 1)
    }

    fun backspace(tool: ToolDefinition, state: WidgetInteractionState): WidgetInteractionState {
        field(tool, state) ?: return state
        return state.copy(phase = WidgetInteractionPhase.EDIT_VALUE, buffer = state.buffer.dropLast(1), revision = state.revision + 1)
    }

    fun clearField(tool: ToolDefinition, state: WidgetInteractionState): WidgetInteractionState {
        field(tool, state) ?: return state
        return state.copy(phase = WidgetInteractionPhase.EDIT_VALUE, buffer = "", revision = state.revision + 1)
    }

    fun sign(tool: ToolDefinition, state: WidgetInteractionState): WidgetInteractionState {
        val f = field(tool, state) ?: return state
        if (f.kind !in setOf(InputKind.NUMBER, InputKind.INTEGER, InputKind.DATASET, InputKind.EXPRESSION) || !f.allowNegative) return state
        val b = if (state.buffer.startsWith("-")) state.buffer.drop(1) else "-${state.buffer}"
        return state.copy(phase = WidgetInteractionPhase.EDIT_VALUE, buffer = b, revision = state.revision + 1)
    }

    fun decimal(tool: ToolDefinition, state: WidgetInteractionState): WidgetInteractionState {
        val f = field(tool, state) ?: return state
        if (f.kind == InputKind.INTEGER || f.kind == InputKind.SELECT || state.buffer.substringAfterLast(',').contains('.')) return state
        return key(tool, state, ".")
    }

    fun separator(tool: ToolDefinition, state: WidgetInteractionState): WidgetInteractionState {
        val f = field(tool, state) ?: return state
        return if (f.kind in setOf(InputKind.DATASET, InputKind.TEXT, InputKind.EXPRESSION)) key(tool, state, ",") else state
    }

    fun cycleOption(tool: ToolDefinition, state: WidgetInteractionState): WidgetInteractionState {
        val f = field(tool, state) ?: return state
        if (f.kind != InputKind.SELECT || f.options.isEmpty()) return state
        val current = f.options.indexOf(state.buffer).let { if (it < 0) -1 else it }
        val next = f.options[(current + 1) % f.options.size]
        return state.copy(phase = WidgetInteractionPhase.EDIT_VALUE, buffer = next, revision = state.revision + 1)
    }

    fun cycleUnit(tool: ToolDefinition, state: WidgetInteractionState): WidgetInteractionState {
        val f = field(tool, state) ?: return state
        val canonical = f.canonicalUnit ?: return state
        val baseUnit = converters.resolve(canonical) ?: return state
        val options = converters.units(baseUnit.category)
        if (options.size < 2) return state
        val current = state.units[f.id] ?: canonical
        val idx = options.indexOfFirst { it.id.equals(current, true) || it.symbol.equals(current, true) }.let { if (it < 0) 0 else it }
        val next = options[(idx + 1) % options.size].id
        return state.copy(units = state.units + (f.id to next), revision = state.revision + 1)
    }

    fun apply(tool: ToolDefinition, state: WidgetInteractionState): WidgetInteractionState = applyBuffer(tool, state).copy(
        phase = WidgetInteractionPhase.SELECT_FIELD, revision = state.revision + 1
    )

    fun reset(config: WidgetConfig): WidgetInteractionState = initial(config).copy(revision = (System.currentTimeMillis() and Long.MAX_VALUE))

    fun solve(config: WidgetConfig, state: WidgetInteractionState): WidgetInteractionState {
        val tool = platform.registry.require(config.toolId)
        val applied = applyBuffer(tool, state)
        val inputs = applied.values.mapValues { (id, value) -> ToolInput(value, applied.units[id]) }
        val response = platform.execute(ToolRequest(config.toolId, inputs))
        val signature = if (tool.executorKind.name == "GRAPH") stableSignature(config.toolId, applied.values, response.primary) else applied.graphSignature
        return if (response.isSuccess) applied.copy(
            phase = WidgetInteractionPhase.RESULT, result = response.primary, outputs = response.outputs,
            errorCode = null, graphSignature = signature, revision = applied.revision + 1
        ) else applied.copy(
            phase = WidgetInteractionPhase.RESULT, result = "Error: ${response.error?.code}", outputs = emptyMap(),
            errorCode = response.error?.code, graphSignature = signature, revision = applied.revision + 1
        )
    }

    fun selectedField(tool: ToolDefinition, state: WidgetInteractionState): InputFieldDefinition? = field(tool, state)

    private fun applyBuffer(tool: ToolDefinition, state: WidgetInteractionState): WidgetInteractionState {
        val f = field(tool, state) ?: return state
        val value = if (f.kind == InputKind.SELECT && state.buffer.isBlank()) defaultFor(f) else state.buffer.trim()
        return state.copy(values = state.values + (f.id to value), buffer = value)
    }

    private fun initialField(tool: ToolDefinition, values: Map<String, String>): InputFieldDefinition? =
        tool.inputSchema.firstOrNull()

    private fun field(tool: ToolDefinition, state: WidgetInteractionState) = tool.inputSchema.firstOrNull { it.id == state.selectedFieldId }
    private fun defaultFor(f: InputFieldDefinition) = if (f.kind == InputKind.SELECT) f.options.firstOrNull().orEmpty() else ""

    private fun allowed(f: InputFieldDefinition, current: String, key: String): Boolean = when (f.kind) {
        InputKind.NUMBER -> key.singleOrNull()?.isDigit() == true || (key == "." && !current.contains('.')) || (key == "-" && f.allowNegative && current.isBlank())
        InputKind.INTEGER -> key.singleOrNull()?.isDigit() == true || (key == "-" && f.allowNegative && current.isBlank())
        InputKind.DATASET, InputKind.VECTOR, InputKind.MATRIX -> key.all { it.isDigit() || it in "-+.,; []" }
        InputKind.EXPRESSION, InputKind.TEXT -> key.all { it.isLetterOrDigit() || it in "-+*/^().,% x" }
        InputKind.DATE -> key.all { it.isDigit() || it == '-' }
        InputKind.SELECT -> false
    }

    private fun stableSignature(toolId: String, values: Map<String, String>, primary: String): String =
        (toolId + "|" + values.toSortedMap().entries.joinToString("|") { "${it.key}=${it.value}" } + "|" + primary).hashCode().toUInt().toString(16)
}

private fun JSONObject?.stringMapLocal(): Map<String, String> = if (this == null) emptyMap() else keys().asSequence().associateWith { optString(it) }
