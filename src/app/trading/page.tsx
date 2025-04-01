"use client";

import { useEffect, useState } from "react";
import {
    OutcomeToken,
    PredictionMarket,
} from "../../types/prediction-market.type";
import { toast } from "react-toastify";
import { PredictionMarketContractsService } from "@/services/prediction-market-contracts.service";
import { motion } from "framer-motion";
import { MarketStorage } from "@/utils/market-storage";
import BigNumber from "bignumber.js";

const tableStyles = {
    container: "bg-gray-800 rounded-lg shadow-lg p-6 mb-6",
    table: "min-w-full bg-gray-900 text-gray-200 rounded-lg overflow-hidden",
    tableHeader:
        "bg-gray-700 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider",
    tableHeaderCell: "py-3 px-4",
    tableRow: "hover:bg-gray-700 transition-colors duration-150",
    tableCell: "py-3 px-4 border-b border-gray-700",
    input: "w-full p-2 bg-gray-800 text-gray-200 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500",
    select: "p-2 bg-gray-800 text-gray-200 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500",
    button: {
        base: "px-4 py-2 rounded-lg font-medium shadow-md focus:outline-none focus:ring-2 focus:ring-opacity-50 flex items-center justify-center",
        buy: "bg-green-600 hover:bg-green-700 text-white focus:ring-green-500",
        sell: "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500",
    },
};

