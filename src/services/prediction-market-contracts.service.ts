import { ethers, TransactionReceipt } from "ethers";
import { ConditionTokenContractData } from "../abis/ctf.abi";
import { CollateralTokenType } from "@/types/crypto-token.type";
import BigNumber from "bignumber.js";
import { PredictionMarketTypesEnum } from "../enums/market-types.enum";
import { LmsrMarketHelperService } from "./lmsr-market-helper.service";
import { BlockchainHelperService } from "./blockchain-helper.service";
import { OracleTypesEnum } from "@/enums/oracle-types.enum";
import { LmsrMarketMakerFactoryContractData } from "@/abis/lmsr-market.abi";
import {
    OutcomeToken,
    PredictionMarket,
    SubConditionType,
} from "@/types/prediction-market.type";
import { Oracle } from "@/types/oracle.type";

export class PredictionMarketContractsService {
    toKeccakHash(data: string) {
        return ethers.keccak256(ethers.toUtf8Bytes(data));
    }
    private static _instance?: PredictionMarketContractsService = undefined;

    static get() {
        if (!PredictionMarketContractsService._instance) {
            return new PredictionMarketContractsService(
                BlockchainHelperService.get(),
                LmsrMarketHelperService.get()
            );
        }
        return PredictionMarketContractsService._instance;
    }

    private constructor(
        private readonly blockchainHelperService: BlockchainHelperService,
        private readonly lmsrMarketHelperService: LmsrMarketHelperService
    ) {
        PredictionMarketContractsService._instance = this;
    }

    get conditionalTokensContract(): ethers.Contract {
        return this.blockchainHelperService.getContractHandler(
            ConditionTokenContractData
        );
    }

    outcomeIndexToIndexSet(outcomeIndices: number | number[]) {
        if (!(outcomeIndices instanceof Array)) {
            return parseInt((10 ** +outcomeIndices).toString(), 2); // Or it could be just 2 ** index
        }
        let value = 0;
        for (const index of outcomeIndices) {
            value += parseInt((10 ** index).toString(), 2);
        }
        return value;
    }

    getNumberOfOutcomeCollections(outcomesCount: number) {
        return 2 ** outcomesCount;
    }

    async createCondition(
        question: string,
        oracle: Oracle,
        outcomesCount: number
    ) {
        const questionId = this.toKeccakHash(question);

        const receipt =
            await this.blockchainHelperService.call<ethers.TransactionReceipt>(
                this.conditionalTokensContract,
                { name: "prepareCondition" },
                oracle.address,
                questionId,
                outcomesCount
            );

        const conditionId = await this.blockchainHelperService.call<string>(
            this.conditionalTokensContract,
            { name: "getConditionId", isView: true },
            oracle.address,
            questionId,
            outcomesCount
        );

        return {
            receipt,
            id: conditionId,
            question,
            questionId,
            outcomesCount,
        };
    }

    getOracle() {
        const acc = this.blockchainHelperService.getReservedAccounts("oracle");
        return {
            address: acc.public,
            private: acc.private,
            type: "centralized",
        } as Oracle;
    }

    async getUserCollateralTokenBalance(
        userId: number,
        market: PredictionMarket
    ) {
        return this.blockchainHelperService.toEthers(
            await this.blockchainHelperService.getTokenBalance(
                this.blockchainHelperService.getReservedAccounts(
                    "trader",
                    userId
                ).public,
                market.collateralToken
            ),
            market.collateralToken
        );
    }

