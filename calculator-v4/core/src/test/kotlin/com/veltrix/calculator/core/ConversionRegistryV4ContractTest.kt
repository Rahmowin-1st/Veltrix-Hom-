package com.veltrix.calculator.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** V4 converter contract: category-safe aliases, affine temperature and reversible finite conversions. */
class ConversionRegistryV4ContractTest {
    private val registry = ConversionRegistry.default()

    @Test
    fun everyCategoryHasDistinctIdsAndFiniteRoundTrip() {
        val categories = registry.categories()
        assertTrue(categories.size >= 10)
        categories.forEach { (category, units) ->
            assertTrue(units.size >= 2, "$category must expose at least two units")
            assertEquals(units.size, units.map { it.id }.toSet().size, "$category has duplicate ids")
            val from = units.first()
            val to = units.last()
            listOf(-12.5, 0.0, 1.0, 37.25, 1234.5).forEach { value ->
                val forward = assertNotNull(registry.convert(value, from.id, to.id))
                val backward = assertNotNull(registry.convert(forward.value, to.id, from.id))
                val tolerance = 1e-9 * maxOf(1.0, abs(value))
                assertTrue(abs(backward.value - value) <= tolerance, "$category ${from.id}->${to.id} round-trip drift: $value -> ${forward.value} -> ${backward.value}")
            }
        }
    }

    @Test
    fun aliasesNeverForceCrossCategoryPairing() {
        val allAliases = registry.categories().values.flatten().flatMap { unit ->
            (unit.aliases + unit.id + unit.symbol + unit.name).map { it to unit }
        }.groupBy({ it.first.trim().lowercase() }, { it.second })
        allAliases.filterValues { candidates -> candidates.map { it.category }.toSet().size > 1 }.forEach { (alias, candidates) ->
            assertNull(registry.resolve(alias), "ambiguous alias '$alias' must not resolve to an arbitrary category: ${candidates.map { it.category }}")
        }
        assertNull(registry.convert(1.0, "m", "kg"), "cross-category conversion must be rejected")
    }

    @Test
    fun categorylessLookupFailsClosedButCategoryLookupDisambiguates() {
        assertEquals("m", assertNotNull(registry.find("meter")).id)
        assertEquals("m", assertNotNull(registry.find(" METER ")).id)
        assertNull(registry.find("f"))
        assertNull(registry.find(" F "))

        assertEquals("f_cap", assertNotNull(registry.findInCategory("Capacitance", "f")).id)
        assertEquals("f_cap", assertNotNull(registry.findInCategory("capacitance", "F")).id)
        assertEquals("f", assertNotNull(registry.findInCategory("Temperature", "f")).id)
        assertEquals("f", assertNotNull(registry.findInCategory("temperature", "fahrenheit")).id)
        assertNull(registry.findInCategory("Length", "f"))
    }

    @Test
    fun canonicalIdsAndContextualSymbolsRemainDeterministicForConversion() {
        val fahrenheitIdentity = assertNotNull(registry.convert(1.0, "f", "f"))
        assertEquals("f", fahrenheitIdentity.from.id)
        assertEquals("f", fahrenheitIdentity.to.id)

        val faradToMicrofarad = assertNotNull(registry.convert(1.0, "F", "uF"))
        assertEquals("f_cap", faradToMicrofarad.from.id)
        assertEquals("uf", faradToMicrofarad.to.id)
        assertTrue(abs(faradToMicrofarad.value - 1_000_000.0) <= 1e-6)
    }

    @Test
    fun temperatureOffsetsAndAliasesAreExactWithinFloatingTolerance() {
        fun near(actual: Double, expected: Double) = assertTrue(abs(actual - expected) <= 1e-10 * maxOf(1.0, abs(expected)), "$actual != $expected")
        near(assertNotNull(registry.convert(0.0, "c", "f")).value, 32.0)
        near(assertNotNull(registry.convert(100.0, "celsius", "fahrenheit")).value, 212.0)
        near(assertNotNull(registry.convert(32.0, "°f", "kelvin")).value, 273.15)
        near(assertNotNull(registry.convert(273.15, "k", "c")).value, 0.0)
        near(assertNotNull(registry.convert(1.0, "F", "uF")).value, 1_000_000.0)
    }

    @Test
    fun nonFiniteInputIsRejected() {
        listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY).forEach { value ->
            val failure = runCatching { registry.convert(value, "m", "km") }.exceptionOrNull()
            assertTrue(failure is CalcEx)
        }
    }
}
