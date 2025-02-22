const { RestClientV5 } = require("bybit-api"); // Обновлено
const { json } = require("express");
const WebSocket = require("ws");


class BybitService {
  _pool = new Map();

  orders = new Map();
  prices = {};
  symbols;
  promisePrices = new Map();

  wsTickers = new Set();
  ws;
// Код для подключения к веб-сокетам Bybit
  async load() {
    this.ws = new WebSocket("wss://stream.bybit.com/v5/public/linear");
//дожидаемся открытие сокета

    await new Promise(
      (resolve)=>this.ws.on("open",()=>{
        console.log("Bybit: Public Websocket open");
        
        resolve();
    }));

    this.ws.onmessage = (event) => {

        const data = JSON.parse(event.data);//данные, полученные в сообщении делает объект
        //console.log("ДАТА", data)
        this.onWSData(data);
    };

   

    this.ws.onclose = async () => {
      console.info("Bybit: Connection closed.");

      await this.load();

      this.wsTickers.forEach((ticker) => {
        this.ws.send(
          JSON.stringify({ op: "unsubscribe", args: [`publicTrade.${ticker}`] })
        );
      });
    };

    this.ws.onerror = () => console.info("Bybit: Connection error.");
  }
// Код для установки подписки на торги по определенному тикеру
  listTicker(ticker) {
    if (this.wsTickers.has(ticker)) return;
    console.log("subscribe on",ticker);
    this.wsTickers.add(ticker);
    this.ws.send(
      JSON.stringify({ op: "subscribe", args: [`publicTrade.${ticker}`] })
    );
  }
// Код для обработки полученных данных о торгах

  onWSData(data) {
    if (!data){ return console.log("onWSData нет даты!")};

      //console.log("----------------------------------Обновление цены----------------------------------------------------");
      
      let entries = Object.entries(data)
      let newEnt = entries[3];
      let ki = Object.values(newEnt);
      let objectDataWhereTickers = JSON.stringify(ki);


      let resprice = objectDataWhereTickers.substring(objectDataWhereTickers.lastIndexOf('"p":"')+5);
      let lastprice = resprice.split('"')[0];
      const price = parseFloat(lastprice);
      

      let restick = objectDataWhereTickers.substring(objectDataWhereTickers.lastIndexOf('"s":"')+5);
      let ticker = restick.split('"')[0]
      
      

      //console.log("ki",objectDataWhereTickers);

    if(price){this.onMarkPrice({ ticker, price })}
      
    }


 // Код для обработки запроса на размещение ордера

