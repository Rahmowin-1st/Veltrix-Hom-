package com.veltrix.calculator.core

import kotlin.math.*

internal data class ComplexNumber(val re: Double, val im: Double = 0.0) {
    operator fun plus(o: ComplexNumber) = ComplexNumber(re + o.re, im + o.im)
    operator fun minus(o: ComplexNumber) = ComplexNumber(re - o.re, im - o.im)
    operator fun times(o: ComplexNumber) = ComplexNumber(re * o.re - im * o.im, re * o.im + im * o.re)
    operator fun div(o: ComplexNumber): ComplexNumber {
        val d = o.re * o.re + o.im * o.im
        if (d == 0.0) throw CalcEx("DIVIDE_BY_ZERO", "Division by zero is undefined")
        return ComplexNumber((re * o.re + im * o.im) / d, (im * o.re - re * o.im) / d)
    }
    operator fun unaryMinus() = ComplexNumber(-re, -im)
    fun absValue() = hypot(re, im)
    fun arg() = atan2(im, re)
    fun conjugate() = ComplexNumber(re, -im)
    fun exp() = ComplexNumber(kotlin.math.exp(re) * cos(im), kotlin.math.exp(re) * sin(im))
    fun ln(): ComplexNumber {
        if (re == 0.0 && im == 0.0) throw CalcEx("DOMAIN", "ln(0) is undefined")
        return ComplexNumber(kotlin.math.ln(absValue()), arg())
    }
    fun sqrt(): ComplexNumber {
        if (im == 0.0 && re >= 0.0) return ComplexNumber(kotlin.math.sqrt(re), 0.0)
        val r = absValue()
        val a = kotlin.math.sqrt((r + re) / 2.0)
        val b = kotlin.math.sqrt(max(0.0, (r - re) / 2.0)) * if (im < 0) -1 else 1
        return ComplexNumber(a, b)
    }
    fun sin() = ComplexNumber(kotlin.math.sin(re) * cosh(im), kotlin.math.cos(re) * sinh(im))
    fun cos() = ComplexNumber(kotlin.math.cos(re) * cosh(im), -kotlin.math.sin(re) * sinh(im))
    fun tan() = sin() / cos()
    fun pow(o: ComplexNumber): ComplexNumber {
        if (o.im == 0.0) {
            val n = o.re.roundToInt()
            if (abs(o.re - n) < 1e-12 && abs(n) <= 1000) {
                if (n == 0) return ComplexNumber(1.0)
                var base = this
                var exp = abs(n)
                var acc = ComplexNumber(1.0)
                while (exp > 0) {
                    if (exp and 1 == 1) acc *= base
                    base *= base
                    exp = exp shr 1
                }
                return if (n < 0) ComplexNumber(1.0) / acc else acc
            }
        }
        return (o * ln()).exp()
    }
}

internal class ComplexEngine {
    fun tryCalculate(input: String, settings: EngineSettings): CalculationResult? {
        var s = input.trim()
        val explicit = s.startsWith("complex ", true)
        if (explicit) s = s.substringAfter(' ').trim()
        val hasStandaloneI = Regex("(?i)(?<![A-Za-z])i(?![A-Za-z])").containsMatchIn(s)
        val command = Regex("(?i)^(conj|conjugate|arg|phase|complex abs|complex sqrt|complex exp|complex ln)\\b").containsMatchIn(input.trim())
        if (!explicit && !hasStandaloneI && !command) return null

        val normalized = when {
            s.startsWith("conj ", true) -> "conj(${s.substringAfter(' ')})"
            s.startsWith("conjugate ", true) -> "conj(${s.substringAfter(' ')})"
            s.startsWith("arg ", true) -> "arg(${s.substringAfter(' ')})"
            s.startsWith("phase ", true) -> "arg(${s.substringAfter(' ')})"
            s.startsWith("abs ", true) -> "abs(${s.substringAfter(' ')})"
            s.startsWith("sqrt ", true) -> "sqrt(${s.substringAfter(' ')})"
            s.startsWith("exp ", true) -> "exp(${s.substringAfter(' ')})"
            s.startsWith("ln ", true) -> "ln(${s.substringAfter(' ')})"
            else -> s
        }
        return try {
            val value = ComplexParser(ComplexTokenizer(normalized).tokenize()).parse()
            val formatted = formatComplex(value, settings)
            CalculationResult(
                input = input,
                type = CalculationType.COMPLEX,
                primary = formatted,
                approximate = formatted,
                derived = mapOf(
                    "real" to formatDouble(value.re, settings),
                    "imaginary" to formatDouble(value.im, settings),
                    "magnitude" to formatDouble(value.absValue(), settings),
                    "phase_rad" to formatDouble(value.arg(), settings),
                    "phase_deg" to formatDouble(Math.toDegrees(value.arg()), settings)
                ),
                steps = listOf("Parsed complex expression", "Computed using deterministic complex arithmetic")
            )
        } catch (e: CalcEx) {
            CalculationResult.fail(input, CalculationType.COMPLEX, e.code, e.message ?: "Complex calculation error")
        } catch (_: Exception) {
            CalculationResult.fail(input, CalculationType.COMPLEX, "INVALID_COMPLEX", "Invalid complex expression")
        }
    }

