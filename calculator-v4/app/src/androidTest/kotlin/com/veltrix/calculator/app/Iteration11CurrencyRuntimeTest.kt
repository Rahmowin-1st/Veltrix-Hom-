package com.veltrix.calculator.app

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.atomic.AtomicInteger

@RunWith(AndroidJUnit4::class)
class Iteration11CurrencyRuntimeTest {
    private val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun cacheFreshnessStaleFailureRetryTimestampAndActiveRefresh(){
        val cache=CurrencyCacheStore(context);cache.clear();val attempts=AtomicInteger(0)
        val retrying=object:CurrencyRateProvider{override val id="retry-provider";override fun fetch(base:String,quote:String):ProviderRate{val n=attempts.incrementAndGet();if(n<3)throw CurrencyProviderException("HTTP_503");return ProviderRate(base,quote,4.0,"2026-08-11",id)}}
        val repo=CurrencyRepository(context,retrying,cache);val live=repo.rate("USD","UZS",true);assertEquals(3,attempts.get());assertFalse(live.stale);assertFalse(live.fromCache);assertTrue(live.fetchedAtEpochMs>0);assertEquals("CURRENT_FETCH",live.freshnessLabel())
        val fresh=repo.rate("USD","UZS",false);assertTrue(fresh.fromCache);assertFalse(fresh.stale);assertEquals("CURRENT_CACHE",fresh.freshnessLabel())
        cache.put(ProviderRate("EUR","UZS",5.0,"2026-08-10","old-fixture"),System.currentTimeMillis()-60*60_000L);val old=repo.cached("EUR","UZS",5*60_000L)!!;assertTrue(old.stale);assertEquals("STALE",old.freshnessLabel())
        val failing=object:CurrencyRateProvider{override val id="fail";override fun fetch(base:String,quote:String):ProviderRate=throw CurrencyProviderException("NETWORK")}
        val fallback=CurrencyRepository(context,failing,cache).rate("EUR","UZS",true);assertTrue(fallback.stale);assertTrue(fallback.fromCache);assertEquals(5.0,fallback.rate,0.0);assertEquals("old-fixture",fallback.source)

        val activeCalls=AtomicInteger(0);val changing=object:CurrencyRateProvider{override val id="active";override fun fetch(base:String,quote:String)=ProviderRate(base,quote,10.0+activeCalls.incrementAndGet(),"2026-08-11",id)}
        val activeRepo=CurrencyRepository(context,changing,cache);val a=activeRepo.rate("GBP","USD",true);val b=activeRepo.rate("GBP","USD",true,maxFreshAgeMs=0);assertTrue(b.rate>a.rate);assertTrue(activeCalls.get()>=2)
    }

    @Test fun offlineStyleCachedConversionPreservesProviderAndTimestamp(){
        val cache=CurrencyCacheStore(context);cache.put(ProviderRate("USD","EUR",0.9,"2026-08-11","verified-fixture"),System.currentTimeMillis()-10*60_000L)
        val failing=object:CurrencyRateProvider{override val id="offline";override fun fetch(base:String,quote:String):ProviderRate=throw CurrencyProviderException("NETWORK")}
        val repo=CurrencyRepository(context,failing,cache);val (value,record)=repo.convertAmount(100.0,"USD","EUR",true);assertEquals(90.0,value,1e-9);assertTrue(record.stale);assertTrue(record.fromCache);assertEquals("verified-fixture",record.source);assertTrue(record.fetchedAtEpochMs>0)
    }
}
