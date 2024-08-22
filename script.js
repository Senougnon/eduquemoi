const API_KEY = 'AIzaSyB3umTE3n2d5gwKzOmJz4ss1pFZMR8_vOE';
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
let currentUser = null;
let pinnedFile = null;
let currentConversation = [];
let conversations = {};
const FREE_CREDITS_PER_DAY = 10;
const FREE_MODEL_MAX_WORDS = 50;
const FREE_MODEL_MAX_RESPONSE = 100;

// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCvizcYorGDPN3GXqma0opp7wAiMkaCt64",
    authDomain: "gemini-bb56e.firebaseapp.com",
    databaseURL: "https://gemini-bb56e-default-rtdb.firebaseio.com",
    projectId: "gemini-bb56e",
    storageBucket: "gemini-bb56e.appspot.com",
    messagingSenderId: "277143630015",
    appId: "1:277143630015:web:78736f2cf52d29495d160a",
    measurementId: "G-CSN292219J"
};

// Initialiser Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let prompts = {};
let pinnedPrompt = null;

// Fonction pour vérifier et mettre à jour le statut de l'abonnement
async function checkSubscriptionStatus() {
    if (!currentUser || !currentUser.subscriptionEndDate) return;

    const now = new Date();
    const endDate = new Date(currentUser.subscriptionEndDate);

    if (now > endDate) {
        currentUser.subscription = null;
        currentUser.subscriptionEndDate = null;
        await syncUserData();
        showNotification("Votre abonnement a expiré.", 'info');
        updateUIForLoggedInUser();
    } else if (now > new Date(endDate.getTime() - 3 * 24 * 60 * 60 * 1000)) {
        // Notification 3 jours avant l'expiration
        const daysLeft = Math.ceil((endDate - now) / (24 * 60 * 60 * 1000));
        showNotification(`Votre abonnement expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`, 'warning');
    }
}

// Fonction pour générer une facture en PDF
function generateInvoicePDF(transaction) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Facture Eduque moi", 105, 20, null, null, "center");
    
    doc.setFontSize(12);
    doc.text(`Facture pour : ${currentUser.username}`, 20, 40);
    doc.text(`Date : ${new Date().toLocaleDateString()}`, 20, 50);
    doc.text(`Description : ${transaction.description}`, 20, 60);
    doc.text(`Montant : ${transaction.amount} FCFA`, 20, 70);
    doc.text(`Numéro de transaction : ${transaction.id}`, 20, 80);
    
    return doc;
}

// Fonction pour afficher la fenêtre flottante des détails de la facture
function showInvoiceDetails(transaction) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Détails de la facture</h2>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Description:</strong> ${transaction.description}</p>
            <p><strong>Montant:</strong> ${transaction.amount} FCFA</p>
            <p><strong>Numéro de transaction:</strong> ${transaction.id}</p>
            <button id="downloadInvoice">Télécharger la facture en PDF</button>
            <button id="closeModal">Fermer</button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('downloadInvoice').addEventListener('click', () => {
        const doc = generateInvoicePDF(transaction);
        doc.save(`facture_${transaction.id}.pdf`);
    });

    document.getElementById('closeModal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

function initializeNewDiscussion() {
    currentConversation = [];
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.innerHTML = '';
    addMessageToChat('ai', 'Bienvenue dans une nouvelle conversation ! Comment puis-je vous aider aujourd\'hui ?');
    updateConversationHistory();
}

function showLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
}

