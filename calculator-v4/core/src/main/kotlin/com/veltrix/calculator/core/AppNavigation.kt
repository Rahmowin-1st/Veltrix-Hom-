package com.veltrix.calculator.core

import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** The four peer destinations owned by the full-screen Workspace. */
enum class WorkspaceTab(val routeToken: String) {
    LIBRARY("library"),
    CONVERTERS("converters"),
    GRAPHS("graphs"),
    HISTORY("history");

    companion object {
        fun fromRouteToken(value: String?): WorkspaceTab? = entries.firstOrNull { it.routeToken == value }
    }
}

/**
 * Product routes, independent from Android Views. A child encodes its parent
 * semantically, so restore/deep-link behavior never depends on a fragile UI stack.
 */
sealed interface AppDestination {
    data object Home : AppDestination
    data class Workspace(val tab: WorkspaceTab) : AppDestination
    data class ToolDetail(
        val toolId: String,
        val parentTab: WorkspaceTab = WorkspaceTab.LIBRARY
    ) : AppDestination
    data class ConverterDetail(val categoryId: String) : AppDestination
    data class GraphDetail(val toolId: String = "graph-functions") : AppDestination
    data class HistoryDetail(val historyId: Long) : AppDestination
    data class Settings(val returnTab: WorkspaceTab) : AppDestination
    data class WidgetCenter(val returnTab: WorkspaceTab) : AppDestination
}

enum class BackOutcome { NAVIGATED, SYSTEM }

/**
 * Deterministic root/workspace navigation state machine.
 *
 * Primary-tab switching is replacement, not push. Details have fixed semantic
 * parents. Settings remembers the last primary tab. Home delegates Back to the
 * Android system, which is required for Predictive Back root behavior.
 */
class AppNavigationState(initial: AppDestination = AppDestination.Home) {
    var destination: AppDestination = initial
        private set

    var lastPrimaryTab: WorkspaceTab = initial.primaryParent() ?: WorkspaceTab.LIBRARY
        private set

    fun openHome() {
        destination = AppDestination.Home
    }

    fun openWorkspace(tab: WorkspaceTab = WorkspaceTab.LIBRARY) {
        lastPrimaryTab = tab
        destination = AppDestination.Workspace(tab)
    }

    fun switchTab(tab: WorkspaceTab) = openWorkspace(tab)

    fun openSettings() {
        destination.primaryParent()?.let { lastPrimaryTab = it }
        destination = AppDestination.Settings(lastPrimaryTab)
    }

    fun openWidgetCenter() {
        val returnTab = when (val current = destination) {
            is AppDestination.Settings -> current.returnTab
            is AppDestination.WidgetCenter -> current.returnTab
            else -> destination.primaryParent() ?: lastPrimaryTab
        }
        lastPrimaryTab = returnTab
        destination = AppDestination.WidgetCenter(returnTab)
    }

    fun openTool(toolId: String, parentTab: WorkspaceTab = WorkspaceTab.LIBRARY) {
        require(toolId.isNotBlank()) { "toolId must not be blank" }
        lastPrimaryTab = parentTab
        destination = AppDestination.ToolDetail(toolId, parentTab)
    }

    fun openConverter(categoryId: String) {
        require(categoryId.isNotBlank()) { "categoryId must not be blank" }
        lastPrimaryTab = WorkspaceTab.CONVERTERS
        destination = AppDestination.ConverterDetail(categoryId)
    }

    fun openGraph(toolId: String = "graph-functions") {
        require(toolId.isNotBlank()) { "toolId must not be blank" }
        lastPrimaryTab = WorkspaceTab.GRAPHS
        destination = AppDestination.GraphDetail(toolId)
    }

    fun openHistory(historyId: Long) {
        require(historyId > 0) { "historyId must be positive" }
        lastPrimaryTab = WorkspaceTab.HISTORY
        destination = AppDestination.HistoryDetail(historyId)
    }

    fun back(): BackOutcome = when (val current = destination) {
        AppDestination.Home -> BackOutcome.SYSTEM
        is AppDestination.Workspace -> {
            destination = AppDestination.Home
            BackOutcome.NAVIGATED
        }
        is AppDestination.ToolDetail -> navigateToParent(current.parentTab)
        is AppDestination.ConverterDetail -> navigateToParent(WorkspaceTab.CONVERTERS)
        is AppDestination.GraphDetail -> navigateToParent(WorkspaceTab.GRAPHS)
        is AppDestination.HistoryDetail -> navigateToParent(WorkspaceTab.HISTORY)
        is AppDestination.Settings -> navigateToParent(current.returnTab)
        is AppDestination.WidgetCenter -> {
            lastPrimaryTab = current.returnTab
            destination = AppDestination.Settings(current.returnTab)
            BackOutcome.NAVIGATED
        }
    }

