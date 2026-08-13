package com.veltrix.calculator.app

import android.content.Context
import com.veltrix.calculator.core.CalculationResult
import com.veltrix.calculator.core.CalculationType
import org.json.JSONObject
import java.math.BigDecimal
import java.math.MathContext
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

interface CurrencyRateProvider {
    val id: String
    fun fetch(base: String, quote: String): ProviderRate
}

data class ProviderRate(val base: String, val quote: String, val rate: Double, val effectiveDate: String, val source: String)
data class CurrencyRateRecord(
    val base: String, val quote: String, val rate: Double, val effectiveDate: String, val source: String,
    val fetchedAtEpochMs: Long, val stale: Boolean, val fromCache: Boolean
) {
    fun ageMs(now: Long = System.currentTimeMillis()): Long = (now - fetchedAtEpochMs).coerceAtLeast(0)
    fun freshnessLabel(): String = when { stale -> "STALE"; fromCache -> "CURRENT_CACHE"; else -> "CURRENT_FETCH" }
}

/**
 * Keyless production-safe default. UZS pairs prefer the official Central Bank of Uzbekistan feed
 * exposed through Frankfurter v2; all other pairs use Frankfurter's current blended reference rate.
 */
class FrankfurterRateProvider : CurrencyRateProvider {
    override val id = "frankfurter-v2"
    override fun fetch(base: String, quote: String): ProviderRate {
        val b = currencyCode(base); val q = currencyCode(quote)
        if (b == q) return ProviderRate(b, q, 1.0, "same-currency", id)
        if (b == "UZS" || q == "UZS") {
            runCatching { return fetchUrl(b, q, "https://api.frankfurter.dev/v2/rate/$b/$q?providers=CBU", "$id:cbu") }
        }
        return fetchUrl(b, q, "https://api.frankfurter.dev/v2/rate/$b/$q", id)
    }

