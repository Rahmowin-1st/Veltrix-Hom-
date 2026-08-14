package com.veltrix.calculator.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class Grade8PhysicsFullGateTest {
    private val engine = PlatformEngine()
    private val number = Regex("[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?")

    @Test
    fun fullRequiredFormulaInventoryIsLive() {
        val expected = setOf(
            "physics-g8-charge-quantization",
            "physics-g8-charge-conservation",
            "physics-g8-coulomb",
            "physics-g8-electric-field",
            "physics-g8-point-charge-field",
            "physics-g8-electric-potential-work",
            "physics-g8-capacitance",
            "physics-g8-capacitor-energy",
            "physics-g8-capacitors-series-two",
            "physics-g8-capacitors-parallel-two",
            "physics-g8-capacitors-mixed-series-parallel",
            "physics-g8-current-charge-time",
            "physics-g8-resistivity",
            "physics-g8-ohms-law",
            "physics-g8-series-resistance",
            "physics-g8-parallel-resistance-two",
            "physics-g8-mixed-resistance-series-parallel",
            "physics-g8-voltage-divider",
            "physics-g8-current-divider-two",
            "physics-g8-electrical-energy",
            "physics-g8-electric-power-vi",
            "physics-g8-joule-lenz",
            "physics-g8-efficiency",
            "physics-g8-electrolysis-faraday",
            "physics-g8-magnetic-force-wire",
            "physics-g8-lorentz-force",
            "physics-g8-charged-particle-radius",
            "physics-g8-magnetic-flux",
            "physics-g8-faraday",
            "physics-g8-transformer-voltage",
            "physics-g8-transformer-current",
            "physics-g8-transformer-ideal-power",
            "physics-g8-transformer-efficiency"
        )
        val grade8 = engine.registry.all().filter { EducationLevel.GRADE_8 in it.educationLevels }
        assertEquals(expected, grade8.map { it.id }.toSet(), "Grade 8 formula-capable inventory must match the audited hard gate")
        assertTrue(grade8.all { it.subject == Subject.PHYSICS && it.formulaDefinition != null })
        assertTrue(grade8.all { it.solveTargets.isNotEmpty() })
        assertTrue(grade8.all { it.sourceRefs.isNotEmpty() })
    }

    @Test
    fun capacitorAndChargeUnitsAreCanonicalAndConvertible() {
        val series = engine.execute(
            ToolRequest(
                "physics-g8-capacitors-series-two",
                mapOf(
                    "C1" to ToolInput("6", "uf"),
                    "C2" to ToolInput("3", "uf")
                ),
                selectedUnknown = "Ceq"
            )
        )
        assertTrue(series.isSuccess, "series capacitor unit conversion failed: ${series.error}")
        assertNear(firstNumber(series), 2e-6, 1e-12)

        val charge = engine.execute(
            ToolRequest(
                "physics-g8-capacitance",
                mapOf(
                    "C" to ToolInput("2", "uf"),
                    "V" to ToolInput("3", "V")
                ),
                selectedUnknown = "Q"
            )
        )
        assertTrue(charge.isSuccess, "capacitance/charge unit conversion failed: ${charge.error}")
        assertNear(firstNumber(charge), 6e-6, 1e-12)
    }

    @Test
    fun ohmsLawConvertsUnitsAndNeverGuesses() {
        val solved = engine.execute(
            ToolRequest(
                "physics-g8-ohms-law",
                mapOf(
                    "V" to ToolInput("12", "V"),
                    "I" to ToolInput("500", "mA")
                ),
                selectedUnknown = "R"
            )
        )
        assertTrue(solved.isSuccess, "Ohm unit conversion failed: ${solved.error}")
        assertNear(firstNumber(solved), 24.0, 1e-10)

        val ambiguous = engine.execute(ToolRequest("physics-g8-ohms-law", emptyMap()))
        assertTrue(!ambiguous.isSuccess)
        assertEquals("AMBIGUOUS_UNKNOWN", ambiguous.error?.code)
    }

    @Test
    fun transformerEfficiencyRejectsImpossibleAboveHundredPercent() {
        val impossible = engine.execute(
            ToolRequest(
                "physics-g8-transformer-efficiency",
                mapOf(
                    "Vp" to ToolInput("10"),
                    "Ip" to ToolInput("1"),
                    "Vs" to ToolInput("20"),
                    "Is" to ToolInput("1")
                ),
                selectedUnknown = "eta"
            )
        )
        assertTrue(!impossible.isSuccess)
        assertEquals("NO_SOLUTION", impossible.error?.code)

        val valid = engine.execute(
            ToolRequest(
                "physics-g8-transformer-efficiency",
                mapOf(
                    "Vp" to ToolInput("10"),
                    "Ip" to ToolInput("2"),
                    "Vs" to ToolInput("8"),
                    "Is" to ToolInput("2")
                ),
                selectedUnknown = "eta"
            )
        )
        assertTrue(valid.isSuccess, "valid transformer efficiency failed: ${valid.error}")
        assertNear(firstNumber(valid), 80.0, 1e-10)
    }

    private fun firstNumber(response: ToolResponse): Double =
        response.solutions.firstNotNullOf { number.find(it)?.value?.toDoubleOrNull() }

    private fun assertNear(actual: Double, expected: Double, tolerance: Double) {
        assertTrue(abs(actual - expected) <= tolerance * maxOf(1.0, abs(expected)), "expected=$expected actual=$actual")
    }
}
