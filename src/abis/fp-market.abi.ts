export const FixedProductMarketMakerContractData = {
  // This is iconic, get the ctuyal contract data @ https://github.com/gnosis/conditional-tokens-market-makers
  address: '0x000000',
  abi: [
    {
      inputs: [
        { internalType: 'address', name: '_outcomeToken', type: 'address' },
        { internalType: 'uint256', name: '_amount', type: 'uint256' },
      ],
      name: 'buyOutcomeTokens',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: '_outcomeToken', type: 'address' },
        { internalType: 'uint256', name: '_amount', type: 'uint256' },
      ],
      name: 'sellOutcomeTokens',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
};
