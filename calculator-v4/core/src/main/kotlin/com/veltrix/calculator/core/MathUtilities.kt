package com.veltrix.calculator.core

import java.math.BigInteger
import kotlin.math.abs
import kotlin.math.pow

object MathUtilities {
    fun gcdLcm(values: List<Long>): Pair<Long, Long> {
        if (values.isEmpty()) throw CalcEx("DATA", "At least one integer is required")
        fun gcd(a0: Long, b0: Long): Long {
            var a = abs(a0); var b = abs(b0)
            while (b != 0L) { val t = a % b; a = b; b = t }
            return a
        }
        var g = abs(values.first())
        var l = abs(values.first())
        for (x in values.drop(1)) {
            g = gcd(g, x)
            val gx = gcd(l, x)
            if (gx == 0L) l = 0 else {
                val candidate = BigInteger.valueOf(l / gx).multiply(BigInteger.valueOf(abs(x)))
                if (candidate > BigInteger.valueOf(Long.MAX_VALUE)) throw CalcEx("OVERFLOW", "LCM exceeds 64-bit integer range")
                l = candidate.longValueExact()
            }
        }
        return g to l
    }

    fun primeFactors(value: Long): List<Pair<Long, Int>> {
        if (value == 0L) throw CalcEx("DOMAIN", "Zero has no prime factorization")
        var n = abs(value)
        if (n == 1L) return emptyList()
        val out = mutableListOf<Pair<Long, Int>>()
        var p = 2L
        while (p * p <= n && p <= 10_000_000L) {
            if (n % p == 0L) {
                var c = 0
                while (n % p == 0L) { n /= p; c++ }
                out += p to c
            }
            p = if (p == 2L) 3L else p + 2
        }
        if (n > 1) out += n to 1
        return out
    }

    fun permutationsCombinations(n: Int, r: Int): Pair<BigInteger, BigInteger> {
        if (n < 0 || r < 0 || r > n || n > 100_000) throw CalcEx("DOMAIN", "Require 0 ≤ r ≤ n ≤ 100000")
        var perm = BigInteger.ONE
        repeat(r) { i -> perm = perm.multiply(BigInteger.valueOf((n - i).toLong())) }
        val rr = minOf(r, n - r)
        var comb = BigInteger.ONE
        for (i in 1..rr) comb = comb.multiply(BigInteger.valueOf((n - rr + i).toLong())).divide(BigInteger.valueOf(i.toLong()))
        return perm to comb
    }

    fun arithmeticSequence(first: Double, difference: Double, n: Int): Pair<Double, Double> {
        if (n <= 0) throw CalcEx("DOMAIN", "n must be positive")
        val nth = first + (n - 1) * difference
        val sum = n / 2.0 * (2 * first + (n - 1) * difference)
        return nth to sum
    }

    fun geometricSequence(first: Double, ratio: Double, n: Int): Pair<Double, Double> {
        if (n <= 0) throw CalcEx("DOMAIN", "n must be positive")
        val nth = first * ratio.pow(n - 1)
        val sum = if (abs(ratio - 1.0) < 1e-14) first * n else first * (1 - ratio.pow(n)) / (1 - ratio)
        if (!nth.isFinite() || !sum.isFinite()) throw CalcEx("OVERFLOW", "Sequence result is outside finite range")
        return nth to sum
    }
}
