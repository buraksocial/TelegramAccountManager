const TelegramBot = require('node-telegram-bot-api');
const { TelegramClient, Api } = require('teleproto');
const { StringSession } = require('teleproto/sessions');
const fs = require('fs');

const anaBotToken = process.env.TELEGRAM_BOT_TOKEN;
const yoneticiId = Number(process.env.TELEGRAM_ADMIN_ID || 0);
if (!anaBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN ortam değişkeni tanımlanmalı.');
}
const anaBot = new TelegramBot(anaBotToken, { polling: true });

process.on('unhandledRejection', (reason, promise) => {
    // GramJS arka planda bağlantı koptuğunda timeout fırlatabiliyor, bunu yoksayıyoruz.
});

process.on('uncaughtException', (err) => {
    // Çökmeyi önlemek için global hata yakalayıcı.
});

function rastgeleApiGetir() {
    const varsayilanApiId = Number(process.env.TELEGRAM_API_ID || 0);
    const varsayilanApiHash = process.env.TELEGRAM_API_HASH || '';

    if (!fs.existsSync('./apiler.txt')) {
        return { apiId: varsayilanApiId, apiHash: varsayilanApiHash };
    }
    const satirlar = fs.readFileSync('./apiler.txt', 'utf-8').split('\n').map(s => s.trim()).filter(Boolean);
    if (satirlar.length === 0) {
        return { apiId: varsayilanApiId, apiHash: varsayilanApiHash };
    }
    const rastgele = satirlar[Math.floor(Math.random() * satirlar.length)];
    const parcalar = rastgele.split(':');
    if (parcalar.length >= 2) {
        return { apiId: parseInt(parcalar[0]), apiHash: parcalar[1].trim() };
    }
    return { apiId: varsayilanApiId, apiHash: varsayilanApiHash };
}

function varsayilanApiGetir() {
    const api = rastgeleApiGetir();
    if (!api.apiId || !api.apiHash) throw new Error('TELEGRAM_API_ID ve TELEGRAM_API_HASH veya apiler.txt tanımlanmalı.');
    return api;
}

anaBot.setMyCommands([
    { command: 'start', description: 'Botu başlatır ve menüyü gösterir' },
    { command: 'yardim', description: 'Kullanabileceğiniz komutları gösterir' },
    { command: 'hesapekle', description: 'Sisteme yeni hesap ekler' },
    { command: 'baslat', description: 'Gruplara katılma işlemini başlatır' },
    { command: 'hesaplaritara', description: 'Eski hesapları güncel formata tarar' },
    { command: 'hesapyonet', description: 'Hesap profilini yönetir' }
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const yoneticiDurum = {};

function hesaplariGetir() {
    if (!fs.existsSync('./hesaplar.json')) {
        fs.writeFileSync('./hesaplar.json', JSON.stringify([]));
    }
    return JSON.parse(fs.readFileSync('./hesaplar.json', 'utf-8'));
}

function parseTargetId(input) {
    if (!input) return input;
    let val = String(input).trim();
    if (val.includes('t.me/')) {
        let parts = val.split('t.me/');
        val = parts[parts.length - 1].split('/')[0];
    }
    if (val.startsWith('@')) {
        val = val.substring(1);
    }
    const num = Number(val);
    if (!isNaN(num) && val !== '') {
        return num;
    }
    return val;
}

function senaryoGruplariGetir() {
    if (!fs.existsSync('./senaryo-gruplari.json')) {
        fs.writeFileSync('./senaryo-gruplari.json', JSON.stringify([]));
    }
    try { return JSON.parse(fs.readFileSync('./senaryo-gruplari.json', 'utf-8')); }
    catch (e) { return []; }
}

function senaryoGruplariKaydet(data) {
    fs.writeFileSync('./senaryo-gruplari.json', JSON.stringify(data, null, 2));
}

async function hesapClientOlustur(indeks, maxDeneme = 5) {
    const hesaplar = hesaplariGetir();
    if (indeks < 0 || indeks >= hesaplar.length) return null;
    const hesapObj = hesaplar[indeks];
    const sessionString = typeof hesapObj === 'string' ? hesapObj : hesapObj.session;
    const varsayilan = varsayilanApiGetir();
    const gecerliApiId = (typeof hesapObj === 'object' && hesapObj.apiId) ? hesapObj.apiId : varsayilan.apiId;
    const gecerliApiHash = (typeof hesapObj === 'object' && hesapObj.apiHash) ? hesapObj.apiHash : varsayilan.apiHash;

    let proxyler = [];
    if (fs.existsSync('./proxyler.txt')) {
        proxyler = fs.readFileSync('./proxyler.txt', 'utf-8').split('\n').filter(Boolean);
    }

    for (let deneme = 0; deneme < maxDeneme; deneme++) {
        let proxyAyari = undefined;
        if (proxyler.length > 0) {
            let proxyIndex = deneme === 0 ? (indeks % proxyler.length) : Math.floor(Math.random() * proxyler.length);
            let proxySatir = proxyler[proxyIndex].trim();
            const randomSessionId = Math.floor(10000 + Math.random() * 90000);
            proxySatir = proxySatir.replace(/-session-[^:]+/, `-session-${randomSessionId}`);
            const proxyParcalari = proxySatir.split(':');
            proxyAyari = {
                ip: proxyParcalari[0],
                port: parseInt(proxyParcalari[1]),
                socksType: 5
            };
            if (proxyParcalari.length === 4) {
                proxyAyari.username = proxyParcalari[2];
                proxyAyari.password = proxyParcalari[3];
            }
        }

        const client = new TelegramClient(new StringSession(sessionString), gecerliApiId, gecerliApiHash, {
            connectionRetries: 1,
            proxy: proxyAyari
        });

        try {
            await client.connect();
            return client;
        } catch (err) {
            console.log(`[Hesap ${indeks + 1}] Bağlantı/Proxy hatası (${proxyAyari ? proxyAyari.ip + ':' + proxyAyari.port : 'Yok'}): ${err.message}. Yeni proxy deneniyor...`);
            try { await client.disconnect(); } catch (e) { }
            if (proxyler.length === 0) {
                console.log(`[Hesap ${indeks + 1}] Proxy listesi boş olduğundan bağlantı tekrar denenmeyecek.`);
                return null;
            }
            if (deneme === maxDeneme - 1) {
                console.log(`[Hesap ${indeks + 1}] Tüm bağlantı denemeleri başarısız oldu.`);
                return null;
            }
        }
    }
    return null;
}

async function otomatikApiAl(client, phone) {
    try {
        if (!phone) {
            const me = await client.getMe();
            phone = me.phone;
        }
        if (!phone) return null;
        phone = phone.replace(/[^0-9]/g, '');
        phone = '+' + phone;

        const sendPwRes = await fetch('https://my.telegram.org/auth/send_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `phone=${encodeURIComponent(phone)}`
        });
        const sendPwText = await sendPwRes.text();
        let random_hash = "";
        try {
            const json = JSON.parse(sendPwText);
            if (!json.random_hash) throw new Error("random_hash yok");
            random_hash = json.random_hash;
        } catch (e) {
            console.log("[DEBUG] send_password başarısız oldu:", sendPwText);
            return null;
        }

        let webCode = null;
        for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const messages = await client.getMessages(777000, { limit: 3 });
            for (const m of messages) {
                if (m.date > Date.now() / 1000 - 300 && m.message) {
                    console.log("\n--- [TELEGRAM MESAJI BAŞLANGIÇ] ---");
                    console.log(m.message);
                    console.log("--- [TELEGRAM MESAJI BİTİŞ] ---\n");
                }

                if (m.date > Date.now() / 1000 - 120 && m.message && m.message.includes('my.telegram.org')) {
                    const regexler = [
                        /code:\s*\n*([a-zA-Z0-9_-]+)/i,
                        /kodunuz:\s*\n*([a-zA-Z0-9_-]+)/i,
                        /^([a-zA-Z0-9_-]{8,20})$/m
                    ];
                    for (const rx of regexler) {
                        const match = m.message.match(rx);
                        if (match) {
                            webCode = match[1];
                            console.log("=> Şifre yakalandı: " + webCode);
                            break;
                        }
                    }
                }
            }
            if (webCode) break;
        }

        if (!webCode) return null;

        const loginRes = await fetch('https://my.telegram.org/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `phone=${encodeURIComponent(phone)}&random_hash=${random_hash}&password=${webCode}`
        });
        const loginText = await loginRes.text();
        if (loginText !== "true") return null;

        const setCookieHeader = loginRes.headers.get('set-cookie');
        if (!setCookieHeader) return null;
        const cookie = setCookieHeader.split(';')[0];

        const appsRes = await fetch('https://my.telegram.org/apps', { headers: { 'Cookie': cookie } });
        const appsText = await appsRes.text();

        const apiIdMatch = appsText.match(/<strong>App api_id:<\/strong>\n\s*<span>(\d+)<\/span>/);
        const apiHashMatch = appsText.match(/<strong>App api_hash:<\/strong>\n\s*<span>([a-f0-9]+)<\/span>/);
        if (apiIdMatch && apiHashMatch) return { apiId: parseInt(apiIdMatch[1]), apiHash: apiHashMatch[1] };

        const hashMatch = appsText.match(/<input type="hidden" name="hash" value="([a-f0-9]+)"/);
        if (!hashMatch) return null;

        const createBody = new URLSearchParams({
            hash: hashMatch[1],
            app_title: 'My Telegram App',
            app_shortname: 'app' + Math.random().toString(36).substring(2, 10) + 'xyz',
            app_url: '',
            app_platform: 'android',
            app_desc: 'My Telegram App for personal use'
        });

        await fetch('https://my.telegram.org/apps/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookie },
            body: createBody.toString()
        });

        const finalAppsRes = await fetch('https://my.telegram.org/apps', { headers: { 'Cookie': cookie } });
        const finalAppsText = await finalAppsRes.text();

        const fApiIdMatch = finalAppsText.match(/<strong>App api_id:<\/strong>\n\s*<span>(\d+)<\/span>/);
        const fApiHashMatch = finalAppsText.match(/<strong>App api_hash:<\/strong>\n\s*<span>([a-f0-9]+)<\/span>/);
        if (fApiIdMatch && fApiHashMatch) return { apiId: parseInt(fApiIdMatch[1]), apiHash: fApiHashMatch[1] };

        return null;
    } catch (e) { return null; }
}

async function hesabiKaydet(chatId, hesapObj, client) {
    anaBot.sendMessage(chatId, "Hesap doğrulandı. Şimdi my.telegram.org üzerinden özel API kimlikleri (API ID / Hash) oluşturuluyor, lütfen bekleyin (5-15 sn)...");
    const ozelApi = await otomatikApiAl(client, hesapObj.phone);
    if (ozelApi) {
        hesapObj.apiId = ozelApi.apiId;
        hesapObj.apiHash = ozelApi.apiHash;
        anaBot.sendMessage(chatId, `✅ Başarılı! my.telegram.org üzerinden özel API kimlikleri alındı (API ID: ${hesapObj.apiId}).`);
    } else {
        anaBot.sendMessage(chatId, `⚠️ Özel API kimlikleri alınamadı. Varsayılan API kimlikleri ile kaydediliyor.`);
    }

    const hesaplar = hesaplariGetir();
    hesaplar.push(hesapObj);
    fs.writeFileSync('./hesaplar.json', JSON.stringify(hesaplar, null, 2));
    anaBot.sendMessage(chatId, `Hesap başarıyla sisteme eklendi. Toplam hesap: ${hesaplar.length}`);
}

function yardimGoster(chatId) {
    const metin = `📌 **Kullanılabilir Komutlar:**\n\n` +
        `🔹 /start - Ana menüyü gösterir.\n` +
        `🔹 /hesapekle - Sisteme String Session veya Numara ile hesap ekler.\n` +
        `🔹 /baslat - Kayıtlı hesapları kullanarak hedeflenen gruplara katılma işlemini başlatır.\n` +
        `🔹 /hesaplaritara - Eski tarzda kaydedilmiş hesapların kullanıcı adı ve ID bilgilerini tarayıp günceller.\n` +
        `🔹 /hesapyonet <indeks|@kullaniciadi|ID> - Belirtilen hesabın ismini, kullanıcı adını veya profil fotoğrafını değiştirir.\n` +
        `🔹 /cek <GrupID|HesapID> - Belirtilen hedeften medya çekme sihirbazını başlatır.\n` +
        `🔹 /yardim - Bu menüyü gösterir.`;
    anaBot.sendMessage(chatId, metin, { parse_mode: 'Markdown' });
}

anaBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== yoneticiId) return;

    const secenekler = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '➕ Hesap Ekle', callback_data: 'menu_hesapekle' }, { text: '🚀 İşlemi Başlat', callback_data: 'menu_baslat' }],
                [{ text: '⚙️ Hesap Yönetimi', callback_data: 'menu_hesapyonet_bilgi' }, { text: '🔄 Hesapları Tara', callback_data: 'menu_hesaplaritara' }],
                [{ text: '📥 Medya Çek', callback_data: 'menu_cek' }, { text: '❓ Yardım', callback_data: 'menu_yardim' }]
            ]
        }
    };

    anaBot.sendMessage(chatId, "👋 Telegram Toplu İşlem Botuna Hoş Geldiniz!\n\nAşağıdaki menüden yapmak istediğiniz işlemi seçebilir veya komutların detayları için /yardim yazabilirsiniz.", secenekler);
});

anaBot.onText(/\/(help|yardim|yardım)/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== yoneticiId) return;
    yardimGoster(chatId);
});

