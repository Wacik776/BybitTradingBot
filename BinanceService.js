const Binance = require("node-binance-api");

class BinanceService {
    admin;

    prices = {};
    tickers = {};
    sockets = new Map();
    orders = new Map();

    markPriceBusy = false;

    async load() {
        this.admin = await this.createSocket("", "");
        this.prices = await this.admin.futuresPrices();

        const tickers = await this.admin.futuresExchangeInfo();

        tickers.symbols.forEach((e) => {
            this.tickers[e.symbol] = this.getSymbolData(e);
        });

        console.log("BinanceModule - loaded");
    }

    listingMarkPrice(symbol) {
        //if (this.tickerStreams.has(symbol)) return;
        
        console.log("Listing mark price ", symbol);

        //this.tickerStreams.add(symbol);

        this.admin.futuresMiniTickerStream(symbol, this.onMarkPriceHandler.bind(this));
    }

    async onMarkPriceHandler(data) {
        this.prices[data.symbol] = parseFloat(data.close);
        this.tickers[data.symbol].price = this.prices[data.symbol];

        if (this.markPriceBusy) return;

        this.markPriceBusy = true;

        await this.onMarkPrice(data);

        this.markPriceBusy = false;
    }

    getSymbolData(data) {
        const filters = {
            status: data.status
        };

        data.filters.forEach((filter) => {
            switch (filter.filterType) {
                case "MIN_NOTIONAL": {
                    filters.minNotional = parseFloat(filter.notional);

                    break;
                }
                case "PRICE_FILTER": {
                    filters.minPrice = parseFloat(filter.minPrice);
                    filters.maxPrice = parseFloat(filter.maxPrice);
                    filters.tickSize = parseFloat(filter.tickSize);

                    break;
                }
                case "LOT_SIZE": {
                    filters.stepSize = filter.stepSize;
                    filters.minQty = parseFloat(filter.minQty);
                    filters.maxQty = parseFloat(filter.maxQty);

                    break;
                }
            }
        });

        data.filters = filters;
        data.price = this.prices[data.symbol];

        return data;
    }

    async getActivePosition(symbol, client) {
        if (!client.futuresPositionRisk) return null;

        const result = await client.futuresPositionRisk({
            symbol,
        });

        return result.find((e) => parseFloat(e.positionAmt) !== 0)
    }

    async createSocket(publicKey, privateKey) {
        if (this.sockets.has(publicKey)) {
            return this.sockets.get(publicKey);
        }

        if (typeof privateKey !== "string") return null;

        const client = await new Promise((resolve) => {
            const client = new Binance().options({
                APIKEY: publicKey,
                APISECRET: privateKey,
                useServerTime: true,
                verbose: true,
                recvWindow: 60000,
            }, () => {
                resolve(client);
            })
        });

        this.sockets.set(publicKey, client);

        return client
    }

    async onOpenOrder(req, res) {
        const data = req.body;
        const tickerData = this.tickers[data.ticker];
        tickerData.price = parseFloat(this.prices[data.ticker]);

        const priceDots = tickerData.price.toString().split(".")[1].length;

        data.stopLoss = parseFloat(data.stopLoss.toFixed(priceDots));
        data.takeProfits = data.takeProfits.map((e) => [parseFloat(e[0].toFixed(priceDots)), e[1]]);

        if (!tickerData) return res.send("NOT FOUND TICKER");

        this.listingMarkPrice(data.ticker);

        const clients = DatabaseService.all();

        data.clients = new Set();

        for (const i in clients) {
            const e = clients[i];

            if (e.exchange /* binance - 0 */ || !e.publicKey || !e.privateKey || e.publicKey.length < 1 || e.privateKey.length < 1 || !e.trading) continue;

            const client = await this.createSocket(e.publicKey, e.privateKey);
            const futuresAccount = await client.futuresAccount();

            if (!futuresAccount || !("positions" in futuresAccount)) {
                continue;
            }

            if (!e.maxPositions) {
                e.maxPositions = 5;
            }

            if (futuresAccount.positions.reduce((a, b) => a + (parseFloat(b.initialMargin) !== 0 ? 1 : 0), 0) >= e.maxPositions) {
                continue;
            }

            const balance = parseFloat(futuresAccount.availableBalance);

            if (!e.capitalPercent) {
                e.capitalPercent = 5;
            }

            if (!e.leverage) {
                e.leverage = 15;
            }

            let quantity = (balance * (e.capitalPercent / 100)) / tickerData.price * e.leverage;

            if (quantity < tickerData.filters.minQty) {
                quantity = tickerData.filters.minQty;
            }

            if (tickerData.price * quantity < tickerData.filters.minNotional) {
                quantity = tickerData.filters.minNotional / tickerData.price;
            }

            quantity = client.roundStep(quantity, tickerData.filters.stepSize);

            await client.futuresLeverage(data.ticker, e.leverage);

            const position = await this.getActivePosition(data.ticker, client);

            if (position) {
                const amt = parseFloat(position.positionAmt);
                const action = amt < 0;


                const result = await client["futuresMarket" + (action ? "Buy" : "Sell")](
                    data.ticker,
                    Math.abs(amt)
                );

                console.log("Close active position ", i, result);
            }

            const result = await client["futuresMarket" + (data.side ? "Buy" : "Sell")](
                data.ticker,
                quantity,
            );

            console.log("Open new position", i, result);

            data.clients.add([e.publicKey, e.privateKey, e.leverage]);

            await TelegramService.bot.sendMessage(
                parseInt(i),
                result && !('code' in result) ?
                    `☑ *NEW POSITION OPENED* ☑\n▪ *Ticker:* \`${data.ticker}\` \n▪ *Direction:* \`${data.side ? "Long" : "Short"}\`\n▪ *Entry:* \`${tickerData.price}\`\n▪ *Amount:* \`${quantity} ${data.ticker.replace("USDT", "")}\`\n➖➖➖➖➖➖➖➖➖➖➖➖\n🤖The bot will *automatically open and close* this signal, please do not close this trade manually!` :
                    `Some error when tried open ${data.ticker}`,
                {
                    parse_mode: "markdown"
                }
            );
        }


        data.takeProfitsSize = data.takeProfits.length;
        data.entryPrice = tickerData.price;
        this.orders.set(data.ticker, data);

        res.send("OK");
    }