  async onOpenOrder(req, res) {
//бади нашего запроса
    const data = req.body;
    
//side - покупка или продажа
//ticker - торговая пара
    const { ticker, takeProfits, stopLoss, side } = data;
    console.log("======================================ONOPENORDER========================================")
    console.log(`Side: ${side}`);
    this.listTicker(ticker);
   
    const clients = DatabaseService.all();//список клиентов
    data.clients = new Set();//хранение

    

    
    let price = this.prices[ticker];//текущая цена торговой пары
    console.log(price)
    if (typeof price !== "number") price = await this.getPrice(ticker);
    console.log(`Get price ${ticker}: ${price}`);


    for await (const e of Object.values(clients)) {
      //const e = clients[i];
      console.log(e);

       if (e.exchange !== 1 || !e.bybit || !e.trading) {continue};
      

      const client = await this.createSocket(
        e.bybit.publicKey,
        e.bybit.privateKey,
        e.bybit.isInverse
      );

      console.log(`Get client: ${!!client}`);

      if (!client) continue;

      let pos = await client.getPositionInfo({
        symbol: `${ticker}`,
        category: "linear",
        settleCoin: "USDT",
      });
      
      let positions = pos.result.list;
      console.log('positions',positions)

      let getpos = (!positions || !Array.isArray(positions));

      console.log(`Get positions : ${getpos}`);

      if (!getpos) {
        continue;
      }

      if (!e.maxPositions) {
        e.maxPositions = 5;
      }
      console.log(positions)
      const activePositions = positions.reduce(
        (a, b) => a + (b.size !== 0 ? 1 : 0),
        0
      );

      console.log(
        `Is active positions max ${e.maxPositions}: ${activePositions >= e.maxPositions}`
      );
      console.log('active',activePositions)
      // if (activePositions >= e.maxPositions) {
      //   console.log(activePositions)
      //   continue;
      // }

      // const balance = (await client.getWalletBalance({ coin: "USDT" })).result
      //   .USDT.totalAvailableBalance;
      //console.log(balance)
      let balance = 1000;
      if (!e.capitalPercent) {
        e.capitalPercent = 5;
      }

      if (!e.leverage) {
        e.leverage = 15;
      }
      
      if (!this.symbols) {
        this.symbols = await client.getTickers({
          category: "linear",
          settleCoin: "USDT",
        });

        this.symbols =  this.symbols.result.list;
      }

      const tickerData = this.symbols.find((e) => e.symbol === ticker);
      
      const price = tickerData.lastPrice;

      let quantity = parseFloat(
        (((balance * (e.capitalPercent / 100)) / price) * e.leverage)
        //.toFixed(
         // tickerData.price_filter.tick_size.split(".")[1].length
        //)
      );

      if (quantity < tickerData.lot_size_filter.min_trading_qty)
        quantity = tickerData.lot_size_filter.min_trading_qty;
      if (quantity > tickerData.lot_size_filter.max_trading_qty)
        quantity = tickerData.lot_size_filter.max_trading_qty;
      await this.closePosition(client, positions, ticker);

      const leverage = e.bybit.isInverse ? 1 / e.leverage : e.leverage; // Изменено

      const res = await client.submitOrder({
        side: side ? "Buy" : "Sell",
        category: "linear",
        symbol: ticker,
        orderType: "Market",
        qty: quantity,
        timeInForce: "FillOrKill",
        reduceOnly: false,
        closeOnTrigger: false,
        positionIdx: 0,
      });
//??????????????????????????????????????????????????????????????????????????????????????????
      console.log("Open position", res);

      data.clients.add([e.bybit.publicKey, e.bybit.privateKey, leverage]);

      await TelegramService.bot.sendMessage(
        parseInt(e),
        res && res.ret_code === 0
          ? `☑ *NEW POSITION OPENED* ☑\n▪ *Ticker:* \`${
              data.ticker
            }\` \n▪ *Direction:* \`${
              data.side ? "Long" : "Short"
            }\`\n▪ *Entry:* \`${price}\`\n▪ *Amount:* \`${quantity} ${ticker.replace(
              "USDT",
              ""
            )}\`\n➖➖➖➖➖➖➖➖➖➖➖➖\n🤖The bot will *automatically open and close* this signal, please do not close this trade manually!`
          : `Some error when tried open ${data.ticker}`,
        {
          parse_mode: "markdown",
        }
      );
    }

    data.takeProfitsSize = data.takeProfits.length;
    data.entryPrice = price;

    this.orders.set(data.ticker, data);

    res.send("OK");
  }

  async onStopLossChange({ ticker, stopLoss }, res) {
    const order = this.orders.get(ticker);

    if (!order) return;

    order.stopLoss = stopLoss;

    this.orders.set(ticker, order);

    res.send("OK");
  }

  async onPositionExit({ ticker }, res) {
    const order = this.orders.get(ticker);

    if (!order) return res.send("ORDER DONT FOUND");

    let percentProfit = order.entryPrice / this.prices[ticker];

    if (percentProfit < 0) percentProfit = 1 - percentProfit + 1;

    for (const [publicKey, privateKey, leverage] of order.clients) {
      try {
        const client = await this.createSocket(publicKey, privateKey);
        const positions = (
          await client.getPositionInfo({
            category: "linear",
            settleCoin: "USDT",
          })
        ).result;

        if (!positions || !Array.isArray(positions)) {
          continue;
        }

        await this.closePosition(client, positions, ticker);

        const chatId = TelegramService.bybitPublicKeyId.get(publicKey);
        const profit = ((percentProfit - 1) * leverage * 100).toFixed(2);
        const dbData = DatabaseService.get(chatId);

        if (typeof dbData.pnl !== "number") {
          dbData.pnl = 0;
        }

        const profitPnl = Math.abs((percentProfit - 1) * leverage * 100);

        dbData.pnl += profitPnl;

        DatabaseService.set(chatId, dbData);

        await TelegramService.bot.sendMessage(
          chatId,
          `💰*SIGNAL CLOSED*💰\n▪ *Ticker*: \`${
            order.ticker
          }\`\n▪ *Direction*: ${
            order.side ? "Long" : "Short"
          }\n➖➖➖➖➖➖➖➖➖➖➖➖\n🔹 Targets reached: ${
            order.takeProfitsSize - order.takeProfits.length
          }\n🔹 Profit: +${profit}%`,
          {
            parse_mode: "markdown",
          }
        );
      } catch (e) {
        if (!e.message) e.message = e.body;

        console.log(
          `Some error when try exit position (Client: ${publicKey}): `,
          e.message
        );
      }
    }

    this.orders.delete(ticker);

    res.send("OK");
  }
//новое значение цены для тикера
  async onMarkPrice({ ticker, price }) {
    //console.log("-------------------------------------------- Обновление цены в списке--------------------------------------------");
    //console.log(`ticker: ${ticker} + price: ${price}`);
    //Проверка есть ли обещания по цене, если есть то передается тикер и прайс
    if (this.promisePrices.has(ticker)){this.promisePrices.get(ticker)(price)} ;
//обновление цены в списке
    this.prices[ticker] = price;
    //console.log("prices",prices)
    const order = this.orders.get(ticker);
    
//если ордера нет то дроп
    if (!order) return ;
    console.log("order",order)
//забираем информацию для конкретного тикера

    if (!this.symbols) {
        this.symbols = await client.getTickers({
          category: "linear",
          settleCoin: "USDT",
        });

        this.symbols =  this.symbols.result.list;
      }

    const tickerData = this.symbols.find((e) => e.symbol === ticker);

    console.log("stoploss",tickerData)
    let takeProfitReached = false;
    let lastTakeProfit;
    let stopLoss = false;

    if (order.side && price <= order.stopLoss) {
      stopLoss = true;
    } else if (!order.side && price >= order.stopLoss) {
      stopLoss = true;
    }
    console.log("stoploss",stopLoss)
    if (stopLoss) {
      this.orders.delete(ticker);
    } else {
      console.log("stoploss",stopLoss)
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
            this.orders.delete(ticker);
          }

          break;
        }
      }
    }
