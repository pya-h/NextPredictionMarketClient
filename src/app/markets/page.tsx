"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { PredictionMarketContractsService } from "@/services/prediction-market-contracts.service";
import { PredictionMarket } from "@/types/prediction-market.type";
import { Bounce, toast } from "react-toastify";
import { MarketStorage } from "@/utils/market-storage";

const tableStyles = {
    container: "bg-gray-900 rounded-lg shadow-lg overflow-hidden",
    header: "bg-gray-800 px-6 py-4",
    title: "text-xl font-bold text-white",
    content: "p-6",
    table: "min-w-full divide-y divide-gray-700",
    th: "px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider",
    td: "px-6 py-4 whitespace-nowrap text-sm text-gray-300",
    tr: "hover:bg-gray-700 transition-colors duration-200",
    select: "bg-gray-700 border border-gray-600 text-white rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500",
    input: "bg-gray-700 border border-gray-600 text-white rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500",
    button: {
        base: "px-4 py-2 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800",
        buy: "bg-green-600 hover:bg-green-700 text-white",
        sell: "bg-red-600 hover:bg-red-700 text-white",
        neutral: "bg-blue-600 hover:bg-blue-700 text-white",
    },
    outcomeCard: {
        base: "border rounded-lg p-4 cursor-pointer transition-all duration-200",
        selected: "border-blue-500 bg-blue-900/30",
        unselected: "border-gray-700 hover:border-gray-500",
    },
};

