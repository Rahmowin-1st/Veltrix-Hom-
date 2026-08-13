package com.veltrix.calculator.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LiveCurrencyRuntimeTest {
    private fun waitForValidatedNetwork(context: Context, timeoutMs: Long = 30_000L) {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val network = cm.activeNetwork
            val caps = network?.let { cm.getNetworkCapabilities(it) }
            if (caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true) return
            Thread.sleep(500)
        }
        throw AssertionError("Android network did not become validated before live currency probe")
    }

    @Test fun actualProviderOnlineProbe() {
        val inst=InstrumentationRegistry.getInstrumentation()
        assumeTrue("Manual live provider probe only",InstrumentationRegistry.getArguments().getString("liveProbe")=="true")
        val context=inst.targetContext
        waitForValidatedNetwork(context)
        CurrencyCacheStore(context).clear()
        val rate=CurrencyRepository(context).rate("USD","EUR",forceRefresh=true)
        assertTrue(rate.rate>0.0 && rate.rate.isFinite())
        assertFalse(rate.stale)
        assertFalse(rate.fromCache)
        assertTrue(rate.source.isNotBlank())
        assertTrue(rate.effectiveDate.isNotBlank())
        assertTrue(rate.fetchedAtEpochMs > 0)
        assertEquals("CURRENT_FETCH", rate.freshnessLabel())
    }
}
