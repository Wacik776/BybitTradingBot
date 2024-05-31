const Telegram = require("node-telegram-bot-api");

class TelegramService {
  // TOKEN = "5603024285:AAF3kpDTfm8nlYQ28j1pH0UCOSH9uUQBvWE"; //
  //TOKEN = "6975441041:AAH40w1wdnjTaqm5l1VHy0YppqbT57tZQ2o"; //
  TOKEN = "6315469019:AAGRzHe_uruOliEsrBbBczD6G_g1WUD2RkE";
  INCORRECT_MESSAGE = "❌ Incorrect key! Please enter try again!";
  SUCCESS_MESSAGE = "✅ Settings changed successfully!";

  MAX_TAKEPROFIT = 6;

  ADMINS = [
    // 809759266, // hex
    // 1606622693,
    441931183,
    1041271109,
  ];

  COMMANDS = {
    Start: "start",
    Dashboard: "DASHBOARD📊",
    Settings: "SETTINGS⚙",
    Account: "🔌Exchange account",
    ByBitAccount: "🔐ByBit account",
    Trading: "📈Trading",
    Back: "🔙 Back",
    MainMenu: "🔝 Main Menu",
    MyAccount: "🔐Вinance account",
    AddAccount: "➕Add account",
    DeleteAccount: "🗑 Delete",
    UpdateAccount: "♻ Update",
    ChangeLeverage: "Change Leverage",
    ChangePercentTrade: "Change % per trade",
    ChangeMaxPositions: "Change Max open trades",
    StartTrading: "🚀 Start Autotrading",
    TakeABreak: "☕ Take a Break",
    AddSubscribe: "addsub",
    RemoveSubscribe: "delsub",
    ConfirmTrading: "✅ CONFIRM",
    CancelTrading: "🚫 CANCEL",
    DisableAllTrading: "disable_all_users_trading",
    EnableAllTrading: "enable_all_users_trading",
    BroadcastMessage: "send_all_users_message",
    ChangeTakeProfits: "Change Strategy",
    SpecificTakeProfit: "Specific TP",
    Trailing: "Trailing",
    SetExchange: "Set exchange",
    SetBinance: "Binance",
    SetByBit: "ByBit",
  };

  commands = {
    [this.COMMANDS.Start]: this.onStart.bind(this),
    [this.COMMANDS.Dashboard]: this.onDashboard.bind(this),
    [this.COMMANDS.Settings]: this.onSettings.bind(this),
    [this.COMMANDS.Back]: this.onBack.bind(this),
    [this.COMMANDS.MainMenu]: this.onStart.bind(this),
    [this.COMMANDS.Account]: this.onAccount.bind(this),
    [this.COMMANDS.AddAccount]: this.onAddAccount.bind(this),
    [this.COMMANDS.MyAccount]: (ctx) => this.onMyAccount(ctx, "BINANCE"),
    [this.COMMANDS.ByBitAccount]: (ctx) => this.onMyAccount(ctx, "BYBIT"),
    [this.COMMANDS.DeleteAccount]: this.onDeleteAccount.bind(this),
    [this.COMMANDS.UpdateAccount]: this.onAddAccount.bind(this),
    [this.COMMANDS.Trading]: this.onTrading.bind(this),
    [this.COMMANDS.ChangeLeverage]: this.onStartChangeLeverage.bind(this),
    [this.COMMANDS.ChangePercentTrade]: this.onStartChangePercent.bind(this),
    [this.COMMANDS.ChangeMaxPositions]:
      this.onStartChangeMaxPositions.bind(this),
    [this.COMMANDS.StartTrading]: this.onStartTrading.bind(this),
    [this.COMMANDS.TakeABreak]: this.onTakeBreak.bind(this),
    [this.COMMANDS.AddSubscribe]: this.onAddSubscribe.bind(this),
    [this.COMMANDS.RemoveSubscribe]: this.onRemoveSubscribe.bind(this),
    [this.COMMANDS.ConfirmTrading]: this.onConfirmTrading.bind(this),
    [this.COMMANDS.CancelTrading]: this.onCancelTrading.bind(this),
    [this.COMMANDS.DisableAllTrading]: this.onDisableAllTrading.bind(this),
    [this.COMMANDS.EnableAllTrading]: this.onEnableAllTrading.bind(this),
    [this.COMMANDS.BroadcastMessage]: this.onBroadcastMessage.bind(this),
    [this.COMMANDS.ChangeTakeProfits]: this.onChangeTakeProfits.bind(this),
    [this.COMMANDS.Trailing]: this.onTrailing.bind(this),
    [this.COMMANDS.SpecificTakeProfit]: this.onSpecificTakeProfit.bind(this),
    [this.COMMANDS.SetExchange]: this.onSetExchange.bind(this),
    [this.COMMANDS.SetBinance]: this.onSetBinance.bind(this),
    [this.COMMANDS.SetByBit]: this.onSetByBit.bind(this),
  };

