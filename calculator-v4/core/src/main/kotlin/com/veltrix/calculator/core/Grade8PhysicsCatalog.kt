package com.veltrix.calculator.core

/**
 * Grade 8 Physics completion catalog for the V4 hard gate.
 *
 * These tools close formula-capable gaps left by the initial V4 additive catalog.
 * All relations are deterministic, expose every algebraically-valid target, and never
 * infer or invent missing values. Arbitrary mixed networks remain a topology problem;
 * fixed series/parallel mixed topologies are exposed explicitly.
 */
internal object Grade8PhysicsCatalog {
    const val EXPECTED_ADDITIONS = 8

    fun tools(): List<ToolDefinition> = listOf(
        formulaTool(
            id = "physics-g8-capacitors-series-two",
            title = "Series Capacitors (Two)",
            topic = "Capacitor combinations",
            display = "Ceq = C1*C2/(C1+C2)",
            rules = mapOf(
                "Ceq" to "C1*C2/(C1+C2)",
                "C1" to "Ceq*C2/(C2-Ceq)",
                "C2" to "Ceq*C1/(C1-Ceq)"
            ),
            fields = listOf(
                cap("Ceq", "Equivalent capacitance"),
                cap("C1", "Capacitance 1"),
                cap("C2", "Capacitance 2")
            ),
            tags = setOf("grade8", "electricity", "capacitors")
        ),
        formulaTool(
            id = "physics-g8-capacitors-parallel-two",
            title = "Parallel Capacitors (Two)",
            topic = "Capacitor combinations",
            display = "Ceq = C1+C2",
            rules = mapOf(
                "Ceq" to "C1+C2",
                "C1" to "Ceq-C2",
                "C2" to "Ceq-C1"
            ),
            fields = listOf(
                cap("Ceq", "Equivalent capacitance"),
                cap("C1", "Capacitance 1"),
                cap("C2", "Capacitance 2")
            ),
            tags = setOf("grade8", "electricity", "capacitors")
        ),
        formulaTool(
            id = "physics-g8-capacitors-mixed-series-parallel",
            title = "Mixed Capacitors: C1 Parallel (C2 Series C3)",
            topic = "Capacitor combinations",
            display = "Ceq = C1 + C2*C3/(C2+C3)",
            rules = mapOf(
                "Ceq" to "C1+C2*C3/(C2+C3)",
                "C1" to "Ceq-C2*C3/(C2+C3)",
                "C2" to "(Ceq-C1)*C3/(C3-(Ceq-C1))",
                "C3" to "(Ceq-C1)*C2/(C2-(Ceq-C1))"
            ),
            fields = listOf(
                cap("Ceq", "Equivalent capacitance"),
                cap("C1", "Parallel capacitance"),
                cap("C2", "Series branch capacitance 1"),
                cap("C3", "Series branch capacitance 2")
            ),
            tags = setOf("grade8", "electricity", "capacitors", "mixed-network")
        ),
        formulaTool(
            id = "physics-g8-ohms-law",
            title = "Ohm's Law",
            topic = "DC electric current",
            display = "V = I*R",
            rules = mapOf(
                "V" to "I*R",
                "I" to "V/R",
                "R" to "V/I"
            ),
            fields = listOf(
                InputFieldDefinition("V", "Voltage", canonicalUnit = "V", unitCategory = "Voltage", min = 0.0, allowNegative = false),
                InputFieldDefinition("I", "Current", canonicalUnit = "A", unitCategory = "Current", min = 0.0, allowNegative = false),
                InputFieldDefinition("R", "Resistance", canonicalUnit = "ohm", unitCategory = "Resistance", min = 1e-15, allowNegative = false)
            ),
            tags = setOf("grade8", "electricity", "ohm")
        ),
        formulaTool(
            id = "physics-g8-mixed-resistance-series-parallel",
            title = "Mixed Resistors: R1 Series (R2 Parallel R3)",
            topic = "Circuit combinations",
            display = "Req = R1 + R2*R3/(R2+R3)",
            rules = mapOf(
                "Req" to "R1+R2*R3/(R2+R3)",
                "R1" to "Req-R2*R3/(R2+R3)",
                "R2" to "(Req-R1)*R3/(R3-(Req-R1))",
                "R3" to "(Req-R1)*R2/(R2-(Req-R1))"
            ),
            fields = listOf(
                resistance("Req", "Equivalent resistance"),
                resistance("R1", "Series resistance"),
                resistance("R2", "Parallel branch resistance 1"),
                resistance("R3", "Parallel branch resistance 2")
            ),
            tags = setOf("grade8", "electricity", "resistors", "mixed-network")
        ),
        formulaTool(
            id = "physics-g8-electric-power-vi",
            title = "Electric Power",
            topic = "Electrical work and power",
            display = "P = V*I",
            rules = mapOf(
                "P" to "V*I",
                "V" to "P/I",
                "I" to "P/V"
            ),
            fields = listOf(
                InputFieldDefinition("P", "Power", canonicalUnit = "W", unitCategory = "Power", min = 0.0, allowNegative = false),
                InputFieldDefinition("V", "Voltage", canonicalUnit = "V", unitCategory = "Voltage", min = 1e-15, allowNegative = false),
                InputFieldDefinition("I", "Current", canonicalUnit = "A", unitCategory = "Current", min = 1e-15, allowNegative = false)
            ),
            tags = setOf("grade8", "electricity", "power")
        ),
        formulaTool(
            id = "physics-g8-transformer-ideal-power",
            title = "Ideal Transformer Power Conservation",
            topic = "Transformers",
            display = "Vp*Ip = Vs*Is",
            rules = mapOf(
                "Vp" to "Vs*Is/Ip",
                "Ip" to "Vs*Is/Vp",
                "Vs" to "Vp*Ip/Is",
                "Is" to "Vp*Ip/Vs"
            ),
            fields = listOf(
                InputFieldDefinition("Vp", "Primary voltage", canonicalUnit = "V", unitCategory = "Voltage", min = 1e-15, allowNegative = false),
                InputFieldDefinition("Ip", "Primary current", canonicalUnit = "A", unitCategory = "Current", min = 1e-15, allowNegative = false),
                InputFieldDefinition("Vs", "Secondary voltage", canonicalUnit = "V", unitCategory = "Voltage", min = 1e-15, allowNegative = false),
                InputFieldDefinition("Is", "Secondary current", canonicalUnit = "A", unitCategory = "Current", min = 1e-15, allowNegative = false)
            ),
            tags = setOf("grade8", "induction", "transformer", "ideal")
        ),
        formulaTool(
            id = "physics-g8-transformer-efficiency",
            title = "Transformer Efficiency",
            topic = "Transformers",
            display = "eta = Vs*Is/(Vp*Ip)*100",
            rules = mapOf(
                "eta" to "Vs*Is/(Vp*Ip)*100",
                "Vp" to "Vs*Is*100/(eta*Ip)",
                "Ip" to "Vs*Is*100/(eta*Vp)",
                "Vs" to "eta*Vp*Ip/(100*Is)",
                "Is" to "eta*Vp*Ip/(100*Vs)"
            ),
            fields = listOf(
                InputFieldDefinition("eta", "Efficiency", canonicalUnit = "%", min = 1e-12, max = 100.0, allowNegative = false),
                InputFieldDefinition("Vp", "Primary voltage", canonicalUnit = "V", unitCategory = "Voltage", min = 1e-15, allowNegative = false),
                InputFieldDefinition("Ip", "Primary current", canonicalUnit = "A", unitCategory = "Current", min = 1e-15, allowNegative = false),
                InputFieldDefinition("Vs", "Secondary voltage", canonicalUnit = "V", unitCategory = "Voltage", min = 1e-15, allowNegative = false),
                InputFieldDefinition("Is", "Secondary current", canonicalUnit = "A", unitCategory = "Current", min = 1e-15, allowNegative = false)
            ),
            tags = setOf("grade8", "induction", "transformer", "efficiency")
        )
    ).also { tools ->
        require(tools.size == EXPECTED_ADDITIONS) { "Grade 8 completion catalog size drift: ${tools.size}" }
        require(tools.map { it.id }.toSet().size == tools.size) { "Grade 8 completion tool ids must be unique" }
    }