    companion object {
        internal fun formatComplex(z: ComplexNumber, settings: EngineSettings): String {
            val re = clean(z.re)
            val im = clean(z.im)
            if (abs(im) < 1e-13) return formatDouble(re, settings)
            if (abs(re) < 1e-13) {
                return when {
                    abs(im - 1.0) < 1e-13 -> "i"
                    abs(im + 1.0) < 1e-13 -> "-i"
                    else -> "${formatDouble(im, settings)}i"
                }
            }
            val sign = if (im >= 0) "+" else "-"
            val mag = abs(im)
            val imag = if (abs(mag - 1.0) < 1e-13) "i" else "${formatDouble(mag, settings)}i"
            return "${formatDouble(re, settings)} $sign $imag"
        }

        internal fun formatDouble(v: Double, settings: EngineSettings): String {
            val x = clean(v)
            if (!x.isFinite()) throw CalcEx("DOMAIN", "Non-finite complex result")
            return java.math.BigDecimal.valueOf(x)
                .round(java.math.MathContext(settings.precision.coerceIn(6, 34)))
                .stripTrailingZeros().toPlainString()
        }

        private fun clean(v: Double): Double {
            if (!v.isFinite()) return v
            val nearest = round(v)
            if (abs(v - nearest) < 1e-12) return nearest
            val snapped = round(v * 1e12) / 1e12
            return if (abs(v - snapped) < 1e-12) snapped else v
        }
    }
}

private enum class CTokenType { NUMBER, I, IDENT, PLUS, MINUS, MUL, DIV, POW, LPAREN, RPAREN, COMMA, EOF }
private data class CToken(val type: CTokenType, val text: String)

private class ComplexTokenizer(private val source: String) {
    fun tokenize(): List<CToken> {
        val raw = mutableListOf<CToken>()
        var i = 0
        while (i < source.length) {
            val c = source[i]
            when {
                c.isWhitespace() -> i++
                c.isDigit() || c == '.' -> {
                    val start = i++
                    var expSeen = false
                    while (i < source.length) {
                        val z = source[i]
                        when {
                            z.isDigit() || z == '.' -> i++
                            (z == 'e' || z == 'E') && !expSeen -> {
                                expSeen = true; i++
                                if (i < source.length && (source[i] == '+' || source[i] == '-')) i++
                            }
                            else -> break
                        }
                    }
                    raw += CToken(CTokenType.NUMBER, source.substring(start, i))
                }
                c.isLetter() || c == 'π' -> {
                    val start = i++
                    while (i < source.length && (source[i].isLetter() || source[i] == '_')) i++
                    val word = source.substring(start, i)
                    raw += CToken(if (word.equals("i", true)) CTokenType.I else CTokenType.IDENT, word)
                }
                else -> {
                    raw += when (c) {
                        '+' -> CToken(CTokenType.PLUS, "+")
                        '-' -> CToken(CTokenType.MINUS, "-")
                        '*', '×' -> CToken(CTokenType.MUL, "*")
                        '/', '÷' -> CToken(CTokenType.DIV, "/")
                        '^' -> CToken(CTokenType.POW, "^")
                        '(' -> CToken(CTokenType.LPAREN, "(")
                        ')' -> CToken(CTokenType.RPAREN, ")")
                        ',' -> CToken(CTokenType.COMMA, ",")
                        else -> throw CalcEx("CHARACTER", "Unsupported complex character: $c")
                    }
                    i++
                }
            }
        }
        raw += CToken(CTokenType.EOF, "")
        val out = mutableListOf<CToken>()
        fun canEnd(t: CTokenType) = t in setOf(CTokenType.NUMBER, CTokenType.I, CTokenType.RPAREN)
        fun canStart(t: CTokenType) = t in setOf(CTokenType.NUMBER, CTokenType.I, CTokenType.IDENT, CTokenType.LPAREN)
        for (token in raw) {
            if (out.isNotEmpty() && token.type != CTokenType.EOF) {
                val p = out.last()
                val functionCall = p.type == CTokenType.IDENT && token.type == CTokenType.LPAREN
                if (canEnd(p.type) && canStart(token.type) && !functionCall) out += CToken(CTokenType.MUL, "*")
            }
            out += token
        }
        return out
    }
}

