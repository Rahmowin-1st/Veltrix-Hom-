package com.veltrix.calculator.core

import java.math.BigDecimal
import kotlin.math.abs

class FormulaEngine(
    private val expressionEngine: ExpressionEngine = ExpressionEngine(),
    private val converter: ConversionRegistry = ConversionRegistry.default()
) {
    fun execute(tool: ToolDefinition, request: ToolRequest): ToolResponse {
        val formula = tool.formulaDefinition ?: return fail(tool.id, "NO_FORMULA", "Tool has no formula definition")
        val unknown = request.selectedUnknown ?: inferUnknown(tool, request)
            ?: return fail(tool.id, "UNKNOWN_REQUIRED", "Select the value to solve for")
        val rule = formula.solveRules[unknown]
            ?: return fail(tool.id, "UNSUPPORTED_UNKNOWN", "This tool cannot solve for $unknown", unknown)

        val values = mutableMapOf<String, BigDecimal>()
        val normalized = mutableMapOf<String, String>()
        for (field in tool.inputSchema) {
            if (field.id == unknown) continue
            val raw = request.inputs[field.id]
            if (raw == null || raw.value.isBlank()) {
                if (field.required) return fail(tool.id, "MISSING_INPUT", "${field.label} is required", field.id)
                continue
            }
            val number = raw.value.toDoubleOrNull()
                ?: return fail(tool.id, "INVALID_NUMBER", "${field.label} must be numeric", field.id)
            if (!number.isFinite()) return fail(tool.id, "NON_FINITE", "${field.label} must be finite", field.id)
            if (field.kind == InputKind.INTEGER && kotlin.math.abs(number - kotlin.math.round(number)) > 1e-12) return fail(tool.id, "INVALID_INTEGER", "${field.label} must be an integer", field.id)
            if (!field.allowNegative && number < 0) return fail(tool.id, "NEGATIVE_NOT_ALLOWED", "${field.label} cannot be negative", field.id)
            if (field.min != null && number < field.min) return fail(tool.id, "BELOW_MIN", "${field.label} is below its minimum", field.id)
            if (field.max != null && number > field.max) return fail(tool.id, "ABOVE_MAX", "${field.label} is above its maximum", field.id)

            val canonical = if (raw.unit != null && field.canonicalUnit != null) {
                val converted = converter.convert(number, raw.unit, field.canonicalUnit)
                    ?: return fail(tool.id, "INCOMPATIBLE_UNIT", "${raw.unit} is not compatible with ${field.canonicalUnit}", field.id)
                converted.value
            } else number
            values[field.id] = BigDecimal.valueOf(canonical)
            normalized[field.id] = canonical.toString()
        }

        return try {
            val node = expressionEngine.parse(rule)
            val value = node.eval(Ctx(request.settings, values)).toDouble()
            if (!value.isFinite()) return fail(tool.id, "NON_FINITE_RESULT", "Formula produced a non-finite result", unknown)
            validateSolvedValue(tool, unknown, value)?.let { return it }
            val field = tool.inputSchema.firstOrNull { it.id == unknown }
            val out = format(value, request.settings)
            val unit = field?.canonicalUnit
            ToolResponse(
                toolId = tool.id,
                primary = if (unit == null) out else "$out $unit",
                outputs = mapOf(unknown to out),
                normalizedInput = normalized,
                metadata = mapOf(
                    "unknown" to unknown,
                    "formula" to formula.display,
                    "resultUnit" to (unit ?: "")
                ),
                exact = isNearInteger(value),
                schemaVersion = tool.schemaVersion
            )
        } catch (e: CalcEx) {
            fail(tool.id, e.code, e.message ?: "Formula calculation failed", unknown)
        } catch (_: Exception) {
            fail(tool.id, "FORMULA_ERROR", "Formula calculation failed", unknown)
        }
    }

    private fun inferUnknown(tool: ToolDefinition, request: ToolRequest): String? {
        val blank = tool.inputSchema.filter { request.inputs[it.id]?.value.isNullOrBlank() }
        return if (blank.size == 1 && tool.formulaDefinition?.solveRules?.containsKey(blank[0].id) == true) blank[0].id else null
    }

    private fun validateSolvedValue(tool: ToolDefinition, unknown: String, value: Double): ToolResponse? {
        val f = tool.inputSchema.firstOrNull { it.id == unknown } ?: return null
        if (!f.allowNegative && value < -1e-12) return fail(tool.id, "IMPOSSIBLE_RESULT", "Solved value violates the domain constraints", unknown)
        if (f.min != null && value < f.min - 1e-12) return fail(tool.id, "IMPOSSIBLE_RESULT", "Solved value is below the allowed domain", unknown)
        if (f.max != null && value > f.max + 1e-12) return fail(tool.id, "IMPOSSIBLE_RESULT", "Solved value is above the allowed domain", unknown)
        return null
    }

    private fun isNearInteger(v: Double) = abs(v - kotlin.math.round(v)) < 1e-12
    private fun format(v: Double, settings: EngineSettings) =
        BigDecimal.valueOf(if (abs(v) < 1e-14) 0.0 else v)
            .round(java.math.MathContext(settings.precision.coerceIn(6, 34)))
            .stripTrailingZeros().toPlainString()

    private fun fail(id: String, code: String, msg: String, field: String? = null) =
        ToolResponse(id, error = StructuredError(code, msg, field))
}
