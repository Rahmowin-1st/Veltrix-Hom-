package com.veltrix.calculator.core

import java.math.BigDecimal
import java.security.MessageDigest
import java.text.Normalizer
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.zip.CRC32
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sqrt

/** Deterministic executors for specialized V4 tools that must not be represented by fake closed-form formulas. */
internal object V4SpecialPlatform {
    private val ids = V4SpecialCatalog.tools().map { it.id }.toSet()

    fun execute(tool: ToolDefinition, request: ToolRequest): ToolResponse? {
        if (tool.id !in ids) return null
        return try {
            when (tool.id) {
                "finance-v4-npv" -> npv(tool, request)
                "finance-v4-irr" -> irr(tool, request)
                "finance-v4-amortization" -> amortization(tool, request)
                "stats-v4-covariance-correlation" -> covarianceCorrelation(tool, request)
                "stats-v4-linear-regression" -> regression(tool, request)
                "stats-v4-binomial-probability" -> binomial(tool, request)
                "stats-v4-normal-cdf" -> normalCdf(tool, request)
                "stats-v4-chi-square" -> chiSquare(tool, request)
                "date-v4-weekday" -> weekday(tool, request)
                "date-v4-business-days" -> businessDays(tool, request)
                "date-v4-timezone-convert" -> timezone(tool, request)
                "date-v4-unix-timestamp" -> unix(tool, request)
                "date-v4-duration-decompose" -> duration(tool, request)
                "text-v4-transform" -> transform(tool, request)
                "computer-v4-checksum" -> checksum(tool, request)
                "chem-v4-limiting-reagent" -> limitingReagent(tool, request)
                else -> return null
            }
        } catch (e: IllegalArgumentException) {
            fail(tool.id, "INVALID_INPUT", e.message ?: "Invalid input")
        } catch (e: ArithmeticException) {
            fail(tool.id, "ARITHMETIC", e.message ?: "Arithmetic error")
        }
    }

    private fun npv(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val rate = number(r, "rate")
        require(rate > -1.0) { "rate must be greater than -1" }
        val flows = dataset(r, "cashFlows")
        require(flows.isNotEmpty()) { "cashFlows cannot be empty" }
        val value = flows.mapIndexed { index, cash -> cash / (1.0 + rate).pow(index.toDouble()) }.sum()
        return response(tool.id, fmt(value), mapOf("npv" to fmt(value)), mapOf("cashFlowCount" to flows.size.toString(), "method" to "discounted-sum"))
    }

    private fun irr(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val flows = dataset(r, "cashFlows")
        require(flows.size >= 2) { "IRR needs at least two cash flows" }
        require(flows.any { it < 0.0 } && flows.any { it > 0.0 }) { "IRR requires at least one negative and one positive cash flow" }
        fun value(rate: Double): Double = flows.mapIndexed { index, cash -> cash / (1.0 + rate).pow(index.toDouble()) }.sum()

        val brackets = mutableListOf<Pair<Double, Double>>()
        val yMin = ln(0.0001)
        val yMax = ln(101.0)
        val steps = 6000
        var left = exp(yMin) - 1.0
        var fLeft = value(left)
        repeat(steps) { i ->
            val y = yMin + (yMax - yMin) * (i + 1).toDouble() / steps
            val right = exp(y) - 1.0
            val fRight = value(right)
            if (fLeft.isFinite() && fRight.isFinite()) {
                if (abs(fLeft) <= 1e-12) brackets += left to left
                else if (fLeft * fRight < 0.0) brackets += left to right
            }
            left = right
            fLeft = fRight
        }
        val distinct = brackets.distinctBy { pair -> ((pair.first + pair.second) * 1e8).toLong() }
        require(distinct.isNotEmpty()) { "No IRR root found in the supported deterministic range (-99.99%, 10000%)" }
        require(distinct.size == 1) { "Multiple IRR roots detected; a single IRR would be ambiguous" }
        var lo = distinct.single().first
        var hi = distinct.single().second
        var root = lo
        var iterations = 0
        if (lo != hi) {
            var flo = value(lo)
            repeat(200) {
                iterations = it + 1
                val mid = (lo + hi) / 2.0
                val fm = value(mid)
                root = mid
                if (abs(fm) <= 1e-10 || abs(hi - lo) <= 1e-12 * maxOf(1.0, abs(mid))) return@repeat
                if (flo * fm <= 0.0) hi = mid else { lo = mid; flo = fm }
            }
        }
        val residual = value(root)
        require(root.isFinite() && abs(residual) <= 1e-6 * maxOf(1.0, flows.maxOf { abs(it) })) { "IRR solver did not converge" }
        return response(tool.id, fmt(root), mapOf("irr" to fmt(root)), mapOf("method" to "bracket-scan+bisection", "iterations" to iterations.toString(), "residualNpv" to fmt(residual), "tolerance" to "1e-10"))
    }

