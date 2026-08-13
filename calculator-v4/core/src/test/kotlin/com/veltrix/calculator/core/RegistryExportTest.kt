package com.veltrix.calculator.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertTrue

/** Creates an auditable, deterministic registry contract during the verified test run. */
class RegistryExportTest {
    @Test
    fun exportCanonicalRegistry() {
        val registry = ToolRegistry.default()
        assertTrue(registry.all().size >= 100)
        val out = File("build/registry-export.tsv")
        out.parentFile.mkdirs()
        out.bufferedWriter().use { w ->
            w.appendLine("registrySchemaVersion\t${ToolRegistry.SCHEMA_VERSION}")
            w.appendLine("id\ttitle\tsubject\tcategory\ttopic\tenvironmentFamily\texecutorKind\tinputs\toutputs\twidget\twidgetSizes\tcompact\tofflinePolicy\tliveDataPolicy\thistoryPolicy\tschemaVersion\taliases")
            registry.all().sortedBy { it.id }.forEach { t ->
                fun clean(v: String) = v.replace('\t', ' ').replace('\n', ' ')
                val inputs = t.inputSchema.joinToString(";") { f ->
                    buildString {
                        append(f.id).append(':').append(f.kind.name)
                        if (!f.required) append('?')
                        f.canonicalUnit?.let { append('[').append(it).append(']') }
                        if (f.options.isNotEmpty()) append('{').append(f.options.joinToString(",")).append('}')
                    }
                }
                val outputs = t.outputSchema.joinToString(";") { "${it.id}:${it.kind.name}" }
                w.appendLine(listOf(
                    t.id, t.title, t.subject.name, t.category, t.topic, t.environmentFamily.name,
                    t.executorKind.name, inputs, outputs, t.supportsWidget.toString(),
                    t.supportedWidgetSizes.sortedBy { it.name }.joinToString(",") { it.name },
                    t.supportsFloatingCompactMode.toString(), t.offlinePolicy.name, t.liveDataPolicy.name,
                    t.historyPolicy.name, t.schemaVersion.toString(), t.aliases.sorted().joinToString("|")
                ).joinToString("\t") { clean(it) })
            }
        }
        assertTrue(out.length() > 1000)
    }
}
