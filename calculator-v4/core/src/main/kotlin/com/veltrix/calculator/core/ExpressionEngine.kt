package com.veltrix.calculator.core

import java.math.BigDecimal
import java.math.BigInteger
import java.math.MathContext
import java.math.RoundingMode
import kotlin.math.*

internal class CalcEx(val code: String, message: String) : RuntimeException(message)

internal data class Ctx(
    val settings: EngineSettings,
    val vars: Map<String, BigDecimal> = emptyMap()
) {
    val mc = MathContext(settings.precision.coerceIn(6, 50), RoundingMode.HALF_EVEN)
}

internal sealed interface Node {
    fun eval(ctx: Ctx): BigDecimal
    fun vars(): Set<String> = emptySet()
}

internal data class Num(val value: BigDecimal) : Node {
    override fun eval(ctx: Ctx) = value
}

internal data class Var(val name: String) : Node {
    override fun eval(ctx: Ctx): BigDecimal = ctx.vars[name] ?: when (name.lowercase()) {
        "pi", "π" -> BigDecimal.valueOf(Math.PI)
        "e" -> BigDecimal.valueOf(Math.E)
        "tau", "τ" -> BigDecimal.valueOf(2 * Math.PI)
        "phi", "φ" -> BigDecimal.valueOf((1 + sqrt(5.0)) / 2)
        else -> throw CalcEx("UNKNOWN_VARIABLE", "Unknown variable: $name")
    }

    override fun vars(): Set<String> =
        if (name.lowercase() in setOf("pi", "π", "e", "tau", "τ", "phi", "φ")) emptySet() else setOf(name)
}

internal data class Unary(val op: Char, val node: Node) : Node {
    override fun eval(ctx: Ctx): BigDecimal = when (op) {
        '+' -> node.eval(ctx)
        '-' -> node.eval(ctx).negate(ctx.mc)
        else -> throw CalcEx("OPERATOR", "Unsupported unary operator")
    }
    override fun vars() = node.vars()
}

internal data class Bin(val left: Node, val op: Char, val right: Node) : Node {
    override fun eval(ctx: Ctx): BigDecimal {
        val a = left.eval(ctx)
        val b = right.eval(ctx)
        return when (op) {
            '+' -> a.add(b, ctx.mc)
            '-' -> a.subtract(b, ctx.mc)
            '*' -> a.multiply(b, ctx.mc)
            '/' -> {
                if (b.compareTo(BigDecimal.ZERO) == 0) throw CalcEx("DIVIDE_BY_ZERO", "Division by zero is undefined")
                a.divide(b, ctx.mc)
            }
            '^' -> power(a, b, ctx)
            else -> throw CalcEx("OPERATOR", "Unsupported operator: $op")
        }
    }

    private fun power(a: BigDecimal, b: BigDecimal, ctx: Ctx): BigDecimal {
        return try {
            val n = b.toBigIntegerExact().intValueExact()
            if (n >= 0) a.pow(n, ctx.mc) else BigDecimal.ONE.divide(a.pow(-n, ctx.mc), ctx.mc)
        } catch (_: Exception) {
            val d = a.toDouble().pow(b.toDouble())
            if (!d.isFinite()) throw CalcEx("DOMAIN", "Power is outside the supported real domain")
            BigDecimal.valueOf(d).round(ctx.mc)
        }
    }

    override fun vars() = left.vars() + right.vars()
}

internal data class Fact(val node: Node) : Node {
    override fun eval(ctx: Ctx): BigDecimal {
        val n = try { node.eval(ctx).toBigIntegerExact() } catch (_: Exception) {
            throw CalcEx("DOMAIN", "Factorial requires an integer")
        }
        if (n.signum() < 0 || n > BigInteger.valueOf(10_000)) {
            throw CalcEx("DOMAIN", "Factorial requires an integer from 0 to 10000")
        }
        var result = BigInteger.ONE
        var i = BigInteger.TWO
        while (i <= n) {
            result = result.multiply(i)
            i = i.add(BigInteger.ONE)
        }
        return BigDecimal(result)
    }

    override fun vars() = node.vars()
}

internal data class Pct(val node: Node) : Node {
    override fun eval(ctx: Ctx) = node.eval(ctx).divide(BigDecimal("100"), ctx.mc)
    override fun vars() = node.vars()
}