    async createMarket(
        question: string,
        outcomes: string[],
        initialLiquidityInEth: number,
        {
            oracle = undefined,
            outcomeQuestions = undefined,
        }: { oracle?: Oracle; outcomeQuestions?: Record<string, string> } = {}
    ) {
        const currentChain = this.blockchainHelperService.getChain();

        const collateralToken =
            this.blockchainHelperService.getCollateralToken();

        if (!oracle) {
            oracle = this.getOracle();
        }

        if (!collateralToken?.abi?.length)
            throw new Error(
                "Unfortunately this cryptocurrency is not supported to be used as collateral token in this network."
            );
        const marketMakerFactoryContract =
                this.blockchainHelperService.getContractHandler(
                    LmsrMarketMakerFactoryContractData
                ),
            collateralTokenContract =
                this.blockchainHelperService.getContractHandler(
                    collateralToken
                );
        const initialLiquidity = ethers.parseEther(
            initialLiquidityInEth.toString()
        );

        const questionFormatted = Date.now().toString() + "-" + question;
        const conditions = [
            await this.createCondition(
                questionFormatted,
                oracle,
                outcomes.length
            ), // or commented?
        ];
        let atomicOutcomesCount = outcomes.length;
        const subConditions: Record<string, SubConditionType> = {};
        if (outcomeQuestions && Object.keys(outcomeQuestions)?.length) {
            for (const outcome in outcomeQuestions) {
                const qf =
                    Date.now().toString() + "-" + outcomeQuestions[outcome];
                const condition = await this.createCondition(qf, oracle, 2);
                atomicOutcomesCount *= 2;
                conditions.push(condition);
                subConditions[outcome] = {
                    question: outcomeQuestions[outcome],
                    questionId: condition.questionId,
                    id: condition.id,
                    questionFormatted: condition.question,
                } as SubConditionType;
            }
        }

        const operatorCollateralBalance =
            await this.blockchainHelperService.call<bigint>(
                collateralTokenContract,
                { name: "balanceOf", isView: true },
                this.blockchainHelperService.operatorAccount.address
            );

        console.log(
            `#DeployMarket: Get Operator Collateral Balance - SUCCESS => ${operatorCollateralBalance}`
        );

        if (operatorCollateralBalance < initialLiquidity) {
            await this.blockchainHelperService.call(
                collateralTokenContract,
                { name: "deposit" },
                {
                    value: initialLiquidity - operatorCollateralBalance,
                }
            );

            console.log(
                `#DeployMarket: Deposit ${initialLiquidityInEth} Collateral for Liquidity - SUCCESS`
            );
        }

        await this.blockchainHelperService.call(
            collateralTokenContract,
            { name: "approve" },
            LmsrMarketMakerFactoryContractData.address,
            initialLiquidity
        );

        console.log(
            "#DeployMarket: Collateral Use Approval for AMM Factory - SUCCESS"
        );

        const lmsrFactoryTx =
            await this.blockchainHelperService.call<ethers.ContractTransactionReceipt>(
                marketMakerFactoryContract,
                { name: "createLMSRMarketMaker" },
                ConditionTokenContractData.address, // pmSystem
                collateralToken.address,
                conditions.map((condition) => condition.id),
                0, // market fee
                "0x0000000000000000000000000000000000000000", // whitelist
                initialLiquidity
            );

        console.log(
            `#DeployMarket: LMSR MARKET CREATION - SUCCESS => txHash: ${lmsrFactoryTx.hash}`
        );

        const startedAt = new Date();

        const creationLog =
            await this.blockchainHelperService.getEventLogFromReceipt(
                lmsrFactoryTx,
                marketMakerFactoryContract,
                "LMSRMarketMakerCreation"
            );

        if (!creationLog[0]?.args?.["lmsrMarketMaker"]) {
            console.error(
                "Failed to find out the created market maker contract address data: creationLog:",
                null,
                { data: { tx: JSON.stringify(lmsrFactoryTx, null, 2) } }
            );
            throw new Error(
                "Although the market creation seems ok, but server fails to find its contract!"
            );
        }

        console.log(
            `#DeployMarket: Find Market Address from Market Creation Log - SUCCESS => MarketAddress: LMSRMarketMakerCreation
      }\n#DeployMarket: Market Successfully Deployed To Blockchain.`
        );

        return {
            address: creationLog[0].args["lmsrMarketMaker"],
            chain: currentChain,
            collateralToken,
            conditionId: conditions[0].id,
            question,
            questionId: conditions[0].questionId,
            questionFormatted,
            subConditions,
            creator: this.blockchainHelperService.operatorAccount.address,
            oracle,
            initialLiquidity: initialLiquidityInEth,
            startedAt,
            type: "lmsr",
            outcomes: outcomes.map((outcomeTitle, idx) => ({
                title: outcomeTitle,
                tokenIndex: idx,
                ...(subConditions[outcomeTitle]
                    ? {
                          sub: [
                              { title: "Yes", tokenIndex: 0 },
                              { title: "No", tokenIndex: 1 },
                          ],
                      }
                    : {}),
            })),
            atomicOutcomesCount,
        } as PredictionMarket;
    }