private class ComplexParser(private val tokens: List<CToken>) {
    private var p = 0
    private fun peek() = tokens[p]
    private fun match(t: CTokenType) = if (peek().type == t) { p++; true } else false

    fun parse(): ComplexNumber {
        val v = expression()
        if (peek().type != CTokenType.EOF) throw CalcEx("SYNTAX", "Unexpected token: ${peek().text}")
        return v
    }

    private fun expression(): ComplexNumber {
        var v = term()
        while (true) v = when {
            match(CTokenType.PLUS) -> v + term()
            match(CTokenType.MINUS) -> v - term()
            else -> return v
        }
    }

    private fun term(): ComplexNumber {
        var v = power()
        while (true) v = when {
            match(CTokenType.MUL) -> v * power()
            match(CTokenType.DIV) -> v / power()
            else -> return v
        }
    }

    private fun power(): ComplexNumber {
        var v = unary()
        if (match(CTokenType.POW)) v = v.pow(power())
        return v
    }

    private fun unary(): ComplexNumber = when {
        match(CTokenType.PLUS) -> unary()
        match(CTokenType.MINUS) -> -unary()
        else -> primary()
    }

    private fun primary(): ComplexNumber {
        val t = tokens[p++]
        return when (t.type) {
            CTokenType.NUMBER -> ComplexNumber(t.text.toDoubleOrNull() ?: throw CalcEx("NUMBER", "Invalid number"))
            CTokenType.I -> ComplexNumber(0.0, 1.0)
            CTokenType.IDENT -> {
                if (t.text.equals("pi", true) || t.text == "π") return ComplexNumber(Math.PI)
                if (t.text.equals("e", true)) return ComplexNumber(Math.E)
                if (!match(CTokenType.LPAREN)) throw CalcEx("UNKNOWN_VARIABLE", "Unknown complex symbol: ${t.text}")
                val a = expression()
                if (!match(CTokenType.RPAREN)) throw CalcEx("SYNTAX", "Missing )")
                when (t.text.lowercase()) {
                    "conj", "conjugate" -> a.conjugate()
                    "abs" -> ComplexNumber(a.absValue())
                    "arg", "phase" -> ComplexNumber(a.arg())
                    "sqrt" -> a.sqrt()
                    "exp" -> a.exp()
                    "ln", "log" -> a.ln()
                    "sin" -> a.sin()
                    "cos" -> a.cos()
                    "tan" -> a.tan()
                    else -> throw CalcEx("UNKNOWN_FUNCTION", "Unknown complex function: ${t.text}")
                }
            }
            CTokenType.LPAREN -> {
                val v = expression()
                if (!match(CTokenType.RPAREN)) throw CalcEx("SYNTAX", "Missing )")
                v
            }
            else -> throw CalcEx("SYNTAX", "Unexpected complex token: ${t.text}")
        }
    }
}
