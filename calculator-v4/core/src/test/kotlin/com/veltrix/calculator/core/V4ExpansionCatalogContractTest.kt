package com.veltrix.calculator.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Exhaustive deterministic proof for every additive V4 expansion solve target. */
class V4ExpansionCatalogContractTest {
    private val engine = PlatformEngine()
    private val number = Regex("[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?")

    @Test
    fun expansionIsCanonicalAndEveryTargetIsReachable() {
        val additions = V4ExpansionCatalog.tools()
        assertEquals(V4ExpansionCatalog.EXPECTED_ADDITIONS, additions.size)
        assertTrue(additions.all { engine.registry.get(it.id) != null }, "Every V4 expansion entry must be live in ToolRegistry")
        assertEquals(ToolRegistry.EXPECTED_V4_TOOLS, engine.registry.all().size)
    }

    @Test
    fun everyExpansionTargetSolvesTwiceWithoutGuessing() {
        V4ExpansionCatalog.tools().forEach { raw ->
            val tool = engine.registry.require(raw.id)
            val formula = assertNotNull(tool.formulaDefinition)
            val targets = tool.solveTargets.toList()
            assertTrue(targets.isNotEmpty(), "${tool.id} must expose a solve target")
            assertTrue(targets.all { target -> tool.inputSchema.any { it.id == target } })

            val assignment = consistentAssignment(tool, targets.first())
            targets.forEach { target ->
                val request = ToolRequest(
                    toolId = tool.id,
                    inputs = assignment.filterKeys { it != target }.mapValues { ToolInput(it.value.toString()) },
                    selectedUnknown = target
                )
                val first = engine.execute(request)
                val second = engine.execute(request)
                assertTrue(first.isSuccess, "${tool.id}/$target failed: ${first.error}; assignment=$assignment")
                assertEquals(first, second, "${tool.id}/$target must be deterministic")
                assertEquals(target, first.metadata["solvedFor"])
                val expected = assignment.getValue(target)
                val candidates = first.solutions.mapNotNull(::parseNumber)
                assertTrue(candidates.any { near(it, expected, formula.numericTolerance) }, "${tool.id}/$target did not recover $expected; candidates=$candidates; assignment=$assignment")
            }

            val ambiguous = engine.execute(ToolRequest(tool.id, emptyMap()))
            assertTrue(!ambiguous.isSuccess, "${tool.id} must never guess multiple missing values")
        }
    }

    private fun consistentAssignment(tool: ToolDefinition, seedTarget: String): Map<String, Double> {
        repeat(24) { attempt ->
            val seed = tool.inputSchema.mapIndexed { index, field -> field.id to sample(field, index, attempt) }.toMap().toMutableMap()
            val response = engine.execute(
                ToolRequest(
                    toolId = tool.id,
                    inputs = seed.filterKeys { it != seedTarget }.mapValues { ToolInput(it.value.toString()) },
                    selectedUnknown = seedTarget
                )
            )
            val solved = response.solutions.firstNotNullOfOrNull(::parseNumber)
            if (response.isSuccess && solved != null && solved.isFinite()) {
                seed[seedTarget] = solved
                return seed
            }
        }
        error("${tool.id}/$seedTarget could not produce a valid deterministic seed assignment")
    }

    private fun sample(field: InputFieldDefinition, index: Int, attempt: Int): Double {
        val low = field.min
        val high = field.max
        if (low != null && high != null) return low + (high - low) * (0.30 + attempt.coerceAtMost(6) * 0.05)
        val base = 2.0 + index + (attempt % 7) * 0.35
        return when {
            low != null -> maxOf(low + 1.0, base)
            high != null -> minOf(high - 1.0, base)
            else -> base
        }
    }

    private fun parseNumber(value: String): Double? = number.find(value)?.value?.toDoubleOrNull()

    private fun near(actual: Double, expected: Double, tolerance: Double): Boolean {
        val scale = maxOf(abs(actual), abs(expected), 1e-300)
        return abs(actual - expected) <= tolerance * 1000.0 * scale
    }
}
