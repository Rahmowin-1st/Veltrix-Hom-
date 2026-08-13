package com.veltrix.calculator.core

/** Stable backend contracts consumed by Android UI, widgets, search and history. */
enum class Subject(val wireName: String) {
    MATH("Math"), PHYSICS("Physics"), GEOMETRY("Geometry"), CHEMISTRY("Chemistry"),
    STATISTICS("Statistics"), FINANCE("Finance"), COMPUTER("Computer"), DATE_TIME("Date & Time"),
    TEXT_LANGUAGE("Text / Language")
}

enum class EnvironmentFamily {
    StandardCalculator, ScientificCalculator, ProgrammerCalculator, EquationSolver, PolynomialSolver,
    FormulaSolver, MatrixTool, VectorTool, CalculusTool, StatisticsTool, GeometryTool, GraphTool,
    ConverterTool, FinanceTool, DateTimeTool, TextAnalyzer
}

enum class InputKind { NUMBER, INTEGER, TEXT, DATE, DATASET, MATRIX, VECTOR, EXPRESSION, SELECT }
enum class OutputKind { NUMBER, TEXT, ROOTS, DATASET, MATRIX, VECTOR, GRAPH, STRUCTURED }
enum class OfflinePolicy { OFFLINE_FULL, OFFLINE_CACHED_LIVE_DATA, ONLINE_REQUIRED }
enum class LiveDataPolicy { NONE, OPTIONAL_REFRESH, REQUIRED }
enum class HistoryPolicy { SAVE, SAVE_SUMMARY_ONLY, DO_NOT_SAVE }
enum class WidgetSize { SMALL, MEDIUM, LARGE }
enum class ToolExecutorKind {
    EXPRESSION, PROGRAMMER, MATH_UTILITY, FORMULA, POLYNOMIAL, MATRIX, VECTOR, CALCULUS, STATISTICS, FINANCE,
    GEOMETRY, CHEMISTRY, DATE_TIME, TEXT_ANALYZER, GRAPH, CONVERTER, CURRENCY
}

data class InputFieldDefinition(
    val id: String,
    val label: String,
    val kind: InputKind = InputKind.NUMBER,
    val required: Boolean = true,
    val canonicalUnit: String? = null,
    val unitCategory: String? = null,
    val options: List<String> = emptyList(),
    val min: Double? = null,
    val max: Double? = null,
    val allowNegative: Boolean = true,
    val placeholder: String? = null
)

data class OutputFieldDefinition(
    val id: String,
    val label: String,
    val kind: OutputKind = OutputKind.NUMBER,
    val canonicalUnit: String? = null
)

data class FormulaDefinition(
    val display: String,
    /** Solve expressions by unknown id, expressed in the deterministic expression grammar. */
    val solveRules: Map<String, String>,
    val notes: String? = null
)

data class GraphDefinition(
    val family: String,
    val parameterIds: List<String>,
    val defaultViewport: GraphViewport = GraphViewport(-10.0, 10.0, -10.0, 10.0)
)

data class ToolDefinition(
    val id: String,
    val title: String,
    val shortTitle: String? = null,
    val subject: Subject,
    val category: String,
    val topic: String,
    val description: String,
    val aliases: Set<String> = emptySet(),
    val commonMisspellings: Set<String> = emptySet(),
    val keywords: Set<String> = emptySet(),
    val tags: Set<String> = emptySet(),
    val environmentFamily: EnvironmentFamily,
    val executorKind: ToolExecutorKind,
    val inputSchema: List<InputFieldDefinition>,
    val outputSchema: List<OutputFieldDefinition>,
    val formulaDefinition: FormulaDefinition? = null,
    val validationRules: List<String> = emptyList(),
    val unitRules: Map<String, String> = emptyMap(),
    val graphDefinition: GraphDefinition? = null,
    val keypadCapabilities: Set<String> = emptySet(),
    val relatedToolIds: Set<String> = emptySet(),
    val supportsWidget: Boolean = false,
    val supportedWidgetSizes: Set<WidgetSize> = emptySet(),
    val supportsFloatingCompactMode: Boolean = false,
    val historyPolicy: HistoryPolicy = HistoryPolicy.SAVE,
    val offlinePolicy: OfflinePolicy = OfflinePolicy.OFFLINE_FULL,
    val liveDataPolicy: LiveDataPolicy = LiveDataPolicy.NONE,
    val schemaVersion: Int = 1
)

data class ToolInput(val value: String, val unit: String? = null)
data class ToolRequest(
    val toolId: String,
    val inputs: Map<String, ToolInput>,
    val selectedUnknown: String? = null,
    val settings: EngineSettings = EngineSettings()
)

data class StructuredError(
    val code: String,
    val message: String,
    val fieldId: String? = null,
    val recoverable: Boolean = true
)

data class ToolResponse(
    val toolId: String,
    val primary: String = "",
    val outputs: Map<String, String> = emptyMap(),
    val normalizedInput: Map<String, String> = emptyMap(),
    val metadata: Map<String, String> = emptyMap(),
    val warnings: List<String> = emptyList(),
    val error: StructuredError? = null,
    val exact: Boolean = false,
    val schemaVersion: Int = 1
) {
    val isSuccess: Boolean get() = error == null
}

data class GraphViewport(val minX: Double, val maxX: Double, val minY: Double, val maxY: Double) {
    init {
        require(minX.isFinite() && maxX.isFinite() && minY.isFinite() && maxY.isFinite())
        require(minX < maxX && minY < maxY)
    }
}

data class SearchMatch(
    val tool: ToolDefinition,
    val score: Double,
    val reason: String
)

data class MainBrainSnapshot(
    val standardCalculatorToolId: String = "standard-calculator",
    val lastUsed5: List<String> = emptyList(),
    val recentConverters: List<String> = emptyList(),
    val frequentConverters: List<String> = emptyList(),
    val librarySubjects: List<Subject> = Subject.entries,
    val graphEntryToolId: String = "graph-functions",
    val historyEnabled: Boolean = true,
    val widgetEnabledToolIds: List<String> = emptyList(),
    val settingsAvailable: Boolean = true
)
