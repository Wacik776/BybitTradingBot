const os = require("os");
const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const Binance = require("node-binance-api");
const axios = require("axios");

global.BinanceService = require("./BinanceService");
global.BybitService = require("./BybitService");
global.TelegramService = require("./TelegramService.js");
global.DatabaseService = require("./DatabaseService.js");

class App {
  app;

  DEFAULT_REQUEST = {
    exchangeType: "BYBIT", // BINANCE
    action: "OPEN",
    side: false, // false - short, true - long
    ticker: "",
    takeProfits: [],
    stopLoss: 0,
  };

  constructor() {
    if (!fs.existsSync(__dirname + "/log.txt")) {
      fs.writeFileSync(__dirname + "/log.txt", "", "utf8");
    }

    console.log = (...args) => {
      args = args.map((e) => (typeof e === "object" ? JSON.stringify(e) : e));
      fs.appendFileSync(
        __dirname + "/log.txt",
        `[${new Date().toLocaleString("ru-US")}] ` + args.join(" ") + os.EOL,
        "utf8"
      );
    };

    this.app = express();

    this.app.use(bodyParser.json());
    //обработчик пост запросов, который вызывает собственно метод reqest для обработки запроса
    this.app.post("/", this.request.bind(this));

    this.app.get("/", async (req, res) => {
      const startTime = Date.now();

      await BinanceService.admin.deliveryPing();

      res.send("Binance ping " + (Date.now() - startTime) + " ms.");
    });

    this.app.listen(80, async () => {
      console.log("app running");

      await BinanceService.load();
      await BybitService.load();
    });
  }

  async request(req, res) {
    try {
      const data = req.body;
//это бади реквеста(нашего запроса)
      console.log("Data", data);

      if (typeof data.action !== "string") return;

      if (data && data.action === "EXIT") {
        switch (data.exchangeType) {
          case "BINANCE":
            return await BinanceService.onPositionExit(data, res);
          case "BYBIT":
            return await BybitService.onPositionExit(data, res);
        }
      }

      if (data && data.action === "STOPLOSS") {
        switch (data.exchangeType) {
          case "BINANCE":
            return await BinanceService.onStopLossChange(data, res);
          case "BYBIT":
            return await BybitService.onStopLossChange(data, res);
        }
      }

      if (!data || !this.validateRequest(data)) {
        return res.send("INVALID DATA");
      }

      switch (data.exchangeType) {
        case "BINANCE":
          return await BinanceService.onOpenOrder(req, res);
        //Провалились и вызвалась ошибка
          case "BYBIT":
          
          return await BybitService.onOpenOrder(req, res);
      }
    } catch (e) {
      res.send("INTERNAL ERROR");
      console.log("INTERNAL ERROR 1" + e.message);
    }
  }

  validateRequest(data) {
    let incorrect = false;

    for (const i in data) {
      if (
        !(i in this.DEFAULT_REQUEST) ||
        typeof this.DEFAULT_REQUEST[i] !== typeof data[i]
      ) {
        incorrect = true;
        break;
      }
    }

    return !incorrect;
  }
}

new App();