anaBot.onText(/\/hesapyonet (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId !== yoneticiId) return;

    const arg = match[1].trim();
    const hesaplar = hesaplariGetir();
    let indeks = -1;

    if (arg.startsWith('@')) {
        const targetUsername = arg.replace('@', '').toLowerCase();
        indeks = hesaplar.findIndex(h => typeof h === 'object' && h.username && h.username.toLowerCase() === targetUsername);
    } else if (/^\d{5,}$/.test(arg)) {
        indeks = hesaplar.findIndex(h => typeof h === 'object' && h.id && h.id.toString() === arg);
    } else if (/^\d+$/.test(arg)) {
        indeks = parseInt(arg, 10) - 1;
    }

    if (indeks < 0 || indeks >= hesaplar.length) {
        return anaBot.sendMessage(chatId, `hata: bu kriterlere uyan bir hesap bulunamadı.\n(Eğer sadece sayılarla indeks girmiyorsanız, önce /hesaplaritara komutunu çalıştırıp hesapların id ve username bilgilerini taramalısınız.)`);
    }

    const secenekler = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'İsmi Değiştir', callback_data: `yonet_isim_${indeks}` }],
                [{ text: 'Kullanıcı Adı Değiştir', callback_data: `yonet_username_${indeks}` }],
                [{ text: 'Profil Fotoğrafı Değiştir', callback_data: `yonet_avatar_${indeks}` }],
                [{ text: '🔑 Özel API Kimlikleri Al', callback_data: `yonet_api_${indeks}` }]
            ]
        }
    };
    anaBot.sendMessage(chatId, `${indeks + 1}. hesap için yapmak istediğiniz işlemi seçin:`, secenekler);
});

async function hesaplariTaraIslemi(chatId, targetIndices = null) {
    let hesaplar = hesaplariGetir();

    // Hangi hesapların taranacağını belirle
    let taranacakIndeksler = [];
    if (targetIndices && Array.isArray(targetIndices) && targetIndices.length > 0) {
        taranacakIndeksler = targetIndices;
        anaBot.sendMessage(chatId, `Seçili ${taranacakIndeksler.length} hesap taranıyor...`);
    } else {
        // null veya boş dizi ise hepsini tara
        taranacakIndeksler = hesaplar.map((_, i) => i);
        anaBot.sendMessage(chatId, `Tüm ${hesaplar.length} hesap taranıyor, bu işlem hesap sayısına bağlı olarak biraz sürebilir...`);
    }

    let guncellenen = 0;
    let dialoglarMap = {};
    if (fs.existsSync('./dialoglar.json')) {
        try { dialoglarMap = JSON.parse(fs.readFileSync('./dialoglar.json', 'utf-8')); } catch (e) { }
    }

    for (let i of taranacakIndeksler) {
        if (i >= hesaplar.length) continue;
        if (typeof hesaplar[i] === 'string' || (typeof hesaplar[i] === 'object' && !hesaplar[i].apiId)) {
            try {
                const eskiHesapObj = typeof hesaplar[i] === 'object' ? hesaplar[i] : {};
                const sessionStr = typeof hesaplar[i] === 'string' ? hesaplar[i] : hesaplar[i].session;
                const secilenApi = rastgeleApiGetir();

                hesaplar[i] = {
                    ...eskiHesapObj,
                    session: sessionStr,
                    apiId: secilenApi.apiId,
                    apiHash: secilenApi.apiHash
                };
            } catch (err) {
                console.log(`${i + 1}. hesap güncellenirken hata: ${err.message}`);
            }
        }

        try {
            const client = await hesapClientOlustur(i);
            if (client) {
                const me = await client.getMe();
                hesaplar[i].id = me.id ? me.id.toString() : "";
                hesaplar[i].username = me.username || "";
                hesaplar[i].firstName = me.firstName || "";
                hesaplar[i].phone = me.phone || hesaplar[i].phone || "";

                if (hesaplar[i].id) {
                    try {
                        const dialogs = await client.getDialogs();
                        const hesapDialoglari = [];
                        for (const dialog of dialogs) {
                            if (dialog.isChannel || dialog.isGroup) {
                                hesapDialoglari.push({
                                    id: dialog.id.toString(),
                                    title: dialog.title || "",
                                    isChannel: dialog.isChannel,
                                    isGroup: dialog.isGroup,
                                    isForum: dialog.entity && dialog.entity.forum ? true : false
                                });
                            }
                        }
                        dialoglarMap[hesaplar[i].id] = hesapDialoglari;
                    } catch (err) {
                        console.log(`Hesap ${hesaplar[i].id} dialog çekme hatası: ${err.message}`);
                    }
                }

                await client.disconnect();
                guncellenen++;
            }
        } catch (err) {
            console.log(`${i + 1}. hesap taranamadı: ${err.message}`);
        }
    }

    fs.writeFileSync('./hesaplar.json', JSON.stringify(hesaplar, null, 2));
    fs.writeFileSync('./dialoglar.json', JSON.stringify(dialoglarMap, null, 2));
    anaBot.sendMessage(chatId, `tarama tamamlandı. ${guncellenen} hesap güncel formata dönüştürüldü ve kanalları/grupları haritalandı.`);
}

anaBot.onText(/\/hesaplaritara/, async (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== yoneticiId) return;
    await hesaplariTaraIslemi(chatId);
});

function gosterHesapGruplari(chatId, indeks, sayfa = 0, messageId = null) {
    const hesaplar = hesaplariGetir();
    const secilenHesap = hesaplar[indeks];
    if (!secilenHesap) return;

    let dialoglarMap = {};
    if (fs.existsSync('./dialoglar.json')) {
        try { dialoglarMap = JSON.parse(fs.readFileSync('./dialoglar.json', 'utf-8')); } catch (e) { }
    }

    const hesapDialoglari = dialoglarMap[secilenHesap.id] || [];
    if (hesapDialoglari.length === 0) {
        const metin = "Bu hesaba ait haritalanmış grup/kanal bulunamadı. Lütfen önce /hesaplaritara yapın.";
        if (messageId) {
            return anaBot.editMessageText(metin, { chat_id: chatId, message_id: messageId });
        }
        return anaBot.sendMessage(chatId, metin);
    }

    const baslangic = sayfa * 10;
    const bitis = baslangic + 10;
    const liste = hesapDialoglari.slice(baslangic, bitis);

    const inlineKeyboard = [];
    for (let d of liste) {
        inlineKeyboard.push([{ text: d.title.substring(0, 40), callback_data: `cek_g_${indeks}_${d.id}` }]);
    }

    const nav = [];
    if (sayfa > 0) nav.push({ text: '⬅️ Geri', callback_data: `cek_h_sec_${indeks}_${sayfa - 1}` });
    if (bitis < hesapDialoglari.length) nav.push({ text: 'İleri ➡️', callback_data: `cek_h_sec_${indeks}_${sayfa + 1}` });
    if (nav.length > 0) inlineKeyboard.push(nav);
    inlineKeyboard.push([{ text: '🔙 Listeye Dön', callback_data: `cek_list_h_0` }]);

    const text = `Hesap: ${secilenHesap.firstName || secilenHesap.username}\nBu hesapla hangi gruptan veri çekelim? (Sayfa ${sayfa + 1})`;
    if (messageId) {
        anaBot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: inlineKeyboard } });
    } else {
        anaBot.sendMessage(chatId, text, { reply_markup: { inline_keyboard: inlineKeyboard } });
    }
}

function gosterGrupHesaplari(chatId, grupId, sayfa = 0, messageId = null) {
    const hesaplar = hesaplariGetir();
    let dialoglarMap = {};
    if (fs.existsSync('./dialoglar.json')) {
        try { dialoglarMap = JSON.parse(fs.readFileSync('./dialoglar.json', 'utf-8')); } catch (e) { }
    }

    const ekliHesaplar = [];
    for (let i = 0; i < hesaplar.length; i++) {
        const h = hesaplar[i];
        if (h.id && dialoglarMap[h.id]) {
            const varMi = dialoglarMap[h.id].find(d => d.id === grupId || d.id === "-100" + grupId);
            if (varMi) ekliHesaplar.push({ hesap: h, indeks: i });
        }
    }

    if (ekliHesaplar.length === 0) {
        const metin = "Bu grup/kanal ID'sine üye olan hiçbir hesap bulunamadı.";
        if (messageId) {
            return anaBot.editMessageText(metin, { chat_id: chatId, message_id: messageId });
        }
        return anaBot.sendMessage(chatId, metin);
    }

    const baslangic = sayfa * 10;
    const bitis = baslangic + 10;
    const liste = ekliHesaplar.slice(baslangic, bitis);

    const inlineKeyboard = [];
    for (const item of liste) {
        const h = item.hesap;
        const text = `${h.firstName || ''} (@${h.username || ''})`.trim();
        inlineKeyboard.push([{ text: text || `Hesap ${h.id}`, callback_data: `cek_h_${item.indeks}_${grupId}` }]);
    }

    const nav = [];
    if (sayfa > 0) nav.push({ text: '⬅️ Geri', callback_data: `cek_g_sec_${grupId}_${sayfa - 1}` });
    if (bitis < ekliHesaplar.length) nav.push({ text: 'İleri ➡️', callback_data: `cek_g_sec_${grupId}_${sayfa + 1}` });
    if (nav.length > 0) inlineKeyboard.push(nav);
    inlineKeyboard.push([{ text: '🔙 Gruplara Dön', callback_data: `cek_list_g_0` }]);

    const text = `Grup/Kanal ID: ${grupId}\nBu gruptan veriyi hangi hesapla çekeyim? (Sayfa ${sayfa + 1})`;
    if (messageId) {
        anaBot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: inlineKeyboard } });
    } else {
        anaBot.sendMessage(chatId, text, { reply_markup: { inline_keyboard: inlineKeyboard } });
    }
}

anaBot.onText(/\/cek(?: (.*))?/, (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId !== yoneticiId) return;

    const parametre = (match[1] || '').trim();
    if (!parametre) {
        return anaBot.sendMessage(chatId, "Neyi listelemek istiyorsunuz?", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👤 Hesapları Listele', callback_data: 'cek_list_h_0' }],
                    [{ text: '👥 Grupları/Kanalları Listele', callback_data: 'cek_list_g_0' }]
                ]
            }
        });
    }

    const hesaplar = hesaplariGetir();
    let secilenHesapIndeks = -1;
    if (parametre.startsWith('@')) {
        const username = parametre.replace('@', '').toLowerCase();
        secilenHesapIndeks = hesaplar.findIndex(h => typeof h === 'object' && h.username && h.username.toLowerCase() === username);
    } else {
        secilenHesapIndeks = hesaplar.findIndex(h => typeof h === 'object' && h.id === parametre);
    }

    if (secilenHesapIndeks !== -1) {
        gosterHesapGruplari(chatId, secilenHesapIndeks);
    } else {
        gosterGrupHesaplari(chatId, parametre);
    }
});

anaBot.onText(/\/hesapekle/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== yoneticiId) return;

    const secenekler = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'tsession ile ekle', callback_data: 'ekle_tsession' }],
                [{ text: 'numara ile ekle', callback_data: 'ekle_numara' }]
            ]
        }
    };
    anaBot.sendMessage(chatId, "hesap ekleme yöntemini seçin:", secenekler);
});