export default function Markets() {
    const [markets, setMarkets] = useState<PredictionMarket[]>([]);
    const [selectedMarket, setSelectedMarket] =
        useState<PredictionMarket | null>(null);
    const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null);
    const [traderSelection, setTraderSelection] = useState(0);
    const [amount, setAmount] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [stateUpdateTrigger, setStateUpdateTrigger] = useState(false);
    const [tokenPrices, setTokenPrices] = useState<number[]>([]);
    const [userShares, setUserShares] = useState<number[]>([]);

    const triggerStateUpdate = () => {
        setStateUpdateTrigger((x) => !x);
    };

    useEffect(() => {
        if (!selectedMarket) {
            return;
        }
        const service = PredictionMarketContractsService.get();
        service.getMarketAllOutcomePrices(selectedMarket).then((r) => {
            r?.length && setTokenPrices(r.map((token) => token.price ?? 0));
        });
        service
            .getUserSharesInMarket(selectedMarket, traderSelection)
            .then((r) => {
                r?.length && setUserShares(r.map((balance) => +balance));
            });
    }, [traderSelection, selectedMarket, stateUpdateTrigger]);

    useEffect(() => {
        const loadMarkets = () => {
            try {
                const storedMarkets = MarketStorage.get().findAll();
                if (storedMarkets?.length) {
                    setMarkets(storedMarkets);
                    setSelectedMarket(storedMarkets[0]);
                } else {
                    setMarkets([]);
                    setSelectedMarket(null);
                }
            } catch (error) {
                console.error("Error loading markets:", error);
            }
        };

        loadMarkets();
    }, []);

    const handleMarketChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const marketId = e.target.value;
        const market = markets.find((m) => m.address === marketId) || null;
        setSelectedMarket(market);
        setSelectedOutcome(null);
    };

    const handleOutcomeSelect = (index: number) => {
        setSelectedOutcome(index);
    };

    const handleTrade = async (isSelling: boolean = false) => {
        if (!selectedMarket || selectedOutcome === null || !amount) {
            toast.error(
                "Please select a market, outcome, and enter an amount",
                {
                    position: "top-right",
                    transition: Bounce,
                }
            );
            return;
        }

        setIsLoading(true);
        try {
            const service = PredictionMarketContractsService.get();

            await service.trade(
                traderSelection,
                selectedMarket,
                selectedMarket.outcomes.map((_, idx) =>
                    idx === selectedOutcome ? parseFloat(amount) : 0
                ),
                { isSelling }
            );

            toast.success("Trade executed successfully!", {
                position: "top-right",
                transition: Bounce,
            });
            triggerStateUpdate();
            setAmount("");
        } catch (error) {
            console.error("Error executing trade:", error);
            toast.error("Failed to execute trade. Please try again.", {
                position: "top-left",
                transition: Bounce,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleResolve = async () => {
        if (!selectedMarket) {
            toast.warn("Select the market first!", {
                position: "top-center",
                transition: Bounce,
            });
            return;
        }
        if (selectedMarket.resolvedAt) {
            toast.error("This market is resolved already!", {
                position: "top-left",
                transition: Bounce,
            });
            return;
        }
        if (selectedOutcome === null) {
            toast.warn("Select the true outcome first!", {
                position: "top-center",
                transition: Bounce,
            });
            return;
        }
        setIsLoading(true);
        const service = PredictionMarketContractsService.get();
        const market = { ...selectedMarket };
        try {
            const truenessRatios = !amount?.length
                ? market.outcomes.map((_, idx) =>
                      idx === selectedOutcome ? 1 : 0
                  )
                : amount.split(/\s+/g).map((x) => +x);
            if (truenessRatios.length !== market.outcomes.length) {
                toast.error("Invalid trueness ratio array!", {
                    position: "top-left",
                    transition: Bounce,
                });
                setIsLoading(false);
                return;
            }
            if (!selectedMarket.closedAt) {
                await service.closeMarket(market);
                market.closedAt = new Date();
            }

            await service.resolveMarket(
                market,
                market.outcomes.map((_, idx) =>
                    idx === selectedOutcome ? 1 : 0
                )
            );
            market.resolvedAt = new Date();
            const updatedMarkets = MarketStorage.get().update(market);
            if (!updatedMarkets) {
                toast.warn(
                    "Successfully resolved market, but failed saving changes!",
                    {
                        position: "top-left",
                        transition: Bounce,
                    }
                );
            } else {
                setMarkets(updatedMarkets);
            }
            setSelectedMarket(market);
        } catch (ex) {
            console.error(`Failed resolving market: ${market.address}`, ex);
            toast.error(
                "Failed resolving market: " +
                    (ex as Error).message.substring(0, 20) +
                    "...",
                {
                    position: "top-left",
                    transition: Bounce,
                }
            );
        }
        setIsLoading(false);
    };

    const handleRedeem = async () => {
        if (!selectedMarket) {
            toast.warn("Select the market first!", {
                position: "top-center",
                transition: Bounce,
            });
            return;
        }

        if (!selectedMarket.resolvedAt) {
            toast.error("Market is not resolved yet!", {
                position: "top-left",
                transition: Bounce,
            });
            return;
        }
        setIsLoading(true);

        try {
            await PredictionMarketContractsService.get().redeemMarketRewards(
                traderSelection,
                selectedMarket,
                selectedOutcome
            );
        } catch (ex) {
            console.error(
                `Failed redeeming from market: ${selectedMarket.address}`,
                { selectedOutcome, ex }
            );
            toast.error(
                "Failed redeeming rewards: " +
                    (ex as Error).message.substring(0, 20) +
                    "...",
                {
                    position: "top-left",
                    transition: Bounce,
                }
            );
        }
        setIsLoading(false);
    };

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <motion.h1
                className="text-3xl font-bold text-center mb-8 text-white"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                Trading Dashboard
            </motion.h1>

            <motion.div
                className="bg-gray-800 rounded-lg shadow-lg p-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
            >
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Select Market
                    </label>
                    <select
                        className={`${tableStyles.select} w-full`}
                        value={selectedMarket?.address || ""}
                        onChange={handleMarketChange}
                    >
                        {markets.length === 0 ? (
                            <option value="">No markets available</option>
                        ) : (
                            markets.map((market) => (
                                <option
                                    key={market.address}
                                    value={market.address}
                                >
                                    {market.question}
                                </option>
                            ))
                        )}
                    </select>
                </div>

                {selectedMarket && (
                    <div className="mt-4">
                        <h3 className="text-lg font-medium text-white mb-2">
                            Market Details
                        </h3>
                        <div className="bg-gray-700 rounded-lg p-4">
                            <p className="text-gray-300">
                                <span className="font-medium">Question:</span>
                                {selectedMarket.question}
                            </p>
                            <p className="text-gray-300">
                                <span className="font-medium">
                                    Initial Liquidity:
                                </span>
                                {selectedMarket.initialLiquidity}
                                {selectedMarket.collateralToken.symbol}
                            </p>
                            <p className="text-gray-300">
                                <span className="font-medium">Created:</span>
                                {new Date(
                                    selectedMarket.startedAt
                                ).toLocaleString()}
                            </p>
                        </div>
                    </div>
                )}
            </motion.div>

            {selectedMarket && (
                <motion.div
                    className="bg-gray-800 rounded-lg shadow-lg p-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                >
                    <h3 className="text-lg font-medium text-white mb-4">
                        Select Outcome
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {selectedMarket.outcomes.map((outcome, index) => (
                            <div
                                key={index}
                                className={`${tableStyles.outcomeCard.base} ${
                                    selectedOutcome === index
                                        ? tableStyles.outcomeCard.selected
                                        : tableStyles.outcomeCard.unselected
                                }`}
                                onClick={() => handleOutcomeSelect(index)}
                            >
                                <h4 className="font-medium text-white">
                                    {outcome.title}
                                </h4>
                                <div className="mt-2 flex justify-between">
                                    <span className="text-sm text-gray-400">
                                        Current Price:
                                    </span>
                                    <span className="text-sm text-green-400 ml-3">
                                        {tokenPrices[index]?.toFixed(4)}
                                        {selectedMarket.collateralToken.symbol}
                                    </span>
                                </div>
                                <div className="mt-1 flex justify-between">
                                    <span className="text-sm text-gray-400">
                                        Your Balance:
                                    </span>
                                    <span className="text-sm text-blue-400">
                                        {userShares[index]}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {selectedMarket && selectedOutcome !== null && (
                <motion.div
                    className="bg-gray-800 rounded-lg shadow-lg p-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                >
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            {!selectedMarket.resolvedAt
                                ? `Amount ({selectedMarket.collateralToken.symbol})`
                                : "Outcome Trueness Ratio"}
                        </label>
                        <input
                            type="number"
                            className={`${tableStyles.input} w-full`}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder={
                                !selectedMarket.resolvedAt
                                    ? "Enter amount to trade"
                                    : "Enter outcomes trueness splitted by space.."
                            }
                            min="0"
                            step="0.01"
                        />
                    </div>
                </motion.div>
            )}

            {selectedMarket && selectedOutcome !== null && (
                <motion.div
                    className="bg-gray-800 rounded-lg shadow-lg p-6 transition-all duration-300 hover:shadow-xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="w-full md:w-auto">
                            <select
                                className={`${tableStyles.select} w-full md:w-auto min-w-[200px]`}
                                value={traderSelection}
                                onChange={(e) =>
                                    setTraderSelection(+e.target.value)
                                }
                            >
                                <option value="0">Trader 1</option>
                                <option value="1">Trader 2</option>
                                <option value="2">Trader 3</option>
                            </select>
                        </div>

                        {!selectedMarket?.resolvedAt ? (
                            <div className="flex gap-4 mt-4 md:mt-0">
                                <button
                                    className={`${tableStyles.button.base} bg-purple-600 hover:bg-purple-700 transform hover:scale-105 transition-transform duration-200`}
                                    onClick={() => handleResolve()}
                                    disabled={
                                        isLoading ||
                                        !selectedMarket ||
                                        selectedOutcome === null
                                    }
                                >
                                    <span className="flex items-center">
                                        {isLoading ? (
                                            <svg
                                                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <circle
                                                    className="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    strokeWidth="4"
                                                ></circle>
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                ></path>
                                            </svg>
                                        ) : (
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                className="h-5 w-5 mr-2"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        )}
                                        Resolve
                                    </span>
                                </button>

                                <button
                                    className={`${tableStyles.button.base} ${tableStyles.button.buy} transform hover:scale-105 transition-transform duration-200`}
                                    onClick={() => handleTrade(false)}
                                    disabled={
                                        isLoading ||
                                        !selectedMarket ||
                                        selectedOutcome === null ||
                                        !amount
                                    }
                                >
                                    <span className="flex items-center">
                                        {isLoading ? (
                                            <svg
                                                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <circle
                                                    className="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    strokeWidth="4"
                                                ></circle>
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                ></path>
                                            </svg>
                                        ) : (
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                className="h-5 w-5 mr-2"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        )}
                                        Buy
                                    </span>
                                </button>

                                <button
                                    className={`${tableStyles.button.base} ${tableStyles.button.sell} transform hover:scale-105 transition-transform duration-200`}
                                    onClick={() => handleTrade(true)}
                                    disabled={
                                        isLoading ||
                                        !selectedMarket ||
                                        selectedOutcome === null ||
                                        !amount
                                    }
                                >
                                    <span className="flex items-center">
                                        {isLoading ? (
                                            <svg
                                                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <circle
                                                    className="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    strokeWidth="4"
                                                ></circle>
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                ></path>
                                            </svg>
                                        ) : (
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                className="h-5 w-5 mr-2"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        )}
                                        Sell
                                    </span>
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-4 mt-4 md:mt-0">
                                <button
                                    className={`${tableStyles.button.base} bg-yellow-600 hover:bg-yellow-700 transform hover:scale-105 transition-transform duration-200`}
                                    onClick={() => handleRedeem()}
                                    disabled={isLoading}
                                >
                                    <span className="flex items-center">
                                        {isLoading ? (
                                            <svg
                                                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <circle
                                                    className="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    strokeWidth="4"
                                                ></circle>
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                ></path>
                                            </svg>
                                        ) : (
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                className="h-5 w-5 mr-2"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        )}
                                        Redeem
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