//--------------------------------------------------------------------------------
    for (const [publicKey, privateKey, leverage] of order.clients) {
      if (takeProfitReached) {
        const chatId = TelegramService.bybitPublicKeyId.get(publicKey);
        let dbData = DatabaseService.get(chatId);

        if (!dbData.strategy) dbData.strategy = -1;

        if (
          dbData.strategy !== -1 &&
          dbData.strategy !== order.takeProfitsSize - order.takeProfits.length
        ) {
          continue;
        }

        const client = await this.createSocket(publicKey, privateKey);
        const position = await this.getActivePosition(client, ticker);

        if (position) {
          let quantity = position.size;

          let qty = quantity * (lastTakeProfit[1] / 100);

          qty = parseFloat(
            qty.toFixed(tickerData.price_filter.tick_size.split(".")[1].length)
          );

          const isFullPos =
            dbData.strategy !== -1 &&
            dbData.strategy ===
              order.takeProfitsSize - order.takeProfits.length;

          if (quantity < qty || order.takeProfits.length === 0 || isFullPos) {
            qty = quantity;
          }

          const result = await client.submitOrder({
            side: !order.side ? "Buy" : "Sell",
            symbol: ticker,
            order_type: "Market",
            qty,
            time_in_force: "FillOrKill",
            reduce_only: false,
            close_on_trigger: true,
            position_idx: 0,
          });

          console.log(
            "TAKEPROFIT CHATID" + chatId,
            order.takeProfitsSize - order.takeProfits.length,
            isFullPos,
            result
          );

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
              `💰*SIGNAL CLOSED*💰\n▪ *Ticker*: \`${
                order.ticker
              }\`\n▪ *Direction*: ${
                order.side ? "Long" : "Short"
              }\n➖➖➖➖➖➖➖➖➖➖➖➖\n🔹 Targets reached: ${
                order.takeProfitsSize - order.takeProfits.length
              }\n🔹 Profit: +${profitPnl.toFixed(2)}%`,
              {
                parse_mode: "markdown",
              }
            );
          }
        }

        continue;
      }

      if (stopLoss) {
        const client = await this.createSocket(publicKey, privateKey);
        const position = await this.getActivePosition(client, ticker);

        if (position) {
          const result = await client.submitOrder({
            side: !order.side ? "Buy" : "Sell",
            symbol: ticker,
            order_type: "Market",
            qty: position.data.size,
            time_in_force: "FillOrKill",
            reduce_only: false,
            close_on_trigger: false,
            position_idx: 0,
          });

          let percentLoss = order.entryPrice / price;

          if (percentLoss < 0) percentLoss = 1 - percentLoss + 1;

          const chatId = TelegramService.bybitPublicKeyId.get(publicKey);
          let dbData = DatabaseService.get(chatId);

          if (typeof dbData.pnl !== "number") {
            dbData.pnl = 0;
          }

          if (order.takeProfitsSize - order.takeProfits.length < 2) {
            const profit = Math.abs((percentLoss - 1) * leverage * 100);

            dbData.pnl -= profit;

            await TelegramService.bot.sendMessage(
              chatId,
              `🩸*STOP LOSS HIT*🩸\n▪ *Ticker:* \`${
                order.ticker
              }\`\n▪ *Direction:* \`${
                order.side ? "Long" : "Short"
              }\`\n➖➖➖➖➖➖➖➖➖➖➖➖\n🔻Loss: -${profit.toFixed(2)}%`,
              {
                parse_mode: "markdown",
              }
            );
          } else {
            const profit = Math.abs((percentLoss - 1) * leverage * 100);

            dbData.pnl += profit;

            await TelegramService.bot.sendMessage(
              chatId,
              `💰*SIGNAL CLOSED*💰\n▪ *Ticker*: \`${
                order.ticker
              }\`\n▪ *Direction*: ${
                order.side ? "Long" : "Short"
              }\n➖➖➖➖➖➖➖➖➖➖➖➖\n🔹 Targets reached: ${
                order.takeProfitsSize - order.takeProfits.length
              }\n🔹 Profit: +${profit.toFixed(2)}%`,
              {
                parse_mode: "markdown",
              }
            );
          }

          DatabaseService.set(chatId, dbData);

          console.log("ByBit | StopLoss", result);
        }
      }
    }
  }

  async getActivePosition(client, ticker, positions = null) {
    if (!positions) {
      positions = (
        await client.getPositionInfo({
          symbol: `${ticker}`,
          category: "linear",
          settleCoin: "USDT",
        })
      ).result;

      if (!positions || !Array.isArray(positions)) {
        return null;
      }
    }

    const position = positions.find((e) => e.data.symbol === ticker);

    if (position) {
      const amt = position.data.size;

      if (typeof amt !== "number" || amt === 0) {
        return null;
      }

      return position;
    }

    return null;
  }

  async closePosition(client, positions, ticker) {
    const position = await this.getActivePosition(client, ticker, positions);

    if (!position) return;

    const result = await client.submitOrder({
      side: position.data.side === "Sell" ? "Buy" : "Sell",
      symbol: ticker,
      order_type: "Market",
      qty: position.data.size,
      time_in_force: "FillOrKill",
      reduce_only: false,
      close_on_trigger: false,
      position_idx: 0,
    });

    console.log("Close active position", result);
  }