anaBot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    if (msg.chat.id !== yoneticiId) return;

    if (data === 'menu_hesapekle') {
        const secenekler = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'tsession ile ekle', callback_data: 'ekle_tsession' }],
                    [{ text: 'numara ile ekle', callback_data: 'ekle_numara' }]
                ]
            }
        };
        anaBot.sendMessage(msg.chat.id, "hesap ekleme yöntemini seçin:", secenekler);
    } else if (data === 'menu_baslat') {
        const hesaplar = hesaplariGetir();
        if (hesaplar.length === 0) {
            anaBot.sendMessage(msg.chat.id, "sistemde kayıtlı hesap yok. lütfen hesap ekleyin.");
        } else {
            const secenekler = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'gruplar.txt\'den Al', callback_data: 'baslat_dosya' }],
                        [{ text: 'Kendim Gireceğim', callback_data: 'baslat_manuel' }]
                    ]
                }
            };
            anaBot.sendMessage(msg.chat.id, "hedef grupları nereden alalım?", secenekler);
        }
    } else if (data === 'menu_hesapyonet_bilgi') {
        yoneticiDurum[msg.chat.id] = { adim: 'YONET_HESAP_SECIMI_BEKLIYOR' };
        anaBot.sendMessage(msg.chat.id, "Lütfen yönetmek istediğiniz hesabın indeksini (1, 2 vb.), ID'sini veya kullanıcı adını (@merhabaworld) gönderin:");
    } else if (data === 'menu_hesaplaritara') {
        hesaplariTaraIslemi(msg.chat.id);
    } else if (data === 'menu_cek') {
        anaBot.sendMessage(msg.chat.id, "Neyi listelemek istiyorsunuz?", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👤 Hesapları Listele', callback_data: 'cek_list_h_0' }],
                    [{ text: '👥 Grupları/Kanalları Listele', callback_data: 'cek_list_g_0' }]
                ]
            }
        });
    } else if (data.startsWith('cek_list_h_')) {
        const sayfa = parseInt(data.split('_')[3]);
        const hesaplar = hesaplariGetir();
        const baslangic = sayfa * 10;
        const bitis = baslangic + 10;
        const liste = hesaplar.slice(baslangic, bitis);

        const inlineKeyboard = [];
        for (let i = 0; i < liste.length; i++) {
            const h = liste[i];
            const gercekIndex = baslangic + i;
            const text = `${h.firstName || ''} (@${h.username || ''})`.trim() || `Hesap ${h.id || gercekIndex}`;
            inlineKeyboard.push([{ text: text, callback_data: `cek_h_sec_${gercekIndex}_0` }]);
        }

        const nav = [];
        if (sayfa > 0) nav.push({ text: '⬅️ Geri', callback_data: `cek_list_h_${sayfa - 1}` });
        if (bitis < hesaplar.length) nav.push({ text: 'İleri ➡️', callback_data: `cek_list_h_${sayfa + 1}` });
        if (nav.length > 0) inlineKeyboard.push(nav);

        anaBot.editMessageText(`Kayıtlı Hesaplar (Sayfa ${sayfa + 1})\nBir hesap seçin:`, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            reply_markup: { inline_keyboard: inlineKeyboard }
        });
    } else if (data.startsWith('cek_list_g_')) {
        const sayfa = parseInt(data.split('_')[3]);
        let dialoglarMap = {};
        if (fs.existsSync('./dialoglar.json')) {
            try { dialoglarMap = JSON.parse(fs.readFileSync('./dialoglar.json', 'utf-8')); } catch (e) { }
        }

        const gruplarMap = {};
        Object.values(dialoglarMap).forEach(hesapGruplari => {
            hesapGruplari.forEach(g => {
                if (!gruplarMap[g.id]) gruplarMap[g.id] = g.title;
            });
        });

        const benzersizGruplar = Object.keys(gruplarMap).map(id => ({ id, title: gruplarMap[id] }));
        const baslangic = sayfa * 10;
        const bitis = baslangic + 10;
        const liste = benzersizGruplar.slice(baslangic, bitis);

        const inlineKeyboard = [];
        for (let g of liste) {
            inlineKeyboard.push([{ text: (g.title || g.id).substring(0, 40), callback_data: `cek_g_sec_${g.id}_0` }]);
        }

        const nav = [];
        if (sayfa > 0) nav.push({ text: '⬅️ Geri', callback_data: `cek_list_g_${sayfa - 1}` });
        if (bitis < benzersizGruplar.length) nav.push({ text: 'İleri ➡️', callback_data: `cek_list_g_${sayfa + 1}` });
        if (nav.length > 0) inlineKeyboard.push(nav);

        anaBot.editMessageText(`Haritalanmış Gruplar/Kanallar (Sayfa ${sayfa + 1})\nBir hedef seçin:`, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            reply_markup: { inline_keyboard: inlineKeyboard }
        });
    } else if (data.startsWith('cek_h_sec_')) {
        const parcalar = data.split('_');
        const indeks = parseInt(parcalar[3]);
        const sayfa = parseInt(parcalar[4]) || 0;
        gosterHesapGruplari(msg.chat.id, indeks, sayfa, msg.message_id);
    } else if (data.startsWith('cek_g_sec_')) {
        const parcalar = data.split('_');
        const grupId = parcalar[3];
        const sayfa = parseInt(parcalar[4]) || 0;
        gosterGrupHesaplari(msg.chat.id, grupId, sayfa, msg.message_id);
    } else if (data === 'menu_yardim') {
        yardimGoster(msg.chat.id);
    } else if (data === 'ekle_tsession') {
        yoneticiDurum[msg.chat.id] = { adim: 'TSESSION_BEKLIYOR' };
        anaBot.sendMessage(msg.chat.id, "lütfen tsession değerini gönderin:");
    } else if (data === 'ekle_numara') {
        yoneticiDurum[msg.chat.id] = { adim: 'NUMARA_BEKLIYOR' };
        anaBot.sendMessage(msg.chat.id, "lütfen telefon numarasını uluslararası formatta (+90555...) gönderin:");
    } else if (data === 'baslat_dosya') {
        if (!fs.existsSync('./gruplar.txt')) {
            anaBot.sendMessage(msg.chat.id, "gruplar.txt dosyası bulunamadı.");
        } else {
            const gruplar = fs.readFileSync('./gruplar.txt', 'utf-8').split('\n').map(g => g.trim()).filter(Boolean);
            if (gruplar.length === 0) {
                anaBot.sendMessage(msg.chat.id, "gruplar.txt dosyası boş.");
            } else {
                yoneticiDurum[msg.chat.id] = { adim: 'BASLAT_KAC_HESAP_BEKLIYOR', gruplar: gruplar };
                anaBot.sendMessage(msg.chat.id, `Gruplar dosyadan alındı (${gruplar.length} grup).\nKaç hesaba işlem yaptırmak istiyorsunuz? (Tümü için 'hepsi' veya '0' yazabilirsiniz):`);
            }
        }
    } else if (data === 'baslat_manuel') {
        yoneticiDurum[msg.chat.id] = { adim: 'GRUP_LISTESI_BEKLIYOR' };
        anaBot.sendMessage(msg.chat.id, "lütfen hedeflenecek grupları (her satıra bir tane olacak şekilde) gönderin:");
    } else if (data.startsWith('yonet_isim_')) {
        const indeks = parseInt(data.split('_')[2]);
        yoneticiDurum[msg.chat.id] = { adim: 'YONET_ISIM_BEKLIYOR', indeks: indeks };
        anaBot.sendMessage(msg.chat.id, "yeni ismi (ad soyad şeklinde, aralarında boşluk bırakarak) gönderin:");
    } else if (data.startsWith('yonet_username_')) {
        const indeks = parseInt(data.split('_')[2]);
        yoneticiDurum[msg.chat.id] = { adim: 'YONET_USERNAME_BEKLIYOR', indeks: indeks };
        anaBot.sendMessage(msg.chat.id, "yeni kullanıcı adını (örneğin: merhabaworld) gönderin:");
    } else if (data.startsWith('yonet_avatar_')) {
        const indeks = parseInt(data.split('_')[2]);
        yoneticiDurum[msg.chat.id] = { adim: 'YONET_AVATAR_BEKLIYOR', indeks: indeks };
        anaBot.sendMessage(msg.chat.id, "hesap için yeni profil fotoğrafını (doğrudan resim olarak) gönderin:");
    } else if (data.startsWith('yonet_api_')) {
        const indeks = parseInt(data.split('_')[2]);
        const hesaplar = hesaplariGetir();
        if (indeks >= 0 && indeks < hesaplar.length) {
            anaBot.sendMessage(msg.chat.id, "Hesap bağlantısı kuruluyor ve my.telegram.org üzerinden özel API oluşturuluyor. Bu işlem 10-15 saniye sürebilir...");
            (async () => {
                const client = await getCachedClient(indeks);
                if (client) {
                    const hesapObj = hesaplar[indeks];
                    const ozelApi = await otomatikApiAl(client, hesapObj.phone);
                    if (ozelApi) {
                        hesapObj.apiId = ozelApi.apiId;
                        hesapObj.apiHash = ozelApi.apiHash;
                        fs.writeFileSync('./hesaplar.json', JSON.stringify(hesaplar, null, 2));
                        anaBot.sendMessage(msg.chat.id, `✅ Başarılı! ${indeks + 1}. Hesap için my.telegram.org üzerinden yeni API alındı (API ID: ${hesapObj.apiId}).`);
                    } else {
                        anaBot.sendMessage(msg.chat.id, `⚠️ Başarısız. Bu hesap için özel API alınamadı (Telegram SMS göndermemiş olabilir).`);
                    }
                    try { await client.disconnect(); } catch (e) { }
                } else {
                    anaBot.sendMessage(msg.chat.id, "❌ Hesaba bağlanılamadı. Lütfen ağ durumunu/hesabın banlı olup olmadığını kontrol edin.");
                }
            })();
        }
    } else if (data.startsWith('cek_g_') || data.startsWith('cek_h_')) {
        const parcalar = data.split('_');
        const islemTipi = parcalar[1];
        const indeks = parseInt(parcalar[2]);
        let grupId = parcalar.slice(3).join('_');

        anaBot.sendMessage(msg.chat.id, "Seçim yapıldı, konu (topic) detayları kontrol ediliyor...");

        let dialoglarMap = {};
        if (fs.existsSync('./dialoglar.json')) {
            try { dialoglarMap = JSON.parse(fs.readFileSync('./dialoglar.json', 'utf-8')); } catch (e) { }
        }

        const hesaplar = hesaplariGetir();
        const hesap = hesaplar[indeks];
        const hesapDialoglari = dialoglarMap[hesap.id] || [];
        const secilenGrup = hesapDialoglari.find(d => d.id === grupId || d.id === "-100" + grupId);

        let isForum = false;
        if (secilenGrup && secilenGrup.isForum) {
            isForum = true;
            try {
                const client = await getCachedClient(indeks);
                const result = await client.invoke(new Api.channels.GetForumTopics({
                    channel: secilenGrup.id,
                    offsetDate: 0, offsetId: 0, offsetTopic: 0, limit: 15
                }));

                const inlineKeyboard = [];
                if (result.topics) {
                    for (const topic of result.topics) {
                        if (topic.id === 1) continue; // Genel
                        inlineKeyboard.push([{ text: topic.title, callback_data: `cek_t_${indeks}_${topic.id}_${secilenGrup.id}` }]);
                    }
                }

                await client.disconnect();

                if (inlineKeyboard.length > 0) {
                    return anaBot.sendMessage(msg.chat.id, "Bu grup bir forum. Lütfen çekilecek konuyu (topic) seçin:", {
                        reply_markup: { inline_keyboard: inlineKeyboard }
                    });
                }
            } catch (err) {
                console.log("Topic çekme hatası:", err.message);
            }
        }

        yoneticiDurum[msg.chat.id] = { adim: 'MEDYA_LINK_BEKLIYOR', hesapIndeks: indeks, grupId: secilenGrup ? secilenGrup.id : grupId, topicId: null };
        anaBot.sendMessage(msg.chat.id, "✅ Seçim tamamlandı.\nŞimdi çekilecek medyanın (mesajın) linkini gönderin:");
    } else if (data.startsWith('cek_t_')) {
        const parcalar = data.split('_');
        const indeks = parseInt(parcalar[2]);
        const topicId = parseInt(parcalar[3]);
        const grupId = parcalar.slice(4).join('_');

        yoneticiDurum[msg.chat.id] = { adim: 'MEDYA_LINK_BEKLIYOR', hesapIndeks: indeks, grupId: grupId, topicId: topicId };
        anaBot.sendMessage(msg.chat.id, "✅ Konu seçimi tamamlandı.\nŞimdi çekilecek medyanın (mesajın) linkini gönderin:");
    }
    anaBot.answerCallbackQuery(callbackQuery.id);
});

anaBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== yoneticiId) return;
    if (msg.text && msg.text.startsWith('/')) return;

    const durum = yoneticiDurum[chatId];
    if (!durum) return;

    if (durum.adim === 'YONET_HESAP_SECIMI_BEKLIYOR') {
        if (!msg.text) return anaBot.sendMessage(chatId, "lütfen metin gönderin.");
        const arg = msg.text.trim();
        const hesaplar = hesaplariGetir();
        let indeks = -1;

        if (arg.startsWith('@')) {
            const targetUsername = arg.replace('@', '').toLowerCase();
            indeks = hesaplar.findIndex(h => typeof h === 'object' && h.username && h.username.toLowerCase() === targetUsername);
        } else if (/^\d{5,}$/.test(arg)) {
            indeks = hesaplar.findIndex(h => typeof h === 'object' && h.id && h.id.toString() === arg);
        } else if (/^\d+$/.test(arg)) {
            indeks = parseInt(arg, 10) - 1;
        }

        if (indeks < 0 || indeks >= hesaplar.length) {
            return anaBot.sendMessage(chatId, `hata: bu kriterlere uyan bir hesap bulunamadı.`);
        }

        const secenekler = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'İsmi Değiştir', callback_data: `yonet_isim_${indeks}` }],
                    [{ text: 'Kullanıcı Adı Değiştir', callback_data: `yonet_username_${indeks}` }],
                    [{ text: 'Profil Fotoğrafı Değiştir', callback_data: `yonet_avatar_${indeks}` }],
                    [{ text: '🔑 Özel API Kimlikleri Al', callback_data: `yonet_api_${indeks}` }]
                ]
            }
        };
        anaBot.sendMessage(chatId, `${indeks + 1}. hesap için yapmak istediğiniz işlemi seçin:`, secenekler);
        delete yoneticiDurum[chatId];
    }
    else if (durum.adim === 'TSESSION_BEKLIYOR') {
        const yeniSession = msg.text;
        anaBot.sendMessage(chatId, "oturum kontrol ediliyor, lütfen bekleyin...");
        try {
            const secilenApi = rastgeleApiGetir();
            const client = new TelegramClient(new StringSession(yeniSession), secilenApi.apiId, secilenApi.apiHash, { connectionRetries: 3 });
            await client.connect();
            const me = await client.getMe();
            const hesapObj = {
                session: yeniSession,
                id: me.id ? me.id.toString() : "",
                username: me.username || "",
                firstName: me.firstName || "",
                phone: me.phone || "",
                apiId: secilenApi.apiId,
                apiHash: secilenApi.apiHash
            };
            await hesabiKaydet(chatId, hesapObj, client);
            await client.disconnect();
        } catch (err) {
            anaBot.sendMessage(chatId, "tsession hatalı veya hesap banlı: " + err.message);
        }
        delete yoneticiDurum[chatId];
    }
    else if (durum.adim === 'NUMARA_BEKLIYOR') {
        const telefon = msg.text;
        anaBot.sendMessage(chatId, "kod gönderiliyor, lütfen bekleyin...");

        const secilenApi = varsayilanApiGetir();
        const client = new TelegramClient(new StringSession(''), secilenApi.apiId, secilenApi.apiHash, {
            connectionRetries: 5,
            deviceModel: "Samsung Galaxy S23 Ultra",
            systemVersion: "Android 13.0",
            appVersion: "10.14.5",
            langCode: "en",
            systemLangCode: "en"
        });
        await client.connect();

        try {
            const sonuc = await client.sendCode({ apiId: secilenApi.apiId, apiHash: secilenApi.apiHash }, telefon);
            yoneticiDurum[chatId] = {
                adim: 'KOD_BEKLIYOR',
                telefon: telefon,
                phoneCodeHash: sonuc.phoneCodeHash,
                client: client,
                secilenApi: secilenApi
            };
            anaBot.sendMessage(chatId, "telegram'dan gelen giriş kodunu gönderin:");
        } catch (err) {
            anaBot.sendMessage(chatId, "kod gönderilirken hata oluştu: " + err.message);
            delete yoneticiDurum[chatId];
        }
    }
    else if (durum.adim === 'KOD_BEKLIYOR') {
        const kod = msg.text;
        try {
            await durum.client.invoke(new Api.auth.SignIn({
                phoneNumber: durum.telefon,
                phoneCodeHash: durum.phoneCodeHash,
                phoneCode: kod
            }));

            const me = await durum.client.getMe();
            const hesapObj = {
                session: durum.client.session.save(),
                id: me.id ? me.id.toString() : "",
                username: me.username || "",
                firstName: me.firstName || "",
                phone: me.phone || durum.telefon || "",
                apiId: durum.secilenApi.apiId,
                apiHash: durum.secilenApi.apiHash
            };
            await hesabiKaydet(chatId, hesapObj, durum.client);
            await durum.client.disconnect();
            delete yoneticiDurum[chatId];
        } catch (err) {
            if (err.message.includes('SESSION_PASSWORD_NEEDED')) {
                yoneticiDurum[chatId].adim = 'SIFRE_BEKLIYOR';
                anaBot.sendMessage(chatId, "bu hesapta iki adımlı doğrulama var. lütfen şifreyi gönderin:");
            } else if (err.message.includes('PHONE_NUMBER_UNOCCUPIED')) {
                yoneticiDurum[chatId].adim = 'ISIM_BEKLIYOR';
                anaBot.sendMessage(chatId, "bu numara telegram'a kayıtlı değil. sıfırdan hesap açmak için lütfen bir isim gönderin:");
            } else {
                anaBot.sendMessage(chatId, "giriş başarısız oldu: " + err.message);
                await durum.client.disconnect();
                delete yoneticiDurum[chatId];
            }
        }
    }
    else if (durum.adim === 'ISIM_BEKLIYOR') {
        const isim = msg.text;
        try {
            await durum.client.invoke(new Api.auth.SignUp({
                phoneNumber: durum.telefon,
                phoneCodeHash: durum.phoneCodeHash,
                firstName: isim,
                lastName: '' // soyisim zorunlu değil, boş bırakıyoruz
            }));

            const me = await durum.client.getMe();
            const hesapObj = {
                session: durum.client.session.save(),
                id: me.id ? me.id.toString() : "",
                username: me.username || "",
                firstName: me.firstName || "",
                phone: me.phone || durum.telefon || "",
                apiId: durum.secilenApi.apiId,
                apiHash: durum.secilenApi.apiHash
            };
            await hesabiKaydet(chatId, hesapObj, durum.client);
            await durum.client.disconnect();
            delete yoneticiDurum[chatId];
        } catch (err) {
            anaBot.sendMessage(chatId, "hesap oluşturma başarısız: " + err.message);
            await durum.client.disconnect();
            delete yoneticiDurum[chatId];
        }
    }
    else if (durum.adim === 'SIFRE_BEKLIYOR') {
        const sifre = msg.text;
        try {
            await durum.client.checkPassword(sifre);
            const me = await durum.client.getMe();
            const hesapObj = {
                session: durum.client.session.save(),
                id: me.id ? me.id.toString() : "",
                username: me.username || "",
                firstName: me.firstName || "",
                phone: me.phone || durum.telefon || "",
                apiId: durum.secilenApi.apiId,
                apiHash: durum.secilenApi.apiHash
            };
            await hesabiKaydet(chatId, hesapObj, durum.client);
            await durum.client.disconnect();
            delete yoneticiDurum[chatId];
        } catch (err) {
            anaBot.sendMessage(chatId, "şifre girişi başarısız: " + err.message);
            await durum.client.disconnect();
            delete yoneticiDurum[chatId];
        }
    }
    else if (durum.adim === 'GRUP_LISTESI_BEKLIYOR') {
        if (!msg.text) return anaBot.sendMessage(chatId, "lütfen metin gönderin.");
        const gruplar = msg.text.split('\n').map(g => g.trim()).filter(Boolean);
        if (gruplar.length === 0) {
            anaBot.sendMessage(chatId, "geçerli bir grup listesi göndermediniz. lütfen tekrar deneyin.");
        } else {
            yoneticiDurum[chatId] = { adim: 'BASLAT_KAC_HESAP_BEKLIYOR', gruplar: gruplar };
            anaBot.sendMessage(chatId, `Toplam ${gruplar.length} grup alındı.\nKaç hesaba işlem yaptırmak istiyorsunuz? (Tümü için 'hepsi' veya '0' yazabilirsiniz):`);
        }
    }
    else if (durum.adim === 'BASLAT_KAC_HESAP_BEKLIYOR') {
        if (!msg.text) return anaBot.sendMessage(chatId, "Lütfen sayı girin.");
        let hesapSayisi = msg.text.trim().toLowerCase();
        const maxHesap = hesaplariGetir().length;

        if (hesapSayisi === 'hepsi' || hesapSayisi === '0') {
            hesapSayisi = maxHesap;
        } else {
            hesapSayisi = parseInt(hesapSayisi);
            if (isNaN(hesapSayisi) || hesapSayisi <= 0) {
                return anaBot.sendMessage(chatId, "Lütfen geçerli bir pozitif sayı girin.");
            }
            if (hesapSayisi > maxHesap) {
                hesapSayisi = maxHesap;
                anaBot.sendMessage(chatId, `Girdiğiniz sayı toplam hesap sayısından (${maxHesap}) fazla. En fazla ${maxHesap} hesap kullanılacak.`);
            }
        }

        const gruplar = durum.gruplar;
        islemBaslat(chatId, gruplar, hesapSayisi);
        delete yoneticiDurum[chatId];
    }
    else if (durum.adim === 'YONET_ISIM_BEKLIYOR') {
        if (!msg.text) return anaBot.sendMessage(chatId, "lütfen metin gönderin.");
        const tamIsim = msg.text.trim();
        const parcalar = tamIsim.split(' ');
        const ad = parcalar[0];
        const soyad = parcalar.slice(1).join(' ');

        anaBot.sendMessage(chatId, `${durum.indeks + 1}. hesabın ismi değiştiriliyor, lütfen bekleyin...`);
        try {
            const client = await hesapClientOlustur(durum.indeks);
            if (!client) throw new Error("hesap bulunamadı.");
            await client.invoke(new Api.account.UpdateProfile({ firstName: ad, lastName: soyad }));
            await client.disconnect();
            anaBot.sendMessage(chatId, "✅ isim başarıyla değiştirildi.");
        } catch (err) {
            anaBot.sendMessage(chatId, "❌ isim değiştirilirken hata: " + err.message);
        }
        delete yoneticiDurum[chatId];
    }
    else if (durum.adim === 'YONET_USERNAME_BEKLIYOR') {
        if (!msg.text) return anaBot.sendMessage(chatId, "lütfen metin gönderin.");
        const username = msg.text.trim().replace('@', '');

        anaBot.sendMessage(chatId, `${durum.indeks + 1}. hesabın kullanıcı adı değiştiriliyor, lütfen bekleyin...`);
        try {
            const client = await hesapClientOlustur(durum.indeks);
            if (!client) throw new Error("hesap bulunamadı.");
            await client.invoke(new Api.account.UpdateUsername({ username: username }));
            await client.disconnect();
            anaBot.sendMessage(chatId, "✅ kullanıcı adı başarıyla değiştirildi.");
        } catch (err) {
            anaBot.sendMessage(chatId, "❌ kullanıcı adı değiştirilirken hata: " + err.message);
        }
        delete yoneticiDurum[chatId];
    }
    else if (durum.adim === 'YONET_AVATAR_BEKLIYOR') {
        if (!msg.photo || msg.photo.length === 0) {
            return anaBot.sendMessage(chatId, "lütfen sadece fotoğraf gönderin (belge değil, resim).");
        }

        anaBot.sendMessage(chatId, `${durum.indeks + 1}. hesabın profili güncelleniyor, fotoğraf indiriliyor...`);
        try {
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const indirilenYol = await anaBot.downloadFile(fileId, './');

            const { CustomFile } = require('telegram/client/uploads');
            const dosyaBoyutu = fs.statSync(indirilenYol).size;
            const customDosya = new CustomFile(indirilenYol, dosyaBoyutu, indirilenYol);

            const client = await hesapClientOlustur(durum.indeks);
            if (!client) throw new Error("hesap bulunamadı.");

            const yuklenen = await client.uploadFile({
                file: customDosya,
                workers: 1,
            });

            await client.invoke(new Api.photos.UploadProfilePhoto({ file: yuklenen }));
            await client.disconnect();
            fs.unlinkSync(indirilenYol);

            anaBot.sendMessage(chatId, "✅ profil fotoğrafı başarıyla güncellendi.");
        } catch (err) {
            anaBot.sendMessage(chatId, "❌ profil fotoğrafı güncellenirken hata: " + err.message);
        }
        delete yoneticiDurum[chatId];
    }
    else if (durum.adim === 'MEDYA_LINK_BEKLIYOR') {
        if (!msg.text) return anaBot.sendMessage(chatId, "Lütfen geçerli bir Telegram mesaj linki gönderin.");
        const link = msg.text.trim();
        const hesapIndeks = durum.hesapIndeks;
        const grupId = durum.grupId;
        const topicId = durum.topicId;

        const match = link.match(/t\.me\/(?:c\/)?([a-zA-Z0-9_]+)\/(\d+)/);
        if (!match) {
            return anaBot.sendMessage(chatId, "Geçersiz Telegram linki. Lütfen t.me/kanal/123 formatında gönderin.");
        }
        let kaynakKanal = match[1];
        const mesajId = parseInt(match[2]);

        if (!isNaN(kaynakKanal)) {
            kaynakKanal = "-100" + kaynakKanal;
        }

        anaBot.sendMessage(chatId, "⏳ Medya indiriliyor ve hedefe yükleniyor...");

        try {
            const client = await hesapClientOlustur(hesapIndeks);
            if (!client) throw new Error("Hesap bağlantısı kurulamadı.");

            const messages = await client.getMessages(kaynakKanal, { ids: [mesajId] });
            if (!messages || messages.length === 0 || !messages[0]) {
                await client.disconnect();
                throw new Error("Mesaj bulunamadı.");
            }
            const message = messages[0];

            let gonderiAyarlari = {};
            if (topicId) {
                gonderiAyarlari.replyTo = topicId;
            }

            if (message.media) {
                const buffer = await client.downloadMedia(message);
                if (!buffer) {
                    await client.disconnect();
                    throw new Error("Medya indirilemedi.");
                }
                gonderiAyarlari.file = buffer;
                gonderiAyarlari.caption = message.message || "";
                await client.sendFile(grupId, gonderiAyarlari);
            } else {
                gonderiAyarlari.message = message.message;
                await client.sendMessage(grupId, gonderiAyarlari);
            }

            await client.disconnect();
            anaBot.sendMessage(chatId, "✅ İşlem başarıyla tamamlandı.");
        } catch (err) {
            let errorMsg = err.message;
            if (errorMsg && errorMsg.includes("You can't write in this chat")) {
                errorMsg = "Bu grupta/kanalda mesaj gönderme yetkiniz yok.";
            }
            anaBot.sendMessage(chatId, "❌ İşlem sırasında hata oluştu: " + errorMsg);
        }
        delete yoneticiDurum[chatId];
    }
});

