import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged 
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    getDocs, 
    writeBatch,
    doc,
    updateDoc,
    setDoc,
    deleteDoc
} from 'firebase/firestore';
import { Instagram, Trash2, Crown, UserPlus, BarChart2, KeyRound, Edit, Lock, X, ShieldCheck } from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const isFirebaseConfigValid = firebaseConfig.apiKey && firebaseConfig.projectId;
const appId = firebaseConfig.appId || 'default-app-id';

// --- Main App Component ---
export default function App() {
    const [page, setPage] = useState('ranking');
    const [clients, setClients] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [db, setDb] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [notice, setNotice] = useState({ htmlContent: '', isActive: false, id: null });
    const [showNoticeModal, setShowNoticeModal] = useState(false);
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(sessionStorage.getItem('isAdminAuthed') === 'true');
    const [activeWhatsappNumbers, setActiveWhatsappNumbers] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isFirebaseConfigValid) {
            setError("ERRO: A configuração do Firebase é inválida. Verifique o seu ficheiro .env ou as variáveis de ambiente na Netlify.");
            setIsLoading(false);
            return;
        }
        try {
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const firestore = getFirestore(app);
            setDb(firestore);
            const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
                if (!user) {
                     await signInAnonymously(auth);
                }
                setIsAuthReady(true);
            });
            return () => unsubscribeAuth();
        } catch (e) { 
            console.error("Firebase initialization failed:", e); 
            setError("Falha crítica ao inicializar o Firebase.");
            setIsLoading(false); 
        }
    }, []);

    useEffect(() => {
        if (!isAuthReady || !db) return;

        const unsubscribers = [
            onSnapshot(query(collection(db, `artifacts/${appId}/public/data/clients`)), (snapshot) => {
                setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate() || new Date() })));
                setIsLoading(false); 
            }, (e) => { console.error("Error fetching clients:", e); setError("Erro ao carregar o ranking. Verifique as regras de segurança do Firestore."); setIsLoading(false); }),

            onSnapshot(doc(db, `artifacts/${appId}/public/data/notice/config`), (docSnapshot) => {
                if (docSnapshot.exists()) {
                    const noticeData = { id: docSnapshot.id, ...docSnapshot.data() };
                    setNotice(noticeData);
                    const isDismissed = sessionStorage.getItem('noticeDismissedId') === noticeData.id;
                    if (noticeData.isActive && !isDismissed) setShowNoticeModal(true);
                }
            }, (e) => console.error("Error fetching notice:", e)),

            onSnapshot(query(collection(db, `artifacts/${appId}/public/data/whatsapp`)), (snapshot) => {
                setActiveWhatsappNumbers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(num => num.isActive));
            }, (e) => console.error("Error fetching whatsapp numbers:", e))
        ];

        return () => unsubscribers.forEach(unsub => unsub());
    }, [isAuthReady, db]);

    const handleCloseNotice = () => { setShowNoticeModal(false); sessionStorage.setItem('noticeDismissedId', notice.id); };
    const handleAdminLogin = () => { sessionStorage.setItem('isAdminAuthed', 'true'); setIsAdminAuthenticated(true); };

    const rankedClients = useMemo(() => {
        const clientTotals = clients.reduce((acc, sale) => {
            const identifier = `${sale.firstName}|${sale.lastName}|${sale.instagram || ''}`.toLowerCase();
            if (!acc[identifier]) acc[identifier] = { firstName: sale.firstName, lastName: sale.lastName, instagram: sale.instagram, totalValor: 0, id: identifier };
            acc[identifier].totalValor += sale.valor || 0;
            return acc;
        }, {});
        return Object.values(clientTotals).sort((a, b) => b.totalValor - a.totalValor).slice(0, 10);
    }, [clients]);

    const renderPage = () => {
        if (error) return <div className="text-center text-red-400 bg-red-900/50 p-8 rounded-lg">{error}</div>
        if (isLoading) return <LoadingSpinner />;
        
        if (page === 'dashboard') {
            return isAdminAuthenticated 
                ? <AdminDashboard allClients={clients} db={db} /> 
                : <AdminKeyPromptModal onSuccess={handleAdminLogin} onCancel={() => setPage('ranking')} />;
        }
        return <RankingPanel clients={rankedClients} />;
    };

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            {showNoticeModal && <NoticeModal content={notice.htmlContent} onClose={handleCloseNotice} />}
            <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
                <div className="relative mb-8">
                    <Header />
                    <div className="absolute top-0 right-0 h-full flex items-center">
                         <button onClick={() => setPage('dashboard')} className="flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 bg-gray-700 hover:bg-gray-600" title="Painel do Admin">
                            <UserPlus size={20} /> <span className="hidden sm:inline">Admin</span>
                         </button>
                    </div>
                </div>
                <Navigation currentPage={page} setPage={setPage} activeWhatsappNumbers={activeWhatsappNumbers} />
                {renderPage()}
            </div>
        </div>
    );
}