export default function Trading() {
    const [market, setMarket] = useState<PredictionMarket | null>(null);
    const [currentTraderId, setCurrentTraderId] = useState<number>(0);
    const [tradeAmounts, setTradeAmounts] = useState<
        { amount: number; sub?: number[] }[]
    >([]);
    const [tokenPrices, setTokenPrices] = useState<
        {
            price: BigNumber | null;
            outcome: OutcomeToken;
            sub:
                | {
                      outcome: OutcomeToken;
                      price: BigNumber | null;
                  }[]
                | null
                | undefined;
        }[]
    >([]);
    const [userShares, setUserShares] = useState<
        {
            balance: number;
            sub: number[] | null;
        }[]
    >([]);
    const [marketShares, setMarketShares] = useState<
        {
            balance: number;
            sub: number[] | null;
        }[]
    >([]);
    const [userCollateralBalance, setUserCollateralBalance] =
        useState<number>(0);
    const [stateUpdateTrigger, setStateUpdateTrigger] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const triggerStateUpdate = () => {
        setStateUpdateTrigger((x) => !x);
    };

    useEffect(() => {
        if (!market) {
            return;
        }
        const service = PredictionMarketContractsService.get();
        service.getMarketOutcomePricesNested(market).then((r) => {
            r?.length && setTokenPrices(r);
        });
        service.getSharesInMarket(market, currentTraderId).then((r) => {
            r?.length && setUserShares(r);
        });
        service.getSharesInMarket(market).then((r) => {
            r?.length && setMarketShares(r);
        });

        service
            .getUserCollateralTokenBalance(currentTraderId, market)
            .then((x) => setUserCollateralBalance(x.toNumber()));
    }, [currentTraderId, market, stateUpdateTrigger]);

    useEffect(() => {
        try {
            const lastMarket = MarketStorage.get().getRecent();
            if (!lastMarket) {
                return;
            }
            setMarket(lastMarket);
            if (lastMarket.outcomes) {
                setTradeAmounts(
                    lastMarket.outcomes.map((outcome) => ({
                        amount: 0,
                        sub:
                            lastMarket.subMarkets[outcome.title]?.outcomes.map(
                                () => 0
                            ) ?? [],
                    }))
                );
            }
        } catch (error) {
            console.error("Error loading recent market:", error);
        }
    }, []);

    const handleAmountChange = (
        index: number,
        value: number,
        subIndex: number | null = null
    ) => {
        const newAmounts = [...tradeAmounts];
        if (subIndex == null) {
            newAmounts[index].amount = value;
        } else if (newAmounts[index].sub) {
            newAmounts[index].sub[subIndex] = value;
        }
        setTradeAmounts(newAmounts);
    };

    const handleTrade = async (isSelling: boolean = false) => {
        if (isLoading) {
            toast.warn("Wait asshole!", {
                position: "top-center",
                autoClose: 3000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
            });
            return;
        }
        setIsLoading(true);
        if (!market || tradeAmounts.findIndex((x) => x) === -1) {
            return;
        }
        const service = PredictionMarketContractsService.get();
        try {
            const tasks = [];
            if (tradeAmounts.findIndex((x) => x.amount) !== -1) {
                tasks.push(
                    service.trade(
                        currentTraderId,
                        market,
                        tradeAmounts.map((x) => x.amount),
                        { isSelling }
                    )
                );
            }

            for (let i = 0; i < tradeAmounts.length; i++) {
                if (
                    tradeAmounts[i].sub?.length &&
                    tradeAmounts[i].sub?.findIndex((x) => x) !== -1
                ) {
                    tasks.push(
                        service.trade(
                            currentTraderId,
                            market.subMarkets[market.outcomes[i].title],
                            (tradeAmounts[i].sub ?? []).map((x) => x ?? 0),
                            { isSelling }
                        )
                    );
                }
            }

            const errors = (await Promise.allSettled(tasks)).filter(
                (result) => result.status !== "fulfilled"
            );
            if (errors?.length) {
                console.error(errors);
                throw new Error(errors.map((x) => x.reason).join("\n"));
            }
            toast.success("Trade was successfull!", {
                position: "top-right",
                autoClose: 3000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
            });
        } catch (ex) {
            toast.error(
                `Trade failed! ${(ex as Error).message.substring(0, 20)}`,
                {
                    position: "top-left",
                    autoClose: 3000,
                    hideProgressBar: false,
                    closeOnClick: true,
                    pauseOnHover: true,
                    draggable: true,
                }
            );
            console.error(ex);
        } finally {
            triggerStateUpdate();
            setIsLoading(false);
        }
    };

    if (!market) {
        return <div className="p-4">No market data found in app storage.</div>;
    }

    const copyAddressToClipboard = () => {
        if (market) {
            navigator.clipboard
                .writeText(market.address)
                .then(() => {
                    toast.success("Market address copied to clipboard!", {
                        position: "top-right",
                        autoClose: 3000,
                        hideProgressBar: false,
                        closeOnClick: true,
                        pauseOnHover: true,
                        draggable: true,
                    });
                })
                .catch((err) => {
                    console.error("Failed to copy address: ", err);
                    toast.error("Failed to copy address", {
                        position: "top-right",
                        autoClose: 3000,
                    });
                });
        }
    };

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            <motion.div
                className="bg-gray-800 rounded-lg shadow-lg p-6 transition-all duration-300 hover:shadow-xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
            >
                <h2 className="text-2xl font-bold mb-4 text-blue-400">
                    {market.question}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <p className="flex items-center">
                            <span className="font-semibold mr-2">
                                Market ID:
                            </span>
                            <span
                                className="cursor-pointer hover:text-blue-400 transition-colors duration-200 flex items-center"
                                onClick={copyAddressToClipboard}
                            >
                                {market.address.substring(0, 10)}...
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4 ml-1"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                </svg>
                            </span>
                        </p>
                        <p>
                            <span className="font-semibold">Started:</span>{" "}
                            {new Date(market.startedAt).toLocaleString()}
                        </p>
                    </div>
                    <div>
                        <p>
                            <span className="font-semibold">
                                Initial Liquidity:
                            </span>{" "}
                            {market.initialLiquidity}{" "}
                            {market.collateralToken.symbol}
                        </p>
                        <p>
                            <span className="font-semibold">Status:</span>
                            <span
                                className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                                    market.status === "resolved"
                                        ? "bg-green-600"
                                        : market.status === "closed"
                                        ? "bg-red-600"
                                        : "bg-blue-600"
                                }`}
                            >
                                {market.status || "Ongoing"}
                            </span>
                        </p>
                    </div>
                </div>
            </motion.div>

            <motion.div
                className={`${tableStyles.container} my-3 transition-all duration-300 hover:shadow-xl`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
            >
                <h3 className="text-xl font-bold mb-4 text-blue-400">
                    Market Outcomes
                </h3>
                <div className="overflow-x-auto">
                    <table className={tableStyles.table}>
                        <thead>
                            <tr>
                                {[
                                    "IDx",
                                    "Outcome",
                                    "Price",
                                    "Liquidity",
                                    "Shares",
                                    "Amount",
                                ].map((header) => (
                                    <th
                                        key={header}
                                        className={`${tableStyles.tableHeaderCell} ${tableStyles.tableHeader}`}
                                    >
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {market.outcomes.map((outcome) => [
                                <tr
                                    key={outcome.tokenIndex}
                                    className={tableStyles.tableRow}
                                >
                                    <td className={tableStyles.tableCell}>
                                        {outcome.tokenIndex}
                                    </td>
                                    <td className={tableStyles.tableCell}>
                                        {outcome.title}
                                    </td>
                                    <td className={tableStyles.tableCell}>
                                        {tokenPrices[
                                            outcome.tokenIndex
                                        ]?.price?.toFixed() ?? 0}
                                    </td>
                                    <td className={tableStyles.tableCell}>
                                        {marketShares[outcome.tokenIndex]
                                            ?.balance ?? 0}
                                    </td>
                                    <td className={tableStyles.tableCell}>
                                        {userShares[outcome.tokenIndex]
                                            ?.balance ?? 0}
                                    </td>
                                    <td className={tableStyles.tableCell}>
                                        <input
                                            type="number"
                                            className={tableStyles.input}
                                            value={
                                                tradeAmounts[outcome.tokenIndex]
                                                    ?.amount || 0
                                            }
                                            onChange={(e) =>
                                                handleAmountChange(
                                                    outcome.tokenIndex,
                                                    parseFloat(
                                                        e.target.value
                                                    ) || 0
                                                )
                                            }
                                        />
                                    </td>
                                </tr>,
                                ...(
                                    market.subMarkets[outcome.title]
                                        ?.outcomes ?? []
                                ).map((subOutcome) => (
                                    <tr
                                        key={
                                            2 ** outcome.tokenIndex +
                                            subOutcome.tokenIndex
                                        }
                                        className={tableStyles.tableRow}
                                    >
                                        <td className={tableStyles.tableCell}>
                                            {outcome.tokenIndex} -{" "}
                                            {subOutcome.tokenIndex}
                                        </td>
                                        <td className={tableStyles.tableCell}>
                                            {outcome.title} - {subOutcome.title}
                                        </td>
                                        <td className={tableStyles.tableCell}>
                                            {tokenPrices[
                                                outcome.tokenIndex
                                            ]?.sub?.[
                                                subOutcome.tokenIndex
                                            ].price?.toFixed() ?? 0}
                                        </td>
                                        <td className={tableStyles.tableCell}>
                                            {marketShares[outcome.tokenIndex]
                                                ?.sub?.[
                                                subOutcome.tokenIndex
                                            ] ?? 0}
                                        </td>
                                        <td className={tableStyles.tableCell}>
                                            {userShares[outcome.tokenIndex]
                                                ?.sub?.[
                                                subOutcome.tokenIndex
                                            ] ?? 0}
                                        </td>
                                        <td className={tableStyles.tableCell}>
                                            <input
                                                type="number"
                                                className={tableStyles.input}
                                                value={
                                                    tradeAmounts[
                                                        outcome.tokenIndex
                                                    ]?.sub?.[
                                                        subOutcome.tokenIndex
                                                    ] || 0
                                                }
                                                onChange={(e) =>
                                                    handleAmountChange(
                                                        outcome.tokenIndex,
                                                        parseFloat(
                                                            e.target.value
                                                        ) || 0,
                                                        subOutcome.tokenIndex
                                                    )
                                                }
                                            />
                                        </td>
                                    </tr>
                                )),
                            ])}
                        </tbody>
                    </table>
                </div>
            </motion.div>

            <motion.div
                className="bg-gray-800 rounded-lg shadow-lg p-6 transition-all duration-300 hover:shadow-xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
            >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="w-full md:w-auto">
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Select Trader
                        </label>
                        <select
                            className={`${tableStyles.select} w-full md:w-auto min-w-[200px]`}
                            value={currentTraderId}
                            onChange={(e) =>
                                setCurrentTraderId(+e.target.value)
                            }
                        >
                            <option value="0">Trader 1</option>
                            <option value="1">Trader 2</option>
                            <option value="2">Trader 3</option>
                        </select>
                    </div>

                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                        <div className="text-sm text-gray-300 mb-1">
                            {market?.collateralToken.symbol} Balance
                            <span className="mx-2 text-lg font-bold text-green-400">
                                {userCollateralBalance?.toFixed(4)}
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-4 mt-4 md:mt-0">
                        <button
                            className={`${tableStyles.button.base} ${tableStyles.button.buy} transform hover:scale-105 transition-transform duration-200`}
                            onClick={async () => handleTrade()}
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
                </div>
            </motion.div>
        </div>
    );
}
