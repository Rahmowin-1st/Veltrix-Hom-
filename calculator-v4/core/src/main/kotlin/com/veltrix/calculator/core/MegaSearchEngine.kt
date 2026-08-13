package com.veltrix.calculator.core

import java.text.Normalizer
import kotlin.math.max

class MegaSearchEngine(private val registry: ToolRegistry = ToolRegistry.default()) {
    fun search(queryRaw: String, subject: Subject? = null, usageBoosts: Map<String, Double> = emptyMap(), limit: Int = 20): List<SearchMatch> {
        val q = normalize(queryRaw)
        if (q.length < 2) return emptyList()
        return registry.all().asSequence()
            .filter { subject == null || it.subject == subject }
            .mapNotNull { tool -> score(tool, q, usageBoosts[tool.id] ?: 0.0) }
            .filter { it.score >= confidenceThreshold(q) }
            .sortedWith(compareByDescending<SearchMatch> { it.score }.thenBy { it.tool.title })
            .take(limit.coerceIn(1, 50)).toList()
    }

    private fun score(tool: ToolDefinition, q: String, usage: Double): SearchMatch? {
        val title = normalize(tool.title)
        val short = tool.shortTitle?.let(::normalize)
        val aliases = tool.aliases.map(::normalize)
        val misses = tool.commonMisspellings.map(::normalize)
        val keywords = (tool.keywords + tool.tags + tool.topic + tool.category).map(::normalize)
        fun hit(score: Double, reason: String) = SearchMatch(tool, score + usage.coerceIn(0.0, 3.0), reason)
        if (q == title || q == short) return hit(100.0, "exact-title")
        if (aliases.any { q == it }) return hit(96.0, "alias")
        if (title.startsWith(q) || short?.startsWith(q) == true || aliases.any { it.startsWith(q) }) return hit(88.0, "prefix")
        if (q in title || short?.contains(q) == true || aliases.any { q in it }) return hit(80.0, "substring")
        if (misses.any { q == it }) return hit(78.0, "known-misspelling")

        val names = listOfNotNull(title, short) + aliases + misses
        val fuzzy = names.map { similarity(q, it) }.maxOrNull() ?: 0.0
        if (fuzzy >= fuzzyThreshold(q)) return hit(58.0 + fuzzy * 20.0, "fuzzy")
        val keywordHit = keywords.maxOfOrNull { kw -> when {
            kw == q -> 1.0
            kw.startsWith(q) -> 0.9
            q in kw -> 0.75
            else -> similarity(q, kw) * 0.55
        } } ?: 0.0
        if (keywordHit >= 0.65) return hit(42.0 + keywordHit * 20.0, "keyword")
        return null
    }

    private fun confidenceThreshold(q: String) = if (q.length <= 3) 70.0 else 55.0
    private fun fuzzyThreshold(q: String) = when {
        q.length <= 3 -> 0.90
        q.length <= 5 -> 0.72
        else -> 0.66
    }

    private fun similarity(a: String, b: String): Double {
        if (a == b) return 1.0
        val d = levenshtein(a, b)
        return 1.0 - d.toDouble() / max(a.length, b.length).coerceAtLeast(1)
    }

    private fun levenshtein(a: String, b: String): Int {
        var prev = IntArray(b.length + 1) { it }
        for (i in a.indices) {
            val cur = IntArray(b.length + 1); cur[0] = i + 1
            for (j in b.indices) cur[j + 1] = minOf(cur[j] + 1, prev[j + 1] + 1, prev[j] + if (a[i] == b[j]) 0 else 1)
            prev = cur
        }
        return prev[b.length]
    }

    companion object {
        fun normalize(raw: String): String = Normalizer.normalize(raw.lowercase(), Normalizer.Form.NFKD)
            .replace(Regex("\\p{M}+"), "")
            .replace('²', '2').replace('³', '3').replace('⁴', '4')
            .replace(Regex("[^a-z0-9]+"), " ").trim().replace(Regex("\\s+"), " ")
    }
}
