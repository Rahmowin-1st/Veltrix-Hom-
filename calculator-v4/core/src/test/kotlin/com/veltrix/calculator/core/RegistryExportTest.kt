package com.veltrix.calculator.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertTrue

/** Creates an auditable, deterministic registry contract during the verified test run. */
class RegistryExportTest {
    @Test
    fun exportCanonicalRegistry() {
        val registry = ToolRegistry.default()
        assertTrue(registry.all().size == ToolRegistry.EXPECTED_V4_TOOLS)
        val out = File("build/registry-export.tsv")
        out.parentFile.mkdirs()
        out.bufferedWriter().use { w ->
            w.appendLine("registrySchemaVersion\t${ToolRegistry.SCHEMA_VERSION}")
            w.appendLine("id\ttitle\tsubject\tcategory\ttopic\teducationLevels\ticonKey\tenvironmentFamily\tpresentationEnvironmentKey\tlayoutFamily\texecutorKind\tcalculationMethod\texactnessCapability\tsolveTargets\tinputs\toutputs\tformula\tvalidationRules\twidget\twidgetSizes\tcompact\tofflinePolicy\tliveDataPolicy\thistoryPolicy\tschemaVersion\tsourceRefs\tomissionReason\taliases")
            registry.all().sortedBy { it.id }.forEach { t ->
                fun clean(v: String) = v.replace('\t', ' ').replace('\n', ' ')
                val inputs = t.inputSchema.joinToString(";") { f ->
                    buildString {
                        append(f.id).append(':').append(f.kind.name)
                        append("{symbol=").append(f.symbol).append('}')
                        if (!f.required) append('?')
                        f.canonicalUnit?.let { append('[').append(it).append(']') }
                        f.dimension?.let { append("<dimension=").append(it).append('>') }
                        f.min?.let { append("<min=").append(it).append('>') }
                        f.max?.let { append("<max=").append(it).append('>') }
                        if (f.options.isNotEmpty()) append('{').append(f.options.joinToString(",")).append('}')
                    }
                }
                val outputs = t.outputSchema.joinToString(";") { "${it.id}:${it.kind.name}" }
                w.appendLine(listOf(
                    t.id, t.title, t.subject.name, t.category, t.topic,
                    t.educationLevels.sortedBy { it.name }.joinToString(",") { it.name }, t.iconKey,
                    t.environmentFamily.name, t.presentationEnvironmentKey, t.layoutFamily.name,
                    t.executorKind.name, t.calculationMethod.name, t.exactnessCapability.name,
                    t.solveTargets.sorted().joinToString(","), inputs, outputs,
                    t.formulaDefinition?.display.orEmpty(), t.validationRules.joinToString(" | "), t.supportsWidget.toString(),
                    t.supportedWidgetSizes.sortedBy { it.name }.joinToString(",") { it.name },
                    t.supportsFloatingCompactMode.toString(), t.offlinePolicy.name, t.liveDataPolicy.name,
                    t.historyPolicy.name, t.schemaVersion.toString(), t.sourceRefs.sorted().joinToString("|"),
                    t.omissionReason.orEmpty(), t.aliases.sorted().joinToString("|")
                ).joinToString("\t") { clean(it) })
            }
        }
        assertTrue(out.length() > 1000)

        File("build/subject-coverage-matrix.tsv").bufferedWriter().use { w ->
            w.appendLine("subject\ttoolCount\tformulaToolCount\tsolveTargetCount\tcategories\teducationLevels")
            Subject.entries.forEach { subject ->
                val tools = registry.bySubject(subject)
                w.appendLine(listOf(
                    subject.wireName,
                    tools.size.toString(),
                    tools.count { it.formulaDefinition != null }.toString(),
                    tools.sumOf { it.solveTargets.size }.toString(),
                    tools.map { it.category }.distinct().sorted().joinToString("|"),
                    tools.flatMap { it.educationLevels }.distinct().sortedBy { it.name }.joinToString("|") { it.name }
                ).joinToString("\t"))
            }
        }

        File("build/solve-target-matrix.tsv").bufferedWriter().use { w ->
            w.appendLine("toolId\ttarget\tsubject\tcategory\teducationLevels\texpression\tadditionalBranches\tsymbolic\tcanonicalUnit\tmethod\texactness\tconstraints\tsourceRefs")
            registry.all().sortedBy { it.id }.forEach { tool ->
                val formula = tool.formulaDefinition ?: return@forEach
                tool.solveTargets.sorted().forEach { target ->
                    val field = tool.inputSchema.firstOrNull { it.id == target }
                    w.appendLine(listOf(
                        tool.id, target, tool.subject.wireName, tool.category,
                        tool.educationLevels.sortedBy { it.name }.joinToString("|") { it.name },
                        formula.solveRules[target].orEmpty(), formula.solveBranches[target].orEmpty().joinToString(" | "),
                        formula.symbolicByTarget[target].orEmpty(), field?.canonicalUnit.orEmpty(),
                        tool.calculationMethod.name, tool.exactnessCapability.name,
                        tool.validationRules.joinToString(" | "), tool.sourceRefs.sorted().joinToString("|")
                    ).joinToString("\t") { it.replace('\t', ' ').replace('\n', ' ') })
                }
            }
        }
    }
}
