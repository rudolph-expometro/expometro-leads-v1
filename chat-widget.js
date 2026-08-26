/* ExpoMetro — Widget d'assistant IA (parcours guidé + médias + escalade email).
   Inclusion : <script src="/chat-widget.js" defer></script> avant </body>. */
(function () {
  if (window.__emChatLoaded) return;
  window.__emChatLoaded = true;

  var ACCENT = '#FF5267';
  var AVATAR = '/florence/img/rudolph-round.png';
  var lang = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();

  var T = {
    fr: { name: "Rudolph — ExpoMetro", sub2: "Assistant IA · en ligne", greet: "Bonjour 👋 Je suis l'assistant IA de Rudolph, et je peux répondre à toutes tes questions sur ExpoMetro.\n\nSi tu ne trouves pas ta réponse ici, tu pourras contacter Rudolph directement.", ph: "Écris ta question…", err: "Oups, une erreur. Réessaie dans un instant 🙏", errRate: "Tu as envoyé beaucoup de messages d'un coup 😅 Laisse passer quelques minutes et reviens — je serai là. Si c'est urgent, utilise le bouton « Écrire à Rudolph ».", open: "Ouvrir le chat", close: "Fermer", back: "‹ Retour", contactChip: "✉️ Écrire à Rudolph", prompt: "Super ! Sur quoi veux-tu en savoir plus ?", cIntro: "Laisse ton email + ta question, Rudolph te répond personnellement 🙏", cEmail: "Ton email", cMsg: "Ta question…", cSend: "Envoyer à Rudolph", cOk: "Merci ! Rudolph te répond très vite 🙏" },
    en: { name: "Rudolph — ExpoMetro", sub2: "AI assistant · online", greet: "Hi 👋 I'm Rudolph's AI assistant, and I can answer all your questions about ExpoMetro.\n\nIf you can't find your answer here, you'll be able to contact Rudolph directly.", ph: "Type your question…", err: "Oops, something went wrong. Please try again 🙏", errRate: "That's a lot of messages at once 😅 Give it a few minutes and come back — I'll be here. If it's urgent, use the “Write to Rudolph” button.", open: "Open chat", close: "Close", back: "‹ Back", contactChip: "✉️ Write to Rudolph", prompt: "Great! What would you like to know more about?", cIntro: "Leave your email + your question, Rudolph will reply personally 🙏", cEmail: "Your email", cMsg: "Your question…", cSend: "Send to Rudolph", cOk: "Thanks! Rudolph will reply very soon 🙏" },
    es: { name: "Rudolph — ExpoMetro", sub2: "Asistente IA · en línea", greet: "¡Hola 👋! Soy el asistente IA de Rudolph y puedo responder a todas tus preguntas sobre ExpoMetro.\n\nSi no encuentras tu respuesta aquí, podrás contactar a Rudolph directamente.", ph: "Escribe tu pregunta…", err: "Vaya, ha ocurrido un error. Inténtalo de nuevo 🙏", errRate: "Has enviado muchos mensajes seguidos 😅 Espera unos minutos y vuelve — aquí estaré. Si es urgente, usa el botón «Escribir a Rudolph».", open: "Abrir el chat", close: "Cerrar", back: "‹ Volver", contactChip: "✉️ Escribir a Rudolph", prompt: "¡Genial! ¿Sobre qué quieres saber más?", cIntro: "Deja tu email + tu pregunta, Rudolph te responderá personalmente 🙏", cEmail: "Tu email", cMsg: "Tu pregunta…", cSend: "Enviar a Rudolph", cOk: "¡Gracias! Rudolph te responderá muy pronto 🙏" },
    it: { name: "Rudolph — ExpoMetro", sub2: "Assistente IA · online", greet: "Ciao 👋 Sono l'assistente IA di Rudolph e posso rispondere a tutte le tue domande su ExpoMetro.\n\nSe non trovi la tua risposta qui, potrai contattare Rudolph direttamente.", ph: "Scrivi la tua domanda…", err: "Ops, si è verificato un errore. Riprova tra poco 🙏", errRate: "Hai inviato molti messaggi di seguito 😅 Aspetta qualche minuto e torna — sarò qui. Se è urgente, usa il pulsante «Scrivi a Rudolph».", open: "Apri la chat", close: "Chiudi", back: "‹ Indietro", contactChip: "✉️ Scrivi a Rudolph", prompt: "Perfetto! Su cosa vuoi saperne di più?", cIntro: "Lascia la tua email + la tua domanda, Rudolph ti risponderà personalmente 🙏", cEmail: "La tua email", cMsg: "La tua domanda…", cSend: "Invia a Rudolph", cOk: "Grazie! Rudolph ti risponderà molto presto 🙏" },
    de: { name: "Rudolph — ExpoMetro", sub2: "KI-Assistent · online", greet: "Hallo 👋 Ich bin Rudolphs KI-Assistent und kann alle deine Fragen zu ExpoMetro beantworten.\n\nWenn du hier keine Antwort findest, kannst du Rudolph direkt kontaktieren.", ph: "Schreib deine Frage…", err: "Ups, etwas ist schiefgelaufen. Bitte versuche es erneut 🙏", errRate: "Das waren viele Nachrichten auf einmal 😅 Warte ein paar Minuten und komm zurück — ich bin da. Falls es dringend ist, nutze den Button „An Rudolph schreiben“.", open: "Chat öffnen", close: "Schließen", back: "‹ Zurück", contactChip: "✉️ An Rudolph schreiben", prompt: "Super! Worüber möchtest du mehr erfahren?", cIntro: "Hinterlasse deine E-Mail + deine Frage, Rudolph antwortet dir persönlich 🙏", cEmail: "Deine E-Mail", cMsg: "Deine Frage…", cSend: "An Rudolph senden", cOk: "Danke! Rudolph antwortet dir sehr bald 🙏" }
  };
  var t = T[lang] || T.en;

  // Textes de l'escalade email (conversationnelle).
  var CT = {
    fr: { askEmail: "Bien sûr 🙌 Quel est ton email ? Je te réponds personnellement.", badEmail: "Hmm, cet email ne semble pas valide — réessaie 🙏", askQuestion: "Merci ! Et quelle est ta question pour Rudolph ?", review: "Parfait ! Je te réponds vite à cette adresse :", send: "✅ Envoyer", improve: "✨ Aide-moi à préciser", cancel: "✕ Annuler", improved: "Voici une version un peu plus claire — je l'envoie ? ✨", useImproved: "✅ Envoyer cette version", useOriginal: "Envoyer la mienne" },
    en: { askEmail: "Of course 🙌 What's your email? I'll reply to you personally.", badEmail: "Hmm, that email doesn't look valid — please try again 🙏", askQuestion: "Thanks! And what's your question for Rudolph?", review: "Perfect! I'll get back to you at this address:", send: "✅ Send", improve: "✨ Help me phrase it", cancel: "✕ Cancel", improved: "Here's a slightly clearer version — send it? ✨", useImproved: "✅ Send this version", useOriginal: "Send mine" },
    es: { askEmail: "¡Claro 🙌! ¿Cuál es tu email? Te respondo personalmente.", badEmail: "Mmm, ese email no parece válido — inténtalo de nuevo 🙏", askQuestion: "¡Gracias! ¿Y cuál es tu pregunta para Rudolph?", review: "¡Perfecto! Te respondo pronto a esta dirección:", send: "✅ Enviar", improve: "✨ Ayúdame a redactarla", cancel: "✕ Cancelar", improved: "Aquí tienes una versión más clara — ¿la envío? ✨", useImproved: "✅ Enviar esta versión", useOriginal: "Enviar la mía" },
    it: { askEmail: "Certo 🙌 Qual è la tua email? Ti rispondo personalmente.", badEmail: "Mmm, questa email non sembra valida — riprova 🙏", askQuestion: "Grazie! E qual è la tua domanda per Rudolph?", review: "Perfetto! Ti rispondo presto a questo indirizzo:", send: "✅ Invia", improve: "✨ Aiutami a formularla", cancel: "✕ Annulla", improved: "Ecco una versione un po' più chiara — la invio? ✨", useImproved: "✅ Invia questa versione", useOriginal: "Invia la mia" },
    de: { askEmail: "Klar 🙌 Wie lautet deine E-Mail? Ich antworte dir persönlich.", badEmail: "Hmm, diese E-Mail sieht ungültig aus — bitte versuche es erneut 🙏", askQuestion: "Danke! Und was ist deine Frage an Rudolph?", review: "Perfekt! Ich melde mich bald unter dieser Adresse:", send: "✅ Senden", improve: "✨ Hilf mir bei der Formulierung", cancel: "✕ Abbrechen", improved: "Hier ist eine etwas klarere Version — soll ich sie senden? ✨", useImproved: "✅ Diese Version senden", useOriginal: "Meine senden" }
  };
  var ct = CT[lang] || CT.en;

  // Messages d'accueil après le choix de branche (puis question libre).
  var INV = {
    fr: { "new": "Super, bienvenue ! 🎨 Pose-moi toutes tes questions sur ExpoMetro — je te réponds personnellement 👇", booked: "Génial, et merci d'avoir réservé ta place ! 🙌 Dis-moi ce dont tu as besoin, je t'aide 👇" },
    en: { "new": "Great, welcome! 🎨 Ask me anything about ExpoMetro — I'll answer personally 👇", booked: "Awesome, and thanks for booking your spot! 🙌 Tell me what you need, I'm here to help 👇" },
    es: { "new": "¡Genial, bienvenido/a! 🎨 Pregúntame lo que quieras sobre ExpoMetro — te respondo personalmente 👇", booked: "¡Genial, y gracias por reservar tu plaza! 🙌 Dime qué necesitas, te ayudo 👇" },
    it: { "new": "Benvenuto/a! 🎨 Chiedimi tutto su ExpoMetro — ti rispondo personalmente 👇", booked: "Fantastico, e grazie per aver prenotato! 🙌 Dimmi di cosa hai bisogno, ti aiuto 👇" },
    de: { "new": "Willkommen! 🎨 Frag mich alles über ExpoMetro — ich antworte dir persönlich 👇", booked: "Super, und danke für deine Buchung! 🙌 Sag mir, was du brauchst, ich helfe dir 👇" }
  };
  var inv = INV[lang] || INV.en;

  // Titre du formulaire de contact.
  var FORMT = { fr: "✉️ Écris à Rudolph — il te répond en personne", en: "✉️ Write to Rudolph — he replies personally", es: "✉️ Escribe a Rudolph — te responde en persona", it: "✉️ Scrivi a Rudolph — ti risponde di persona", de: "✉️ Schreib an Rudolph — er antwortet persönlich" };
  var formT = FORMT[lang] || FORMT.en;

  // Médias (partagés entre langues). yt = id YouTube (r:'v' = vertical), img = image du site.
  var MEDIA = {
    whatis: { yt: "GbJiBZWbUVg" },
    how: { img: "/florence/img/tunnel-hero.jpg" },
    whypaid: { img: "/florence/img/tunnel-specs.jpg" },
    benefits: { img: "/florence/img/tunnel-vision.jpg" },
    serious: { yt: "NjaPwHy0yk0", r: "v" },
    where: { img: "/florence/img/plan-florence4-1.jpg" }
  };

  var MENU = {
    fr: {
      root: [{ label: "🆕 Je découvre ExpoMetro", branch: "new" }, { label: "✅ J'ai déjà réservé ma place", branch: "booked" }],
      new: [
        { label: "💡 C'est quoi ExpoMetro ?", ask: "C'est quoi ExpoMetro, en bref ?", m: "whatis" },
        { label: "🖼️ Comment ça marche ?", ask: "Comment ça marche pour participer ?", m: "how" },
        { label: "💶 Pourquoi c'est payant ?", ask: "Pourquoi c'est payant ?", m: "whypaid" },
        { label: "✨ Qu'est-ce que ça m'apporte ?", ask: "Qu'est-ce que ça m'apporte concrètement ?", m: "benefits" },
        { label: "🌍 Participer à distance ?", ask: "Est-ce que je peux participer à distance ?" },
        { label: "✅ Est-ce sérieux ?", ask: "Est-ce que c'est vraiment sérieux ?", m: "serious" },
        { label: "🎯 Réserver ma place", ask: "Comment je réserve ma place ?" }
      ],
      booked: [
        { label: "📸 Envoyer la photo de mon œuvre ?", ask: "J'ai déjà réservé ma place. Comment j'enregistre la photo de mon œuvre dans mon compte ?" },
        { label: "🖼️ Quel format / taille d'image ?", ask: "Quel format et quelle taille d'image pour mon œuvre ?" },
        { label: "📅 C'est où et quand exactement ?", ask: "C'est où et quand exactement l'expo ?", m: "where" },
        { label: "🎥 Je reçois quoi ?", ask: "Qu'est-ce que je reçois : photos, vidéo, certificat ?" },
        { label: "✏️ Modifier / ajouter mon œuvre plus tard ?", ask: "Puis-je modifier ou ajouter mon œuvre plus tard ?" }
      ]
    },
    en: {
      root: [{ label: "🆕 I'm discovering ExpoMetro", branch: "new" }, { label: "✅ I've already booked my spot", branch: "booked" }],
      new: [
        { label: "💡 What is ExpoMetro?", ask: "What is ExpoMetro, in short?", m: "whatis" },
        { label: "🖼️ How does it work?", ask: "How does it work to take part?", m: "how" },
        { label: "💶 Why is it paid?", ask: "Why is it paid?", m: "whypaid" },
        { label: "✨ What do I get out of it?", ask: "What do I get out of it, concretely?", m: "benefits" },
        { label: "🌍 Can I take part remotely?", ask: "Can I take part remotely?" },
        { label: "✅ Is it legit?", ask: "Is this really legit?", m: "serious" },
        { label: "🎯 Book my spot", ask: "How do I book my spot?" }
      ],
      booked: [
        { label: "📸 How to submit my artwork photo?", ask: "I've already booked my spot. How do I upload the photo of my artwork in my account?" },
        { label: "🖼️ What image format / size?", ask: "What image format and size for my artwork?" },
        { label: "📅 Where and when exactly?", ask: "Where and when exactly is the exhibition?", m: "where" },
        { label: "🎥 What do I receive?", ask: "What do I receive: photos, video, certificate?" },
        { label: "✏️ Change/add my artwork later?", ask: "Can I change or add my artwork later?" }
      ]
    },
    es: {
      root: [{ label: "🆕 Descubro ExpoMetro", branch: "new" }, { label: "✅ Ya he reservado mi plaza", branch: "booked" }],
      new: [
        { label: "💡 ¿Qué es ExpoMetro?", ask: "¿Qué es ExpoMetro, en resumen?", m: "whatis" },
        { label: "🖼️ ¿Cómo funciona?", ask: "¿Cómo funciona para participar?", m: "how" },
        { label: "💶 ¿Por qué se paga?", ask: "¿Por qué se paga?", m: "whypaid" },
        { label: "✨ ¿Qué gano con esto?", ask: "¿Qué gano con esto concretamente?", m: "benefits" },
        { label: "🌍 ¿Participar a distancia?", ask: "¿Puedo participar a distancia?" },
        { label: "✅ ¿Es serio?", ask: "¿Es realmente serio?", m: "serious" },
        { label: "🎯 Reservar mi plaza", ask: "¿Cómo reservo mi plaza?" }
      ],
      booked: [
        { label: "📸 ¿Enviar la foto de mi obra?", ask: "Ya he reservado mi plaza. ¿Cómo subo la foto de mi obra en mi cuenta?" },
        { label: "🖼️ ¿Qué formato / tamaño de imagen?", ask: "¿Qué formato y tamaño de imagen para mi obra?" },
        { label: "📅 ¿Dónde y cuándo exactamente?", ask: "¿Dónde y cuándo exactamente es la expo?", m: "where" },
        { label: "🎥 ¿Qué recibo?", ask: "¿Qué recibo: fotos, vídeo, certificado?" },
        { label: "✏️ ¿Cambiar/añadir mi obra después?", ask: "¿Puedo cambiar o añadir mi obra más tarde?" }
      ]
    },
    it: {
      root: [{ label: "🆕 Sto scoprendo ExpoMetro", branch: "new" }, { label: "✅ Ho già prenotato il mio posto", branch: "booked" }],
      new: [
        { label: "💡 Cos'è ExpoMetro?", ask: "Cos'è ExpoMetro, in breve?", m: "whatis" },
        { label: "🖼️ Come funziona?", ask: "Come funziona per partecipare?", m: "how" },
        { label: "💶 Perché è a pagamento?", ask: "Perché è a pagamento?", m: "whypaid" },
        { label: "✨ Cosa ci guadagno?", ask: "Cosa ci guadagno concretamente?", m: "benefits" },
        { label: "🌍 Partecipare a distanza?", ask: "Posso partecipare a distanza?" },
        { label: "✅ È una cosa seria?", ask: "È davvero una cosa seria?", m: "serious" },
        { label: "🎯 Prenotare il mio posto", ask: "Come prenoto il mio posto?" }
      ],
      booked: [
        { label: "📸 Inviare la foto della mia opera?", ask: "Ho già prenotato il mio posto. Come carico la foto della mia opera nel mio account?" },
        { label: "🖼️ Che formato / dimensione immagine?", ask: "Che formato e dimensione per l'immagine della mia opera?" },
        { label: "📅 Dove e quando esattamente?", ask: "Dove e quando esattamente è l'expo?", m: "where" },
        { label: "🎥 Cosa ricevo?", ask: "Cosa ricevo: foto, video, certificato?" },
        { label: "✏️ Modificare/aggiungere l'opera dopo?", ask: "Posso modificare o aggiungere la mia opera più tardi?" }
      ]
    },
    de: {
      root: [{ label: "🆕 Ich entdecke ExpoMetro", branch: "new" }, { label: "✅ Ich habe schon gebucht", branch: "booked" }],
      new: [
        { label: "💡 Was ist ExpoMetro?", ask: "Was ist ExpoMetro, kurz gesagt?", m: "whatis" },
        { label: "🖼️ Wie funktioniert es?", ask: "Wie funktioniert die Teilnahme?", m: "how" },
        { label: "💶 Warum kostet es etwas?", ask: "Warum kostet es etwas?", m: "whypaid" },
        { label: "✨ Was bringt es mir?", ask: "Was bringt es mir konkret?", m: "benefits" },
        { label: "🌍 Aus der Ferne teilnehmen?", ask: "Kann ich aus der Ferne teilnehmen?" },
        { label: "✅ Ist das seriös?", ask: "Ist das wirklich seriös?", m: "serious" },
        { label: "🎯 Meinen Platz buchen", ask: "Wie buche ich meinen Platz?" }
      ],
      booked: [
        { label: "📸 Foto meines Werks einreichen?", ask: "Ich habe schon gebucht. Wie lade ich das Foto meines Werks in meinem Konto hoch?" },
        { label: "🖼️ Welches Bildformat / welche Größe?", ask: "Welches Bildformat und welche Größe für mein Werk?" },
        { label: "📅 Wo und wann genau?", ask: "Wo und wann genau ist die Ausstellung?", m: "where" },
        { label: "🎥 Was bekomme ich?", ask: "Was bekomme ich: Fotos, Video, Zertifikat?" },
        { label: "✏️ Werk später ändern/hinzufügen?", ask: "Kann ich mein Werk später ändern oder hinzufügen?" }
      ]
    }
  };
  var menu = MENU[lang] || MENU.en;

  // ---------- styles ----------
  var css = ''
    + '#emc-btn{position:fixed;bottom:98px;right:20px;width:60px;height:60px;border-radius:50%;padding:0;border:3px solid ' + ACCENT + ';background:#12161f;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.30);z-index:2147483000;transition:transform .15s ease}'
    + '#emc-btn:hover{transform:scale(1.06)}'
    + '#emc-btn img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}'
    + '#emc-btn .emc-on{position:absolute;bottom:1px;right:1px;width:14px;height:14px;border-radius:50%;background:#22e06b;border:2px solid #12161f;box-shadow:0 0 6px #22e06b}'
    + '#emc-panel{position:fixed;bottom:168px;right:20px;width:370px;max-width:calc(100vw - 32px);height:540px;max-height:calc(100vh - 180px);background:#12161f;border:1px solid rgba(255,255,255,.10);border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.45);z-index:2147483000;display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}'
    + '#emc-panel.emc-open{display:flex}'
    + '#emc-head{background:' + ACCENT + ';color:#fff;padding:12px 14px;display:flex;align-items:center;gap:11px;flex:0 0 auto}'
    + '#emc-head .emc-av{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.55);flex:0 0 auto}'
    + '#emc-head .emc-hi{min-width:0}'
    + '#emc-head b{font-size:14.5px;font-weight:800;letter-spacing:.01em;display:block}'
    + '#emc-head .emc-sub{font-size:11.5px;opacity:.95;margin-top:2px;display:flex;align-items:center;gap:5px}'
    + '#emc-head .emc-dot{width:8px;height:8px;border-radius:50%;background:#22e06b;box-shadow:0 0 8px #22e06b;flex:0 0 auto}'
    + '#emc-x{margin-left:auto;background:transparent;border:none;color:#fff;cursor:pointer;font-size:20px;line-height:1;opacity:.9;padding:2px 4px}'
    + '#emc-msgs{flex:1 1 auto;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#12161f}'
    + '.emc-m{max-width:82%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45;word-wrap:break-word}'
    + '.emc-a{align-self:flex-start;background:#1e242f;color:#e7ebf2;border-bottom-left-radius:5px}'
    + '.emc-u{align-self:flex-end;background:' + ACCENT + ';color:#fff;border-bottom-right-radius:5px}'
    + '.emc-a a{color:#ff8a97;font-weight:700}.emc-m b{font-weight:800}'
    + '.emc-typing{display:flex;gap:4px;align-items:center}'
    + '.emc-typing span{width:7px;height:7px;border-radius:50%;background:#9aa4b2;animation:emcbounce 1s infinite}'
    + '.emc-typing span:nth-child(2){animation-delay:.15s}.emc-typing span:nth-child(3){animation-delay:.3s}'
    + '@keyframes emcbounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}'
    + '.emc-chips{align-self:stretch;display:flex;flex-wrap:wrap;gap:7px;padding:2px 0}'
    + '.emc-chip{background:#1e242f;color:#e7ebf2;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:8px 12px;font-size:13px;cursor:pointer;font-family:inherit;text-align:left;line-height:1.3;transition:border-color .12s}'
    + '.emc-chip:hover{border-color:' + ACCENT + '}'
    + '.emc-chip.big{font-weight:700;padding:11px 14px}'
    + '.emc-chip.alt{background:transparent;color:#9aa4b2;border-color:rgba(255,255,255,.10)}'
    + '.emc-media{align-self:flex-start;max-width:86%;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.08)}'
    + '.emc-media img.emc-photo{display:block;width:100%;height:auto;cursor:pointer}'
    + '.emc-yt{position:relative;cursor:pointer;background:#000;border-radius:14px;overflow:hidden;align-self:flex-start;width:86%;aspect-ratio:16/9;border:1px solid rgba(255,255,255,.08)}'
    + '.emc-yt.v{width:186px;aspect-ratio:9/16;max-height:340px}'
    + '.emc-yt img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.emc-yt iframe{width:100%;height:100%;border:0;display:block}'
    + '.emc-yt .emc-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}'
    + '.emc-yt .emc-play span{width:52px;height:52px;border-radius:50%;background:rgba(255,82,103,.94);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.4)}'
    + '.emc-form{align-self:stretch;background:#1a2030;border:1.5px solid ' + ACCENT + ';border-radius:14px;padding:13px;display:flex;flex-direction:column;gap:9px;box-shadow:0 6px 20px rgba(0,0,0,.28)}'
    + '.emc-form .emc-form-t{font-size:13.5px;font-weight:800;color:#fff;margin-bottom:1px}'
    + '.emc-form input,.emc-form textarea{background:#12161f;border:1px solid rgba(255,255,255,.14);color:#e7ebf2;border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;outline:none;width:100%;box-sizing:border-box}'
    + '.emc-form input:focus,.emc-form textarea:focus{border-color:' + ACCENT + '}'
    + '.emc-form textarea{resize:none;min-height:92px}'
    + '.emc-form .emc-form-row{display:flex;gap:8px;justify-content:flex-end}'
    + '.emc-form .emc-fsend{background:' + ACCENT + ';color:#fff;border:none;border-radius:10px;padding:9px 18px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}'
    + '.emc-form .emc-fsend:disabled{opacity:.6}'
    + '.emc-form .emc-fcancel{background:transparent;color:#9aa4b2;border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:9px 15px;font-size:13.5px;cursor:pointer;font-family:inherit}'
    + '#emc-foot{flex:0 0 auto;border-top:1px solid rgba(255,255,255,.08);padding:10px;display:flex;gap:8px;background:#12161f}'
    + '#emc-in{flex:1 1 auto;min-width:0;box-sizing:border-box;background:#1e242f;border:1px solid rgba(255,255,255,.10);color:#e7ebf2;border-radius:12px;padding:10px 12px;font-size:16px;resize:none;max-height:90px;font-family:inherit;outline:none}'
    + '#emc-in::placeholder{color:#8a93a6}'
    + '#emc-send{background:' + ACCENT + ';border:none;border-radius:12px;width:42px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 auto}'
    + '#emc-send:disabled{opacity:.5;cursor:default}#emc-send svg{width:20px;height:20px;stroke:#fff}'
    + '@media(max-width:480px){#emc-panel{top:0;left:0;right:0;bottom:0;width:auto;height:auto;max-width:none;max-height:none;border-radius:0}}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  // ---------- DOM ----------
  var btn = document.createElement('button');
  btn.id = 'emc-btn'; btn.setAttribute('aria-label', t.open);
  btn.innerHTML = '<img src="' + AVATAR + '" alt="Rudolph"/><span class="emc-on"></span>';

  var panel = document.createElement('div');
  panel.id = 'emc-panel';
  panel.innerHTML = ''
    + '<div id="emc-head"><img class="emc-av" src="' + AVATAR + '" alt="Rudolph"/><div class="emc-hi"><b>' + esc(t.name) + '</b><div class="emc-sub"><span class="emc-dot"></span>' + esc(t.sub2) + '</div></div><button id="emc-x" aria-label="' + esc(t.close) + '">×</button></div>'
    + '<div id="emc-msgs"></div>'
    + '<div id="emc-foot"><textarea id="emc-in" rows="1" placeholder="' + esc(t.ph) + '"></textarea>'
    + '<button id="emc-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg></button></div>';

  document.body.appendChild(btn); document.body.appendChild(panel);
  var msgsEl = panel.querySelector('#emc-msgs');
  var inEl = panel.querySelector('#emc-in');
  var sendEl = panel.querySelector('#emc-send');
  var history = [];   // conversation IA
  var current = 'root';
  var busy = false;
  var navEl = null;   // UNE seule bulle de navigation (accueil/invite) à la fois
  var askCount = 0;            // nb de questions posées par l'artiste
  var ESCALATE_AFTER = 2;     // « Écrire à Rudolph » n'apparaît qu'APRÈS ce nb de questions (règle-le : 1/2/3)

  navMsg(t.greet);
  renderChips('root');

  // ---------- events ----------
  btn.addEventListener('click', function () { panel.classList.add('emc-open'); setTimeout(function () { inEl.focus(); }, 60); });
  panel.querySelector('#emc-x').addEventListener('click', function () { panel.classList.remove('emc-open'); });
  sendEl.addEventListener('click', freeSend);
  inEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); freeSend(); } });
  inEl.addEventListener('input', function () { inEl.style.height = 'auto'; inEl.style.height = Math.min(inEl.scrollHeight, 90) + 'px'; });

  // ---------- menu / chips ----------
  function renderChips(state) {
    removeChips();
    current = state;
    var box = document.createElement('div'); box.className = 'emc-chips';
    if (state === 'root') {
      menu.root.forEach(function (it) { box.appendChild(chip(it.label, 'big', function () { openBranch(it.branch); })); });
    } else {
      if (askCount >= ESCALATE_AFTER) box.appendChild(chip(t.contactChip, 'alt', showContactForm));
      if (askCount === 0) box.appendChild(chip(t.back, 'alt', function () { navMsg(t.greet); renderChips('root'); }));
    }
    if (box.children.length) { msgsEl.appendChild(box); scrollDown(); }
  }
  function chip(label, cls, fn) {
    var b = document.createElement('button'); b.className = 'emc-chip' + (cls ? ' ' + cls : '');
    b.textContent = label; b.addEventListener('click', fn); return b;
  }
  function removeChips() { var c = msgsEl.querySelector('.emc-chips'); if (c) c.remove(); }
  function openBranch(key) { removeChips(); navMsg(key === 'booked' ? inv.booked : inv.new); renderChips(key); }

  function askTopic(it) {
    if (busy) return;
    removeChips();
    var uEl = addBubble('u', it.ask);
    history.push({ role: 'user', content: it.ask });
    callAI(function () { if (it.m) addMedia(MEDIA[it.m]); renderChips(current); scrollToTopOf(uEl); });
  }

  // L'artiste tape « ecrire a Rudolph » en TEXTE LIBRE au lieu de cliquer le bouton (vu en vrai le 25/08 :
  // il l'a écrit deux fois sans le trouver). On ouvre alors le formulaire directement.
  // Garde-fou : uniquement sur un message COURT, sinon « merci Rudolph » au milieu d'une phrase déclencherait.
  var CONTACT_RE = /(ecri|contact|contatt|joindre|parl|writ|speak|talk|e?mail|escrib|scriv|schreib|kontaktier|habl)/;
  function wantsContact(str) {
    var n = String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (n.length > 40) return false;
    return n.indexOf('rudolph') !== -1 && CONTACT_RE.test(n);
  }

  function freeSend() {
    if (busy) return;
    var text = inEl.value.trim(); if (!text) return;
    inEl.value = ''; inEl.style.height = 'auto';
    removeChips();
    if (wantsContact(text)) { addBubble('u', text); showContactForm(); return; }
    navEl = null;   // dès qu'on pose une question, l'accueil reste comme contexte (plus retiré)
    askCount++;
    var uEl = addBubble('u', text);
    history.push({ role: 'user', content: text });
    callAI(function () { renderChips(current === 'root' ? 'root' : current); scrollToTopOf(uEl); });
  }

  function callAI(done) {
    busy = true; sendEl.disabled = true;
    var typing = addTyping();
    fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-12), lang: lang, ctx: liveCtx(), profile: current }) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) {
        typing.remove();
        var reply = (d && d.reply) ? d.reply : t.err;
        addBubble('a', reply);
        history.push({ role: 'assistant', content: reply });
      })
      .catch(function (st) { typing.remove(); addBubble('a', st === 429 ? t.errRate : t.err); })
      .finally(function () { busy = false; sendEl.disabled = false; if (done) done(); });
  }

  // ---------- médias ----------
  function addMedia(mm) {
    if (!mm) return;
    if (mm.img) {
      var w = document.createElement('div'); w.className = 'emc-media';
      var im = document.createElement('img'); im.className = 'emc-photo'; im.src = mm.img; im.loading = 'lazy'; im.alt = 'ExpoMetro';
      im.addEventListener('click', function () { window.open(mm.img, '_blank', 'noopener'); });
      w.appendChild(im); msgsEl.appendChild(w); scrollDown();
    } else if (mm.yt) {
      var y = document.createElement('div'); y.className = 'emc-yt' + (mm.r === 'v' ? ' v' : '');
      y.innerHTML = '<img src="https://img.youtube.com/vi/' + mm.yt + '/hqdefault.jpg" alt="video"/><div class="emc-play"><span><svg viewBox="0 0 24 24" fill="#fff" width="22" height="22"><path d="M8 5v14l11-7z"/></svg></span></div>';
      y.addEventListener('click', function () {
        y.innerHTML = '<iframe src="https://www.youtube.com/embed/' + mm.yt + '?autoplay=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
      });
      msgsEl.appendChild(y); scrollDown();
    }
  }

  // ---------- escalade email (formulaire clair, encadré) ----------
  function showContactForm() {
    removeChips();
    if (msgsEl.querySelector('.emc-form')) return;   // pas de doublon
    var f = document.createElement('form'); f.className = 'emc-form';
    var ti = document.createElement('div'); ti.className = 'emc-form-t'; ti.textContent = formT;
    var em = document.createElement('input'); em.type = 'email'; em.required = true; em.placeholder = t.cEmail;
    var ta = document.createElement('textarea'); ta.required = true; ta.placeholder = t.cMsg;
    var row = document.createElement('div'); row.className = 'emc-form-row';
    var cb = document.createElement('button'); cb.type = 'button'; cb.className = 'emc-fcancel'; cb.textContent = ct.cancel;
    var sb = document.createElement('button'); sb.type = 'submit'; sb.className = 'emc-fsend'; sb.textContent = ct.send;
    row.appendChild(cb); row.appendChild(sb);
    f.appendChild(ti); f.appendChild(em); f.appendChild(ta); f.appendChild(row);
    cb.addEventListener('click', function () { f.remove(); renderChips(current); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = em.value.trim(), msg = ta.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !msg) return;
      sb.disabled = true; sb.textContent = '…';
      fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email, message: msg, history: history.slice(-8) }) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function () { f.remove(); navMsg(t.cOk); renderChips(current); })
        .catch(function () { sb.disabled = false; sb.textContent = ct.send; addBubble('a', t.err); });
    });
    msgsEl.appendChild(f); scrollDown(); setTimeout(function () { em.focus(); }, 40);
  }

  // ---------- helpers ----------
  function addBubble(kind, text) {
    var d = document.createElement('div'); d.className = 'emc-m ' + (kind === 'u' ? 'emc-u' : 'emc-a');
    d.innerHTML = format(text); msgsEl.appendChild(d); scrollDown(); return d;
  }
  function navMsg(text) { if (navEl) { navEl.remove(); } navEl = addBubble('a', text); return navEl; }
  function addTyping() {
    var d = document.createElement('div'); d.className = 'emc-m emc-a';
    d.innerHTML = '<div class="emc-typing"><span></span><span></span><span></span></div>';
    msgsEl.appendChild(d); scrollDown(); return d;
  }
  function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight; }
  function scrollToTopOf(el) { if (!el) return; var d = el.getBoundingClientRect().top - msgsEl.getBoundingClientRect().top; msgsEl.scrollTop += d - 8; }
  function liveCtx() {
    try {
      var nums = document.querySelectorAll('.artix-count .artix-num');
      if (nums.length >= 2) {
        var a = parseInt((nums[0].textContent || '').replace(/[^0-9]/g, ''), 10);
        var c = parseInt((nums[1].textContent || '').replace(/[^0-9]/g, ''), 10);
        if (a && c) return { artists: a, countries: c };
      }
    } catch (e) {}
    return null;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function format(s) {
    var h = esc(String(s).replace(/\n{3,}/g, '\n\n'));                 // pas de trous géants
    // liens markdown [texte](http-url) -> lien cliquable
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // liens markdown vers un placeholder (non-URL) -> garder juste le texte, pas de lien cassé
    h = h.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    // URLs nues (précédées d'un début/espace/parenthèse — jamais dans un href déjà posé)
    h = h.replace(/(^|[\s(])(https?:\/\/[^\s<)"']+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    h = h.replace(/^[\-\*]\s+/gm, '• ');                                // tirets -> puces
    return h.replace(/\n/g, '<br>');
  }
})();
