package com.veltrix.calculator.core

import java.time.DateTimeException
import java.time.LocalDate
import java.time.Period
import java.time.temporal.ChronoUnit

data class DateDifferenceResult(val days: Long, val period: Period)

object DateTimePlatform {
    fun parseDate(raw: String, field: String = "date"): LocalDate = try {
        LocalDate.parse(raw.trim())
    } catch (_: DateTimeException) {
        throw CalcEx("INVALID_DATE", "$field must use ISO date format YYYY-MM-DD")
    }

    fun difference(start: LocalDate, end: LocalDate): DateDifferenceResult {
        val days = ChronoUnit.DAYS.between(start, end)
        val period = if (!end.isBefore(start)) Period.between(start, end) else Period.between(end, start).negated()
        return DateDifferenceResult(days, period)
    }

    fun addDuration(date: LocalDate, years: Long = 0, months: Long = 0, days: Long = 0): LocalDate = try {
        date.plusYears(years).plusMonths(months).plusDays(days)
    } catch (_: DateTimeException) {
        throw CalcEx("INVALID_DATE", "Date arithmetic is outside the supported calendar range")
    }

    fun age(birth: LocalDate, at: LocalDate): Period {
        if (at.isBefore(birth)) throw CalcEx("DOMAIN", "Reference date cannot be before birth date")
        return Period.between(birth, at)
    }
}