async function islemBaslat(chatId, gruplar, limitHesapSayisi = null, targetIndices = null) {
    let hesaplar = hesaplariGetir();
    if (hesaplar.length === 0) {
        return anaBot.sendMessage(chatId, "sistemde kayıtlı hesap yok.");
    }

    if (gruplar && Array.isArray(gruplar)) {
        gruplar = gruplar.map(g => parseTargetId(g));
    }

    if (targetIndices && Array.isArray(targetIndices) && targetIndices.length > 0) {
        hesaplar = targetIndices.map(idx => hesaplar[idx]).filter(Boolean);
    } else if (limitHesapSayisi && limitHesapSayisi < hesaplar.length) {
        hesaplar = hesaplar.slice(0, limitHesapSayisi);
    }

    let proxyler = [];
    if (fs.existsSync('./proxyler.txt')) {
        proxyler = fs.readFileSync('./proxyler.txt', 'utf-8').split('\n').filter(Boolean);
    } else {
        anaBot.sendMessage(chatId, "uyarı: proxyler.txt dosyası bulunamadı, hesaplar proxy olmadan çalışacak.");
    }

    const toplamGrupIslemi = hesaplar.length * gruplar.length;
    let basarili = 0;
    let basarisiz = 0;

    let statusMessageId = null;
    try {
        const msg = await anaBot.sendMessage(chatId, "işlem başlatılıyor, durum yükleniyor...");
        statusMessageId = msg.message_id;
    } catch (e) { console.error(e); }

    let lastUpdate = 0;
    let updatePending = false;

    async function updateStatus() {
        if (!statusMessageId) return;
        const now = Date.now();
        if (now - lastUpdate > 3000) {
            lastUpdate = now;
            const tamamlanan = basarili + basarisiz;
            let yuzde = Math.floor((tamamlanan / toplamGrupIslemi) * 100);
            if (yuzde > 100) yuzde = 100;
            const bar = "█".repeat(Math.floor(yuzde / 10)) + "░".repeat(10 - Math.floor(yuzde / 10));
            const metin = `📊 *İşlem Durumu*\n\n` +
                `Hesaplar: ${hesaplar.length}\n` +
                `Gruplar: ${gruplar.length}\n` +
                `Toplam Hedef: ${toplamGrupIslemi}\n\n` +
                `✅ Başarılı: ${basarili}\n` +
                `❌ Başarısız: ${basarisiz}\n` +
                `⏳ İlerleme: [${bar}] %${yuzde}`;

            try {
                await anaBot.editMessageText(metin, { chat_id: chatId, message_id: statusMessageId, parse_mode: 'Markdown' });
            } catch (err) {
                // aynı mesaj uyarısı veya başka bir hata, yoksayılabilir
            }
        } else if (!updatePending) {
            updatePending = true;
            setTimeout(() => {
                updatePending = false;
                updateStatus();
            }, 3000 - (now - lastUpdate));
        }
    }

    updateStatus();

    let islenenHesapIndeksi = 0;
    const maxThread = 5;

    async function worker(threadId) {
        while (islenenHesapIndeksi < hesaplar.length) {
            const suankiIndeks = islenenHesapIndeksi++;
            // Hesaplar arası işleme girmeden önce yığılmayı önlemek için bekle (Telegram spam koruması)
            if (suankiIndeks > 0) await sleep(10000 + Math.random() * 15000);

            const hesapObj = hesaplar[suankiIndeks];
            const sessionString = typeof hesapObj === 'string' ? hesapObj : hesapObj.session;

            const varsayilan = varsayilanApiGetir();
            const gecerliApiId = (typeof hesapObj === 'object' && hesapObj.apiId) ? hesapObj.apiId : varsayilan.apiId;
            const gecerliApiHash = (typeof hesapObj === 'object' && hesapObj.apiHash) ? hesapObj.apiHash : varsayilan.apiHash;

            let proxyAyari = undefined;
            if (proxyler.length > 0) {
                let proxySatir = proxyler[suankiIndeks % proxyler.length].trim();

                const randomSessionId = Math.floor(10000 + Math.random() * 90000);
                proxySatir = proxySatir.replace(/-session-[^:]+/, `-session-${randomSessionId}`);

                const proxyParcalari = proxySatir.split(':');

                proxyAyari = {
                    ip: proxyParcalari[0],
                    port: parseInt(proxyParcalari[1]),
                    socksType: 5
                };

                if (proxyParcalari.length === 4) {
                    proxyAyari.username = proxyParcalari[2];
                    proxyAyari.password = proxyParcalari[3];
                }
            }

            const client = new TelegramClient(new StringSession(sessionString), gecerliApiId, gecerliApiHash, {
                connectionRetries: 3,
                proxy: proxyAyari
            });

            try {
                await client.connect();
                console.log(`[thread-${threadId}] ${suankiIndeks + 1}. hesap aktif edildi. gruplara katılım sağlanıyor...`);

                for (const grup of gruplar) {
                    try {
                        let hedef = grup.trim();
                        if (hedef.includes('joinchat/') || hedef.includes('+')) {
                            const hash = hedef.split('joinchat/')[1] || hedef.split('+')[1];
                            await client.invoke(new Api.messages.ImportChatInvite({ hash: hash.replace('/', '') }));
                        } else {
                            if (hedef.includes('t.me/')) hedef = hedef.split('t.me/')[1];
                            if (hedef.startsWith('@')) hedef = hedef.substring(1);
                            await client.invoke(new Api.channels.JoinChannel({ channel: hedef }));

                            // Sohbet (tartışma) grubuna otomatik katılma
                            try {
                                const fullChatResult = await client.invoke(new Api.channels.GetFullChannel({ channel: hedef }));
                                if (fullChatResult && fullChatResult.fullChat && fullChatResult.fullChat.linkedChatId) {
                                    const linkedId = fullChatResult.fullChat.linkedChatId;
                                    await sleep(3000); // spam engellemek için kısa bekleme
                                    await client.invoke(new Api.channels.JoinChannel({ channel: linkedId }));
                                    console.log(`[thread-${threadId}] ${suankiIndeks + 1}. hesap bağlı tartışma grubuna katıldı (${linkedId}).`);
                                }
                            } catch (linkedErr) {
                                console.log(`[thread-${threadId}] ${suankiIndeks + 1}. hesap bağlı tartışma grubuna katılma hatası: ${linkedErr.message}`);
                            }
                        }
                        basarili++;
                        updateStatus();
                        await sleep(15000 + Math.random() * 15000); // 15-30 saniye gecikme (Telegram spam koruması)
                    } catch (joinErr) {
                        console.log(`[thread-${threadId}] ${suankiIndeks + 1}. hesap - grup katılım hatası (${grup}): ${joinErr.message}`);
                        basarisiz++;
                        updateStatus();
                    }
                }
                await client.disconnect();
                console.log(`[thread-${threadId}] ${suankiIndeks + 1}. hesabın işlemleri başarıyla bitti.`);
            } catch (err) {
                console.log(`[thread-${threadId}] ${suankiIndeks + 1}. hesap bağlantı hatası: proxy çalışmıyor veya hesap banlanmış. sıradaki hesaba geçiliyor.`);
                basarisiz += gruplar.length;
                updateStatus();
            }
        }
    }

    const threads = [];
    for (let i = 0; i < maxThread; i++) {
        threads.push(worker(i + 1));
    }

    await Promise.all(threads);
    updateStatus(); // son güncellemeyi zorla
    anaBot.sendMessage(chatId, "tüm hesapların işlemleri ve threadler başarıyla tamamlandı.");
}

anaBot.onText(/\/baslat/, async (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== yoneticiId) return;

    const hesaplar = hesaplariGetir();
    if (hesaplar.length === 0) {
        return anaBot.sendMessage(chatId, "sistemde kayıtlı hesap yok. lütfen /hesapekle komutu ile hesap ekleyin.");
    }

    const secenekler = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'gruplar.txt\'den Al', callback_data: 'baslat_dosya' }],
                [{ text: 'Kendim Gireceğim', callback_data: 'baslat_manuel' }]
            ]
        }
    };
    anaBot.sendMessage(chatId, "hedef grupları nereden alalım?", secenekler);
});

console.log("ana yönetici bot aktif edildi...");

// --- WEB PANEL VE SENARYO (CRON) SİSTEMİ ---
const http = require('http');
const { Server } = require('socket.io');
const { NewMessage } = require('teleproto/events');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const { createAvatarCache } = require('./lib/avatar-cache');
const avatarCache = createAvatarCache({
    directory: path.join(__dirname, 'uploads', 'avatar-cache'),
    onError: () => console.warn('Avatar cache refresh failed; will retry later.')
});

// İstemcileri önbelleğe alıp Socket.io ile entegre ediyoruz
const activeClients = {};
const clientRequests = new Map();
let clientGeneration = 0;

async function invalidateCachedClients() {
    clientGeneration++;
    const clients = Object.values(activeClients);
    Object.keys(activeClients).forEach(key => delete activeClients[key]);
    clientRequests.clear();
    await Promise.all(clients.map(async client => {
        try { await client.disconnect(); } catch (_) { /* already disconnected */ }
    }));
}

async function getCachedClient(indeks) {
    if (activeClients[indeks]) return activeClients[indeks];
    if (!clientRequests.has(indeks)) {
        clientRequests.set(indeks, createCachedClient(indeks).finally(() => clientRequests.delete(indeks)));
    }
    return clientRequests.get(indeks);
}

async function createCachedClient(indeks) {
    if (activeClients[indeks]) {
        return activeClients[indeks];
    }
    const generation = clientGeneration;
    const client = await hesapClientOlustur(indeks);
    if (client) {
        if (generation !== clientGeneration) {
            await client.disconnect().catch(() => {});
            return client;
        }
        activeClients[indeks] = client;

        // Yeni mesaj dinleyicisi
        client.addEventHandler(async (event) => {
            try {
                const m = event.message;
                const peerId = m.peerId ? (m.peerId.userId || m.peerId.channelId || m.peerId.chatId).toString() : null;
                const senderId = m.senderId ? m.senderId.toString() : null;
                io.emit('new_message', {
                    indeks: indeks,
                    chatId: peerId,
                    message: {
                        id: m.id,
                        text: m.message,
                        date: m.date,
                        out: m.out,
                        senderId: senderId
                    }
                });
            } catch (err) {
                console.error("NewMessage Event Error:", err);
            }
        }, new NewMessage({}));
    }
    return client;
}

app.use(cors());
app.use(express.json());

// Basit Şifre Koruması (Middleware)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD ortam değişkeni tanımlanmalı.');
}

app.use((req, res, next) => {
    // Statik dosyalara (HTML/CSS) erişime izin veriyoruz, arayüzde şifre soracağız
    if (req.path === '/' || req.path.includes('.html') || req.path.includes('.css') || req.path.includes('.js')) {
        return next();
    }

    // API uç noktaları için şifre kontrolü
    const authHeader = req.headers['authorization'] || req.query.pass;
    if (req.path.startsWith('/api/') && authHeader !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: "Yetkisiz erişim. Geçersiz şifre." });
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Web OTP Session Belleği (Numara ile giriş için)
const webAuthSessions = {};

function senaryolariGetir() {
    if (!fs.existsSync('./senaryolar.json')) {
        fs.writeFileSync('./senaryolar.json', JSON.stringify([]));
    }
    return JSON.parse(fs.readFileSync('./senaryolar.json', 'utf-8'));
}

function senaryolariKaydet(data) {
    fs.writeFileSync('./senaryolar.json', JSON.stringify(data, null, 2));
}

const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const sessionUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const name = String(file.originalname || '').toLowerCase();
        cb(null, name.endsWith('.session') || name.endsWith('.txt'));
    }
});

