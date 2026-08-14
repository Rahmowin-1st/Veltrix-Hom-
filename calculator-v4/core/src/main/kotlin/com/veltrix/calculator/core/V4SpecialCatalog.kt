package com.veltrix.calculator.core

/** Specialized deterministic tools for V4 cases that are not honest closed-form formula relations. */
internal object V4SpecialCatalog {
    const val EXPECTED_ADDITIONS = 16

    fun tools(): List<ToolDefinition> = listOf(
        tool("finance-v4-npv", "Net Present Value", Subject.FINANCE, "Finance Expansion", "Cash flow", EnvironmentFamily.FinanceTool, ToolExecutorKind.FINANCE,
            listOf(v4Field("rate", "Discount rate"), data("cashFlows", "Cash flows, t0 first")), listOf(out("npv", "NPV"))),
        tool("finance-v4-irr", "Internal Rate of Return", Subject.FINANCE, "Finance Expansion", "Cash flow", EnvironmentFamily.FinanceTool, ToolExecutorKind.FINANCE,
            listOf(data("cashFlows", "Cash flows, t0 first")), listOf(out("irr", "IRR"))),
        tool("finance-v4-amortization", "Loan Amortization Schedule", Subject.FINANCE, "Finance Expansion", "Loans", EnvironmentFamily.FinanceTool, ToolExecutorKind.FINANCE,
            listOf(v4Field("principal", "Principal", min = 0.0, allowNegative = false), v4Field("annualRate", "Annual rate percent", min = 0.0, allowNegative = false), integer("months", "Months")), listOf(out("monthlyPayment", "Monthly payment"), OutputFieldDefinition("schedule", "Schedule", OutputKind.DATASET))),

        tool("stats-v4-covariance-correlation", "Covariance and Pearson Correlation", Subject.STATISTICS, "Statistics Expansion", "Association", EnvironmentFamily.StatisticsTool, ToolExecutorKind.STATISTICS,
            listOf(data("x", "X dataset"), data("y", "Y dataset")), listOf(out("covariance", "Sample covariance"), out("correlation", "Pearson r"))),
        tool("stats-v4-linear-regression", "Simple Linear Regression", Subject.STATISTICS, "Statistics Expansion", "Regression", EnvironmentFamily.StatisticsTool, ToolExecutorKind.STATISTICS,
            listOf(data("x", "X dataset"), data("y", "Y dataset")), listOf(out("slope", "Slope"), out("intercept", "Intercept"), out("rSquared", "R squared"))),
        tool("stats-v4-binomial-probability", "Binomial Point Probability", Subject.STATISTICS, "Statistics Expansion", "Distributions", EnvironmentFamily.StatisticsTool, ToolExecutorKind.STATISTICS,
            listOf(integer("n", "Trials"), integer("k", "Successes"), v4Field("p", "Success probability", min = 0.0, max = 1.0, allowNegative = false)), listOf(out("probability", "Probability"))),
        tool("stats-v4-normal-cdf", "Normal Distribution CDF", Subject.STATISTICS, "Statistics Expansion", "Distributions", EnvironmentFamily.StatisticsTool, ToolExecutorKind.STATISTICS,
            listOf(v4Field("x", "Value"), v4Field("mu", "Mean"), v4Field("sigma", "Standard deviation", min = 0.0, allowNegative = false)), listOf(out("cdf", "P(X <= x)"), out("z", "Z-score"))),
        tool("stats-v4-chi-square", "Chi-Square Goodness of Fit", Subject.STATISTICS, "Statistics Expansion", "Inference", EnvironmentFamily.StatisticsTool, ToolExecutorKind.STATISTICS,
            listOf(data("observed", "Observed counts"), data("expected", "Expected counts")), listOf(out("chiSquare", "Chi-square"), out("degreesOfFreedom", "Degrees of freedom"))),

        tool("date-v4-weekday", "Weekday", Subject.DATE_TIME, "Date & Time Expansion", "Calendar", EnvironmentFamily.DateTimeTool, ToolExecutorKind.DATE_TIME,
            listOf(date("date", "Date")), listOf(OutputFieldDefinition("weekday", "Weekday", OutputKind.TEXT))),
        tool("date-v4-business-days", "Business Days", Subject.DATE_TIME, "Date & Time Expansion", "Calendar", EnvironmentFamily.DateTimeTool, ToolExecutorKind.DATE_TIME,
            listOf(date("start", "Start date"), date("end", "End date"), InputFieldDefinition("holidays", "Holiday dates", InputKind.TEXT, required = false, placeholder = "2026-01-01,2026-03-21")), listOf(out("businessDays", "Business days"))),
        tool("date-v4-timezone-convert", "Timezone Conversion", Subject.DATE_TIME, "Date & Time Expansion", "Time zones", EnvironmentFamily.DateTimeTool, ToolExecutorKind.DATE_TIME,
            listOf(InputFieldDefinition("localDateTime", "Local date-time", InputKind.TEXT, placeholder = "2026-08-14T10:00"), text("fromZone", "Source IANA zone"), text("toZone", "Target IANA zone")), listOf(OutputFieldDefinition("result", "Converted date-time", OutputKind.TEXT))),
        tool("date-v4-unix-timestamp", "Unix Timestamp", Subject.DATE_TIME, "Date & Time Expansion", "Unix time", EnvironmentFamily.DateTimeTool, ToolExecutorKind.DATE_TIME,
            listOf(select("mode", "Mode", listOf("fromInstant", "toInstant")), InputFieldDefinition("instant", "UTC instant", InputKind.TEXT, required = false, placeholder = "2026-08-14T05:00:00Z"), InputFieldDefinition("seconds", "Unix seconds", InputKind.INTEGER, required = false)), listOf(OutputFieldDefinition("instant", "UTC instant", OutputKind.TEXT), out("seconds", "Unix seconds"), out("milliseconds", "Unix milliseconds"))),
        tool("date-v4-duration-decompose", "Duration Decomposition", Subject.DATE_TIME, "Date & Time Expansion", "Durations", EnvironmentFamily.DateTimeTool, ToolExecutorKind.DATE_TIME,
            listOf(InputFieldDefinition("seconds", "Total seconds", InputKind.INTEGER)), listOf(out("days", "Days"), out("hours", "Hours"), out("minutes", "Minutes"), out("seconds", "Seconds"))),

        tool("text-v4-transform", "Text Case and Unicode Normalization", Subject.TEXT_LANGUAGE, "Text Expansion", "Normalization", EnvironmentFamily.TextAnalyzer, ToolExecutorKind.TEXT_ANALYZER,
            listOf(text("text", "Text"), select("operation", "Operation", listOf("lowercase", "uppercase", "title", "trim", "NFC", "NFD"))), listOf(OutputFieldDefinition("text", "Transformed text", OutputKind.TEXT))),
        tool("computer-v4-checksum", "UTF-8 Bytes and Checksums", Subject.COMPUTER, "Computer Expansion", "Encoding", EnvironmentFamily.ProgrammerCalculator, ToolExecutorKind.PROGRAMMER,
            listOf(text("text", "Text")), listOf(out("bytes", "UTF-8 bytes"), OutputFieldDefinition("crc32", "CRC32", OutputKind.TEXT), OutputFieldDefinition("sha256", "SHA-256", OutputKind.TEXT))),
        tool("chem-v4-limiting-reagent", "Two-Reactant Limiting Reagent", Subject.CHEMISTRY, "Chemistry Expansion", "Stoichiometry", EnvironmentFamily.FormulaSolver, ToolExecutorKind.CHEMISTRY,
            listOf(v4Field("nA", "Reactant A amount", "mol", min = 0.0, allowNegative = false), v4Field("coefA", "Reactant A coefficient", min = 1.0, allowNegative = false), v4Field("nB", "Reactant B amount", "mol", min = 0.0, allowNegative = false), v4Field("coefB", "Reactant B coefficient", min = 1.0, allowNegative = false)), listOf(OutputFieldDefinition("limiting", "Limiting reactant", OutputKind.TEXT), out("reactionExtent", "Reaction extent")))
    ).also { tools ->
        require(tools.size == EXPECTED_ADDITIONS)
        require(tools.map { it.id }.toSet().size == tools.size)
    }

