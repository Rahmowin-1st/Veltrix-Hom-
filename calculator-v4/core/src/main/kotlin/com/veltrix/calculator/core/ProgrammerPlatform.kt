package com.veltrix.calculator.core

import java.math.BigInteger

enum class Signedness { SIGNED, UNSIGNED }
data class ProgrammerSettings(val bitWidth: Int = 64, val signedness: Signedness = Signedness.SIGNED) {
    init { require(bitWidth in setOf(8, 16, 32, 64)) }
}
data class ProgrammerResult(val decimal: String, val binary: String, val octal: String, val hex: String, val bitWidth: Int, val signedness: Signedness)

class ProgrammerPlatform {
    private val token = "(?:0[xX][0-9A-Fa-f]+|0[bB][01]+|0[oO][0-7]+|[-+]?\\d+)"

    fun evaluate(expressionRaw: String, settings: ProgrammerSettings = ProgrammerSettings()): ProgrammerResult {
        val s = expressionRaw.trim()
        if (s.isBlank()) throw CalcEx("EMPTY", "Programmer expression cannot be empty")
        Regex("^($token)$").matchEntire(s)?.let { return format(normalize(parse(it.groupValues[1]), settings), settings) }
        Regex("^~\\s*($token)$").matchEntire(s)?.let {
            val a = rawBits(parse(it.groupValues[1]), settings)
            return format(fromBits(a.xor(mask(settings.bitWidth)), settings), settings)
        }
        Regex("^($token)\\s*(<<|>>>|>>|&|\\||\\^)\\s*($token)$").matchEntire(s)?.let { m ->
            val op = m.groupValues[2]
            val a = rawBits(parse(m.groupValues[1]), settings)
            val b = parse(m.groupValues[3])
            val out = when (op) {
                "&" -> a.and(rawBits(b, settings))
                "|" -> a.or(rawBits(b, settings))
                "^" -> a.xor(rawBits(b, settings))
                else -> {
                    if (b < BigInteger.ZERO || b > BigInteger.valueOf(63)) throw CalcEx("SHIFT_RANGE", "Shift must be 0..63")
                    val shift = b.toInt()
                    when (op) {
                        "<<" -> a.shiftLeft(shift).and(mask(settings.bitWidth))
                        ">>>" -> a.shiftRight(shift)
                        ">>" -> if (settings.signedness == Signedness.SIGNED) {
                            val signed = fromBits(a, settings)
                            rawBits(signed.shiftRight(shift), settings)
                        } else a.shiftRight(shift)
                        else -> error("unreachable")
                    }
                }
            }
            return format(fromBits(out.and(mask(settings.bitWidth)), settings), settings)
        }
        throw CalcEx("INVALID_INPUT", "Unsupported programmer expression")
    }

    fun convert(valueRaw: String, settings: ProgrammerSettings = ProgrammerSettings()): ProgrammerResult = format(normalize(parse(valueRaw), settings), settings)

    private fun parse(raw: String): BigInteger = try {
        val s = raw.trim()
        when {
            s.startsWith("0x", true) -> BigInteger(s.drop(2), 16)
            s.startsWith("0b", true) -> BigInteger(s.drop(2), 2)
            s.startsWith("0o", true) -> BigInteger(s.drop(2), 8)
            else -> BigInteger(s, 10)
        }
    } catch (_: Exception) { throw CalcEx("INTEGER", "Invalid programmer integer") }

    private fun normalize(v: BigInteger, st: ProgrammerSettings): BigInteger {
        val min: BigInteger
        val max: BigInteger
        if (st.signedness == Signedness.UNSIGNED) {
            min = BigInteger.ZERO; max = BigInteger.ONE.shiftLeft(st.bitWidth).subtract(BigInteger.ONE)
        } else {
            min = BigInteger.ONE.shiftLeft(st.bitWidth - 1).negate(); max = BigInteger.ONE.shiftLeft(st.bitWidth - 1).subtract(BigInteger.ONE)
        }
        if (v < min || v > max) throw CalcEx("OVERFLOW", "Value does not fit ${st.bitWidth}-bit ${st.signedness.name.lowercase()} range")
        return v
    }

    private fun rawBits(v: BigInteger, st: ProgrammerSettings): BigInteger {
        val normalized = normalize(v, st)
        return if (normalized.signum() >= 0) normalized else normalized.add(BigInteger.ONE.shiftLeft(st.bitWidth))
    }

    private fun fromBits(bits: BigInteger, st: ProgrammerSettings): BigInteger {
        val b = bits.and(mask(st.bitWidth))
        return if (st.signedness == Signedness.SIGNED && b.testBit(st.bitWidth - 1)) b.subtract(BigInteger.ONE.shiftLeft(st.bitWidth)) else b
    }

    private fun mask(width: Int) = BigInteger.ONE.shiftLeft(width).subtract(BigInteger.ONE)
    private fun format(v: BigInteger, st: ProgrammerSettings): ProgrammerResult {
        val bits = rawBits(v, st)
        return ProgrammerResult(v.toString(), bits.toString(2), bits.toString(8), bits.toString(16).uppercase(), st.bitWidth, st.signedness)
    }
}