    private fun amortization(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val principal = number(r, "principal")
        val annual = number(r, "annualRate")
        val months = integer(r, "months")
        require(principal >= 0.0 && annual >= 0.0) { "principal and annualRate must be non-negative" }
        require(months in 1..1200) { "months must be in 1..1200" }
        val summary = FinancePlatform.loanPayment(principal, annual, months)
        val monthlyRate = annual / 1200.0
        var balance = principal
        val rows = ArrayList<String>(months)
        for (month in 1..months) {
            val interest = if (monthlyRate == 0.0) 0.0 else balance * monthlyRate
            val scheduledPrincipal = (summary.monthlyPayment - interest).coerceAtLeast(0.0)
            val principalPaid = if (month == months) balance else minOf(balance, scheduledPrincipal)
            val payment = principalPaid + interest
            balance = (balance - principalPaid).coerceAtLeast(0.0)
            rows += "$month,${fmt(payment)},${fmt(principalPaid)},${fmt(interest)},${fmt(balance)}"
        }
        return response(tool.id, fmt(summary.monthlyPayment), mapOf("monthlyPayment" to fmt(summary.monthlyPayment), "totalPaid" to fmt(summary.totalPaid), "totalInterest" to fmt(summary.totalInterest), "schedule" to rows.joinToString(";")), mapOf("scheduleColumns" to "month,payment,principal,interest,balance", "months" to months.toString()))
    }

    private fun covarianceCorrelation(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val (x, y) = paired(r)
        val mx = x.average(); val my = y.average()
        val cov = x.indices.sumOf { (x[it] - mx) * (y[it] - my) } / (x.size - 1)
        val sx = sqrt(x.sumOf { (it - mx).pow(2) } / (x.size - 1))
        val sy = sqrt(y.sumOf { (it - my).pow(2) } / (y.size - 1))
        require(sx > 0.0 && sy > 0.0) { "correlation is undefined for zero-variance data" }
        val corr = cov / (sx * sy)
        return response(tool.id, fmt(corr), mapOf("covariance" to fmt(cov), "correlation" to fmt(corr)), mapOf("count" to x.size.toString(), "covarianceType" to "sample"))
    }

    private fun regression(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val (x, y) = paired(r)
        val mx = x.average(); val my = y.average()
        val sxx = x.sumOf { (it - mx).pow(2) }
        require(sxx > 0.0) { "regression needs non-zero variance in x" }
        val sxy = x.indices.sumOf { (x[it] - mx) * (y[it] - my) }
        val syy = y.sumOf { (it - my).pow(2) }
        val slope = sxy / sxx
        val intercept = my - slope * mx
        val r2 = if (syy == 0.0) 1.0 else (sxy * sxy / (sxx * syy)).coerceIn(0.0, 1.0)
        return response(tool.id, fmt(slope), mapOf("slope" to fmt(slope), "intercept" to fmt(intercept), "rSquared" to fmt(r2)), mapOf("count" to x.size.toString(), "method" to "ordinary-least-squares"))
    }

    private fun binomial(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val n = integer(r, "n"); val k = integer(r, "k"); val p = number(r, "p")
        require(n in 0..100000 && k in 0..n) { "Require 0 <= k <= n <= 100000" }
        require(p in 0.0..1.0) { "p must be in [0,1]" }
        val probability = when {
            p == 0.0 -> if (k == 0) 1.0 else 0.0
            p == 1.0 -> if (k == n) 1.0 else 0.0
            else -> {
                val kk = minOf(k, n - k)
                var logC = 0.0
                for (i in 1..kk) logC += ln((n - kk + i).toDouble()) - ln(i.toDouble())
                exp(logC + k * ln(p) + (n - k) * ln(1.0 - p))
            }
        }
        return response(tool.id, fmt(probability), mapOf("probability" to fmt(probability)), mapOf("n" to n.toString(), "k" to k.toString()))
    }