    getCollectionId(
        conditionId: string,
        possibleOutcomeIndices: number | number[],
        parentCollectionId: string | null = null,
        convertIndexToIndexset = true
    ) {
        return this.conditionalTokensContract.getCollectionId(
            parentCollectionId || this.blockchainHelperService.zeroAddress,
            conditionId,
            convertIndexToIndexset || possibleOutcomeIndices instanceof Array
                ? this.outcomeIndexToIndexSet(possibleOutcomeIndices)
                : possibleOutcomeIndices
        );
    }

    getOutcomeSlotsCount(conditionId: string) {
        return this.conditionalTokensContract.getOutcomeSlotCount(conditionId);
    }

    async getPositionId(
        collateralToken: CollateralTokenType,
        collectionId: string
    ) {
        return this.conditionalTokensContract.getPositionId(
            collateralToken.address,
            collectionId
        );
    }

    async validateMarketCreation(
        conditionId: string,
        marketOutcomesCount: number = 2
    ) {
        return (
            Number(await this.getOutcomeSlotsCount(conditionId)) ===
            marketOutcomesCount
        ); // As gnosis docs says, this is the proper way to validate the market creation operation, after calling prepareCondition.
    }

    async trade(
        traderId: number,
        market: PredictionMarket,
        amounts: number[],
        {
            manualCollateralLimit = undefined,
            isSelling = false,
        }: {
            manualCollateralLimit?: number;
            isSelling?: boolean;
        } = {}
    ) {
        const trader = this.blockchainHelperService.getWallet(
            "trader",
            traderId
        );
        const marketMakerContract =
            this.blockchainHelperService.getAmmContractHandler(market, trader);
        const collateralTokenContract =
            this.blockchainHelperService.getContractHandler(
                market.collateralToken,
                trader
            );

        switch (market.type) {
            case PredictionMarketTypesEnum.LMSR.toString():
                const [formattedCollateralLimit, ...formattedAmounts] =
                    await Promise.all([
                        manualCollateralLimit
                            ? this.blockchainHelperService.toWei(
                                  manualCollateralLimit,
                                  market.collateralToken
                              )
                            : null,
                        ...amounts.map((amount) =>
                            this.blockchainHelperService.toWei(
                                amount,
                                market.collateralToken
                            )
                        ),
                    ]);

                return !isSelling
                    ? this.lmsrMarketHelperService.buyOutcomeToken(
                          trader,
                          market,
                          formattedAmounts,
                          marketMakerContract,
                          collateralTokenContract,
                          formattedCollateralLimit
                              ? BigInt(formattedCollateralLimit.toFixed())
                              : undefined
                      )
                    : this.lmsrMarketHelperService.sellOutcomeToken(
                          trader,
                          market,
                          formattedAmounts,
                          marketMakerContract,
                          formattedCollateralLimit
                              ? BigInt(formattedCollateralLimit.toFixed())
                              : undefined
                      );
            case PredictionMarketTypesEnum.FPMM.toString():
                throw new Error("Not fully implemented yet.");
            case PredictionMarketTypesEnum.ORDER_BOOK.toString():
                throw new Error("Not implemented yet.");
        }
        throw new Error("Invalid market type! Can not perform the trade.");
    }

    async getConditionalTokenBalance(
        market: PredictionMarket,
        outcomeIndex: number,
        target: string,
        subConditionId: string | null = null,
        parentCollectionId: string | null | undefined = null,
        convertIndexToIndexset: boolean = true,
        outcome?: OutcomeToken
    ) {
        const collectionId = await this.getCollectionId(
            subConditionId || market.conditionId,
            outcomeIndex,
            subConditionId?.length && parentCollectionId?.length
                ? parentCollectionId
                : null,
            convertIndexToIndexset
        );
        if (!collectionId) throw new Error("Invalid outcome!");

        const positionId = await this.getPositionId(
            market.collateralToken,
            collectionId
        );

        if (!positionId)
            throw new Error("Something went wrong while calculating balance");
        const balanceWei = await this.conditionalTokensContract.balanceOf(
            target,
            positionId
        );

        return (
            await this.blockchainHelperService.toEthers(
                balanceWei,
                market.collateralToken
            )
        ).toNumber();
    }