    private fun cap(id: String, label: String) =
        InputFieldDefinition(id, label, canonicalUnit = "farad", unitCategory = "Capacitance", min = 1e-15, allowNegative = false)

    private fun resistance(id: String, label: String) =
        InputFieldDefinition(id, label, canonicalUnit = "ohm", unitCategory = "Resistance", min = 1e-15, allowNegative = false)

    private fun formulaTool(
        id: String,
        title: String,
        topic: String,
        display: String,
        rules: Map<String, String>,
        fields: List<InputFieldDefinition>,
        tags: Set<String>
    ): ToolDefinition {
        val targets = rules.keys.toSet()
        val fieldIds = fields.map { it.id }.toSet()
        require(targets.isNotEmpty() && targets.all { it in fieldIds }) { "$id solve targets must map to fields" }
        return ToolDefinition(
            id = id,
            title = title,
            subject = Subject.PHYSICS,
            category = "Grade 8 Physics",
            topic = topic,
            description = "Deterministic Grade 8 Physics solver for $display. Missing values are never guessed.",
            aliases = setOf(title.lowercase(), display.lowercase()),
            keywords = tags,
            tags = tags,
            environmentFamily = EnvironmentFamily.FormulaSolver,
            executorKind = ToolExecutorKind.FORMULA,
            inputSchema = fields,
            outputSchema = targets.map { target ->
                val field = fields.first { it.id == target }
                OutputFieldDefinition(target, field.label, OutputKind.NUMBER, field.canonicalUnit)
            },
            formulaDefinition = FormulaDefinition(
                display = display,
                solveRules = rules,
                notes = "V4 Grade 8 hard-gate deterministic relation; explicit target selection supported."
            ),
            validationRules = listOf("All declared domain constraints are enforced; required values may not be guessed."),
            supportsWidget = false,
            supportedWidgetSizes = emptySet(),
            supportsFloatingCompactMode = false,
            offlinePolicy = OfflinePolicy.OFFLINE_FULL,
            liveDataPolicy = LiveDataPolicy.NONE,
            schemaVersion = 4,
            educationLevels = setOf(EducationLevel.GRADE_8),
            sourceRefs = setOf("V4_ORIGINAL_MISSION", "UZB_G8_OFFICIAL_PORTAL_2020", "V4_GRADE8_FULL_MAP")
        )
    }
}
