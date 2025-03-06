import { CollateralTokenType } from "./crypto-token.type"

export type PredictionMarket = {
    id: number,
    address: string,
    type: 'lmsr' | 'fpmm' | 'orderbook',
    question: string,
    questionId: string,
    outcomes: string[],
    initialLiquidity: number,
    collateralToken: CollateralTokenType,
    oracle: string,
    creator: string,
    startedAt: Date,
    closedAt?: Date,
    resolvedAt?: Date,
    status?: 'closed' | 'ongoing' | 'resolved'
    conditionId: string
    subOutcomes?: Record<string, string[]>,
    subConditions?: Record<string, string>
    // TODO:?
}