    private fun normalCdf(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val x = number(r, "x"); val mu = number(r, "mu"); val sigma = number(r, "sigma")
        require(sigma > 0.0) { "sigma must be positive" }
        val z = (x - mu) / sigma
        val cdf = 0.5 * (1.0 + erf(z / sqrt(2.0)))
        return response(tool.id, fmt(cdf), mapOf("cdf" to fmt(cdf), "z" to fmt(z)), mapOf("method" to "erf-approximation"))
    }

    private fun chiSquare(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val observed = dataset(r, "observed"); val expected = dataset(r, "expected")
        require(observed.size == expected.size && observed.size >= 2) { "observed and expected must have equal length >= 2" }
        require(observed.all { it >= 0.0 } && expected.all { it > 0.0 }) { "observed must be non-negative and expected positive" }
        val chi = observed.indices.sumOf { (observed[it] - expected[it]).pow(2) / expected[it] }
        return response(tool.id, fmt(chi), mapOf("chiSquare" to fmt(chi), "degreesOfFreedom" to (observed.size - 1).toString()), mapOf("count" to observed.size.toString()))
    }

    private fun weekday(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val date = LocalDate.parse(required(r, "date"))
        val day = date.dayOfWeek.name
        return response(tool.id, day, mapOf("weekday" to day), mapOf("isoDayNumber" to date.dayOfWeek.value.toString()))
    }

    private fun businessDays(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val start = LocalDate.parse(required(r, "start")); val end = LocalDate.parse(required(r, "end"))
        require(!end.isBefore(start)) { "end must not be before start" }
        val holidays = r.inputs["holidays"]?.value.orEmpty().split(',', ';').map { it.trim() }.filter { it.isNotEmpty() }.map(LocalDate::parse).toSet()
        var cursor = start; var count = 0
        while (cursor.isBefore(end)) {
            if (cursor.dayOfWeek !in setOf(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY) && cursor !in holidays) count++
            cursor = cursor.plusDays(1)
        }
        return response(tool.id, count.toString(), mapOf("businessDays" to count.toString()), mapOf("interval" to "start-inclusive,end-exclusive", "holidayCount" to holidays.size.toString()))
    }

    private fun timezone(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val local = LocalDateTime.parse(required(r, "localDateTime"))
        val from = ZoneId.of(required(r, "fromZone")); val to = ZoneId.of(required(r, "toZone"))
        val offsets = from.rules.getValidOffsets(local)
        require(offsets.size == 1) { if (offsets.isEmpty()) "Source local time does not exist because of a timezone transition" else "Source local time is ambiguous because of a timezone transition" }
        val source = ZonedDateTime.ofStrict(local, offsets.single(), from)
        val converted = source.withZoneSameInstant(to)
        return response(tool.id, converted.toString(), mapOf("result" to converted.toString(), "instant" to converted.toInstant().toString()), mapOf("fromZone" to from.id, "toZone" to to.id, "tzRules" to "java.time"))
    }

    private fun unix(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val mode = required(r, "mode")
        val instant = when (mode) {
            "fromInstant" -> Instant.parse(required(r, "instant"))
            "toInstant" -> Instant.ofEpochSecond(required(r, "seconds").toLongOrNull() ?: throw IllegalArgumentException("seconds must be an integer"))
            else -> throw IllegalArgumentException("mode must be fromInstant or toInstant")
        }
        return response(tool.id, instant.toString(), mapOf("instant" to instant.toString(), "seconds" to instant.epochSecond.toString(), "milliseconds" to instant.toEpochMilli().toString()), mapOf("epoch" to "1970-01-01T00:00:00Z"))
    }

    private fun duration(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        var total = required(r, "seconds").toLongOrNull() ?: throw IllegalArgumentException("seconds must be an integer")
        require(total >= 0) { "seconds must be non-negative" }
        val days = total / 86400; total %= 86400
        val hours = total / 3600; total %= 3600
        val minutes = total / 60; val seconds = total % 60
        return response(tool.id, "$days d $hours h $minutes m $seconds s", mapOf("days" to days.toString(), "hours" to hours.toString(), "minutes" to minutes.toString(), "seconds" to seconds.toString()))
    }