    /*async getSharesInMarket(
        market: PredictionMarket,
        traderId: number | null = null
    ) {
        const target =
            traderId == null
                ? market.address
                : this.blockchainHelperService.getWallet("trader", traderId)
                      .address;

        const tokenBalances = await Promise.all(
            market.outcomes.map((outcome) =>
                this.getConditionalTokenBalance(
                    market,
                    outcome.tokenIndex,
                    target
                )
            )
        );

        if (
            !market.atomicOutcomesCount ||
            market.outcomes.length === market.atomicOutcomesCount
        ) {
            return tokenBalances;
        }
        for (const outcome of market.outcomes) {
            if (!outcome.sub || !Object.values(outcome.sub)?.length) {
                continue;
            }

            tokenBalances.push(
                ...(await Promise.all(
                    outcome.sub.map(async (subOutcome) => {
                        const parentCollectionId = await this.getCollectionId(
                            market.conditionId,
                            outcome.tokenIndex
                        );
                        const balance = await this.getConditionalTokenBalance(
                            market,
                            subOutcome.tokenIndex,
                            target,
                            market.subConditions?.[outcome.title]?.id,
                            outcome.collectionId,
                            true,
                            outcome
                        );
                        console.log({
                            tokenIndex: subOutcome.tokenIndex,
                            title: subOutcome.title,
                            parent: parentCollectionId,
                            parentF: outcome.collectionId,
                            parentTitle: outcome.title,
                            subCondition: market.subConditions?.[outcome.title],
                            balance,
                        });
                        return balance;
                    })
                ))
            );
        }
        return tokenBalances;
    }*/

    // async getSharesInMarket(
    //     market: PredictionMarket,
    //     traderId: number | null = null
    // ) {
    //     const target =
    //         traderId == null
    //             ? market.address
    //             : this.blockchainHelperService.getWallet("trader", traderId)
    //                   .address;
    //     if (
    //         !market.atomicOutcomesCount ||
    //         market.outcomes.length === market.atomicOutcomesCount
    //     ) {
    //         const tokenBalances = await Promise.all(
    //             market.outcomes.map((outcome) =>
    //                 this.getConditionalTokenBalance(
    //                     market,
    //                     outcome.tokenIndex,
    //                     target
    //                 )
    //             )
    //         );

    //         return tokenBalances;
    //     }
    //     // in sub outcome case
    //     const tokenBalances: number[] = []

    //     // for (const outcome of market.outcomes) {
    //     //     if (!outcome.sub || !Object.values(outcome.sub)?.length) {
    //     //         continue; // FIXME: This kind of outcomes should be managed too
    //     //     }
    //     //     outcome.collectionId = await this.getCollectionId(market.conditionId, outcome.tokenIndex);
    //     //     tokenBalances.push(
    //     //         ...(await Promise.all(
    //                 // Array(outcome.sub.length ** market.outcomes.length).fill(0).map((_,i) =>
    //                 //     this.getConditionalTokenBalance(
    //                 //         market,
    //                 //         i,
    //                 //         target,
    //                 //         market.subConditions?.[outcome.title]?.id,
    //                 //         outcome.collectionId,
    //                 //         false,
    //                 //     )
    //                 // )
    //     //         ))
    //     //     );
    //     // }
    //     // return tokenBalances;
    //     const parent = await this.getCollectionId(market.conditionId, 0);
    //     return Promise.all(
    //         Array(market.atomicOutcomesCount).fill(0).map((_,i) =>
    // this.getConditionalTokenBalance(
    //     market,
    //     i,
    //     target,
    //     market.subConditions?.["B"]?.id,
    //     parent,
    //     false,
    // )
    //         )
    //     )
    // }

