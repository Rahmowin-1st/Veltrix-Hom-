package com.veltrix.calculator.core

class ToolRegistry private constructor(private val ordered: List<ToolDefinition>) {
    private val byId = ordered.associateBy { it.id }

    init {
        require(byId.size == ordered.size) { "Tool ids must be unique" }
        require(ordered.none { it.title.isBlank() || it.id.isBlank() }) { "Tool metadata cannot be blank" }
        ordered.forEach { tool ->
            require(tool.inputSchema.map { it.id }.distinct().size == tool.inputSchema.size) { "${tool.id} input ids must be unique" }
            require(tool.iconKey.isNotBlank()) { "${tool.id} icon key cannot be blank" }
            require(tool.presentationEnvironmentKey.isNotBlank()) { "${tool.id} presentation environment cannot be blank" }
            require(tool.sourceRefs.isNotEmpty()) { "${tool.id} must declare provenance" }
            val addressable = (tool.inputSchema.map { it.id } + tool.outputSchema.map { it.id }).toSet()
            require(tool.solveTargets.all { it in addressable }) { "${tool.id} solve target missing from schema" }
        }
    }

    fun all(): List<ToolDefinition> = ordered
    fun get(id: String): ToolDefinition? = byId[id]
    fun require(id: String): ToolDefinition = byId[id] ?: error("Unknown tool: $id")
    fun bySubject(subject: Subject): List<ToolDefinition> = ordered.filter { it.subject == subject }
    fun subjects(): Map<Subject, List<ToolDefinition>> = ordered.groupBy { it.subject }
    fun widgetTools(): List<ToolDefinition> = ordered.filter { it.supportsWidget }
    fun compactTools(): List<ToolDefinition> = ordered.filter { it.supportsFloatingCompactMode }

