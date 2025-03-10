import { PredictionMarket } from "@/types/prediction-market.type";

export class MarketStorage {
    private static _instance?: MarketStorage;

    static get MARKETS_KEY() {
        return 'markets';
    }

    static get() {
        if (!MarketStorage._instance) {
            return new MarketStorage()
        }
        return MarketStorage._instance
    }

    private constructor() {
        if (MarketStorage._instance) {
            return MarketStorage._instance
        }
        MarketStorage._instance = this
    }

    update(market: PredictionMarket, { newMarket = false, shouldThrow = false }: { newMarket?: boolean; shouldThrow?: boolean } = {}) {
        try {
            const existingData = this.findAll();

            const existingIndex = !newMarket ? existingData.findIndex((item: PredictionMarket) => item.address === market.address) : -1
            if (existingIndex !== -1) {
                existingData[existingIndex] = market
            } else {
                existingData.push(market)
            }
            localStorage.setItem(MarketStorage.MARKETS_KEY, JSON.stringify(existingData));

            return existingData;
        } catch (error) {
            console.error('Error saving market data:', error);
            if (shouldThrow) {
                throw error;
            }
        }
        return null;
    };

    findAll(): PredictionMarket[] {
        const data = localStorage.getItem(MarketStorage.MARKETS_KEY);
        return data?.length
            ? JSON.parse(data || '[]')
            : [];
    }

    find(address: string): PredictionMarket | null {
        address = address.trim().toLowerCase()
        return this.findAll().find(item => item.address.toLowerCase() === address) ?? null;
    }

    getRecent() {
        const markets = this.findAll();
        return markets?.length ? markets[markets.length - 1] : null;
    }

    deleteOldOnes(maxLength: number = 10) {
        const markets = this.findAll();
        if (markets.length < maxLength) {
            return markets;
        }
        markets.splice(0, markets.length - maxLength);
        localStorage.setItem(MarketStorage.MARKETS_KEY, JSON.stringify(markets));
        return markets;
    }

    replaceData(markets: PredictionMarket[]) {
        localStorage.setItem(MarketStorage.MARKETS_KEY, JSON.stringify(markets));
    }

    clearMarkets() {
        localStorage.removeItem(MarketStorage.MARKETS_KEY);
    }

    clear() {
        localStorage.clear();
    }
}