package com.veltrix.calculator.core

import kotlin.math.abs

data class MolarMassResult(
    val formula: String,
    val molarMass: Double,
    val elementCounts: Map<String, Int>,
    val percentComposition: Map<String, Double>,
    val datasetVersion: String = AtomicMassDataset.VERSION
)

/**
 * Abridged representative standard atomic weights for educational numerical work.
 * Source: CIAAW Abridged Standard Atomic Weights 2024. Elements without a standard
 * atomic weight are intentionally absent and rejected rather than guessed.
 */
object AtomicMassDataset {
    const val VERSION = "CIAAW-ABRIDGED-2024"
    const val SOURCE = "Commission on Isotopic Abundances and Atomic Weights (CIAAW), Abridged Standard Atomic Weights 2024"
    val masses: Map<String, Double> = linkedMapOf(
        "H" to 1.0080, "He" to 4.0026, "Li" to 6.94, "Be" to 9.0122, "B" to 10.81,
        "C" to 12.011, "N" to 14.007, "O" to 15.999, "F" to 18.998, "Ne" to 20.180,
        "Na" to 22.990, "Mg" to 24.305, "Al" to 26.982, "Si" to 28.085, "P" to 30.974,
        "S" to 32.06, "Cl" to 35.45, "Ar" to 39.95, "K" to 39.098, "Ca" to 40.078,
        "Sc" to 44.956, "Ti" to 47.867, "V" to 50.942, "Cr" to 51.996, "Mn" to 54.938,
        "Fe" to 55.845, "Co" to 58.933, "Ni" to 58.693, "Cu" to 63.546, "Zn" to 65.38,
        "Ga" to 69.723, "Ge" to 72.630, "As" to 74.922, "Se" to 78.971, "Br" to 79.904,
        "Kr" to 83.798, "Rb" to 85.468, "Sr" to 87.62, "Y" to 88.906, "Zr" to 91.222,
        "Nb" to 92.906, "Mo" to 95.95, "Ru" to 101.07, "Rh" to 102.91, "Pd" to 106.42,
        "Ag" to 107.87, "Cd" to 112.41, "In" to 114.82, "Sn" to 118.71,
        "I" to 126.90, "Xe" to 131.29, "Cs" to 132.91, "Ba" to 137.33,
        "W" to 183.84, "Pt" to 195.08, "Au" to 196.97, "Hg" to 200.59, "Pb" to 207.2, "Bi" to 208.98,
        "Th" to 232.04, "Pa" to 231.04, "U" to 238.03
    )
}

object ChemistryPlatform {
    fun molarMass(formulaRaw: String): MolarMassResult {
        val formula = formulaRaw.trim().replace("·", ".")
        if (formula.isBlank()) throw CalcEx("FORMULA", "Chemical formula cannot be empty")
        if (formula.length > 256) throw CalcEx("TOO_LARGE", "Chemical formula is too long")
        if (!Regex("[A-Za-z0-9().]+(?:\\.[A-Za-z0-9().]+)*").matches(formula)) {
            throw CalcEx("FORMULA", "Formula contains unsupported notation")
        }
        val totals = linkedMapOf<String, Int>()
        formula.split('.').forEach { part ->
            if (part.isBlank()) throw CalcEx("FORMULA", "Invalid hydrate separator")
            val multiplierMatch = Regex("^(\\d+)(.*)$").matchEntire(part)
            val partMultiplier = multiplierMatch?.groupValues?.get(1)?.toIntOrNull() ?: 1
            val body = multiplierMatch?.groupValues?.get(2)?.takeIf { it.isNotBlank() } ?: part
            if (partMultiplier !in 1..1_000_000) throw CalcEx("FORMULA", "Formula multiplier is outside the supported range")
            val parsed = FormulaParser(body).parse()
            for ((symbol, count) in parsed) {
                val total = count.toLong() * partMultiplier
                if (total > 1_000_000L) throw CalcEx("TOO_LARGE", "Atom count is outside the supported range")
                totals[symbol] = (totals[symbol] ?: 0) + total.toInt()
            }
        }
        if (totals.isEmpty()) throw CalcEx("FORMULA", "No elements were found")
        var mass = 0.0
        val elementMass = linkedMapOf<String, Double>()
        for ((symbol, count) in totals) {
            val atomic = AtomicMassDataset.masses[symbol]
                ?: throw CalcEx("UNSUPPORTED_ELEMENT", "No verified standard atomic weight is stored for $symbol")
            val contribution = atomic * count
            mass += contribution
            elementMass[symbol] = contribution
        }
        if (!mass.isFinite() || mass <= 0) throw CalcEx("NON_FINITE_RESULT", "Molar mass could not be represented reliably")
        val composition = elementMass.mapValues { (_, contribution) -> contribution / mass * 100.0 }
        return MolarMassResult(formulaRaw.trim(), mass, totals, composition)
    }

