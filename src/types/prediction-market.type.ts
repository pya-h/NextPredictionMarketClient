import { ethers } from "ethers"
import { Chain } from "./chain.type"
import { CollateralTokenType } from "./crypto-token.type"
import { Oracle } from "./oracle.type"

export type OutcomeToken = {
    title: string
    tokenIndex: number
    truenessRatio?: number
}

export type ConditionType = {
    id: string
    question: string,
    questionFormatted?: string,
    questionId: string,
    receipt: ethers.TransactionReceipt,
    outcomesCount: number
}

export type PredictionMarket = {
    address: string,
    type: 'lmsr' | 'fpmm' | 'orderbook',
    chain: Chain,
    question: string,
    questionFormatted?: string,
    questionId: string,
    outcomes: OutcomeToken[],
    initialLiquidity: number,
    collateralToken: CollateralTokenType,
    oracle: Oracle,
    creator: string,
    startedAt: Date,
    closedAt?: Date,
    resolvedAt?: Date,
    status?: 'closed' | 'ongoing' | 'resolved'
    conditionId: string
    subMarkets?: Record<string, PredictionMarket>
    parentAddress?: string
}