    private fun fetchUrl(base: String, quote: String, rawUrl: String, sourceId: String): ProviderRate {
        val connection = (URL(rawUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 4_000; readTimeout = 4_000; requestMethod = "GET"; useCaches = false
            setRequestProperty("Accept", "application/json"); setRequestProperty("User-Agent", "VeltrixCalculator/2.1")
        }
        try {
            val code = connection.responseCode
            if (code !in 200..299) throw CurrencyProviderException("HTTP_$code")
            val raw = connection.inputStream.bufferedReader().use { it.readText() }
            val j = JSONObject(raw); val rate = j.optDouble("rate", Double.NaN)
            if (!rate.isFinite() || rate <= 0) throw CurrencyProviderException("INVALID_RATE")
            return ProviderRate(base, quote, rate, j.optString("date", ""), sourceId)
        } catch (e: CurrencyProviderException) { throw e }
        catch (_: Exception) { throw CurrencyProviderException("NETWORK") }
        finally { connection.disconnect() }
    }

    private fun currencyCode(raw: String): String {
        val code = raw.trim().uppercase(Locale.US)
        if (!Regex("[A-Z]{3}").matches(code)) throw CurrencyProviderException("INVALID_CURRENCY")
        return code
    }
}

/** Provider chain keeps future secure-gateway/intraday providers pluggable without touching consumers. */
class ChainedCurrencyRateProvider(private val providers: List<CurrencyRateProvider>) : CurrencyRateProvider {
    init { require(providers.isNotEmpty()) }
    override val id: String = providers.joinToString("+") { it.id }
    override fun fetch(base: String, quote: String): ProviderRate {
        var last: Exception? = null
        for (provider in providers) try { return provider.fetch(base, quote) } catch (e: Exception) { last = e }
        throw CurrencyProviderException((last as? CurrencyProviderException)?.reason ?: "NETWORK")
    }
}

class CurrencyProviderException(val reason: String): Exception(reason)

class CurrencyCacheStore(context: Context) {
    private val prefs = context.getSharedPreferences("currency_cache_v2", Context.MODE_PRIVATE)
    private fun key(base: String, quote: String) = "${base.uppercase(Locale.US)}_${quote.uppercase(Locale.US)}"
    @Synchronized fun put(rate: ProviderRate, fetchedAt: Long = System.currentTimeMillis()) {
        val j = JSONObject().put("base",rate.base).put("quote",rate.quote).put("rate",rate.rate).put("effectiveDate",rate.effectiveDate).put("source",rate.source).put("fetchedAt",fetchedAt)
        prefs.edit().putString(key(rate.base,rate.quote),j.toString()).commit()
    }
    @Synchronized fun get(base: String, quote: String): CurrencyRateRecord? {
        val raw = prefs.getString(key(base,quote),null) ?: return null
        return try { val j=JSONObject(raw); CurrencyRateRecord(j.getString("base"),j.getString("quote"),j.getDouble("rate"),j.optString("effectiveDate"),j.optString("source"),j.getLong("fetchedAt"),stale=true,fromCache=true) } catch(_:Exception){null}
    }
    @Synchronized fun clear(){prefs.edit().clear().commit()}
}

/** Network failure is isolated from every deterministic calculator. */
class CurrencyRepository(
    context: Context,
    private val provider: CurrencyRateProvider = ChainedCurrencyRateProvider(listOf(FrankfurterRateProvider())),
    private val cache: CurrencyCacheStore = CurrencyCacheStore(context.applicationContext)
) {
    private val appContext = context.applicationContext
    private val pairPrefs = appContext.getSharedPreferences("currency_pairs",Context.MODE_PRIVATE)

    fun cached(base: String, quote: String, maxFreshAgeMs: Long = ACTIVE_FRESH_AGE_MS): CurrencyRateRecord? {
        val record = cache.get(base,quote) ?: return null
        return record.copy(stale = record.ageMs() > maxFreshAgeMs, fromCache = true)
    }

    fun rate(base: String, quote: String, forceRefresh: Boolean = false, maxFreshAgeMs: Long = ACTIVE_FRESH_AGE_MS): CurrencyRateRecord {
        val now = System.currentTimeMillis(); val cached = cache.get(base,quote)
        if (!forceRefresh && cached != null && now - cached.fetchedAtEpochMs <= maxFreshAgeMs) return cached.copy(stale=false,fromCache=true)
        return try {
            val live = fetchWithRetry(base,quote); cache.put(live,now); rememberPair(live.base,live.quote)
            CurrencyRateRecord(live.base,live.quote,live.rate,live.effectiveDate,live.source,now,stale=false,fromCache=false)
        } catch (e: Exception) {
            cached?.copy(stale=true,fromCache=true) ?: throw CurrencyProviderException((e as? CurrencyProviderException)?.reason ?: "NETWORK")
        }
    }

    fun convertAmount(amount: Double, base: String, quote: String, forceRefresh: Boolean = false): Pair<Double,CurrencyRateRecord> {
        if (!amount.isFinite()) throw IllegalArgumentException("Amount must be finite")
        val record = rate(base,quote,forceRefresh); val value = amount * record.rate
        if (!value.isFinite()) throw IllegalArgumentException("Converted value is non-finite")
        return value to record
    }

    fun convertCached(amount: Double, base: String, quote: String, maxFreshAgeMs: Long = ACTIVE_FRESH_AGE_MS): Pair<Double,CurrencyRateRecord>? {
        if (!amount.isFinite()) return null
        val record = cached(base,quote,maxFreshAgeMs) ?: return null; val value=amount*record.rate
        return value.takeIf(Double::isFinite)?.let { it to record }
    }

    /** Compatibility bridge for accepted previous regression harnesses. */
    fun convert(amount: Double, base: String, quote: String, precision: Int): CalculationResult = try {
        val (value,record)=convertAmount(amount,base,quote,true)
        val formatted=BigDecimal.valueOf(value).round(MathContext(precision.coerceIn(6,34))).stripTrailingZeros().toPlainString()
        CalculationResult("$amount $base to $quote",CalculationType.CURRENCY,"$formatted ${record.quote}",approximate="$formatted ${record.quote}",derived=mapOf("rate" to record.rate.toString()),metadata=metadata(record))
    } catch (_: Exception) {
        val cached=cached(base,quote,0) ?: return CalculationResult.fail("$amount $base to $quote",CalculationType.CURRENCY,"NETWORK","Currency rate unavailable; deterministic calculators remain available offline")
        val value=amount*cached.rate;val formatted=BigDecimal.valueOf(value).round(MathContext(precision.coerceIn(6,34))).stripTrailingZeros().toPlainString()
        CalculationResult("$amount $base to $quote",CalculationType.CURRENCY,"$formatted ${cached.quote}",approximate="$formatted ${cached.quote}",derived=mapOf("rate" to cached.rate.toString()),metadata=metadata(cached.copy(stale=true,fromCache=true)))
    }

    private fun metadata(record:CurrencyRateRecord)=mapOf("source" to record.source,"stale" to record.stale.toString(),"freshness" to record.freshnessLabel(),"last_updated" to record.effectiveDate,"fetched_at" to record.fetchedAtEpochMs.toString(),"from_cache" to record.fromCache.toString())

    private fun fetchWithRetry(base: String, quote: String, attempts: Int = 3): ProviderRate {
        var lastError: Exception? = null
        repeat(attempts.coerceIn(1, 4)) { attempt ->
            try { return provider.fetch(base, quote) } catch (e: Exception) {
                lastError = e; val reason = (e as? CurrencyProviderException)?.reason
                val retryable = e !is CurrencyProviderException || reason == "NETWORK" || reason == "HTTP_408" || reason == "HTTP_429" || reason?.startsWith("HTTP_5") == true
                if (!retryable) throw e
                if (attempt < attempts - 1) try { Thread.sleep(350L shl attempt) } catch (_: InterruptedException) { Thread.currentThread().interrupt(); throw CurrencyProviderException("INTERRUPTED") }
            }
        }
        throw CurrencyProviderException((lastError as? CurrencyProviderException)?.reason ?: "NETWORK")
    }

    private fun rememberPair(base:String,quote:String){
        val pair="$base/$quote";val current=pairPrefs.getStringSet("pairs",emptySet()).orEmpty().toMutableSet();current+=pair;pairPrefs.edit().putStringSet("pairs",current.take(24).toSet()).apply()
    }
    fun rememberedPairs(): Set<String> = pairPrefs.getStringSet("pairs",emptySet()).orEmpty()

    companion object { const val ACTIVE_FRESH_AGE_MS = 5 * 60_000L }
}