function showRegisterModal() {
    document.getElementById('registerModal').style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function updateUIForLoggedInUser() {
    document.getElementById('loginBtn').classList.add('hidden');
    document.getElementById('registerBtn').classList.add('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    document.getElementById('userInfo').classList.remove('hidden');
    document.getElementById('username').textContent = currentUser.username;
    document.getElementById('freeCredits').textContent = currentUser.freeCredits;
    document.getElementById('paidCredits').textContent = currentUser.paidCredits;
    document.getElementById('subscription').textContent = currentUser.subscription || 'Aucun';
    loadConversationHistory();
}

function updateUIForLoggedOutUser() {
    document.getElementById('loginBtn').classList.remove('hidden');
    document.getElementById('registerBtn').classList.remove('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
    document.getElementById('userInfo').classList.add('hidden');
    document.getElementById('conversationHistory').innerHTML = '<h3>Historique des conversations</h3>';
}

function storeLoginInfo(username, password) {
    localStorage.setItem('eduqueMoiUsername', username);
    localStorage.setItem('eduqueMoiPassword', password);
}

function getStoredLoginInfo() {
    return {
        username: localStorage.getItem('eduqueMoiUsername'),
        password: localStorage.getItem('eduqueMoiPassword')
    };
}

function clearLoginInfo() {
    localStorage.removeItem('eduqueMoiUsername');
    localStorage.removeItem('eduqueMoiPassword');
}

async function register() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const referralCode = new URLSearchParams(window.location.search).get('ref');
    
    if (!username || !password) {
        showNotification('Veuillez remplir tous les champs.', 'error');
        return;
    }

    try {
        const userRef = db.ref('users/' + username);
        const snapshot = await userRef.once('value');
        if (snapshot.exists()) {
            showNotification('Ce nom d\'utilisateur existe déjà.', 'error');
            return;
        }
        
        const now = new Date();
        const userData = {
            password: password,
            freeCredits: FREE_CREDITS_PER_DAY + 5, // 5 crédits supplémentaires pour le filleul
            paidCredits: 0,
            subscription: null,
            subscriptionEndDate: null,
            lastFreeCreditsReset: now.toISOString(),
            referredBy: referralCode || null
        };
        
        await userRef.set(userData);
        
        if (referralCode) {
            const referrerQuery = await db.ref('users').orderByChild('referralCode').equalTo(referralCode).once('value');
            const referrer = referrerQuery.val();
            if (referrer) {
                const referrerUsername = Object.keys(referrer)[0];
                await db.ref(`users/${referrerUsername}/referrals/${username}`).set({
                    date: now.toISOString(),
                    isActive: true
                });
                
                // Attribuer 5 crédits au parrain
                const referrerRef = db.ref(`users/${referrerUsername}`);
                await referrerRef.transaction((user) => {
                    if (user) {
                        user.paidCredits = (user.paidCredits || 0) + 5;
                    }
                    return user;
                });
                
                showNotification('Vous avez reçu 5 crédits grâce à votre parrain !', 'success');
            }
        }
        
        currentUser = { username, ...userData };
        updateUIForLoggedInUser();
        showNotification('Inscription réussie !', 'success');
        closeModal('registerModal');
        storeLoginInfo(username, password);
    } catch (error) {
        console.error('Erreur lors de l\'inscription:', error);
        showNotification('Erreur lors de l\'inscription. Veuillez réessayer.', 'error');
    }
}

async function login(username, password) {
    if (!username || !password) {
        username = document.getElementById('loginUsername').value;
        password = document.getElementById('loginPassword').value;
    }
    
    if (!username || !password) {
        showNotification('Veuillez remplir tous les champs.', 'error');
        return;
    }

    try {
        const userRef = db.ref('users/' + username);
        const snapshot = await userRef.once('value');
        if (snapshot.exists() && snapshot.val().password === password) {
            const userData = snapshot.val();
            currentUser = { 
                username, 
                freeCredits: userData.freeCredits,
                paidCredits: userData.paidCredits,
                subscription: userData.subscription,
                subscriptionEndDate: userData.subscriptionEndDate,
                lastFreeCreditsReset: userData.lastFreeCreditsReset
            };
            await resetFreeCreditsIfNeeded();
            updateUIForLoggedInUser();
            showNotification('Connexion réussie !', 'success');
            closeModal('loginModal');
            storeLoginInfo(username, password);
        } else {
            showNotification('Nom d\'utilisateur ou mot de passe incorrect.', 'error');
        }
    } catch (error) {
        console.error('Erreur lors de la connexion:', error);
        showNotification('Erreur lors de la connexion. Veuillez réessayer.', 'error');
    }
}

function logout() {
    if (currentUser) {
        syncUserData();
    }
    currentUser = null;
    updateUIForLoggedOutUser();
    showNotification('Déconnexion réussie.', 'success');
    clearLoginInfo();
}

async function resetFreeCreditsIfNeeded() {
    const now = new Date();
    const lastReset = new Date(currentUser.lastFreeCreditsReset);
    if (now.getTime() - lastReset.getTime() >= 24 * 60 * 60 * 1000) {
        const previousCredits = currentUser.freeCredits;
        currentUser.freeCredits = FREE_CREDITS_PER_DAY;
        currentUser.lastFreeCreditsReset = now.toISOString();
        await syncUserData();
        document.getElementById('freeCredits').textContent = currentUser.freeCredits;
        // Notifier l'utilisateur
        const newCredits = currentUser.freeCredits - previousCredits;
        if (newCredits > 0) {
            showNotification(`${newCredits} crédits gratuits ont été ajoutés à votre compte !`, 'success');
        }
    }
}

function checkModelAccess() {
    const selectedModel = document.getElementById('modelSelect').value;
    if (selectedModel !== 'gemini-1.0-pro' && !hasValidSubscription() && currentUser.paidCredits <= 0) {
        showPaymentNotification('Ce modèle nécessite un abonnement ou des crédits payants.');
        document.getElementById('modelSelect').value = 'gemini-1.0-pro';
    }
}

async function sendMessage() {
    if (!currentUser) {
        showNotification('Veuillez vous connecter pour envoyer des messages.', 'error');
        return;
    }

    const userInput = document.getElementById('userInput').value.trim();
    const model = document.getElementById('modelSelect').value;

    if (!userInput && !pinnedFile && !pinnedPrompt) {
        showNotification('Veuillez entrer un message, joindre un fichier ou sélectionner un prompt.', 'error');
        return;
    }

    if (!hasEnoughCredits(model)) {
        showPaymentNotification('Vous n\'avez plus de crédits pour les models no limite. Veuillez acheter des crédits ou un forfait pour continuer. Vous pouvez aussi continuer avec le modèl limité');
        return;
    }

    let displayMessage = userInput;
    let fullMessage = userInput;

    if (pinnedFile) {
        fullMessage = `[Contenu du fichier joint: ${pinnedFile.content}]\n\n${fullMessage}`;
        displayMessage = `[Fichier joint: ${pinnedFile.name}]\n\n${displayMessage}`;
    }

    if (pinnedPrompt) {
        fullMessage = `${pinnedPrompt.content}\n\n${fullMessage}`;
        displayMessage = `[Prompt: ${pinnedPrompt.title}]\n\n${displayMessage}`;
    }

    addMessageToChat('user', displayMessage);
    document.getElementById('userInput').value = '';

    try {
        const conversationContext = currentConversation.map(msg => msg.content).join('\n');
        
        const response = await axios.post(`${API_BASE_URL}${model}:generateContent?key=${API_KEY}`, {
            contents: [{ parts: [{ text: conversationContext + '\n' + fullMessage }] }]
        });

        let aiResponse = response.data.candidates[0].content.parts[0].text;

        let messageElement;
        if (model === 'gemini-1.0-pro') {
            const words = aiResponse.split(/\s+/);
            if (words.length > FREE_MODEL_MAX_RESPONSE) {
                aiResponse = words.slice(0, FREE_MODEL_MAX_RESPONSE).join(' ') + '...(Utilisez un modèle avancé pour avoir la suite de ma réponse)';
                showNotification(`La réponse a été tronquée à ${FREE_MODEL_MAX_RESPONSE} mots.`, 'info');
                messageElement = addMessageToChat('ai', aiResponse);
                showUpgradeButton(messageElement);
            } else {
                messageElement = addMessageToChat('ai', aiResponse);
            }
        } else {
            messageElement = addMessageToChat('ai', aiResponse);
        }

        await updateCredits(model);
        removePinnedFile();
        removePinnedPrompt();
        saveConversation();
    } catch (error) {
        console.error('Erreur lors de la génération de la réponse:', error);
        showNotification(`Erreur : ${error.message}. Veuillez réessayer.`, 'error');
    }
}

function hasEnoughCredits(model) {
    if (hasValidSubscription()) return true;
    if (model === 'gemini-1.0-pro') {
        return currentUser.freeCredits > 0 || currentUser.paidCredits > 0;
    }
    return currentUser.paidCredits > 0;
}

async function updateCredits(model) {
    if (hasValidSubscription()) return;
    
    if (model === 'gemini-1.0-pro') {
        if (currentUser.freeCredits > 0) {
            currentUser.freeCredits = Math.max(0, currentUser.freeCredits - 1);
            document.getElementById('freeCredits').textContent = currentUser.freeCredits;
        } else {
            currentUser.paidCredits = Math.max(0, currentUser.paidCredits - 1);
            document.getElementById('paidCredits').textContent = currentUser.paidCredits;
        }
    } else {
        currentUser.paidCredits = Math.max(0, currentUser.paidCredits - 1);
        document.getElementById('paidCredits').textContent = currentUser.paidCredits;
    }
    
    await syncUserData();
}

function addMessageToChat(sender, message) {
    const messageContainer = document.getElementById('messageContainer');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
    
    if (sender === 'ai') {
        message = message.replace(/\*\*/g, '\n');
        
        const textElement = document.createElement('div');
        messageElement.appendChild(textElement);

        animateResponse(textElement, message);

        const actionsElement = document.createElement('div');
        actionsElement.classList.add('message-actions');
        actionsElement.innerHTML = `
            <button onclick="copyResponse(this.parentNode.parentNode)"><i class="fas fa-copy"></i></button>
            <button onclick="exportResponse(this.parentNode.parentNode, 'word')"><i class="fas fa-file-word"></i></button>
            <button onclick="exportResponse(this.parentNode.parentNode, 'pdf')"><i class="fas fa-file-pdf"></i></button>
            <button onclick="shareResponse(this.parentNode.parentNode)"><i class="fas fa-share-alt"></i></button>
        `;
        messageElement.appendChild(actionsElement);
    } else {
        messageElement.textContent = message;
    }

    messageContainer.appendChild(messageElement);
    messageContainer.scrollTop = messageContainer.scrollHeight;

    currentConversation.push({ sender, content: message });

    return messageElement;
}

function copyResponse(messageElement) {
    const responseText = messageElement.querySelector('div:first-child').textContent;
    navigator.clipboard.writeText(responseText).then(() => {
        showNotification('Réponse copiée dans le presse-papiers', 'success');
    });
}

async function exportResponse(messageElement, format) {
    const responseText = messageElement.querySelector('div:first-child').textContent;
    if (format === 'word') {
        const blob = await generateWordDoc(responseText);
        saveAs(blob, "response.docx");
    } else if (format === 'pdf') {
        const blob = await generatePDF(responseText);
        saveAs(blob, "response.pdf");
    }
    showNotification(`Export en ${format.toUpperCase()} réussi`, 'success');
}

async function generateWordDoc(text) {
    const content = `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body>
                <w:p>
                    <w:pPr>
                        <w:pStyle w:val="Heading1"/>
                    </w:pPr>
                    <w:r>
                        <w:t>Réponse d'Eduque moi</w:t>
                    </w:r>
                </w:p>
                <w:p>
                    <w:r>
                        <w:t>${text}</w:t>
                    </w:r>
                </w:p>
            </w:body>
        </w:document>
    `;
    const zip = new PizZip();
    zip.file("word/document.xml", content);
    const blob = await zip.generateAsync({type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
    return blob;
}

function generatePDF(text) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Réponse d'Eduque moi", 20, 20);
    
    doc.setFontSize(12);
    const splitText = doc.splitTextToSize(text, 170);
    
    let y = 30;
    const pageHeight = doc.internal.pageSize.height;
    
    for (let i = 0; i < splitText.length; i++) {
        if (y > pageHeight - 20) {
            doc.addPage();
            y = 20;
        }
        doc.text(splitText[i], 20, y);
        y += 7;
    }
    
    return doc.output('blob');
}

function shareResponse(messageElement) {
    const responseText = messageElement.querySelector('div:first-child').textContent;
    if (navigator.share) {
        navigator.share({
            title: 'Réponse de Eduque moi',
            text: responseText
        }).then(() => {
            showNotification('Partage réussi', 'success');
        }).catch((error) => {
            console.error('Erreur lors du partage:', error);
            showNotification('Erreur lors du partage', 'error');
        });
    } else {
        showNotification('Le partage n\'est pas pris en charge sur votre appareil', 'error');
    }
}

async function loadPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const numPages = pdf.numPages;
    let fullText = '';

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';
    }

    return fullText;
}

async function reduceFileSize(file, maxSizeInMB) {
    if (file.type.startsWith('image/')) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    let quality = 0.7;
                    const maxSize = maxSizeInMB * 1024 * 1024;

                    while (true) {
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        const dataUrl = canvas.toDataURL(file.type, quality);
                        const blobBin = atob(dataUrl.split(',')[1]);
                        const array = [];
                        for (let i = 0; i < blobBin.length; i++) {
                            array.push(blobBin.charCodeAt(i));
                        }
                        const newFile = new Blob([new Uint8Array(array)], {type: file.type});
                        
                        if (newFile.size <= maxSize) {
                            resolve(newFile);
                            break;
                        }
                        
                        quality *= 0.9;
                        width *= 0.9;
                        height *= 0.9;
                        
                        if (quality < 0.1 || width < 100 || height < 100) {
                            console.warn("Impossible de réduire suffisamment la taille de l'image");
                            resolve(file);
                            break;
                        }
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    } else if (file.type === 'application/pdf') {
        console.warn("La réduction de taille n'est pas prise en charge pour les PDF");
        return file;
    } else {
        return file;
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        let content = '';
        const ocrResultElement = document.getElementById('ocrResult');
        
        if (ocrResultElement) {
            ocrResultElement.classList.add('hidden');
            ocrResultElement.textContent = '';
        }

        const fileSizeInMB = file.size / (1024 * 1024);
        let processedFile = file;
        if (fileSizeInMB > 1) {
            processedFile = await reduceFileSize(file, 1);
        }

        if (processedFile.type === 'application/pdf') {
            try {
                const pdf = await pdfjsLib.getDocument(await processedFile.arrayBuffer()).promise;
                const numPages = pdf.numPages;

                if (numPages > 3) {
                    content = await loadPDF(processedFile);
                    if (ocrResultElement) {
                        ocrResultElement.textContent = "Le PDF a plus de 3 pages. Utilisation du lecteur PDF standard.";
                        ocrResultElement.classList.remove('hidden');
                    }
                } else {
                    content = await loadPDF(processedFile);
                    if (content.trim() === '') {
                        content = await performOCR(processedFile);
                        if (ocrResultElement) {
                            ocrResultElement.textContent = "OCR utilisé pour extraire le texte du PDF.";
                            ocrResultElement.classList.remove('hidden');
                        }
                    }
                }
            } catch (error) {
                console.error('Erreur lors de la lecture du PDF:', error);
                content = await performOCR(processedFile);
                if (ocrResultElement) {
                    ocrResultElement.textContent = "OCR utilisé pour extraire le texte du PDF.";
                    ocrResultElement.classList.remove('hidden');
                }
            }
        } else if (processedFile.type.startsWith('image/')) {
            content = await performOCR(processedFile);
            if (ocrResultElement) {
                ocrResultElement.textContent = "OCR utilisé pour extraire le texte de l'image.";
                ocrResultElement.classList.remove('hidden');
            }
        } else {
            showNotification("Type de fichier non pris en charge.", 'error');
            return;
        }

        pinnedFile = {
            name: file.name,
            content: content
        };

        updatePinnedFile(pinnedFile);
    }
}

function updatePinnedFile(file) {
    const pinnedItems = document.getElementById('pinnedItems');
    const existingFile = pinnedItems.querySelector('.pinned-item[data-type="file"]');
    if (existingFile) {
        existingFile.remove();
    }
    if (file) {
        const item = document.createElement('div');
        item.className = 'pinned-item';
        item.setAttribute('data-type', 'file');
        item.innerHTML = `
            <span class="icon">📎</span>
            <span class="name" title="${file.name}">${file.name}</span>
            <span class="remove" onclick="removePinnedFile()">❌</span>
        `;
        pinnedItems.appendChild(item);
    }
}

function removePinnedFile() {
    pinnedFile = null;
    updatePinnedFile(null);
}

async function performOCR(file) {
    const apiKey = 'K84184304788957';
    const apiUrl = 'https://api.ocr.space/parse/image';

    const formData = new FormData();
    formData.append('apikey', apiKey);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('file', file);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.ParsedResults && data.ParsedResults.length > 0) {
            return data.ParsedResults[0].ParsedText;
        } else {
            throw new Error('Échec de l\'extraction du texte');
        }
    } catch (error) {
        console.error('Erreur lors de l\'OCR:', error);
        showNotification("Erreur lors de l'analyse OCR. Veuillez réessayer.", 'error');
        return '';
    }
}