internal data class Fn(val name: String, val args: List<Node>) : Node {
    override fun eval(ctx: Ctx): BigDecimal {
        val values = args.map { it.eval(ctx).toDouble() }
        fun one(): Double = values.singleOrNull() ?: throw CalcEx("ARGUMENTS", "$name expects one argument")
        fun angleIn(): Double = if (ctx.settings.angleMode == AngleMode.DEGREES) Math.toRadians(one()) else one()
        fun angleOut(v: Double): Double = if (ctx.settings.angleMode == AngleMode.DEGREES) Math.toDegrees(v) else v

        val result = when (name.lowercase()) {
            "sin" -> sin(angleIn())
            "cos" -> cos(angleIn())
            "tan" -> tan(angleIn())
            "asin", "arcsin" -> angleOut(asin(one()))
            "acos", "arccos" -> angleOut(acos(one()))
            "atan", "arctan" -> angleOut(atan(one()))
            "sinh" -> sinh(one())
            "cosh" -> cosh(one())
            "tanh" -> tanh(one())
            "sqrt" -> {
                val x = one()
                if (x < 0) throw CalcEx("DOMAIN", "sqrt requires a non-negative real value")
                sqrt(x)
            }
            "cbrt" -> cbrt(one())
            "ln" -> {
                val x = one()
                if (x <= 0) throw CalcEx("DOMAIN", "ln requires a positive value")
                ln(x)
            }
            "log", "log10" -> {
                val x = one()
                if (x <= 0) throw CalcEx("DOMAIN", "log requires a positive value")
                log10(x)
            }
            "exp" -> exp(one())
            "abs" -> abs(one())
            "floor" -> floor(one())
            "ceil" -> ceil(one())
            "round" -> round(one())
            "min" -> values.min()
            "max" -> values.max()
            "root" -> {
                if (values.size != 2) throw CalcEx("ARGUMENTS", "root(value,n) expects two arguments")
                val x = values[0]
                val n = values[1]
                if (n == 0.0) throw CalcEx("DOMAIN", "Zeroth root is undefined")
                if (x < 0 && n.roundToInt() % 2 == 0) throw CalcEx("DOMAIN", "Even root of a negative value is not real")
                if (x < 0) -((-x).pow(1.0 / n)) else x.pow(1.0 / n)
            }
            else -> throw CalcEx("UNKNOWN_FUNCTION", "Unknown function: $name")
        }

        if (!result.isFinite()) throw CalcEx("DOMAIN", "$name produced a non-finite result")
        // Transcendental functions are evaluated as Double, so normalize their
        // result by significant digits rather than an absolute decimal grid.
        // Absolute snapping (for example round(x * 1e14) / 1e14) destroys valid
        // scientific magnitudes below 1e-14 and makes inverse solving unstable.
        val stablePrecision = minOf(ctx.mc.precision, 15)
        return BigDecimal.valueOf(result)
            .round(MathContext(stablePrecision, RoundingMode.HALF_EVEN))
            .round(ctx.mc)
    }

    override fun vars() = args.flatMap { it.vars() }.toSet()
}

class ExpressionEngine {
    fun evaluate(
        input: String,
        settings: EngineSettings = EngineSettings(),
        variables: Map<String, BigDecimal> = emptyMap()
    ): CalculationResult {
        return try {
            val normalized = normalize(input)
            val node = parse(normalized)
            val value = node.eval(Ctx(settings, variables))
            val pretty = pretty(value)
            val scientific = Regex("(?i)sin|cos|tan|log|ln|sqrt|exp|cbrt|root").containsMatchIn(normalized)
            CalculationResult(
                input = input,
                type = if (scientific) CalculationType.SCIENTIFIC else CalculationType.STANDARD,
                primary = pretty,
                exact = if (!scientific) pretty else null,
                approximate = if (scientific) pretty else null,
                alternatives = mapOf(
                    "decimal" to pretty,
                    "scientific" to value.round(MathContext(minOf(12, settings.precision))).toEngineeringString()
                ),
                steps = listOf("Parsed: $normalized", "Applied operator precedence", "Computed at precision ${settings.precision}")
            )
        } catch (e: CalcEx) {
            CalculationResult.fail(input, CalculationType.STANDARD, e.code, e.message ?: "Calculation error")
        } catch (_: Exception) {
            CalculationResult.fail(input, CalculationType.STANDARD, "INVALID_EXPRESSION", "Invalid or malformed expression")
        }
    }

    internal fun parse(input: String): Node = Parser(Tokenizer(input).tokenize()).parse()

    private fun normalize(raw: String): String {
        var s = raw.trim()
            .replace('×', '*')
            .replace('÷', '/')
            .replace('−', '-')
            .replace("**", "^")
            .replace(Regex("(?i)\\bof\\b"), "*")

        Regex("^\\s*([+-]?[0-9.]+)\\s*([+-])\\s*([0-9.]+)%\\s*$").matchEntire(s)?.let { m ->
            val base = m.groupValues[1]
            s = "$base ${m.groupValues[2]} ($base*${m.groupValues[3]}/100)"
        }
        return s
    }

    companion object {
        internal fun pretty(value: BigDecimal): String = value.stripTrailingZeros().toPlainString()
    }
}

private enum class TokenType { NUMBER, IDENT, PLUS, MINUS, MUL, DIV, POW, FACT, PERCENT, LPAREN, RPAREN, COMMA, EOF }
private data class Token(val type: TokenType, val text: String)

