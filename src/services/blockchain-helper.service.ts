import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';

import { ContractIdentifiersType } from '../types/contract-identifier.type';

import { ContractRunnerType } from '../types/contract-runner.type';
import { LmsrMarketMakerContractData } from '@/abis/lmsr-market.abi';
import { Chain } from '@/types/chain.type';
import { Weth9CollateralToken } from '@/abis/collateral-tokens.abi';
import { CollateralTokenType } from '@/types/crypto-token.type';

export class BlockchainHelperService {
  private provider: ethers.JsonRpcProvider;
  private operator: ethers.Wallet;
  private static gasRefillMultiplier = 0 // disable

  constructor(
  ) {

    const net = this.getChain();
    this.provider = new ethers.JsonRpcProvider(net.rpcUrl);
    this.operator = this.getWallet('operator');
  }

  getWallet(type: 'operator' | 'oracle' | 'trader' = 'trader') {
    switch (type) {
      case 'operator':
        return new ethers.Wallet(this.zeroAddress, this.provider); // TODO:
      case 'oracle':
        return new ethers.Wallet(this.zeroAddress, this.provider); // TODO: 
      default:
        return new ethers.Wallet(this.zeroAddress, this.provider); // TODO:
    }
  }

  get zeroAddress() {
    return '0x0000000000000000000000000000000000000000000000000000000000000000';
  }

  get operatorAccount() {
    return this.operator;
  }

  get rpcProvider() {
    return this.provider;
  }


  getPrimaryAddresses(num: number, specificLength: number = 64) {
    return `0x${'0'.repeat(specificLength - num.toString().length)}${num}`;
  }

  async getCurrentChainId() {
    return Number((await this.provider.getNetwork()).chainId);
  }

  async toWei(amount: number | bigint, token: CollateralTokenType) {
    return new BigNumber(amount.toString()).multipliedBy(
      10 ** (await this.getTokenDecimals(token)),
    );
  }

  async toEthers(
    amount: bigint | number | BigNumber,
    token: CollateralTokenType,
  ) {
    return (
      amount instanceof BigNumber ? amount : new BigNumber(amount?.toString())
    ).div(10 ** (await this.getTokenDecimals(token)));
  }

  weiToEthers(amount: bigint | number) {
    return new BigNumber(amount.toString()).div(1e18);
  }

  async getTokenDecimals(token: CollateralTokenType) {
    const contract = new ethers.Contract(token.address, token.abi, this.provider);
    return Number(await contract.decimals());
  }

  getChain() {
    return { id: 1337, rpcUrl: 'http://127.0.0.1:8545', wsRpcUrl: 'ws://127.0.0.1:8545' } as Chain
  }

  getContractHandler(
    { address, abi }: ContractIdentifiersType,
    specificRunner?: ContractRunnerType,
  ) {
    return new ethers.Contract(
      address,
      abi,
      specificRunner || this.operatorAccount,
    );
  }

  getAmmContractHandler(
    marketAddress: string,
    specificRunner?: ContractRunnerType,
  ) {
    return new ethers.Contract(
      marketAddress,
      LmsrMarketMakerContractData.abi,
      specificRunner || this.operatorAccount,
    );
  }

  getWalletHandler(
    privateKey: string,
    specificProvider?: ethers.JsonRpcProvider,
  ) {
    return new ethers.Wallet(
      privateKey,
      specificProvider || this.provider,
    );
  }

  isANonceError(err: Error) {
    return (
      // TODO: Checkout if there's a check-by-type approach ...
      err.message.includes('correct nonce') ||
      err.message.includes('transaction underpriced')
    );
  }

  async call<T = ethers.TransactionReceipt | ethers.TransactionResponse>(
    contractData: ContractIdentifiersType,
    func: {
      name: string;
      isView?: boolean;
      runner?: ethers.Wallet;
      dontWait?: boolean; // Using this will increase speed but its risky a little;
      // When an account has a Failed tx (due to any reason), when trying its next valid tx, this will cause nonce mismatch error.
      preventNonceMismatchRetry?: boolean;
    },
    ...args: ethers.ContractMethodArgs<unknown[]>
  ): Promise<T>;

  async call<T = ethers.TransactionReceipt | ethers.TransactionResponse>(
    contract: ethers.Contract,
    func: {
      name: string;
      isView?: boolean;
      runner?: ethers.Wallet;
      dontWait?: boolean;
      preventNonceMismatchRetry?: boolean;
    },
    ...args: ethers.ContractMethodArgs<unknown[]>
  ): Promise<T>;

