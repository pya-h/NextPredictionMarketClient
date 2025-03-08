import { ethers, TransactionReceipt } from 'ethers';
import { ConditionTokenContractData } from '../abis/ctf.abi';
import { CollateralTokenType } from '@/types/crypto-token.type';
import BigNumber from 'bignumber.js';
import { PredictionMarketTypesEnum } from '../enums/market-types.enum';
import { LmsrMarketHelperService } from './lmsr-market-helper.service';
import { BlockchainHelperService } from './blockchain-helper.service';
import { OracleTypesEnum } from '@/enums/oracle-types.enum';
import { LmsrMarketMakerFactoryContractData } from '@/abis/lmsr-market.abi';
import { PredictionMarket } from '@/types/prediction-market.type';
import { Oracle } from '@/types/oracle.type';


export class PredictionMarketContractsService {
  toKeccakHash(data: string) {
    return ethers.keccak256(ethers.toUtf8Bytes(data));
  }
  private static _instance?: PredictionMarketContractsService = undefined;

  static get() {
    if(!PredictionMarketContractsService._instance) {
      return new PredictionMarketContractsService(BlockchainHelperService.get(), LmsrMarketHelperService.get())
    }
    return this._instance;
  }

  private constructor(
    private readonly blockchainHelperService: BlockchainHelperService,
    private readonly lmsrMarketHelperService: LmsrMarketHelperService,
  ) { 
    PredictionMarketContractsService._instance = this;
  }

  get conditionalTokensContract(): ethers.Contract {
    return this.blockchainHelperService.getContractHandler(
      ConditionTokenContractData,
    );
  }

