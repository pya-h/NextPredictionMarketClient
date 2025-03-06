import { ethers } from 'ethers';

export type ContractRunnerType =
  | ethers.Wallet
  | ethers.JsonRpcProvider
  | ethers.WebSocketProvider;
