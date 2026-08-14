package com.veltrix.calculator.core

internal object V4ChemistryExpansion {
    fun tools(): List<ToolDefinition> = listOf(
        v4FormulaTool(
            "chem-v4-particles-moles", "Particles and Amount of Substance", Subject.CHEMISTRY,
            "Chemistry Expansion", "Amount of substance", "N = n*NA",
            mapOf("N" to "n*6.02214076e23", "n" to "N/6.02214076e23"),
            listOf(v4Field("N", "Particle count", min = 0.0, allowNegative = false), v4Field("n", "Amount", "mol", min = 0.0, allowNegative = false))
        ),
        v4FormulaTool(
            "chem-v4-partial-pressure", "Dalton Partial Pressure", Subject.CHEMISTRY,
            "Chemistry Expansion", "Gas mixtures", "Pi = xi*Ptotal",
            mapOf("Pi" to "xi*Ptotal", "xi" to "Pi/Ptotal", "Ptotal" to "Pi/xi"),
            listOf(v4Field("Pi", "Partial pressure", "Pa", "Pressure", 0.0, allowNegative = false), v4Field("xi", "Mole fraction", min = 0.0, max = 1.0, allowNegative = false), v4Field("Ptotal", "Total pressure", "Pa", "Pressure", 0.0, allowNegative = false))
        ),
        v4FormulaTool(
            "chem-v4-calorimetry", "Calorimetry", Subject.CHEMISTRY,
            "Chemistry Expansion", "Thermochemistry", "q = m*c*dT",
            mapOf("q" to "m*c*dT", "m" to "q/(c*dT)", "c" to "q/(m*dT)", "dT" to "q/(m*c)"),
            listOf(v4Field("q", "Heat", "J", "Energy"), v4Field("m", "Mass", "g", "Mass", 0.0, allowNegative = false), v4Field("c", "Specific heat capacity", "J/(g*K)", min = 0.0, allowNegative = false), v4Field("dT", "Temperature change", "K", "Temperature"))
        ),
        v4FormulaTool(
            "chem-v4-poh", "pOH from Hydroxide Concentration", Subject.CHEMISTRY,
            "Chemistry Expansion", "Acid-base", "pOH = -log10(OH)",
            mapOf("pOH" to "-log10(OH)", "OH" to "10^(-pOH)"),
            listOf(v4Field("pOH", "pOH", min = 0.0, max = 14.0, allowNegative = false), v4Field("OH", "Hydroxide concentration", "mol/L", min = 1e-14, max = 1.0, allowNegative = false))
        ),
        v4FormulaTool(
            "chem-v4-ph-poh", "pH and pOH Relation", Subject.CHEMISTRY,
            "Chemistry Expansion", "Acid-base", "pH + pOH = 14",
            mapOf("pH" to "14-pOH", "pOH" to "14-pH"),
            listOf(v4Field("pH", "pH", min = 0.0, max = 14.0, allowNegative = false), v4Field("pOH", "pOH", min = 0.0, max = 14.0, allowNegative = false))
        ),
        v4FormulaTool(
            "chem-v4-faraday-electrolysis", "Faraday Electrolysis Mass", Subject.CHEMISTRY,
            "Chemistry Expansion", "Electrochemistry", "m = I*t*M/(z*F)",
            mapOf("m" to "I*t*M/(z*96485.33212)", "I" to "m*z*96485.33212/(t*M)", "t" to "m*z*96485.33212/(I*M)", "M" to "m*z*96485.33212/(I*t)", "z" to "I*t*M/(m*96485.33212)"),
            listOf(v4Field("m", "Deposited mass", "g", "Mass", 0.0, allowNegative = false), v4Field("I", "Current", "A", "Current", 0.0, allowNegative = false), v4Field("t", "Time", "s", "Time", 0.0, allowNegative = false), v4Field("M", "Molar mass", "g/mol", min = 0.0, allowNegative = false), v4Field("z", "Electron number", min = 1.0, allowNegative = false))
        ),
        v4FormulaTool(
            "chem-v4-osmotic-pressure", "Osmotic Pressure", Subject.CHEMISTRY,
            "Chemistry Expansion", "Solutions", "Pi = M*R*T",
            mapOf("Pi" to "M*8.314462618*T", "M" to "Pi/(8.314462618*T)", "T" to "Pi/(M*8.314462618)"),
            listOf(v4Field("Pi", "Osmotic pressure", "Pa", "Pressure", 0.0, allowNegative = false), v4Field("M", "Molar concentration", "mol/m3", min = 0.0, allowNegative = false), v4Field("T", "Absolute temperature", "K", "Temperature", 0.0, allowNegative = false))
        ),
        v4FormulaTool(
            "chem-v4-first-order-rate", "First-Order Reaction Rate", Subject.CHEMISTRY,
            "Chemistry Expansion", "Kinetics", "rate = k*C",
            mapOf("rate" to "k*C", "k" to "rate/C", "C" to "rate/k"),
            listOf(v4Field("rate", "Reaction rate", "mol/(L*s)", min = 0.0, allowNegative = false), v4Field("k", "Rate constant", "1/s", min = 0.0, allowNegative = false), v4Field("C", "Concentration", "mol/L", min = 0.0, allowNegative = false))
        )
    )
}
