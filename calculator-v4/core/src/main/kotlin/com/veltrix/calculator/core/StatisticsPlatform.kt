package com.veltrix.calculator.core

import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.sqrt

data class StatisticsSummary(
    val count: Int,
    val mean: Double,
    val median: Double,
    val modes: List<Double>,
    val range: Double,
    val populationVariance: Double,
    val populationStdDev: Double,
    val min: Double,
    val max: Double
)

object StatisticsPlatform {
    fun parseDataset(raw: String): List<Double> {
        val values = raw.split(',', ';', '\n', '\t', ' ').mapNotNull { token ->
            token.trim().takeIf { it.isNotEmpty() }?.let {
                it.toDoubleOrNull() ?: throw CalcEx("DATA", "Invalid dataset value: $it")
            }
        }
        if (values.isEmpty()) throw CalcEx("DATA", "Dataset cannot be empty")
        if (values.size > 100_000) throw CalcEx("TOO_LARGE", "Dataset is limited to 100000 values")
        if (values.any { !it.isFinite() }) throw CalcEx("NON_FINITE", "Dataset values must be finite")
        return values
    }

    fun summary(values: List<Double>): StatisticsSummary {
        requireData(values)
        val sorted = values.sorted()
        val mean = values.average()
        val median = if (values.size % 2 == 1) sorted[values.size / 2]
        else (sorted[values.size / 2 - 1] + sorted[values.size / 2]) / 2.0
        val counts = values.groupingBy { it }.eachCount()
        val maxCount = counts.maxOf { it.value }
        val modes = if (maxCount <= 1) emptyList() else counts.filterValues { it == maxCount }.keys.sorted()
        val variance = values.sumOf { val d = it - mean; d * d } / values.size
        return StatisticsSummary(values.size, mean, median, modes, sorted.last() - sorted.first(), variance, sqrt(variance), sorted.first(), sorted.last())
    }

    fun weightedMean(values: List<Double>, weights: List<Double>): Double {
        requireData(values)
        if (values.size != weights.size || weights.isEmpty()) throw CalcEx("WEIGHTS", "Weights must match the dataset size")
        if (weights.any { !it.isFinite() || it < 0.0 }) throw CalcEx("WEIGHTS", "Weights must be finite and non-negative")
        val total = weights.sum()
        if (total <= 0.0) throw CalcEx("WEIGHTS", "Weight sum must be greater than zero")
        return values.indices.sumOf { values[it] * weights[it] } / total
    }

    /** Linear interpolation between nearest ranks on zero-based index p*(n-1). */
    fun percentile(values: List<Double>, p: Double): Double {
        requireData(values)
        if (!p.isFinite() || p !in 0.0..100.0) throw CalcEx("PERCENTILE", "Percentile must be between 0 and 100")
        val s = values.sorted()
        val index = p / 100.0 * (s.size - 1)
        val lo = floor(index).toInt()
        val hi = ceil(index).toInt()
        return s[lo] + (s[hi] - s[lo]) * (index - lo)
    }

    fun frequency(values: List<Double>): Map<Double, Int> {
        requireData(values)
        return values.groupingBy { it }.eachCount().toSortedMap()
    }

    private fun requireData(values: List<Double>) {
        if (values.isEmpty()) throw CalcEx("DATA", "Dataset cannot be empty")
        if (values.any { !it.isFinite() }) throw CalcEx("NON_FINITE", "Dataset values must be finite")
    }
}
