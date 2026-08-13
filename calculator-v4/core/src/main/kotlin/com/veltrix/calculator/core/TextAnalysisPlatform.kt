package com.veltrix.calculator.core

data class TextAnalysisResult(
    val text: String,
    val characters: Int,
    val charactersExcludingSpaces: Int,
    val words: Int,
    val sentences: Int,
    val paragraphs: Int,
    val detectedLanguage: String?,
    val languageConfidence: Double?
)

object TextAnalysisPlatform {
    private val wordRegex = Regex("[\\p{L}\\p{N}]+(?:[-'’][\\p{L}\\p{N}]+)*")
    private val sentenceRegex = Regex("[^.!?\\n]+[.!?]+|[^.!?\\n]+$")

    fun analyze(text: String, detectedLanguage: String? = null, languageConfidence: Double? = null): TextAnalysisResult {
        val paragraphs = text.trim().takeIf { it.isNotEmpty() }
            ?.split(Regex("\\n\\s*\\n"))?.count { it.isNotBlank() } ?: 0
        return TextAnalysisResult(
            text = text,
            characters = text.length,
            charactersExcludingSpaces = text.count { !it.isWhitespace() },
            words = wordRegex.findAll(text).count(),
            sentences = sentenceRegex.findAll(text.trim()).count { it.value.isNotBlank() },
            paragraphs = paragraphs,
            detectedLanguage = detectedLanguage,
            languageConfidence = languageConfidence
        )
    }
}
