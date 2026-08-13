package com.veltrix.calculator.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GateSmokeRegressionTest {
    private val engine = VeltrixCalculatorEngine()
    private val settings = EngineSettings(AngleMode.DEGREES, 18)

    private fun ok(input: String) = engine.calculate(input, settings).also {
        assertTrue(it.isSuccess, "$input -> ${it.error}")
    }

    private fun primary(input: String, expected: String) {
        val actual = ok(input).primary
        assertTrue(actual == expected || actual.startsWith(expected), "$input: $actual != $expected")
    }

    private fun near(input: String, expected: Double, tolerance: Double = 1e-9) {
        val text = ok(input).primary
        val actual = Regex("[-+]?\\d+(?:\\.\\d+)?(?:[Ee][-+]?\\d+)?").find(text)?.value?.toDouble()
            ?: error("No numeric result in $text")
        assertTrue(abs(actual - expected) <= tolerance * maxOf(1.0, abs(expected)), "$input: $actual != $expected")
    }

    @Test
    fun legacy27SmokeChecks() {
        val cases = listOf(
            "2+3*4" to "14",
            "(2+3)*4" to "20",
            "0.1+0.2" to "0.3",
            "25% of 480" to "120",
            "100+10%" to "110",
            "sin(30)" to "0.5",
            "sqrt(81)+3!" to "15",
            "2x+7=19" to "x = 6",
            "2x+y=5; x-y=1" to "x = 2, y = 1",
            "100 km to miles" to "62.137119223733",
            "5 feet 11 inches in cm" to "180.34 cm",
            "0 celsius to fahrenheit" to "32",
            "det [1,2;3,4]" to "det = -2",
            "dot [1,2,3] [4,5,6]" to "32",
            "derivative x^2 at 3" to "6",
            "integral x^2 from 0 to 3" to "9",
            "sum x x=1..10" to "55",
            "0xFF to binary" to "0b11111111",
            "0xFF & 0x0F" to "15",
            "mean: 1,2,3,4" to "2.5",
            "circle 5" to "78.539",
            "days between 2026-01-01 and 2026-01-31" to "30 days"
        )
        cases.forEach { (input, expected) -> primary(input, expected) }
        listOf("1/0", "sqrt(-1)", "2+*3", "10001!").forEach { input ->
            assertFalse(engine.calculate(input, settings).isSuccess, "Expected guarded failure for $input")
        }
        val currency = engine.calculate("100 USD to EUR", settings)
        assertTrue(currency.requiresNetwork && currency.type == CalculationType.CURRENCY)
        println("ALL 27 LEGACY SMOKE CHECKS PASSED")
    }

    @Test
    fun advanced19SmokeChecks() {
        assertEquals("6 - 2i", ok("complex (2+3i)+(4-5i)").primary) // 1
        assertEquals("23 + 2i", ok("complex (2+3i)*(4-5i)").primary) // 2
        assertEquals("2i", ok("complex sqrt(-4)").primary) // 3
        assertEquals("2 - 3i", ok("conj 2+3i").primary) // 4
        val system = ok("x+y+z=6; 2x-y+z=3; x+2y-z=3") // 5
        assertTrue(system.primary.contains("x =") && system.primary.contains("z ="))
        assertEquals("1, 2, 3", ok("roots x^3-6x^2+11x-6").primary) // 6
        assertTrue(ok("x^2+1=0").primary.contains("i")) // 7
        assertEquals("[6, 8; 10, 12]", ok("matrix [1,2;3,4] + [5,6;7,8]").primary) // 8
        assertEquals("[4, 4; 10, 8]", ok("matrix [1,2;3,4] * [2,0;1,2]").primary) // 9
        assertEquals("[1, 4; 2, 5; 3, 6]", ok("transpose [1,2,3;4,5,6]").primary) // 10
        assertEquals("1", ok("rank [1,2;2,4]").primary) // 11
        assertTrue(ok("solve matrix [2,1;1,-1] = [5,1]").primary.startsWith("[2,")) // 12
        assertTrue(ok("differentiate x^3+sin(x)").primary.contains("cos")) // 13
        assertTrue(ok("integrate 3x^2+2x+1").primary.endsWith("+ C")) // 14
        val graph = ok("graph x^2-4; x from -5 to 5") // 15
        assertEquals(CalculationType.GRAPH, graph.type)
        near("1 kn to n", 1000.0) // 16
        near("10 lb ft to n m", 13.558179483314, 1e-10) // 17
        near("1 g/cm3 to kg/m3", 1000.0) // 18
        near("1000 ma to a", 1.0) // 19
        println("ALL 19 ADVANCED SMOKE CHECKS PASSED")
    }
}
