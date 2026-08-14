package com.veltrix.calculator.core

internal object V4PhysicsExpansion {
    fun tools(): List<ToolDefinition> = listOf(
        v4FormulaTool(
            "physics-g9-v4-gay-lussac", "Gay-Lussac Pressure–Temperature Law", Subject.PHYSICS,
            "Grade 9 Physics", "Gas laws", "P1/T1 = P2/T2",
            mapOf("P1" to "P2*T1/T2", "T1" to "P1*T2/P2", "P2" to "P1*T2/T1", "T2" to "P2*T1/P1"),
            listOf(
                v4Field("P1", "Initial pressure", "Pa", "Pressure", 0.0, allowNegative = false),
                v4Field("T1", "Initial absolute temperature", "K", "Temperature", 0.0, allowNegative = false),
                v4Field("P2", "Final pressure", "Pa", "Pressure", 0.0, allowNegative = false),
                v4Field("T2", "Final absolute temperature", "K", "Temperature", 0.0, allowNegative = false)
            ), setOf("grade9", "thermal")
        ),
        v4FormulaTool(
            "physics-g9-v4-first-law", "First Law of Thermodynamics", Subject.PHYSICS,
            "Grade 9 Physics", "Thermodynamics", "dU = Q - W",
            mapOf("dU" to "Q-W", "Q" to "dU+W", "W" to "Q-dU"),
            listOf(v4Field("dU", "Internal-energy change", "J", "Energy"), v4Field("Q", "Heat added", "J", "Energy"), v4Field("W", "Work done by system", "J", "Energy")),
            setOf("grade9", "thermal")
        ),
        v4FormulaTool(
            "physics-g9-v4-heat-engine-efficiency", "Heat Engine Efficiency", Subject.PHYSICS,
            "Grade 9 Physics", "Thermodynamics", "eta = W/Qh*100",
            mapOf("eta" to "W/Qh*100", "W" to "eta*Qh/100", "Qh" to "W*100/eta"),
            listOf(v4Field("eta", "Efficiency", "%", min = 0.0, max = 100.0, allowNegative = false), v4Field("W", "Useful work", "J", "Energy", 0.0, allowNegative = false), v4Field("Qh", "Input heat", "J", "Energy", 0.0, allowNegative = false)),
            setOf("grade9", "thermal")
        ),
        v4FormulaTool(
            "physics-g9-v4-mirror-equation", "Spherical Mirror Equation", Subject.PHYSICS,
            "Grade 9 Physics", "Geometric optics", "1/f = 1/do + 1/di",
            mapOf("f" to "do*di/(do+di)", "do" to "f*di/(di-f)", "di" to "f*do/(do-f)"),
            listOf(v4Field("f", "Focal length", "m", "Length"), v4Field("do", "Object distance", "m", "Length"), v4Field("di", "Image distance", "m", "Length")),
            setOf("grade9", "optics")
        ),
        v4FormulaTool(
            "physics-g9-v4-sound-level", "Sound Intensity Level", Subject.PHYSICS,
            "Grade 9 Physics", "Sound", "beta = 10*log10(I/1e-12)",
            mapOf("beta" to "10*log10(I/1e-12)", "I" to "1e-12*10^(beta/10)"),
            listOf(v4Field("beta", "Sound level", "dB"), v4Field("I", "Sound intensity", "W/m2", min = 1e-20, allowNegative = false)),
            setOf("grade9", "waves")
        ),
        v4FormulaTool(
            "physics-g10-v4-angular-speed", "Tangential and Angular Speed", Subject.PHYSICS,
            "Grade 10 Physics", "Rotation", "v = omega*r",
            mapOf("v" to "omega*r", "omega" to "v/r", "r" to "v/omega"),
            listOf(v4Field("v", "Tangential speed", "m/s", "Speed"), v4Field("omega", "Angular speed", "rad/s"), v4Field("r", "Radius", "m", "Length", 0.0, allowNegative = false)),
            setOf("grade10", "rotation")
        ),
        v4FormulaTool(
            "physics-g10-v4-rotational-ke", "Rotational Kinetic Energy", Subject.PHYSICS,
            "Grade 10 Physics", "Rotation", "K = I*omega^2/2",
            mapOf("K" to "I*omega^2/2", "I" to "2*K/omega^2", "omega" to "sqrt(2*K/I)"),
            listOf(v4Field("K", "Rotational kinetic energy", "J", "Energy", 0.0, allowNegative = false), v4Field("I", "Moment of inertia", "kg*m2", min = 0.0, allowNegative = false), v4Field("omega", "Angular speed", "rad/s", min = 0.0, allowNegative = false)),
            setOf("grade10", "rotation")
        ),
        v4FormulaTool(
            "physics-g10-v4-rotational-torque", "Rotational Dynamics", Subject.PHYSICS,
            "Grade 10 Physics", "Rotation", "tau = I*alpha",
            mapOf("tau" to "I*alpha", "I" to "tau/alpha", "alpha" to "tau/I"),
            listOf(v4Field("tau", "Torque", "N*m", "Torque"), v4Field("I", "Moment of inertia", "kg*m2", min = 0.0, allowNegative = false), v4Field("alpha", "Angular acceleration", "rad/s2")),
            setOf("grade10", "rotation")
        ),
        v4FormulaTool(
            "physics-g10-v4-angular-momentum", "Angular Momentum", Subject.PHYSICS,
            "Grade 10 Physics", "Rotation", "L = I*omega",
            mapOf("L" to "I*omega", "I" to "L/omega", "omega" to "L/I"),
            listOf(v4Field("L", "Angular momentum", "kg*m2/s"), v4Field("I", "Moment of inertia", "kg*m2", min = 0.0, allowNegative = false), v4Field("omega", "Angular speed", "rad/s")),
            setOf("grade10", "rotation")
        ),
        v4FormulaTool(
            "physics-g10-v4-angular-power", "Rotational Power", Subject.PHYSICS,
            "Grade 10 Physics", "Rotation", "P = tau*omega",
            mapOf("P" to "tau*omega", "tau" to "P/omega", "omega" to "P/tau"),
            listOf(v4Field("P", "Power", "W", "Power"), v4Field("tau", "Torque", "N*m", "Torque"), v4Field("omega", "Angular speed", "rad/s")),
            setOf("grade10", "rotation")
        ),
        v4FormulaTool(
            "physics-g11-v4-radioactive-activity", "Radioactive Activity", Subject.PHYSICS,
            "Grade 11 Physics", "Nuclear physics", "A = lambda*N",
            mapOf("A" to "lambda*N", "lambda" to "A/N", "N" to "A/lambda"),
            listOf(v4Field("A", "Activity", "Bq", min = 0.0, allowNegative = false), v4Field("lambda", "Decay constant", "1/s", min = 0.0, allowNegative = false), v4Field("N", "Undecayed nuclei", min = 0.0, allowNegative = false)),
            setOf("grade11", "advanced", "nuclear")
        ),
        v4FormulaTool(
            "physics-g11-v4-photon-momentum", "Photon Momentum", Subject.PHYSICS,
            "Grade 11 Physics", "Quantum physics", "p = h/lambda",
            mapOf("p" to "6.62607015e-34/lambda", "lambda" to "6.62607015e-34/p"),
            listOf(v4Field("p", "Photon momentum", "kg*m/s", min = 0.0, allowNegative = false), v4Field("lambda", "Wavelength", "m", "Length", 0.0, allowNegative = false)),
            setOf("grade11", "advanced", "quantum")
        ),
        v4FormulaTool(
            "physics-g11-v4-magnetic-charge-force", "Magnetic Force on Moving Charge", Subject.PHYSICS,
            "Grade 11 Physics", "Magnetism", "F = q*v*B",
            mapOf("F" to "q*v*B", "q" to "F/(v*B)", "v" to "F/(q*B)", "B" to "F/(q*v)"),
            listOf(v4Field("F", "Force magnitude", "N", "Force", 0.0, allowNegative = false), v4Field("q", "Charge magnitude", "coulomb", "Charge", 0.0, allowNegative = false), v4Field("v", "Speed perpendicular to field", "m/s", "Speed", 0.0, allowNegative = false), v4Field("B", "Magnetic flux density", "T", min = 0.0, allowNegative = false)),
            setOf("grade11", "magnetism")
        ),
        v4FormulaTool(
            "physics-g11-v4-magnetic-wire-force", "Magnetic Force on Current-Carrying Wire", Subject.PHYSICS,
            "Grade 11 Physics", "Magnetism", "F = B*I*L",
            mapOf("F" to "B*I*L", "B" to "F/(I*L)", "I" to "F/(B*L)", "L" to "F/(B*I)"),
            listOf(v4Field("F", "Force", "N", "Force", 0.0, allowNegative = false), v4Field("B", "Magnetic flux density", "T", min = 0.0, allowNegative = false), v4Field("I", "Current", "A", "Current", 0.0, allowNegative = false), v4Field("L", "Wire length in field", "m", "Length", 0.0, allowNegative = false)),
            setOf("grade11", "magnetism")
        ),
        v4FormulaTool(
            "physics-advanced-v4-hydrostatic-pressure", "Hydrostatic Pressure", Subject.PHYSICS,
            "Advanced Physics", "Fluids", "p = rho*g*h",
            mapOf("p" to "rho*9.80665*h", "rho" to "p/(9.80665*h)", "h" to "p/(rho*9.80665)"),
            listOf(v4Field("p", "Gauge pressure", "Pa", "Pressure", 0.0, allowNegative = false), v4Field("rho", "Fluid density", "kg/m3", "Density", 0.0, allowNegative = false), v4Field("h", "Depth", "m", "Length", 0.0, allowNegative = false)),
            setOf("advanced", "college", "fluids")
        ),
        v4FormulaTool(
            "physics-advanced-v4-continuity", "Fluid Continuity Equation", Subject.PHYSICS,
            "Advanced Physics", "Fluids", "A1*v1 = A2*v2",
            mapOf("A1" to "A2*v2/v1", "v1" to "A2*v2/A1", "A2" to "A1*v1/v2", "v2" to "A1*v1/A2"),
            listOf(v4Field("A1", "Area 1", "m2", "Area", 0.0, allowNegative = false), v4Field("v1", "Speed 1", "m/s", "Speed", 0.0, allowNegative = false), v4Field("A2", "Area 2", "m2", "Area", 0.0, allowNegative = false), v4Field("v2", "Speed 2", "m/s", "Speed", 0.0, allowNegative = false)),
            setOf("advanced", "college", "fluids")
        ),
        v4FormulaTool(
            "physics-advanced-v4-relativity-gamma", "Relativistic Lorentz Factor", Subject.PHYSICS,
            "Advanced Physics", "Relativity", "gamma = 1/sqrt(1-v^2/c^2)",
            mapOf("gamma" to "1/sqrt(1-v^2/299792458^2)", "v" to "299792458*sqrt(1-1/gamma^2)"),
            listOf(v4Field("gamma", "Lorentz factor", min = 1.0, allowNegative = false), v4Field("v", "Speed", "m/s", "Speed", 0.0, 299792457.0, false)),
            setOf("advanced", "college", "relativity")
        ),
        v4FormulaTool(
            "physics-advanced-v4-buoyancy", "Archimedes Buoyant Force", Subject.PHYSICS,
            "Advanced Physics", "Fluids", "F = rho*g*V",
            mapOf("F" to "rho*9.80665*V", "rho" to "F/(9.80665*V)", "V" to "F/(rho*9.80665)"),
            listOf(v4Field("F", "Buoyant force", "N", "Force", 0.0, allowNegative = false), v4Field("rho", "Fluid density", "kg/m3", "Density", 0.0, allowNegative = false), v4Field("V", "Displaced volume", "m3", "Volume", 0.0, allowNegative = false)),
            setOf("advanced", "college", "fluids")
        )
    )
}