    private fun transform(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val text = required(r, "text"); val operation = required(r, "operation")
        val transformed = when (operation) {
            "lowercase" -> text.lowercase()
            "uppercase" -> text.uppercase()
            "title" -> Regex("[\\p{L}\\p{N}]+(?:[-'’][\\p{L}\\p{N}]+)*").replace(text.lowercase()) { m -> m.value.replaceFirstChar { it.titlecase() } }
            "trim" -> text.trim()
            "NFC" -> Normalizer.normalize(text, Normalizer.Form.NFC)
            "NFD" -> Normalizer.normalize(text, Normalizer.Form.NFD)
            else -> throw IllegalArgumentException("Unsupported text operation")
        }
        val analysis = TextAnalysisPlatform.analyze(transformed)
        return response(tool.id, transformed, mapOf("text" to transformed, "characters" to analysis.characters.toString(), "words" to analysis.words.toString()), mapOf("operation" to operation))
    }

    private fun checksum(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val bytes = required(r, "text").toByteArray(Charsets.UTF_8)
        val crc = CRC32().apply { update(bytes) }.value.toString(16).padStart(8, '0')
        val sha = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        return response(tool.id, sha, mapOf("bytes" to bytes.size.toString(), "crc32" to crc, "sha256" to sha), mapOf("encoding" to "UTF-8"))
    }

    private fun limitingReagent(tool: ToolDefinition, r: ToolRequest): ToolResponse {
        val nA = number(r, "nA"); val a = number(r, "coefA"); val nB = number(r, "nB"); val b = number(r, "coefB")
        require(nA >= 0.0 && nB >= 0.0 && a > 0.0 && b > 0.0) { "Amounts must be non-negative and stoichiometric coefficients positive" }
        val extentA = nA / a; val extentB = nB / b
        val scale = maxOf(1.0, abs(extentA), abs(extentB))
        val limiting = when {
            abs(extentA - extentB) <= 1e-12 * scale -> "stoichiometric"
            extentA < extentB -> "A"
            else -> "B"
        }
        val extent = minOf(extentA, extentB)
        return response(tool.id, limiting, mapOf("limiting" to limiting, "reactionExtent" to fmt(extent), "excessA" to fmt((nA - a * extent).coerceAtLeast(0.0)), "excessB" to fmt((nB - b * extent).coerceAtLeast(0.0))))
    }

    private fun paired(r: ToolRequest): Pair<List<Double>, List<Double>> {
        val x = dataset(r, "x"); val y = dataset(r, "y")
        require(x.size == y.size && x.size >= 2) { "x and y must have equal length >= 2" }
        return x to y
    }

    private fun dataset(r: ToolRequest, id: String): List<Double> = required(r, id).split(',', ';', ' ', '\n', '\t').mapNotNull { it.trim().takeIf(String::isNotEmpty) }.map { token -> token.toDoubleOrNull()?.takeIf(Double::isFinite) ?: throw IllegalArgumentException("$id contains invalid number: $token") }
    private fun number(r: ToolRequest, id: String): Double = required(r, id).toDoubleOrNull()?.takeIf(Double::isFinite) ?: throw IllegalArgumentException("$id must be a finite number")
    private fun integer(r: ToolRequest, id: String): Int = required(r, id).toIntOrNull() ?: throw IllegalArgumentException("$id must be an integer")
    private fun required(r: ToolRequest, id: String): String = r.inputs[id]?.value?.trim()?.takeIf { it.isNotEmpty() } ?: throw IllegalArgumentException("$id is required")
    private fun fmt(value: Double): String = if (value == 0.0) "0" else BigDecimal.valueOf(value).stripTrailingZeros().toPlainString()
    private fun response(id: String, primary: String, outputs: Map<String, String>, metadata: Map<String, String> = emptyMap()) = ToolResponse(id, primary, outputs, metadata = metadata, schemaVersion = 4)
    private fun fail(id: String, code: String, message: String) = ToolResponse(id, error = StructuredError(code, message), schemaVersion = 4)

    /** Deterministic Abramowitz-Stegun-style erf approximation; max error is adequate for calculator CDF display. */
    private fun erf(x: Double): Double {
        val sign = if (x < 0) -1.0 else 1.0
        val a = abs(x)
        val t = 1.0 / (1.0 + 0.3275911 * a)
        val y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a)
        return sign * y
    }
}