function hasValidSubscription() {
    if (!currentUser.subscription || !currentUser.subscriptionEndDate) return false;
    return new Date() < new Date(currentUser.subscriptionEndDate);
}

function buySubscription() {
    const subscriptionType = document.getElementById('subscriptionSelect').value;
    if (!subscriptionType) {
        showNotification('Veuillez sélectionner un forfait.', 'error');
        return;
    }

    const subscriptionPrices = {
        '24h': 500, '3d': 1200, '7d': 2400, '30d': 8000, '3m': 20000
    };

    const price = subscriptionPrices[subscriptionType];

    var fedaPayInstance = FedaPay.init({
        public_key: 'pk_live_TfSz212W0xSMKK7oPEogkFmp',
        transaction: {
            amount: price,
            description: `Achat d'un forfait ${subscriptionType} pour Eduque moi`
        },
        customer: {
            email: 'client@example.com'
        },
        onComplete: async function(response) {
            if (response.reason === FedaPay.CHECKOUT_COMPLETED) {
                const transaction = {
                    id: response.id,
                    description: `Achat d'un forfait ${subscriptionType} pour Eduque moi`,
                    amount: price
                };
                await activateSubscription(subscriptionType);
                showInvoiceDetails(transaction);
                showNotification(`Forfait ${subscriptionType} activé avec succès !`, 'success');
                
                // Récompenser le parrain
                await rewardReferrer(currentUser.username, price);
            } else {
                showNotification('Le paiement a été annulé ou a échoué.', 'error');
            }
        }
    });fedaPayInstance.open();
}