    fun massToMoles(massGrams: Double, molarMass: Double): Double {
        requirePositive(molarMass, "Molar mass")
        if (!massGrams.isFinite() || massGrams < 0) throw CalcEx("DOMAIN", "Mass must be finite and non-negative")
        return massGrams / molarMass
    }

    fun molesToMass(moles: Double, molarMass: Double): Double {
        requirePositive(molarMass, "Molar mass")
        if (!moles.isFinite() || moles < 0) throw CalcEx("DOMAIN", "Amount of substance must be finite and non-negative")
        return moles * molarMass
    }

    private fun requirePositive(v: Double, label: String) {
        if (!v.isFinite() || v <= 0) throw CalcEx("DOMAIN", "$label must be finite and greater than zero")
    }

    private class FormulaParser(private val s: String) {
        private var pos = 0
        fun parse(): Map<String, Int> {
            val out = parseGroup(null)
            if (pos != s.length) throw CalcEx("FORMULA", "Unexpected formula token at position ${pos + 1}")
            return out
        }

        private fun parseGroup(until: Char?): MutableMap<String, Int> {
            val out = linkedMapOf<String, Int>()
            while (pos < s.length) {
                val ch = s[pos]
                if (until != null && ch == until) { pos++; return out }
                when {
                    ch == '(' -> {
                        pos++
                        val nested = parseGroup(')')
                        val mul = parseCount()
                        merge(out, nested, mul)
                    }
                    ch.isUpperCase() -> {
                        val start = pos++
                        while (pos < s.length && s[pos].isLowerCase()) pos++
                        val symbol = s.substring(start, pos)
                        if (!AtomicMassDataset.masses.containsKey(symbol)) throw CalcEx("UNSUPPORTED_ELEMENT", "No verified standard atomic weight is stored for $symbol")
                        val count = parseCount()
                        out[symbol] = safeAdd(out[symbol] ?: 0, count)
                    }
                    ch == ')' -> throw CalcEx("FORMULA", "Unmatched closing parenthesis")
                    else -> throw CalcEx("FORMULA", "Unsupported formula token '$ch'")
                }
            }
            if (until != null) throw CalcEx("FORMULA", "Unclosed parenthesis")
            return out
        }

        private fun parseCount(): Int {
            val start = pos
            while (pos < s.length && s[pos].isDigit()) pos++
            if (start == pos) return 1
            val value = s.substring(start, pos).toIntOrNull() ?: throw CalcEx("FORMULA", "Invalid atom count")
            if (value !in 1..1_000_000) throw CalcEx("FORMULA", "Atom count must be 1..1000000")
            return value
        }

        private fun merge(target: MutableMap<String, Int>, source: Map<String, Int>, multiplier: Int) {
            for ((k, v) in source) {
                val product = v.toLong() * multiplier
                if (product > 1_000_000L) throw CalcEx("TOO_LARGE", "Atom count is outside the supported range")
                target[k] = safeAdd(target[k] ?: 0, product.toInt())
            }
        }

        private fun safeAdd(a: Int, b: Int): Int {
            val x = a.toLong() + b
            if (x > 1_000_000L) throw CalcEx("TOO_LARGE", "Atom count is outside the supported range")
            return x.toInt()
        }
    }
}