    companion object {
        const val SCHEMA_VERSION = 4
        const val VERIFIED_BACKEND_1_1_TOOLS = 104
        const val EXPECTED_V4_TOOLS = VERIFIED_BACKEND_1_1_TOOLS + V4Catalog.EXPECTED_ADDITIONS + Grade8PhysicsCatalog.EXPECTED_ADDITIONS + V4ExpansionCatalog.EXPECTED_ADDITIONS + V4SpecialCatalog.EXPECTED_ADDITIONS

        fun default(): ToolRegistry {
            val baseline = SpecialToolCatalog.tools() + FormulaCatalog.tools() + GraphToolCatalog.tools()
            require(baseline.size == VERIFIED_BACKEND_1_1_TOOLS) { "Backend 1.1 catalog drift: ${baseline.size}" }
            val tools = (baseline + V4Catalog.tools() + Grade8PhysicsCatalog.tools() + V4ExpansionCatalog.tools() + V4SpecialCatalog.tools()).map(::normalizeMetadata)
            require(tools.size == EXPECTED_V4_TOOLS) { "V4 registry size drift: ${tools.size}" }
            return ToolRegistry(tools)
        }

        private fun normalizeMetadata(tool: ToolDefinition): ToolDefinition {
            val formula = tool.formulaDefinition
            val levels = buildSet {
                val text = (tool.id + " " + tool.category + " " + tool.tags.joinToString(" ")).lowercase()
                if ("grade8" in text || "grade 8" in text) add(EducationLevel.GRADE_8)
                if ("grade9" in text || "grade 9" in text) add(EducationLevel.GRADE_9)
                if ("grade10" in text || "grade 10" in text) add(EducationLevel.GRADE_10)
                if ("grade11" in text || "grade 11" in text) add(EducationLevel.GRADE_11)
                if ("advanced" in text) {
                    add(EducationLevel.ADVANCED)
                    add(EducationLevel.COLLEGE_INTRO)
                }
                if ("college" in text) add(EducationLevel.COLLEGE_INTRO)
                if (isEmpty()) addAll(tool.educationLevels)
            }
            val method = when {
                formula == null -> tool.calculationMethod
                formula.symbolicByTarget.isNotEmpty() -> CalculationMethod.EXACT_CLOSED_FORM
                formula.solveBranches.values.any { it.isNotEmpty() } -> CalculationMethod.MULTI_BRANCH_NUMERIC
                else -> CalculationMethod.CLOSED_FORM_NUMERIC
            }
            val exactness = when {
                formula?.symbolicByTarget?.isNotEmpty() == true -> ExactnessCapability.EXACT_AND_NUMERIC
                formula != null -> ExactnessCapability.EXACT_WHEN_DECLARED
                else -> tool.exactnessCapability
            }
            val layout = if (tool.layoutFamily != ToolLayoutFamily.UNSPECIFIED) tool.layoutFamily else when (tool.environmentFamily) {
                EnvironmentFamily.StandardCalculator, EnvironmentFamily.ScientificCalculator,
                EnvironmentFamily.ProgrammerCalculator -> ToolLayoutFamily.CALCULATOR
                EnvironmentFamily.GraphTool -> ToolLayoutFamily.GRAPH
                EnvironmentFamily.ConverterTool -> ToolLayoutFamily.CONVERTER
                EnvironmentFamily.TextAnalyzer -> ToolLayoutFamily.TEXT
                EnvironmentFamily.MatrixTool, EnvironmentFamily.VectorTool, EnvironmentFamily.StatisticsTool -> ToolLayoutFamily.STRUCTURED
                else -> ToolLayoutFamily.FORMULA
            }
            val subjectToken = tool.subject.wireName.lowercase().replace(Regex("[^a-z0-9]+"), ".").trim('.')
            val refs = if (tool.sourceRefs.isNotEmpty()) tool.sourceRefs else if (tool.id.startsWith("physics-g") || "-v4-" in tool.id) {
                setOf("V4_ORIGINAL_MISSION", "V4_DETERMINISTIC_CATALOG")
            } else {
                setOf("BACKEND_1_1_VERIFIED_BASELINE")
            }
            return tool.copy(
                inputSchema = tool.inputSchema.map { field ->
                    field.copy(symbol = field.symbol ?: field.id, dimension = field.dimension ?: field.unitCategory)
                },
                iconKey = if (tool.iconKey == "tool.generic") "subject.$subjectToken" else tool.iconKey,
                educationLevels = levels,
                calculationMethod = method,
                exactnessCapability = exactness,
                presentationEnvironmentKey = tool.presentationEnvironmentKey.ifBlank { tool.environmentFamily.name },
                layoutFamily = layout,
                sourceRefs = refs
            )
        }
    }
}

private object SpecialToolCatalog {
    private fun exprField(id: String = "expression", label: String = "Expression") =
        InputFieldDefinition(id, label, kind = InputKind.EXPRESSION, placeholder = "2 + 2")