async function activateSubscription(subscriptionType) {
    const durations = { '24h': 1, '3d': 3, '7d': 7, '30d': 30, '3m': 90 };
    const days = durations[subscriptionType];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    currentUser.subscription = subscriptionType;
    currentUser.subscriptionEndDate = endDate.toISOString();

    await syncUserData();

    document.getElementById('subscription').textContent = subscriptionType;
}

function buyCredits() {
    const creditAmount = document.getElementById('creditSelect').value;
    if (!creditAmount) {
        showNotification('Veuillez sélectionner un pack de crédits.', 'error');
        return;
    }

    const creditPrices = {
       '10': 200, '100': 1000, '500': 4500, '1000': 8000
    };

    const price = creditPrices[creditAmount];

    var fedaPayInstance = FedaPay.init({
        public_key: 'pk_live_TfSz212W0xSMKK7oPEogkFmp',
        transaction: {
            amount: price,
            description: `Achat de ${creditAmount} crédits pour Eduque moi`
        },
        customer: {
            email: 'client@example.com'
        },
        onComplete: async function(response) {
            if (response.reason === FedaPay.CHECKOUT_COMPLETED) {
                const transaction = {
                    id: response.id,
                    description: `Achat de ${creditAmount} crédits pour Eduque moi`,
                    amount: price
                };
                await addCreditsToUser(parseInt(creditAmount));
                showInvoiceDetails(transaction);
                showNotification(`${creditAmount} crédits ont été ajoutés à votre compte.`, 'success');
                
                // Récompenser le parrain
                await rewardReferrer(currentUser.username, price);
            } else {
                showNotification('Le paiement a été annulé ou a échoué.', 'error');
            }
        }
    });
    fedaPayInstance.open();
}