private class Tokenizer(private val source: String) {
    fun tokenize(): List<Token> {
        val out = mutableListOf<Token>()
        var i = 0
        while (i < source.length) {
            val c = source[i]
            when {
                c.isWhitespace() -> i++
                c.isDigit() || c == '.' -> {
                    val start = i++
                    var hasExponent = false
                    while (i < source.length) {
                        val z = source[i]
                        when {
                            z.isDigit() || z == '.' -> i++
                            (z == 'e' || z == 'E') && !hasExponent -> {
                                hasExponent = true
                                i++
                                if (i < source.length && (source[i] == '+' || source[i] == '-')) i++
                            }
                            else -> break
                        }
                    }
                    out += Token(TokenType.NUMBER, source.substring(start, i))
                }
                c.isLetter() || c == 'π' || c == 'φ' || c == 'τ' || c == '_' -> {
                    val start = i++
                    while (i < source.length && (source[i].isLetterOrDigit() || source[i] == '_')) i++
                    out += Token(TokenType.IDENT, source.substring(start, i))
                }
                else -> {
                    out += when (c) {
                        '+' -> Token(TokenType.PLUS, "+")
                        '-' -> Token(TokenType.MINUS, "-")
                        '*' -> Token(TokenType.MUL, "*")
                        '/' -> Token(TokenType.DIV, "/")
                        '^' -> Token(TokenType.POW, "^")
                        '!' -> Token(TokenType.FACT, "!")
                        '%' -> Token(TokenType.PERCENT, "%")
                        '(' -> Token(TokenType.LPAREN, "(")
                        ')' -> Token(TokenType.RPAREN, ")")
                        ',' -> Token(TokenType.COMMA, ",")
                        else -> throw CalcEx("INVALID_CHARACTER", "Unsupported character: $c")
                    }
                    i++
                }
            }
        }
        out += Token(TokenType.EOF, "")
        return injectImplicitMultiplication(out)
    }

    private fun injectImplicitMultiplication(tokens: List<Token>): List<Token> {
        val out = mutableListOf<Token>()
        fun canEnd(t: TokenType) = t in setOf(TokenType.NUMBER, TokenType.IDENT, TokenType.RPAREN, TokenType.FACT, TokenType.PERCENT)
        fun canStart(t: TokenType) = t in setOf(TokenType.NUMBER, TokenType.IDENT, TokenType.LPAREN)
        for (current in tokens) {
            if (out.isNotEmpty() && current.type != TokenType.EOF) {
                val previous = out.last()
                val functionCall = previous.type == TokenType.IDENT && current.type == TokenType.LPAREN
                if (canEnd(previous.type) && canStart(current.type) && !functionCall) out += Token(TokenType.MUL, "*")
            }
            out += current
        }
        return out
    }
}

private class Parser(private val tokens: List<Token>) {
    private var pos = 0
    private fun peek() = tokens[pos]
    private fun match(type: TokenType): Boolean = if (peek().type == type) { pos++; true } else false

    fun parse(): Node {
        val node = expression()
        if (peek().type != TokenType.EOF) throw CalcEx("SYNTAX", "Unexpected token: ${peek().text}")
        return node
    }

    private fun expression(): Node {
        var node = term()
        while (true) {
            node = when {
                match(TokenType.PLUS) -> Bin(node, '+', term())
                match(TokenType.MINUS) -> Bin(node, '-', term())
                else -> return node
            }
        }
    }

    private fun term(): Node {
        var node = power()
        while (true) {
            node = when {
                match(TokenType.MUL) -> Bin(node, '*', power())
                match(TokenType.DIV) -> Bin(node, '/', power())
                else -> return node
            }
        }
    }

    private fun power(): Node {
        var node = unary()
        if (match(TokenType.POW)) node = Bin(node, '^', power())
        return node
    }

    private fun unary(): Node = when {
        match(TokenType.PLUS) -> Unary('+', unary())
        match(TokenType.MINUS) -> Unary('-', unary())
        else -> postfix()
    }

    private fun postfix(): Node {
        var node = primary()
        while (true) {
            node = when {
                match(TokenType.FACT) -> Fact(node)
                match(TokenType.PERCENT) -> Pct(node)
                else -> return node
            }
        }
    }

    private fun primary(): Node {
        val token = tokens[pos++]
        return when (token.type) {
            TokenType.NUMBER -> try { Num(BigDecimal(token.text)) } catch (_: Exception) {
                throw CalcEx("NUMBER", "Invalid number: ${token.text}")
            }
            TokenType.IDENT -> if (match(TokenType.LPAREN)) {
                val args = mutableListOf<Node>()
                if (!match(TokenType.RPAREN)) {
                    do { args += expression() } while (match(TokenType.COMMA))
                    if (!match(TokenType.RPAREN)) throw CalcEx("SYNTAX", "Missing )")
                }
                Fn(token.text, args)
            } else Var(token.text)
            TokenType.LPAREN -> {
                val node = expression()
                if (!match(TokenType.RPAREN)) throw CalcEx("SYNTAX", "Missing )")
                node
            }
            else -> throw CalcEx("SYNTAX", "Unexpected token: ${token.text}")
        }
    }
}