  outcomeIndexToIndexSet(outcomeIndices: number | number[]) {
    if (!(outcomeIndices instanceof Array)) {
      return parseInt((10 ** +outcomeIndices).toString(), 2);
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
    outcomesCount: number,
  ) {
    const questionId = this.toKeccakHash(question);
    const receipt =
      await this.blockchainHelperService.call<ethers.TransactionReceipt>(
        this.conditionalTokensContract,
        { name: 'prepareCondition' },
        oracle.address,
        questionId,
        outcomesCount,
      );

    const conditionId = await this.blockchainHelperService.call<string>(
      this.conditionalTokensContract,
      { name: 'getConditionId', isView: true },
      oracle.address,
      questionId,
      outcomesCount,
    );

    return {
      receipt,
      id: conditionId,
      question,
      questionId,
      outcomesCount,
    };
  }

  async createMarket(
    question: string,
    outcomes: string[],
    initialLiquidityInEth: number,
    oracle: Oracle,
    subQuestions?: string[],
  ) {
    const currentChainId =
      await this.blockchainHelperService.getCurrentChainId();

    const collateralToken = this.blockchainHelperService.getCollateralToken()


    if (!collateralToken?.abi?.length)
      throw new Error(
        'Unfortunately this cryptocurrency is not supported to be used as collateral token in this network.',
      );
    const marketMakerFactoryContract =
      this.blockchainHelperService.getContractHandler(LmsrMarketMakerFactoryContractData),
      collateralTokenContract =
        this.blockchainHelperService.getContractHandler(collateralToken);
    const initialLiquidity = ethers.parseEther(
      initialLiquidityInEth.toString(),
    );

    const conditions = [
      await this.createCondition(question, oracle, outcomes.length), // or commented?
    ];

    if (subQuestions?.length) {
      for (const q of subQuestions) {
        conditions.push(await this.createCondition(q, oracle, 2));
      }
    } else {
      conditions.push(
        await this.createCondition(question, oracle, outcomes.length),
      );
    }

    const operatorCollateralBalance =
      await this.blockchainHelperService.call<bigint>(
        collateralTokenContract,
        { name: 'balanceOf', isView: true },
        this.blockchainHelperService.operatorAccount.address,
      );

    console.log(
      `#DeployMarket: Get Operator Collateral Balance - SUCCESS => ${operatorCollateralBalance}`,
    );

    if (operatorCollateralBalance < initialLiquidity) {
      await this.blockchainHelperService.call(
        collateralTokenContract,
        { name: 'deposit' },
        {
          value: initialLiquidity - operatorCollateralBalance,
        },
      );

      console.log(
        `#DeployMarket: Deposit ${initialLiquidityInEth} Collateral for Liquidity - SUCCESS`,
      );
    }

    await this.blockchainHelperService.call(
      collateralTokenContract,
      { name: 'approve' },
      LmsrMarketMakerFactoryContractData.address,
      initialLiquidity,
    );

    console.log(
      '#DeployMarket: Collateral Use Approval for AMM Factory - SUCCESS',
    );

    const lmsrFactoryTx =
      await this.blockchainHelperService.call<ethers.ContractTransactionReceipt>(
        marketMakerFactoryContract,
        { name: 'createLMSRMarketMaker' },
        ConditionTokenContractData.address, // pmSystem
        collateralToken.address,
        conditions.map((condition) => condition.id),
        0, // market fee
        '0x0000000000000000000000000000000000000000', // whitelist
        initialLiquidity,
      );

    console.log(
      `#DeployMarket: LMSR MARKET CREATION - SUCCESS => txHash: ${lmsrFactoryTx.hash}`,
    );

    const startedAt = new Date();

    const creationLog =
      await this.blockchainHelperService.getEventLogFromReceipt(
        lmsrFactoryTx,
        marketMakerFactoryContract,
        "LMSRMarketMakerCreation",
      );

    if (!creationLog[0]?.args?.["lmsrMarketMaker"]) {
      console.error(
        'Failed to find out the created market maker contract address data: creationLog:',
        null,
        { data: { tx: JSON.stringify(lmsrFactoryTx, null, 2) } },
      );
      throw new Error(
        'Although the market creation seems ok, but server fails to find its contract!',
      );
    }

    console.log(
      `#DeployMarket: Find Market Address from Market Creation Log - SUCCESS => MarketAddress: LMSRMarketMakerCreation
      }\n#DeployMarket: Market Successfully Deployed To Blockchain.`,
    );

    return {
      question,
      conditions,
      marketMakerAddress: creationLog[0].args["lmsrMarketMaker"],
      oracle,
      collateralToken,
      liquidity: initialLiquidityInEth,
      liquidityWei: initialLiquidity,
      createMarketTxHash: lmsrFactoryTx.hash,
      chainId: currentChainId,
      startedAt,
    };
  }

  getCollectionId(
    conditionId: string,
    possibleOutcomeIndices: number | number[],
    parentCollectionId: string | null = null,
  ) {
    return this.conditionalTokensContract.getCollectionId(
      parentCollectionId || this.blockchainHelperService.zeroAddress,
      conditionId,
      this.outcomeIndexToIndexSet(possibleOutcomeIndices),
    );
  }

  getCollectionIdByIndexSetValue(
    conditionId: string,
    indexSetValue: number,
    parentCollectionId: string | null = null,
  ) {
    return this.conditionalTokensContract.getCollectionId(
      parentCollectionId || this.blockchainHelperService.zeroAddress,
      conditionId,
      indexSetValue,
    );
  }

  getOutcomeSlotsCount(conditionId: string) {
    return this.conditionalTokensContract.getOutcomeSlotCount(conditionId);
  }

  async getPositionId(
    collateralToken: CollateralTokenType,
    collectionId: string,
  ) {
    return this.conditionalTokensContract.getPositionId(
      collateralToken.address,
      collectionId,
    );
  }

  async validateMarketCreation(
    conditionId: string,
    marketOutcomesCount: number = 2,
  ) {
    return (
      Number(await this.getOutcomeSlotsCount(conditionId)) ===
      marketOutcomesCount
    ); // As gnosis docs says, this is the proper way to validate the market creation operation, after calling prepareCondition.
  }

  async trade(
    traderId: number,
    market: PredictionMarket,
    selectedOutcomeIndex: number,
    amount: number,
    manualCollateralLimit?: number,
  ) {
    const trader = this.blockchainHelperService.getWallet('trader');
    const marketMakerContract =
      this.blockchainHelperService.getAmmContractHandler(market, trader);
    const collateralTokenContract =
      this.blockchainHelperService.getContractHandler(
        market.collateralToken,
        trader,
      );

    switch (market.type) {
      case PredictionMarketTypesEnum.LMSR.toString():
        const [formattedAmount, formattedCollateralLimit] = await Promise.all([
          this.blockchainHelperService.toWei(
            Math.abs(amount),
            market.collateralToken,
          ),
          manualCollateralLimit
            ? this.blockchainHelperService.toWei(
              manualCollateralLimit,
              market.collateralToken,
            )
            : null,
        ]);

        return amount > 0
          ? this.lmsrMarketHelperService.buyOutcomeToken(
            trader,
            market,
            BigInt(formattedAmount.toFixed()), // using BigNumber.toFixed() to prevent it from converting too large/small numbers to their scientific notion string
            //  which causes BigInt() throw conversion error.
            selectedOutcomeIndex,
            marketMakerContract,
            collateralTokenContract,
            formattedCollateralLimit
              ? BigInt(formattedCollateralLimit.toFixed())
              : undefined,
          )
          : this.lmsrMarketHelperService.sellOutcomeToken(
            trader,
            market,
            BigInt(formattedAmount.toFixed()),
            selectedOutcomeIndex,
            marketMakerContract,
            formattedCollateralLimit
              ? BigInt(formattedCollateralLimit.toFixed())
              : undefined,
          );
      case PredictionMarketTypesEnum.FPMM.toString():
        throw new Error('Not fully implemented yet.');
      case PredictionMarketTypesEnum.ORDER_BOOK.toString():
        throw new Error('Not implemented yet.');
    }
    throw new Error(
      'Invalid market type! Can not perform the trade.',
    );
  }

  async getConditionalTokenBalance(
    market: PredictionMarket,
    outcomeIndex: number,
    target: string,
  ) {
    const collectionId = await this.getCollectionId(
      market.conditionId,
      outcomeIndex,
    );
    if (!collectionId) throw new Error('Invalid outcome!');
    const positionId = await this.getPositionId(
      market.collateralToken,
      collectionId,
    );

    if (!positionId)
      throw new Error(
        'Something went wrong while calculating balance',
      );
    const balanceWei = await this.conditionalTokensContract.balanceOf(
      target,
      positionId,
    );

    return this.blockchainHelperService.toEthers(
      balanceWei,
      market.collateralToken,
    );
  }

  async getUserConditionalTokenBalance(
    userId: number,
    market: PredictionMarket,
    indexSet: number,
  ) {
    const userBlockchainWallet =
      this.blockchainHelperService.getWallet('trader')
    return this.getConditionalTokenBalance(
      market,
      indexSet,
      userBlockchainWallet.address,
    );
  }

  getMarketConditionalTokenBalance(market: PredictionMarket, indexSet: number) {
    return this.getConditionalTokenBalance(market, indexSet, market.address);
  }

  async getMarketOutcomePrice(
    market: PredictionMarket,
    index: number,
    amount: number = 1,
  ) {
    switch (market.type) {
      case PredictionMarketTypesEnum.LMSR.toString():
        const amountInWei = await this.blockchainHelperService.toWei(
          amount,
          market.collateralToken,
        );

        return (
          await this.blockchainHelperService.toEthers(
            await this.lmsrMarketHelperService.calculateOutcomeTokenPrice(
              market,
              index,
              BigInt(amountInWei.toFixed()),
            ),
            market.collateralToken,
          )
        ).abs();
      case PredictionMarketTypesEnum.FPMM.toString():
        throw new Error('Not fully implemented yet.');
      case PredictionMarketTypesEnum.ORDER_BOOK.toString():
        throw new Error('Not implemented yet.');
    }
  }

  async getBatchOutcomePrices(market: PredictionMarket, amounts: number[]) {
    switch (market.type) {
      case PredictionMarketTypesEnum.LMSR.toString():
        const amountsInWei = await Promise.all(
          amounts.map((amount) =>
            this.blockchainHelperService.toWei(amount, market.collateralToken),
          ),
        );

        return this.blockchainHelperService.toEthers(
          await this.lmsrMarketHelperService.calculatePriceOfBatchOutcomes(
            market,
            amountsInWei.map((x) => BigInt(x.abs().toFixed())),
          ),
          market.collateralToken,
        );
      case PredictionMarketTypesEnum.FPMM.toString():
        throw new Error('Not fully implemented yet.');
      case PredictionMarketTypesEnum.ORDER_BOOK.toString():
        throw new Error('Not implemented yet.');
    }
  }

  async getMarketAllOutcomePrices(
    market: PredictionMarket,
    amount: number = 1,
  ) {
    const amountInWei = BigInt(
      (
        await this.blockchainHelperService.toWei(
          amount || 1,
          market.collateralToken,
        )
      ).toFixed(),
    );
    if (!market.closedAt) {
      if (amount < 0) {
        amount *= -1; // Buy and sell price in resolved market are the same.
      }
      return market.outcomes?.map((outcome) => ({
        outcome: outcome.title,
        index: outcome.tokenIndex,
        price:
          outcome.truenessRatio != null ? outcome.truenessRatio * amount : null,
        token: outcome,
      }));
    }
    switch (market.type) {
      case PredictionMarketTypesEnum.LMSR.toString():
        const prices = await Promise.all(
          (
            await Promise.all(
              market.outcomes.map((outcome) =>
                this.lmsrMarketHelperService.calculateOutcomeTokenPrice(
                  market,
                  outcome.tokenIndex,
                  amountInWei,
                ),
              ),
            )
          ).map((priceInWei) =>
            this.blockchainHelperService.toEthers(
              priceInWei,
              market.collateralToken,
            ),
          ),
        );

        return prices.map((price, i) => ({
          outcome: market.outcomes[i].title,
          index: market.outcomes[i].tokenIndex,
          price: price.abs().toNumber(),
          token: market.outcomes[i],
        }));
      case PredictionMarketTypesEnum.FPMM.toString():
        throw new Error('Not fully implemented yet.');
      case PredictionMarketTypesEnum.ORDER_BOOK.toString():
        throw new Error('Not implemented yet.');
    }
  }

  async closeMarket(market: PredictionMarket) {
    const marketMakerContract =
      this.blockchainHelperService.getAmmContractHandler(market);

    return this.blockchainHelperService.call<ethers.TransactionReceipt>(
      marketMakerContract,
      { name: 'close' },
    );
  }

  async getOutcomeTokenMarginalPrices(
    market: PredictionMarket,
    outcomeIndex: number,
  ) {
    let weiPrice: bigint | number = 0n;
    switch (market.type) {
      case PredictionMarketTypesEnum.LMSR.toString():
        weiPrice =
          await this.lmsrMarketHelperService.getOutcomeTokenMarginalPrices(
            market,
            outcomeIndex,
          );
        break;
      case PredictionMarketTypesEnum.FPMM.toString():
        throw new Error('Not fully implemented yet.');
      case PredictionMarketTypesEnum.ORDER_BOOK.toString():
        throw new Error('Not implemented yet.');
      default:
        throw new Error('Invalid market type!');
    }
    return new BigNumber(weiPrice.toString()).div(
      10 **
      (await this.blockchainHelperService.getTokenDecimals(
        market.collateralToken,
      )),
    );
  }

  async resolveMarket(
    market: PredictionMarket,
    payoutVector: number[],
  ): Promise<TransactionReceipt | null> {
    switch (market.oracle.type) {
      case OracleTypesEnum.CENTRALIZED.toString():
        const oracleEthereumAccount =
          this.blockchainHelperService.getWallet("oracle")
        const conditionalTokenContract =
          this.blockchainHelperService.getContractHandler(
            ConditionTokenContractData,
            oracleEthereumAccount,
          );
        return this.blockchainHelperService.call<ethers.TransactionReceipt>(
          conditionalTokenContract,
          { name: 'reportPayouts', runner: oracleEthereumAccount },
          market.questionId,
          payoutVector,
        );

      case OracleTypesEnum.DECENTRALIZED.toString():
        throw new Error(
          'Decentralized oracle is not implemented yet.',
        );
    }
    return null;
  }

  async redeemMarketRewards(userId: number, market: PredictionMarket) {
    const indexSets = market.outcomes.map((outcomeToken) =>
      this.outcomeIndexToIndexSet(outcomeToken.tokenIndex),
    );
    const redeemer =
      this.blockchainHelperService.getWallet('trader')
    const redeemReceipt =
      await this.blockchainHelperService.call<ethers.TransactionReceipt>(
        ConditionTokenContractData,
        { name: 'redeemPositions', runner: redeemer },
        market.collateralToken.address,
        this.blockchainHelperService.zeroAddress,
        market.conditionId,
        indexSets,
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
      name: 'fee',
      isView: true,
    });
  }

  async getMarketFunding(market: PredictionMarket) {
    const marketMakerContract =
      this.blockchainHelperService.getAmmContractHandler(market);
    const fundingInWei = await this.blockchainHelperService.call<bigint>(
      marketMakerContract,
      {
        name: 'funding',
        isView: true,
      },
    );
    return (
      await this.blockchainHelperService.toEthers(
        fundingInWei,
        market.collateralToken,
      )
    ).toNumber();
  }
}
