const fs = require("fs");

class DatabaseService {
    PATH = __dirname + "/data.json";

    data = {};

    constructor() {
        if (!fs.existsSync(this.PATH)) {
            fs.writeFileSync(this.PATH, "{}", "utf8");
        }

        this.data = JSON.parse(fs.readFileSync(this.PATH, "utf8"));

        for (const key in this.data) {
            const value = this.data[key];

            if (value.publicKey) {
                TelegramService.publicKeyId.set(value.publicKey, parseInt(key));
            }

            if (value.bybit) {
                TelegramService.bybitPublicKeyId.set(value.bybit.publicKey, parseInt(key));
            }
        }

        console.log("DatabaseService - loaded");
    }

    set(key, value, save = true) {
        this.data[key] = value;

        if (value.publicKey) {
            TelegramService.publicKeyId.set(value.publicKey, parseInt(key));
        }

        if (value.bybit) {
            TelegramService.bybitPublicKeyId.set(value.bybit.publicKey, parseInt(key));
        }

        if (save) {
            this.save();
        }
    }

    get(key, defaultValue) {
        let v = this.data[key];

        if (!v) return defaultValue;

        return v;
    }

    delete(key, save = true) {
        delete this.data[key];

        if (save) {
            this.save();
        }
    }

    has(key) {
        return !!this.get(key);
    }

    all() {
        return this.data;
    }

    save() {
        fs.writeFileSync(this.PATH, JSON.stringify(this.data, null, "\t"), "utf8");
    }
}

module.exports = new DatabaseService();