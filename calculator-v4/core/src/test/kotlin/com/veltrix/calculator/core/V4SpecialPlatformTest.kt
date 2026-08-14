package com.veltrix.calculator.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class V4SpecialPlatformTest {
    private val engine = PlatformEngine()

    private fun request(id: String, vararg pairs: Pair<String, String>) =
        ToolRequest(id, pairs.associate { it.first to ToolInput(it.second) })

    private fun out(response: ToolResponse, key: String): String = assertNotNull(response.outputs[key], "$key missing for ${response.toolId}")
    private fun number(response: ToolResponse, key: String): Double = out(response, key).toDouble()
    private fun near(actual: Double, expected: Double, tolerance: Double = 1e-6) = abs(actual - expected) <= tolerance * maxOf(1.0, abs(expected))

    @Test
    fun specializedCatalogIsLiveAndCounted() {
        assertEquals(V4SpecialCatalog.EXPECTED_ADDITIONS, V4SpecialCatalog.tools().size)
        assertTrue(V4SpecialCatalog.tools().all { engine.registry.get(it.id) != null })
        assertEquals(ToolRegistry.EXPECTED_V4_TOOLS, engine.registry.all().size)
        assertEquals(260, engine.registry.all().size)
    }

    @Test
    fun financeSpecializedToolsAreDeterministic() {
        val npv = engine.execute(request("finance-v4-npv", "rate" to "0.1", "cashFlows" to "-100,60,60"))
        assertTrue(npv.isSuccess, npv.error.toString())
        assertTrue(near(number(npv, "npv"), 4.13223140495867, 1e-9))
        assertEquals(npv, engine.execute(request("finance-v4-npv", "rate" to "0.1", "cashFlows" to "-100,60,60")))

        val irr = engine.execute(request("finance-v4-irr", "cashFlows" to "-100,60,60"))
        assertTrue(irr.isSuccess, irr.error.toString())
        assertTrue(near(number(irr, "irr"), 0.1306623863, 1e-6), irr.outputs.toString())
        assertEquals("bracket-scan+bisection", irr.metadata["method"])
        assertTrue(!engine.execute(request("finance-v4-irr", "cashFlows" to "10,20,30")).isSuccess)

        val amort = engine.execute(request("finance-v4-amortization", "principal" to "1000", "annualRate" to "12", "months" to "12"))
        assertTrue(amort.isSuccess, amort.error.toString())
        assertEquals(12, out(amort, "schedule").split(';').size)
        assertTrue(number(amort, "monthlyPayment") > 0.0)
    }

    @Test
    fun statisticsSpecializedToolsCoverAssociationRegressionAndDistributions() {
        val corr = engine.execute(request("stats-v4-covariance-correlation", "x" to "1,2,3", "y" to "2,4,6"))
        assertTrue(corr.isSuccess, corr.error.toString())
        assertTrue(near(number(corr, "correlation"), 1.0, 1e-12))
        assertTrue(near(number(corr, "covariance"), 2.0, 1e-12))

        val regression = engine.execute(request("stats-v4-linear-regression", "x" to "1,2,3", "y" to "2,4,6"))
        assertTrue(regression.isSuccess, regression.error.toString())
        assertTrue(near(number(regression, "slope"), 2.0, 1e-12))
        assertTrue(near(number(regression, "intercept"), 0.0, 1e-12))
        assertTrue(near(number(regression, "rSquared"), 1.0, 1e-12))

        val binomial = engine.execute(request("stats-v4-binomial-probability", "n" to "10", "k" to "3", "p" to "0.5"))
        assertTrue(binomial.isSuccess, binomial.error.toString())
        assertTrue(near(number(binomial, "probability"), 0.1171875, 1e-10))

        val normal = engine.execute(request("stats-v4-normal-cdf", "x" to "0", "mu" to "0", "sigma" to "1"))
        assertTrue(normal.isSuccess, normal.error.toString())
        assertTrue(near(number(normal, "cdf"), 0.5, 1e-6))

        val chi = engine.execute(request("stats-v4-chi-square", "observed" to "10,20", "expected" to "15,15"))
        assertTrue(chi.isSuccess, chi.error.toString())
        assertTrue(near(number(chi, "chiSquare"), 10.0 / 3.0, 1e-10))
        assertEquals("1", out(chi, "degreesOfFreedom"))
    }

    @Test
    fun dateTimeToolsUseExplicitCalendarAndTimezoneRules() {
        val weekday = engine.execute(request("date-v4-weekday", "date" to "2026-08-14"))
        assertTrue(weekday.isSuccess, weekday.error.toString())
        assertEquals("FRIDAY", out(weekday, "weekday"))

        val business = engine.execute(request("date-v4-business-days", "start" to "2026-08-10", "end" to "2026-08-17", "holidays" to ""))
        assertTrue(business.isSuccess, business.error.toString())
        assertEquals("5", out(business, "businessDays"))

        val tz = engine.execute(request("date-v4-timezone-convert", "localDateTime" to "2026-08-14T10:00", "fromZone" to "Asia/Tashkent", "toZone" to "UTC"))
        assertTrue(tz.isSuccess, tz.error.toString())
        assertEquals("2026-08-14T05:00:00Z", out(tz, "instant"))

        val unix = engine.execute(request("date-v4-unix-timestamp", "mode" to "fromInstant", "instant" to "1970-01-01T00:00:01Z"))
        assertTrue(unix.isSuccess, unix.error.toString())
        assertEquals("1", out(unix, "seconds"))

        val duration = engine.execute(request("date-v4-duration-decompose", "seconds" to "90061"))
        assertTrue(duration.isSuccess, duration.error.toString())
        assertEquals(mapOf("days" to "1", "hours" to "1", "minutes" to "1", "seconds" to "1"), duration.outputs)
    }

    @Test
    fun textComputerAndChemistrySpecializedToolsAreStable() {
        val upper = engine.execute(request("text-v4-transform", "text" to "Veltrix ö", "operation" to "uppercase"))
        assertTrue(upper.isSuccess, upper.error.toString())
        assertEquals("VELTRIX Ö", out(upper, "text"))

        val nfc = engine.execute(request("text-v4-transform", "text" to "e\u0301", "operation" to "NFC"))
        assertTrue(nfc.isSuccess, nfc.error.toString())
        assertEquals("é", out(nfc, "text"))

        val checksum = engine.execute(request("computer-v4-checksum", "text" to "abc"))
        assertTrue(checksum.isSuccess, checksum.error.toString())
        assertEquals("3", out(checksum, "bytes"))
        assertEquals("352441c2", out(checksum, "crc32"))
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", out(checksum, "sha256"))

        val limiting = engine.execute(request("chem-v4-limiting-reagent", "nA" to "1", "coefA" to "2", "nB" to "1", "coefB" to "1"))
        assertTrue(limiting.isSuccess, limiting.error.toString())
        assertEquals("A", out(limiting, "limiting"))
        assertTrue(near(number(limiting, "reactionExtent"), 0.5, 1e-12))
    }

    @Test
    fun specializedToolsRejectMissingOrInvalidInputsInsteadOfGuessing() {
        V4SpecialCatalog.tools().forEach { tool ->
            val response = engine.execute(ToolRequest(tool.id, emptyMap()))
            assertTrue(!response.isSuccess, "${tool.id} must reject missing inputs")
            assertNotNull(response.error)
        }
        assertTrue(!engine.execute(request("stats-v4-normal-cdf", "x" to "0", "mu" to "0", "sigma" to "0")).isSuccess)
        assertTrue(!engine.execute(request("date-v4-business-days", "start" to "2026-08-17", "end" to "2026-08-10")).isSuccess)
    }
}