// --- UI Components ---
const Header = () => ( <header className="text-center"><h1 className="text-4xl sm:text-5xl font-bold text-yellow-400 drop-shadow-lg flex items-center justify-center gap-3"><span role="img" aria-label="pinguim">🐧</span><span role="img" aria-label="coroa" style={{transform: 'translateY(-0.2em) rotate(-15deg)', display: 'inline-block'}}>👑</span><span>Ranking de Clientes</span><span role="img" aria-label="troféu">🏆</span></h1><p className="text-gray-400 mt-2">Veja os maiores contribuidores e gerencie suas vendas.</p></header> );
const Navigation = ({ currentPage, setPage, activeWhatsappNumbers }) => { const btnStyle = "flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105"; const active = "bg-yellow-500 text-gray-900 shadow-lg"; const inactive = "bg-gray-700 hover:bg-gray-600"; const WhatsAppIcon = () => (<svg viewBox="0 0 32 32" className="w-5 h-5" fill="currentColor"><path d=" M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 0 1-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 0 1-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.044-.53-.044-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977 1.017 2.78 1.23 1.82 2.506 3.41 4.554 4.34.616.287 2.035.888 2.722.888.817 0 2.15-.515 2.52-1.298.372-.783.372-1.49.214-1.743-.143-.254-.315-.315-.6-.315z M16 2 C7.973 2 2 7.973 2 16 c 0 2.565.65 5.05 1.865 7.245L2 30l7.02-1.845a13.91 13.91 0 0 0 6.98 1.845c8.027 0 14-5.973 14-14C30 7.973 24.027 2 16 2z m0 25.54a11.43 11.43 0 0 1-6.208-1.858l-.44-.26-4.545 1.19 1.212-4.43-.288-.457A11.48 11.48 0 0 1 4 16C4 9.398 9.398 4 16 4s12 5.398 12 12-5.398 11.54-12 11.54z"></path></svg>); return (<nav className="flex flex-col sm:flex-row gap-4 mb-8 flex-wrap justify-center"><button onClick={() => setPage('ranking')} className={`${btnStyle} ${currentPage === 'ranking' ? active : inactive}`}><Crown size={20} /> Ranking Público</button>{activeWhatsappNumbers.map(num => (<a key={num.id} href={`https://wa.me/${num.number}`} target="_blank" rel="noopener noreferrer" className={`${btnStyle} bg-green-500 hover:bg-green-600 text-white`}><WhatsAppIcon /><span>{num.label}</span></a>))}</nav>);};
const RankingPanel = ({ clients }) => { const rankColors = ['text-yellow-400', 'text-gray-300', 'text-yellow-600']; return (<div className="bg-gray-800 p-6 rounded-xl shadow-2xl"><h2 className="text-2xl font-bold mb-6 flex items-center gap-3"><BarChart2 /> Top 10 Clientes</h2>{clients.length === 0 ? <p className="text-gray-400 text-center py-8">O ranking ainda está vazio.</p> : (<ul className="space-y-4">{clients.map((client, index) => (<li key={client.id} className="flex items-center bg-gray-700/50 p-4 rounded-lg transition-transform hover:translate-x-1"><span className={`text-2xl font-bold w-12 ${rankColors[index] || 'text-gray-400'}`}>{index + 1}</span><div className="flex-grow"><p className="font-semibold text-lg">{client.firstName} {client.lastName}</p>{index < 3 ? <p className="text-sm text-green-400">R$ {client.totalValor.toFixed(2)}</p> : <p className="text-sm text-gray-500 italic flex items-center gap-1.5"><Lock size={12}/> Valor Privado</p>}</div>{client.instagram && (<a href={`https://instagram.com/${client.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-pink-500 hover:text-pink-400 p-2 rounded-full hover:bg-gray-600"><Instagram size={24} /></a>)}</li>))}</ul>)}</div>);};
const AdminDashboard = ({ allClients, db }) => { const [adminPage, setAdminPage] = useState('sales'); if (!db) return <LoadingSpinner />; return (<div className="flex flex-col gap-8"><AdminNav currentPage={adminPage} setPage={setAdminPage} />{adminPage === 'sales' && <SalesManagement allClients={allClients} db={db} />}{adminPage === 'notice' && <NoticeManagement db={db} />}{adminPage === 'whatsapp' && <WhatsappManagement db={db} />}</div>);};
const AdminNav = ({ currentPage, setPage }) => { const active = "border-yellow-400 text-yellow-400"; const inactive = "border-transparent text-gray-400 hover:text-white"; return (<div className="flex flex-wrap justify-center border-b border-gray-700 mb-4"><button onClick={() => setPage('sales')} className={`pb-3 px-4 sm:px-6 font-semibold border-b-2 transition-colors ${currentPage === 'sales' ? active : inactive}`}>Vendas</button><button onClick={() => setPage('notice')} className={`pb-3 px-4 sm:px-6 font-semibold border-b-2 transition-colors ${currentPage === 'notice' ? active : inactive}`}>Avisos</button><button onClick={() => setPage('whatsapp')} className={`pb-3 px-4 sm:px-6 font-semibold border-b-2 transition-colors ${currentPage === 'whatsapp' ? active : inactive}`}>WhatsApp</button></div>);};
const SalesManagement = ({ allClients, db }) => { const [formState, setFormState] = useState({ firstName: '', lastName: '', instagram: '', valor: '' }); const [showKeyPrompt, setShowKeyPrompt] = useState(false); const [isSubmitting, setIsSubmitting] = useState(false); const [editingClient, setEditingClient] = useState(null); const [suggestions, setSuggestions] = useState([]); const [showSuggestions, setShowSuggestions] = useState(false); const suggestionsContainerRef = useRef(null); useEffect(() => { const handleClickOutside = (e) => { if (suggestionsContainerRef.current && !suggestionsContainerRef.current.contains(e.target)) setShowSuggestions(false); }; document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside); }, []); const uniqueClients = useMemo(() => { const seen = new Set(); return allClients.filter(c => { const id = `${c.firstName}|${c.lastName}|${c.instagram || ''}`.toLowerCase(); return !seen.has(id) && seen.add(id); }); }, [allClients]); const handleFormChange = (e) => { const { name, value } = e.target; setFormState(prev => ({...prev, [name]: value})); if (name === 'firstName') { if (!value.trim()) { setShowSuggestions(false); return; } const filtered = uniqueClients.filter(c => c.firstName.toLowerCase().startsWith(value.toLowerCase()) || c.lastName.toLowerCase().startsWith(value.toLowerCase())); setSuggestions(filtered); setShowSuggestions(true); } }; const handleSuggestionClick = (c) => { setFormState({ ...formState, firstName: c.firstName, lastName: c.lastName, instagram: c.instagram || '' }); setShowSuggestions(false); }; const handleAddClient = async (e) => { e.preventDefault(); const { firstName, lastName, instagram, valor } = formState; if (!firstName || !lastName || !valor || !db) return; setIsSubmitting(true); try { let finalInstagram = instagram.trim(); if (finalInstagram && !finalInstagram.startsWith('@')) { finalInstagram = `@${finalInstagram}`; } await addDoc(collection(db, `artifacts/${appId}/public/data/clients`), { firstName: firstName.trim(), lastName: lastName.trim(), instagram: finalInstagram, valor: parseFloat(valor), createdAt: new Date(), }); setFormState({ firstName: '', lastName: '', instagram: '', valor: '' }); } catch (error) { console.error("Error adding client: ", error); } finally { setIsSubmitting(false); } }; const handleUpdateClient = async (data) => { if (!db || !editingClient) return; try { await updateDoc(doc(db, `artifacts/${appId}/public/data/clients`, editingClient.id), data); } catch (e) { console.error(e); } finally { setEditingClient(null); }}; const handleDeleteAll = async () => { if (!db) return; try { const snap = await getDocs(collection(db, `artifacts/${appId}/public/data/clients`)); const batch = writeBatch(db); snap.forEach(d => batch.delete(d.ref)); await batch.commit(); } catch (e) { console.error(e); } setShowKeyPrompt(false); }; const sortedClients = useMemo(() => [...allClients].sort((a, b) => b.createdAt - a.createdAt), [allClients]); return (<div className="relative pb-10"><div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><div className="bg-gray-800 p-6 rounded-xl shadow-2xl"><h2 className="text-2xl font-bold mb-6">Registrar Nova Venda</h2><form onSubmit={handleAddClient} className="space-y-4"><div className="relative" ref={suggestionsContainerRef}><input name="firstName" placeholder="Nome" value={formState.firstName} onChange={handleFormChange} onFocus={handleFormChange} className="w-full bg-gray-700 p-3 rounded-lg" required />{showSuggestions && suggestions.length > 0 && <ul className="absolute z-10 w-full bg-gray-600 border-gray-500 rounded-b-lg max-h-48 overflow-y-auto mt-1">{suggestions.map((s, i) => <li key={i} className="p-3 cursor-pointer hover:bg-yellow-500" onMouseDown={() => handleSuggestionClick(s)}>{s.firstName} {s.lastName}</li>)}</ul>}</div><input name="lastName" placeholder="Sobrenome" value={formState.lastName} onChange={handleFormChange} className="w-full bg-gray-700 p-3 rounded-lg" required /><input name="instagram" placeholder="@instagram (opcional)" value={formState.instagram} onChange={handleFormChange} className="w-full bg-gray-700 p-3 rounded-lg" /><input name="valor" type="number" step="0.01" placeholder="Valor Pago" value={formState.valor} onChange={handleFormChange} className="w-full bg-gray-700 p-3 rounded-lg" required /><button type="submit" className="w-full bg-green-600 p-3 rounded-lg font-bold" disabled={isSubmitting}>{isSubmitting ? 'Adicionando...' : 'Adicionar Cliente'}</button></form></div><div className="bg-gray-800 p-6 rounded-xl shadow-2xl flex flex-col"><h2 className="text-2xl font-bold mb-6">Histórico de Vendas</h2><div className="flex-grow overflow-y-auto max-h-96 pr-2">{sortedClients.length === 0 ? <p className="text-gray-400 text-center py-8">Nenhuma venda registrada.</p> : <ul className="space-y-3">{sortedClients.map(c => <li key={c.id} className="flex justify-between items-center bg-gray-700/50 p-3 rounded-lg"><div className="flex items-center gap-3"><span>{c.firstName} {c.lastName}</span><button onClick={() => setEditingClient(c)} className="text-gray-400 hover:text-yellow-400"><Edit size={16} /></button></div><span className="font-semibold text-green-400">R$ {c.valor.toFixed(2)}</span></li>)}</ul>}</div></div></div><div className="absolute bottom-0 left-0 p-2"><button onClick={() => setShowKeyPrompt(true)} className="text-gray-600 hover:text-red-500" title="Apagar histórico"><Trash2 size={24} /></button></div>{editingClient && <EditClientModal client={editingClient} onSave={handleUpdateClient} onCancel={() => setEditingClient(null)} />}{showKeyPrompt && <KeyPromptModal onConfirm={handleDeleteAll} onCancel={() => setShowKeyPrompt(false)} />}</div>);};
const NoticeManagement = ({ db }) => { const [content, setContent] = useState(''); const [isActive, setIsActive] = useState(false); const [isLoading, setIsLoading] = useState(true); const [isSaving, setIsSaving] = useState(false); useEffect(() => { if (!db) { setIsLoading(false); return; } const noticeDocRef = doc(db, `artifacts/${appId}/public/data/notice/config`); const unsub = onSnapshot(noticeDocRef, (doc) => { if (doc.exists()) { const data = doc.data(); setContent(data.htmlContent || ''); setIsActive(data.isActive || false); } setIsLoading(false); }); return () => unsub(); }, [db]); const handleSave = async (toggle = false) => { if (!db) return; setIsSaving(true); const newIsActive = toggle ? !isActive : isActive; try { await setDoc(doc(db, `artifacts/${appId}/public/data/notice/config`), { htmlContent: content, isActive: newIsActive, id: `notice-${Date.now()}` }, { merge: true }); if (toggle) setIsActive(newIsActive); } catch (e) { console.error("Error saving notice: ", e); } finally { setIsSaving(false); } }; if (isLoading) return <LoadingSpinner />; return (<div className="bg-gray-800 p-6 rounded-xl shadow-2xl space-y-6"><h2 className="text-2xl font-bold">Gerenciar Aviso Global</h2><textarea value={content} onChange={(e) => setContent(e.target.value)} className="w-full bg-gray-900 text-white p-4 rounded-lg min-h-[150px] border border-gray-600 focus:ring-2 focus:ring-yellow-500" placeholder="Digite seu aviso aqui. Pode usar tags HTML como <b> para negrito."/> <div className="flex flex-col sm:flex-row gap-4"><button onClick={() => handleSave(false)} disabled={isSaving} className="flex-1 bg-blue-600 p-3 rounded-lg font-bold disabled:bg-gray-500">{isSaving ? 'Salvando...' : 'Salvar Conteúdo'}</button><button onClick={() => handleSave(true)} disabled={isSaving} className={`flex-1 p-3 rounded-lg font-bold ${isActive ? 'bg-red-600' : 'bg-green-600'}`}>{isSaving ? 'Alterando...' : (isActive ? 'Desativar Aviso' : 'Ativar Aviso')}</button></div></div>); };
const WhatsappManagement = ({ db }) => { const [numbers, setNumbers] = useState([]); const [isLoading, setIsLoading] = useState(true); const [newNumber, setNewNumber] = useState(''); const [newLabel, setNewLabel] = useState(''); useEffect(() => { if (!db) { setIsLoading(false); return; } const collectionRef = collection(db, `artifacts/${appId}/public/data/whatsapp`); const unsub = onSnapshot(collectionRef, snapshot => { setNumbers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); setIsLoading(false); }); return () => unsub(); }, [db]); const handleAddNumber = async (e) => { e.preventDefault(); if (!newNumber || !newLabel || !db) return; const sanitizedNumber = newNumber.replace(/\D/g, ''); await addDoc(collection(db, `artifacts/${appId}/public/data/whatsapp`), { number: sanitizedNumber, label: newLabel, isActive: true, createdAt: new Date() }); setNewNumber(''); setNewLabel(''); }; const handleToggle = async (id, currentStatus) => { if(!db) return; await updateDoc(doc(db, `artifacts/${appId}/public/data/whatsapp`, id), { isActive: !currentStatus }); }; const handleDelete = async (id) => { if(!db) return; await deleteDoc(doc(db, `artifacts/${appId}/public/data/whatsapp`, id)); }; if (isLoading) return <LoadingSpinner />; return (<div className="bg-gray-800 p-6 rounded-xl shadow-2xl space-y-6"><h2 className="text-2xl font-bold mb-6">Gerenciar Contatos do WhatsApp</h2><form onSubmit={handleAddNumber} className="flex flex-col sm:flex-row gap-4"><input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Rótulo (ex: Vendas)" className="flex-1 bg-gray-700 p-3 rounded-lg" required /><input value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="Número (ex: 5541999998888)" className="flex-1 bg-gray-700 p-3 rounded-lg" required /><button type="submit" className="bg-green-600 p-3 rounded-lg font-bold">Adicionar</button></form><ul className="space-y-3">{numbers.length > 0 ? numbers.map(num => (<li key={num.id} className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg"><div><p className="font-semibold">{num.label}</p><p className="text-sm text-gray-400">+{num.number}</p></div><div className="flex items-center gap-4"><button onClick={() => handleToggle(num.id, num.isActive)} className={`font-bold text-sm px-3 py-1 rounded-full ${num.isActive ? "bg-green-500" : "bg-gray-500"}`}>{num.isActive ? "Ativo" : "Inativo"}</button><button onClick={() => handleDelete(num.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={18} /></button></div></li>)) : <p className="text-center text-gray-400">Nenhum número adicionado.</p> }</ul></div>);};

// --- Modals and Spinners ---
const NoticeModal = ({ content, onClose }) => (<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full border border-yellow-500 relative"><button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-white"><X size={24} /></button><div className="p-8 prose prose-sm sm:prose-base prose-invert max-w-none notice-content" dangerouslySetInnerHTML={{ __html: content }} /><style>{`.notice-content img {max-width:100%;border-radius:8px;} .notice-content a {color:#fBBF24; text-decoration:underline;}`}</style></div></div>);
const EditClientModal = ({ client, onSave, onCancel }) => { const [formData, setFormData] = useState({ ...client }); const handleSave = async (e) => { e.preventDefault(); const data = { ...formData, valor: parseFloat(formData.valor) }; delete data.id; delete data.createdAt; delete data.totalValor; await onSave(data); }; return (<div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 p-8 rounded-xl border border-yellow-500 max-w-lg w-full"><h3 className="text-2xl font-bold mb-6">Editar Venda</h3><form onSubmit={handleSave} className="space-y-4"><input value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} className="w-full bg-gray-700 p-3 rounded-lg" required /><input value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} className="w-full bg-gray-700 p-3 rounded-lg" required /><input value={formData.instagram} onChange={(e) => setFormData({...formData, instagram: e.target.value})} className="w-full bg-gray-700 p-3 rounded-lg" /><input type="number" step="0.01" value={formData.valor} onChange={(e) => setFormData({...formData, valor: e.target.value})} className="w-full bg-gray-700 p-3 rounded-lg" required /><div className="flex gap-4 pt-4"><button type="button" onClick={onCancel} className="flex-1 bg-gray-600 p-3 rounded-lg font-bold">Cancelar</button><button type="submit" className="flex-1 bg-green-600 p-3 rounded-lg font-bold">Salvar</button></div></form></div></div>); };
const KeyPromptModal = ({ onConfirm, onCancel }) => { const [inputKey, setInputKey] = useState(''); const [error, setError] = useState(''); const SECRET_KEY = 'H4gT8wNfPzS6jL1xVbK3dZmM7'; const handleConfirm = () => { if (inputKey === SECRET_KEY) onConfirm(); else setError('Chave de segurança incorreta!'); }; return (<div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 p-8 rounded-xl border border-red-500 max-w-sm text-center"><KeyRound size={40} className="mx-auto text-yellow-400 mb-4" /><h3 className="text-2xl font-bold mb-2">Exclusão de Dados</h3><p className="text-gray-300 mb-6">Insira a chave de segurança.</p><div className="space-y-4"><input type="password" value={inputKey} onChange={(e) => { setInputKey(e.target.value); setError(''); }} className="w-full bg-gray-700 p-3 rounded-lg text-center" />{error && <p className="text-red-500 text-sm">{error}</p>}<div className="flex gap-4"><button onClick={onCancel} className="flex-1 bg-gray-600 p-3 rounded-lg font-bold">Cancelar</button><button onClick={handleConfirm} className="flex-1 bg-red-600 p-3 rounded-lg font-bold">Confirmar</button></div></div></div></div>); };
const AdminKeyPromptModal = ({ onSuccess, onCancel }) => { const [inputKey, setInputKey] = useState(''); const [error, setError] = useState(''); const ADMIN_KEY = 'aK7pL3sR9jVcBmN5wXyZ2oDqE'; const handleConfirm = () => { if (inputKey === ADMIN_KEY) onSuccess(); else { setError('Chave de acesso incorreta!'); setInputKey(''); } }; return (<div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50 p-4 text-center"><ShieldCheck size={60} className="mx-auto text-yellow-400 mb-6" /><h2 className="text-3xl font-bold mb-2">Acesso Restrito</h2><p className="text-gray-400 mb-8 max-w-sm">Para acessar o painel de administração, por favor, insira a chave de acesso.</p><div className="w-full max-w-sm space-y-4"><input type="password" placeholder="Chave de Acesso" value={inputKey} onChange={(e) => { setInputKey(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && handleConfirm()} className="w-full bg-gray-800 p-4 rounded-lg text-center text-lg border border-gray-700 focus:ring-2 focus:ring-yellow-500 outline-none" autoFocus />{error && <p className="text-red-500 text-sm">{error}</p>}<div className="flex flex-col sm:flex-row gap-4"><button onClick={onCancel} className="w-full sm:w-auto flex-1 bg-gray-600 hover:bg-gray-500 p-3 rounded-lg font-bold transition-colors">Voltar ao Ranking</button><button onClick={handleConfirm} className="w-full sm:w-auto flex-1 bg-yellow-500 hover:bg-yellow-600 text-gray-900 p-3 rounded-lg font-bold transition-colors">Desbloquear</button></div></div></div>); };
const LoadingSpinner = () => (<div className="flex justify-center items-center py-16"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div></div>);
