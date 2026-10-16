(function () {
    const dictionary = {
        'Lütfen yönetici şifrenizle giriş yapın.': 'Please sign in with your administrator password.',
        'Şifreniz': 'Your password', 'Giriş Yap': 'Sign In', 'Arama yap...': 'Search...',
        'Hesap Yönetimi': 'Account Management', 'Profiller ve gruplar': 'Profiles and groups',
        'Toplu Katılım': 'Bulk Join', 'Kanallara toplu giriş': 'Join channels in bulk',
        'Zamanlı Senaryolar': 'Scheduled Scenarios', 'Otomatik işlemler': 'Automated actions',
        'Toplu Çıkış': 'Bulk Leave', 'Tüm kanallardan ayrıl': 'Leave all channels',
        'Hesaplar yükleniyor...': 'Loading accounts...', 'Çıkış Yap': 'Log Out',
        'Yeni Hesap Ekle': 'Add New Account', 'Telefon No': 'Phone Number',
        'String Session (tSession)': 'String Session (tSession)', 'Sisteme Ekle': 'Add to system',
        'veya / or': 'or', 'Session dosyası yükle': 'Upload session file',
        'Metin formatındaki StringSession dosyaları desteklenir. SQLite/Telethon .session dosyaları doğrudan dönüştürülemez.': 'Text StringSession files are supported. SQLite/Telethon .session files cannot be converted directly.',
        'Session metni veya dosyası seçin.': 'Enter a session or select a file.',
        'Session dosyasıyla hesap başarıyla eklendi.': 'Account added successfully from the session file.',
        'Telefon Numarası': 'Phone Number', 'Kod İste': 'Request Code', 'Gelen SMS Kodu': 'SMS Code',
        'Onayla': 'Confirm', '2FA Şifresi': '2FA Password', 'Gönder': 'Send',
        'Hesap İsim (Yeni Kayıt)': 'Account Name (New Registration)', 'Tamamla': 'Complete',
        'Kayıtlı Hesaplar': 'Saved Accounts', 'Seçililere Grup Ata': 'Assign Group to Selected',
        'Grup Ata': 'Assign Group', 'Seçili Olanları Tara': 'Scan Selected', 'Seçilileri Tara': 'Scan Selected',
        'Tüm Hesapları Tara': 'Scan All Accounts', 'Tümünü Tara': 'Scan All',
        'Kanallara/Gruplara Toplu Katılım': 'Bulk Join Channels/Groups', 'Hedef Hesap Türü': 'Target Account Type',
        'Tüm Hesaplar': 'All Accounts', 'Belirli Hesap Grubu (Kategori)': 'Specific Account Group (Category)',
        'Belirli Bir Hesap': 'Specific Account', 'Hedef Seçin': 'Select Target',
        'Hedef Kanallar / Gruplar': 'Target Channels / Groups',
        'Kayıtlı hedef seçin veya yeni link yazın...': 'Select a saved target or type a new link...',
        'Grup/Kanal Seçin veya Link/Nick Girin...': 'Select a group/channel or enter a link/username...',
        'Tüm Gruplar/Kanallar (all)': 'All Groups/Channels (all)',
        'Her satıra bir tane link yazın (örn: t.me/ornek_kanal)': 'Enter one link per line (e.g. t.me/example_channel)',
        'Katılım İşlemini Başlat': 'Start Join Operation', 'Tüm Kanallardan/Gruplardan Çıkış': 'Leave All Channels/Groups',
        'Çıkılacak Kanallar / Gruplar': 'Channels / Groups to Leave',
        'Tüm gruplardan/kanallardan çıkış yapılır.': 'Leave all groups/channels.',
        'Çıkış İşlemini Başlat': 'Start Leave Operation',
        'Onaylıyorum, seçilen hesaplardaki sohbetlerden çıkılacak. Geri dönüşü yoktur!': 'I understand, selected accounts will leave these chats. This cannot be undone!',
        'Yeni Senaryo Ekle': 'Add New Scenario', 'Saat (HH:MM)': 'Time (HH:MM)', 'Hedef Türü': 'Target Type',
        'Belirli Hesap': 'Specific Account', 'Hesap Grubu': 'Account Group', 'Kullanılacak Hesap': 'Account to Use',
        'Kullanılacak Hesap Grubu': 'Account Group to Use', 'Hedef Grup / Kanal Linki veya ID': 'Target Group / Channel Link or ID',
        'Kayıtlı hedeflerden birini seçin veya arama alanına yeni bir link/@kullanıcı adı yazın.': 'Select a saved target or type a new link/@username in the search field.',
        'Yorum Yapılacak Mesaj ID (Opsiyonel)': 'Message ID to Reply To (Optional)',
        'Kanal gönderisinin ID\'si': 'Channel post ID', 'Gönderilecek Mesaj': 'Message to Send',
        'Mesajınızı buraya yazın...': 'Write your message here...', 'Plana Ekle': 'Add to Schedule',
        'Kayıtlı Senaryolar': 'Saved Scenarios', 'Hesaba Göre': 'By Account', 'Hedefe Göre': 'By Target',
        'Saate Göre': 'By Time', 'Senaryo koleksiyonu seçin...': 'Select a scenario collection...',
        'Seçilileri kaydet': 'Save Selected', 'Hesap grubuna uygula': 'Apply to Account Group',
        'Gönderici Hesap': 'Sender Account', 'Hedef Grup veya Kanal': 'Target Group or Channel',
        'Bu bir kanal gönderisine yoruma eklenecek': 'Add this as a comment to a channel post',
        'Yanıtlanacak Mesaj ID': 'Message ID to Reply To', 'Mesaj İçeriği': 'Message Content',
        'İletilecek mesaj...': 'Message to send...', 'Hemen Gönder': 'Send Now'
    };
    const reverse = Object.fromEntries(Object.entries(dictionary).map(([tr, en]) => [en, tr]));
    let language = localStorage.getItem('tg_language') || 'tr';

    function translateValue(value) {
        const clean = value.trim();
        const translated = language === 'en' ? dictionary[clean] : reverse[clean];
        if (!translated) return value;
        return value.replace(clean, translated);
    }

    function applyLanguage() {
        document.documentElement.lang = language;
        document.querySelectorAll('.language-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.language === language));
        document.querySelectorAll('input[placeholder], textarea[placeholder], select[aria-label], [title]').forEach(el => {
            if (el.placeholder) el.placeholder = translateValue(el.placeholder);
            if (el.title) el.title = translateValue(el.title);
            if (el.getAttribute('aria-label')) el.setAttribute('aria-label', translateValue(el.getAttribute('aria-label')));
        });
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(node => {
            if (node.parentElement && ['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) return;
            node.nodeValue = translateValue(node.nodeValue);
        });
    }

    window.t = key => language === 'en' ? (dictionary[key] || key) : key;
    window.getLanguage = () => language;
    window.setLanguage = next => {
        if (!['tr', 'en'].includes(next)) return;
        language = next;
        localStorage.setItem('tg_language', language);
        applyLanguage();
    };

    document.addEventListener('click', event => {
        const button = event.target.closest('.language-btn');
        if (button) window.setLanguage(button.dataset.language);
    });
    document.addEventListener('DOMContentLoaded', applyLanguage);
    window.applyLanguage = applyLanguage;
    // Lists and Select2 options are rendered after the initial page load.
    // Translate those newly inserted labels as well.
    const observer = new MutationObserver(() => {
        if (!observer.pending) {
            observer.pending = true;
            requestAnimationFrame(() => { observer.pending = false; applyLanguage(); });
        }
    });
    document.addEventListener('DOMContentLoaded', () => observer.observe(document.body, { childList: true, subtree: true }));
})();