    private fun tool(id: String, title: String, subject: Subject, category: String, topic: String, family: EnvironmentFamily, executor: ToolExecutorKind, inputs: List<InputFieldDefinition>, outputs: List<OutputFieldDefinition>) = ToolDefinition(
        id = id,
        title = title,
        subject = subject,
        category = category,
        topic = topic,
        description = "Deterministic specialized V4 tool. Inputs are validated and missing values are never guessed.",
        aliases = setOf(title.lowercase()),
        environmentFamily = family,
        executorKind = executor,
        inputSchema = inputs,
        outputSchema = outputs,
        offlinePolicy = OfflinePolicy.OFFLINE_FULL,
        liveDataPolicy = LiveDataPolicy.NONE,
        schemaVersion = 4,
        calculationMethod = CalculationMethod.SPECIALIZED_DETERMINISTIC,
        exactnessCapability = ExactnessCapability.NUMERIC,
        sourceRefs = setOf("V4_ORIGINAL_MISSION", "V4_SPECIALIZED_DETERMINISTIC")
    )

    private fun text(id: String, label: String) = InputFieldDefinition(id, label, InputKind.TEXT)
    private fun data(id: String, label: String) = InputFieldDefinition(id, label, InputKind.DATASET)
    private fun date(id: String, label: String) = InputFieldDefinition(id, label, InputKind.DATE)
    private fun integer(id: String, label: String) = InputFieldDefinition(id, label, InputKind.INTEGER)
    private fun select(id: String, label: String, options: List<String>) = InputFieldDefinition(id, label, InputKind.SELECT, options = options)
    private fun out(id: String, label: String) = OutputFieldDefinition(id, label, OutputKind.NUMBER)
}