  async call<T = ethers.TransactionReceipt | ethers.TransactionResponse>(
    contractData: ethers.Contract | ContractIdentifiersType,
    func: {
      name: string;
      isView?: boolean;
      runner?: ethers.Wallet;
      dontWait?: boolean;
      preventNonceMismatchRetry?: boolean;
    },
    ...args: ethers.ContractMethodArgs<any[]>
  ): Promise<T> {
    const contract =
      contractData instanceof ethers.Contract
        ? contractData
        : new ethers.Contract(
          contractData.address,
          contractData.abi,
          func.runner || this.operatorAccount,
        );

    if (func.isView) {
        return (await contract[func.name](...args)) as T;
    }

    try {
      if (func.runner && func.runner.address !== this.operator.address) {
        const [gas, feeData, userExactNativeTokenBalance] = await Promise.all([
          contract[func.name].estimateGas(...args),
          this.provider.getFeeData(),
          this.provider.getBalance(func.runner.address),
        ]);

        const estimatedGas = new BigNumber(
          (gas * (feeData?.maxFeePerGas ?? 0n)).toString(),
        );

        const userAvailableNativeTokenBalance =
          userExactNativeTokenBalance -
          BigInt((func?.name === 'deposit' && args[0].value) || 0);


        if (
          estimatedGas.gte(userAvailableNativeTokenBalance.toString()) &&
          BlockchainHelperService.gasRefillMultiplier // set BlockchainHelperService.gasRefillMultiplier to zero, to disable gas provision process
        ) {
          const gasChargeAmount = estimatedGas.multipliedBy(
            BlockchainHelperService.gasRefillMultiplier,
          );

          try {
            const gasProvideTx = await this.operator.sendTransaction({
              to: func.runner.address,
              value: BigInt(gasChargeAmount.toFixed()),
            });
            if (!func.dontWait) {
              const log = await gasProvideTx.wait();
              console.info(
                `Operator donated gas to user#${func.runner.address}`,
                {
                  data: {
                    targetId: func.runner,
                    onFunction: func.name,
                    tx: gasProvideTx.toJSON(),
                    log: log?.toJSON(),
                  },
                },
              );
            } else {
              console.info(
                `Operator donated gas to user#${func.runner.address}`,
                {
                  data: {
                    targetId: func.runner,
                    onFunction: func.name,
                    tx: gasProvideTx.toJSON(),
                  },
                },
              );
            }
          } catch (ex) {
            const operatorBalance = (
              await this.provider.getBalance(this.operator.address)
            ).toString();

            console.error(
              `Operator failed to charge User#${func.runner.address}'s gas tank; Checkout operator balance...`,
              ex as Error,
              {
                data: {
                  operatorBalance,
                  estimatedGas: estimatedGas.toFixed(),
                  ...func.runner,
                },
              },
            );

            if (gasChargeAmount.gte(operatorBalance)) {
              // TODO: Inform the admin (or whatever) with fastest mean [discuss this.]
              throw new Error(
                'Server is not ready to complete your request... Please try again some time later.',
              );
            }
            throw new Error(
              'Unexpected error happened while trying to complete your request!',
            );
          }
        }
      }

      const tx: ethers.TransactionResponse = await contract[func.name](...args);
      if (func.dontWait) {
        return tx as T;
      }
      return (await tx.wait()) as T;
    } catch (ex) {
      if (func.preventNonceMismatchRetry || !this.isANonceError(ex as Error)) {
        throw ex;
      }
      return this.call<T>(
        contract,
        { ...func, preventNonceMismatchRetry: true },
        ...args,
      );
    }
  }

  async getEventLogFromReceipt(
    transactionReceipt: ethers.ContractTransactionReceipt,
    contract: ethers.Contract,
    eventName: string,
  ): Promise<ethers.LogDescription[]> {
    try {
      const eventFragment = contract.interface.getEvent(eventName);
      if(!eventFragment) {
        throw new Error('Event not found!')
      }
      const eventTopics = contract.interface.encodeFilterTopics(
        eventFragment,
        [],
      );

      const logs = transactionReceipt.logs.filter(
        (log) => log.topics[0] === eventTopics[0], // Compare the event signature topic
      );
      return logs.map((log) => contract.interface.parseLog(log)).filter(log => log !== null)
    } catch (error) {
      throw error;
    }
  }

  getCollateralToken() {
    return {name: 'Wrapped Ethereum 9', symbol: 'WETH9', ...Weth9CollateralToken} as CollateralTokenType
  }
  
  async convertNativeTokenToCollateral(
    ownerPrivateKey: string,
    chain: Chain,
    {
      amount = undefined,
      amountInWei = undefined,
    }: { amountInWei?: bigint | BigNumber; amount?: number },
  ) {
    const ownerWallet = new ethers.Wallet(ownerPrivateKey, this.provider);
    const targetToken = this.getCollateralToken();
    if (!amountInWei) {
      if (!amount) {
        throw new Error(
          `Amount of conversion to ${targetToken.symbol} not specified!`,
        );
      }
      amountInWei = await this.toWei(amount, targetToken);
    }
    const targetTokenContract = this.getContractHandler(
      targetToken,
      ownerWallet,
    );
    return {
      token: targetToken,
      receipt: await this.call<ethers.TransactionReceipt>(
        targetTokenContract,
        { name: 'deposit', runner: ownerWallet },
        {
          value: amountInWei.toString(),
        },
      ),
    };
  }
}
