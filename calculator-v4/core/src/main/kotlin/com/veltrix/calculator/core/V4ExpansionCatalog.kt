package com.veltrix.calculator.core

/** Additive V4 breadth catalog. Backend 1.1 and the verified Grade-8 hard gate remain untouched. */
internal object V4ExpansionCatalog {
    const val EXPECTED_ADDITIONS = 38

    fun tools(): List<ToolDefinition> = (
        V4PhysicsExpansion.tools() +
            V4ChemistryExpansion.tools() +
            V4GeometryFinanceExpansion.tools() +
            V4StatisticsExpansion.tools()
        ).also { tools ->
            require(tools.size == EXPECTED_ADDITIONS) { "V4 expansion catalog size drift: ${tools.size}" }
            require(tools.map { it.id }.toSet().size == tools.size) { "V4 expansion tool ids must be unique" }
        }
}

internal fun v4Field(
    id: String,
    label: String,
    unit: String? = null,
    dimension: String? = null,
    min: Double? = null,
    max: Double? = null,
    allowNegative: Boolean = true
) = InputFieldDefinition(
    id = id,
    label = label,
    canonicalUnit = unit,
    unitCategory = dimension,
    min = min,
    max = max,
    allowNegative = allowNegative
)

internal fun v4FormulaTool(
    id: String,
    title: String,
    subject: Subject,
    category: String,
    topic: String,
    display: String,
    rules: Map<String, String>,
    fields: List<InputFieldDefinition>,
    tags: Set<String> = emptySet()
): ToolDefinition {
    val targets = rules.keys.toSet()
    val fieldIds = fields.map { it.id }.toSet()
    require(targets.isNotEmpty()) { "$id must expose a solve target" }
    require(targets.all { it in fieldIds }) { "$id solve target missing from input schema" }
    return ToolDefinition(
        id = id,
        title = title,
        subject = subject,
        category = category,
        topic = topic,
        description = "Deterministic V4 solver for $display. Missing values are never guessed.",
        aliases = setOf(title.lowercase(), display.lowercase()),
        keywords = tags,
        tags = tags,
        environmentFamily = when (subject) {
            Subject.GEOMETRY -> EnvironmentFamily.GeometryTool
            Subject.FINANCE -> EnvironmentFamily.FinanceTool
            Subject.DATE_TIME -> EnvironmentFamily.DateTimeTool
            Subject.TEXT_LANGUAGE -> EnvironmentFamily.TextAnalyzer
            else -> EnvironmentFamily.FormulaSolver
        },
        executorKind = ToolExecutorKind.FORMULA,
        inputSchema = fields,
        outputSchema = targets.map { target ->
            OutputFieldDefinition(target, target, OutputKind.NUMBER, fields.firstOrNull { it.id == target }?.canonicalUnit)
        },
        formulaDefinition = FormulaDefinition(
            display = display,
            solveRules = rules,
            notes = "V4 additive deterministic relation; explicit target selection supported."
        ),
        validationRules = listOf("Declared domain constraints are enforced; missing values are never guessed."),
        offlinePolicy = OfflinePolicy.OFFLINE_FULL,
        liveDataPolicy = LiveDataPolicy.NONE,
        schemaVersion = 4,
        sourceRefs = setOf("V4_ORIGINAL_MISSION", "V4_SUBJECT_EXPANSION")
    )
}