    async onPositionExit(data, res) {
        if (!data.ticker) {
            return res.send("INVALID DATA");
        }

        const order = this.orders.get(data.ticker);

        if (!order) {
            return;
        }

        const tickerData = this.tickers[data.ticker];

        for (const [publicKey, privateKey, leverage] of order.clients) {
            const client = await this.createSocket(publicKey, privateKey);

            if (!client) continue;

            const position = await this.getActivePosition(data.ticker, client);

            if (!position) continue;

            const positionAmt = parseFloat(position.positionAmt);

            const result = await client["futuresMarket" + (positionAmt < 0 ? "Buy" : "Sell")](
                data.ticker,
                Math.abs(positionAmt)
            );

            let percentProfit = order.entryPrice / tickerData.price;

            if (percentProfit < 0) percentProfit = 1 - percentProfit + 1;

            await TelegramService.bot.sendMessage(
                TelegramService.publicKeyId.get(publicKey),
                `💰*SIGNAL CLOSED*💰\n▪ *Ticker*: \`${order.ticker}\`\n▪ *Direction*: ${order.side ? "Long" : "Short"}\n➖➖➖➖➖➖➖➖➖➖➖➖\n🔹 Targets reached: ${order.takeProfitsSize}\n🔹 Profit: +${((percentProfit - 1) * leverage * 100).toFixed(2)}%`,
                {
                    parse_mode: "markdown"
                }
            )

            console.log("Exit position", result);
        }
    }

    onStopLossChange(data, res) {
        if (!data.stopLoss || !data.ticker) {
            return res.send("INVALID DATA");
        }

        const order = this.orders.get(data.ticker);

        if (!order) {
            return res.send("ORDER 404");
        }

        const price = this.prices[data.ticker];
        const priceDots = price.toString().split(".")[1].length;

        order.stopLoss = parseFloat(data.stopLoss.toFixed(priceDots));

        res.send("OK");
    }

