import { Chain } from "./chain.type"
import { CollateralTokenType } from "./crypto-token.type"
import { Oracle } from "./oracle.type"

export type OutcomeToken = {
    title: string
    tokenIndex: number
    truenessRatio?: number
    sub?: OutcomeToken[]
}

export type PredictionMarket = {
    id: number,
    address: string,
    type: 'lmsr' | 'fpmm' | 'orderbook',
    chain: Chain,
    question: string,
    questionFormattted?: string,
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
    subConditions?: Record<string, string>
    // TODO:?
}