async function addCreditsToUser(amount) {
    currentUser.paidCredits += amount;
    await syncUserData();
    document.getElementById('paidCredits').textContent = currentUser.paidCredits;
}

function shareOnFacebook() {
    const url = encodeURIComponent(document.getElementById('referralLink').value);
    const message = encodeURIComponent("Rejoignez-moi sur Eduque moi et apprenons ensemble ! Utilisez mon lien de parrainage pour obtenir des bonus :");
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${message}`, '_blank');
}

function shareOnTwitter() {
    const url = encodeURIComponent(document.getElementById('referralLink').value);
    const message = encodeURIComponent("Découvrez Eduque moi avec moi ! Utilisez mon lien de parrainage pour commencer votre voyage d'apprentissage :");
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${message}`, '_blank');
}

function shareOnLinkedIn() {
    const url = encodeURIComponent(document.getElementById('referralLink').value);
    const message = encodeURIComponent("Je vous recommande Eduque moi pour améliorer vos connaissances. Utilisez mon lien de parrainage :");
    window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${url}&title=Rejoignez Eduque moi&summary=${message}`, '_blank');
}

function shareOnWhatsApp() {
    const url = encodeURIComponent(document.getElementById('referralLink').value);
    const message = encodeURIComponent("Hé ! J'utilise Eduque moi pour apprendre. Rejoins-moi avec ce lien de parrainage : ");
    window.open(`https://wa.me/?text=${message}${url}`, '_blank');
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }, 100);
}

function showPaymentNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.innerHTML = `
        ${message}<br>
        <button onclick="buySubscription()">Acheter un abonnement</button>
        <button onclick="buyCredits()">Acheter des crédits</button>
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 10000);
    }, 100);
}

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    // Mise à jour de la métadonnée color-scheme
    document.querySelector('meta[name="color-scheme"]').setAttribute('content', newTheme);
}

function updateThemeIcon(theme) {
    const themeToggle = document.querySelector('.theme-toggle i');
    themeToggle.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const chatContainer = document.querySelector('.chat-container');
    sidebar.classList.toggle('visible');
    chatContainer.classList.toggle('sidebar-visible');
}

function saveConversation() {
    if (!currentUser) return;
    const conversationId = currentConversation.id || Date.now().toString();
    conversations[conversationId] = currentConversation;
    currentConversation.id = conversationId;
    localStorage.setItem(`conversations_${currentUser.username}`, JSON.stringify(conversations));
    updateConversationHistory();
}

function loadConversationHistory() {
    if (!currentUser) return;
    const savedConversations = localStorage.getItem(`conversations_${currentUser.username}`);
    if (savedConversations) {
        conversations = JSON.parse(savedConversations);
        updateConversationHistory();
    }
}

function updateConversationHistory() {
    const historyContainer = document.getElementById('historyList');
    historyContainer.innerHTML = '';

    const sortedConversations = Object.keys(conversations).sort((a, b) => parseInt(b) - parseInt(a));

    sortedConversations.forEach(id => {
        const conversation = conversations[id];
        const element = document.createElement('div');
        element.className = 'conversation-item';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = `Conversation du ${new Date(parseInt(id)).toLocaleString()}`;
        textSpan.onclick = () => loadConversation(id);
        
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash delete-icon';
        deleteIcon.onclick = (e) => {
            e.stopPropagation();
            deleteConversation(id);
        };
        
        element.appendChild(textSpan);
        element.appendChild(deleteIcon);
        historyContainer.appendChild(element);
    });
}

function deleteConversation(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette conversation ?')) {
        delete conversations[id];
        localStorage.setItem(`conversations_${currentUser.username}`, JSON.stringify(conversations));
        updateConversationHistory();
    }
}

function createNewConversation() {
    if (currentConversation.length > 0) {
        saveConversation();
    }

    currentConversation = [];
    
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.innerHTML = '';

    updateConversationHistory();

    addMessageToChat('ai', 'Bienvenue dans une nouvelle conversation ! Comment puis-je vous aider aujourd\'hui ?');

    messageContainer.scrollTop = 0;

    document.getElementById('userInput').focus();
}

function loadConversation(id) {
    if (currentConversation.length > 0 && currentConversation.id !== id) {
        saveConversation();
    }

    currentConversation = conversations[id];
    currentConversation.id = id;
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.innerHTML = '';
    currentConversation.forEach(message => {
        addMessageToChat(message.sender, message.content);
    });

    messageContainer.scrollTop = 0;
}

async function syncUserData() {
    if (!currentUser) return;

    const updateData = {
        freeCredits: currentUser.freeCredits || 0,
        paidCredits: currentUser.paidCredits || 0,
        lastFreeCreditsReset: currentUser.lastFreeCreditsReset || new Date().toISOString()
    };

    if (currentUser.subscription) {
        updateData.subscription = currentUser.subscription;
    }
    if (currentUser.subscriptionEndDate) {
        updateData.subscriptionEndDate = currentUser.subscriptionEndDate;
    }

    const userRef = db.ref('users/' + currentUser.username);
    try {
        await userRef.update(updateData);
        console.log("Données utilisateur mises à jour avec succès:", updateData);
    } catch (error) {
        console.error("Erreur lors de la mise à jour des données utilisateur:", error);
        showNotification("Erreur lors de la mise à jour de votre profil. Veuillez réessayer.", 'error');
    }
}

function adjustTextareaHeight() {
    const textarea = document.getElementById('userInput');
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function resetTextareaHeight() {
    const textarea = document.getElementById('userInput');
    textarea.style.height = 'auto';
}

async function attemptAutoLogin() {
    const storedInfo = getStoredLoginInfo();
    if (storedInfo.username && storedInfo.password) {
        try {
            const userRef = db.ref('users/' + storedInfo.username);
            const snapshot = await userRef.once('value');
            if (snapshot.exists() && snapshot.val().password === storedInfo.password) {
                const userData = snapshot.val();
                currentUser = { 
                    username: storedInfo.username, 
                    freeCredits: userData.freeCredits,
                    paidCredits: userData.paidCredits,
                    subscription: userData.subscription,
                    subscriptionEndDate: userData.subscriptionEndDate,
                    lastFreeCreditsReset: userData.lastFreeCreditsReset
                };
                await resetFreeCreditsIfNeeded();
                updateUIForLoggedInUser();
                console.log('Connexion automatique réussie');
            } else {
                clearLoginInfo();
                console.log('Échec de la connexion automatique : informations invalides');
            }
        } catch (error) {
            console.error('Erreur lors de la connexion automatique:', error);
            clearLoginInfo();
        }
    }
}

function saveSelectedModel() {
    const selectedModel = document.getElementById('modelSelect').value;
    localStorage.setItem('selectedModel', selectedModel);
}

function loadSelectedModel() {
    const savedModel = localStorage.getItem('selectedModel');
    if (savedModel) {
        document.getElementById('modelSelect').value = savedModel;
    }
}

function showUpgradeButton(messageElement) {
    const upgradeButton = document.createElement('button');
    upgradeButton.textContent = 'Passer à un modèle avancé';
    upgradeButton.className = 'upgrade-button';
    upgradeButton.onclick = () => {
        document.getElementById('modelSelect').value = 'gemini-1.5-pro';
        showNotification('Modèle mis à jour vers Gemini 1.5 Pro', 'success');
    };
    messageElement.appendChild(upgradeButton);
}

function animateResponse(element, text) {
    let index = 0;
    element.textContent = '';
    const interval = setInterval(() => {
        if (index < text.length) {
            element.textContent += text[index];
            index++;
        } else {
            clearInterval(interval);
        }
    }, 1);
}

function togglePromptList() {
    const modal = document.getElementById('promptListModal');
    modal.style.display = "block";
    loadPromptCategories();
}

function loadPromptCategories() {
    const categoriesContainer = document.getElementById('promptCategories');
    categoriesContainer.innerHTML = '';
    
    db.ref('prompts').once('value', (snapshot) => {
        prompts = snapshot.val() || {};
        const categories = [...new Set(Object.values(prompts).map(prompt => prompt.category))];
        
        categories.forEach(category => {
            const categoryElement = document.createElement('div');
            categoryElement.className = 'prompt-category';
            categoryElement.textContent = category;
            categoryElement.onclick = () => loadPromptsForCategory(category);
            categoriesContainer.appendChild(categoryElement);
        });
    });
}

function loadPromptsForCategory(category) {
    const promptListElement = document.getElementById('promptList');
    promptListElement.innerHTML = '';
    
    Object.entries(prompts).forEach(([id, prompt]) => {
        if (prompt.category === category) {
            const promptElement = document.createElement('div');
            promptElement.className = 'prompt-item';
            promptElement.textContent = prompt.title;
            promptElement.onclick = () => selectPrompt(id, prompt);
            promptListElement.appendChild(promptElement);
        }
    });
}

function selectPrompt(id, prompt) {
    pinnedPrompt = { id, ...prompt };
    document.getElementById('promptListModal').style.display = 'none';
    updatePinnedPrompt();
    showNotification('Prompt sélectionné', 'success');
}

function closePromptModal() {
    document.getElementById('promptListModal').style.display = 'none';
    showNotification('Liste des prompts masquée', 'info');
}

function updatePinnedPrompt() {
    const pinnedItems = document.getElementById('pinnedItems');
    const existingPrompt = pinnedItems.querySelector('.pinned-item[data-type="prompt"]');
    if (existingPrompt) {
        existingPrompt.remove();
    }
    if (pinnedPrompt) {
        const item = document.createElement('div');
        item.className = 'pinned-item';
        item.setAttribute('data-type', 'prompt');
        item.innerHTML =`
            <span class="icon">💬</span>
            <span class="name" title="${pinnedPrompt.title}">${pinnedPrompt.title}</span>
            <span class="remove" onclick="removePinnedPrompt()">❌</span>
        `;
        pinnedItems.appendChild(item);
    }
}

function removePinnedPrompt() {
    pinnedPrompt = null;
    updatePinnedPrompt();
}

function showReferralModal() {
    const modal = document.getElementById('referralModal');
    modal.style.display = 'block';
    
    if (currentUser && currentUser.referralCode) {
        const referralLink = `https://eduquemoi.netlify.app/?ref=${currentUser.referralCode}`;
        document.getElementById('referralLink').value = referralLink;
        
        // Créer le message d'invitation
        const inviteMessage = `Rejoignez-moi sur Eduque moi et commencez votre voyage d'apprentissage ! Utilisez mon lien de parrainage pour obtenir des bonus spéciaux : ${referralLink}`;
        
        // Vous pouvez stocker ce message dans un attribut data pour une utilisation facile
        document.getElementById('referralLink').setAttribute('data-invite-message', inviteMessage);
    } else {
        generateReferralCode();
    }
    
    updateReferralStats();
}