    async onMarkPrice(binanceData) {
        try {
            const orderRaw = this.orders.get(binanceData.symbol);

            if (!orderRaw) {
                return;
            }

            const order = Object.assign({}, orderRaw);

            const price = this.prices[binanceData.symbol];
            const tickerData = this.tickers[binanceData.symbol];

            let takeProfitReached = false;
            let lastTakeProfit;

            for (const take of order.takeProfits) {
                if (order.side && price >= take[0]) {
                    takeProfitReached = true;
                }

                if (!order.side && price <= take[0]) {
                    takeProfitReached = true;
                }

                if (takeProfitReached) {
                    lastTakeProfit = take;
                    order.takeProfits.splice(order.takeProfits.indexOf(take), 1);

                    if (order.takeProfits.length === 0) {
                        this.orders.delete(binanceData.symbol);
                    }

                    break;
                }
            }

            // STOP LOSS

            let stopLoss = false;

            if (order.side && price <= order.stopLoss) {
                stopLoss = true;
            } else if (!order.side && price >= order.stopLoss) {
                stopLoss = true;
            }

            if (stopLoss) {
                this.orders.delete(binanceData.symbol);
            }

            for (const [i, privateKey, leverage] of order.clients) {
                if (takeProfitReached) {
                    const chatId = TelegramService.publicKeyId.get(i);
                    let dbData = DatabaseService.get(chatId);

                    if (!dbData.strategy) dbData.strategy = -1;

                    if (dbData.strategy !== -1 && (dbData.strategy !== order.takeProfitsSize - order.takeProfits.length)) {
                        continue;
                    }

                    const client = await this.createSocket(i, privateKey);
                    const activePos = await this.getActivePosition(binanceData.symbol, client);

                    if (activePos) {
                        const quantity = Math.abs(parseFloat(activePos.positionAmt));
                        let qty = quantity * (lastTakeProfit[1] / 100);

                        if (qty < tickerData.filters.minQty) {
                            qty = tickerData.filters.minQty;
                        }

                        if (tickerData.price * qty < tickerData.filters.minNotional) {
                            qty = tickerData.filters.minNotional / tickerData.price;
                        }

                        qty = client.roundStep(qty, tickerData.filters.stepSize);

                        const isFullPos = dbData.strategy !== -1 && (dbData.strategy === order.takeProfitsSize - order.takeProfits.length)

                        if (quantity < qty || order.takeProfits.length === 0 || isFullPos) {
                            qty = quantity;
                        }

                        const result = await client["futuresMarket" + (!order.side ? "Buy" : "Sell")](
                            binanceData.symbol,
                            qty
                        );

                        console.log("TAKEPROFIT CHATID " + chatId, order.takeProfitsSize - order.takeProfits.length, isFullPos, result);

                        if (order.takeProfits.length === 0 || isFullPos) {
                            let percentProfit = order.entryPrice / price;

                            if (percentProfit < 0) percentProfit = 1 - percentProfit + 1;

                            if (typeof dbData.pnl !== "number") {
                                dbData.pnl = 0;
                            }

                            const profitPnl = Math.abs((percentProfit - 1) * leverage * 100);

                            dbData.pnl += profitPnl;

                            DatabaseService.set(chatId, dbData);

                            await TelegramService.bot.sendMessage(
                                chatId,
                                `💰*SIGNAL CLOSED*💰\n▪ *Ticker*: \`${order.ticker}\`\n▪ *Direction*: ${order.side ? "Long" : "Short"}\n➖➖➖➖➖➖➖➖➖➖➖➖\n🔹 Targets reached: ${order.takeProfitsSize - order.takeProfits.length}\n🔹 Profit: +${profitPnl.toFixed(2)}%`,
                                {
                                    parse_mode: "markdown"
                                }
                            )
                        }
                    }

                    continue;
                }

                if (stopLoss) {
                    const client = await this.createSocket(i, privateKey);

                    const activeOrder = await this.getActivePosition(binanceData.symbol, client);

                    if (activeOrder) {
                        const result = await client["futuresMarket" + (!order.side ? "Buy" : "Sell")](
                            binanceData.symbol,
                            client.roundStep(Math.abs(parseFloat(activeOrder.positionAmt)), tickerData.filters.stepSize)
                        );

                        let percentLoss = order.entryPrice / price;

                        if (percentLoss < 0) percentLoss = 1 - percentLoss + 1;

                        const chatId = TelegramService.publicKeyId.get(i);
                        let dbData = DatabaseService.get(chatId);

                        if (typeof dbData.pnl !== "number") {
                            dbData.pnl = 0;
                        }

                        if (order.takeProfitsSize - order.takeProfits.length < 2) {
                            const profit = Math.abs(((percentLoss - 1) * leverage * 100));

                            dbData.pnl -= profit;

                            await TelegramService.bot.sendMessage(
                                chatId,
                                `🩸*STOP LOSS HIT*🩸\n▪ *Ticker:* \`${order.ticker}\`\n▪ *Direction:* \`${order.side ? "Long" : "Short"}\`\n➖➖➖➖➖➖➖➖➖➖➖➖\n🔻Loss: -${profit.toFixed(2)}%`,
                                {
                                    parse_mode: "markdown"
                                }
                            )
                        } else {
                            const profit = Math.abs((percentLoss - 1) * leverage * 100);

                            dbData.pnl += profit;

                            await TelegramService.bot.sendMessage(
                                chatId,
                                `💰*SIGNAL CLOSED*💰\n▪ *Ticker*: \`${order.ticker}\`\n▪ *Direction*: ${order.side ? "Long" : "Short"}\n➖➖➖➖➖➖➖➖➖➖➖➖\n🔹 Targets reached: ${order.takeProfitsSize - order.takeProfits.length}\n🔹 Profit: +${profit.toFixed(2)}%`,
                                {
                                    parse_mode: "markdown"
                                }
                            )
                        }

                        DatabaseService.set(chatId, dbData);

                        console.log("stopLoss", result);
                    }
                }
            }
        } catch (e) {
            console.log("PriceError", e)
        }
    }
}

module.exports = new BinanceService()