    fun encode(): String = when (val current = destination) {
        AppDestination.Home -> "home"
        is AppDestination.Workspace -> "workspace/${current.tab.routeToken}"
        is AppDestination.ToolDetail -> "tool/${current.parentTab.routeToken}/${escape(current.toolId)}"
        is AppDestination.ConverterDetail -> "converter/${escape(current.categoryId)}"
        is AppDestination.GraphDetail -> "graph/${escape(current.toolId)}"
        is AppDestination.HistoryDetail -> "history-detail/${current.historyId}"
        is AppDestination.Settings -> "settings/${current.returnTab.routeToken}"
        is AppDestination.WidgetCenter -> "widget-center/${current.returnTab.routeToken}"
    }

    private fun navigateToParent(tab: WorkspaceTab): BackOutcome {
        lastPrimaryTab = tab
        destination = AppDestination.Workspace(tab)
        return BackOutcome.NAVIGATED
    }

    companion object {
        fun restore(
            encoded: String?,
            toolExists: (String) -> Boolean = { true },
            converterExists: (String) -> Boolean = { true }
        ): AppNavigationState {
            val destination = runCatching { decode(encoded, toolExists, converterExists) }
                .getOrNull() ?: AppDestination.Home
            return AppNavigationState(destination)
        }

        private fun decode(
            encoded: String?,
            toolExists: (String) -> Boolean,
            converterExists: (String) -> Boolean
        ): AppDestination {
            if (encoded.isNullOrBlank() || encoded == "home") return AppDestination.Home
            val split = encoded.split('/')
            val value = split.getOrNull(1)
            return when (split.first()) {
                "workspace" -> AppDestination.Workspace(
                    WorkspaceTab.fromRouteToken(value) ?: WorkspaceTab.LIBRARY
                )
                "tool" -> {
                    val explicitParent = WorkspaceTab.fromRouteToken(value)
                    val toolId = unescape(if (explicitParent == null) value else split.getOrNull(2))
                    val parent = explicitParent ?: WorkspaceTab.LIBRARY
                    toolId.takeIf { it.isNotBlank() && toolExists(it) }
                        ?.let { AppDestination.ToolDetail(it, parent) }
                        ?: AppDestination.Workspace(parent)
                }
                "converter" -> unescape(value).takeIf { it.isNotBlank() && converterExists(it) }
                    ?.let { AppDestination.ConverterDetail(it) } ?: AppDestination.Workspace(WorkspaceTab.CONVERTERS)
                "graph" -> unescape(value).takeIf { it.isNotBlank() && toolExists(it) }
                    ?.let { AppDestination.GraphDetail(it) } ?: AppDestination.Workspace(WorkspaceTab.GRAPHS)
                "history-detail" -> value?.toLongOrNull()?.takeIf { it > 0 }
                    ?.let { AppDestination.HistoryDetail(it) } ?: AppDestination.Workspace(WorkspaceTab.HISTORY)
                "settings" -> AppDestination.Settings(
                    WorkspaceTab.fromRouteToken(value) ?: WorkspaceTab.LIBRARY
                )
                "widget-center" -> AppDestination.WidgetCenter(
                    WorkspaceTab.fromRouteToken(value) ?: WorkspaceTab.LIBRARY
                )
                else -> AppDestination.Home
            }
        }

        private fun escape(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8.name())
        private fun unescape(value: String?): String = value?.let {
            URLDecoder.decode(it, StandardCharsets.UTF_8.name())
        }.orEmpty()
    }
}

private fun AppDestination.primaryParent(): WorkspaceTab? = when (this) {
    AppDestination.Home -> null
    is AppDestination.Workspace -> tab
    is AppDestination.ToolDetail -> parentTab
    is AppDestination.ConverterDetail -> WorkspaceTab.CONVERTERS
    is AppDestination.GraphDetail -> WorkspaceTab.GRAPHS
    is AppDestination.HistoryDetail -> WorkspaceTab.HISTORY
    is AppDestination.Settings -> returnTab
    is AppDestination.WidgetCenter -> returnTab
}
