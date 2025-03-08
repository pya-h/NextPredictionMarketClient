"use client";

import { useEffect, useState } from "react";
import { PredictionMarket, OutcomeToken } from "../../types/prediction-market.type";
import { toast } from "react-toastify";

export default function Trading() {
    const [market, setMarket] = useState<PredictionMarket | null>(null);
    const [traderSelection, setTraderSelection] = useState<string>("Trader 1");
    const [tradeAmounts, setTradeAmounts] = useState<number[]>([]);

    useEffect(() => {
        const marketsFromStorage = localStorage.getItem('markets');
        if (marketsFromStorage) {
            try {
                const markets = JSON.parse(marketsFromStorage);
                if (Array.isArray(markets) && markets.length > 0) {
                    const lastMarket = markets[markets.length - 1];
                    setMarket(lastMarket);

                    if (lastMarket.outcomes) {
                        setTradeAmounts(new Array(lastMarket.outcomes.length).fill(0));
                    }
                }
            } catch (error) {
                console.error("Error parsing markets from localStorage:", error);
            }
        }
    }, []);

    const handleAmountChange = (index: number, value: number) => {
        const newAmounts = [...tradeAmounts];
        newAmounts[index] = value;
        setTradeAmounts(newAmounts);
    };

    const handleBuy = () => {
        console.log("Buy with trader:", traderSelection);
        console.log("Trade amounts:", tradeAmounts);
    };

    const handleSell = () => {
        console.log("Sell with trader:", traderSelection);
        console.log("Trade amounts:", tradeAmounts);
    };

    if (!market) {
        return <div className="p-4">No market data found in localStorage</div>;
    }


    const tableStyles = {
        container: "bg-gray-800 rounded-lg shadow-lg p-6 mb-6",
        table: "min-w-full bg-gray-900 text-gray-200 rounded-lg overflow-hidden",
        tableHeader: "bg-gray-700 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider",
        tableHeaderCell: "py-3 px-4",
        tableRow: "hover:bg-gray-700 transition-colors duration-150",
        tableCell: "py-3 px-4 border-b border-gray-700",
        input: "w-full p-2 bg-gray-800 text-gray-200 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500",
        select: "p-2 bg-gray-800 text-gray-200 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500",
        button: {
            base: "px-4 py-2 rounded font-medium transition-all duration-200 transform hover:scale-105",
            buy: "bg-green-600 text-white hover:bg-green-700",
            sell: "bg-red-600 text-white hover:bg-red-700"
        }
    };

    const copyAddressToClipboard = () => {
        if (market) {
            navigator.clipboard.writeText(market.address)
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
                .catch(err => {
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
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 transition-all duration-300 hover:shadow-xl">
                <h2 className="text-2xl font-bold mb-4 text-blue-400">{market.question}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <p className="flex items-center">
                            <span className="font-semibold mr-2">Market ID:</span>
                            <span
                                className="cursor-pointer hover:text-blue-400 transition-colors duration-200 flex items-center"
                                onClick={copyAddressToClipboard}
                            >
                                {market.address.substring(0, 10)}...
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </span>
                        </p>
                        <p><span className="font-semibold">Started:</span> {new Date(market.startedAt).toLocaleString()}</p>
                    </div>
                    <div>
                        <p><span className="font-semibold">Initial Liquidity:</span> {market.initialLiquidity} {market.collateralToken.symbol}</p>
                        <p>
                            <span className="font-semibold">Status:</span>
                            <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${market.status === 'resolved' ? 'bg-green-600' :
                                    market.status === 'closed' ? 'bg-red-600' : 'bg-blue-600'
                                }`}>
                                {market.status || 'Ongoing'}
                            </span>
                        </p>
                    </div>
                </div>
            </div>

            <div className={`${tableStyles.container} transition-all duration-300 hover:shadow-xl`}>
                <h3 className="text-xl font-bold mb-4 text-blue-400">Market Outcomes</h3>
                <div className="overflow-x-auto">
                    <table className={tableStyles.table}>
                        <thead>
                            <tr>
                                {["ID", "Outcome", "Current Price", "Shares Owned", "Trade Amount"].map((header) => (
                                    <th key={header} className={`${tableStyles.tableHeaderCell} ${tableStyles.tableHeader}`}>
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {market.outcomes.map((outcome, index) => (
                                <tr key={index} className={tableStyles.tableRow}>
                                    <td className={tableStyles.tableCell}>{outcome.tokenIndex}</td>
                                    <td className={tableStyles.tableCell}>{outcome.title}</td>
                                    <td className={tableStyles.tableCell}>0</td>
                                    <td className={tableStyles.tableCell}>0</td>
                                    <td className={tableStyles.tableCell}>
                                        <input
                                            type="number"
                                            className={tableStyles.input}
                                            value={tradeAmounts[index] || 0}
                                            onChange={(e) => handleAmountChange(index, parseFloat(e.target.value) || 0)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-gray-800 rounded-lg shadow-lg p-6 transition-all duration-300 hover:shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="w-full md:w-auto">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Select Trader</label>
                        <select
                            className={`${tableStyles.select} w-full md:w-auto min-w-[200px]`}
                            value={traderSelection}
                            onChange={(e) => setTraderSelection(e.target.value)}
                        >
                            <option value="Trader 1">Trader 1</option>
                            <option value="Trader 2">Trader 2</option>
                            <option value="Trader 3">Trader 3</option>
                        </select>
                    </div>

                    <div className="flex gap-4 mt-4 md:mt-0">
                        <button
                            className={`${tableStyles.button.base} ${tableStyles.button.buy} transform hover:scale-105 transition-transform duration-200`}
                            onClick={handleBuy}
                        >
                            <span className="flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                                Buy
                            </span>
                        </button>

                        <button
                            className={`${tableStyles.button.base} ${tableStyles.button.sell} transform hover:scale-105 transition-transform duration-200`}
                            onClick={handleSell}
                        >
                            <span className="flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Sell
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

}


