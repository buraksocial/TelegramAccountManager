document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = '/api';
    let currentFolderId = 0;
    let globalDialogs = [];

    window.changeFolder = function (folderId, el) {
        document.querySelectorAll('.tg-folder-tab').forEach(t => t.classList.remove('active'));
        if (el) el.classList.add('active');
        currentFolderId = folderId;
        openTelegramWebForAccount(activeTelegramIndeks);
    };

    async function fetchTelegramFolders() {
        try {
            const res = await apiFetch(`${API_BASE}/telegram/${activeTelegramIndeks}/folders`);
            const folders = await res.json();

            const folderTabs = document.getElementById('tg-folder-tabs');
            if (!folderTabs) return;

            let html = `<div class="tg-folder-tab ${currentFolderId === 0 ? 'active' : ''}" onclick="changeFolder(0, this)">All</div>`;
            folders.forEach(f => {
                html += `<div class="tg-folder-tab ${currentFolderId === f.id ? 'active' : ''}" onclick="changeFolder(${f.id}, this)">${escapeHTML(f.title)}</div>`;
            });
            folderTabs.innerHTML = html;
            if (folders.length > 0) {
                folderTabs.style.display = 'flex';
            } else {
                folderTabs.style.display = 'none';
            }
        } catch (err) {
            console.error("Klasörler yüklenemedi", err);
        }
    }


    // --- Socket.io Client ---
    let socket;
    function initSocket() {
        if (!socket && typeof io !== 'undefined') {
            socket = io();
            socket.on('new_message', (data) => {
                if (activeTelegramIndeks == data.indeks && activeTelegramChat == data.chatId) {
                    const messagesList = document.getElementById('tg-messages-list');
                    if (!messagesList) return;
                    const time = data.message.date > 0 ? new Date(data.message.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    const cls = data.message.out ? 'tg-msg-out' : 'tg-msg-in';
                    messagesList.innerHTML += `
                    <div class="tg-message ${cls}">
                        ${escapeHTML(data.message.text)}
                        <span class="tg-msg-time">${time}</span>
                    </div>`;
                    messagesList.scrollTop = messagesList.scrollHeight;
                }
            });
        }
    }

    // --- Arama Kutusunu Dinleme ---
    document.getElementById('sidebar-search')?.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        // Ana menüleri filtrele
        document.querySelectorAll('#sidebar-main-list > .chat-item').forEach(el => {
            const text = el.innerText.toLowerCase();
            el.style.display = text.includes(val) ? 'flex' : 'none';
        });
        // Hesapları filtrele
        document.querySelectorAll('#sidebar-accounts-list > .chat-item').forEach(el => {
            const text = el.innerText.toLowerCase();
            el.style.display = text.includes(val) ? 'flex' : 'none';
        });
    });


    // --- Güvenlik ve Token Yönetimi ---
    let authToken = localStorage.getItem('tg_admin_token');

    // XSS Koruması için HTML Kaçış Fonksiyonu
    function escapeHTML(str) {
        if (!str) return '';
        if (typeof str !== 'string') str = String(str);
        return str.replace(/[&<>'"]/g,
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag));
    }

    const authOverlay = document.getElementById('auth-overlay');
    const mainLayout = document.getElementById('main-layout');

    function checkAuth() {
        if (authToken) {
            authOverlay.style.display = 'none';
            mainLayout.style.display = 'flex';
            loadAccounts();
            loadGroups();
            loadScenarios();
            initSocket();
        } else {
            authOverlay.style.display = 'flex';
            mainLayout.style.display = 'none';
        }
    }

    // Geliştirilmiş fetch api sarmalayıcısı
    async function apiFetch(url, options = {}) {
        if (!options.headers) options.headers = {};
        options.headers['Authorization'] = authToken;

        let res;
        try {
            res = await fetch(url, options);
        } catch (err) {
            alert('Sunucuya ulaşılamıyor. Lütfen bağlantınızı veya sunucuyu kontrol edin.');
            logout();
            throw err;
        }

        if (res.status === 401) {
            alert('Oturum süresi doldu veya geçersiz şifre.');
            logout();
            throw new Error('Unauthorized');
        } else if (!res.ok) {
            alert('Sunucudan beklenmeyen bir hata döndü (Kod: ' + res.status + ').');
            logout();
            throw new Error('Server Error');
        }
        return res;
    }

    document.getElementById('auth-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        authToken = document.getElementById('auth-pass').value;
        localStorage.setItem('tg_admin_token', authToken);
        checkAuth();
    });

    document.getElementById('logout-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    function logout() {
        localStorage.removeItem('tg_admin_token');
        authToken = null;
        const passInput = document.getElementById('auth-pass');
        if (passInput) passInput.value = '';
        checkAuth();
    }

    // --- Menü / Tab Yönlendirmeleri ---
    const navItems = document.querySelectorAll('.nav-item[data-target], .folder-item[data-target]');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            tabPanes.forEach(tab => tab.classList.remove('active'));

            // Aynı hedefe sahip tüm menü öğelerini aktif yap (hem klasör hem sohbet)
            const targetId = item.getAttribute('data-target');
            document.querySelectorAll(`[data-target="${targetId}"]`).forEach(el => el.classList.add('active'));

            document.getElementById(targetId).classList.add('active');

            if (targetId === 'hesap-tab') loadAccounts();
            if (targetId === 'senaryo-tab') { loadAccounts(); loadGroups(); loadScenarios(); }
            if (targetId === 'mesaj-tab') { loadAccounts(); loadGroups(); }
            if (targetId === 'cikis-tab') { loadAccounts(); loadGroups(); }
        });
    });

    // --- Veri Yükleme (Load Data) ---
    async function loadAccounts() {
        try {
            const res = await apiFetch(`${API_BASE}/hesaplar`);
            const accounts = await res.json();
            window.globalAccounts = accounts; // Store globally for dropdowns

            const kategoriListesi = document.getElementById('hesaplar-kategori-listesi');
            if (kategoriListesi) {
                const grouped = accounts.reduce((acc, a) => {
                    const group = a.grupAd && a.grupAd.trim() !== '' ? a.grupAd.trim() : 'Kategorisiz';
                    if (!acc[group]) acc[group] = [];
                    acc[group].push(a);
                    return acc;
                }, {});

                let htmlContent = '';
                for (const [groupName, groupAccounts] of Object.entries(grouped)) {
                    let rows = '';
                    groupAccounts.forEach(a => {
                        const escapedIsim = escapeHTML(a.isim);
                        rows += `
                            <tr>
                                <td><input type="checkbox" class="account-checkbox" value="${a.indeks}"></td>
                                <td>${a.indeks}</td>
                                <td>${escapedIsim}</td>
                                <td>${a.id}</td>
                                <td>
                                    <button class="btn-primary btn-sm" onclick="scanSingleAccount(${a.indeks})" title="Sadece bu hesabı tara">
                                        <i class="uil uil-sync"></i> Tara
                                    </button>
                                    <button class="btn-secondary btn-sm delete-btn" onclick="deleteAccount(${a.indeks}, this)" title="Hesabı Sil" style="background: rgba(255, 71, 87, 0.1); color: #ff4757;">
                                        <i class="uil uil-trash-alt"></i> Sil
                                    </button>
                                </td>
                            </tr>
                        `;
                    });

                    htmlContent += `
                        <details style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:8px; margin-bottom:10px; cursor:pointer;" open>
                            <summary style="padding:15px; font-weight:600; font-size:15px; color:var(--text-main); display:flex; align-items:center; outline:none; user-select:none;">
                                <i class="uil uil-folder" style="margin-right:10px; color:#85cdcb;"></i>
                                ${escapeHTML(groupName)}
                                <span style="margin-left:auto; background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:12px; font-size:12px;">${groupAccounts.length} Hesap</span>
                            </summary>
                            <div style="padding:0 15px 15px 15px;">
                                <table class="premium-table">
                                    <thead>
                                        <tr>
                                            <th><input type="checkbox" onchange="const c = this.checked; this.closest('table').querySelectorAll('.account-checkbox').forEach(cb => cb.checked = c);"></th>
                                            <th>İndeks</th>
                                            <th>Profil İsmi</th>
                                            <th>Telegram ID</th>
                                            <th>İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>${rows}</tbody>
                                </table>
                            </div>
                        </details>
                    `;
                }
                kategoriListesi.innerHTML = htmlContent;
            }
            renderSidebarAccounts(accounts);

            if (typeof populateIslemTargetVal === 'function') populateIslemTargetVal();
            if (typeof populateCikisTargetVal === 'function') populateCikisTargetVal();
            if (typeof populateScenarioTargetVal === 'function') populateScenarioTargetVal();
        } catch (e) { console.error("loadAccounts Error:", e); }
    }

    async function loadGroups() {
        try {
            const res = await apiFetch(`${API_BASE}/gruplar`);
            const groups = await res.json();
            const sGrup = document.getElementById('s-grup');
            const mGrup = document.getElementById('m-grup');
            const cHedef = document.getElementById('cikis-hedef');

            let html = '<option value="" disabled selected>Grup/Kanal Seçin veya Link/Nick Girin...</option>';
            let cHtml = '<option value="all">Tüm Gruplar/Kanallar (all)</option>';

            groups.forEach(g => {
                const opt = `<option value="${g.id}">${escapeHTML(g.title)}</option>`;
                html += opt;
                cHtml += opt;
            });

            if (sGrup) {
                if ($(sGrup).hasClass('select2-hidden-accessible')) $(sGrup).select2('destroy');
                sGrup.innerHTML = html;
                $(sGrup).select2({ width: '100%', theme: 'default', tags: true, placeholder: 'Kayıtlı hedef seçin veya yeni link yazın...' });
                const quick = document.getElementById('s-grup-quick');
                if (quick) {
                    quick.innerHTML = groups.slice(0, 12).map(g => `<button type="button" class="saved-target-chip" data-value="${escapeHTML(g.id)}"><i class="uil uil-bookmark"></i>${escapeHTML(g.title)}</button>`).join('');
                    quick.querySelectorAll('.saved-target-chip').forEach(btn => btn.addEventListener('click', () => {
                        $(sGrup).val(btn.dataset.value).trigger('change');
                    }));
                }
            }
            if (mGrup) { mGrup.innerHTML = html; $(mGrup).select2({ width: '100%', theme: 'default', tags: true }); }
            if (cHedef) { cHedef.innerHTML = cHtml; $(cHedef).select2({ width: '100%', theme: 'default', tags: true }); }
        } catch (e) { }
    }

    window.toggleScenarioGroup = function (el) {
        el.parentElement.classList.toggle('active');
    };

    window.globalScenarios = [];

    async function loadScenarios() {
        try {
            const res = await apiFetch(`${API_BASE}/senaryo`);
            const scenarios = await res.json();
            window.globalScenarios = scenarios;
            const container = document.getElementById('senaryolar-liste');
            if (!container) return;

            if (scenarios.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Henüz planlanmış senaryo yok.</div>';
                return;
            }

            // Gruplama
            const groups = {};
            scenarios.forEach(s => {
                const gId = s.hedefAd || s.grupId || s.kanalId || 'Bilinmeyen Grup';
                if (!groups[gId]) groups[gId] = [];
                groups[gId].push(s);
            });

            let html = '';
            for (const gId in groups) {
                const sList = groups[gId];
                // Saate göre sırala
                sList.sort((a, b) => a.saat.localeCompare(b.saat));

                html += `
                <div class="scenario-group">
                    <div class="scenario-group-header" onclick="toggleScenarioGroup(this)">
                        <div class="scenario-group-title">
                            <i class="uil uil-users-alt"></i> Hedef: ${gId}
                        </div>
                        <span class="scenario-group-count">${sList.length} Görev</span>
                    </div>
                    <div class="scenario-group-content">
                `;

                sList.forEach(s => {
                    const isGroup = s.hesapGrup && s.hesapGrup !== '';
                    const accountLabel = isGroup ? `Grup: ${escapeHTML(s.hesapGrup)}` : `Hesap ${s.hesapIndeks}`;
                    const btnStyle = s.aktif !== false ? 'background: #2ecc71; color: white;' : 'background: #95a5a6; color: white;';
                    const btnIcon = s.aktif !== false ? 'uil-check-circle' : 'uil-times-circle';

                    html += `
                        <div class="scenario-item" style="${s.aktif === false ? 'opacity: 0.6;' : ''}">
                            <div class="scenario-select-cell"><input type="checkbox" class="scenario-checkbox" value="${escapeHTML(s.id)}" aria-label="Senaryoyu koleksiyona ekle"></div>
                            <div>
                                <span class="scenario-time">${s.saat}</span>
                                <span class="scenario-account" style="margin-left: 10px; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${accountLabel}</span>
                            </div>
                            <div class="scenario-message" title="${escapeHTML(s.mesaj)}">${escapeHTML(s.mesaj)}</div>
                            <button class="btn-secondary-sm toggle-btn" onclick="toggleScenarioActive('${s.id}')" style="${btnStyle} border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 5px;" title="Aktif/Pasif"><i class="uil ${btnIcon}"></i></button>
                            <button class="btn-secondary-sm edit-btn" onclick="editScenario('${s.id}')" style="background: rgba(255, 255, 255, 0.1); color: #fff; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 5px;" title="Düzenle"><i class="uil uil-edit"></i></button>
                            <button class="btn-danger-sm delete-btn" onclick="deleteScenario('${s.id}', this)" style="border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; background: #e74c3c; color: white;"><i class="uil uil-trash-alt"></i></button>
                        </div>
                    `;
                });

                html += `</div></div>`;
            }
             container.innerHTML = html;
             loadScenarioCollections();
        } catch (e) { }
    }

    async function loadScenarioCollections() {
        const select = document.getElementById('scenario-collection-select');
        const list = document.getElementById('scenario-collections-list');
        if (!select) return;
        try {
            const res = await apiFetch(`${API_BASE}/senaryo-gruplari`);
            const groups = await res.json();
            window.globalScenarioCollections = groups;
            select.innerHTML = '<option value="">Senaryo koleksiyonu seçin...</option>' + groups.map(g => `<option value="${escapeHTML(g.id)}">${escapeHTML(g.ad)} (${g.senaryoSayisi})</option>`).join('');
            if (list) list.innerHTML = groups.length ? groups.map(g => `<div class="collection-row"><span><i class="uil uil-folder"></i> ${escapeHTML(g.ad)} <small>${g.senaryoSayisi} senaryo</small></span><button type="button" class="btn-secondary-sm" onclick="toggleScenarioCollection('${escapeHTML(g.id)}')">${g.aktif === false ? 'Pasif' : 'Aktif'}</button><button type="button" class="btn-danger-sm" onclick="deleteScenarioCollection('${escapeHTML(g.id)}')"><i class="uil uil-trash-alt"></i></button></div>`).join('') : '<span class="input-hint">Seçili senaryoları bir koleksiyon olarak kaydedebilirsiniz.</span>';
        } catch (e) { console.error('Senaryo koleksiyonları yüklenemedi', e); }
    }

    window.createScenarioCollection = async () => {
        const ids = Array.from(document.querySelectorAll('.scenario-checkbox:checked')).map(cb => cb.value);
        if (!ids.length) return alert('Önce koleksiyona eklenecek senaryoları seçin.');
        const ad = prompt('Senaryo koleksiyonu adı (örn. Sabah mesajları):');
        if (!ad || !ad.trim()) return;
        const res = await apiFetch(`${API_BASE}/senaryo-gruplari`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ad, senaryoIds: ids }) });
        const data = await res.json();
        if (data.success) { alert('Senaryo koleksiyonu kaydedildi.'); loadScenarioCollections(); }
        else alert('Hata: ' + data.error);
    };

    window.applyScenarioCollection = async () => {
        const collectionId = document.getElementById('scenario-collection-select')?.value;
        if (!collectionId) return alert('Önce bir senaryo koleksiyonu seçin.');
        const hesapGrup = prompt('Bu koleksiyon hangi hesap grubuna uygulansın?');
        if (!hesapGrup || !hesapGrup.trim()) return;
        const res = await apiFetch(`${API_BASE}/senaryo-gruplari/${collectionId}/uygula`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hesapGrup }) });
        const data = await res.json();
        if (data.success) { alert(`${data.count} senaryo hesap grubuna kopyalandı.`); loadScenarios(); }
        else alert('Hata: ' + data.error);
    };

    window.toggleScenarioCollection = async (id) => { await apiFetch(`${API_BASE}/senaryo-gruplari/${id}/toggle`, { method: 'PUT' }); loadScenarios(); };
    window.deleteScenarioCollection = async (id) => { if (!confirm('Bu koleksiyon silinsin mi? Senaryolar silinmez.')) return; await apiFetch(`${API_BASE}/senaryo-gruplari/${id}`, { method: 'DELETE' }); loadScenarioCollections(); };

    window.toggleAllAccounts = (source) => {
        const checkboxes = document.querySelectorAll('.account-checkbox');
        checkboxes.forEach(cb => cb.checked = source.checked);
    };

    window.scanAccounts = async () => {
        try {
            const res = await apiFetch(`${API_BASE}/hesaplar/tara`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ indices: [] }) // Boş dizi, tüm hesaplar
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
            }
        } catch (e) { }
    };

    window.scanSelectedAccounts = async () => {
        const checkboxes = document.querySelectorAll('.account-checkbox:checked');
        const indices = Array.from(checkboxes).map(cb => parseInt(cb.value));

        if (indices.length === 0) {
            alert("Lütfen taranacak hesapları seçin.");
            return;
        }

        try {
            const res = await apiFetch(`${API_BASE}/hesaplar/tara`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ indices })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
            }
        } catch (e) { }
    };

    window.assignGroupToSelected = async () => {
        const checkboxes = document.querySelectorAll('.account-checkbox:checked');
        const indices = Array.from(checkboxes).map(cb => parseInt(cb.value));

        if (indices.length === 0) {
            alert("Lütfen grup atanacak hesapları seçin.");
            return;
        }

        const grupAd = prompt("Seçili hesaplar için bir grup adı girin (Örn: '1. Grup'):");
        if (grupAd === null) return;

        try {
            const res = await apiFetch(`${API_BASE}/hesaplar/grup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ indices, grupAd })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                loadAccounts();
            } else {
                alert("Hata: " + data.error);
            }
        } catch (e) { }
    };

    window.toggleScenarioActive = async (id) => {
        try {
            const res = await apiFetch(`${API_BASE}/senaryo/toggle/${id}`, { method: 'PUT' });
            const data = await res.json();
            if (data.success) {
                loadScenarios();
            } else {
                alert("Hata: " + data.error);
            }
        } catch (e) { }
    };

    // Tek Hesap Tarama
    window.scanSingleAccount = async function (indeks) {
        if (!confirm(`Hesap ${indeks} için tarama başlatılacak, onaylıyor musunuz?`)) return;

        try {
            const res = await apiFetch(`${API_BASE}/hesaplar/tara`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ indices: [indeks] })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
            } else {
                alert('Hata: ' + data.error);
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Hesap Silme (Tarayıcı confirm() engelini aşmak için 2 tıklamalı sistem)
    let deleteConfirmTimer = null;
    window.deleteAccount = async function (indeks, btnElement) {
        if (btnElement && !btnElement.classList.contains('confirm-mode')) {
            const oldHtml = btnElement.innerHTML;
            btnElement.innerHTML = '<i class="uil uil-exclamation-triangle"></i> Emin misin?';
            btnElement.classList.add('confirm-mode');
            btnElement.style.background = '#ff4757';
            btnElement.style.color = '#fff';

            if (deleteConfirmTimer) clearTimeout(deleteConfirmTimer);
            deleteConfirmTimer = setTimeout(() => {
                btnElement.classList.remove('confirm-mode');
                btnElement.innerHTML = oldHtml;
                btnElement.style.background = 'rgba(255, 71, 87, 0.1)';
                btnElement.style.color = '#ff4757';
            }, 3000);
            return;
        }

        try {
            const res = await apiFetch(`${API_BASE}/hesaplar/${indeks}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                loadAccounts(); // Tabloyu yenile
                loadGroups();   // Grupları yenile (Silinen hesaba ait gruplar gitsin)
            } else {
                alert('Hata: ' + data.error);
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.switchAddMethod = (method) => {
        const btns = document.querySelectorAll('.switch-btn');
        btns.forEach(b => b.classList.remove('active'));
        document.querySelector(`.switch-btn[onclick="switchAddMethod('${method}')"]`).classList.add('active');

        document.getElementById('add-tsession-form').style.display = method === 'tsession' ? 'block' : 'none';
        document.getElementById('add-number-form').style.display = method === 'numara' ? 'block' : 'none';
    };

    // --- Hesap Ekleme Formları ---

    // tSession Ekleme
    document.getElementById('add-tsession-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sessionInput = document.getElementById('tsession-input');
        const sessionFile = document.getElementById('tsession-file');
        const selectedFile = sessionFile?.files?.[0];
        const btn = e.target.querySelector('button');
        btn.innerText = "Ekleniyor..."; btn.disabled = true;

        try {
            let res;
            if (selectedFile) {
                const formData = new FormData();
                formData.append('sessionFile', selectedFile);
                res = await apiFetch(`${API_BASE}/hesaplar/tsession-dosya`, { method: 'POST', body: formData });
            } else {
                const session = sessionInput.value.trim();
                if (!session) { alert('Session metni veya dosyası seçin.'); return; }
                res = await apiFetch(`${API_BASE}/hesaplar/tsession`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session })
                });
            }
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                e.target.reset();
                loadAccounts();
            } else alert('Hata: ' + data.error);
        } catch (err) { } finally { btn.innerText = "Sisteme Ekle"; btn.disabled = false; }
    });

    // Numara ile hesap ekleme (Aşamalı)
    let currentAuthSessionId = null;

    window.requestPhoneCode = async () => {
        const phone = document.getElementById('phone-input').value;
        if (!phone) return alert('Lütfen telefon numarası girin.');
        try {
            const res = await apiFetch(`${API_BASE}/hesaplar/numara/kod-iste`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telefon: phone })
            });
            const data = await res.json();
            if (data.success) {
                currentAuthSessionId = data.sessionId;
                document.getElementById('step-phone').style.display = 'none';
                document.getElementById('step-code').style.display = 'block';
            } else alert('Hata: ' + data.error);
        } catch (e) { }
    };

    window.submitAuthCode = async () => {
        const kod = document.getElementById('code-input').value;
        if (!kod) return alert('Kodu girin.');
        await submitAuthStep({ sessionId: currentAuthSessionId, kod });
    };

    window.submitAuthPassword = async () => {
        const sifre = document.getElementById('password-input').value;
        if (!sifre) return alert('Şifreyi girin.');
        await submitAuthStep({ sessionId: currentAuthSessionId, sifre });
    };

    window.submitAuthName = async () => {
        const isim = document.getElementById('name-input').value;
        if (!isim) return alert('İsim girin.');
        await submitAuthStep({ sessionId: currentAuthSessionId, isim });
    };

    async function submitAuthStep(body) {
        try {
            const res = await apiFetch(`${API_BASE}/hesaplar/numara/onayla`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                document.getElementById('add-number-form').reset();
                document.getElementById('step-phone').style.display = 'block';
                document.getElementById('step-code').style.display = 'none';
                document.getElementById('step-password').style.display = 'none';
                document.getElementById('step-name').style.display = 'none';
                loadAccounts();
            } else if (data.requirePassword) {
                document.getElementById('step-code').style.display = 'none';
                document.getElementById('step-password').style.display = 'block';
            } else if (data.requireName) {
                document.getElementById('step-code').style.display = 'none';
                document.getElementById('step-name').style.display = 'block';
            } else {
                alert('Hata: ' + data.error);
            }
        } catch (e) { }
    }

    // --- İşlem Başlat (Toplu Katılım) ---
    document.getElementById('islem-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('islem-target-type').value;
        const val = document.getElementById('islem-target-val-select').value;
        const gruplarTxt = document.getElementById('islem-gruplar').value;
        const gruplar = gruplarTxt.split('\n').map(g => g.trim()).filter(Boolean);

        let indices = [];
        if (type === 'all') {
            indices = window.globalAccounts.map(a => a.indeks);
        } else if (type === 'account') {
            indices = [parseInt(val)];
        } else if (type === 'group') {
            indices = window.globalAccounts.filter(a => (a.grupAd && a.grupAd.trim() !== '' ? a.grupAd.trim() : 'Kategorisiz') === val).map(a => a.indeks);
        }

        const btn = e.target.querySelector('button');
        btn.innerText = "Başlatılıyor..."; btn.disabled = true;

        try {
            const res = await apiFetch(`${API_BASE}/islem/baslat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ indices, gruplar })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                e.target.reset();
                document.getElementById('islem-target-val').style.display = 'none';
            } else alert('Hata: ' + data.error);
        } catch (err) { } finally { btn.innerText = "Katılım İşlemini Başlat"; btn.disabled = false; }
    });

    // --- Toplu Çıkış ---
    document.getElementById('cikis-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('cikis-target-type').value;
        const val = document.getElementById('cikis-target-val-select').value;
        const gruplarTxt = document.getElementById('cikis-gruplar').value;
        const targetLinks = gruplarTxt.split('\n').map(g => g.trim()).filter(Boolean);

        let indices = [];
        if (type === 'all') {
            indices = window.globalAccounts.map(a => a.indeks);
        } else if (type === 'account') {
            indices = [parseInt(val)];
        } else if (type === 'group') {
            indices = window.globalAccounts.filter(a => (a.grupAd && a.grupAd.trim() !== '' ? a.grupAd.trim() : 'Kategorisiz') === val).map(a => a.indeks);
        }

        const btn = e.target.querySelector('button');
        btn.innerText = "Başlatılıyor..."; btn.disabled = true;

        try {
            const res = await apiFetch(`${API_BASE}/telegram/mass_leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ indices, targetLinks })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                e.target.reset();
                document.getElementById('cikis-target-val').style.display = 'none';
            } else alert('Hata: ' + data.error);
        } catch (err) { } finally { btn.innerText = "Çıkış İşlemini Başlat"; btn.disabled = false; }
    });

    // --- Senaryo Formu ---
    window.editingScenarioId = null;

    window.editScenario = (id) => {
        const scenario = window.globalScenarios.find(s => s.id === id);
        if (!scenario) return;

        window.editingScenarioId = id;

        document.getElementById('s-saat').value = scenario.saat;

        const typeSelect = document.getElementById('s-target-type');
        if (scenario.hesapGrup && scenario.hesapGrup !== '') {
            typeSelect.value = 'group';
        } else {
            typeSelect.value = 'account';
        }
        populateScenarioTargetVal();

        setTimeout(() => {
            const val = (scenario.hesapGrup && scenario.hesapGrup !== '') ? scenario.hesapGrup : scenario.hesapIndeks;
            document.getElementById('s-hesap').value = val;
        }, 100);

        document.getElementById('s-grup').value = scenario.grupId || scenario.kanalId || '';
        document.getElementById('s-yorum-id').value = scenario.yorumMesajId || '';
        document.getElementById('s-mesaj').value = scenario.mesaj || '';

        const submitBtn = document.querySelector('#senaryo-form button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerText = "Değişiklikleri Kaydet";
            submitBtn.style.background = "#ff9f43";
        }

        document.getElementById('senaryo-form').scrollIntoView({ behavior: 'smooth' });
    };

    document.getElementById('senaryo-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const saat = document.getElementById('s-saat').value;
        const targetType = document.getElementById('s-target-type').value;
        const hesapInput = document.getElementById('s-hesap').value;
        const grupId = document.getElementById('s-grup').value;
        const yorumId = document.getElementById('s-yorum-id').value;
        const mesaj = document.getElementById('s-mesaj').value;

        let hesapIndeks = '';
        let hesapGrup = '';

        if (targetType === 'group') {
            hesapGrup = hesapInput;
        } else {
            hesapIndeks = hesapInput;
        }

        const body = { saat, hesapIndeks, hesapGrup, mesaj };

        if (yorumId) {
            body.kanalId = grupId;
            body.yorumMesajId = yorumId;
        } else {
            body.grupId = grupId;
        }

        try {
            const isEdit = !!window.editingScenarioId;
            const url = isEdit ? `${API_BASE}/senaryo/${window.editingScenarioId}` : `${API_BASE}/senaryo`;
            const method = isEdit ? 'PUT' : 'POST';

            const res = await apiFetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                alert(isEdit ? 'Senaryo başarıyla güncellendi!' : 'Senaryo başarıyla eklendi!');
                e.target.reset();
                window.editingScenarioId = null;
                const submitBtn = document.querySelector('#senaryo-form button[type="submit"]');
                if (submitBtn) {
                    submitBtn.innerText = "Plana Ekle";
                    submitBtn.style.background = "var(--primary)";
                }
                loadScenarios();
            } else {
                const data = await res.json();
                alert('Hata: ' + data.error);
            }
        } catch (err) { }
    });

    window.toggleScenario = async (id, el) => {
        const active = el.checked;
        try {
            await apiFetch(`${API_BASE}/telegram/toggle_scenario`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, active })
            });
            loadScenarios();
        } catch (e) { alert("Durum değiştirilemedi."); el.checked = !active; }
    };

    window.deleteScenario = async (id) => {
        if (!confirm('Bu senaryoyu silmek istediğinizden emin misiniz?')) return;
        try {
            const res = await apiFetch(`${API_BASE}/senaryo/${id}`, { method: 'DELETE' });
            if (res.ok) loadScenarios();
        } catch (err) { }
    };

    window.currentScenarioFilter = 'hesap';

    window.setScenarioFilter = (type) => {
        window.currentScenarioFilter = type;
        document.querySelectorAll('.scenario-filters button').forEach(b => {
            b.style.background = 'transparent';
            b.style.color = 'inherit';
        });
        const activeBtn = document.getElementById('btn-filter-' + type);
        if (activeBtn) {
            activeBtn.style.background = 'var(--primary)';
            activeBtn.style.color = 'white';
        }
        loadScenarios();
    };

    async function loadScenarios() {
        try {
            const res = await apiFetch(`${API_BASE}/senaryo`);
            const scenarios = await res.json();
            window.globalScenarios = scenarios;

            const liste = document.getElementById('senaryolar-liste');
            if (!liste) return;

            const grouped = scenarios.reduce((acc, s) => {
                let cat = '';
                if (window.currentScenarioFilter === 'hesap') {
                    cat = (s.hesapGrup && s.hesapGrup !== '') ? `[Grup] ${s.hesapGrup}` : `[Hesap] ${s.hesapIndeks}`;
                } else if (window.currentScenarioFilter === 'hedef') {
                    cat = `Hedef: ${s.hedefAd || s.grupId || s.kanalId || 'Belirsiz'}`;
                } else if (window.currentScenarioFilter === 'saat') {
                    cat = `Saat: ${s.saat}`;
                } else {
                    cat = 'Diğer';
                }

                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(s);
                return acc;
            }, {});

            let html = '';
            for (const [catName, cats] of Object.entries(grouped)) {
                let sHtml = '';
                cats.forEach(s => {
                    const hedef = s.hedefAd || s.grupId || s.kanalId || '?';
                    const activeState = s.aktif !== false ? 'checked' : '';

                    let hesapIkonVeIsim = '';
                    if (s.hesapGrup && s.hesapGrup !== '') {
                        hesapIkonVeIsim = `<i class="uil uil-users-alt" style="margin-right:5px;"></i>Grup: ${escapeHTML(s.hesapGrup)}`;
                    } else {
                        const account = window.globalAccounts?.find(a => a.indeks == s.hesapIndeks);
                        if (account) {
                            hesapIkonVeIsim = `
                                <img src="/api/telegram/${account.indeks}/avatar/${account.id}?pass=${authToken}"
                                     style="width:20px; height:20px; border-radius:50%; vertical-align:middle; margin-right:5px;"
                                     onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
                                <i class="uil uil-user" style="display:none; vertical-align:middle; margin-right:5px;"></i>
                                <span style="vertical-align:middle;">${escapeHTML(account.isim || ('Hesap ' + account.indeks))}</span>
                            `;
                        } else {
                            hesapIkonVeIsim = `<i class="uil uil-user" style="margin-right:5px;"></i>İndeks: ${s.hesapIndeks}`;
                        }
                    }

                    sHtml += `
                        <div class="message" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); margin-bottom:5px; padding:10px; border-radius:8px;">
                            <div style="display:flex; gap:10px; align-items:flex-start;">
                                <input type="checkbox" class="scenario-checkbox" value="${escapeHTML(s.id)}" aria-label="Senaryoyu koleksiyona ekle" style="margin-top:4px; accent-color:var(--primary);">
                                <div>
                                <div style="font-size:12px; color:var(--text-muted); display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                                    <span><i class="uil uil-clock"></i> ${s.saat}</span>
                                    <span>|</span>
                                    <span style="display:flex; align-items:center;">${hesapIkonVeIsim}</span>
                                    <span>|</span>
                                    <span>Hedef: ${escapeHTML(hedef)}</span>
                                </div>
                                <div style="margin-top:5px; font-weight:500;">${escapeHTML(s.mesaj)}</div>
                                </div>
                            </div>
                            <div style="display:flex; gap:10px; align-items:center;">
                                <label class="switch" title="Aktif/Pasif">
                                    <input type="checkbox" ${activeState} onchange="toggleScenarioActive('${s.id}')">
                                    <span class="slider round"></span>
                                </label>
                                <button class="btn-secondary btn-sm" onclick="editScenario('${s.id}')" title="Düzenle"><i class="uil uil-pen"></i></button>
                                <button class="btn-secondary btn-sm" onclick="deleteScenario('${s.id}')" style="background: rgba(255, 71, 87, 0.1); color: #ff4757;" title="Sil"><i class="uil uil-trash-alt"></i></button>
                            </div>
                        </div>
                    `;
                });

                html += `
                    <details style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:8px; cursor:pointer;" open>
                        <summary style="padding:10px; font-weight:600; font-size:14px; outline:none; user-select:none;">
                            <i class="uil uil-layer-group"></i> ${escapeHTML(catName)}
                        </summary>
                        <div style="padding:10px;">${sHtml}</div>
                    </details>
                `;
            }

            liste.innerHTML = html;
            loadScenarioCollections();
        } catch (e) { }
    }

    // --- Anlık Mesaj Formu ---
    document.getElementById('mesaj-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const hesapIndeks = document.getElementById('m-hesap').value;
        const hedefId = document.getElementById('m-grup').value;
        const isDiscussion = document.getElementById('m-is-discussion').checked;
        const replyToMsgId = document.getElementById('m-reply-id').value;
        const mesaj = document.getElementById('m-mesaj').value;

        const btn = e.target.querySelector('button');
        const oldText = btn.innerText;
        btn.innerText = 'Gönderiliyor...';
        btn.disabled = true;

        const body = { hesapIndeks, hedefId, mesaj, replyToMsgId, isDiscussion };

        try {
            const res = await apiFetch(`${API_BASE}/mesaj-gonder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await res.json();
            if (data.success) {
                alert('Mesaj başarıyla gönderildi!');
                document.getElementById('mesaj-form').reset();
            } else {
                alert('Hata: ' + data.error);
            }
        } catch (err) {
            alert('İşlem başarısız.');
        } finally {
            btn.innerText = oldText;
            btn.disabled = false;
        }
    });

    // Senaryo Silme (2 tıklamalı sistem)
    let scenarioDeleteTimer = null;
    window.deleteScenario = async (id, btnElement) => {
        if (btnElement && !btnElement.classList.contains('confirm-mode')) {
            const oldHtml = btnElement.innerHTML;
            btnElement.innerHTML = '<i class="uil uil-exclamation-triangle"></i>';
            btnElement.classList.add('confirm-mode');

            if (scenarioDeleteTimer) clearTimeout(scenarioDeleteTimer);
            scenarioDeleteTimer = setTimeout(() => {
                btnElement.classList.remove('confirm-mode');
                btnElement.innerHTML = oldHtml;
            }, 3000);
            return;
        }

        try {
            await apiFetch(`${API_BASE}/senaryo/${id}`, { method: 'DELETE' });
            loadScenarios();
        } catch (e) { }
    };

    // --- Toplu Çıkış Formu ---
    document.getElementById('cikis-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedOptions = Array.from(document.getElementById('cikis-hesap').selectedOptions).map(opt => opt.value);
        if (selectedOptions.length === 0) return alert('Lütfen en az bir hesap veya grup seçin.');

        const hedef = document.getElementById('cikis-hedef').value.trim();
        if (!hedef) return alert('Lütfen çıkış yapılacak hedefi belirtin.');

        // Seçilen hesap/grupları çözümle ve indeks listesine çevir
        let seciliHesaplar = new Set();

        try {
            const res = await apiFetch(`${API_BASE}/hesaplar`);
            const accounts = await res.json();

            selectedOptions.forEach(val => {
                if (val.startsWith('grup_')) {
                    const gName = val.replace('grup_', '');
                    accounts.forEach(a => {
                        if (a.grupAd === gName) seciliHesaplar.add(a.indeks);
                    });
                } else {
                    seciliHesaplar.add(parseInt(val));
                }
            });

            const btn = e.target.querySelector('button');
            const oldText = btn.innerText;
            btn.innerText = 'İşlem Başlatılıyor...';
            btn.disabled = true;

            const outRes = await apiFetch(`${API_BASE}/islem/cikis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hesaplar: Array.from(seciliHesaplar), hedef })
            });

            const data = await outRes.json();
            if (data.success) {
                alert('Çıkış işlemi arka planda başlatıldı! Node.js konsolundan takip edebilirsiniz.');
                e.target.reset();
                $('#cikis-hesap').val(null).trigger('change');
            } else {
                alert('Hata: ' + data.error);
            }

            btn.innerText = oldText;
            btn.disabled = false;
        } catch (err) {
            alert('İşlem başarısız.');
        }
    });

    // Initialize Check
    checkAuth();

    // --- TELEGRAM WEB UI LOGIC ---
    let activeTelegramIndeks = null;
    let activeTelegramChat = null;
    let activeChatTitle = '';

    function renderSidebarAccounts(accounts) {
        const container = document.getElementById('sidebar-accounts-list');
        if (!container) return;

        let html = '';
        accounts.forEach(acc => {
            const initial = acc.isim ? acc.isim.charAt(0).toUpperCase() : '?';
            html += `
        <a href="#" class="chat-item tg-account-item" data-indeks="${acc.indeks}">
            <div class="chat-avatar" style="background: #e27d60;">
                <img src="/api/telegram/${acc.indeks}/avatar/me?pass=${authToken}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" style="display:block;">
                <span style="display:none;">${initial}</span>
            </div>
            <div class="chat-info">
                <span class="chat-name">${escapeHTML(acc.isim || 'İsimsiz')}</span>
                <span class="chat-last-msg">${acc.telefon || acc.id || ''}</span>
            </div>
        </a>`;
        });
        container.innerHTML = html;

        document.querySelectorAll('.tg-account-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();

                // Highlight this item
                document.querySelectorAll('.sidebar-nav .chat-item').forEach(d => d.classList.remove('active'));
                el.classList.add('active');

                const indeks = el.dataset.indeks;
                openTelegramWebForAccount(indeks);
            });
        });
    }

    async function openTelegramWebForAccount(indeks) {
        activeTelegramIndeks = indeks;
        fetchTelegramFolders();

        // UI Değişimleri
        document.querySelectorAll('.tab-pane').forEach(t => t.classList.remove('active'));
        document.getElementById('telegram-web-tab').classList.add('active');

        const dialogsList = document.getElementById('tg-dialogs-list');
        dialogsList.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Sohbetler yükleniyor... (Bu biraz sürebilir)</div>';

        document.getElementById('tg-messages-area').style.display = 'none';
        document.getElementById('tg-empty-area').style.display = 'flex';

        try {
            const res = await apiFetch(`${API_BASE}/telegram/${indeks}/dialogs?folderId=${currentFolderId}`);
            const dialogs = await res.json();
            globalDialogs = dialogs;


            let html = '';
            if (currentFolderId === 0) {
                html += `
            <div class="chat-item tg-dialog-item" onclick="changeFolder(1, null)">
                <div class="chat-avatar" style="background:#707579; display:flex; align-items:center; justify-content:center;">
                    <i class="uil uil-archive" style="color:white; font-size:20px;"></i>
                </div>
                <div class="chat-info" style="width:100%; display:flex; align-items:center;">
                    <span class="chat-name" style="font-weight:600;">Archived Chats</span>
                </div>
            </div>`;
            }
            if (currentFolderId === 1) {
                html += `
            <div class="chat-item tg-dialog-item" onclick="changeFolder(0, null)" style="background:rgba(255,255,255,0.02);">
                <div class="chat-avatar" style="background:transparent; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.1);">
                    <i class="uil uil-arrow-left" style="color:white; font-size:20px;"></i>
                </div>
                <div class="chat-info" style="width:100%; display:flex; align-items:center;">
                    <span class="chat-name" style="font-weight:600;">Geri Dön (All Chats)</span>
                </div>
            </div>`;
            }

            dialogs.forEach(d => {
                const initial = d.title ? d.title.charAt(0).toUpperCase() : '?';
                const badge = d.unreadCount > 0 ? `<div style="background:var(--primary); color:white; border-radius:10px; padding:2px 6px; font-size:11px; margin-left:auto;">${d.unreadCount}</div>` : '';
                html += `
            <div class="chat-item tg-dialog-item" data-chatid="${d.id}" data-title="${escapeHTML(d.title)}" data-archived="${d.archived}">
                <div class="chat-avatar" style="background: #85cdcb;">
                    <img src="/api/telegram/${indeks}/avatar/${d.id}?pass=${authToken}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" style="display:block;">
                    <span style="display:none;">${initial}</span>
                </div>
                <div class="chat-info" style="width:100%;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="chat-name">${escapeHTML(d.title)}</span>
                        <span style="font-size:11px; color:var(--text-muted);">${d.date > 0 ? new Date(d.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="chat-last-msg" style="width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(d.topMessage)}</span>
                        ${badge}
                    </div>
                </div>
            </div>`;
            });
            dialogsList.innerHTML = html;

            document.querySelectorAll('.tg-dialog-item').forEach(el => {
                el.addEventListener('click', () => {
                    document.querySelectorAll('.tg-dialog-item').forEach(d => d.classList.remove('active'));
                    el.classList.add('active');
                    openChat(el.dataset.chatid, el.dataset.title);
                });
            });
        } catch (e) {
            dialogsList.innerHTML = `<div style="padding:20px; text-align:center; color:var(--danger);">Hata: ${e.message}</div>`;
        }
    }

    async function openChat(chatId, title) {
        activeTelegramChat = chatId;
        activeChatTitle = title;
        document.getElementById('tg-empty-area').style.display = 'none';
        document.getElementById('tg-messages-area').style.display = 'flex';
        document.getElementById('tg-active-title').innerText = title;
        const initial = title ? title.charAt(0).toUpperCase() : '?';
        document.getElementById('tg-active-avatar').innerHTML = `
        <img src="/api/telegram/${activeTelegramIndeks}/avatar/${chatId}?pass=${authToken}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" style="display:block; width:100%; height:100%; object-fit:cover;">
        <span style="display:none;">${initial}</span>
    `;

        const messagesList = document.getElementById('tg-messages-list');
        messagesList.innerHTML = '<div style="text-align:center; color:var(--text-muted);">Mesajlar yükleniyor...</div>';

        try {
            const res = await apiFetch(`${API_BASE}/telegram/${activeTelegramIndeks}/messages?chatId=${chatId}`);
            const data = await res.json();
            const messages = data.messages || [];

            const pinnedBar = document.getElementById('tg-pinned-bar');
            const pinnedText = document.getElementById('tg-pinned-text');
            if (data.pinned) {
                pinnedText.innerText = data.pinned.text;
                pinnedBar.style.display = 'block';
                pinnedBar.onclick = () => {
                    const msgEl = document.querySelector(`.tg-message[data-msgid="${data.pinned.id}"]`);
                    if (msgEl) msgEl.scrollIntoView({behavior: 'smooth', block: 'center'});
                };
            } else {
                pinnedBar.style.display = 'none';
            }

            let html = '';
            const msgs = messages.reverse();

            for (let i = 0; i < msgs.length; i++) {
                const m = msgs[i];
                if (!m.text && !m.hasMedia) continue;

                const prev = (i > 0) ? msgs[i - 1] : null;
                const next = (i < msgs.length - 1) ? msgs[i + 1] : null;

                // Check if same sender (and same out status just in case)
                const isFirst = !prev || prev.senderId !== m.senderId || prev.out !== m.out;
                const isLast = !next || next.senderId !== m.senderId || next.out !== m.out;

                const time = m.date > 0 ? new Date(m.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                const outCls = m.out ? 'out' : 'in';
                const cls = m.out ? 'tg-msg-out' : 'tg-msg-in';

                let senderHtml = '';
                let avatarHtml = '<div style="width:33px; height:33px; flex-shrink:0;"></div>'; // Placeholder for alignment

                if (!m.out && m.senderId && activeTelegramChat.startsWith('-')) {
                    if (isFirst && m.senderName) {
                        senderHtml = `<div style="font-size:13px; color:#8774e1; font-weight:500; margin-bottom:2px;">${escapeHTML(m.senderName)}</div>`;
                    }
                    if (isLast) {
                        avatarHtml = `<img src="/api/telegram/${activeTelegramIndeks}/avatar/${m.senderId}?pass=${authToken}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\'width:33px;height:33px;\'></div>';" style="width:33px;height:33px;border-radius:50%;object-fit:cover;flex-shrink:0;">`;
                    }
                } else if (m.out || !activeTelegramChat.startsWith('-')) {
                    // No avatars in DMs, or for outgoing messages
                    avatarHtml = '';
                }

                const tailCls = isLast ? 'has-tail' : '';
                const rowCls = `${outCls} ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}`;

                let mediaHtml = '';
                if (m.hasMedia) {
                    const mediaUrl = `/api/telegram/${activeTelegramIndeks}/media/${activeTelegramChat}/${m.id}?pass=${authToken}`;
                    if (m.hasPhoto) {
                        mediaHtml = `<div style="margin-bottom:5px;"><img src="${mediaUrl}" style="max-width:300px; max-height:300px; border-radius:10px; cursor:pointer;" onerror="this.style.display='none';" class="msg-media-img" oncontextmenu="event.preventDefault(); window.downloadMediaDirect('${mediaUrl}', 'image_${m.id}.jpg');" /></div>`;
                    } else if (m.isVideo) {
                        mediaHtml = `<div style="margin-bottom:5px;"><video src="${mediaUrl}" controls style="max-width:300px; max-height:300px; border-radius:10px;" class="msg-media-video" oncontextmenu="event.preventDefault(); window.downloadMediaDirect('${mediaUrl}', 'video_${m.id}.mp4');"></video></div>`;
                    } else if (m.hasDocument) {
                        mediaHtml = `<div style="margin-bottom:5px; padding:10px; background:rgba(0,0,0,0.2); border-radius:10px; display:flex; align-items:center;" oncontextmenu="event.preventDefault(); window.downloadMediaDirect('${mediaUrl}', 'document_${m.id}');">
                            <i class="uil uil-file-alt" style="font-size:24px; margin-right:10px;"></i>
                            <div style="display:flex; flex-direction:column;">
                                <a href="${mediaUrl}" target="_blank" style="color:white; text-decoration:none;">Document / File</a>
                            </div>
                        </div>`;
                    }
                }

                html += `
            <div class="tg-msg-row ${rowCls}">
                ${avatarHtml}
                <div class="tg-message ${cls} ${tailCls}" data-msgid="${m.id}" data-senderid="${m.senderId ? m.senderId.toString() : ''}">
                    ${senderHtml}
                    ${mediaHtml}
                    ${m.text ? `<div class="tg-message-text">${escapeHTML(m.text)}</div>` : ''}
                    <span class="tg-msg-time">${time} ${m.out && m.read ? '<i class="uil uil-check-double"></i>' : (m.out ? '<i class="uil uil-check"></i>' : '')}</span>
                </div>
            </div>`;
            }
            messagesList.innerHTML = html;
            messagesList.scrollTop = messagesList.scrollHeight;
        } catch (e) {
            messagesList.innerHTML = `<div style="text-align:center; color:var(--danger);">Hata: ${e.message}</div>`;
        }
    }

    // Mesaj Gönderme
    document.getElementById('tg-send-btn')?.addEventListener('click', async () => {
        const input = document.getElementById('tg-message-input');
        const msg = input.value.trim();
        if (!msg || !activeTelegramChat || activeTelegramIndeks === null) return;

        input.value = '';
        const messagesList = document.getElementById('tg-messages-list');
        messagesList.innerHTML += `
    <div class="tg-msg-row out first last">
        <div class="tg-message tg-msg-out has-tail">
            <div class="tg-message-text">${escapeHTML(msg)}</div>
            <span class="tg-msg-time">Şimdi <i class="uil uil-clock"></i></span>
        </div>
    </div>`;
        messagesList.scrollTop = messagesList.scrollHeight;

        try {
            await apiFetch(`${API_BASE}/telegram/${activeTelegramIndeks}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: activeTelegramChat, message: msg })
            });
        } catch (e) {
            alert("Mesaj gönderilemedi: " + e.message);
        }
    });

    const fileInput = document.getElementById('tg-file-input');
    document.getElementById('tg-attachment-btn')?.addEventListener('click', () => {
        fileInput?.click();
    });

    const handleFileUpload = async (file) => {
        if (!activeTelegramChat || activeTelegramIndeks === null) return;
        const msgInput = document.getElementById('tg-message-input');
        const msg = msgInput.value.trim();
        msgInput.value = '';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('chatId', activeTelegramChat);
        formData.append('message', msg);

        const messagesList = document.getElementById('tg-messages-list');
        messagesList.innerHTML += `
    <div class="tg-msg-row out first last">
        <div class="tg-message tg-msg-out has-tail">
            <div class="tg-message-text"><i class="uil uil-paperclip"></i> ${escapeHTML(file.name)} <br> ${escapeHTML(msg)}</div>
            <span class="tg-msg-time">Gönderiliyor <i class="uil uil-clock"></i></span>
        </div>
    </div>`;
        messagesList.scrollTop = messagesList.scrollHeight;

        try {
            await fetch(`${API_BASE}/telegram/${activeTelegramIndeks}/send_media`, {
                method: 'POST',
                headers: { 'Authorization': authToken },
                body: formData
            });
            renderMessages(activeTelegramChat, activeChatTitle);
        } catch (e) {
            alert("Dosya gönderilemedi: " + e.message);
        }
    };

    fileInput?.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
            e.target.value = '';
        }
    });

    document.getElementById('tg-message-input')?.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault();
                    handleFileUpload(file);
                    break;
                }
            }
        }
    });

    document.getElementById('tg-message-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('tg-send-btn').click();
    });

    // Geri Dön Butonu
    document.getElementById('tg-back-btn')?.addEventListener('click', () => {
        document.getElementById('telegram-web-tab').classList.remove('active');
        document.getElementById('hesap-tab').classList.add('active'); // Ana sekmeye dön

        // Sol menüde Hesap Yönetimi'ni aktif yap
        document.querySelectorAll('.sidebar-nav .chat-item').forEach(d => d.classList.remove('active'));
        document.querySelector('.sidebar-nav .chat-item[data-target="hesap-tab"]')?.classList.add('active');
    });

    // Arama Kutusu Filtreleme
    document.getElementById('sidebar-search')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.sidebar-nav .chat-item').forEach(el => {
            const text = el.innerText.toLowerCase();
            el.style.display = text.includes(term) ? 'flex' : 'none';
        });
    });



    // Dialog Arama Kutusu Filtreleme
    document.getElementById('tg-dialog-search')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.tg-dialog-item').forEach(el => {
            const title = el.dataset.title?.toLowerCase() || '';
            el.style.display = title.includes(term) ? 'flex' : 'none';
        });
    });

    // Yeni Sohbet Başlat
    document.getElementById('tg-new-chat-btn')?.addEventListener('click', () => {
        const peer = prompt("Sohbet başlatmak istediğiniz kişinin kullanıcı adını (örn: @kullaniciadi) veya numarasını girin:");
        if (!peer || !activeTelegramIndeks) return;

        // Doğrudan o sohbeti açmayı deniyoruz. Sunucu /messages isteği atıp getMessages yapacak.
        // Eğer yeni bir sohbetse boş liste döner, sorun değil.
        openChat(peer, peer);
    });


    // Context Menu Variables
    let activeContextChatId = null;
    let activeContextMsgId = null;
    let activeContextMsgText = '';
    let activeReplyMsgId = null;

    window.populateTargetSelect = function(type, selectId) {
        const select = document.getElementById(selectId);
        if(!select || !window.globalAccounts) return;
        select.innerHTML = '';
        if (type === 'group') {
            let groups = new Set();
            window.globalAccounts.forEach(a => {
                const g = a.grupAd && a.grupAd.trim() !== '' ? a.grupAd.trim() : 'Kategorisiz';
                groups.add(g);
            });
            groups.forEach(g => {
                select.innerHTML += `<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`;
            });
        } else if (type === 'account') {
            window.globalAccounts.forEach(a => {
                select.innerHTML += `<option value="${a.indeks}">${a.indeks} - ${escapeHTML(a.isim)}</option>`;
            });
        }
    };

    window.populateIslemTargetVal = function() {
        const type = document.getElementById('islem-target-type').value;
        populateTargetSelect(type, 'islem-target-val-select');
    };
    window.populateCikisTargetVal = function() {
        const type = document.getElementById('cikis-target-type').value;
        populateTargetSelect(type, 'cikis-target-val-select');
    };
    window.populateScenarioTargetVal = function() {
        const type = document.getElementById('s-target-type').value;
        const label = document.getElementById('s-target-label');
        if (type === 'account') {
            label.innerText = 'Kullanılacak Hesap';
        } else {
            label.innerText = 'Kullanılacak Hesap Grubu';
        }
        populateTargetSelect(type, 's-hesap');
    };


    // Hide context menus on global click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#chat-context-menu')) {
            const m = document.getElementById('chat-context-menu');
            if (m) m.style.display = 'none';
        }
        if (!e.target.closest('#msg-context-menu')) {
            const m = document.getElementById('msg-context-menu');
            if (m) m.style.display = 'none';
        }
        if (!e.target.closest('#profile-context-menu') && !e.target.closest('#profile-menu-btn')) {
            const m = document.getElementById('profile-context-menu');
            if (m) m.style.display = 'none';
        }
    });

    function closeFolderContext() {
        const menu = document.getElementById('tg-folder-context-menu');
        if (menu) menu.style.display = 'none';
    }

    window.downloadMediaDirect = async (url, filename) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Ağ hatası");
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        } catch (e) {
            console.error("İndirme hatası:", e);
            alert("İndirilemedi: " + e.message);
        }
    };

    // Chat Context Menu (Event Delegation)
    document.getElementById('tg-dialogs-list')?.addEventListener('contextmenu', (e) => {
        const dialogItem = e.target.closest('.tg-dialog-item');
        if (dialogItem) {
            e.preventDefault();
            activeContextChatId = dialogItem.dataset.chatid;
            const isArchived = dialogItem.dataset.archived === 'true';

            document.getElementById('msg-context-menu').style.display = 'none'; // hide the other menu
            const menu = document.getElementById('chat-context-menu');

            const archiveBtn = menu.querySelector('[data-action="archive"]');
            const unarchiveBtn = menu.querySelector('[data-action="unarchive"]');
            if (archiveBtn) archiveBtn.style.display = isArchived ? 'none' : 'block';
            if (unarchiveBtn) unarchiveBtn.style.display = isArchived ? 'block' : 'none';

            menu.style.display = 'block';
            menu.style.left = e.pageX + 'px';
            menu.style.top = e.pageY + 'px';
        }
    });

    document.getElementById('profile-menu-btn')?.addEventListener('click', (e) => {
        const menu = document.getElementById('profile-context-menu');
        if (menu) {
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        }
    });

    // Message Context Menu (Event Delegation)
    document.getElementById('tg-messages-area')?.addEventListener('contextmenu', (e) => {
        const msgItem = e.target.closest('.tg-message');
        if (msgItem) {
            e.preventDefault();
            activeContextMsgId = msgItem.dataset.msgid;

            document.getElementById('chat-context-menu').style.display = 'none'; // hide the other menu
            const menu = document.getElementById('msg-context-menu');

            const textEl = msgItem.querySelector('.tg-message-text');
            activeContextMsgText = textEl ? textEl.innerText : msgItem.innerText.replace(/\d{1,2}:\d{2}$/, '').trim();

            menu.style.display = 'block';
            menu.style.left = e.pageX + 'px';
            menu.style.top = e.pageY + 'px';
        }
    });

    // Click on message avatar to open profile
    document.getElementById('tg-messages-area')?.addEventListener('click', (e) => {
        const avatar = e.target.closest('.chat-avatar');
        const msgItem = e.target.closest('.tg-message');
        if (avatar && msgItem && msgItem.dataset.senderid) {
            openRightPanel(msgItem.dataset.senderid);
        }
    });

    // Handle Chat Context Menu Actions
    document.getElementById('chat-context-menu')?.addEventListener('click', async (e) => {
        const item = e.target.closest('.menu-item');
        if (!item) return;
        const action = item.dataset.action;

        try {
            await apiFetch(`${API_BASE}/telegram/${activeTelegramIndeks}/chat_action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, chatId: activeContextChatId })
            });

            // Always refresh dialogs on any chat action, preserving current folder
            if (typeof currentFolderId !== 'undefined' && currentFolderId !== null) {
                openTelegramWebForAccount(activeTelegramIndeks);
            } else {
                openTelegramWebForAccount(activeTelegramIndeks);
            }
        } catch (err) {
            alert("Action failed: " + err.message);
        }
    });

    // Handle Message Context Menu Actions
    document.getElementById('msg-context-menu')?.addEventListener('click', async (e) => {
        const item = e.target.closest('.menu-item');
        if (!item) return;
        const action = item.dataset.action;

        if (action === 'copy') {
            let textToCopy = activeContextMsgText || '';
            if (textToCopy) {
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(textToCopy);
                } else {
                    let textArea = document.createElement("textarea");
                    textArea.value = textToCopy;
                    textArea.style.position = "fixed";
                    textArea.style.left = "-999999px";
                    textArea.style.top = "-999999px";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    try {
                        document.execCommand('copy');
                    } catch (err) {
                        prompt("Mesaj kopyalanamadı. Buradan manuel kopyalayabilirsiniz:", textToCopy);
                    }
                    textArea.remove();
                }
                const toast = document.createElement('div');
                toast.innerText = 'Kopyalandı';
                toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--primary); color:white; padding:10px 20px; border-radius:20px; z-index:9999; box-shadow:0 4px 6px rgba(0,0,0,0.3);';
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 2000);
            }
            document.getElementById('msg-context-menu').style.display = 'none';
            return;
        }

        if (action === 'reply') {
            replyToMsgId = activeContextMsgId;
            const text = activeContextMsgText || 'Message';
            document.getElementById('tg-reply-text').innerText = text;
            document.getElementById('tg-reply-bar').style.display = 'flex';
            document.getElementById('tg-message-input').focus();
            document.getElementById('msg-context-menu').style.display = 'none';
            return;
        }

        if (action === 'forward') {
            forwardMsgId = activeContextMsgId;
            document.getElementById('msg-context-menu').style.display = 'none';
            openForwardModal();
            return;
        }

        try {
            await apiFetch(`${API_BASE}/telegram/${activeTelegramIndeks}/message_action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, chatId: activeTelegramChat, messageIds: [parseInt(activeContextMsgId)] })
            });

            if (action === 'delete') {
                document.querySelector(`.tg-message[data-msgid="${activeContextMsgId}"]`)?.remove();
            }
        } catch (err) {
            alert("Action failed: " + err.message);
        }
    });


    // Right Panel Logic
    document.getElementById('close-right-panel')?.addEventListener('click', () => {
        document.getElementById('tg-right-panel').style.display = 'none';
    });

    async function openRightPanel(peerId) {
        const panel = document.getElementById('tg-right-panel');
        const content = document.getElementById('tg-profile-content');
        panel.style.display = 'flex';
        content.innerHTML = '<div style="color:white;text-align:center;margin-top:20px;">Loading...</div>';

        try {
            const res = await apiFetch(`/api/telegram/${activeTelegramIndeks}/profile/${peerId}`);
            const profile = await res.json();

            let initial = activeChatTitle ? activeChatTitle.charAt(0).toUpperCase() : '?';

            content.innerHTML = `
            <div class="profile-avatar">
                <img src="/api/telegram/${activeTelegramIndeks}/avatar/${peerId}?pass=${authToken}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <span style="display:none;">${initial}</span>
            </div>
            <h2 style="color:white; margin:10px 0 5px 0; text-align:center;">${escapeHTML(activeChatTitle)}</h2>
            <div style="color:var(--text-muted); font-size:14px; margin-bottom:20px; text-align:center;">${profile.username ? '@' + profile.username : (profile.phone || profile.id || '')}</div>

            ${profile.about ? `
            <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; text-align:left; color:white; margin-bottom:15px;">
                <div style="font-size:12px; color:var(--text-muted); margin-bottom:5px;">Bio</div>
                ${escapeHTML(profile.about)}
            </div>` : ''}

            <div style="background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden; text-align:left; margin-bottom:15px;">
                <div style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; color:white; cursor:pointer;">
                    <span><i class="uil uil-image" style="margin-right:10px;"></i> Media</span>
                    <span style="color:var(--text-muted);">${(profile.counters?.photos || 0) + (profile.counters?.videos || 0)} ></span>
                </div>
                <div style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; color:white; cursor:pointer;">
                    <span><i class="uil uil-file-alt" style="margin-right:10px;"></i> Files</span>
                    <span style="color:var(--text-muted);">${profile.counters?.files || 0} ></span>
                </div>
                <div style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; color:white; cursor:pointer;">
                    <span><i class="uil uil-link" style="margin-right:10px;"></i> Links</span>
                    <span style="color:var(--text-muted);">${profile.counters?.links || 0} ></span>
                </div>
                <div style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; color:white; cursor:pointer;">
                    <span><i class="uil uil-microphone" style="margin-right:10px;"></i> Voice</span>
                    <span style="color:var(--text-muted);">${profile.counters?.voice || 0} ></span>
                </div>
                <div style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; color:white; cursor:pointer;">
                    <span><i class="uil uil-users-alt" style="margin-right:10px;"></i> Groups in Common</span>
                    <span style="color:var(--text-muted);">${profile.commonChatsCount || 0} ></span>
                </div>
                <div style="padding:15px; display:flex; justify-content:space-between; color:white; cursor:pointer;">
                    <span><i class="uil uil-gift" style="margin-right:10px;"></i> Gifts</span>
                    <span style="color:var(--text-muted);">0 ></span>
                </div>
            </div>

            <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; text-align:center; color:white; margin-bottom:15px; cursor:pointer;">
                <i class="uil uil-qrcode-scan" style="font-size:24px; color:var(--primary); margin-bottom:5px; display:block;"></i>
                <span style="font-size:14px; color:var(--primary);">Telegram QR Code</span>
            </div>
        `;
        } catch (err) {
            content.innerHTML = '<div style="color:red;text-align:center;margin-top:20px;">Error loading profile.</div>';
        }
    }

    // Click on top header to open profile
    document.querySelector('.tg-main-header')?.addEventListener('click', () => {
        if (activeTelegramChat) {
            openRightPanel(activeTelegramChat);
        }
    });
    document.querySelector('.tg-main-header').style.cursor = 'pointer';

    // Forward Modal Logic
    function openForwardModal() {
        document.getElementById('tg-forward-modal').style.display = 'flex';
        renderForwardDialogs(globalDialogs);
    }

    document.getElementById('close-forward-modal')?.addEventListener('click', () => {
        document.getElementById('tg-forward-modal').style.display = 'none';
    });

    document.getElementById('forward-search')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        if (globalDialogs) {
            const filtered = globalDialogs.filter(d => (d.title && d.title.toLowerCase().includes(term)));
            renderForwardDialogs(filtered);
        }
    });

    function renderForwardDialogs(filteredDialogs) {
        const list = document.getElementById('forward-dialogs-list');
        if (!list) return;

        let html = '';
        if (!filteredDialogs || filteredDialogs.length === 0) {
            list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px;">No chats available.</div>';
            return;
        }

        filteredDialogs.forEach(d => {
            const initial = d.title ? d.title.charAt(0).toUpperCase() : '?';
            html += `
            <div class="chat-item tg-dialog-item" style="padding:10px; cursor:pointer; display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05);" onclick="executeForward('${d.id}')">
                <div class="chat-avatar" style="background: #85cdcb; width:35px; height:35px; margin-right:15px; border-radius:50%; overflow:hidden; flex-shrink:0;">
                    <img src="/api/telegram/${activeTelegramIndeks}/avatar/${d.id}?pass=${authToken}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="display:block; width:100%; height:100%; object-fit:cover;">
                    <span style="display:none; width:100%; height:100%; align-items:center; justify-content:center; color:white; font-weight:bold;">${initial}</span>
                </div>
                <div class="chat-info" style="color:white; font-weight:500;">
                    ${escapeHTML(d.title)}
                </div>
            </div>`;
        });
        list.innerHTML = html;
    }

    window.executeForward = async function (toChatId) {
        if (!activeContextMsgId) return;
        document.getElementById('tg-forward-modal').style.display = 'none';
        try {
            await apiFetch(`/api/telegram/${activeTelegramIndeks}/message_action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'forward', chatId: activeTelegramChat, messageIds: [parseInt(activeContextMsgId)], toChatId })
            });

            const toast = document.createElement('div');
            toast.innerText = 'Mesaj başarıyla iletildi!';
            toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--primary); color:white; padding:10px 20px; border-radius:20px; z-index:9999; box-shadow:0 4px 6px rgba(0,0,0,0.3);';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        } catch (err) {
            alert("Yönlendirme başarısız: " + err.message);
        }
    };



    document.getElementById('tg-cancel-reply')?.addEventListener('click', () => {
        replyToMsgId = null;
        document.getElementById('tg-reply-bar').style.display = 'none';
    });

}); // END OF DOMContentLoaded
