package com.veltrix.calculator.core

import kotlin.math.abs
import kotlin.math.pow

object FinancePlatform {
    data class SplitBillResult(val total: Double, val perPerson: Double)
    data class LoanResult(val monthlyPayment: Double, val totalPaid: Double, val totalInterest: Double)

    fun splitBill(bill: Double, tipPercent: Double, people: Int): SplitBillResult {
        if (!bill.isFinite() || !tipPercent.isFinite() || bill < 0 || tipPercent < 0) throw CalcEx("DOMAIN", "Bill and tip must be finite and non-negative")
        if (people <= 0 || people > 100_000) throw CalcEx("DOMAIN", "People must be between 1 and 100000")
        val total = bill * (1.0 + tipPercent / 100.0)
        return SplitBillResult(total, total / people)
    }

    fun loanPayment(principal: Double, annualRatePercent: Double, months: Int): LoanResult {
        if (!principal.isFinite() || !annualRatePercent.isFinite() || principal < 0 || annualRatePercent < 0) throw CalcEx("DOMAIN", "Principal and rate must be finite and non-negative")
        if (months <= 0 || months > 1200) throw CalcEx("DOMAIN", "Months must be between 1 and 1200")
        val r = annualRatePercent / 1200.0
        val payment = if (abs(r) < 1e-15) principal / months else principal * r / (1.0 - (1.0 + r).pow(-months))
        val total = payment * months
        if (!payment.isFinite()) throw CalcEx("NON_FINITE_RESULT", "Loan calculation produced a non-finite result")
        return LoanResult(payment, total, total - principal)
    }
}