    fun tools(): List<ToolDefinition> = listOf(
        ToolDefinition(
            id = "standard-calculator", title = "Standard Calculator", subject = Subject.MATH,
            category = "Arithmetic", topic = "General calculation", description = "Deterministic everyday arithmetic calculator.",
            aliases = setOf("calculator", "basic calculator", "standard"), keywords = setOf("add", "subtract", "multiply", "divide", "percent"),
            environmentFamily = EnvironmentFamily.StandardCalculator, executorKind = ToolExecutorKind.EXPRESSION,
            inputSchema = listOf(exprField()), outputSchema = listOf(OutputFieldDefinition("result", "Result")),
            keypadCapabilities = setOf("digits", "decimal", "operators", "percent", "parentheses", "backspace"),
            supportsWidget = true, supportedWidgetSizes = WidgetSize.entries.toSet(), supportsFloatingCompactMode = true
        ),
        ToolDefinition(
            id = "scientific-calculator", title = "Scientific Calculator", subject = Subject.MATH,
            category = "Scientific", topic = "Scientific calculation", description = "Scientific functions, powers, roots, logs and trigonometry.",
            aliases = setOf("scientific", "sci calc"), keywords = setOf("sin", "cos", "tan", "log", "ln", "root", "factorial"),
            environmentFamily = EnvironmentFamily.ScientificCalculator, executorKind = ToolExecutorKind.EXPRESSION,
            inputSchema = listOf(exprField()), outputSchema = listOf(OutputFieldDefinition("result", "Result")),
            keypadCapabilities = setOf("scientific-functions", "angle-mode", "constants", "powers", "roots"),
            supportsWidget = true, supportedWidgetSizes = setOf(WidgetSize.MEDIUM, WidgetSize.LARGE), supportsFloatingCompactMode = true
        ),
        ToolDefinition(
            id = "programmer-calculator", title = "Programmer Calculator", subject = Subject.COMPUTER,
            category = "Programmer", topic = "Integer bases and bitwise operations", description = "BIN/OCT/DEC/HEX and deterministic bitwise integer operations.",
            aliases = setOf("binary calculator", "hex calculator", "bitwise calculator"), keywords = setOf("bin", "oct", "dec", "hex", "shift", "xor"),
            environmentFamily = EnvironmentFamily.ProgrammerCalculator, executorKind = ToolExecutorKind.PROGRAMMER,
            inputSchema = listOf(InputFieldDefinition("expression", "Programmer expression", InputKind.EXPRESSION), InputFieldDefinition("bitWidth", "Word width", InputKind.SELECT, required = false, options = listOf("8", "16", "32", "64")), InputFieldDefinition("signedness", "Signedness", InputKind.SELECT, required = false, options = listOf("signed", "unsigned"))),
            outputSchema = listOf(OutputFieldDefinition("result", "Result", OutputKind.STRUCTURED)),
            keypadCapabilities = setOf("hex-digits", "bitwise", "base-selector", "word-width", "signedness"),
            supportsWidget = true, supportedWidgetSizes = setOf(WidgetSize.MEDIUM, WidgetSize.LARGE), supportsFloatingCompactMode = true
        ),
        ToolDefinition(
            id = "quadratic-solver", title = "Quadratic Equation Solver", shortTitle = "Quadratic Solver", subject = Subject.MATH,
            category = "Algebra", topic = "Quadratic equations", description = "Solve a*x² + b*x + c = d from structured coefficients.",
            aliases = setOf("quadratic", "quadratic roots", "second degree equation"), commonMisspellings = setOf("qudratic", "quadtratic"),
            keywords = setOf("x2", "roots", "equation", "coefficient"), environmentFamily = EnvironmentFamily.EquationSolver,
            executorKind = ToolExecutorKind.POLYNOMIAL,
            inputSchema = coefficientFields(2), outputSchema = listOf(OutputFieldDefinition("roots", "Roots", OutputKind.ROOTS), OutputFieldDefinition("discriminant", "Discriminant")),
            validationRules = listOf("Leading coefficient must be non-zero"), relatedToolIds = setOf("discriminant", "vieta", "polynomial-roots"),
            supportsWidget = true, supportedWidgetSizes = setOf(WidgetSize.MEDIUM, WidgetSize.LARGE), supportsFloatingCompactMode = true
        ),
        ToolDefinition(
            id = "cubic-solver", title = "Cubic Equation Solver", subject = Subject.MATH, category = "Algebra", topic = "Cubic equations",
            description = "Solve a*x³ + b*x² + c*x + d = e from structured coefficients.", aliases = setOf("cubic", "third degree equation"),
            environmentFamily = EnvironmentFamily.PolynomialSolver, executorKind = ToolExecutorKind.POLYNOMIAL,
            inputSchema = coefficientFields(3), outputSchema = listOf(OutputFieldDefinition("roots", "Roots", OutputKind.ROOTS)), validationRules = listOf("Leading coefficient must be non-zero")
        ),
        ToolDefinition(
            id = "quartic-solver", title = "Quartic Equation Solver", subject = Subject.MATH, category = "Algebra", topic = "Quartic equations",
            description = "Solve a*x⁴ + b*x³ + c*x² + d*x + e = f from structured coefficients.", aliases = setOf("quartic", "fourth degree equation"),
            environmentFamily = EnvironmentFamily.PolynomialSolver, executorKind = ToolExecutorKind.POLYNOMIAL,
            inputSchema = coefficientFields(4), outputSchema = listOf(OutputFieldDefinition("roots", "Roots", OutputKind.ROOTS)), validationRules = listOf("Leading coefficient must be non-zero")
        ),
        ToolDefinition(
            id = "polynomial-roots", title = "Polynomial Roots", subject = Subject.MATH, category = "Algebra", topic = "Polynomials",
            description = "Find complex-capable numerical roots for a polynomial from highest-degree coefficients.", aliases = setOf("roots of polynomial", "higher degree solver"),
            environmentFamily = EnvironmentFamily.PolynomialSolver, executorKind = ToolExecutorKind.POLYNOMIAL,
            inputSchema = listOf(InputFieldDefinition("coefficients", "Coefficients", InputKind.DATASET, placeholder = "1, -3, 2")),
            outputSchema = listOf(OutputFieldDefinition("roots", "Roots", OutputKind.ROOTS)), relatedToolIds = setOf("quadratic-solver", "polynomial-division")
        ),
        ToolDefinition(
            id = "discriminant", title = "Discriminant", subject = Subject.MATH, category = "Algebra", topic = "Quadratic equations",
            description = "Calculate Δ = b² - 4ac and classify quadratic roots.", aliases = setOf("delta", "quadratic discriminant"),
            environmentFamily = EnvironmentFamily.EquationSolver, executorKind = ToolExecutorKind.POLYNOMIAL,
            inputSchema = listOf(num("a", "a"), num("b", "b"), num("c", "c")), outputSchema = listOf(OutputFieldDefinition("discriminant", "Discriminant"), OutputFieldDefinition("classification", "Root classification", OutputKind.TEXT)),
            formulaDefinition = FormulaDefinition("Δ = b² - 4ac", mapOf("discriminant" to "b^2-4*a*c")), relatedToolIds = setOf("quadratic-solver", "vieta"),
            supportsWidget = true, supportedWidgetSizes = setOf(WidgetSize.SMALL, WidgetSize.MEDIUM)
        ),
        ToolDefinition(
            id = "vieta", title = "Vieta's Formulas", shortTitle = "Vieta", subject = Subject.MATH, category = "Algebra", topic = "Quadratic equations",
            description = "Compute root sum and product from a quadratic equation.", aliases = setOf("vieta", "viet", "viyet", "viets theorem"), commonMisspellings = setOf("viyet", "vietta", "biyt", "viyeta"),
            environmentFamily = EnvironmentFamily.EquationSolver, executorKind = ToolExecutorKind.POLYNOMIAL,
            inputSchema = listOf(num("a", "a"), num("b", "b"), num("c", "c")),
            outputSchema = listOf(OutputFieldDefinition("sum", "x₁ + x₂"), OutputFieldDefinition("product", "x₁ × x₂")),
            relatedToolIds = setOf("quadratic-solver", "discriminant"), supportsWidget = true, supportedWidgetSizes = setOf(WidgetSize.SMALL, WidgetSize.MEDIUM)
        ),
        ToolDefinition(
            id = "polynomial-division", title = "Polynomial Division", subject = Subject.MATH, category = "Algebra", topic = "Polynomials",
            description = "Divide one polynomial by another and return quotient and remainder.", aliases = setOf("long polynomial division"),
            environmentFamily = EnvironmentFamily.PolynomialSolver, executorKind = ToolExecutorKind.POLYNOMIAL,
            inputSchema = listOf(InputFieldDefinition("dividend", "Dividend coefficients", InputKind.DATASET), InputFieldDefinition("divisor", "Divisor coefficients", InputKind.DATASET)),
            outputSchema = listOf(OutputFieldDefinition("quotient", "Quotient", OutputKind.DATASET), OutputFieldDefinition("remainder", "Remainder", OutputKind.DATASET))
        ),
        ToolDefinition(
            id = "linear-equation", title = "Linear Equation Solver", subject = Subject.MATH, category = "Algebra", topic = "Linear equations",
            description = "Solve a*x + b = rhs using structured coefficient slots.", aliases = setOf("linear equation", "first degree equation"),
            environmentFamily = EnvironmentFamily.EquationSolver, executorKind = ToolExecutorKind.POLYNOMIAL,
            inputSchema = listOf(num("a", "a"), num("b", "b"), num("rhs", "Right side", required = false)), outputSchema = listOf(OutputFieldDefinition("root", "x"))
        ),
        ToolDefinition(
            id = "linear-inequality", title = "Linear Inequality Solver", subject = Subject.MATH, category = "Algebra", topic = "Inequalities",
            description = "Solve a*x + b <, <=, >, or >= rhs with sign reversal handled deterministically.", aliases = setOf("inequality", "linear inequality"),
            environmentFamily = EnvironmentFamily.EquationSolver, executorKind = ToolExecutorKind.MATH_UTILITY,
            inputSchema = listOf(num("a", "a"), num("b", "b"), InputFieldDefinition("operator", "Operator", InputKind.SELECT, options=listOf("<","<=",">",">=")), num("rhs", "Right side")), outputSchema = listOf(OutputFieldDefinition("solution", "Solution", OutputKind.TEXT))
        ),
        ToolDefinition(
            id = "linear-system", title = "System of Linear Equations", subject = Subject.MATH, category = "Algebra", topic = "Systems of equations",
            description = "Solve arbitrary-size linear systems within safe limits. Separate equations with semicolons.", aliases = setOf("simultaneous equations", "linear system"),
            environmentFamily = EnvironmentFamily.EquationSolver, executorKind = ToolExecutorKind.EXPRESSION,
            inputSchema = listOf(InputFieldDefinition("expression", "Equations", InputKind.TEXT, placeholder="2x+y=5; x-y=1")), outputSchema = listOf(OutputFieldDefinition("solution", "Solution", OutputKind.STRUCTURED))
        ),
        ToolDefinition(
            id = "complex-calculator", title = "Complex Number Calculator", subject = Subject.MATH, category = "Complex Numbers", topic = "Complex arithmetic",
            description = "Complex arithmetic, magnitude, phase, conjugate, powers and roots supported by the deterministic complex engine.", aliases = setOf("complex numbers", "imaginary numbers"),
            environmentFamily = EnvironmentFamily.FormulaSolver, executorKind = ToolExecutorKind.EXPRESSION,
            inputSchema = listOf(InputFieldDefinition("expression", "Complex expression", InputKind.EXPRESSION, placeholder="(2+3i)*(1-i)")), outputSchema = listOf(OutputFieldDefinition("result", "Result", OutputKind.STRUCTURED))
        ),
        ToolDefinition(
            id = "triangle-solver", title = "Triangle Solver", subject = Subject.GEOMETRY, category = "Triangle", topic = "Side and angle solving",
            description = "Solve SSS, SAS, ASA/AAS and SSA triangles with explicit ambiguity reporting.", aliases = setOf("solve triangle", "triangle sides angles"),
            environmentFamily = EnvironmentFamily.GeometryTool, executorKind = ToolExecutorKind.GEOMETRY,
            inputSchema = listOf(num("a","Side a",required=false),num("b","Side b",required=false),num("c","Side c",required=false),num("A","Angle A (degrees)",required=false),num("B","Angle B (degrees)",required=false),num("C","Angle C (degrees)",required=false)),
            outputSchema = listOf(OutputFieldDefinition("solution","Triangle",OutputKind.STRUCTURED)), supportsWidget=true, supportedWidgetSizes=setOf(WidgetSize.MEDIUM,WidgetSize.LARGE)
        ),
        ToolDefinition(
            id = "matrix-tool", title = "Matrix Calculator", subject = Subject.MATH, category = "Linear Algebra", topic = "Matrices",
            description = "Matrix arithmetic, determinant, inverse, rank and linear systems.", aliases = setOf("matrix", "determinant", "inverse matrix"),
            environmentFamily = EnvironmentFamily.MatrixTool, executorKind = ToolExecutorKind.MATRIX,
            inputSchema = listOf(InputFieldDefinition("operation", "Operation", InputKind.SELECT, options = listOf("add", "subtract", "multiply", "transpose", "determinant", "inverse", "rank", "solve")), InputFieldDefinition("a", "Matrix A", InputKind.MATRIX), InputFieldDefinition("b", "Matrix/Vector B", InputKind.MATRIX, required = false)),
            outputSchema = listOf(OutputFieldDefinition("result", "Result", OutputKind.MATRIX))
        ),
        ToolDefinition(
            id = "vector-tool", title = "Vector Calculator", subject = Subject.MATH, category = "Linear Algebra", topic = "Vectors",
            description = "Vector magnitude, dot, cross, angle and projection.", aliases = setOf("vectors", "dot product", "cross product"),
            environmentFamily = EnvironmentFamily.VectorTool, executorKind = ToolExecutorKind.VECTOR,
            inputSchema = listOf(InputFieldDefinition("operation", "Operation", InputKind.SELECT, options = listOf("magnitude", "dot", "cross", "angle", "projection")), InputFieldDefinition("a", "Vector A", InputKind.VECTOR), InputFieldDefinition("b", "Vector B", InputKind.VECTOR, required = false)),
            outputSchema = listOf(OutputFieldDefinition("result", "Result", OutputKind.VECTOR))
        ),
        ToolDefinition(
            id = "calculus-tool", title = "Calculus Tool", subject = Subject.MATH, category = "Calculus", topic = "Differentiation and integration",
            description = "Supported symbolic and numerical differentiation/integration.", aliases = setOf("derivative", "integral", "calculus"),
            environmentFamily = EnvironmentFamily.CalculusTool, executorKind = ToolExecutorKind.CALCULUS,
            inputSchema = listOf(InputFieldDefinition("operation", "Operation", InputKind.SELECT, options = listOf("differentiate", "integrate", "numerical derivative", "numerical integral")), exprField(), num("from", "From", required = false), num("to", "To", required = false), num("at", "At", required = false)),
            outputSchema = listOf(OutputFieldDefinition("result", "Result", OutputKind.STRUCTURED))
        ),
        ToolDefinition(
            id = "statistics-dataset", title = "Statistics Dataset", subject = Subject.STATISTICS, category = "Descriptive Statistics", topic = "Dataset summaries",
            description = "Mean, median, mode, range, variance, standard deviation and quantiles.", aliases = setOf("statistics", "stats", "standard deviation"),
            environmentFamily = EnvironmentFamily.StatisticsTool, executorKind = ToolExecutorKind.STATISTICS,
            inputSchema = listOf(InputFieldDefinition("data", "Dataset", InputKind.DATASET), InputFieldDefinition("operation", "Operation", InputKind.SELECT, options = listOf("summary", "mean", "median", "mode", "range", "weighted mean", "variance", "stddev", "percentile")), num("percentile", "Percentile", required = false)),
            outputSchema = listOf(OutputFieldDefinition("result", "Result", OutputKind.STRUCTURED)), supportsWidget = true, supportedWidgetSizes = setOf(WidgetSize.MEDIUM, WidgetSize.LARGE)
        ),
        ToolDefinition(
            id = "molar-mass", title = "Molar Mass", subject = Subject.CHEMISTRY, category = "Amount of Substance", topic = "Chemical formulas",
            description = "Calculate molar mass from a supported chemical formula using the versioned local atomic-mass dataset.", aliases = setOf("molecular weight", "formula mass"),
            environmentFamily = EnvironmentFamily.FormulaSolver, executorKind = ToolExecutorKind.CHEMISTRY,
            inputSchema = listOf(InputFieldDefinition("formula", "Chemical formula", InputKind.TEXT, placeholder = "H2SO4")), outputSchema = listOf(OutputFieldDefinition("molarMass", "Molar mass", canonicalUnit = "g/mol"))
        ),
        ToolDefinition(
            id = "date-difference", title = "Date Difference", subject = Subject.DATE_TIME, category = "Dates", topic = "Intervals",
            description = "Calendar-safe difference between two dates.", aliases = setOf("days between dates", "date interval"),
            environmentFamily = EnvironmentFamily.DateTimeTool, executorKind = ToolExecutorKind.DATE_TIME,
            inputSchema = listOf(InputFieldDefinition("start", "Start date", InputKind.DATE), InputFieldDefinition("end", "End date", InputKind.DATE)),
            outputSchema = listOf(OutputFieldDefinition("days", "Total days"), OutputFieldDefinition("calendar", "Calendar period", OutputKind.TEXT))
        ),
        ToolDefinition(
            id = "date-add-duration", title = "Add / Subtract Duration", subject = Subject.DATE_TIME, category = "Dates", topic = "Calendar arithmetic",
            description = "Add or subtract years, months and days using calendar-safe arithmetic.", aliases = setOf("add days", "date calculator"),
            environmentFamily = EnvironmentFamily.DateTimeTool, executorKind = ToolExecutorKind.DATE_TIME,
            inputSchema = listOf(InputFieldDefinition("date", "Date", InputKind.DATE), InputFieldDefinition("years", "Years", InputKind.INTEGER, required = false), InputFieldDefinition("months", "Months", InputKind.INTEGER, required = false), InputFieldDefinition("days", "Days", InputKind.INTEGER, required = false)),
            outputSchema = listOf(OutputFieldDefinition("date", "Result date", OutputKind.TEXT))
        ),
        ToolDefinition(
            id = "age-calculator", title = "Age Calculator", subject = Subject.DATE_TIME, category = "Dates", topic = "Age",
            description = "Calendar-safe age between birth date and reference date.", aliases = setOf("age", "how old"),
            environmentFamily = EnvironmentFamily.DateTimeTool, executorKind = ToolExecutorKind.DATE_TIME,
            inputSchema = listOf(InputFieldDefinition("birthDate", "Birth date", InputKind.DATE), InputFieldDefinition("onDate", "Reference date", InputKind.DATE)),
            outputSchema = listOf(OutputFieldDefinition("age", "Age", OutputKind.TEXT))
        ),
        ToolDefinition(
            id = "text-analyzer", title = "Text Analyzer", subject = Subject.TEXT_LANGUAGE, category = "Text", topic = "Counts and language metadata",
            description = "Analyze recognized or entered text without generative AI.", aliases = setOf("word counter", "character counter", "text scanner"),
            environmentFamily = EnvironmentFamily.TextAnalyzer, executorKind = ToolExecutorKind.TEXT_ANALYZER,
            inputSchema = listOf(InputFieldDefinition("text", "Text", InputKind.TEXT)),
            outputSchema = listOf(OutputFieldDefinition("characters", "Characters"), OutputFieldDefinition("charactersNoSpaces", "Characters excluding spaces"), OutputFieldDefinition("words", "Words"), OutputFieldDefinition("sentences", "Sentences"), OutputFieldDefinition("paragraphs", "Paragraphs")),
            historyPolicy = HistoryPolicy.SAVE_SUMMARY_ONLY, supportsWidget = false
        ),
        ToolDefinition(
            id = "graph-functions", title = "Graph", subject = Subject.MATH, category = "Graphing", topic = "Functions and conics",
            description = "Professional graph engine for multiple functions, roots, intersections and extrema.", aliases = setOf("graphing calculator", "function graph"),
            environmentFamily = EnvironmentFamily.GraphTool, executorKind = ToolExecutorKind.GRAPH,
            inputSchema = listOf(InputFieldDefinition("expressions", "Functions", InputKind.TEXT, placeholder = "x^2; sin(x)")),
            outputSchema = listOf(OutputFieldDefinition("graph", "Graph data", OutputKind.GRAPH)),
            graphDefinition = GraphDefinition("function", listOf("expressions")), supportsWidget = true, supportedWidgetSizes = setOf(WidgetSize.SMALL, WidgetSize.MEDIUM, WidgetSize.LARGE)
        )
    )

    private fun coefficientFields(degree: Int): List<InputFieldDefinition> {
        val count = degree + 1
        val letters = (0 until count).map { ('a'.code + it).toChar().toString() }
        return letters.mapIndexed { index, id ->
            InputFieldDefinition(id, "Coefficient $id", InputKind.NUMBER, min = null, allowNegative = true)
        } + InputFieldDefinition("rhs", "Right-hand side", InputKind.NUMBER, required = false, placeholder = "0")
    }

    private fun num(id: String, label: String, required: Boolean = true) = InputFieldDefinition(id, label, InputKind.NUMBER, required = required)
}