// REST API'ler
app.post('/api/telegram/:indeks/send_media', upload.single('file'), async (req, res) => {
    try {
        const indeks = parseInt(req.params.indeks);
        const client = await getCachedClient(indeks);
        if(!client) return res.status(404).json({ error: 'Hesap baglanamadi' });

        const { chatId, message } = req.body;
        let peerId = chatId;
        if (typeof chatId === 'string' && /^-?\d+$/.test(chatId)) {
            peerId = BigInt(chatId);
        }

        const CustomFile = require('telegram/client/uploads').CustomFile;
        // GramJS supports sending via file path string directly if it's local
        await client.sendFile(peerId, {
            file: req.file.path,
            caption: message || ''
        });

        // optionally delete file after send
        fs.unlinkSync(req.file.path);

        res.json({ success: true });
    } catch(e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        console.error("send_media error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/hesaplar', (req, res) => {
    const hesaplar = hesaplariGetir().map((h, i) => ({
        indeks: i,
        id: h.id,
        isim: h.firstName || h.username || `Hesap ${i + 1}`,
        grupAd: h.grupAd || ''
    }));
    res.json(hesaplar);
});

app.delete('/api/hesaplar/:indeks', async (req, res) => {
    const indeks = parseInt(req.params.indeks);
    let hesaplar = hesaplariGetir();

    if (indeks >= 0 && indeks < hesaplar.length) {
        const silinecekHesap = hesaplar[indeks];
        const hesapId = silinecekHesap.id;

        // İndeksler silme sonrası kayacağı için eski istemcilerin yeni hesaba
        // bağlanmasını engelle. Yeni istekler hesaplar.json'dan yeniden bağlanır.
        await invalidateCachedClients();

        // Hesaplardan sil
        hesaplar.splice(indeks, 1);
        fs.writeFileSync('./hesaplar.json', JSON.stringify(hesaplar, null, 2));

        // Senaryolardaki indeks kaymasını düzelt ve silinen hesabın senaryolarını temizle
        let senaryolar = senaryolariGetir();
        let updatedSenaryolar = [];
        for (let s of senaryolar) {
            let sIndeks = parseInt(s.hesapIndeks);
            if (sIndeks === indeks) {
                // Bu senaryo silinen hesaba ait, çöpe at
                continue;
            } else if (sIndeks > indeks) {
                // Silinen hesaptan sonraki bir hesapsa, kaymadan dolayı indeksini 1 azalt
                s.hesapIndeks = (sIndeks - 1).toString();
            }
            updatedSenaryolar.push(s);
        }
        senaryolariKaydet(updatedSenaryolar);

        // Dialoglardan (gruplardan) da temizle
        if (fs.existsSync('./dialoglar.json')) {
            try {
                let dialoglarMap = JSON.parse(fs.readFileSync('./dialoglar.json', 'utf-8'));
                if (dialoglarMap[hesapId]) {
                    delete dialoglarMap[hesapId];
                    fs.writeFileSync('./dialoglar.json', JSON.stringify(dialoglarMap, null, 2));
                }
            } catch(e) {
                console.error("Dialoglar temizlenirken hata:", e);
            }
        }

        res.json({ success: true, message: 'Hesap, senaryoları ve bağlı gruplar başarıyla silindi.' });
    } else {
        res.status(404).json({ success: false, error: 'Hesap bulunamadı.' });
    }
});

app.post('/api/hesaplar/grup', (req, res) => {
    const { indices, grupAd } = req.body;
    if (!indices || !Array.isArray(indices)) return res.status(400).json({ success: false, error: 'Hesap indeksleri gerekli.' });

    let hesaplar = hesaplariGetir();
    for (const idx of indices) {
        if (idx >= 0 && idx < hesaplar.length) {
            if (typeof hesaplar[idx] === 'string') {
                hesaplar[idx] = { session: hesaplar[idx], grupAd: grupAd };
            } else {
                hesaplar[idx].grupAd = grupAd;
            }
        }
    }
    fs.writeFileSync('./hesaplar.json', JSON.stringify(hesaplar, null, 2));
    res.json({ success: true, message: 'Hesap grupları başarıyla güncellendi.' });
});

app.post('/api/islem/cikis', async (req, res) => {
    const { hesaplar, hedef } = req.body; // hesaplar: [indeksler], hedef: "all" veya kanal id
    if (!hesaplar || hesaplar.length === 0) return res.status(400).json({ success: false, error: "Hesap listesi boş olamaz." });

    res.json({ success: true, message: "Çıkış işlemi arka planda başlatıldı." });

    let hesapListesi = hesaplariGetir();
    for (let i = 0; i < hesaplar.length; i++) {
        const hIndeks = parseInt(hesaplar[i]);
        if (hIndeks >= 0 && hIndeks < hesapListesi.length) {
            try {
                const client = await hesapClientOlustur(hIndeks);
                if (client) {
                    const dialogs = await client.getDialogs();
                    let leftCount = 0;
                    for (const dialog of dialogs) {
                        if (dialog.isChannel || dialog.isGroup) {
                            if (hedef === 'all' || dialog.id.toString() === hedef || "-100" + dialog.id.toString() === hedef) {
                                try {
                                    await client.invoke(new Api.channels.LeaveChannel({ channel: dialog.id }));
                                    leftCount++;
                                    await sleep(3000 + Math.random() * 3000); // Gruplar arası çıkışta kısa bekleme
                                } catch(e) {
                                    // Bazen gruptan çıkılamayabilir, yoksay
                                }
                            }
                        }
                    }
                    console.log(`[Çıkış] Hesap ${hIndeks} -> ${leftCount} grup/kanaldan çıkıldı.`);
                    await client.disconnect();
                }
            } catch(err) {
                console.log(`[Çıkış Hata] Hesap ${hIndeks}: ${err.message}`);
            }
            // Hesaplar arası çıkışta uzun bekleme (Telegram spam koruması)
            await sleep(10000 + Math.random() * 10000);
        }
    }
    console.log("[Çıkış] Tüm çıkış işlemleri tamamlandı.");
});

app.get('/api/gruplar', (req, res) => {
    let dialoglarMap = {};
    if (fs.existsSync('./dialoglar.json')) {
        try { dialoglarMap = JSON.parse(fs.readFileSync('./dialoglar.json', 'utf-8')); } catch (e) { }
    }
    const gruplarMap = {};
    Object.values(dialoglarMap).forEach(hesapGruplari => {
        hesapGruplari.forEach(g => {
            if (!gruplarMap[g.id]) gruplarMap[g.id] = g.title;
        });
    });
    // Daha önce senaryoda kullanılan yeni link/@kullanıcı adı da hızlı seçimde
    // görünsün; Telegram dialog taraması yapılmamış olsa bile kaybolmasın.
    senaryolariGetir().forEach(s => {
        [s.grupId, s.kanalId].filter(Boolean).forEach(id => {
            const key = String(id);
            if (!gruplarMap[key]) gruplarMap[key] = key;
        });
    });
    const benzersizGruplar = Object.keys(gruplarMap).map(id => ({ id, title: gruplarMap[id] }));
    res.json(benzersizGruplar);
});

app.get('/api/senaryo', (req, res) => {
    let dialoglarMap = {};
    if (fs.existsSync('./dialoglar.json')) {
        try { dialoglarMap = JSON.parse(fs.readFileSync('./dialoglar.json', 'utf-8')); } catch (e) { }
    }
    const gruplarMap = {};
    Object.values(dialoglarMap).forEach(hesapGruplari => {
        hesapGruplari.forEach(g => {
            if (!gruplarMap[g.id]) gruplarMap[g.id] = g.title;
        });
    });

    const senaryolar = senaryolariGetir().map(s => {
        const hedefId = String(s.grupId || s.kanalId || '');
        if (hedefId && gruplarMap[hedefId]) {
            return { ...s, hedefAd: gruplarMap[hedefId] };
        }
        return s;
    });
    res.json(senaryolar);
});

app.post('/api/senaryo', (req, res) => {
    const { saat, hesapIndeks, hesapGrup, grupId, mesaj, yorumMesajId, kanalId } = req.body;
    const senaryolar = senaryolariGetir();
    const yeni = {
        id: Date.now().toString(),
        saat, // "HH:mm" formatında
        hesapIndeks, // İsteğe bağlı
        hesapGrup, // Gruplu seçildiyse grup adı gelir
        aktif: true, // Varsayılan olarak aktif
        grupId: parseTargetId(grupId), // Yorum yapılacaksa tartışma grubu ID'si veya normal grup
        mesaj,
        yorumMesajId, // İsteğe bağlı (kanal mesajına yorum yapmak için)
        kanalId: parseTargetId(kanalId) // İsteğe bağlı (hangi kanaldaki mesaja)
    };
    senaryolar.push(yeni);
    senaryolariKaydet(senaryolar);
    res.json({ success: true, item: yeni });
});

app.put('/api/senaryo/:id', (req, res) => {
    const { saat, hesapIndeks, hesapGrup, grupId, mesaj, yorumMesajId, kanalId } = req.body;
    let senaryolar = senaryolariGetir();
    const index = senaryolar.findIndex(s => s.id === req.params.id);

    if (index !== -1) {
        if(saat) senaryolar[index].saat = saat;
        if(hesapIndeks !== undefined) senaryolar[index].hesapIndeks = hesapIndeks;
        if(hesapGrup !== undefined) senaryolar[index].hesapGrup = hesapGrup;
        if(mesaj) senaryolar[index].mesaj = mesaj;
        if(grupId !== undefined) senaryolar[index].grupId = parseTargetId(grupId);
        if(yorumMesajId !== undefined) senaryolar[index].yorumMesajId = yorumMesajId;
        if(kanalId !== undefined) senaryolar[index].kanalId = parseTargetId(kanalId);

        senaryolariKaydet(senaryolar);
        res.json({ success: true, item: senaryolar[index] });
    } else {
        res.status(404).json({ success: false, error: 'Senaryo bulunamadı.' });
    }
});

app.put('/api/senaryo/toggle/:id', (req, res) => {
    let senaryolar = senaryolariGetir();
    const index = senaryolar.findIndex(s => s.id === req.params.id);
    if (index !== -1) {
        senaryolar[index].aktif = !senaryolar[index].aktif;
        senaryolariKaydet(senaryolar);
        res.json({ success: true, aktif: senaryolar[index].aktif });
    } else {
        res.status(404).json({ success: false, error: 'Senaryo bulunamadı.' });
    }
});

app.delete('/api/senaryo/:id', (req, res) => {
    let senaryolar = senaryolariGetir();
    senaryolar = senaryolar.filter(s => s.id !== req.params.id);
    senaryolariKaydet(senaryolar);
    res.json({ success: true });
});

// Senaryo koleksiyonları: aynı senaryo setini daha sonra tekrar açıp kapatmayı
// veya başka bir hesap grubuna kopyalamayı kolaylaştırır.
app.get('/api/senaryo-gruplari', (req, res) => {
    const senaryolar = senaryolariGetir();
    const gruplar = senaryoGruplariGetir().map(g => ({
        ...g,
        senaryoSayisi: (g.senaryoIds || []).filter(id => senaryolar.some(s => s.id === id)).length
    }));
    res.json(gruplar);
});

app.post('/api/senaryo-gruplari', (req, res) => {
    const ad = String(req.body.ad || '').trim();
    const senaryoIds = Array.isArray(req.body.senaryoIds) ? req.body.senaryoIds.map(String) : [];
    if (!ad) return res.status(400).json({ success: false, error: 'Koleksiyon adı gerekli.' });
    const gruplar = senaryoGruplariGetir();
    const yeni = { id: Date.now().toString(), ad, senaryoIds, aktif: true };
    gruplar.push(yeni);
    senaryoGruplariKaydet(gruplar);
    res.json({ success: true, item: yeni });
});

app.put('/api/senaryo-gruplari/:id/toggle', (req, res) => {
    const gruplar = senaryoGruplariGetir();
    const grup = gruplar.find(g => g.id === req.params.id);
    if (!grup) return res.status(404).json({ success: false, error: 'Koleksiyon bulunamadı.' });
    const senaryoIds = new Set(grup.senaryoIds || []);
    const senaryolar = senaryolariGetir();
    const yeniAktif = !grup.aktif;
    senaryolar.forEach(s => { if (senaryoIds.has(String(s.id))) s.aktif = yeniAktif; });
    grup.aktif = yeniAktif;
    senaryoGruplariKaydet(gruplar);
    senaryolariKaydet(senaryolar);
    res.json({ success: true, aktif: yeniAktif });
});

app.post('/api/senaryo-gruplari/:id/uygula', (req, res) => {
    const hesapGrup = String(req.body.hesapGrup || '').trim();
    const grup = senaryoGruplariGetir().find(g => g.id === req.params.id);
    if (!grup || !hesapGrup) return res.status(400).json({ success: false, error: 'Koleksiyon veya hesap grubu eksik.' });
    const kaynaklar = new Set(grup.senaryoIds || []);
    const senaryolar = senaryolariGetir();
    const kopyalar = senaryolar.filter(s => kaynaklar.has(String(s.id))).map(s => ({
        ...s,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        hesapIndeks: '',
        hesapGrup,
        aktif: true
    }));
    senaryolar.push(...kopyalar);
    senaryolariKaydet(senaryolar);
    res.json({ success: true, count: kopyalar.length });
});

// Bir koleksiyondaki senaryoları yeni hedefe kopyalar; kaynak senaryoların
// hesap atamalarını (tek hesap veya hesap grubu) ve mesaj ayarlarını korur.
app.post('/api/senaryo-gruplari/:id/kopyala', (req, res) => {
    const hedefId = String(req.body.hedefId || '').trim();
    const grup = senaryoGruplariGetir().find(g => g.id === req.params.id);
    if (!grup || !hedefId) return res.status(400).json({ success: false, error: 'Koleksiyon veya hedef grup eksik.' });

    const kaynaklar = new Set((grup.senaryoIds || []).map(String));
    const senaryolar = senaryolariGetir();
    const kopyalar = senaryolar.filter(s => kaynaklar.has(String(s.id))).map(s => ({
        ...s,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        grupId: parseTargetId(hedefId),
        kanalId: undefined,
        aktif: true
    }));
    kopyalar.forEach(s => { delete s.kanalId; });
    senaryolar.push(...kopyalar);
    senaryolariKaydet(senaryolar);
    res.json({ success: true, count: kopyalar.length });
});

app.delete('/api/senaryo-gruplari/:id', (req, res) => {
    senaryoGruplariKaydet(senaryoGruplariGetir().filter(g => g.id !== req.params.id));
    res.json({ success: true });
});

app.post('/api/hesaplar/tara', async (req, res) => {
    const { indices } = req.body || {};

    // hesaplariTaraIslemi'ni arka planda çalıştır
    hesaplariTaraIslemi(yoneticiId, indices);

    const mesaj = (indices && indices.length > 0)
        ? `Seçili ${indices.length} hesap için tarama işlemi arka planda başlatıldı.`
        : `Tüm hesaplar için tarama işlemi arka planda başlatıldı.`;

    res.json({ success: true, message: mesaj + " Bot konsolunu veya Telegram'ı kontrol edin." });
});

app.post('/api/islem/baslat', (req, res) => {
    const { gruplar, indices } = req.body;
    if (!gruplar || gruplar.length === 0) {
        return res.status(400).json({ success: false, error: "Grup listesi boş olamaz." });
    }

    // Geçici olarak islemBaslat fonksiyonunu güncelleyemiyorsak indeks dizisini ona uyumlu hale getirmeliyiz,
    // Ancak islemBaslat eski mantıkta "ilk N hesap" olarak çalışıyor olabilir.
    // Şimdilik backend'deki islemBaslat yerine doğrudan ilgili indekslerde işlemi başlatacağız.
    // Eğer islemBaslat sadece limit alıyorsa onu da değiştirmek gerek.
    islemBaslat(yoneticiId, gruplar, null, indices);
    res.json({ success: true, message: "Katılım işlemleri arka planda başlatıldı." });
});

app.post('/api/hesaplar/tsession', async (req, res) => {
    const { session } = req.body;
    if (!session) return res.status(400).json({ success: false, error: "Session string gerekli." });

    try {
        const secilenApi = rastgeleApiGetir();
        const client = new TelegramClient(new StringSession(session), secilenApi.apiId, secilenApi.apiHash, { connectionRetries: 3 });
        await client.connect();
        const me = await client.getMe();
        const hesapObj = {
            session: session,
            id: me.id ? me.id.toString() : "",
            username: me.username || "",
            firstName: me.firstName || "",
            phone: me.phone || "",
            apiId: secilenApi.apiId,
            apiHash: secilenApi.apiHash
        };
        await hesabiKaydet(yoneticiId, hesapObj, client);
        await client.disconnect();
        res.json({ success: true, message: "Hesap başarıyla eklendi." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/hesaplar/tsession-dosya', sessionUpload.single('sessionFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'Geçerli bir .session veya .txt dosyası seçin.' });

    // StringSession dosyası düz metindir. SQLite tabanlı Telethon session
    // dosyalarını burada sessizce metin olarak okumak güvenli değildir.
    if (req.file.buffer.subarray(0, 15).toString('utf8') === 'SQLite format 3') {
        return res.status(400).json({
            success: false,
            error: 'Bu SQLite/Telethon session dosyası. Panel StringSession metin formatını destekler; bu dosya doğrudan yüklenemez.'
        });
    }

    const session = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
    if (!session || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(session)) {
        return res.status(400).json({ success: false, error: 'Dosya geçerli bir metin StringSession içermiyor.' });
    }

    try {
        const secilenApi = rastgeleApiGetir();
        const client = new TelegramClient(new StringSession(session), secilenApi.apiId, secilenApi.apiHash, { connectionRetries: 3 });
        await client.connect();
        const me = await client.getMe();
        const hesapObj = {
            session,
            id: me.id ? me.id.toString() : '',
            username: me.username || '',
            firstName: me.firstName || '',
            phone: me.phone || '',
            apiId: secilenApi.apiId,
            apiHash: secilenApi.apiHash
        };
        await hesabiKaydet(yoneticiId, hesapObj, client);
        await client.disconnect();
        res.json({ success: true, message: 'Session dosyasıyla hesap başarıyla eklendi.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Session dosyası doğrulanamadı: ' + err.message });
    }
});

app.post('/api/hesaplar/numara/kod-iste', async (req, res) => {
    const { telefon } = req.body;
    const sessionId = Date.now().toString();

    const secilenApi = rastgeleApiGetir();
    const client = new TelegramClient(new StringSession(''), secilenApi.apiId, secilenApi.apiHash, {
        connectionRetries: 5,
        deviceModel: "Desktop",
        systemVersion: "Windows 10",
        appVersion: "4.8.1",
        langCode: "en",
        systemLangCode: "en"
    });

    try {
        await client.connect();
        const sonuc = await client.sendCode({ apiId: secilenApi.apiId, apiHash: secilenApi.apiHash }, telefon);

        webAuthSessions[sessionId] = {
            telefon,
            phoneCodeHash: sonuc.phoneCodeHash,
            client,
            secilenApi
        };

        res.json({ success: true, sessionId, message: "Kod gönderildi." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/hesaplar/numara/onayla', async (req, res) => {
    const { sessionId, kod, sifre, isim } = req.body;
    const oturum = webAuthSessions[sessionId];

    if (!oturum) return res.status(400).json({ success: false, error: "Geçersiz veya süresi dolmuş oturum." });

    try {
        if (sifre) {
            await oturum.client.signInWithPassword(
                { apiId: oturum.secilenApi.apiId, apiHash: oturum.secilenApi.apiHash },
                { password: () => sifre, onError: (e) => { throw e; } }
            );
        } else if (isim) {
            await oturum.client.invoke(new Api.auth.SignUp({
                phoneNumber: oturum.telefon,
                phoneCodeHash: oturum.phoneCodeHash,
                firstName: isim,
                lastName: ''
            }));
        } else {
            await oturum.client.invoke(new Api.auth.SignIn({
                phoneNumber: oturum.telefon,
                phoneCodeHash: oturum.phoneCodeHash,
                phoneCode: kod
            }));
        }

        const me = await oturum.client.getMe();
        const hesapObj = {
            session: oturum.client.session.save(),
            id: me.id ? me.id.toString() : "",
            username: me.username || "",
            firstName: me.firstName || "",
            phone: me.phone || oturum.telefon || "",
            apiId: oturum.secilenApi.apiId,
            apiHash: oturum.secilenApi.apiHash
        };
        await hesabiKaydet(yoneticiId, hesapObj, oturum.client);
        await oturum.client.disconnect();
        delete webAuthSessions[sessionId];

        res.json({ success: true, message: "Hesap başarıyla eklendi." });

        // Otomatik tarama (30 saniye sonra)
        setTimeout(() => {
            console.log("[Otomatik Tarama] Yeni hesap eklendi, hesaplar taranıyor...");
            hesaplariTaraIslemi(yoneticiId);
        }, 30000);

    } catch (err) {
        if (err.message.includes('SESSION_PASSWORD_NEEDED') || err.message.includes('2FA is enabled') || err.name === 'SessionPasswordNeededError') {
            res.json({ success: false, requirePassword: true, error: "2FA Şifresi gerekli." });
        } else if (err.message.includes('PHONE_NUMBER_UNOCCUPIED')) {
            res.json({ success: false, requireName: true, error: "Yeni hesap açılıyor, isim gerekli." });
        } else {
            res.status(500).json({ success: false, error: err.message });
        }
    }
});

app.post('/api/mesaj-gonder', async (req, res) => {
    const { hesapIndeks, hedefId, mesaj, replyToMsgId, isDiscussion } = req.body;

    try {
        const client = await hesapClientOlustur(parseInt(hesapIndeks));
        if (!client) throw new Error("Hesaba bağlanılamadı.");

        let targetGroupId = hedefId;
        let gonderiAyarlari = { message: mesaj };

        // Eğer bir kanaldaki mesaja yorum yapıyorsak (isDiscussion=true ise hedefId aslında kanal ID'si ve replyToMsgId kanal mesajı ID'si)
        if (isDiscussion && replyToMsgId) {
            // Önce tartışma grubundaki karşılığını (thread) bulalım
            const result = await client.invoke(new Api.messages.GetDiscussionMessage({
                peer: hedefId,
                msgId: parseInt(replyToMsgId)
            }));
            if (result && result.messages && result.messages.length > 0) {
                const discussionMsg = result.messages[0];
                const discussionChatId = "-100" + discussionMsg.peerId.channelId.toString();
                targetGroupId = discussionChatId;
                gonderiAyarlari.replyTo = discussionMsg.id;
            } else {
                await client.disconnect();
                return res.status(400).json({ success: false, error: "Tartışma (yorum) mesajı bulunamadı." });
            }
        } else if (replyToMsgId) {
            gonderiAyarlari.replyTo = parseInt(replyToMsgId);
        }

        await client.sendMessage(targetGroupId, gonderiAyarlari);
        await client.disconnect();
        res.json({ success: true });
    } catch (err) {
        console.log("Mesaj gönderme hatası:", err.message);
        let errorMsg = err.message;
        if (errorMsg && errorMsg.includes("You can't write in this chat")) {
            errorMsg = "Bu grupta/kanalda mesaj gönderme yetkiniz yok.";
        }
        res.status(500).json({ success: false, error: errorMsg });
    }
});

const PORT = process.env.PORT || 3000;


// --- TELEGRAM WEB API ENDPOINTS ---

app.get('/api/telegram/:indeks/avatar/:peerId', async (req, res) => {
    const indeks = Number(req.params.indeks);
    const peerId = req.params.peerId;
    // Private: neither the CDN nor a shared proxy should cache account photos.
    // Account indices can change after deletion. Do not let the browser keep
    // an old account's photo under the same index URL.
    res.set('Cache-Control', 'no-store');
    try {
        const accounts = hesaplariGetir();
        if (!Number.isInteger(indeks) || indeks < 0 || !accounts[indeks]) {
            return res.status(404).set('Cache-Control', 'no-store').send('Not found');
        }
        const account = accounts[indeks];
        const identity = typeof account === 'string' ? account : (account.session || account.id);
        if (!identity) return res.status(404).set('Cache-Control', 'no-store').send('Not found');
        const buffer = await avatarCache.get(identity, peerId, async () => {
            const client = await getCachedClient(indeks);
            if (!client) throw new Error('Account unavailable');
            return client.downloadProfilePhoto(peerId);
        });
        if (buffer && buffer.length > 0) {
            // Express supplies ETag/conditional 304 responses for this buffer.
            return res.type('image/jpeg').send(buffer);
        }
        res.status(404).set('Cache-Control', 'no-store').send('No avatar');
    } catch(e) {
        res.status(404).set('Cache-Control', 'no-store').send('No avatar');
    }
});


app.get('/api/telegram/:indeks/folders', async (req, res) => {
    try {
        const indeks = parseInt(req.params.indeks);
        const client = await getCachedClient(indeks);
        if(!client) return res.status(404).json({ error: 'Hesap baglanamadi' });

        const result = await client.invoke(new Api.messages.GetDialogFilters());
        const filters = result.filters || [];

        const mapped = filters.map(f => {
            return {
                id: f.id,
                title: typeof f.title === 'string' ? f.title : (f.title?.text || f.title),
                includeContacts: f.includeContacts,
                includeNonContacts: f.includeNonContacts,
                includeGroups: f.includeGroups,
                includeBroadcasts: f.includeBroadcasts,
                includeBots: f.includeBots,
                excludeMuted: f.excludeMuted,
                excludeRead: f.excludeRead,
                excludeArchived: f.excludeArchived,
                includePeers: f.includePeers ? f.includePeers.map(p => p.userId || p.chatId || p.channelId ? (p.userId || p.chatId || p.channelId).toString() : null).filter(Boolean) : [],
                excludePeers: f.excludePeers ? f.excludePeers.map(p => p.userId || p.chatId || p.channelId ? (p.userId || p.chatId || p.channelId).toString() : null).filter(Boolean) : [],
            }
        });
        res.json(mapped);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/telegram/:indeks/dialogs', async (req, res) => {
    try {
        const indeks = parseInt(req.params.indeks);
        const client = await getCachedClient(indeks);
        if(!client) return res.status(404).json({ error: 'Hesap baglanamadi' });

        let dialogs = [];
        const fId = req.query.folderId !== undefined && req.query.folderId !== 'null' ? parseInt(req.query.folderId) : undefined;
        try {
            if (fId !== undefined && fId > 1) {
                // Custom folders
                const reqFolders = new Api.messages.GetDialogFilters();
                const filters = await client.invoke(reqFolders);
                const folder = filters.find(f => f.id === fId);

                dialogs = await client.getDialogs({ limit: 100 });
                if (folder) {
                    const includesPeer = (peers, d) => {
                        return peers && peers.some(p => {
                            const pId = p.userId || p.chatId || p.channelId;
                            return pId && d.id && d.id.toString().includes(pId.toString());
                        });
                    };

                    dialogs = dialogs.filter(d => {
                        // Check excludes first
                        if (folder.excludeMuted && d.dialog && d.dialog.notifySettings && d.dialog.notifySettings.muteUntil > Math.floor(Date.now() / 1000)) return false;
                        if (folder.excludeRead && d.unreadCount === 0) return false;
                        if (folder.excludeArchived && (d.archived || d.folderId === 1)) return false;
                        if (includesPeer(folder.excludePeers, d)) return false;

                        // Check includes
                        if (includesPeer(folder.includePeers, d)) return true;
                        if (folder.includeGroups && (d.isGroup || d.isChannel && d.entity && d.entity.megagroup)) return true;
                        if (folder.includeBroadcasts && (d.isChannel && d.entity && !d.entity.megagroup)) return true;
                        if (folder.includeBots && d.entity && d.entity.bot) return true;
                        if (folder.includeContacts && d.entity && d.entity.contact) return true;
                        if (folder.includeNonContacts && d.isUser && d.entity && !d.entity.contact && !d.entity.bot) return true;

                        return false;
                    });
                }
            } else {
                // For fId === 0, fId === 1, or undefined, we fetch a larger batch and filter manually
                dialogs = await client.getDialogs({ limit: 100 });
                if (fId === 1) {
                    dialogs = dialogs.filter(d => d.archived || d.folderId === 1);
                } else {
                    dialogs = dialogs.filter(d => !d.archived && d.folderId !== 1);
                }
            }
        } catch(e) {
            console.error("Dialogs fetch error:", e.message);
            dialogs = await client.getDialogs({ limit: 50 });
        }
        const result = dialogs.map(d => ({
            id: d.id ? d.id.toString() : null,
            title: d.title,
            isUser: d.isUser,
            isGroup: d.isGroup,
            isChannel: d.isChannel,
            unreadCount: d.unreadCount,
            topMessage: d.message ? (d.message.message || (d.message.media ? 'Media' : '')) : '',
            date: d.message ? d.message.date : 0
        }));
        res.json(result);
    } catch(e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/telegram/:indeks/messages', async (req, res) => {
    try {
        const indeks = parseInt(req.params.indeks);
        const chatId = req.query.chatId;
        const client = await getCachedClient(indeks);
        if(!client) return res.status(404).json({ error: 'Hesap baglanamadi' });
        let pinnedMsg = null;
        try {
            const peer = await client.getInputEntity(chatId);
            const pinnedRes = await client.invoke(new Api.messages.GetSearch({
                peer: peer,
                q: '',
                filter: new Api.InputMessagesFilterPinned(),
                limit: 1,
                offsetId: 0,
                addOffset: 0,
                maxId: 0,
                minId: 0,
                hash: 0
            }));
            if (pinnedRes.messages && pinnedRes.messages.length > 0) {
                pinnedMsg = {
                    id: pinnedRes.messages[0].id,
                    text: pinnedRes.messages[0].message || (pinnedRes.messages[0].media ? 'Pinned Media' : 'Pinned Message')
                };
            }
        } catch (e) {
            console.error("Pinned msg fetch error:", e.message);
        }

        const messages = await client.getMessages(chatId, { limit: 50 });
        const msgsResult = messages.map(m => {
            let sName = '';
            let sId = null;
            if (m.sender) {
                sId = m.sender.id ? m.sender.id.toString() : null;
                if (m.sender.firstName) sName = m.sender.firstName + (m.sender.lastName ? ' ' + m.sender.lastName : '');
                else if (m.sender.title) sName = m.sender.title;
            }
            if (!sId) {
                if (m.fromId && m.fromId.userId) sId = m.fromId.userId.toString();
                else if (m.senderId) sId = m.senderId.toString();
            }
            return {
                id: m.id,
                text: m.message,
                date: m.date,
                out: m.out,
                senderId: sId,
                senderName: sName,
                hasMedia: !!m.media,
                hasPhoto: !!(m.media && m.media.photo),
                hasDocument: !!(m.media && m.media.document),
                isVideo: !!(m.media && m.media.document && m.media.document.mimeType && m.media.document.mimeType.startsWith('video/')),
                mediaClassName: m.media ? m.media.className : null
            };
        });
        res.json({ messages: msgsResult, pinned: pinnedMsg });
    } catch(e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/telegram/:indeks/media/:chatId/:msgId', async (req, res) => {
    try {
        const indeks = parseInt(req.params.indeks);
        const chatId = req.params.chatId;
        const msgId = parseInt(req.params.msgId);

        const client = await getCachedClient(indeks);
        if(!client) return res.status(404).json({ error: 'Hesap baglanamadi' });

        // Ensure peer format is valid
        let peerId = chatId;
        if (typeof chatId === 'string' && /^-?\d+$/.test(chatId)) {
            peerId = BigInt(chatId);
        }

        const messages = await client.getMessages(peerId, { ids: [msgId] });
        if (!messages || messages.length === 0 || !messages[0].media) {
            return res.status(404).json({ error: 'Medya bulunamadı' });
        }

        const buffer = await client.downloadMedia(messages[0], {});
        if (!buffer) return res.status(404).json({ error: 'İndirilemedi' });

        if (messages[0].media.photo) {
            res.setHeader('Content-Type', 'image/jpeg');
        } else if (messages[0].media.document) {
            const mimeType = messages[0].media.document.mimeType || 'application/octet-stream';
            res.setHeader('Content-Type', mimeType);
        }

        res.send(buffer);
    } catch (e) {
        console.error("Media error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/telegram/:indeks/send', async (req, res) => {
    try {
        const indeks = parseInt(req.params.indeks);
        const { chatId, message } = req.body;
        const client = await getCachedClient(indeks);
        if(!client) return res.status(404).json({ error: 'Hesap baglanamadi' });

        await client.sendMessage(chatId, { message });
        res.json({ success: true });
    } catch(e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

server.listen(PORT, () => {
    console.log(`Web yönetim paneli http://localhost:${PORT} portunda çalışıyor.`);
});

// CRON JOB - Her dakika çalışıp zamanı gelen senaryo mesajlarını atacak
cron.schedule('* * * * *', async () => {
    const simdi = new Date();
    const saat = String(simdi.getHours()).padStart(2, '0');
    const dakika = String(simdi.getMinutes()).padStart(2, '0');
    const suankiZaman = `${saat}:${dakika}`;

    const senaryolar = senaryolariGetir();
    // Yalnızca aktif olanları ve zamanı gelenleri al
    const calisacaklar = senaryolar.filter(s => s.saat === suankiZaman && s.aktif !== false);
    if (calisacaklar.length === 0) return;

    const hesapListesi = hesaplariGetir();
    let genisletilmisGorevler = [];

    // Gruplu senaryoları tekil görevlere dönüştür
    calisacaklar.forEach(s => {
        if (s.hesapGrup && s.hesapGrup !== '') {
            for (let i = 0; i < hesapListesi.length; i++) {
                if (hesapListesi[i].grupAd === s.hesapGrup) {
                    genisletilmisGorevler.push({ ...s, hesapIndeks: i });
                }
            }
        } else if (s.hesapIndeks !== undefined && s.hesapIndeks !== null && s.hesapIndeks !== '') {
            genisletilmisGorevler.push(s);
        }
    });

    const gorevSayisi = genisletilmisGorevler.length;
    if (gorevSayisi === 0) return;

    // 60 saniyeyi görev sayısına bölerek saniye dilimleri (slotlar) oluşturuyoruz
    const saniyeDilimi = 60 / gorevSayisi;

    genisletilmisGorevler.forEach((gorev, indeks) => {
        // Bu görev için minimum ve maksimum saniye aralığını belirliyoruz
        const minSaniye = indeks * saniyeDilimi;
        const maxSaniye = (indeks + 1) * saniyeDilimi;

        // Slot içinde rastgele bir saniye seçiyoruz
        const randomSaniye = Math.floor(Math.random() * (maxSaniye - minSaniye)) + minSaniye;

        console.log(`[Senaryo Planlandı] Hesap ${gorev.hesapIndeks} -> Hedef ${gorev.grupId || gorev.kanalId} (Gönderim zamanı: ${suankiZaman}:${String(Math.floor(randomSaniye)).padStart(2, '0')})`);

        // Belirlenen saniye gecikmesiyle (milisaniye cinsinden) işlemi başlatıyoruz
        setTimeout(async () => {
            try {
                const client = await hesapClientOlustur(parseInt(gorev.hesapIndeks));
                if (!client) return;

                let targetGroupId = gorev.grupId;
                let gonderiAyarlari = { message: gorev.mesaj };

                // Yorum modu ise
                if (gorev.yorumMesajId && gorev.kanalId) {
                    const result = await client.invoke(new Api.messages.GetDiscussionMessage({
                        peer: gorev.kanalId,
                        msgId: parseInt(gorev.yorumMesajId)
                    }));
                    if (result && result.messages && result.messages.length > 0) {
                        const discussionMsg = result.messages[0];
                        const discussionChatId = "-100" + discussionMsg.peerId.channelId.toString();
                        targetGroupId = discussionChatId;
                        gonderiAyarlari.replyTo = discussionMsg.id;
                    }
                }

                if (targetGroupId) {
                    await client.sendMessage(targetGroupId, gonderiAyarlari);
                    console.log(`[Senaryo Gönderildi] Başarılı: Hesap ${gorev.hesapIndeks} -> Hedef ${targetGroupId}`);
                }
                await client.disconnect();
            } catch (err) {
                let errorMsg = err.message;
                if (errorMsg && errorMsg.includes("You can't write in this chat")) {
                    errorMsg = "Bu grupta/kanalda mesaj gönderme yetkiniz yok.";
                }
                console.log(`[Senaryo Hatası] Hesap ${gorev.hesapIndeks} için hata: ${errorMsg}`);
            }
        }, randomSaniye * 1000);
    });
});
app.get('/api/telegram/:indeks/profile/:peerId', async (req, res) => {
    try {
        const indeks = parseInt(req.params.indeks);
        const client = await getCachedClient(indeks);
        if(!client) return res.status(404).json({ error: 'Hesap baglanamadi' });

        let peerId = req.params.peerId;
        if (typeof peerId === 'string' && /^-?\d+$/.test(peerId)) {
            peerId = BigInt(peerId);
        }
        let entity = await client.getEntity(peerId).catch(() => null);
        if(!entity) {
            // fallback for phone or username if possible
            entity = await client.getEntity(req.params.peerId.replace('@','')).catch(() => null);
        }
        if(!entity) return res.status(404).json({ error: 'Kullanici bulunamadi' });

        let countersData = { photos: 0, videos: 0, files: 0, audio: 0, links: 0, voice: 0 };
        try {
            const countersRes = await client.invoke(new Api.messages.GetSearchCounters({
                peer: entity,
                filters: [
                    new Api.InputMessagesFilterPhotos(),
                    new Api.InputMessagesFilterVideo(),
                    new Api.InputMessagesFilterDocument(),
                    new Api.InputMessagesFilterMusic(),
                    new Api.InputMessagesFilterUrl(),
                    new Api.InputMessagesFilterVoice()
                ]
            }));
            countersData = {
                photos: countersRes.find(c => c.filter.className === 'InputMessagesFilterPhotos')?.count || 0,
                videos: countersRes.find(c => c.filter.className === 'InputMessagesFilterVideo')?.count || 0,
                files: countersRes.find(c => c.filter.className === 'InputMessagesFilterDocument')?.count || 0,
                audio: countersRes.find(c => c.filter.className === 'InputMessagesFilterMusic')?.count || 0,
                links: countersRes.find(c => c.filter.className === 'InputMessagesFilterUrl')?.count || 0,
                voice: countersRes.find(c => c.filter.className === 'InputMessagesFilterVoice')?.count || 0
            };
        } catch (e) {
            console.error("Counters error:", e.message);
        }

        let result = {};
        if (entity.className === 'User') {
            const full = await client.invoke(new Api.users.GetFullUser({ id: entity }));
            result = {
                id: entity.id.toString(),
                username: entity.username,
                phone: entity.phone,
                about: full.fullUser.about,
                commonChatsCount: full.fullUser.commonChatsCount,
                counters: countersData
            };
        } else if (entity.className === 'Channel') {
            const full = await client.invoke(new Api.channels.GetFullChannel({ channel: entity }));
            result = {
                id: entity.id.toString(),
                username: entity.username,
                about: full.fullChat.about,
                counters: countersData
            };
        } else if (entity.className === 'Chat') {
            const full = await client.invoke(new Api.messages.GetFullChat({ chatId: entity.id }));
            result = {
                id: entity.id.toString(),
                username: entity.username,
                about: full.fullChat.about,
                counters: countersData
            };
        }
        res.json(result);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/telegram/:indeks/message_action', async (req, res) => {
    try {
        const indeks = parseInt(req.params.indeks);
        const client = await getCachedClient(indeks);
        if(!client) return res.status(404).json({ error: 'Hesap baglanamadi' });

        const { action, chatId, messageIds, toChatId } = req.body;

        let peerId = chatId;
        if (typeof chatId === 'string' && /^-?\d+$/.test(chatId)) {
            peerId = BigInt(chatId);
        }

        if (action === 'delete') {
            await client.deleteMessages(peerId, messageIds, { revoke: true });
        } else if (action === 'pin') {
            const peer = await client.getInputEntity(peerId);
            await client.invoke(new Api.messages.UpdatePinnedMessage({
                peer: peer,
                id: parseInt(messageIds[0]),
                pin: true,
                pmOneside: true
            }));
        } else if (action === 'forward') {
            await client.invoke(new Api.messages.ForwardMessages({
                fromPeer: chatId,
                id: messageIds,
                toPeer: toChatId
            }));
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/telegram/:indeks/chat_action', async (req, res) => {
    try {
        const indeks = parseInt(req.params.indeks);
        const client = await getCachedClient(indeks);
        if(!client) return res.status(404).json({ error: 'Hesap baglanamadi' });

        const { action, chatId } = req.body;
        let peerId = chatId;
        if (typeof chatId === 'string' && /^-?\d+$/.test(chatId)) {
            peerId = BigInt(chatId);
        }
        const entity = await client.getInputEntity(peerId);

        if (action === 'archive') {
            await client.invoke(new Api.folders.EditPeerFolders({
                folderPeers: [new Api.InputFolderPeer({ peer: entity, folderId: 1 })]
            }));
        } else if (action === 'unarchive') {
            await client.invoke(new Api.folders.EditPeerFolders({
                folderPeers: [new Api.InputFolderPeer({ peer: entity, folderId: 0 })]
            }));
        } else if (action === 'clear') {
            await client.invoke(new Api.messages.DeleteHistory({
                peer: entity,
                maxId: 0,
                revoke: true
            }));
        } else if (action === 'delete_chat') {
            // DeleteHistory also removes the chat if maxId=0 and it's a private/basic chat.
            // For channels, LeaveChannel is needed. We'll try both.
            try {
                await client.invoke(new Api.channels.LeaveChannel({ channel: entity }));
            } catch(e) {}
            await client.invoke(new Api.messages.DeleteHistory({ peer: entity, maxId: 0, revoke: true }));
        }
        res.json({ success: true });
    } catch(e) {
        console.error("Chat action error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/telegram/mass_leave', async (req, res) => {
    const { indices, targetLinks } = req.body;
    if (!indices || !Array.isArray(indices)) return res.status(400).json({ error: 'Geçersiz indeks dizisi.' });

    let leftCount = 0;
    for (const idx of indices) {
        if (!sessions[idx] || !sessions[idx].connected) continue;
        const client = sessions[idx].client;
        try {
            if (!targetLinks || targetLinks.length === 0) {
                const dialogs = await client.getDialogs();
                for (const d of dialogs) {
                    if (d.isChannel || d.isGroup) {
                        try {
                            await client.invoke(new Api.channels.LeaveChannel({ channel: d.entity }));
                            leftCount++;
                        } catch(e) {}
                    }
                }
            } else {
                for (const link of targetLinks) {
                    try {
                        const cleanLink = link.replace('t.me/', '').replace('@', '').trim();
                        const entity = await client.getEntity(cleanLink);
                        await client.invoke(new Api.channels.LeaveChannel({ channel: entity }));
                        leftCount++;
                    } catch(e) {}
                }
            }
        } catch (err) {
            console.error("Mass leave error for idx", idx, ":", err);
        }
    }
    res.json({ success: true, message: `${leftCount} işlem başarılı oldu.` });
});

app.post('/api/telegram/toggle_scenario', (req, res) => {
    const { id, active } = req.body;
    let senaryolar = [];
    if (fs.existsSync('./senaryolar.json')) {
        senaryolar = JSON.parse(fs.readFileSync('./senaryolar.json', 'utf8'));
    }
    const s = senaryolar.find(x => x.id === id);
    if (s) {
        s.active = active;
        fs.writeFileSync('./senaryolar.json', JSON.stringify(senaryolar, null, 2));
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Bulunamadı' });
    }
});
