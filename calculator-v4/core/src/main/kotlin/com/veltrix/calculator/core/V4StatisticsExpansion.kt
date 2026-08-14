package com.veltrix.calculator.core

internal object V4StatisticsExpansion {
    fun tools(): List<ToolDefinition> = listOf(
        v4FormulaTool(
            "stats-v4-coefficient-variation", "Coefficient of Variation", Subject.STATISTICS,
            "Statistics Expansion", "Dispersion", "CV = sigma/mu*100",
            mapOf("CV" to "sigma/mu*100", "sigma" to "CV*mu/100", "mu" to "sigma*100/CV"),
            listOf(v4Field("CV", "Coefficient of variation", "%", min = 0.0, allowNegative = false), v4Field("sigma", "Standard deviation", min = 0.0, allowNegative = false), v4Field("mu", "Mean"))
        ),
        v4FormulaTool(
            "stats-v4-margin-error", "Margin of Error for Mean", Subject.STATISTICS,
            "Statistics Expansion", "Confidence intervals", "E = z*sigma/sqrt(n)",
            mapOf("E" to "z*sigma/sqrt(n)", "z" to "E*sqrt(n)/sigma", "sigma" to "E*sqrt(n)/z", "n" to "(z*sigma/E)^2"),
            listOf(v4Field("E", "Margin of error", min = 0.0, allowNegative = false), v4Field("z", "Critical z", min = 0.0, allowNegative = false), v4Field("sigma", "Standard deviation", min = 0.0, allowNegative = false), v4Field("n", "Sample size", min = 1.0, allowNegative = false))
        ),
        v4FormulaTool(
            "stats-v4-sample-size", "Sample Size from Margin of Error", Subject.STATISTICS,
            "Statistics Expansion", "Sampling", "n = (z*sigma/E)^2",
            mapOf("n" to "(z*sigma/E)^2", "z" to "E*sqrt(n)/sigma", "sigma" to "E*sqrt(n)/z", "E" to "z*sigma/sqrt(n)"),
            listOf(v4Field("n", "Required sample size", min = 1.0, allowNegative = false), v4Field("z", "Critical z", min = 0.0, allowNegative = false), v4Field("sigma", "Standard deviation", min = 0.0, allowNegative = false), v4Field("E", "Margin of error", min = 0.0, allowNegative = false))
        )
    )
}