//цена установка цены актива 
  async getPrice(ticker) {
    const price = await new Promise((r) => {
      this.promisePrices.set(ticker, r);//установка значения r для ключа тикер
    });

    this.promisePrices.delete(ticker);

    return price;
  }

  async createSocket(key, secret, isInverse) {
    if (this._pool.has(key)) return this._pool.get(key);

    try {
      const client = new RestClientV5({
        key: key,
        secret: secret,
        // testnet
        testnet: true,

        enableTimeSync: true,
      });
      // testnet
      await client.getAccountInfo();

      this._pool.set(key, client);
      return client;
    } catch (e) {
      if (!e.message) e.message = e.body;
      console.log(e.message);
      return false;
    }
  }
  async getTickerPrice(client, ticker) {
    return (await client.getTickers({ category: "linear", symbol: ticker }))
      .result.list[0].lastPrice;
  }
}


module.exports = new BybitService();

const client = new RestClientV5({
  key: "",
  secret: "",
  testnet: true,
  enableTimeSync: true,
});

const res4 = client
  .getTickers({category: "linear", settleCoin: "USDT" })
  .then((response) => console.log("Информация по всем тикерам: ",response.result.list));

// const balance = client
//   .getWalletBalance({
//     accountType: "UNIFIED",
//     coin: "USDT",
//   })
//   .then((data) =>
//     console.log("Balacne ---", data.result.list[0].coin[0].walletBalance)
//   );

// const accinfo = client
//   .getAccountInfo()
//   .then((response) => console.log("Accinfo", response));

// const linear = client
//   .getPositionInfo({
//     category: "linear",
//   })
//   .then((response) => console.log("linear", response.result));

// const inverse = client
//   .getActiveOrders({
//     category: "inverse",
//   })
//   .then((response) => console.log("inverse", response.result));

// const option = client
//   .getActiveOrders({
//     category: "option",
//   })
//   .then((response) => console.log("option", response.result.list));

// const res3 = client
//   .getPositionInfo({ category: "linear", settleCoin: "USDT" })
//   .then((response) => console.log("linear", response.result.list));

// const res4 = client
//   .getTickers({ category: "linear", symbol: "DOGEUSDT" })
//   .then((response) => console.log(response.result.list[0].lastPrice));

// const fff = client
//   .getWalletBalance({
//     accountType: "UNIFIED",
//     coin: "USDT",
//   })
//   .then((response) => console.log(response.result.list[0]));
