package com.veltrix.calculator.core

import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.abs

class FormulaEngine(private val units: UnitRegistry = UnitRegistry()) : ToolEngine {
    override fun execute(definition: ToolDefinition, request: ToolRequest): ToolResponse {
        val formula = definition.formulaDefinition
            ?: return error(definition.id, "FORMULA_MISSING", "Formula definition is missing")
        val numericInputs = linkedMapOf<String, Double>()
        val normalized = linkedMapOf<String, String>()

        for (field in definition.inputSchema) {
            val supplied = request.inputs[field.id] ?: continue
            val raw = supplied.value.toDoubleOrNull()
                ?: return error(definition.id, "INVALID_NUMBER", "${field.label} must be numeric", field.id)
            val canonical = try {
                if (field.unitCategory != null && supplied.unit != null && field.canonicalUnit != null) {
                    units.convert(field.unitCategory, raw, supplied.unit, field.canonicalUnit)
                } else raw
            } catch (e: IllegalArgumentException) {
                return error(definition.id, "UNIT_ERROR", e.message ?: "Invalid unit", field.id)
            }
            if (!canonical.isFinite()) return error(definition.id, "NON_FINITE_INPUT", "${field.label} must be finite", field.id)
            numericInputs[field.id] = canonical
            normalized[field.id] = NumericFormat.stable(canonical)
        }

        val declaredTargets = (formula.solveRules.keys + formula.solveBranches.keys).toSet()
        val unknown = request.selectedUnknown?.also {
            if (it !in declaredTargets) return error(definition.id, "UNSUPPORTED_UNKNOWN", "Cannot solve this formula for $it", it)
        } ?: run {
            val missing = definition.inputSchema.map { it.id }.filter { it !in numericInputs && it in declaredTargets }
            if (missing.size != 1) {
                return error(definition.id, "AMBIGUOUS_UNKNOWN", "Select exactly one supported unknown; missing=${missing.joinToString()}")
            }
            missing.single()
        }

        val requiredKnown = definition.inputSchema.map { it.id }.filter { it != unknown }
        val missingKnown = requiredKnown.filter { it !in numericInputs }
        if (missingKnown.isNotEmpty()) {
            return error(definition.id, "MISSING_REQUIRED_VALUE", "Missing required values: ${missingKnown.joinToString()}", missingKnown.first())
        }

        val expressions = formula.expressionsFor(unknown)
        if (expressions.isEmpty()) return error(definition.id, "UNSUPPORTED_UNKNOWN", "Cannot solve this formula for $unknown", unknown)

        val accepted = mutableListOf<Double>()
        val ctx = Ctx(
            settings = request.settings,
            vars = numericInputs.mapValues { (_, value) -> BigDecimal.valueOf(value) }
        )
        for (expression in expressions) {
            val candidate = try {
                ExpressionEngine().parse(expression).eval(ctx).toDouble()
            } catch (_: Exception) {
                continue
            }
            if (!candidate.isFinite()) continue
            val vars = numericInputs + (unknown to candidate)
            if (!DomainRules.accept(definition.validationRules, vars)) continue
            if (accepted.none { equivalent(it, candidate, formula.numericTolerance) }) accepted += candidate
        }
        if (accepted.isEmpty()) return error(definition.id, "NO_SOLUTION", "No valid solution satisfies the declared formula/domain")

        val formatted = accepted.map(NumericFormat::stable)
        val symbolic = formula.symbolicByTarget[unknown]
        val primary = symbolic ?: formatted.first()
        return ToolResponse(
            toolId = definition.id,
            primary = primary,
            outputs = mapOf(unknown to primary),
            normalizedInput = normalized,
            metadata = mapOf("solvedFor" to unknown, "solutionCount" to formatted.size.toString()),
            exact = symbolic != null,
            solutions = formatted,
            symbolic = symbolic,
            numericTolerance = formula.numericTolerance
        )
    }

    private fun equivalent(a: Double, b: Double, tolerance: Double): Boolean {
        val scale = maxOf(1.0, abs(a), abs(b))
        return abs(a - b) <= tolerance * scale
    }

    private fun error(toolId: String, code: String, message: String, field: String? = null) =
        ToolResponse(toolId = toolId, error = StructuredError(code, message, field))
}

private object NumericFormat {
    fun stable(value: Double): String {
        if (value == 0.0) return "0"
        return BigDecimal.valueOf(value).setScale(12, RoundingMode.HALF_EVEN).stripTrailingZeros().toPlainString()
    }
}

private object DomainRules {
    fun accept(rules: List<String>, vars: Map<String, Double>): Boolean = rules.all { rule ->
        val compact = rule.replace(" ", "")
        when {
            ">=" in compact -> compare(compact, ">=", vars) { a, b -> a >= b }
            "<=" in compact -> compare(compact, "<=", vars) { a, b -> a <= b }
            "!=" in compact -> compare(compact, "!=", vars) { a, b -> a != b }
            ">" in compact -> compare(compact, ">", vars) { a, b -> a > b }
            "<" in compact -> compare(compact, "<", vars) { a, b -> a < b }
            else -> true
        }
    }

    private fun compare(rule: String, op: String, vars: Map<String, Double>, predicate: (Double, Double) -> Boolean): Boolean {
        val parts = rule.split(op, limit = 2)
        if (parts.size != 2) return true
        val left = vars[parts[0]] ?: parts[0].toDoubleOrNull() ?: return true
        val right = vars[parts[1]] ?: parts[1].toDoubleOrNull() ?: return true
        return predicate(left, right)
    }
}
