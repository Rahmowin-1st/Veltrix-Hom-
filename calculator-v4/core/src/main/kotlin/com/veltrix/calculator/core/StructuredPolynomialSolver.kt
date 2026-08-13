package com.veltrix.calculator.core

import java.math.BigDecimal
import kotlin.math.*

data class PolynomialRoot(val real: Double, val imaginary: Double = 0.0, val approximate: Boolean = true)
data class StructuredPolynomialResult(
    val normalizedCoefficientsDescending: List<Double>,
    val roots: List<PolynomialRoot>,
    val discriminant: Double? = null,
    val classification: String,
    val exactRoots: List<String> = emptyList()
)

class StructuredPolynomialSolver {
    /** Coefficients are descending powers on the LHS. rhs is moved to the constant term. */
    fun solve(coefficientsDescending: List<Double>, rhs: Double = 0.0): StructuredPolynomialResult {
        require(coefficientsDescending.size >= 2) { "At least degree 1 coefficients are required" }
        require(coefficientsDescending.size <= 33) { "Maximum supported degree is 32" }
        require(coefficientsDescending.all { it.isFinite() } && rhs.isFinite()) { "Coefficients must be finite" }
        val normalized = coefficientsDescending.toMutableList()
        normalized[normalized.lastIndex] -= rhs
        while (normalized.size > 1 && abs(normalized.first()) < 1e-14) normalized.removeAt(0)
        if (normalized.size < 2 || abs(normalized.first()) < 1e-14) throw CalcEx("DEGENERATE", "Leading coefficient must be non-zero")
        val degree = normalized.size - 1
        if (degree == 1) {
            val root = -normalized[1] / normalized[0]
            return StructuredPolynomialResult(normalized, listOf(PolynomialRoot(clean(root), 0.0, false)), classification = "one real root", exactRoots = listOf(fmt(root)))
        }
        if (degree == 2) return quadratic(normalized)
        val asc = normalized.reversed().toDoubleArray()
        val roots = durandKerner(asc).map { PolynomialRoot(clean(it.re), clean(it.im), true) }
            .sortedWith(compareBy<PolynomialRoot> { it.real }.thenBy { it.imaginary })
        val realCount = roots.count { abs(it.imaginary) < 1e-10 }
        return StructuredPolynomialResult(
            normalized, roots,
            classification = when (realCount) {
                roots.size -> "${roots.size} real numerical roots"
                0 -> "${roots.size} complex numerical roots"
                else -> "$realCount real and ${roots.size - realCount} non-real numerical roots"
            }
        )
    }

    fun discriminant(a: Double, b: Double, c: Double): Pair<Double, String> {
        if (!a.isFinite() || !b.isFinite() || !c.isFinite()) throw CalcEx("NON_FINITE", "Coefficients must be finite")
        if (abs(a) < 1e-14) throw CalcEx("DEGENERATE", "a must be non-zero")
        val d = b * b - 4 * a * c
        val classification = when {
            d > 1e-12 -> "two distinct real roots"
            d < -1e-12 -> "two complex conjugate roots"
            else -> "one repeated real root"
        }
        return d to classification
    }

    fun vieta(a: Double, b: Double, c: Double): Pair<Double, Double> {
        if (abs(a) < 1e-14) throw CalcEx("DEGENERATE", "a must be non-zero")
        return (-b / a) to (c / a)
    }

    /** Descending coefficients. */
    fun divide(dividend: List<Double>, divisor: List<Double>): Pair<List<Double>, List<Double>> {
        require(dividend.isNotEmpty() && divisor.isNotEmpty())
        require(dividend.all { it.isFinite() } && divisor.all { it.isFinite() })
        var a = trimLeading(dividend)
        val b = trimLeading(divisor)
        if (b.isEmpty() || abs(b[0]) < 1e-14) throw CalcEx("DIVIDE_BY_ZERO", "Polynomial divisor cannot be zero")
        if (a.size < b.size) return listOf(0.0) to a
        val q = MutableList(a.size - b.size + 1) { 0.0 }
        val r = a.toMutableList()
        for (i in 0..a.size - b.size) {
            val factor = r[i] / b[0]
            q[i] = clean(factor)
            for (j in b.indices) r[i + j] -= factor * b[j]
        }
        val remainder = r.drop(a.size - b.size + 1).map(::clean).let { if (it.isEmpty()) listOf(0.0) else it }
        return q.map(::clean) to remainder
    }