function generateReferralCode() {
    if (!currentUser) return;
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const userRef = db.ref('users/' + currentUser.username);
    
    userRef.update({ referralCode: code })
        .then(() => {
            currentUser.referralCode = code;
            document.getElementById('referralLink').value = `https://eduquemoi.netlify.app/?ref=${code}`;
        })
        .catch(error => {
            console.error("Erreur lors de la génération du code de parrainage:", error);
            showNotification("Erreur lors de la génération du code. Veuillez réessayer.", 'error');
        });
}

function copyReferralLink() {
    const linkInput = document.getElementById('referralLink');
    linkInput.select();
    document.execCommand('copy');
    showNotification('Lien de parrainage copié !', 'success');
}

function updateReferralStats() {
    if (!currentUser) return;
    
    const userRef = db.ref('users/' + currentUser.username);
    userRef.child('referrals').once('value', snapshot => {
        const referrals = snapshot.val() || {};
        const totalReferrals = Object.keys(referrals).length;
        const activeReferrals = Object.values(referrals).filter(r => r.isActive).length;
        
        document.getElementById('totalReferrals').textContent = totalReferrals;
        document.getElementById('activeReferrals').textContent = activeReferrals;
    });
}

async function rewardReferrer(username, amount) {
    const userRef = db.ref(`users/${username}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();
    
    if (userData && userData.referredBy) {
        const referrerQuery = await db.ref('users').orderByChild('referralCode').equalTo(userData.referredBy).once('value');
        const referrer = referrerQuery.val();
        
        if (referrer) {
            const referrerUsername = Object.keys(referrer)[0];
            const referrerRef = db.ref(`users/${referrerUsername}`);
            
            await referrerRef.transaction((user) => {
                if (user) {
                    user.paidCredits = (user.paidCredits || 0) + 2;
                }
                return user;
            });
            
            showNotification(`Votre parrain a reçu 2 crédits grâce à votre achat !`, 'success');
        }
    }
}

window.onload = async function() {
    await attemptAutoLogin();
    
    if (currentUser) {
        if (currentUser.freeCredits === undefined) currentUser.freeCredits = 0;
        if (currentUser.paidCredits === undefined) currentUser.paidCredits = 0;
        if (currentUser.subscription === undefined) currentUser.subscription = null;
        if (currentUser.subscriptionEndDate === undefined) currentUser.subscriptionEndDate = null;
        if (currentUser.lastFreeCreditsReset === undefined) currentUser.lastFreeCreditsReset = new Date().toISOString();
        
        await syncUserData();
    }

    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    setupUIEventListeners();

    if (currentUser) {
        loadConversationHistory();
    }

    initModals();

    loadSelectedModel();
    document.getElementById('modelSelect').addEventListener('change', saveSelectedModel);

    restoreAppState();

    initializeNewDiscussion();

    document.body.classList.add('loaded');

    setInterval(checkSubscriptionStatus, 3600000);
};

function setupUIEventListeners() {
    const inputContainer = document.querySelector('.input-container');
    const userInput = document.getElementById('userInput');
    const fileLabel = document.querySelector('.file-label');
    const sendButton = inputContainer.querySelector('button:last-child');

    function adjustInputWidth() {
        const containerWidth = inputContainer.offsetWidth;
        const fileLabelWidth = fileLabel.offsetWidth;
        const promptButtonWidth = document.getElementById('promptListButton').offsetWidth;
        const sendButtonWidth = sendButton.offsetWidth;
        const padding = 30;
        userInput.style.width = `${containerWidth - fileLabelWidth - promptButtonWidth - sendButtonWidth - padding}px`;
    }

    adjustInputWidth();
    window.addEventListener('resize', adjustInputWidth);

    userInput.addEventListener('input', adjustTextareaHeight);

    document.getElementById('modelSelect').addEventListener('change', checkModelAccess);

    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('visible');
        document.querySelector('.chat-container').classList.remove('sidebar-visible');
    }

    if (currentUser) {
        const userRef = db.ref('users/' + currentUser.username);
        userRef.on('value', (snapshot) => {
            const userData = snapshot.val();
            if (userData) {
                currentUser = {
                    ...currentUser,
                    freeCredits: userData.freeCredits,
                    paidCredits: userData.paidCredits,
                    subscription: userData.subscription,
                    subscriptionEndDate: userData.subscriptionEndDate,
                    lastFreeCreditsReset: userData.lastFreeCreditsReset
                };
                updateUIForLoggedInUser();
            }
        });
    }
}

function initModals() {
    const modals = document.querySelectorAll('.modal');
    const closeButtons = document.querySelectorAll('.close');

    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        modals.forEach(modal => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

document.getElementById('userInput').addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        const value = this.value;
        this.value = value.substring(0, start) + '\n' + value.substring(end);
        this.selectionStart = this.selectionEnd = start + 1;
    }
});

function checkApiStatus() {
    axios.get(`${API_BASE_URL}models?key=${API_KEY}`)
        .then(response => {
            console.log("Statut de l'API Gemini:", response.status);
            console.log("Modèles disponibles:", response.data);
        })
        .catch(error => {
            console.error("Erreur lors de la vérification du statut de l'API:", error);
        });
}

function checkApiStatusRegularly() {
    checkApiStatus();
    setInterval(checkApiStatus, 60000);
}

window.addEventListener('offline', function() {
    showNotification('Vous êtes hors ligne. Veuillez vérifier votre connexion internet.', 'error');
});

window.addEventListener('online', function() {
    showNotification('Vous êtes de nouveau en ligne.', 'success');
});

window.addEventListener('beforeunload', function() {
    if (currentUser) {
        localStorage.setItem('lastConversation', JSON.stringify(currentConversation));
    }
});

function restoreAppState() {
    const lastConversation = localStorage.getItem('lastConversation');
    if (lastConversation) {
        currentConversation = JSON.parse(lastConversation);
        currentConversation.forEach(message => {
            addMessageToChat(message.sender, message.content);
        });
    }
}

// Fonction pour mettre à jour régulièrement l'interface utilisateur
function updateUI() {
    if (currentUser) {
        document.getElementById('freeCredits').textContent = currentUser.freeCredits;
        document.getElementById('paidCredits').textContent = currentUser.paidCredits;
        document.getElementById('subscription').textContent = currentUser.subscription || 'Aucun';
    }
}

// Appel de updateUI toutes les 5 minutes
setInterval(updateUI, 300000);

// Initialisation
checkApiStatusRegularly();

// Exportation des fonctions et variables nécessaires
window.showLoginModal = showLoginModal;
window.showRegisterModal = showRegisterModal;
window.login = login;
window.register = register;
window.logout = logout;
window.sendMessage = sendMessage;
window.buySubscription = buySubscription;
window.buyCredits = buyCredits;
window.toggleTheme = toggleTheme;
window.toggleSidebar = toggleSidebar;
window.createNewConversation = createNewConversation;
window.handleFileUpload = handleFileUpload;
window.togglePromptList = togglePromptList;
window.showReferralModal = showReferralModal;
window.generateReferralCode = generateReferralCode;
window.copyReferralLink = copyReferralLink;
window.shareOnFacebook = shareOnFacebook;
window.shareOnTwitter = shareOnTwitter;
window.shareOnLinkedIn = shareOnLinkedIn;
window.shareOnWhatsApp = shareOnWhatsApp;