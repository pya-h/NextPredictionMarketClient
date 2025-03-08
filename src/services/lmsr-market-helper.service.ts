import { ethers } from 'ethers';
import { ConditionTokenContractData } from '../abis/ctf.abi';
import { BlockchainHelperService } from './blockchain-helper.service';
import BigNumber from 'bignumber.js';
import { PredictionMarket } from '@/types/prediction-market.type';
import { LmsrMarketMakerContractData } from '@/abis/lmsr-market.abi';

export class LmsrMarketHelperService {
  private static _instance?: LmsrMarketHelperService = undefined;

  static get() {
    if (!LmsrMarketHelperService._instance) {
      return new LmsrMarketHelperService(BlockchainHelperService.get())
    }
    return LmsrMarketHelperService._instance;
  }

  private constructor(
    private readonly blockchainHelperService: BlockchainHelperService,
  ) {
    LmsrMarketHelperService._instance = this;
  }

  private static tradeSlippage = 0.01

  async calculateOutcomeTokenPrice(
    market: PredictionMarket,
    outcomeIndex: number,
    amountInWei: bigint | string,
  ) {
    return this.blockchainHelperService.call<bigint>(
      this.blockchainHelperService.getAmmContractHandler(market),
      { name: 'calcNetCost', isView: true },
      Array.from(
        { length: market.outcomes.length },
        (_: unknown, index: number) =>
          index === outcomeIndex ? amountInWei : 0n,
      ),
    );
  }

  async calculatePriceOfBatchOutcomes(
    market: PredictionMarket,
    amountsRespectively: bigint[],
  ) {
    return this.blockchainHelperService.call<bigint>(
      this.blockchainHelperService.getAmmContractHandler(market),
      { name: 'calcNetCost', isView: true },
      amountsRespectively,
    );
  }

  async buyOutcomeToken(
    buyer: ethers.Wallet,
    market: PredictionMarket,
    outcomeTokenAmounts: BigNumber[],
    marketMakerContract: ethers.Contract,
    collateralTokenContract: ethers.Contract,
    manualCollateralLimit?: number | bigint,
  ) {
    const [cost, collateralBalance] = (
      await Promise.all([
        this.blockchainHelperService.call<bigint | number>(
          marketMakerContract,
          { name: 'calcNetCost', isView: true },
          outcomeTokenAmounts.map(x => x.toString()),
        ),
        this.blockchainHelperService.call<bigint | number>(
          collateralTokenContract,
          { name: 'balanceOf', isView: true },
          buyer.address,
        ),
      ])
    ).map((x) => BigInt(x));

    const costForSure =
      cost +
      (LmsrMarketHelperService.tradeSlippage
        ? BigInt(
          new BigNumber(cost.toString())
            .multipliedBy(LmsrMarketHelperService.tradeSlippage)
            .toFixed(0),
        )
        : 0n);

    if (costForSure > collateralBalance) {
      try {
        await this.blockchainHelperService.convertNativeTokenToCollateral(buyer, { amountInWei: costForSure - collateralBalance })
      } catch (ex) {
        const [costShorted, collateralBalanceShorted] = await Promise.all([
          this.blockchainHelperService.toEthers(
            costForSure,
            market.collateralToken,
          ),
          this.blockchainHelperService.toEthers(
            collateralBalance,
            market.collateralToken,
          ),
        ]);
        throw new Error(
          `Insufficient funds! You purchase may cost ${costShorted.toFixed(
            3,
          )} tokens. You need ${costShorted
            .minus(collateralBalanceShorted)
            .toFixed(3)} tokens more which exceeds you current balance!`,
        );
      }
    }
    await this.blockchainHelperService.call(
      collateralTokenContract,
      { name: 'approve', runner: buyer },
      market.address,
      costForSure.toString(),
    );

    return this.blockchainHelperService.call(
      marketMakerContract,
      { name: 'trade', runner: buyer },
      outcomeTokenAmounts,
      manualCollateralLimit == null || costForSure < manualCollateralLimit
        ? costForSure
        : manualCollateralLimit,
    );
  }

  async sellOutcomeToken(
    seller: ethers.Wallet,
    market: PredictionMarket,
    formattedAmounts: BigNumber[],
    marketMakerContract: ethers.Contract,
    manualCollateralLimit?: number | bigint,
  ) {
    const conditionalTokensContract = new ethers.Contract(
      ConditionTokenContractData.address,
      ConditionTokenContractData.abi,
      seller,
    );

    const isApproved = await this.blockchainHelperService.call<boolean>(
      conditionalTokensContract,
      { name: 'isApprovedForAll', isView: true, runner: seller },
      seller.address,
      market.address,
    );

    if (!isApproved) {
      await this.blockchainHelperService.call(
        conditionalTokensContract,
        {
          name: 'setApprovalForAll',
          runner: seller,
          dontWait: true,
        },
        market.address,
        true,
      );
    }

    const outcomeTokenAmounts = formattedAmounts.map(x => x.negated().toString())

    const profit = -(
      manualCollateralLimit ||
      (await this.blockchainHelperService.call<bigint>(
        marketMakerContract,
        { name: 'calcNetCost', isView: true, runner: seller },
        outcomeTokenAmounts,
      ))
    );

    return this.blockchainHelperService.call<ethers.TransactionReceipt>(
      marketMakerContract,
      { name: 'trade', runner: seller },
      outcomeTokenAmounts,
      profit,
    );
  }

  async getOutcomeTokenMarginalPrices(
    market: PredictionMarket,
    outcomeIndex: number,
  ) {
    const marketMakerContract = new ethers.Contract(
      market.address,
      LmsrMarketMakerContractData.abi,
      this.blockchainHelperService.rpcProvider,
    );

    return this.blockchainHelperService.call<bigint | number>(
      marketMakerContract,
      { name: 'calcMarginalPrice', isView: true },
      outcomeIndex,
      { from: market.address },
    );
  }
}