    private fun quadratic(c: List<Double>): StructuredPolynomialResult {
        val (a, b, cc) = c
        val (d0, cls) = discriminant(a, b, cc)
        val d = if (abs(d0) < 1e-14) 0.0 else d0
        if (d >= 0) {
            val sd = sqrt(d)
            // Numerically stable quadratic roots.
            val q = -0.5 * (b + if (b >= 0) sd else -sd)
            val r1 = if (abs(q) < 1e-15) -b / (2 * a) else q / a
            val r2 = if (abs(q) < 1e-15) r1 else cc / q
            val roots = listOf(r1, r2).map { PolynomialRoot(clean(it), 0.0, !isSimpleExact(it)) }.sortedBy { it.real }
            val exact = when {
                d == 0.0 -> listOf(fmt(-b / (2 * a)), fmt(-b / (2 * a)))
                isPerfectSquare(d) && isIntegerLike(a) && isIntegerLike(b) -> roots.map { fmt(it.real) }
                else -> listOf("(-${fmt(b)} - sqrt(${fmt(d)})) / ${fmt(2*a)}", "(-${fmt(b)} + sqrt(${fmt(d)})) / ${fmt(2*a)}")
            }
            return StructuredPolynomialResult(c, roots, d, cls, exact)
        }
        val real = -b / (2 * a)
        val imag = sqrt(-d) / abs(2 * a)
        return StructuredPolynomialResult(c, listOf(PolynomialRoot(clean(real), -clean(imag)), PolynomialRoot(clean(real), clean(imag))), d, cls)
    }

    private fun durandKerner(coeffAsc: DoubleArray): List<ComplexNumber> {
        val n = coeffAsc.size - 1
        val lead = coeffAsc[n]
        if (abs(lead) < 1e-15) throw CalcEx("DEGENERATE", "Leading coefficient is zero")
        val a = DoubleArray(n + 1) { coeffAsc[it] / lead }
        val radius = 1.0 + (0 until n).maxOf { abs(a[it]) }
        val roots = MutableList(n) { k ->
            val angle = 2 * PI * k / n + 0.271828
            ComplexNumber(radius * cos(angle), radius * sin(angle))
        }
        fun eval(z: ComplexNumber): ComplexNumber {
            var r = ComplexNumber(a[n])
            for (i in n - 1 downTo 0) r = r * z + ComplexNumber(a[i])
            return r
        }
        repeat(2000) {
            var maxDelta = 0.0
            val next = roots.toMutableList()
            for (i in 0 until n) {
                var denom = ComplexNumber(1.0)
                for (j in 0 until n) if (i != j) denom *= roots[i] - roots[j]
                if (denom.absValue() < 1e-20) denom += ComplexNumber(1e-12, -1e-12)
                val delta = eval(roots[i]) / denom
                next[i] = roots[i] - delta
                maxDelta = max(maxDelta, delta.absValue())
            }
            for (i in roots.indices) roots[i] = next[i]
            if (maxDelta < 1e-13) return roots
        }
        val residual = roots.maxOf { eval(it).absValue() }
        if (!residual.isFinite() || residual > 1e-6) throw CalcEx("NUMERICAL_CONVERGENCE", "Polynomial root solver did not converge reliably")
        return roots
    }

    private fun trimLeading(x: List<Double>) = x.dropWhile { abs(it) < 1e-14 }.ifEmpty { listOf(0.0) }
    private fun clean(v: Double): Double {
        if (abs(v) < 1e-12) return 0.0
        val r = round(v)
        return if (abs(v - r) < 1e-10) r else v
    }
    private fun isIntegerLike(v: Double) = abs(v - round(v)) < 1e-12
    private fun isPerfectSquare(v: Double): Boolean = v >= 0 && abs(sqrt(v) - round(sqrt(v))) < 1e-12
    private fun isSimpleExact(v: Double) = isIntegerLike(v)
    private fun fmt(v: Double) = BigDecimal.valueOf(clean(v)).stripTrailingZeros().toPlainString()
}
