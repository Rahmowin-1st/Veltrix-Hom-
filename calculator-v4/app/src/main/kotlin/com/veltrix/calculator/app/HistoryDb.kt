package com.veltrix.calculator.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

data class HistoryItem(
    val id: Long,
    val expression: String,
    val result: String,
    val type: String,
    val createdAt: Long,
    val favorite: Boolean,
    val toolId: String? = null,
    val subject: String? = null,
    val structuredInput: String? = null,
    val normalizedInput: String? = null,
    val resultPayload: String? = null,
    val resultVersion: Int = 1,
    val units: String? = null,
    val metadata: String? = null
)

/** App-owned unified calculation history. Schema migrations preserve the accepted v1 rows. */
class HistoryDb(context: Context): SQLiteOpenHelper(context, "veltrix.db", null, 2) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""CREATE TABLE history(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            expression TEXT NOT NULL,
            result TEXT NOT NULL,
            type TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            favorite INTEGER NOT NULL DEFAULT 0,
            tool_id TEXT,
            subject TEXT,
            structured_input TEXT,
            normalized_input TEXT,
            result_payload TEXT,
            result_version INTEGER NOT NULL DEFAULT 1,
            units TEXT,
            metadata TEXT
        )""".trimIndent())
        createIndexes(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            val columns = listOf(
                "tool_id TEXT", "subject TEXT", "structured_input TEXT", "normalized_input TEXT",
                "result_payload TEXT", "result_version INTEGER NOT NULL DEFAULT 1", "units TEXT", "metadata TEXT"
            )
            columns.forEach { db.execSQL("ALTER TABLE history ADD COLUMN $it") }
            db.execSQL("UPDATE history SET tool_id='legacy-expression', subject=type, result_payload=result WHERE tool_id IS NULL")
            createIndexes(db)
        }
    }

    private fun createIndexes(db: SQLiteDatabase) {
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_history_time ON history(created_at DESC)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_history_tool ON history(tool_id, created_at DESC)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_history_subject ON history(subject, created_at DESC)")
    }

    @Synchronized
    fun add(expression: String, result: String, type: String): Long = addStructured(
        toolId = "legacy-expression", subject = type, expression = expression, resultSummary = result,
        structuredInput = null, normalizedInput = expression, resultPayload = result, resultVersion = 1, units = null, metadata = null
    )

    @Synchronized
    fun addStructured(
        toolId: String,
        subject: String?,
        expression: String,
        resultSummary: String,
        structuredInput: String?,
        normalizedInput: String?,
        resultPayload: String?,
        resultVersion: Int,
        units: String?,
        metadata: String?
    ): Long = writableDatabase.insertOrThrow("history", null, ContentValues().apply {
        put("expression", expression); put("result", resultSummary); put("type", subject ?: "UNKNOWN")
        put("created_at", System.currentTimeMillis()); put("favorite", 0); put("tool_id", toolId); put("subject", subject)
        put("structured_input", structuredInput); put("normalized_input", normalizedInput); put("result_payload", resultPayload)
        put("result_version", resultVersion); put("units", units); put("metadata", metadata)
    })

    @Synchronized
    fun list(query: String = "", favoritesOnly: Boolean = false, toolId: String? = null, subject: String? = null, limit: Int = 250): List<HistoryItem> {
        val where = mutableListOf<String>(); val args = mutableListOf<String>()
        if (query.isNotBlank()) {
            where += "(expression LIKE ? OR result LIKE ? OR type LIKE ? OR tool_id LIKE ? OR subject LIKE ?)"
            val q = "%$query%"; repeat(5) { args += q }
        }
        if (favoritesOnly) where += "favorite=1"
        if (!toolId.isNullOrBlank()) { where += "tool_id=?"; args += toolId }
        if (!subject.isNullOrBlank()) { where += "subject=?"; args += subject }
        val cols = arrayOf("id","expression","result","type","created_at","favorite","tool_id","subject","structured_input","normalized_input","result_payload","result_version","units","metadata")
        return readableDatabase.query("history", cols, where.takeIf{it.isNotEmpty()}?.joinToString(" AND "), args.takeIf{it.isNotEmpty()}?.toTypedArray(), null, null, "created_at DESC", limit.coerceIn(1,1000).toString()).use { c ->
            buildList { while (c.moveToNext()) add(HistoryItem(c.getLong(0),c.getString(1),c.getString(2),c.getString(3),c.getLong(4),c.getInt(5)==1,c.getString(6),c.getString(7),c.getString(8),c.getString(9),c.getString(10),c.getInt(11),c.getString(12),c.getString(13))) }
        }
    }

    @Synchronized fun favorite(id: Long, value: Boolean) = writableDatabase.update("history", ContentValues().apply { put("favorite", if(value) 1 else 0) }, "id=?", arrayOf(id.toString()))
    @Synchronized fun delete(id: Long) = writableDatabase.delete("history", "id=?", arrayOf(id.toString()))
    @Synchronized fun clear() = writableDatabase.delete("history", null, null)

    companion object {
        fun json(map: Map<String, String>): String = JSONObject(map).toString()
    }
}