    async getSharesInMarket(
        market: PredictionMarket,
        traderId: number | null = null
    ) {
        const target =
            traderId == null
                ? market.address
                : this.blockchainHelperService.getWallet("trader", traderId)
                      .address;
        const tokenBalances: number[] = [];
        const subConditions = Object.values(market.subConditions ?? {});
        const subOutcomes = market.outcomes[0].sub;
        for (const subOutcome of subOutcomes ?? []) {
            for (const outcome of market.outcomes) {
                const parentCollectionId = await this.getCollectionId(
                    market.conditionId,
                    outcome.tokenIndex
                );
                tokenBalances.push(
                    await this.getConditionalTokenBalance(
                        market,
                        subOutcome.tokenIndex,
                        target,
                        subConditions[0].id,
                        parentCollectionId
                    )
                );
            }
        }

        return tokenBalances;
    }

    getMarketConditionalTokenBalance(
        market: PredictionMarket,
        indexSet: number
    ) {
        return this.getConditionalTokenBalance(
            market,
            indexSet,
            market.address
        );
    }

    async getMarketOutcomePrice(
        market: PredictionMarket,
        index: number,
        amount: number = 1
    ) {
        switch (market.type) {
            case PredictionMarketTypesEnum.LMSR.toString():
                const amountInWei = await this.blockchainHelperService.toWei(
                    amount,
                    market.collateralToken
                );

                return (
                    await this.blockchainHelperService.toEthers(
                        await this.lmsrMarketHelperService.calculateOutcomeTokenPrice(
                            market,
                            index,
                            BigInt(amountInWei.toFixed())
                        ),
                        market.collateralToken
                    )
                ).abs();
            case PredictionMarketTypesEnum.FPMM.toString():
                throw new Error("Not fully implemented yet.");
            case PredictionMarketTypesEnum.ORDER_BOOK.toString():
                throw new Error("Not implemented yet.");
        }
    }

    async getBatchOutcomePrices(market: PredictionMarket, amounts: number[]) {
        switch (market.type) {
            case PredictionMarketTypesEnum.LMSR.toString():
                const amountsInWei = await Promise.all(
                    amounts.map((amount) =>
                        this.blockchainHelperService.toWei(
                            amount,
                            market.collateralToken
                        )
                    )
                );

                return this.blockchainHelperService.toEthers(
                    await this.lmsrMarketHelperService.calculatePriceOfBatchOutcomes(
                        market,
                        amountsInWei.map((x) => BigInt(x.abs().toFixed()))
                    ),
                    market.collateralToken
                );
            case PredictionMarketTypesEnum.FPMM.toString():
                throw new Error("Not fully implemented yet.");
            case PredictionMarketTypesEnum.ORDER_BOOK.toString():
                throw new Error("Not implemented yet.");
        }
    }

    async getMarketAllOutcomePrices(
        market: PredictionMarket,
        amount: number = 1
    ) {
        const amountInWei = BigInt(
            (
                await this.blockchainHelperService.toWei(
                    amount || 1,
                    market.collateralToken
                )
            ).toFixed()
        );
        if (market.closedAt) {
            if (amount < 0) {
                amount *= -1; // Buy and sell price in resolved market are the same.
            }
            return market.outcomes?.map((outcome) => ({
                outcome: outcome.title,
                index: outcome.tokenIndex,
                price:
                    outcome.truenessRatio != null
                        ? new BigNumber(outcome.truenessRatio * amount)
                        : null,
                token: outcome,
            })); // TODO: What about a market with subs?
        }
        switch (market.type) {
            case PredictionMarketTypesEnum.LMSR.toString():
                const prices = await Promise.all(
                    (
                        await Promise.all(
                            Array(market.atomicOutcomesCount)
                                .fill(0)
                                .map((_, index) =>
                                    this.lmsrMarketHelperService.calculateOutcomeTokenPrice(
                                        market,
                                        index,
                                        amountInWei
                                    )
                                )
                        )
                    ).map((priceInWei) =>
                        this.blockchainHelperService.toEthers(
                            priceInWei,
                            market.collateralToken
                        )
                    )
                );

                return prices.map((price, i) => ({
                    // FIXME: use subOutcomes data
                    // outcome: market.outcomes[i].title,
                    // index: market.outcomes[i].tokenIndex,
                    price: price.abs(),
                    // token: market.outcomes[i],
                }));
            case PredictionMarketTypesEnum.FPMM.toString():
                throw new Error("Not fully implemented yet.");
            case PredictionMarketTypesEnum.ORDER_BOOK.toString():
                throw new Error("Not implemented yet.");
        }
    }

