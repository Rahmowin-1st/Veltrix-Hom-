package com.veltrix.calculator.app

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

class CurrencyRefreshWorker(context: Context, params: WorkerParameters): Worker(context,params) {
    override fun doWork(): Result {
        val repo=CurrencyRepository(applicationContext)
        val widgetPairs=WidgetConfigStore(applicationContext).all().filter { it.toolId.startsWith("currency") }.map { "${it.currencyBase}/${it.currencyQuote}" }
        val pairs=(repo.rememberedPairs()+widgetPairs).distinct().take(16)
        if(pairs.isEmpty())return Result.success()
        var failures=0
        for(pair in pairs){val p=pair.split('/');if(p.size!=2)continue;try{repo.rate(p[0],p[1],forceRefresh=true)}catch(_:Exception){failures++}}
        VeltrixToolWidgetProvider.refreshCurrencyWidgetsFromCache(applicationContext)
        return if(failures==pairs.size)Result.retry() else Result.success()
    }
}

object CurrencyRefreshScheduler {
    private const val PERIODIC_WORK_NAME="veltrix-currency-refresh-v2"
    private const val NOW_WORK_NAME="veltrix-currency-refresh-now"
    fun ensure(context:Context){
        val constraints=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val request=PeriodicWorkRequestBuilder<CurrencyRefreshWorker>(30,TimeUnit.MINUTES).setConstraints(constraints).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC_WORK_NAME,ExistingPeriodicWorkPolicy.UPDATE,request)
    }
    fun refreshNow(context:Context,reason:String){
        val constraints=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val request=OneTimeWorkRequestBuilder<CurrencyRefreshWorker>().setConstraints(constraints).setInputData(workDataOf("reason" to reason)).build()
        WorkManager.getInstance(context).enqueueUniqueWork(NOW_WORK_NAME,ExistingWorkPolicy.REPLACE,request)
    }
}