  addAccountPool = new Map();
  changeLeveragePool = new Set();
  changePercentPool = new Set();
  changeMaxPositionsPool = new Set();
  tradingStartStopPool = new Map();
  publicKeyId = new Map();
  bybitPublicKeyId = new Map();
  lastCategoryPool = new Map();
  onTrailingQuest = new Set();
  onSpecificTakeProfitChange = new Map();
  addSubPool = new Map();
  delSubPool = new Map();

  constructor() {
    this.bot = new Telegram(this.TOKEN, {
      polling: true,
    });

    this.bot.on("text", this.onText.bind(this));

    console.log("TelegramService - loaded");
  }

  sendSignal() {}

  onText(ctx) {
    try {
      const chatId = ctx.chat.id;
      const msg = ctx.text.replace(/\//g, "");

      if (
        !this.ADMINS.includes(chatId) &&
        !DatabaseService.has(chatId) &&
        msg !== this.COMMANDS.Start
      ) {
        return;
      }

      let command = this.commands[msg];

      if (!command) {
        command = this.commands[msg.split(" ")[0]];
      }

      if (command) {
        return command(ctx);
      }

      if (this.addAccountPool.has(chatId)) {
        const step = this.addAccountPool.get(chatId).step;

        switch (step) {
          case 1: {
            this.onAddAccountName(ctx);
            break;
          }

          case 2: {
            this.onAddAccountToken(ctx);
            break;
          }
        }

        return;
      }

      if (this.addSubPool.has(chatId)) {
        const step = this.addSubPool.get(chatId).step;

        switch (step) {
          case 1: {
            this.onEnterId(ctx);
            break;
          }
        }

        return;
      }

      if (this.changeLeveragePool.has(chatId)) {
        return this.onChangeLeverage(ctx);
      }

      if (this.changePercentPool.has(chatId)) {
        return this.onChangePercent(ctx);
      }

      if (this.changeMaxPositionsPool.has(chatId)) {
        return this.onChangeMaxPositions(ctx);
      }

      if (this.onSpecificTakeProfitChange.has(chatId)) {
        return this.onEnterSpecificTP(ctx);
      }
    } catch (e) {
      console.log("Error", e);
    }
  }

  onDisableAllTrading(ctx) {
    if (!this.ADMINS.includes(ctx.chat.id)) return;

    const all = DatabaseService.all();

    for (const i in all) {
      all[i].trading = false;
      DatabaseService.set(i, all[i], false);
    }

    DatabaseService.save();

    this.bot.sendMessage(ctx.chat.id, "Disable all trading");
  }

  onEnableAllTrading(ctx) {
    if (!this.ADMINS.includes(ctx.chat.id)) return;

    const all = DatabaseService.all();

    for (const i in all) {
      all[i].trading = true;
      DatabaseService.set(i, all[i], false);
    }

    DatabaseService.save();

    this.bot.sendMessage(ctx.chat.id, "Enable all trading");
  }

  async onBroadcastMessage(ctx) {
    if (!this.ADMINS.includes(ctx.chat.id)) return;

    const all = DatabaseService.all();
    const msg = ctx.text.split(" ").slice(1).join(" ");

    for (const i in all) {
      await this.bot.sendMessage(parseInt(i), msg, {
        parse_mode: "html",
      });
    }
  }

  onStart(ctx) {
    this.bot.sendMessage(ctx.chat.id, "🔝 Your id: " + ctx.chat.id, {
      reply_markup: {
        one_time_keyboard: true,
        resize_keyboard: true,

        keyboard: [
          [
            {
              text: this.COMMANDS.Dashboard,
            },
            {
              text: this.COMMANDS.Settings,
            },
          ],
        ],
      },
    });
  }

  onBack(ctx) {
    const category = this.lastCategoryPool.get(ctx.chat.id);
    if (!category) return this.onDashboard(ctx);
    this[category](ctx);
  }

  onChangeTakeProfits(ctx) {
    this.lastCategoryPool.set(ctx.chat.id, "onTrading");

    this.bot.sendMessage(ctx.chat.id, "Change strategy", {
      reply_markup: {
        one_time_keyboard: true,
        resize_keyboard: true,

        keyboard: [
          [
            {
              text: this.COMMANDS.Trailing,
            },
            {
              text: this.COMMANDS.SpecificTakeProfit,
            },
          ],
          [
            {
              text: this.COMMANDS.Back,
            },
          ],
        ],
      },
      parse_mode: "markdown",
    });
  }

  onEnterSpecificTP(ctx) {
    const data = this.onSpecificTakeProfitChange.get(ctx.chat.id);

    if (data.stage !== 0) {
      return;
    }

    const tp = parseInt(ctx.text);

    if (isNaN(tp) || tp < 1 || tp > this.MAX_TAKEPROFIT) {
      return this.bot.sendMessage(ctx.chat.id, "Invalid TP");
    }

    data.stage = 1;
    data.takeProfit = tp;

    this.bot.sendMessage(
      ctx.chat.id,
      "❓Are you sure you want to change your *trading strategy*?",
      {
        parse_mode: "markdown",
        reply_markup: {
          one_time_keyboard: true,
          resize_keyboard: true,

          keyboard: [
            [
              {
                text: this.COMMANDS.ConfirmTrading,
              },
              {
                text: this.COMMANDS.CancelTrading,
              },
            ],
            [
              {
                text: this.COMMANDS.Back,
              },
            ],
          ],
        },
      }
    );
  }

  onTrailing(ctx) {
    if (!this.onTrailingQuest.has(ctx.chat.id))
      this.onTrailingQuest.add(ctx.chat.id);

    this.bot.sendMessage(
      ctx.chat.id,
      "❓Are you sure you want to change your *trading strategy?*",
      {
        reply_markup: {
          one_time_keyboard: true,
          resize_keyboard: true,

          keyboard: [
            [
              {
                text: this.COMMANDS.ConfirmTrading,
              },
              {
                text: this.COMMANDS.CancelTrading,
              },
            ],
          ],
        },
        parse_mode: "markdown",
      }
    );
  }

  onSpecificTakeProfit(ctx) {
    this.onSpecificTakeProfitChange.set(ctx.chat.id, {
      stage: 0,
    });

    this.bot.sendMessage(
      ctx.chat.id,
      "Choose a target on which the position will be *closed completely*👇🏼\n(Enter target number from `1 to 6`)",
      {
        parse_mode: "markdown",
      }
    );
  }

  onAddSubscribe(ctx) {
    if (!this.ADMINS.includes(ctx.chat.id)) return;
    this.addSubPool.set(ctx.chat.id, { step: 1 });
    this.bot.sendMessage(ctx.chat.id, "Enter USER ID");
  }

  onAddEnterId(ctx) {
    const id = parseInt(ctx.text);

    if (isNaN(id)) {
      return this.bot.sendMessage(ctx.chat.id, "Type Correct ID" + id);
    }

    DatabaseService.set(id, {});

    this.bot.sendMessage(ctx.chat.id, "✅ Subscribe added " + id);
    this.bot.sendMessage(
      id,
      "🥂Congratulations, you have successfully connected to *PLUTŪS | Autotrading*, all that remains is to add an account and set up the settings!",
      {
        parse_mode: "markdown",
      }
    );
    this.addSubPool.delete(ctx.chat.id);
  }

  onRemoveSubscribe(ctx) {
    if (!this.ADMINS.includes(ctx.chat.id)) return;
    this.bot.sendMessage(ctx.chat.id, "Enter USER ID");
  }

  onRemoveEnterId(ctx) {
    const id = parseInt(ctx.text);
    if (isNaN(id)) {
      return this.bot.sendMessage(ctx.chat.id, "Type Correct ID" + id);
    }
    DatabaseService.delete(id);

    this.bot.sendMessage(ctx.chat.id, "❌ Subscribe deleted for " + id);
  }

  async getExchangeInfo(data) {
    try {
      switch (data.exchange) {
        case undefined:
        case null:
        case 0: {
          const client =
            data && data.publicKey
              ? await BinanceService.createSocket(
                  data.publicKey,
                  data.privateKey
                )
              : null;

          const defaultFuturesAccount = {
            availableBalance: 0,
            totalUnrealizedProfit: 0,
            positions: [],
            assets: [],
          };

          let futuresAccount = client
            ? await client.futuresAccount()
            : defaultFuturesAccount;

          if (!futuresAccount.positions) {
            futuresAccount = defaultFuturesAccount;
          }

          const balance = parseFloat(futuresAccount.totalAvailableBalance);

          let pnl = 0;
          let tradesProfit = 0;
          let openTrades = 0;
          let amountTrades = 0;

          for (const e of futuresAccount.positions) {
            const margin = parseFloat(e.initialMargin);

            if (margin !== 0) {
              const unrealizedProfit = parseFloat(e.unrealizedProfit);
              const initialMargin = parseFloat(e.initialMargin);

              openTrades++;
              amountTrades += initialMargin;
              tradesProfit += unrealizedProfit;
              pnl += unrealizedProfit / initialMargin;
            }
          }

          return {
            balance,
            pnl,
            tradesProfit,
            openTrades,
            amountTrades,
          };
        }

        case 1: {
          const client =
            data && data.bybit
              ? await BybitService.createSocket(
                  data.bybit.publicKey,
                  data.bybit.privateKey
                )
              : null;

          if (!client) return null;

          const balanceRequest = await client.getWalletBalance({
            accountType: "UNIFIED",
            coin: "USDT",
          });

          const stats = {
            balance: 0,
            pnl: 0,
            tradesProfit: 0,
            openTrades: 0,
            amountTrades: 0,
          };

          stats.balance = balanceRequest.result.list[0].totalAvailableBalance;

          const positionsResponse = await client.getPositionInfo({
            category: "linear",
            settleCoin: "USDT",
          });

          const positionsData = positionsResponse.result.list;

          const countStats = async (data) => {
            stats.openTrades++;
            const p = (data.unrealisedPnl / data.positionIM) * 100;
            stats.pnl += p;
            stats.tradesProfit =
              Number(stats.tradesProfit) + Number(data.unrealisedPnl);
            const price = await BybitService.getTickerPrice(
              client,
              data.symbol
            );
            const value = (Number(data.size) * price) / Number(data.leverage);
            this.bot.sendMessage(value);
            stats.amountTrades += value;
          };

          if (Array.isArray(positionsData)) {
            await Promise.all(
              positionsData.map(async (data) => {
                if (data.size === 0) return;
                await countStats(data);
              })
            );
          }

          return stats;
        }
      }
    } catch (e) {
      if (!e.message) e.message = e.body;

      console.log(e.message);
      return null;
    }
  }

  async onDashboard(ctx) {
    try {
      const data = DatabaseService.get(ctx.chat.id);

      const exchangeData = await this.getExchangeInfo(data);

      let balance = 0;
      let pnl = 0;
      let tradesProfit = 0;
      let openTrades = 0;
      let amountTrades = 0;

      if (exchangeData) {
        balance = Number.parseFloat(exchangeData.balance);
        pnl = Number.parseFloat(exchangeData.pnl);
        tradesProfit = Number.parseFloat(exchangeData.tradesProfit);
        openTrades = Number.parseFloat(exchangeData.openTrades);
        amountTrades = Number.parseFloat(exchangeData.amountTrades);
      }

      if (!("pnl" in data)) {
        data.pnl = 0;
      }

      this.lastCategoryPool.set(ctx.chat.id, "onDashboard");

      let message =
        "💸The *dashboard* shows up-to-date information about the current state of your balance and bot trades! \n➖➖➖➖➖➖➖➖➖➖➖\n" +
        `🤖*Trading status*:  \`${
          data && data.trading ? "Enable" : "Disable"
        }\`\n\n` +
        `🏦*Balance*:  \`${balance.toFixed(3)}$\`\n` +
        "\n" +
        `📈*Current PnL*:  \`${pnl.toFixed(3)}%\`\n` +
        "\n" +
        `🟢*Open trades*:  \`${openTrades}\` \n` +
        `💵*Open trades profit*:  \`${tradesProfit.toFixed(3)}$\`\n` +
        `💲*Amount in trades*:  \`${amountTrades.toFixed(3)}$\`\n` +
        `➖➖➖➖➖➖➖➖➖➖➖➖\n` +
        `🌎*All time PnL:* \`${data.pnl.toFixed(2)}%\`\n\n` +
        `🏦*Total balance*: \`${(balance + amountTrades).toFixed(3)}$\`\n`;

      this.bot.sendMessage(ctx.chat.id, message, {
        reply_markup: {
          one_time_keyboard: true,
          resize_keyboard: true,

          keyboard: [
            [
              {
                text: this.COMMANDS.StartTrading,
              },
              {
                text: this.COMMANDS.TakeABreak,
              },
            ],
            [
              {
                text: this.COMMANDS.Dashboard,
              },
              {
                text: this.COMMANDS.Settings,
              },
            ],
          ],
        },

        parse_mode: "Markdown",
      });
    } catch (e) {
      if (!e.message) e.message = e.body;
      console.log(e.message);
    }
  }

  async onStartTrading(ctx) {
    const data = DatabaseService.get(ctx.chat.id);

    if (!data || (!data.publicKey && !data.bybit)) {
      return this.bot.sendMessage(
        ctx.chat.id,
        "❗Before you can start *auto trading*, you need to add an exchange account!\n" +
          "\n" +
          "It can be done in the: `⚙ SETTINGS - 🔐Binance account - ➕Add account!`",
        {
          parse_mode: "markdown",
        }
      );
    }

    if (data.trading) {
      return this.bot.sendMessage(
        ctx.chat.id,
        "‼`ERROR:` *Autotrading is already enabled!*",
        {
          parse_mode: "markdown",
        }
      );
    }

    this.tradingStartStopPool.set(ctx.chat.id, true);

    await this.bot.sendMessage(
      ctx.chat.id,
      "❗ *Do you really want to START auto trading?*\n" +
        "\n" +
        "The bot automatically *starts trading immediately* according to the settings you set, you do not have to do anything with the trades opened by the bot!\n" +
        "\n" +
        "Please, *confirm it* in the menu below👇🏼",
      {
        parse_mode: "markdown",
        reply_markup: {
          one_time_keyboard: true,
          resize_keyboard: true,

          keyboard: [
            [
              {
                text: this.COMMANDS.ConfirmTrading,
              },
              {
                text: this.COMMANDS.CancelTrading,
              },
            ],
            [
              {
                text: this.COMMANDS.Back,
              },
              {
                text: this.COMMANDS.MainMenu,
              },
            ],
          ],
        },
      }
    );
  }

  async onTakeBreak(ctx) {
    const data = DatabaseService.get(ctx.chat.id);

    if (!data || !data.publicKey) {
      return this.onDashboard(ctx);
    }

    if (!data.trading) {
      return this.bot.sendMessage(
        ctx.chat.id,
        "‼`ERROR:` *Autotrading is already disabled!*",
        {
          parse_mode: "markdown",
        }
      );
    }

    this.tradingStartStopPool.set(ctx.chat.id, false);

    await this.bot.sendMessage(
      ctx.chat.id,
      "❗ *Do you really want to STOP auto trading?* \n" +
        "\n" +
        "Your current positions will be closed according to the strategy, but *new positions will not be opened* until you re-enable auto trading! \n" +
        "\n" +
        "Please, *confirm it* in the menu below👇🏼",
      {
        parse_mode: "markdown",
        reply_markup: {
          one_time_keyboard: true,
          resize_keyboard: true,

          keyboard: [
            [
              {
                text: this.COMMANDS.ConfirmTrading,
              },
              {
                text: this.COMMANDS.CancelTrading,
              },
            ],
            [
              {
                text: this.COMMANDS.Back,
              },
              {
                text: this.COMMANDS.MainMenu,
              },
            ],
          ],
        },
      }
    );
  }

  onSettings(ctx) {
    this.lastCategoryPool.set(ctx.chat.id, "onStart");

    this.bot.sendMessage(
      ctx.chat.id,
      "Choose *what you want to configure* from the menu below👇🏼",
      {
        reply_markup: {
          one_time_keyboard: true,
          resize_keyboard: true,

          keyboard: [
            [
              {
                text: this.COMMANDS.Account,
              },
              {
                text: this.COMMANDS.Trading,
              },
            ],
            [
              {
                text: this.COMMANDS.Back,
              },
              {
                text: this.COMMANDS.MainMenu,
              },
            ],
          ],
        },

        parse_mode: "Markdown",
      }
    );
  }

  onAccount(ctx) {
    this.lastCategoryPool.set(ctx.chat.id, "onSettings");

    this.bot.sendMessage(ctx.chat.id, "🔌Exchange account", {
      reply_markup: {
        one_time_keyboard: true,
        resize_keyboard: true,

        keyboard: [
          [
            {
              text: this.COMMANDS.MyAccount,
            },
            {
              text: this.COMMANDS.ByBitAccount,
            },
          ],
          [
            {
              text: this.COMMANDS.AddAccount,
            },
          ],
          [
            {
              text: this.COMMANDS.Back,
            },
            {
              text: this.COMMANDS.MainMenu,
            },
          ],
        ],
      },
    });
  }

  onDeleteAccount(ctx) {
    const data = DatabaseService.get(ctx.chat.id);

    if (data.exchange === 0) {
      delete data.publicKey;
      delete data.privateKey;
    } else {
      delete data.bybit;
    }

    DatabaseService.set(ctx.chat.id, data);

    this.bot.sendMessage(ctx.chat.id, "✔ Great, account was removed");
  }

  onAddAccount(ctx, type) {
    const chatId = ctx.chat.id;

    this.addAccountPool.set(chatId, {
      step: 1,
      type,
    });

    this.bot.sendMessage(
      chatId,
      "✔ Great, almost added, please provide a name for the new account\n👇🏼"
    );
  }

  onAddAccountName(ctx) {
    const data = this.addAccountPool.get(ctx.chat.id);

    data.name = ctx.text;
    data.step = 2;

    this.bot.sendMessage(
      ctx.chat.id,
      "💎Excellent, the last step is to add the *API key* and *API secret Key* below👇🏼\n" +
        "\n" +
        "Before doing this, make sure that the permissions for *Spot&Margin trading* and *Futures trading* are enabled!\n" +
        "\n" +
        "❗API and Secret key must be entered in the format: `API`(space)`SECRET`\n" +
        "\n" +
        "Example: OGf…JAsg opDF…osh",
      {
        parse_mode: "markdown",
      }
    );
  }

  async onAddAccountToken(ctx) {
    const data = this.addAccountPool.get(ctx.chat.id);
    const [publicKey, privateKey] = ctx.text.split(" ");

    if (!publicKey || !privateKey) {
      return this.bot.sendMessage(
        ctx.chat.id,
        "💎Excellent, the last step is to add the *API key* and *API secret Key* below👇🏼\n" +
          "\n" +
          "Before doing this, make sure that the permissions for *Spot&Margin trading* and *Futures trading* are enabled!\n" +
          "\n" +
          "❗API and Secret key must be entered in the format: `API`(space)`SECRET`\n" +
          "\n" +
          "Example: OGf…JAsg opDF…osh",
        {
          parse_mode: "markdown",
        }
      );
    }

    switch (data.type) {
      case "BINANCE": {
        const client = await BinanceService.createSocket(publicKey, privateKey);

        if (
          !client ||
          !client.futuresAccount ||
          !(await client.futuresAccount())
        ) {
          return this.bot.sendMessage(
            ctx.chat.id,
            "❌*Incorrect API, please provide a valid one!*",
            {
              parse_mode: "markdown",
            }
          );
        }

        let d = DatabaseService.get(ctx.chat.id);

        if (!d) return;

        d.name = data.name;
        d.publicKey = publicKey;
        d.privateKey = privateKey;

        DatabaseService.set(ctx.chat.id, d);

        break;
      }

      case "BYBIT": {
        const client = await BybitService.createSocket(publicKey, privateKey);

        if (!client) {
          return this.bot.sendMessage(
            ctx.chat.id,
            "❌*Incorrect API, please provide a valid one!*",
            {
              parse_mode: "markdown",
            }
          );
        }

        let d = DatabaseService.get(ctx.chat.id);

        // if (!d) return;
        if (!d) d = {};

        d.bybit = {
          name: data.name,
          publicKey,
          privateKey,
        };

        DatabaseService.set(ctx.chat.id, d);

        break;
      }
    }

    this.addAccountPool.delete(ctx.chat.id);

    this.bot.sendMessage(
      ctx.chat.id,
      "Excellent! Your account was connected successfully!✅"
    );

    this.onAccount(ctx);
  }

  onMyAccount(ctx, type) {
    const d = DatabaseService.get(ctx.chat.id);

    if (!d || (type === "BINANCE" ? !d.name : !d.bybit))
      return this.onAddAccount(ctx, type);

    this.lastCategoryPool.set(ctx.chat.id, "onAccount");

    this.bot.sendMessage(
      ctx.chat.id,
      `☑ Your account has been successfully connected, account details:\n\n*API key:* \`${
        type === "BINANCE" ? d.publicKey : d.bybit.publicKey
      }\`\n\n*Secret key:* \`xxxxx${(type === "BINANCE"
        ? d.privateKey
        : d.bybit.privateKey
      ).slice(-4)}\``,
      {
        reply_markup: {
          one_time_keyboard: true,
          resize_keyboard: true,

          keyboard: [
            [
              {
                text: this.COMMANDS.UpdateAccount,
              },
              {
                text: this.COMMANDS.DeleteAccount,
              },
            ],
            [
              {
                text: this.COMMANDS.Back,
              },
              {
                text: this.COMMANDS.MainMenu,
              },
            ],
          ],
        },

        parse_mode: "Markdown",
      }
    );
  }

  onTrading(ctx) {
    let d = DatabaseService.get(ctx.chat.id);

    if (!d) {
      d = {};
    }

    if (!d.leverage) d.leverage = 15;
    if (!d.capitalPercent) d.capitalPercent = 5;
    if (!d.maxPositions) d.maxPositions = 5;
    if (!d.strategy) d.strategy = -1;
    if (!d.exchange) d.exchange = 0;

    this.lastCategoryPool.set(ctx.chat.id, "onSettings");

    this.bot.sendMessage(
      ctx.chat.id,
      "⚒Here are your *current settings* for trading, you can change them through the menu below! \n" +
        "➖➖➖➖➖➖➖➖➖➖➖\n" +
        `*Exchange:* \`${d.exchange === 0 ? "Binance" : "ByBit"}\`\n` +
        `*Strategy:* \`${
          d.strategy === -1 ? "Trailing" : `Specific TP [TP${d.strategy}]`
        }\`\n` +
        `*Leverage:* \`${d.leverage}x\`\n` +
        `*Percent of capital per trade:* \`${d.capitalPercent}%\`\n` +
        `*Maximum open trades:* \`${d.maxPositions}\``,
      {
        reply_markup: {
          one_time_keyboard: true,
          resize_keyboard: true,

          keyboard: [
            [
              {
                text: this.COMMANDS.ChangeLeverage,
              },
              {
                text: this.COMMANDS.ChangePercentTrade,
              },
              {
                text: this.COMMANDS.ChangeMaxPositions,
              },
              {
                text: this.COMMANDS.ChangeTakeProfits,
              },
              {
                text: this.COMMANDS.SetExchange,
              },
            ],
            [
              {
                text: this.COMMANDS.Back,
              },
              {
                text: this.COMMANDS.MainMenu,
              },
            ],
          ],
        },

        parse_mode: "Markdown",
      }
    );
  }

  onStartChangeLeverage(ctx) {
    if (!this.changeLeveragePool.has(ctx.chat.id)) {
      this.changeLeveragePool.add(ctx.chat.id);
    }

    this.bot.sendMessage(ctx.chat.id, "Enter leverage");
  }

  async onChangeLeverage(ctx) {
    let d = DatabaseService.get(ctx.chat.id);

    if (!d) {
      d = {};
    }

    const { text } = ctx;
    const leverage = parseInt(text);

    if (isNaN(text) || leverage < 5 || leverage > 125) {
      return this.bot.sendMessage(ctx.chat.id, this.INCORRECT_MESSAGE);
    }

    d.leverage = leverage;

    DatabaseService.set(ctx.chat.id, d);

    this.changeLeveragePool.delete(ctx.chat.id);

    await this.bot.sendMessage(ctx.chat.id, this.SUCCESS_MESSAGE);

    this.onTrading(ctx);
  }

  onStartChangePercent(ctx) {
    if (!this.changePercentPool.has(ctx.chat.id)) {
      this.changePercentPool.add(ctx.chat.id);
    }

    this.bot.sendMessage(ctx.chat.id, "Enter capital percent");
  }

  async onChangePercent(ctx) {
    let d = DatabaseService.get(ctx.chat.id);

    if (!d) {
      d = {};
    }

    const { text } = ctx;
    const capitalPercent = parseInt(text);

    if (isNaN(text) || capitalPercent <= 0 || capitalPercent > 100) {
      return this.bot.sendMessage(ctx.chat.id, this.INCORRECT_MESSAGE);
    }

    d.capitalPercent = capitalPercent;

    DatabaseService.set(ctx.chat.id, d);

    this.changePercentPool.delete(ctx.chat.id);

    await this.bot.sendMessage(ctx.chat.id, this.SUCCESS_MESSAGE);

    this.onTrading(ctx);
  }

  onStartChangeMaxPositions(ctx) {
    if (!this.changeMaxPositionsPool.has(ctx.chat.id)) {
      this.changeMaxPositionsPool.add(ctx.chat.id);
    }

    this.bot.sendMessage(ctx.chat.id, "Enter max positions count");
  }

  async onChangeMaxPositions(ctx) {
    let d = DatabaseService.get(ctx.chat.id);

    if (!d) {
      d = {};
    }

    const { text } = ctx;
    const maxPositions = parseInt(text);

    if (isNaN(text) || maxPositions <= 0 || maxPositions > 100) {
      return this.bot.sendMessage(ctx.chat.id, this.INCORRECT_MESSAGE);
    }

    d.maxPositions = maxPositions;

    DatabaseService.set(ctx.chat.id, d);

    this.changeMaxPositionsPool.delete(ctx.chat.id);

    await this.bot.sendMessage(ctx.chat.id, this.SUCCESS_MESSAGE);

    this.onTrading(ctx);
  }

  async onConfirmTrading(ctx) {
    if (this.onTrailingQuest.has(ctx.chat.id)) {
      const data = DatabaseService.get(ctx.chat.id);

      data.strategy = -1;

      this.onTrailingQuest.delete(ctx.chat.id);

      DatabaseService.set(ctx.chat.id, data);

      await this.bot.sendMessage(
        ctx.chat.id,
        "✅The strategy has been *successfully changed!*",
        {
          parse_mode: "markdown",

          reply_markup: {},
        }
      );

      this.onChangeTakeProfits(ctx);

      return;
    }

    if (this.onSpecificTakeProfitChange.has(ctx.chat.id)) {
      const data = this.onSpecificTakeProfitChange.get(ctx.chat.id);
      const dbData = DatabaseService.get(ctx.chat.id);

      dbData.strategy = data.takeProfit;

      DatabaseService.set(ctx.chat.id, dbData);

      this.onSpecificTakeProfitChange.delete(ctx.chat.id);

      await this.bot.sendMessage(
        ctx.chat.id,
        "✅The strategy has been *successfully changed!*",
        {
          parse_mode: "markdown",
        }
      );

      this.onChangeTakeProfits(ctx);

      return;
    }

    if (!this.tradingStartStopPool.has(ctx.chat.id)) return;

    const action = this.tradingStartStopPool.get(ctx.chat.id);
    const data = DatabaseService.get(ctx.chat.id);

    if (!data || (!data.publicKey && !data.bybit)) {
      return this.bot.sendMessage(
        ctx.chat.id,
        "❗Before you can start *auto trading*, you need to add an exchange account!\n" +
          "\n" +
          "It can be done in the: `⚙ SETTINGS - 🔐Binance account - ➕Add account!`",
        {
          parse_mode: "markdown",
        }
      );
    }

    if (action ? data.trading : !data.trading) {
      return this.bot.sendMessage(
        ctx.chat.id,
        `‼\`ERROR:\` *Autotrading is already ${
          action ? "enabled" : "disabled"
        }!*`,
        {
          parse_mode: "markdown",
        }
      );
    }

    data.trading = action;

    DatabaseService.set(ctx.chat.id, data);

    await this.bot.sendMessage(
      ctx.chat.id,
      `${action ? "Enabled" : "Disabled"} autotrading`
    );

    this.onDashboard(ctx);
  }

  async onCancelTrading(ctx) {
    if (this.onSpecificTakeProfitChange.has(ctx.chat.id)) {
      this.onSpecificTakeProfitChange.delete(ctx.chat.id);

      this.onChangeTakeProfits(ctx);

      return;
    }

    if (this.onTrailingQuest.has(ctx.chat.id)) {
      this.onTrailingQuest.delete(ctx.chat.id);
      this.onChangeTakeProfits(ctx);
      return;
    }
    if (!this.tradingStartStopPool.has(ctx.chat.id)) return;

    this.tradingStartStopPool.delete(ctx.chat.id);

    this.onDashboard(ctx);
  }

  onSetExchange(ctx) {
    this.bot.sendMessage(ctx.chat.id, `Choose exchange`, {
      reply_markup: {
        one_time_keyboard: true,
        resize_keyboard: true,

        keyboard: [
          [
            {
              text: this.COMMANDS.SetBinance,
            },
            {
              text: this.COMMANDS.SetByBit,
            },
          ],
          [
            {
              text: this.COMMANDS.Back,
            },
            {
              text: this.COMMANDS.MainMenu,
            },
          ],
        ],
      },
    });
  }

  onSetBinance(ctx) {
    const d = DatabaseService.get(ctx.chat.id);

    d.exchange = 0;

    DatabaseService.set(ctx.chat.id, d);

    this.onTrading(ctx);
  }

  onSetByBit(ctx) {
    const d = DatabaseService.get(ctx.chat.id);

    d.exchange = 1;

    DatabaseService.set(ctx.chat.id, d);

    this.onTrading(ctx);
  }
}

module.exports = new TelegramService();