    async closeMarket(market: PredictionMarket) {
        const marketMakerContract =
            this.blockchainHelperService.getAmmContractHandler(market);

        return this.blockchainHelperService.call<ethers.TransactionReceipt>(
            marketMakerContract,
            { name: "close" }
        );
    }

    async getOutcomeTokenMarginalPrices(
        market: PredictionMarket,
        outcomeIndex: number
    ) {
        let weiPrice: bigint | number = 0n;
        switch (market.type) {
            case PredictionMarketTypesEnum.LMSR.toString():
                weiPrice =
                    await this.lmsrMarketHelperService.getOutcomeTokenMarginalPrices(
                        market,
                        outcomeIndex
                    );
                break;
            case PredictionMarketTypesEnum.FPMM.toString():
                throw new Error("Not fully implemented yet.");
            case PredictionMarketTypesEnum.ORDER_BOOK.toString():
                throw new Error("Not implemented yet.");
            default:
                throw new Error("Invalid market type!");
        }
        return new BigNumber(weiPrice.toString()).div(
            10 **
                (await this.blockchainHelperService.getTokenDecimals(
                    market.collateralToken
                ))
        );
    }

    async resolveMarket(
        market: PredictionMarket,
        payoutVector: number[]
    ): Promise<TransactionReceipt | null> {
        switch (market.oracle.type) {
            case OracleTypesEnum.CENTRALIZED.toString():
                const oracleEthereumAccount =
                    this.blockchainHelperService.getWallet("oracle");
                const conditionalTokenContract =
                    this.blockchainHelperService.getContractHandler(
                        ConditionTokenContractData,
                        oracleEthereumAccount
                    );
                return this.blockchainHelperService.call<ethers.TransactionReceipt>(
                    conditionalTokenContract,
                    { name: "reportPayouts", runner: oracleEthereumAccount },
                    market.questionId,
                    payoutVector
                );

            case OracleTypesEnum.DECENTRALIZED.toString():
                throw new Error("Decentralized oracle is not implemented yet.");
        }
        return null;
    }

    async redeemMarketRewards(
        traderId: number,
        market: PredictionMarket,
        specificOutcomeIndex: number | null = null
    ) {
        const indexSets =
            specificOutcomeIndex == null
                ? market.outcomes.map((outcomeToken) =>
                      this.outcomeIndexToIndexSet(outcomeToken.tokenIndex)
                  )
                : [this.outcomeIndexToIndexSet(specificOutcomeIndex)];

        const redeemer = this.blockchainHelperService.getWallet(
            "trader",
            traderId
        );
        const redeemReceipt =
            await this.blockchainHelperService.call<ethers.TransactionReceipt>(
                ConditionTokenContractData,
                { name: "redeemPositions", runner: redeemer },
                market.collateralToken.address,
                this.blockchainHelperService.zeroAddress,
                market.conditionId,
                indexSets
            );

        // TODO: search for PayoutRedemption event:
        //    also Get total amount redeemed for user; return/throw proper message if the amount is zero
        return {
            receipt: redeemReceipt,
        };
    }

    getMarketTradeFee(market: PredictionMarket) {
        const marketMakerContract =
            this.blockchainHelperService.getAmmContractHandler(market);
        return this.blockchainHelperService.call(marketMakerContract, {
            name: "fee",
            isView: true,
        });
    }

    async getMarketFunding(market: PredictionMarket) {
        const marketMakerContract =
            this.blockchainHelperService.getAmmContractHandler(market);
        const fundingInWei = await this.blockchainHelperService.call<bigint>(
            marketMakerContract,
            {
                name: "funding",
                isView: true,
            }
        );
        return (
            await this.blockchainHelperService.toEthers(
                fundingInWei,
                market.collateralToken
            )
        ).toNumber();
    }
}
