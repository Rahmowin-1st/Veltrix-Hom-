package com.veltrix.calculator.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Exhaustive contract gate for the additive V4 catalog and every declared solve target. */
class V4CatalogContractTest {
    private val engine = PlatformEngine()
    private val number = Regex("[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?")

    @Test
    fun v4CatalogIsLiveAndGrade8HardGateIsComplete() {
        val all = engine.registry.all()
        assertEquals(ToolRegistry.EXPECTED_V4_TOOLS, all.size)
        val v4Ids = V4Catalog.tools().map { it.id }.toSet()
        assertEquals(V4Catalog.EXPECTED_ADDITIONS, v4Ids.size)
        assertTrue(v4Ids.all { engine.registry.get(it) != null }, "Every V4 entry must be reachable from the canonical registry")

        val grade8 = all.filter { EducationLevel.GRADE_8 in it.educationLevels }
        assertEquals(25, grade8.size, "Grade 8 Physics hard-gate inventory drift")
        assertTrue(grade8.all { it.subject == Subject.PHYSICS && it.formulaDefinition != null })
        assertTrue(grade8.flatMap { it.solveTargets }.isNotEmpty())

        listOf(EducationLevel.GRADE_9, EducationLevel.GRADE_10, EducationLevel.GRADE_11,
            EducationLevel.ADVANCED, EducationLevel.COLLEGE_INTRO).forEach { level ->
            assertTrue(all.any { level in it.educationLevels }, "$level must have live registry coverage")
        }
    }

    @Test
    fun everyV4DeclaredTargetSolvesDeterministicallyWithoutGuessing() {
        V4Catalog.tools().forEach { raw ->
            val tool = engine.registry.require(raw.id)
            val formula = assertNotNull(tool.formulaDefinition)
            val targets = tool.solveTargets.toList()
            assertTrue(targets.isNotEmpty(), "${tool.id} must expose a solve target")
            assertTrue(targets.all { target -> tool.inputSchema.any { it.id == target } }, "${tool.id} has a non-input target")

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
                assertEquals(tool.calculationMethod.name, first.metadata["calculationMethod"])
                val expected = assignment.getValue(target)
                val candidates = first.solutions.mapNotNull(::parseNumber)
                assertTrue(candidates.any { near(it, expected, formula.numericTolerance) },
                    "${tool.id}/$target did not recover $expected; candidates=$candidates; assignment=$assignment")
            }

            val ambiguous = engine.execute(ToolRequest(tool.id, emptyMap()))
            assertTrue(!ambiguous.isSuccess, "${tool.id} must never guess multiple missing values")
        }
    }

    private fun consistentAssignment(tool: ToolDefinition, seedTarget: String): Map<String, Double> {
        repeat(16) { attempt ->
            val seed = tool.inputSchema.mapIndexed { index, field ->
                field.id to sample(tool, field, index, attempt)
            }.toMap().toMutableMap()
            val response = engine.execute(ToolRequest(
                toolId = tool.id,
                inputs = seed.filterKeys { it != seedTarget }.mapValues { ToolInput(it.value.toString()) },
                selectedUnknown = seedTarget
            ))
            val solved = response.solutions.firstNotNullOfOrNull(::parseNumber)
            if (response.isSuccess && solved != null && solved.isFinite()) {
                seed[seedTarget] = solved
                return seed
            }
        }
        error("${tool.id}/$seedTarget could not produce a valid deterministic seed assignment")
    }

    private fun sample(tool: ToolDefinition, field: InputFieldDefinition, index: Int, attempt: Int): Double {
        // Annulus inputs have a relational domain: the outer radius must be
        // larger than the inner radius. Keep the exhaustive gate's seed valid
        // instead of weakening product validation for impossible geometry.
        if (tool.id == "geometry-v4-annulus-area") {
            if (field.id == "R") return 5.0 + attempt * 0.25
            if (field.id == "r") return 2.0 + attempt * 0.10
        }
        if (tool.id == "physics-g11-photoelectric") {
            if (field.id == "f") return 8.0e14 + attempt * 1.0e13
            if (field.id == "phi") return 2.0e-19 + attempt * 1.0e-21
        }
        if (tool.id == "physics-g9-critical-angle") {
            if (field.id == "n1") return 2.0 + attempt * 0.02
            if (field.id == "n2") return 1.33 + attempt * 0.01
        }
        val low = field.min
        val high = field.max
        if (low != null && high != null) return low + (high - low) * (0.35 + attempt.coerceAtMost(5) * 0.05)
        if (field.dimension == "Angle" || field.unitCategory == "Angle") return 0.35 + index * 0.07 + attempt * 0.03
        if (field.canonicalUnit == "Hz") return 5.0e14 + index * 1.0e13 + attempt * 1.0e12
        val base = 2.0 + index + (attempt % 5) * 0.4
        return when {
            low != null -> maxOf(low + 1.0, base)
            high != null -> minOf(high - 1.0, base)
            else -> base
        }
    }

    private fun parseNumber(value: String): Double? = number.find(value)?.value?.toDoubleOrNull()
    private fun near(actual: Double, expected: Double, tolerance: Double): Boolean {
        val scale = maxOf(abs(actual), abs(expected), 1e-300)
        return abs(actual - expected) <= tolerance * 100.0 * scale
    }
}
