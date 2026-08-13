package com.veltrix.calculator.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class AppNavigationStateTest {
    @Test
    fun homeWorkspaceAndPrimaryTabsAreReplacementRoutes() {
        val nav = AppNavigationState()
        assertEquals(AppDestination.Home, nav.destination)
        assertEquals(BackOutcome.SYSTEM, nav.back())

        nav.openWorkspace()
        assertEquals(AppDestination.Workspace(WorkspaceTab.LIBRARY), nav.destination)
        repeat(2_000) { index -> nav.switchTab(WorkspaceTab.entries[index % WorkspaceTab.entries.size]) }
        assertIs<AppDestination.Workspace>(nav.destination)
        assertEquals(BackOutcome.NAVIGATED, nav.back())
        assertEquals(AppDestination.Home, nav.destination)
        assertEquals(BackOutcome.SYSTEM, nav.back())
    }

    @Test
    fun settingsAndWidgetCenterUseDeterministicParents() {
        val nav = AppNavigationState()
        nav.openWorkspace(WorkspaceTab.CONVERTERS)
        nav.openSettings()
        assertEquals(AppDestination.Settings(WorkspaceTab.CONVERTERS), nav.destination)
        nav.openWidgetCenter()
        assertEquals(AppDestination.WidgetCenter(WorkspaceTab.CONVERTERS), nav.destination)
        assertEquals(BackOutcome.NAVIGATED, nav.back())
        assertEquals(AppDestination.Settings(WorkspaceTab.CONVERTERS), nav.destination)
        nav.back()
        assertEquals(AppDestination.Workspace(WorkspaceTab.CONVERTERS), nav.destination)
    }

    @Test
    fun everyDetailBacksToItsSemanticParent() {
        val nav = AppNavigationState()
        val cases = listOf<Triple<() -> Unit, AppDestination, WorkspaceTab>>(
            Triple({ nav.openTool("physics-ohms-law") }, AppDestination.ToolDetail("physics-ohms-law"), WorkspaceTab.LIBRARY),
            Triple({ nav.openConverter("Length") }, AppDestination.ConverterDetail("Length"), WorkspaceTab.CONVERTERS),
            Triple({ nav.openGraph("graph-functions") }, AppDestination.GraphDetail("graph-functions"), WorkspaceTab.GRAPHS),
            Triple({ nav.openHistory(42) }, AppDestination.HistoryDetail(42), WorkspaceTab.HISTORY)
        )
        cases.forEach { (open, detail, parent) ->
            open()
            assertEquals(detail, nav.destination)
            nav.back()
            assertEquals(AppDestination.Workspace(parent), nav.destination)
        }

        nav.openTool("quadratic-solver", WorkspaceTab.HISTORY)
        nav.back()
        assertEquals(AppDestination.Workspace(WorkspaceTab.HISTORY), nav.destination)
    }

    @Test
    fun routeCodecRestoresProcessDeathAndRejectsInvalidChildren() {
        val destinations = listOf(
            AppDestination.Home,
            AppDestination.Workspace(WorkspaceTab.HISTORY),
            AppDestination.ToolDetail("physics-ohms-law"),
            AppDestination.ToolDetail("quadratic-solver", WorkspaceTab.HISTORY),
            AppDestination.ConverterDetail("Data / Storage"),
            AppDestination.GraphDetail("graph-parabola"),
            AppDestination.HistoryDetail(77),
            AppDestination.Settings(WorkspaceTab.GRAPHS),
            AppDestination.WidgetCenter(WorkspaceTab.CONVERTERS)
        )
        destinations.forEach { destination ->
            val nav = AppNavigationState(destination)
            val restored = AppNavigationState.restore(nav.encode())
            assertEquals(destination, restored.destination, nav.encode())
        }

        assertEquals(
            AppDestination.Workspace(WorkspaceTab.LIBRARY),
            AppNavigationState.restore("tool/missing", toolExists = { false }).destination
        )
        assertEquals(
            AppDestination.Workspace(WorkspaceTab.CONVERTERS),
            AppNavigationState.restore("converter/missing", converterExists = { false }).destination
        )
        assertEquals(AppDestination.Home, AppNavigationState.restore("unknown/route").destination)
    }

    @Test
    fun repeatedHomeWorkspaceAndBackSpamRemainBounded() {
        val nav = AppNavigationState()
        repeat(5_000) {
            nav.openWorkspace()
            nav.openTool("standard-calculator")
            nav.back()
            nav.back()
            nav.back()
        }
        assertEquals(AppDestination.Home, nav.destination)
        assertEquals(BackOutcome.SYSTEM, nav.back())
    }
}
