package com.veltrix.calculator.core

enum class AngleMode { DEGREES, RADIANS }
enum class CalculationType {
    STANDARD, SCIENTIFIC, ALGEBRA, POLYNOMIAL, COMPLEX, MATRIX, VECTOR, CALCULUS, GRAPH,
    PROGRAMMER, UNIT, DATE_TIME, FINANCE, GEOMETRY, STATISTICS, CURRENCY, UNKNOWN
}

data class EngineSettings(val angleMode: AngleMode = AngleMode.DEGREES, val precision: Int = 18)
data class CalculationError(val code: String, val message: String)

data class CalculationResult(
    val input: String,
    val type: CalculationType,
    val primary: String = "",
    val exact: String? = null,
    val approximate: String? = null,
    val alternatives: Map<String, String> = emptyMap(),
    val derived: Map<String, String> = emptyMap(),
    val steps: List<String> = emptyList(),
    val metadata: Map<String, String> = emptyMap(),
    val error: CalculationError? = null,
    val requiresNetwork: Boolean = false
) {
    val isSuccess: Boolean get() = error == null

    companion object {
        fun fail(input: String, type: CalculationType, code: String, message: String) =
            CalculationResult(input, type, error = CalculationError(code, message))
    }
}

data class GraphPoint(val x: Double, val y: Double)
data class GraphExtremum(val seriesIndex: Int, val x: Double, val y: Double, val kind: String)
data class GraphIntersection(val firstSeries: Int, val secondSeries: Int, val x: Double, val y: Double)
data class GraphSeriesData(
    val expression: String,
    val points: List<GraphPoint>,
    val roots: List<Double>,
    val sampledMin: GraphPoint?,
    val sampledMax: GraphPoint?,
    val localExtrema: List<GraphExtremum>
)
data class GraphBundle(
    val variable: String,
    val domainStart: Double,
    val domainEnd: Double,
    val series: List<GraphSeriesData>,
    val intersections: List<GraphIntersection>,
    val sampleCount: Int
)
